import type { Conversation, Message, User } from '@/types/messenger';
import { API_URL } from '@config/index';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

interface ConversationsResponse { conversations: Conversation[] }
interface ConversationResponse { conversation: Conversation }
interface MessagesResponse { messages: Message[] }
interface UsersResponse { users: User[] }
interface UserResponse { user: User }

export const messengerApi = createApi({
  reducerPath: 'messengerApi',
  baseQuery: fetchBaseQuery({ baseUrl: API_URL, credentials: 'include' }),
  tagTypes: ['Conversation', 'ConversationList', 'Message', 'User'],
  endpoints: (builder) => ({
    getDevUsers: builder.query<User[], void>({
      query: () => '/api/v1/dev/users',
      transformResponse: ({ users }: UsersResponse) => users,
      providesTags: ['User'],
    }),
    getMe: builder.query<User, void>({
      query: () => '/api/v1/me',
      transformResponse: ({ user }: UserResponse) => user,
      providesTags: [{ type: 'User', id: 'ME' }],
    }),
    createDevSession: builder.mutation<User, string>({
      query: (userId) => ({ url: '/api/v1/dev/session', method: 'POST', body: { userId } }),
      transformResponse: ({ user }: UserResponse) => user,
      invalidatesTags: ['ConversationList', 'User'],
    }),
    deleteSession: builder.mutation<void, void>({
      query: () => ({ url: '/api/v1/session', method: 'DELETE' }),
    }),
    getUsers: builder.query<User[], void>({
      query: () => '/api/v1/users',
      transformResponse: ({ users }: UsersResponse) => users,
      providesTags: ['User'],
    }),
    getConversations: builder.query<Conversation[], void>({
      query: () => '/api/v1/conversations',
      transformResponse: ({ conversations }: ConversationsResponse) => conversations,
      providesTags: (result) => [
        { type: 'ConversationList', id: 'LIST' },
        ...(result ?? []).map(({ id }) => ({ type: 'Conversation' as const, id })),
      ],
    }),
    getConversation: builder.query<Conversation, string>({
      query: (id) => `/api/v1/conversations/${id}`,
      transformResponse: ({ conversation }: ConversationResponse) => conversation,
      providesTags: (_result, _error, id) => [{ type: 'Conversation', id }],
    }),
    createDirect: builder.mutation<Conversation, string>({
      query: (userId) => ({ url: '/api/v1/conversations/direct', method: 'POST', body: { userId } }),
      transformResponse: ({ conversation }: ConversationResponse) => conversation,
      invalidatesTags: [{ type: 'ConversationList', id: 'LIST' }],
    }),
    createGroup: builder.mutation<Conversation, { title: string; memberIds: string[] }>({
      query: (body) => ({ url: '/api/v1/conversations/group', method: 'POST', body }),
      transformResponse: ({ conversation }: ConversationResponse) => conversation,
      invalidatesTags: [{ type: 'ConversationList', id: 'LIST' }],
    }),
    updateGroup: builder.mutation<Conversation, { id: string; title: string }>({
      query: ({ id, title }) => ({ url: `/api/v1/conversations/${id}`, method: 'PATCH', body: { title } }),
      transformResponse: ({ conversation }: ConversationResponse) => conversation,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Conversation', id },
        { type: 'ConversationList', id: 'LIST' },
      ],
    }),
    addMember: builder.mutation<Conversation, { id: string; userId: string }>({
      query: ({ id, userId }) => ({ url: `/api/v1/conversations/${id}/members`, method: 'POST', body: { userId } }),
      transformResponse: ({ conversation }: ConversationResponse) => conversation,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Conversation', id },
        { type: 'ConversationList', id: 'LIST' },
      ],
    }),
    removeMember: builder.mutation<Conversation, { id: string; userId: string }>({
      query: ({ id, userId }) => ({ url: `/api/v1/conversations/${id}/members/${userId}`, method: 'DELETE' }),
      transformResponse: ({ conversation }: ConversationResponse) => conversation,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Conversation', id },
        { type: 'ConversationList', id: 'LIST' },
      ],
    }),
    leaveConversation: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/v1/conversations/${id}/leave`, method: 'POST' }),
      invalidatesTags: [{ type: 'ConversationList', id: 'LIST' }],
    }),
    getMessages: builder.query<Message[], { id: string; before?: number; after?: number; limit?: number }>({
      query: ({ id, before, after, limit = 50 }) => ({
        url: `/api/v1/conversations/${id}/messages`,
        params: { beforeSequence: before, afterSequence: after, limit },
      }),
      transformResponse: ({ messages }: MessagesResponse) => messages,
      providesTags: (_result, _error, { id }) => [{ type: 'Message', id }],
    }),
    searchMessages: builder.query<Message[], { id: string; query: string; limit?: number }>({
      query: ({ id, query, limit = 50 }) => ({
        url: `/api/v1/conversations/${id}/messages/search`,
        params: { query, limit },
      }),
      transformResponse: ({ messages }: MessagesResponse) => messages,
    }),
    getPinnedMessages: builder.query<Message[], string>({
      query: (id) => `/api/v1/conversations/${id}/messages/pinned`,
      transformResponse: ({ messages }: MessagesResponse) => messages,
      providesTags: (_result, _error, id) => [{ type: 'Message', id }],
    }),
    sendMessage: builder.mutation<
      { ok: true; message: Message; deduplicated: boolean },
      { conversationId: string; clientMessageId: string; body: string; replyToMessageId?: string; forwardedFromMessageId?: string }
    >({
      query: ({ conversationId, clientMessageId, body, replyToMessageId, forwardedFromMessageId }) => ({
        url: `/api/v1/conversations/${conversationId}/messages`,
        method: 'POST',
        body: { clientMessageId, body, replyToMessageId, forwardedFromMessageId },
      }),
      invalidatesTags: (_result, _error, { conversationId }) => [
        { type: 'Message', id: conversationId },
        { type: 'ConversationList', id: 'LIST' },
      ],
    }),
    toggleReaction: builder.mutation<Message, { messageId: string; emoji: string; conversationId: string }>({
      query: ({ messageId, emoji }) => ({
        url: `/api/v1/messages/${messageId}/reactions`,
        method: 'POST',
        body: { emoji },
      }),
      transformResponse: ({ message }: { message: Message }) => message,
      invalidatesTags: (_result, _error, { conversationId }) => [{ type: 'Message', id: conversationId }],
    }),
    togglePin: builder.mutation<Message, { messageId: string; conversationId: string }>({
      query: ({ messageId }) => ({ url: `/api/v1/messages/${messageId}/pin`, method: 'POST' }),
      transformResponse: ({ message }: { message: Message }) => message,
      invalidatesTags: (_result, _error, { conversationId }) => [{ type: 'Message', id: conversationId }],
    }),
    markRead: builder.mutation<
      { conversationId: string; lastReadSequence: number },
      { conversationId: string; sequence: number }
    >({
      query: ({ conversationId, sequence }) => ({
        url: `/api/v1/conversations/${conversationId}/read`,
        method: 'POST',
        body: { sequence },
      }),
      invalidatesTags: [{ type: 'ConversationList', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetDevUsersQuery,
  useLazyGetMeQuery,
  useCreateDevSessionMutation,
  useDeleteSessionMutation,
  useGetUsersQuery,
  useGetConversationsQuery,
  useLazyGetConversationsQuery,
  useLazyGetMessagesQuery,
  useLazySearchMessagesQuery,
  useGetPinnedMessagesQuery,
  useCreateDirectMutation,
  useCreateGroupMutation,
  useUpdateGroupMutation,
  useAddMemberMutation,
  useRemoveMemberMutation,
  useLeaveConversationMutation,
  useMarkReadMutation,
  useToggleReactionMutation,
  useTogglePinMutation,
  useSendMessageMutation,
} = messengerApi;
