import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import type { CallAck, CallMode, CallSession, Conversation, User } from '@/types/messenger';

type IncomingCall = {
  callId: string;
  conversationId: string;
  mode: CallMode;
  offer: RTCSessionDescriptionInit;
  caller: User;
};

type UseDirectCallOptions = {
  socket: Socket | null;
  currentUser: User;
};

const callConstraints = (mode: CallMode): MediaStreamConstraints => ({
  audio: true,
  video: mode === 'video',
});

export function useDirectCall({ socket, currentUser }: UseDirectCallOptions) {
  const [session, setSession] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sessionRef = useRef<CallSession | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const incomingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const remoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const localCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const signalingReadyRef = useRef(false);

  const updateSession = useCallback((value: CallSession | null) => {
    sessionRef.current = value;
    setSession(value);
  }, []);

  const cleanup = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    incomingOfferRef.current = null;
    remoteCandidatesRef.current = [];
    localCandidatesRef.current = [];
    signalingReadyRef.current = false;
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    updateSession(null);
  }, [updateSession]);

  const flushRemoteCandidates = useCallback(async (connection: RTCPeerConnection) => {
    const candidates = remoteCandidatesRef.current;
    remoteCandidatesRef.current = [];
    for (const candidate of candidates) await connection.addIceCandidate(candidate);
  }, []);

  const createConnection = useCallback((callId: string) => {
    const connection = new RTCPeerConnection();
    peerConnectionRef.current = connection;

    connection.onicecandidate = ({ candidate }) => {
      if (!candidate || !socket) return;
      const serialized = candidate.toJSON();
      if (signalingReadyRef.current) socket.emit('call:ice', { callId, candidate: serialized });
      else localCandidatesRef.current.push(serialized);
    };
    connection.ontrack = ({ streams, track }) => {
      const stream = streams[0] ?? new MediaStream([track]);
      setRemoteStream(stream);
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected') {
        const current = sessionRef.current;
        if (current?.callId === callId) {
          updateSession({ ...current, status: 'active', startedAt: Date.now() });
        }
      }
      if (connection.connectionState === 'failed') {
        setNotice('Не удалось установить соединение');
        const current = sessionRef.current;
        if (current?.callId === callId) socket?.emit('call:end', { callId });
        cleanup();
      }
    };

    return connection;
  }, [cleanup, socket, updateSession]);

  const acquireMedia = useCallback(async (mode: CallMode) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Браузер не поддерживает доступ к микрофону');
    const stream = await navigator.mediaDevices.getUserMedia(callConstraints(mode));
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const startCall = useCallback(async (conversation: Conversation, mode: CallMode) => {
    if (!socket?.connected || conversation.type !== 'DIRECT' || sessionRef.current) return;
    const peer = conversation.members.find(({ user }) => user.id !== currentUser.id)?.user;
    if (!peer) return;

    setNotice(null);
    const callId = crypto.randomUUID();
    const nextSession: CallSession = {
      callId,
      conversationId: conversation.id,
      peer,
      mode,
      direction: 'outgoing',
      status: 'ringing',
      startedAt: null,
    };
    updateSession(nextSession);

    try {
      const stream = await acquireMedia(mode);
      const connection = createConnection(callId);
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      socket.timeout(8000).emit(
        'call:start',
        { callId, conversationId: conversation.id, mode, offer },
        (timeoutError: Error | null, result?: CallAck) => {
          if (timeoutError || !result?.ok) {
            setNotice(result && !result.ok ? result.error.message : 'Сервер не ответил на запрос звонка');
            cleanup();
            return;
          }
          signalingReadyRef.current = true;
          const candidates = localCandidatesRef.current;
          localCandidatesRef.current = [];
          candidates.forEach((candidate) => socket.emit('call:ice', { callId, candidate }));
        }
      );
    } catch {
      setNotice('Не удалось получить доступ к микрофону или камере');
      cleanup();
    }
  }, [acquireMedia, cleanup, createConnection, currentUser.id, socket, updateSession]);

  const acceptCall = useCallback(async () => {
    const current = sessionRef.current;
    const offer = incomingOfferRef.current;
    if (!socket?.connected || !current || current.direction !== 'incoming' || !offer) return;

    try {
      const stream = await acquireMedia(current.mode);
      const connection = createConnection(current.callId);
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      await connection.setRemoteDescription(offer);
      await flushRemoteCandidates(connection);
      signalingReadyRef.current = true;
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      updateSession({ ...current, status: 'connecting' });
      socket.emit('call:answer', { callId: current.callId, answer }, (result: CallAck) => {
        if (!result.ok) {
          setNotice(result.error.message);
          cleanup();
        }
      });
    } catch {
      socket.emit('call:reject', { callId: current.callId });
      setNotice('Не удалось получить доступ к микрофону или камере');
      cleanup();
    }
  }, [acquireMedia, cleanup, createConnection, flushRemoteCandidates, socket, updateSession]);

  const rejectCall = useCallback(() => {
    const current = sessionRef.current;
    if (current?.direction === 'incoming') socket?.emit('call:reject', { callId: current.callId });
    cleanup();
  }, [cleanup, socket]);

  const endCall = useCallback(() => {
    const current = sessionRef.current;
    if (current) socket?.emit('call:end', { callId: current.callId });
    cleanup();
  }, [cleanup, socket]);

  const toggleMute = useCallback(() => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !audioTrack.enabled;
    setMuted(!audioTrack.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !videoTrack.enabled;
    setCameraOff(!videoTrack.enabled);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onIncoming = (incoming: IncomingCall) => {
      if (sessionRef.current) {
        socket.emit('call:reject', { callId: incoming.callId });
        return;
      }
      incomingOfferRef.current = incoming.offer;
      remoteCandidatesRef.current = [];
      updateSession({
        callId: incoming.callId,
        conversationId: incoming.conversationId,
        peer: incoming.caller,
        mode: incoming.mode,
        direction: 'incoming',
        status: 'ringing',
        startedAt: null,
      });
    };
    const onAnswered = async ({ callId, answer }: { callId: string; answer: RTCSessionDescriptionInit }) => {
      const current = sessionRef.current;
      const connection = peerConnectionRef.current;
      if (current?.callId !== callId || !connection) return;
      await connection.setRemoteDescription(answer);
      await flushRemoteCandidates(connection);
      updateSession({ ...current, status: 'connecting' });
    };
    const onIce = async ({ callId, candidate }: { callId: string; candidate: RTCIceCandidateInit }) => {
      if (sessionRef.current?.callId !== callId) return;
      const connection = peerConnectionRef.current;
      if (connection?.remoteDescription) await connection.addIceCandidate(candidate);
      else remoteCandidatesRef.current.push(candidate);
    };
    const onRejected = ({ callId }: { callId: string }) => {
      if (sessionRef.current?.callId !== callId) return;
      setNotice('Собеседник отклонил звонок');
      cleanup();
    };
    const onEnded = ({ callId, reason }: { callId: string; reason: string }) => {
      if (sessionRef.current?.callId !== callId) return;
      const notices: Record<string, string> = {
        'peer-offline': 'Собеседник отключился',
        'no-answer': 'На звонок не ответили',
        'answered-elsewhere': 'Звонок принят в другой вкладке',
      };
      setNotice(notices[reason] ?? 'Звонок завершён');
      cleanup();
    };
    const onDisconnect = () => {
      if (!sessionRef.current) return;
      cleanup();
      setNotice('Звонок завершён из-за потери связи');
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:answered', onAnswered);
    socket.on('call:ice', onIce);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:answered', onAnswered);
      socket.off('call:ice', onIce);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
      socket.off('disconnect', onDisconnect);
    };
  }, [cleanup, flushRemoteCandidates, socket, updateSession]);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    session,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    notice,
    setNotice,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
  };
}
