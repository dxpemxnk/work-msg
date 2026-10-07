import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import type {
  CallMode,
  Conversation,
  GroupCallSession,
  GroupRemoteStream,
  User,
} from '@/types/messenger';

type GroupCallAck =
  | { ok: true; mode: CallMode; participants: User[] }
  | { ok: false; error: { message: string } };

type UseGroupCallOptions = {
  socket: Socket | null;
  currentUser: User;
};

const mediaConstraints = (mode: CallMode): MediaStreamConstraints => ({
  audio: true,
  video: mode === 'video',
});

export function useGroupCall({ socket, currentUser }: UseGroupCallOptions) {
  const [session, setSession] = useState<GroupCallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<GroupRemoteStream[]>([]);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [availableCall, setAvailableCall] = useState<{ conversationId: string; mode: CallMode; user: User } | null>(null);
  const sessionRef = useRef<GroupCallSession | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const connectionsRef = useRef(new Map<string, RTCPeerConnection>());
  const candidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());

  const updateSession = useCallback((value: GroupCallSession | null) => {
    sessionRef.current = value;
    setSession(value);
  }, []);

  const removePeer = useCallback((userId: string) => {
    connectionsRef.current.get(userId)?.close();
    connectionsRef.current.delete(userId);
    candidatesRef.current.delete(userId);
    setRemoteStreams((items) => items.filter(({ user }) => user.id !== userId));
    const current = sessionRef.current;
    if (current) updateSession({
      ...current,
      participants: current.participants.filter((user) => user.id !== userId),
    });
  }, [updateSession]);

  const cleanup = useCallback(() => {
    connectionsRef.current.forEach((connection) => connection.close());
    connectionsRef.current.clear();
    candidatesRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams([]);
    setMuted(false);
    setCameraOff(false);
    updateSession(null);
  }, [updateSession]);

  const createConnection = useCallback((conversationId: string, peer: User) => {
    const existing = connectionsRef.current.get(peer.id);
    if (existing) return existing;

    const connection = new RTCPeerConnection();
    connectionsRef.current.set(peer.id, connection);
    localStreamRef.current?.getTracks().forEach((track) => {
      connection.addTrack(track, localStreamRef.current!);
    });
    connection.onicecandidate = ({ candidate }) => {
      if (candidate && socket) {
        socket.emit('group-call:ice', {
          conversationId,
          targetUserId: peer.id,
          candidate: candidate.toJSON(),
        });
      }
    };
    connection.ontrack = ({ streams, track }) => {
      const stream = streams[0] ?? new MediaStream([track]);
      setRemoteStreams((items) => [
        ...items.filter(({ user }) => user.id !== peer.id),
        { user: peer, stream },
      ]);
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') removePeer(peer.id);
    };
    return connection;
  }, [removePeer, socket]);

  const flushCandidates = useCallback(async (userId: string, connection: RTCPeerConnection) => {
    const candidates = candidatesRef.current.get(userId) ?? [];
    candidatesRef.current.delete(userId);
    for (const candidate of candidates) await connection.addIceCandidate(candidate);
  }, []);

  const joinCall = useCallback(async (conversation: Conversation, mode: CallMode) => {
    if (!socket?.connected || conversation.type !== 'GROUP' || sessionRef.current) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error();
      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(mode));
      localStreamRef.current = stream;
      setLocalStream(stream);
      socket.timeout(8000).emit(
        'group-call:join',
        { conversationId: conversation.id, mode },
        async (timeoutError: Error | null, result?: GroupCallAck) => {
          if (timeoutError || !result?.ok) {
            setNotice(result && !result.ok ? result.error.message : 'Сервер не ответил на запрос звонка');
            cleanup();
            return;
          }
          const nextSession: GroupCallSession = {
            conversationId: conversation.id,
            title: conversation.displayTitle,
            mode: result.mode,
            participants: [currentUser, ...result.participants],
            startedAt: Date.now(),
          };
          setAvailableCall(null);
          updateSession(nextSession);
          for (const peer of result.participants) {
            const connection = createConnection(conversation.id, peer);
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            socket.emit('group-call:offer', {
              conversationId: conversation.id,
              targetUserId: peer.id,
              description: offer,
            });
          }
        }
      );
    } catch {
      setNotice('Не удалось получить доступ к микрофону или камере');
      cleanup();
    }
  }, [cleanup, createConnection, currentUser, socket, updateSession]);

  const leaveCall = useCallback(() => {
    const current = sessionRef.current;
    if (current) socket?.emit('group-call:leave', { conversationId: current.conversationId });
    cleanup();
  }, [cleanup, socket]);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onJoined = ({ conversationId, mode, user }: { conversationId: string; mode: CallMode; user: User }) => {
      const current = sessionRef.current;
      if (!current) {
        setAvailableCall({ conversationId, mode, user });
        return;
      }
      if (current.conversationId !== conversationId) return;
      updateSession({ ...current, participants: [...current.participants.filter(({ id }) => id !== user.id), user] });
    };
    const onOffer = async ({ conversationId, fromUser, description }: {
      conversationId: string;
      fromUser: User;
      description: RTCSessionDescriptionInit;
    }) => {
      const current = sessionRef.current;
      if (!current || current.conversationId !== conversationId) return;
      updateSession({ ...current, participants: [...current.participants.filter(({ id }) => id !== fromUser.id), fromUser] });
      const connection = createConnection(conversationId, fromUser);
      await connection.setRemoteDescription(description);
      await flushCandidates(fromUser.id, connection);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      socket.emit('group-call:answer', {
        conversationId,
        targetUserId: fromUser.id,
        description: answer,
      });
    };
    const onAnswer = async ({ conversationId, fromUserId, description }: {
      conversationId: string;
      fromUserId: string;
      description: RTCSessionDescriptionInit;
    }) => {
      if (sessionRef.current?.conversationId !== conversationId) return;
      const connection = connectionsRef.current.get(fromUserId);
      if (!connection) return;
      await connection.setRemoteDescription(description);
      await flushCandidates(fromUserId, connection);
    };
    const onIce = async ({ conversationId, fromUserId, candidate }: {
      conversationId: string;
      fromUserId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      if (sessionRef.current?.conversationId !== conversationId) return;
      const connection = connectionsRef.current.get(fromUserId);
      if (connection?.remoteDescription) await connection.addIceCandidate(candidate);
      else candidatesRef.current.set(fromUserId, [...(candidatesRef.current.get(fromUserId) ?? []), candidate]);
    };
    const onLeft = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (sessionRef.current?.conversationId === conversationId) removePeer(userId);
      setAvailableCall((value) => value?.conversationId === conversationId && value.user.id === userId ? null : value);
    };
    const onAccessRevoked = ({ conversationId }: { conversationId: string }) => {
      if (sessionRef.current?.conversationId === conversationId) {
        cleanup();
        setNotice('Ваш доступ к групповому звонку отозван');
      }
      setAvailableCall((value) => value?.conversationId === conversationId ? null : value);
    };
    const onDisconnect = () => {
      if (!sessionRef.current) return;
      cleanup();
      setNotice('Групповой звонок завершён из-за потери связи');
    };

    socket.on('group-call:user-joined', onJoined);
    socket.on('group-call:offer', onOffer);
    socket.on('group-call:answer', onAnswer);
    socket.on('group-call:ice', onIce);
    socket.on('group-call:user-left', onLeft);
    socket.on('group-call:access-revoked', onAccessRevoked);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('group-call:user-joined', onJoined);
      socket.off('group-call:offer', onOffer);
      socket.off('group-call:answer', onAnswer);
      socket.off('group-call:ice', onIce);
      socket.off('group-call:user-left', onLeft);
      socket.off('group-call:access-revoked', onAccessRevoked);
      socket.off('disconnect', onDisconnect);
    };
  }, [cleanup, createConnection, flushCandidates, removePeer, socket, updateSession]);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    session,
    localStream,
    remoteStreams,
    muted,
    cameraOff,
    notice,
    setNotice,
    availableCall,
    joinCall,
    leaveCall,
    toggleMute,
    toggleCamera,
  };
}
