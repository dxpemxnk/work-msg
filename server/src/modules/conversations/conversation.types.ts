import type { MessageDto } from '../messages/message.types.js';
import type { UserDto } from '../users/user.types.js';

export type ConversationType = 'DIRECT' | 'GROUP';
export type ConversationStatus = 'ACTIVE' | 'DELETED';
export type MemberRole = 'OWNER' | 'MEMBER';

export interface MemberDto {
  user: UserDto;
  role: MemberRole;
  joinedAt: string;
  visibleFromSequence: number;
  lastReadSequence: number;
}

export interface ConversationDto {
  id: string;
  type: ConversationType;
  title: string | null;
  displayTitle: string;
  directKey: string | null;
  lastSequence: number;
  lastReadSequence: number;
  unreadCount: number;
  role: MemberRole;
  members: MemberDto[];
  lastMessage: MessageDto | null;
  updatedAt: string;
}

export interface ConversationRow {
  id: string;
  type: ConversationType;
  title: string | null;
  direct_key: string | null;
  next_message_sequence: number;
  status: ConversationStatus;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface MemberRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MemberRole;
  visible_from_sequence: number;
  last_read_sequence: number;
  joined_at: string;
  left_at: string | null;
}
