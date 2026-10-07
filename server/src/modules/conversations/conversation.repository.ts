import { randomUUID } from 'node:crypto';

import type { SqliteDatabase } from '../../database/database.types.js';
import { AppError } from '../../shared/errors/app-error.js';
import { errors } from '../../shared/errors/errors.js';
import { toMessageDto } from '../messages/message.mapper.js';
import type { MessageDto, MessageRow } from '../messages/message.types.js';
import { toUserDto } from '../users/user.mapper.js';
import type { UserRepository } from '../users/user.repository.js';
import type { UserRow } from '../users/user.types.js';
import type { ConversationDto, ConversationRow, MemberDto, MemberRole, MemberRow } from './conversation.types.js';

export class ConversationRepository {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly users: UserRepository
  ) {}

  findRow(id: string): ConversationRow | null {
    return (this.database.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined) ?? null;
  }

  findActiveMember(conversationId: string, userId: string): MemberRow | null {
    return (
      (this.database
        .prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL')
        .get(conversationId, userId) as MemberRow | undefined) ?? null
    );
  }

  requireMember(conversationId: string, userId: string): { conversation: ConversationRow; member: MemberRow } {
    const conversation = this.findRow(conversationId);
    if (!conversation) throw errors.notFound('Беседа не найдена');
    if (conversation.status !== 'ACTIVE') throw new AppError('CONVERSATION_DELETED', 'Беседа удалена', 409);

    const member = this.findActiveMember(conversationId, userId);
    if (!member) throw errors.forbidden('Нет доступа к беседе');
    return { conversation, member };
  }

  requireOwner(conversationId: string, userId: string): { conversation: ConversationRow; member: MemberRow } {
    const access = this.requireMember(conversationId, userId);
    if (access.conversation.type !== 'GROUP') throw errors.validation('Операция доступна только для группы');
    if (access.member.role !== 'OWNER') throw errors.forbidden('Требуются права владельца группы');
    return access;
  }

  activeIdsForUser(userId: string): string[] {
    const rows = this.database
      .prepare('SELECT conversation_id FROM conversation_members WHERE user_id = ? AND left_at IS NULL')
      .all(userId) as Array<{ conversation_id: string }>;
    return rows.map(({ conversation_id }) => conversation_id);
  }

  activeUserIdsVisibleAt(conversationId: string, sequence: number): string[] {
    const rows = this.database
      .prepare(`
        SELECT user_id
        FROM conversation_members
        WHERE conversation_id = ?
          AND left_at IS NULL
          AND visible_from_sequence <= ?
      `)
      .all(conversationId, sequence) as Array<{ user_id: string }>;
    return rows.map(({ user_id }) => user_id);
  }

  listForUser(userId: string): ConversationDto[] {
    const rows = this.database
      .prepare(`
        SELECT c.*, cm.id AS member_id, cm.user_id, cm.role, cm.visible_from_sequence,
               cm.last_read_sequence, cm.joined_at, cm.left_at, cm.conversation_id
        FROM conversations c
        JOIN conversation_members cm ON cm.conversation_id = c.id
        WHERE cm.user_id = ? AND cm.left_at IS NULL AND c.status = 'ACTIVE'
        ORDER BY c.updated_at DESC
      `)
      .all(userId) as Array<ConversationRow & MemberRow & { member_id: string }>;

    if (rows.length === 0) return [];
    const conversationIds = rows.map(({ id }) => id);
    const membersByConversation = this.listMembersForConversations(conversationIds);
    const unreadByConversation = this.unreadCountsForConversations(conversationIds, userId);
    const lastMessageByConversation = this.lastMessagesForConversations(conversationIds, userId);

    return rows.map((row) => {
      const member = {
        id: row.member_id,
        conversation_id: row.id,
        user_id: row.user_id,
        role: row.role,
        visible_from_sequence: row.visible_from_sequence,
        last_read_sequence: row.last_read_sequence,
        joined_at: row.joined_at,
        left_at: row.left_at,
      };
      return this.toDtoFromParts(
        row,
        userId,
        member,
        membersByConversation.get(row.id) ?? [],
        unreadByConversation.get(row.id) ?? 0,
        lastMessageByConversation.get(row.id) ?? null
      );
    });
  }

  getById(id: string, viewerId: string): ConversationDto {
    const { conversation, member } = this.requireMember(id, viewerId);
    return this.toDto(conversation, viewerId, member);
  }

  createDirect(creatorId: string, peerId: string): ConversationDto {
    if (creatorId === peerId) throw errors.validation('Нельзя создать диалог с самим собой');
    this.users.requireActive(peerId);
    const directKey = [creatorId, peerId].sort().join(':');

    const create = this.database.transaction(() => {
      const existing = this.database
        .prepare('SELECT id FROM conversations WHERE direct_key = ?')
        .get(directKey) as { id: string } | undefined;
      if (existing) return existing.id;

      const id = randomUUID();
      const now = new Date().toISOString();
      this.database
        .prepare(`
          INSERT INTO conversations(
            id, type, title, direct_key, status, created_by_id, created_at, updated_at
          ) VALUES (?, 'DIRECT', NULL, ?, 'ACTIVE', ?, ?, ?)
        `)
        .run(id, directKey, creatorId, now, now);

      const addMember = this.database.prepare(`
        INSERT INTO conversation_members(
          id, conversation_id, user_id, role, visible_from_sequence, last_read_sequence, joined_at
        ) VALUES (?, ?, ?, 'MEMBER', 1, 0, ?)
      `);
      addMember.run(randomUUID(), id, creatorId, now);
      addMember.run(randomUUID(), id, peerId, now);
      return id;
    });

    return this.getById(create(), creatorId);
  }

  createGroup(creatorId: string, title: string, memberIds: string[]): ConversationDto {
    const uniqueMemberIds = [...new Set(memberIds)].filter((id) => id !== creatorId);
    if (uniqueMemberIds.length === 0) throw errors.validation('Добавьте хотя бы одного участника');
    uniqueMemberIds.forEach((id) => this.users.requireActive(id));

    const create = this.database.transaction(() => {
      const id = randomUUID();
      const now = new Date().toISOString();
      this.database
        .prepare(`
          INSERT INTO conversations(
            id, type, title, direct_key, status, created_by_id, created_at, updated_at
          ) VALUES (?, 'GROUP', ?, NULL, 'ACTIVE', ?, ?, ?)
        `)
        .run(id, title, creatorId, now, now);

      const addMember = this.database.prepare(`
        INSERT INTO conversation_members(
          id, conversation_id, user_id, role, visible_from_sequence, last_read_sequence, joined_at
        ) VALUES (?, ?, ?, ?, 1, 0, ?)
      `);
      addMember.run(randomUUID(), id, creatorId, 'OWNER', now);
      for (const memberId of uniqueMemberIds) addMember.run(randomUUID(), id, memberId, 'MEMBER', now);
      return id;
    });

    return this.getById(create(), creatorId);
  }

  updateTitle(conversationId: string, actorId: string, title: string): ConversationDto {
    this.requireOwner(conversationId, actorId);
    this.database
      .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, new Date().toISOString(), conversationId);
    return this.getById(conversationId, actorId);
  }

  addMember(conversationId: string, actorId: string, userId: string): ConversationDto {
    const { conversation } = this.requireOwner(conversationId, actorId);
    this.users.requireActive(userId);
    if (this.findActiveMember(conversationId, userId)) return this.getById(conversationId, actorId);

    const now = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO conversation_members(
          id, conversation_id, user_id, role, visible_from_sequence, last_read_sequence, joined_at, left_at
        ) VALUES (?, ?, ?, 'MEMBER', ?, 0, ?, NULL)
        ON CONFLICT(conversation_id, user_id) DO UPDATE SET
          role = 'MEMBER',
          visible_from_sequence = excluded.visible_from_sequence,
          last_read_sequence = 0,
          joined_at = excluded.joined_at,
          left_at = NULL
      `)
      .run(randomUUID(), conversationId, userId, conversation.next_message_sequence, now);
    return this.getById(conversationId, actorId);
  }

  removeMember(conversationId: string, actorId: string, userId: string): ConversationDto {
    this.requireOwner(conversationId, actorId);
    const member = this.findActiveMember(conversationId, userId);
    if (!member) throw errors.notFound('Участник не найден');
    if (member.role === 'OWNER') throw errors.conflict('Сначала передайте права владельца');

    this.database
      .prepare('UPDATE conversation_members SET left_at = ? WHERE id = ?')
      .run(new Date().toISOString(), member.id);
    return this.getById(conversationId, actorId);
  }

  leaveGroup(conversationId: string, userId: string): void {
    const { member } = this.requireCanLeaveGroup(conversationId, userId);

    this.database
      .prepare('UPDATE conversation_members SET left_at = ? WHERE id = ?')
      .run(new Date().toISOString(), member.id);
  }

  requireCanLeaveGroup(conversationId: string, userId: string): { conversation: ConversationRow; member: MemberRow } {
    const access = this.requireMember(conversationId, userId);
    const { conversation, member } = access;
    if (conversation.type !== 'GROUP') throw errors.validation('Нельзя выйти из личного диалога');
    if (member.role === 'OWNER') throw errors.conflict('Владелец должен сначала передать права');
    return access;
  }

  inTransaction<T>(operation: () => T): T {
    return this.database.transaction(operation)();
  }

  private listMembers(conversationId: string): MemberDto[] {
    const rows = this.database
      .prepare(`
        SELECT u.id, u.login, u.display_name, u.avatar_color, u.status,
               cm.role, cm.joined_at, cm.visible_from_sequence, cm.last_read_sequence
        FROM conversation_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = ? AND cm.left_at IS NULL
        ORDER BY u.display_name
      `)
      .all(conversationId) as Array<
        UserRow & { role: MemberRole; joined_at: string; visible_from_sequence: number; last_read_sequence: number }
      >;

    return rows.map((row) => ({
      user: toUserDto(row),
      role: row.role,
      joinedAt: row.joined_at,
      visibleFromSequence: row.visible_from_sequence,
      lastReadSequence: row.last_read_sequence,
    }));
  }

  private listMembersForConversations(conversationIds: string[]): Map<string, MemberDto[]> {
    const placeholders = conversationIds.map(() => '?').join(', ');
    const rows = this.database
      .prepare(`
        SELECT cm.conversation_id, u.id, u.login, u.display_name, u.avatar_color, u.status,
               cm.role, cm.joined_at, cm.visible_from_sequence, cm.last_read_sequence
        FROM conversation_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id IN (${placeholders}) AND cm.left_at IS NULL
        ORDER BY u.display_name
      `)
      .all(...conversationIds) as Array<
        UserRow & {
          conversation_id: string;
          role: MemberRole;
          joined_at: string;
          visible_from_sequence: number;
          last_read_sequence: number;
        }
      >;
    const result = new Map<string, MemberDto[]>();
    for (const row of rows) {
      const members = result.get(row.conversation_id) ?? [];
      members.push({
        user: toUserDto(row),
        role: row.role,
        joinedAt: row.joined_at,
        visibleFromSequence: row.visible_from_sequence,
        lastReadSequence: row.last_read_sequence,
      });
      result.set(row.conversation_id, members);
    }
    return result;
  }

  private unreadCountsForConversations(conversationIds: string[], userId: string): Map<string, number> {
    const placeholders = conversationIds.map(() => '?').join(', ');
    const rows = this.database
      .prepare(`
        SELECT m.conversation_id, COUNT(*) AS count
        FROM messages m
        JOIN conversation_members viewer
          ON viewer.conversation_id = m.conversation_id
          AND viewer.user_id = ?
          AND viewer.left_at IS NULL
        WHERE m.conversation_id IN (${placeholders})
          AND m.sequence > viewer.last_read_sequence
          AND m.sequence >= viewer.visible_from_sequence
          AND m.sender_id <> ?
        GROUP BY m.conversation_id
      `)
      .all(userId, ...conversationIds, userId) as Array<{ conversation_id: string; count: number }>;
    return new Map(rows.map(({ conversation_id, count }) => [conversation_id, count]));
  }

  private lastMessagesForConversations(conversationIds: string[], userId: string): Map<string, MessageDto> {
    const placeholders = conversationIds.map(() => '?').join(', ');
    const rows = this.database
      .prepare(`
        SELECT m.*, u.display_name AS sender_display_name, u.login AS sender_login,
               u.avatar_color AS sender_avatar_color, u.status AS sender_status
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        JOIN conversation_members viewer
          ON viewer.conversation_id = m.conversation_id
          AND viewer.user_id = ?
          AND viewer.left_at IS NULL
        WHERE m.conversation_id IN (${placeholders})
          AND m.sequence >= viewer.visible_from_sequence
          AND m.sequence = (
            SELECT MAX(latest.sequence)
            FROM messages latest
            WHERE latest.conversation_id = m.conversation_id
              AND latest.sequence >= viewer.visible_from_sequence
          )
      `)
      .all(userId, ...conversationIds) as MessageRow[];
    return new Map(rows.map((row) => [row.conversation_id, toMessageDto(row)]));
  }

  private toDto(row: ConversationRow, viewerId: string, member: MemberRow): ConversationDto {
    const members = this.listMembers(row.id);
    const { count: unreadCount } = this.database
      .prepare(`
        SELECT COUNT(*) AS count
        FROM messages
        WHERE conversation_id = ? AND sequence > ? AND sequence >= ? AND sender_id <> ?
      `)
      .get(row.id, member.last_read_sequence, member.visible_from_sequence, viewerId) as { count: number };
    const lastMessageRow = this.database
      .prepare(`
        SELECT m.*, u.display_name AS sender_display_name, u.login AS sender_login,
               u.avatar_color AS sender_avatar_color, u.status AS sender_status
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ? AND m.sequence >= ?
        ORDER BY m.sequence DESC
        LIMIT 1
      `)
      .get(row.id, member.visible_from_sequence) as MessageRow | undefined;

    return this.toDtoFromParts(
      row,
      viewerId,
      member,
      members,
      unreadCount,
      lastMessageRow ? toMessageDto(lastMessageRow) : null
    );
  }

  private toDtoFromParts(
    row: ConversationRow,
    viewerId: string,
    member: MemberRow,
    members: MemberDto[],
    unreadCount: number,
    lastMessage: MessageDto | null
  ): ConversationDto {
    const directPeer = members.find(({ user }) => user.id !== viewerId)?.user.displayName;
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      displayTitle: row.type === 'DIRECT' ? (directPeer ?? 'Личный диалог') : (row.title ?? 'Группа'),
      directKey: row.direct_key,
      lastSequence: row.next_message_sequence - 1,
      lastReadSequence: member.last_read_sequence,
      unreadCount,
      role: member.role,
      members,
      lastMessage,
      updatedAt: row.updated_at,
    };
  }
}
