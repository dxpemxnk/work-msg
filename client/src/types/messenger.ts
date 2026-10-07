export type UserStatus = 'ACTIVE' | 'DISABLED';
export type ConversationType = 'DIRECT' | 'GROUP';
export type MemberRole = 'OWNER' | 'MEMBER';
export type ConnectionState = 'connecting' | 'online' | 'offline' | 'synchronizing';
export type PendingStatus = 'sending' | 'failed';
export type CallMode = 'audio' | 'video';
export type CallDirection = 'incoming' | 'outgoing';
export type CallStatus = 'ringing' | 'connecting' | 'active';

export interface User {
  id: string;
  login: string;
  displayName: string;
  avatarColor: string;
  status: UserStatus;
}

export interface Member {
  user: User;
  role: MemberRole;
  joinedAt: string;
  visibleFromSequence: number;
  lastReadSequence: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderDisplayName: string;
  sender: User;
  clientMessageId: string;
  sequence: number;
  body: string;
  replyTo: ReplyPreview | null;
  forwardedFrom: ForwardPreview | null;
  reactions: MessageReaction[];
  isPinned: boolean;
  createdAt: string;
}

export interface ReplyPreview {
  id: string;
  sequence: number;
  senderDisplayName: string;
  body: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ForwardPreview {
  id: string;
  senderDisplayName: string;
  body: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string | null;
  displayTitle: string;
  directKey: string | null;
  lastSequence: number;
  lastReadSequence: number;
  unreadCount: number;
  role: MemberRole;
  members: Member[];
  lastMessage: Message | null;
  updatedAt: string;
}

export interface PendingMessage {
  clientMessageId: string;
  conversationId: string;
  senderId: string;
  senderDisplayName: string;
  body: string;
  replyTo: ReplyPreview | null;
  forwardedFrom: ForwardPreview | null;
  createdAt: string;
  status: PendingStatus;
}

export interface OutboxCommand {
  userId: string;
  clientMessageId: string;
  conversationId: string;
  body: string;
  replyToMessageId?: string;
  replyTo?: ReplyPreview;
  forwardedFromMessageId?: string;
  forwardedFrom?: ForwardPreview;
  blocked?: boolean;
  createdAt: string;
}

export type MessageAck =
  | { ok: true; message: Message; deduplicated: boolean }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };

export type ReadAck =
  | { ok: true; conversationId: string; lastReadSequence: number }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };

export type CallAck =
  | { ok: true }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };

export interface CallSession {
  callId: string;
  conversationId: string;
  peer: User;
  mode: CallMode;
  direction: CallDirection;
  status: CallStatus;
  startedAt: number | null;
}

export interface GroupCallSession {
  conversationId: string;
  title: string;
  mode: CallMode;
  participants: User[];
  startedAt: number;
}

export interface GroupRemoteStream {
  user: User;
  stream: MediaStream | null;
}
