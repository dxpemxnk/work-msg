// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation, User } from '@/types/messenger';
import { useDirectCall } from './useDirectCall';
import { useGroupCall } from './useGroupCall';

const user: User = { id: 'one', login: 'one', displayName: 'One', avatarColor: '#123', status: 'ACTIVE' };
const peer: User = { ...user, id: 'two', login: 'two' };
const conversation: Conversation = {
  id: 'chat', type: 'DIRECT', title: null, displayTitle: 'Chat', directKey: 'one:two',
  lastSequence: 0, lastReadSequence: 0, unreadCount: 0, role: 'MEMBER', lastMessage: null, updatedAt: '',
  members: [user, peer].map(person => ({ user: person, role: 'MEMBER', joinedAt: '', visibleFromSequence: 1, lastReadSequence: 0 })),
};
const group = { ...conversation, type: 'GROUP' as const };

function transport() {
  const handlers = new Map<string, (data?: unknown) => void>();
  const socket = {
    connected: true,
    on: (event: string, handler: (data?: unknown) => void) => { handlers.set(event, handler); },
    off: (event: string) => { handlers.delete(event); },
    timeout: vi.fn(), emit: vi.fn(),
  };
  socket.timeout.mockReturnValue(socket);
  socket.emit.mockImplementation((event: string, ...args: unknown[]) => {
    if (event === 'call:start') (args[1] as (error: null, result: { ok: true }) => void)(null, { ok: true });
    if (event === 'group-call:join') (args[1] as (error: null, result: unknown) => void)(null, { ok: true, mode: 'video', participants: [peer] });
  });
  return { raw: socket, socket: socket as unknown as Socket, handlers };
}
function media() {
  const audio = { enabled: true, stop: vi.fn() };
  const video = { enabled: true, stop: vi.fn() };
  const stream = { getTracks: () => [audio, video], getAudioTracks: () => [audio], getVideoTracks: () => [video] } as unknown as MediaStream;
  return { stream, audio, video };
}
class PeerConnection {
  static instances: PeerConnection[] = [];
  close = vi.fn();
  addTrack = vi.fn();
  createOffer = vi.fn(() => Promise.resolve({ type: 'offer', sdp: 'synthetic' }));
  createAnswer = vi.fn(() => Promise.resolve({ type: 'answer', sdp: 'synthetic' }));
  setLocalDescription = vi.fn(() => Promise.resolve());
  setRemoteDescription = vi.fn(() => Promise.resolve());
  addIceCandidate = vi.fn(() => Promise.resolve());
  constructor() { PeerConnection.instances.push(this); }
}
beforeEach(() => {
  PeerConnection.instances = [];
  vi.stubGlobal('RTCPeerConnection', PeerConnection);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('call media lifecycle (synthetic tracks and peer connections)', () => {
  it('starts direct video signaling and releases tracks and peers on disconnect', async () => {
    const io = transport();
    const tracks = media();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(tracks.stream) } });
    const { result } = renderHook(() => useDirectCall({ socket: io.socket, currentUser: user }));
    await act(() => result.current.startCall(conversation, 'video'));
    expect(io.raw.emit).toHaveBeenCalledWith('call:start', expect.objectContaining({ mode: 'video' }), expect.any(Function));
    act(() => { result.current.toggleMute(); result.current.toggleCamera(); });
    expect(tracks.audio.enabled).toBe(false);
    expect(tracks.video.enabled).toBe(false);
    act(() => { io.raw.connected = false; io.handlers.get('disconnect')?.(); });
    expect(tracks.audio.stop).toHaveBeenCalledOnce();
    expect(tracks.video.stop).toHaveBeenCalledOnce();
    expect(PeerConnection.instances[0]?.close).toHaveBeenCalledOnce();
    expect(result.current.session).toBeNull();
  });

  it('stops a late direct media stream if the caller cancelled while permission was pending', async () => {
    const io = transport();
    const tracks = media();
    let resolve!: (stream: MediaStream) => void;
    const pending = new Promise<MediaStream>(ok => { resolve = ok; });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => pending } });
    const { result } = renderHook(() => useDirectCall({ socket: io.socket, currentUser: user }));
    let start!: Promise<void>;
    act(() => { start = result.current.startCall(conversation, 'audio'); });
    act(() => result.current.endCall());
    await act(async () => { resolve(tracks.stream); await start; });
    expect(result.current.session).toBeNull();
    expect(tracks.audio.stop).toHaveBeenCalledOnce();
    expect(io.raw.emit.mock.calls.filter(([event]) => event === 'call:start')).toHaveLength(0);
  });

  it('cleans up the rejected second group tab without keeping microphone tracks', async () => {
    const io = transport();
    const tracks = media();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(tracks.stream) } });
    io.raw.emit.mockImplementation((event: string, ...args: unknown[]) => {
      if (event === 'group-call:join') (args[1] as (error: null, result: unknown) => void)(null, { ok: false, error: { message: 'Звонок уже открыт в другой вкладке' } });
    });
    const { result } = renderHook(() => useGroupCall({ socket: io.socket, currentUser: user }));
    await act(() => result.current.joinCall(group, 'video'));
    expect(result.current.notice).toContain('другой вкладке');
    expect(result.current.session).toBeNull();
    expect(tracks.audio.stop).toHaveBeenCalledOnce();
    expect(tracks.video.stop).toHaveBeenCalledOnce();
  });

  it('releases group media and peers when membership is revoked', async () => {
    const io = transport();
    const tracks = media();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(tracks.stream) } });
    const { result } = renderHook(() => useGroupCall({ socket: io.socket, currentUser: user }));
    await act(() => result.current.joinCall(group, 'video'));
    expect(result.current.session?.participants).toHaveLength(2);
    expect(io.raw.emit.mock.calls.some(([event]) => event === 'group-call:offer')).toBe(true);
    act(() => io.handlers.get('group-call:access-revoked')?.({ conversationId: group.id }));
    expect(result.current.session).toBeNull();
    expect(tracks.audio.stop).toHaveBeenCalledOnce();
    expect(tracks.video.stop).toHaveBeenCalledOnce();
    expect(PeerConnection.instances[0]?.close).toHaveBeenCalledOnce();
  });

  it('prevents double group join and cancels pending capture after disconnect', async () => {
    const io = transport();
    const tracks = media();
    let resolve!: (stream: MediaStream) => void;
    const pending = new Promise<MediaStream>(ok => { resolve = ok; });
    const getUserMedia = vi.fn(() => pending);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const { result } = renderHook(() => useGroupCall({ socket: io.socket, currentUser: user }));
    let first!: Promise<void>;
    act(() => { first = result.current.joinCall(group, 'video'); void result.current.joinCall(group, 'video'); });
    expect(getUserMedia).toHaveBeenCalledOnce();
    act(() => { io.raw.connected = false; io.handlers.get('disconnect')?.(); });
    await act(async () => { resolve(tracks.stream); await first; });
    expect(result.current.session).toBeNull();
    expect(tracks.audio.stop).toHaveBeenCalledOnce();
    expect(io.raw.emit.mock.calls.filter(([event]) => event === 'group-call:join')).toHaveLength(0);
  });
});
