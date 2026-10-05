import type { UserDto, UserStatus } from '../users/user.types.js';

export interface MessageReactionDto {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ReplyPreviewDto {
  id: string;
  sequence: number;
  senderDisplayName: string;
  body: string;
}

export interface ForwardPreviewDto {
  id: string;
  senderDisplayName: string;
  body: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  senderDisplayName: string;
  sender: UserDto;
  clientMessageId: string;
  sequence: number;
  body: string;
  replyTo: ReplyPreviewDto | null;
  forwardedFrom: ForwardPreviewDto | null;
  reactions: MessageReactionDto[];
  isPinned: boolean;
  createdAt: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_display_name: string;
  sender_login: string;
  sender_avatar_color: string;
  sender_status: UserStatus;
  client_message_id: string;
  sequence: number;
  body: string;
  reply_to_message_id: string | null;
  reply_sequence: number | null;
  reply_sender_display_name: string | null;
  reply_body: string | null;
  forwarded_from_message_id: string | null;
  forwarded_sender_display_name: string | null;
  forwarded_body: string | null;
  is_pinned: number;
  created_at: string;
}

export interface MessageReactionRow {
  message_id: string;
  user_id: string;
  emoji: string;
}

export interface SendMessageCommand {
  conversationId: string;
  clientMessageId: string;
  body: string;
  replyToMessageId?: string;
  forwardedFromMessageId?: string;
}

export interface SendMessageResult {
  ok: true;
  message: MessageDto;
  deduplicated: boolean;
}

export interface SocketFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export type MessageAck = SendMessageResult | SocketFailure;

export interface MessageCursor {
  before?: number;
  after?: number;
  limit: number;
}
