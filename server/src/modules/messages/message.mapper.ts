import type { MessageDto, MessageReactionDto, MessageRow } from './message.types.js';

export function toMessageDto(row: MessageRow, reactions: MessageReactionDto[] = []): MessageDto {
  const {
    id,
    conversation_id: conversationId,
    sender_id: senderId,
    sender_display_name: senderDisplayName,
    sender_login: senderLogin,
    sender_avatar_color: senderAvatarColor,
    sender_status: senderStatus,
    client_message_id: clientMessageId,
    sequence,
    body,
    reply_to_message_id: replyToMessageId,
    reply_sequence: replySequence,
    reply_sender_display_name: replySenderDisplayName,
    reply_body: replyBody,
    forwarded_from_message_id: forwardedFromMessageId,
    forwarded_sender_display_name: forwardedSenderDisplayName,
    forwarded_body: forwardedBody,
    is_pinned: isPinned,
    created_at: createdAt,
  } = row;
  const replyTo = replyToMessageId && typeof replySequence === 'number' && typeof replySenderDisplayName === 'string' && typeof replyBody === 'string'
    ? { id: replyToMessageId, sequence: replySequence, senderDisplayName: replySenderDisplayName, body: replyBody }
    : null;
  const forwardedFrom = forwardedFromMessageId && typeof forwardedSenderDisplayName === 'string' && typeof forwardedBody === 'string'
    ? { id: forwardedFromMessageId, senderDisplayName: forwardedSenderDisplayName, body: forwardedBody }
    : null;
  const sender = {
    id: senderId,
    login: senderLogin ?? '',
    displayName: senderDisplayName,
    avatarColor: senderAvatarColor ?? '#607d8b',
    status: senderStatus ?? 'ACTIVE',
  };
  return { id, conversationId, senderId, senderDisplayName, sender, clientMessageId, sequence, body, replyTo, forwardedFrom, reactions, isPinned: Boolean(isPinned), createdAt };
}
