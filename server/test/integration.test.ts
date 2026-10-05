import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LightMyRequestResponse } from 'fastify';
import { io as socketClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp, type BuiltApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { ConversationDto } from '../src/modules/conversations/conversation.types.js';
import type { MessageDto } from '../src/modules/messages/message.types.js';
import type { UserDto } from '../src/modules/users/user.types.js';

const origin = 'http://localhost:3000';
const testConfig = (databasePath = ':memory:') =>
  loadConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: databasePath,
    CLIENT_ORIGIN: origin,
    DEV_AUTH_ENABLED: 'true',
    SESSION_SECRET: 'test-session-secret-that-is-long-enough-123',
    MESSAGE_MAX_LENGTH: '100',
  });

interface Session {
  user: UserDto;
  cookie: string;
}

const body = <T>(response: LightMyRequestResponse): T => response.json<T>();

async function session(built: BuiltApp, login: string): Promise<Session> {
  const usersResponse = await built.app.inject({ method: 'GET', url: '/api/v1/dev/users' });
  const users = body<{ users: UserDto[] }>(usersResponse).users;
  const user = users.find((candidate) => candidate.login === login);
  if (!user) throw new Error(`Missing seeded user: ${login}`);
  const response = await built.app.inject({ method: 'POST', url: '/api/v1/dev/session', payload: { userId: user.id } });
  expect(response.statusCode).toBe(200);
  const setCookie = response.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error('Session cookie missing');
  return { user, cookie: raw.split(';')[0] ?? raw };
}

const auth = (cookie: string) => ({ cookie });

async function direct(built: BuiltApp, actor: Session, peer: Session): Promise<ConversationDto> {
  const response = await built.app.inject({
    method: 'POST',
    url: '/api/v1/conversations/direct',
    headers: auth(actor.cookie),
    payload: { userId: peer.user.id },
  });
  expect(response.statusCode).toBe(201);
  return body<{ conversation: ConversationDto }>(response).conversation;
}

async function send(built: BuiltApp, actor: Session, conversationId: string, clientMessageId: string, text: string) {
  return built.app.inject({
    method: 'POST',
    url: `/api/v1/conversations/${conversationId}/messages`,
    headers: auth(actor.cookie),
    payload: { clientMessageId, body: text },
  });
}

describe('messenger server integration', () => {
  let built: BuiltApp;

  beforeEach(async () => {
    built = await buildApp(testConfig());
  });

  afterEach(async () => {
    await built.app.close();
  });

  it('requires authentication for protected resources', async () => {
    const response = await built.app.inject({ method: 'GET', url: '/api/v1/conversations' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('creates one DIRECT conversation under concurrent requests', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const [first, second] = await Promise.all([
      direct(built, alexey, maria),
      direct(built, maria, alexey),
    ]);
    expect(first.id).toBe(second.id);
    expect(built.repositories.conversations.listForUser(alexey.user.id)).toHaveLength(1);
  });

  it('persists idempotent messages and allocates consecutive sequences', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const conversation = await direct(built, alexey, maria);
    const commandId = randomUUID();
    const first = await send(built, alexey, conversation.id, commandId, 'Привет');
    const retry = await send(built, alexey, conversation.id, commandId, 'Привет');
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(body<{ deduplicated: boolean }>(retry).deduplicated).toBe(true);
    expect(built.repositories.messages.count(alexey.user.id, commandId)).toBe(1);

    const replies = await Promise.all([
      send(built, maria, conversation.id, randomUUID(), 'Ответ 1'),
      send(built, alexey, conversation.id, randomUUID(), 'Ответ 2'),
    ]);
    expect(replies.every((response) => response.statusCode === 201)).toBe(true);
    const history = await built.app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${conversation.id}/messages`,
      headers: auth(alexey.cookie),
    });
    expect(body<{ messages: MessageDto[] }>(history).messages.map((message) => message.sequence)).toEqual([1, 2, 3]);
  });

  it('persists replies and toggles one reaction per user', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const conversation = await direct(built, alexey, maria);
    const originalResponse = await send(built, alexey, conversation.id, randomUUID(), 'Исходное сообщение');
    const original = body<{ message: MessageDto }>(originalResponse).message;

    const replyResponse = await built.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversation.id}/messages`,
      headers: auth(maria.cookie),
      payload: { clientMessageId: randomUUID(), body: 'Ответ', replyToMessageId: original.id },
    });
    expect(body<{ message: MessageDto }>(replyResponse).message.replyTo).toEqual({
      id: original.id,
      sequence: original.sequence,
      senderDisplayName: alexey.user.displayName,
      body: 'Исходное сообщение',
    });

    const react = (actor: Session) => built.app.inject({
      method: 'POST',
      url: `/api/v1/messages/${original.id}/reactions`,
      headers: auth(actor.cookie),
      payload: { emoji: '👍' },
    });
    await react(alexey);
    const twoReactions = body<{ message: MessageDto }>(await react(maria)).message.reactions[0];
    expect(twoReactions).toMatchObject({ emoji: '👍', count: 2 });
    expect(twoReactions?.userIds).toEqual(expect.arrayContaining([alexey.user.id, maria.user.id]));

    const toggledOff = body<{ message: MessageDto }>(await react(alexey)).message.reactions[0];
    expect(toggledOff).toMatchObject({ emoji: '👍', count: 1, userIds: [maria.user.id] });
  });

  it('searches the accessible conversation history and treats wildcards as text', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const conversation = await direct(built, alexey, maria);
    await send(built, alexey, conversation.id, randomUUID(), 'готовность релиза 100%');
    await send(built, maria, conversation.id, randomUUID(), 'обычное сообщение');

    const search = await built.app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${conversation.id}/messages/search?query=${encodeURIComponent('%')}`,
      headers: auth(alexey.cookie),
    });
    expect(search.statusCode).toBe(200);
    expect(body<{ messages: MessageDto[] }>(search).messages.map(({ body: messageBody }) => messageBody)).toEqual([
      'готовность релиза 100%',
    ]);
  });

  it('persists forwarded message attribution and shared conversation pins', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const dmitry = await session(built, 'dmitry');
    const sourceConversation = await direct(built, alexey, maria);
    const targetConversation = await direct(built, maria, dmitry);
    const original = body<{ message: MessageDto }>(
      await send(built, alexey, sourceConversation.id, randomUUID(), 'Важная информация')
    ).message;

    const forwardedResponse = await built.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${targetConversation.id}/messages`,
      headers: auth(maria.cookie),
      payload: {
        clientMessageId: randomUUID(),
        body: original.body,
        forwardedFromMessageId: original.id,
      },
    });
    expect(body<{ message: MessageDto }>(forwardedResponse).message.forwardedFrom).toEqual({
      id: original.id,
      senderDisplayName: alexey.user.displayName,
      body: original.body,
    });

    const pinResponse = await built.app.inject({
      method: 'POST',
      url: `/api/v1/messages/${original.id}/pin`,
      headers: auth(maria.cookie),
    });
    expect(body<{ message: MessageDto }>(pinResponse).message.isPinned).toBe(true);
    const pinned = await built.app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${sourceConversation.id}/messages/pinned`,
      headers: auth(alexey.cookie),
    });
    expect(body<{ messages: MessageDto[] }>(pinned).messages.map(({ id }) => id)).toEqual([original.id]);
    const historyWithPinNotice = built.repositories.messages.list(sourceConversation.id, alexey.user.id, { limit: 50 });
    expect(historyWithPinNotice.at(-1)).toMatchObject({
      body: '📌 Закреплено сообщение: Важная информация',
      replyTo: { id: original.id, sequence: original.sequence },
    });

    const unpinResponse = await built.app.inject({
      method: 'POST',
      url: `/api/v1/messages/${original.id}/pin`,
      headers: auth(alexey.cookie),
    });
    expect(body<{ message: MessageDto }>(unpinResponse).message.isPinned).toBe(false);
  });

  it('denies conversation access and group mutation to unauthorized users', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const dmitry = await session(built, 'dmitry');
    const groupResponse = await built.app.inject({
      method: 'POST',
      url: '/api/v1/conversations/group',
      headers: auth(alexey.cookie),
      payload: { title: 'Разработка', memberIds: [maria.user.id] },
    });
    const group = body<{ conversation: ConversationDto }>(groupResponse).conversation;

    const stranger = await built.app.inject({ method: 'GET', url: `/api/v1/conversations/${group.id}`, headers: auth(dmitry.cookie) });
    expect(stranger.statusCode).toBe(403);
    const memberMutation = await built.app.inject({
      method: 'PATCH',
      url: `/api/v1/conversations/${group.id}`,
      headers: auth(maria.cookie),
      payload: { title: 'Взломанное название' },
    });
    expect(memberMutation.statusCode).toBe(403);
  });

  it('enforces visibleFromSequence and revokes a removed member', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const dmitry = await session(built, 'dmitry');
    const created = await built.app.inject({
      method: 'POST',
      url: '/api/v1/conversations/group',
      headers: auth(alexey.cookie),
      payload: { title: 'Аналитики', memberIds: [maria.user.id] },
    });
    const group = body<{ conversation: ConversationDto }>(created).conversation;
    await send(built, alexey, group.id, randomUUID(), 'Старое сообщение');
    const add = await built.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${group.id}/members`,
      headers: auth(alexey.cookie),
      payload: { userId: dmitry.user.id },
    });
    expect(add.statusCode).toBe(200);
    await send(built, maria, group.id, randomUUID(), 'Новое сообщение');
    const dmitryHistory = await built.app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${group.id}/messages`,
      headers: auth(dmitry.cookie),
    });
    expect(body<{ messages: MessageDto[] }>(dmitryHistory).messages.map((message) => message.body)).toEqual([
      '👤 Дмитрий Соколов добавлен(а) в беседу',
      'Новое сообщение',
    ]);

    const remove = await built.app.inject({
      method: 'DELETE',
      url: `/api/v1/conversations/${group.id}/members/${dmitry.user.id}`,
      headers: auth(alexey.cookie),
    });
    expect(remove.statusCode).toBe(200);
    const afterRemoval = await send(built, dmitry, group.id, randomUUID(), 'Не должно сохраниться');
    expect(afterRemoval.statusCode).toBe(403);
    const removedHistory = await built.app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${group.id}/messages`,
      headers: auth(dmitry.cookie),
    });
    expect(removedHistory.statusCode).toBe(403);
  });

  it('keeps read cursor monotonic and validates its upper bound', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const conversation = await direct(built, alexey, maria);
    await send(built, maria, conversation.id, randomUUID(), '1');
    await send(built, maria, conversation.id, randomUUID(), '2');
    const markTwo = await built.app.inject({ method: 'POST', url: `/api/v1/conversations/${conversation.id}/read`, headers: auth(alexey.cookie), payload: { sequence: 2 } });
    const markOne = await built.app.inject({ method: 'POST', url: `/api/v1/conversations/${conversation.id}/read`, headers: auth(alexey.cookie), payload: { sequence: 1 } });
    expect(body<{ lastReadSequence: number }>(markTwo).lastReadSequence).toBe(2);
    expect(body<{ lastReadSequence: number }>(markOne).lastReadSequence).toBe(2);
    const tooFar = await built.app.inject({ method: 'POST', url: `/api/v1/conversations/${conversation.id}/read`, headers: auth(alexey.cookie), payload: { sequence: 3 } });
    expect(tooFar.statusCode).toBe(400);
  });

  it('rejects oversized messages and stores HTML as inert text', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const conversation = await direct(built, alexey, maria);
    const tooLong = await send(built, alexey, conversation.id, randomUUID(), 'x'.repeat(101));
    expect(tooLong.statusCode).toBe(400);
    const script = '<script>globalThis.hacked=true</script>';
    const response = await send(built, alexey, conversation.id, randomUUID(), script);
    expect(body<{ message: MessageDto }>(response).message.body).toBe(script);
  });

  it('delivers persisted messages over Socket.IO to an online peer', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const conversation = await direct(built, alexey, maria);
    await built.app.listen({ host: '127.0.0.1', port: 0 });
    const address = built.app.server.address();
    if (!address || typeof address === 'string') throw new Error('Test server address unavailable');
    const client: Socket = socketClient(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: maria.cookie, Origin: origin },
    });
    await new Promise<void>((resolve, reject) => {
      client.once('connection:ready', () => resolve());
      client.once('connect_error', reject);
    });
    const received = new Promise<MessageDto>((resolve) => client.once('message:new', resolve));
    const response = await send(built, alexey, conversation.id, randomUUID(), 'Онлайн сообщение');
    const message = await received;
    expect(response.statusCode).toBe(201);
    expect(message.body).toBe('Онлайн сообщение');
    expect(built.repositories.messages.count()).toBe(1);
    client.close();
  });

  it('synchronizes read state between two sockets of the same user', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const conversation = await direct(built, alexey, maria);
    await send(built, maria, conversation.id, randomUUID(), 'Непрочитанное');
    await built.app.listen({ host: '127.0.0.1', port: 0 });
    const address = built.app.server.address();
    if (!address || typeof address === 'string') throw new Error('Test server address unavailable');
    const first = socketClient(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: alexey.cookie, Origin: origin },
    });
    const second = socketClient(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: alexey.cookie, Origin: origin },
    });
    await Promise.all(
      [first, second].map(
        (client) =>
          new Promise<void>((resolve, reject) => {
            client.once('connection:ready', () => resolve());
            client.once('connect_error', reject);
          })
      )
    );
    const synchronized = new Promise<{ conversationId: string; userId: string; lastReadSequence: number }>((resolve) =>
      second.once('read:updated', resolve)
    );
    const acknowledged = new Promise<unknown>((resolve) =>
      first.emit('read:update', { conversationId: conversation.id, sequence: 1 }, resolve)
    );
    await acknowledged;
    await expect(synchronized).resolves.toEqual({
      conversationId: conversation.id,
      userId: alexey.user.id,
      lastReadSequence: 1,
    });
    first.close();
    second.close();
  });

  it('notifies the sender when a peer reads a message', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const conversation = await direct(built, alexey, maria);
    await send(built, alexey, conversation.id, randomUUID(), 'Сообщение с отметкой прочтения');
    await built.app.listen({ host: '127.0.0.1', port: 0 });
    const address = built.app.server.address();
    if (!address || typeof address === 'string') throw new Error('Test server address unavailable');
    const clients = [alexey, maria].map(({ cookie }) =>
      socketClient(`http://127.0.0.1:${address.port}`, {
        transports: ['websocket'],
        extraHeaders: { Cookie: cookie, Origin: origin },
      })
    );
    const [alexeySocket, mariaSocket] = clients;
    if (!alexeySocket || !mariaSocket) throw new Error('Test sockets unavailable');
    await Promise.all(
      clients.map(
        (client) =>
          new Promise<void>((resolve, reject) => {
            client.once('connection:ready', () => resolve());
            client.once('connect_error', reject);
          })
      )
    );

    const receipt = new Promise<{ conversationId: string; userId: string; lastReadSequence: number }>((resolve) =>
      alexeySocket.once('read:updated', resolve)
    );
    const acknowledged = new Promise<unknown>((resolve) =>
      mariaSocket.emit('read:update', { conversationId: conversation.id, sequence: 1 }, resolve)
    );

    await acknowledged;
    await expect(receipt).resolves.toEqual({
      conversationId: conversation.id,
      userId: maria.user.id,
      lastReadSequence: 1,
    });
    const alexeyView = built.repositories.conversations.getById(conversation.id, alexey.user.id);
    expect(alexeyView.members.find(({ user }) => user.id === maria.user.id)?.lastReadSequence).toBe(1);
    clients.forEach((client) => client.close());
  });

  it('broadcasts online and offline presence changes', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    await built.app.listen({ host: '127.0.0.1', port: 0 });
    const address = built.app.server.address();
    if (!address || typeof address === 'string') throw new Error('Test server address unavailable');
    const url = `http://127.0.0.1:${address.port}`;
    const alexeySocket = socketClient(url, {
      transports: ['websocket'],
      extraHeaders: { Cookie: alexey.cookie, Origin: origin },
    });
    await new Promise<void>((resolve, reject) => {
      alexeySocket.once('connection:ready', () => resolve());
      alexeySocket.once('connect_error', reject);
    });

    const becameOnline = new Promise<{ userId: string; online: boolean }>((resolve) =>
      alexeySocket.once('presence:updated', resolve)
    );
    const mariaSocket = socketClient(url, {
      transports: ['websocket'],
      extraHeaders: { Cookie: maria.cookie, Origin: origin },
    });
    await new Promise<void>((resolve, reject) => {
      mariaSocket.once('connection:ready', () => resolve());
      mariaSocket.once('connect_error', reject);
    });
    await expect(becameOnline).resolves.toEqual({ userId: maria.user.id, online: true });

    const becameOffline = new Promise<{ userId: string; online: boolean }>((resolve) =>
      alexeySocket.once('presence:updated', resolve)
    );
    mariaSocket.close();
    await expect(becameOffline).resolves.toEqual({ userId: maria.user.id, online: false });
    alexeySocket.close();
  });

  it('relays a direct WebRTC call from offer to hangup', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const conversation = await direct(built, alexey, maria);
    await built.app.listen({ host: '127.0.0.1', port: 0 });
    const address = built.app.server.address();
    if (!address || typeof address === 'string') throw new Error('Test server address unavailable');
    const url = `http://127.0.0.1:${address.port}`;
    const clients = [alexey, maria].map(({ cookie }) =>
      socketClient(url, {
        transports: ['websocket'],
        extraHeaders: { Cookie: cookie, Origin: origin },
      })
    );
    const [alexeySocket, mariaSocket] = clients;
    if (!alexeySocket || !mariaSocket) throw new Error('Test sockets unavailable');
    await Promise.all(
      clients.map(
        (client) =>
          new Promise<void>((resolve, reject) => {
            client.once('connection:ready', () => resolve());
            client.once('connect_error', reject);
          })
      )
    );

    const callId = randomUUID();
    const incoming = new Promise<{ callId: string; mode: string; caller: UserDto }>((resolve) =>
      mariaSocket.once('call:incoming', resolve)
    );
    const started = new Promise<unknown>((resolve) =>
      alexeySocket.emit('call:start', {
        callId,
        conversationId: conversation.id,
        mode: 'audio',
        offer: { type: 'offer', sdp: 'test-offer' },
      }, resolve)
    );
    await expect(started).resolves.toMatchObject({ ok: true });
    await expect(incoming).resolves.toMatchObject({ callId, mode: 'audio', caller: { id: alexey.user.id } });

    const answered = new Promise<{ callId: string; answer: { type: string; sdp: string } }>((resolve) =>
      alexeySocket.once('call:answered', resolve)
    );
    const answerAck = new Promise<unknown>((resolve) =>
      mariaSocket.emit('call:answer', { callId, answer: { type: 'answer', sdp: 'test-answer' } }, resolve)
    );
    await expect(answerAck).resolves.toMatchObject({ ok: true });
    await expect(answered).resolves.toEqual({ callId, answer: { type: 'answer', sdp: 'test-answer' } });

    const ended = new Promise<{ callId: string; reason: string }>((resolve) =>
      mariaSocket.once('call:ended', resolve)
    );
    const endAck = new Promise<unknown>((resolve) => alexeySocket.emit('call:end', { callId }, resolve));
    await expect(endAck).resolves.toMatchObject({ ok: true });
    await expect(ended).resolves.toEqual({ callId, reason: 'peer-ended' });

    const completedHistory = built.repositories.messages.list(conversation.id, alexey.user.id, { limit: 50 });
    expect(completedHistory.at(-1)?.body).toMatch(/^📞 Звонок завершён · \d{2}:\d{2}$/u);

    const rejectedCallId = randomUUID();
    const rejectedIncoming = new Promise<void>((resolve) => mariaSocket.once('call:incoming', () => resolve()));
    await new Promise<unknown>((resolve) =>
      alexeySocket.emit('call:start', {
        callId: rejectedCallId,
        conversationId: conversation.id,
        mode: 'video',
        offer: { type: 'offer', sdp: 'rejected-offer' },
      }, resolve)
    );
    await rejectedIncoming;
    await new Promise<unknown>((resolve) => mariaSocket.emit('call:reject', { callId: rejectedCallId }, resolve));

    const cancelledCallId = randomUUID();
    const cancelledIncoming = new Promise<void>((resolve) => mariaSocket.once('call:incoming', () => resolve()));
    await new Promise<unknown>((resolve) =>
      alexeySocket.emit('call:start', {
        callId: cancelledCallId,
        conversationId: conversation.id,
        mode: 'audio',
        offer: { type: 'offer', sdp: 'cancelled-offer' },
      }, resolve)
    );
    await cancelledIncoming;
    await new Promise<unknown>((resolve) => alexeySocket.emit('call:end', { callId: cancelledCallId }, resolve));

    const summaryBodies = built.repositories.messages
      .list(conversation.id, alexey.user.id, { limit: 50 })
      .map(({ body: messageBody }) => messageBody);
    expect(summaryBodies).toContain('📞 Звонок отклонён');
    expect(summaryBodies).toContain('📞 Звонок отменён до ответа');
    clients.forEach((client) => client.close());
  });

  it('relays a group WebRTC mesh call between conversation members', async () => {
    const alexey = await session(built, 'alexey');
    const maria = await session(built, 'maria');
    const created = await built.app.inject({
      method: 'POST',
      url: '/api/v1/conversations/group',
      headers: auth(alexey.cookie),
      payload: { title: 'Групповой звонок', memberIds: [maria.user.id] },
    });
    const conversation = body<{ conversation: ConversationDto }>(created).conversation;
    await built.app.listen({ host: '127.0.0.1', port: 0 });
    const address = built.app.server.address();
    if (!address || typeof address === 'string') throw new Error('Test server address unavailable');
    const url = `http://127.0.0.1:${address.port}`;
    const clients = [alexey, maria].map(({ cookie }) => socketClient(url, {
      transports: ['websocket'],
      extraHeaders: { Cookie: cookie, Origin: origin },
    }));
    const [alexeySocket, mariaSocket] = clients;
    if (!alexeySocket || !mariaSocket) throw new Error('Test sockets unavailable');
    await Promise.all(clients.map((client) => new Promise<void>((resolve, reject) => {
      client.once('connection:ready', () => resolve());
      client.once('connect_error', reject);
    })));

    const alexeyJoin = new Promise<unknown>((resolve) =>
      alexeySocket.emit('group-call:join', { conversationId: conversation.id, mode: 'video' }, resolve)
    );
    await expect(alexeyJoin).resolves.toMatchObject({ ok: true, participants: [] });

    const memberJoined = new Promise<{ user: UserDto }>((resolve) =>
      alexeySocket.once('group-call:user-joined', resolve)
    );
    const mariaJoin = new Promise<unknown>((resolve) =>
      mariaSocket.emit('group-call:join', { conversationId: conversation.id, mode: 'video' }, resolve)
    );
    await expect(mariaJoin).resolves.toMatchObject({
      ok: true,
      participants: [{ id: alexey.user.id }],
    });
    await expect(memberJoined).resolves.toMatchObject({ user: { id: maria.user.id } });

    const offered = new Promise<{ fromUser: UserDto; description: { sdp: string } }>((resolve) =>
      alexeySocket.once('group-call:offer', resolve)
    );
    mariaSocket.emit('group-call:offer', {
      conversationId: conversation.id,
      targetUserId: alexey.user.id,
      description: { type: 'offer', sdp: 'mesh-offer' },
    });
    await expect(offered).resolves.toMatchObject({
      fromUser: { id: maria.user.id },
      description: { sdp: 'mesh-offer' },
    });

    const left = new Promise<{ userId: string }>((resolve) => alexeySocket.once('group-call:user-left', resolve));
    await new Promise<unknown>((resolve) =>
      mariaSocket.emit('group-call:leave', { conversationId: conversation.id }, resolve)
    );
    await expect(left).resolves.toEqual({ conversationId: conversation.id, userId: maria.user.id });
    clients.forEach((client) => client.close());
  });
});

describe('database persistence', () => {
  it('keeps history after backend restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ems-messenger-'));
    const databasePath = join(directory, 'test.sqlite');
    const first = await buildApp(testConfig(databasePath));
    const alexey = await session(first, 'alexey');
    const maria = await session(first, 'maria');
    const conversation = await direct(first, alexey, maria);
    await send(first, alexey, conversation.id, randomUUID(), 'Переживает рестарт');
    await first.app.close();

    const second = await buildApp(testConfig(databasePath));
    try {
      const history = second.repositories.messages.list(conversation.id, maria.user.id, { limit: 50 });
      expect(history.map((message) => message.body)).toEqual(['Переживает рестарт']);
    } finally {
      await second.app.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
