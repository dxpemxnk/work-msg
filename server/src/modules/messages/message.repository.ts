import { randomUUID } from 'node:crypto';

import type { SqliteDatabase } from '../../database/database.types.js';
import { errors } from '../../shared/errors/errors.js';
import type { ConversationRepository } from '../conversations/conversation.repository.js';
import { toMessageDto } from './message.mapper.js';
import type { MessageCursor, MessageDto, MessageReactionDto, MessageReactionRow, MessageRow } from './message.types.js';

const messageSelect = `
  SELECT
    m.*,
    u.display_name AS sender_display_name,
    u.login AS sender_login,
    u.avatar_color AS sender_avatar_color,
    u.status AS sender_status,
    reply.sequence AS reply_sequence,
    reply_user.display_name AS reply_sender_display_name,
    reply.body AS reply_body,
    forwarded.id AS forwarded_from_message_id,
    forwarded_user.display_name AS forwarded_sender_display_name,
    forwarded.body AS forwarded_body,
    EXISTS(
      SELECT 1 FROM conversation_pins pin
      WHERE pin.conversation_id = m.conversation_id AND pin.message_id = m.id
    ) AS is_pinned
  FROM messages m
  JOIN users u ON u.id = m.sender_id
  LEFT JOIN messages reply ON reply.id = m.reply_to_message_id
  LEFT JOIN users reply_user ON reply_user.id = reply.sender_id
  LEFT JOIN messages forwarded ON forwarded.id = m.forwarded_from_message_id
  LEFT JOIN users forwarded_user ON forwarded_user.id = forwarded.sender_id
`;

export class MessageRepository {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly conversations: ConversationRepository
  ) {}

  append(
    senderId: string,
    conversationId: string,
    clientMessageId: string,
    body: string,
    replyToMessageId?: string,
    forwardedFromMessageId?: string
  ): { message: MessageDto; deduplicated: boolean } {
    const { member } = this.conversations.requireMember(conversationId, senderId);

    if (replyToMessageId) {
      const replyTarget = this.database
        .prepare('SELECT id FROM messages WHERE id = ? AND conversation_id = ? AND sequence >= ?')
        .get(replyToMessageId, conversationId, member.visible_from_sequence);
      if (!replyTarget) throw errors.validation('Сообщение для ответа не найдено в этой беседе');
    }

    if (forwardedFromMessageId) {
      const forwardSource = this.database
        .prepare(`
          SELECT m.id
          FROM messages m
          JOIN conversation_members cm
            ON cm.conversation_id = m.conversation_id
            AND cm.user_id = ?
            AND cm.left_at IS NULL
          WHERE m.id = ? AND m.sequence >= cm.visible_from_sequence
        `)
        .get(senderId, forwardedFromMessageId);
      if (!forwardSource) throw errors.validation('Пересылаемое сообщение недоступно');
    }

    const appendMessage = this.database.transaction(() => {
      const existing = this.database
        .prepare(`
          ${messageSelect}
          WHERE m.sender_id = ? AND m.client_message_id = ?
        `)
        .get(senderId, clientMessageId) as MessageRow | undefined;
      if (existing) return { message: this.toHydratedMessage(existing), deduplicated: true };

      const now = new Date().toISOString();
      const allocated = this.database
        .prepare(`
          UPDATE conversations
          SET next_message_sequence = next_message_sequence + 1, updated_at = ?
          WHERE id = ? AND status = 'ACTIVE'
          RETURNING next_message_sequence - 1 AS sequence
        `)
        .get(now, conversationId) as { sequence: number } | undefined;
      if (!allocated) throw errors.conflict('Беседа удалена');

      const id = randomUUID();
      this.database
        .prepare(`
          INSERT INTO messages(
            id, conversation_id, sender_id, client_message_id, sequence, body,
            reply_to_message_id, forwarded_from_message_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          conversationId,
          senderId,
          clientMessageId,
          allocated.sequence,
          body,
          replyToMessageId ?? null,
          forwardedFromMessageId ?? null,
          now
        );

      const row = this.database
        .prepare(`
          ${messageSelect}
          WHERE m.id = ?
        `)
        .get(id) as MessageRow;
      return { message: this.toHydratedMessage(row), deduplicated: false };
    });

    return appendMessage();
  }

  list(conversationId: string, userId: string, cursor: MessageCursor): MessageDto[] {
    const { member } = this.conversations.requireMember(conversationId, userId);
    const clauses = ['m.conversation_id = ?', 'm.sequence >= ?'];
    const parameters: Array<string | number> = [conversationId, member.visible_from_sequence];

    if (cursor.before !== undefined) {
      clauses.push('m.sequence < ?');
      parameters.push(cursor.before);
    }
    if (cursor.after !== undefined) {
      clauses.push('m.sequence > ?');
      parameters.push(cursor.after);
    }
    parameters.push(cursor.limit);

    const direction = cursor.after === undefined ? 'DESC' : 'ASC';
    const rows = this.database
      .prepare(`
        ${messageSelect}
        WHERE ${clauses.join(' AND ')}
        ORDER BY m.sequence ${direction}
        LIMIT ?
      `)
      .all(...parameters) as MessageRow[];
    const reactions = this.reactionsByMessage(rows.map(({ id }) => id));
    const messages = rows.map((row) => toMessageDto(row, reactions.get(row.id) ?? []));
    return cursor.after === undefined ? messages.reverse() : messages;
  }

  search(conversationId: string, userId: string, query: string, limit: number): MessageDto[] {
    const { member } = this.conversations.requireMember(conversationId, userId);
    const escapedQuery = query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
    const rows = this.database
      .prepare(`
        ${messageSelect}
        WHERE m.conversation_id = ?
          AND m.sequence >= ?
          AND m.body LIKE ? ESCAPE '\\'
        ORDER BY m.sequence DESC
        LIMIT ?
      `)
      .all(conversationId, member.visible_from_sequence, `%${escapedQuery}%`, limit) as MessageRow[];
    const reactions = this.reactionsByMessage(rows.map(({ id }) => id));
    return rows.map((row) => toMessageDto(row, reactions.get(row.id) ?? []));
  }

  listPinned(conversationId: string, userId: string): MessageDto[] {
    const { member } = this.conversations.requireMember(conversationId, userId);
    const rows = this.database
      .prepare(`
        ${messageSelect}
        JOIN conversation_pins selected_pin
          ON selected_pin.conversation_id = m.conversation_id AND selected_pin.message_id = m.id
        WHERE m.conversation_id = ? AND m.sequence >= ?
        ORDER BY selected_pin.pinned_at DESC
      `)
      .all(conversationId, member.visible_from_sequence) as MessageRow[];
    const reactions = this.reactionsByMessage(rows.map(({ id }) => id));
    return rows.map((row) => toMessageDto(row, reactions.get(row.id) ?? []));
  }

  togglePin(messageId: string, userId: string): MessageDto {
    const toggle = this.database.transaction(() => {
      const message = this.database
        .prepare('SELECT conversation_id, sequence FROM messages WHERE id = ?')
        .get(messageId) as { conversation_id: string; sequence: number } | undefined;
      if (!message) throw errors.notFound('Сообщение не найдено');
      const { member } = this.conversations.requireMember(message.conversation_id, userId);
      if (message.sequence < member.visible_from_sequence) throw errors.notFound('Сообщение не найдено');

      const existing = this.database
        .prepare('SELECT 1 FROM conversation_pins WHERE conversation_id = ? AND message_id = ?')
        .get(message.conversation_id, messageId);
      if (existing) {
        this.database
          .prepare('DELETE FROM conversation_pins WHERE conversation_id = ? AND message_id = ?')
          .run(message.conversation_id, messageId);
      } else {
        this.database
          .prepare('INSERT INTO conversation_pins(conversation_id, message_id, pinned_by_id, pinned_at) VALUES (?, ?, ?, ?)')
          .run(message.conversation_id, messageId, userId, new Date().toISOString());
      }
      return this.requireById(messageId);
    });
    return toggle();
  }

  toggleReaction(messageId: string, userId: string, emoji: string): MessageDto {
    const toggle = this.database.transaction(() => {
      const message = this.database
        .prepare('SELECT conversation_id, sequence FROM messages WHERE id = ?')
        .get(messageId) as { conversation_id: string; sequence: number } | undefined;
      if (!message) throw errors.notFound('Сообщение не найдено');

      const { member } = this.conversations.requireMember(message.conversation_id, userId);
      if (message.sequence < member.visible_from_sequence) throw errors.notFound('Сообщение не найдено');

      const existing = this.database
        .prepare('SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
        .get(messageId, userId, emoji);
      if (existing) {
        this.database
          .prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
          .run(messageId, userId, emoji);
      } else {
        this.database
          .prepare('INSERT INTO message_reactions(message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)')
          .run(messageId, userId, emoji, new Date().toISOString());
      }

      return this.requireById(messageId);
    });

    return toggle();
  }

  private requireById(messageId: string): MessageDto {
    const row = this.database
      .prepare(`${messageSelect} WHERE m.id = ?`)
      .get(messageId) as MessageRow | undefined;
    if (!row) throw errors.notFound('Сообщение не найдено');
    return this.toHydratedMessage(row);
  }

  private toHydratedMessage(row: MessageRow): MessageDto {
    return toMessageDto(row, this.reactionsByMessage([row.id]).get(row.id) ?? []);
  }

  private reactionsByMessage(messageIds: string[]): Map<string, MessageReactionDto[]> {
    const result = new Map<string, MessageReactionDto[]>();
    if (messageIds.length === 0) return result;

    const placeholders = messageIds.map(() => '?').join(', ');
    const rows = this.database
      .prepare(`
        SELECT message_id, user_id, emoji
        FROM message_reactions
        WHERE message_id IN (${placeholders})
        ORDER BY created_at ASC
      `)
      .all(...messageIds) as MessageReactionRow[];

    for (const row of rows) {
      const messageReactions = result.get(row.message_id) ?? [];
      const reaction = messageReactions.find(({ emoji }) => emoji === row.emoji);
      if (reaction) {
        reaction.count += 1;
        reaction.userIds.push(row.user_id);
      } else {
        messageReactions.push({ emoji: row.emoji, count: 1, userIds: [row.user_id] });
        result.set(row.message_id, messageReactions);
      }
    }
    return result;
  }

  updateRead(conversationId: string, userId: string, requestedSequence: number): number {
    const { conversation, member } = this.conversations.requireMember(conversationId, userId);
    const lastSequence = conversation.next_message_sequence - 1;
    if (requestedSequence > lastSequence) throw errors.validation('Read cursor больше последнего сообщения');

    const nextSequence = Math.max(member.last_read_sequence, requestedSequence);
    this.database
      .prepare('UPDATE conversation_members SET last_read_sequence = ? WHERE id = ?')
      .run(nextSequence, member.id);
    return nextSequence;
  }

  count(senderId?: string, clientMessageId?: string): number {
    if (senderId && clientMessageId) {
      const result = this.database
        .prepare('SELECT COUNT(*) AS count FROM messages WHERE sender_id = ? AND client_message_id = ?')
        .get(senderId, clientMessageId) as { count: number };
      return result.count;
    }

    const result = this.database.prepare('SELECT COUNT(*) AS count FROM messages').get() as { count: number };
    return result.count;
  }
}
