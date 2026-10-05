import { useEffect, useRef, useState } from 'react';
import { CallEnd, Mic, MicOff, Phone, Videocam, VideocamOff } from '@mui/icons-material';
import { Box, Button, Dialog, IconButton, Typography } from '@mui/material';

import { UserAvatar } from '@components/UserAvatar';
import type { CallSession } from '@/types/messenger';
import styles from './index.module.scss';

type CallDialogProps = {
  session: CallSession | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
};

const statusLabel = (session: CallSession, elapsed: number) => {
  if (session.status === 'active') {
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
  if (session.direction === 'incoming') return 'Входящий звонок';
  if (session.status === 'connecting') return 'Соединение…';
  return 'Вызов…';
};

export function CallDialog({
  session,
  localStream,
  remoteStream,
  muted,
  cameraOff,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleCamera,
}: CallDialogProps) {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream, session?.mode]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (!session?.startedAt) {
      setElapsed(0);
      return;
    }
    const update = () => setElapsed(Math.floor((Date.now() - session.startedAt!) / 1000));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [session?.startedAt]);

  if (!session) return null;
  const incomingRinging = session.direction === 'incoming' && session.status === 'ringing';

  return (
    <Dialog open fullScreen disableEscapeKeyDown>
      <Box className={styles.call}>
        {session.mode === 'video' && !incomingRinging ? (
          <>
            <video ref={remoteVideoRef} autoPlay playsInline className={styles.remoteVideo} />
            <video ref={localVideoRef} autoPlay playsInline muted className={styles.localVideo} />
          </>
        ) : (
          <Box className={styles.audioStage}>
            <UserAvatar user={session.peer} size={112} />
          </Box>
        )}
        {session.mode === 'audio' && <audio ref={remoteAudioRef} autoPlay />}

        <Box className={styles.overlay}>
          <Box className={styles.identity}>
            <Typography variant="h4" className={styles.name!}>{session.peer.displayName}</Typography>
            <Typography className={styles.status!}>{statusLabel(session, elapsed)}</Typography>
          </Box>

          <Box className={styles.controls}>
            {incomingRinging ? (
              <>
                <Button variant="contained" color="success" size="large" startIcon={<Phone />} onClick={onAccept}>
                  Ответить
                </Button>
                <Button variant="contained" color="error" size="large" startIcon={<CallEnd />} onClick={onReject}>
                  Отклонить
                </Button>
              </>
            ) : (
              <>
                <IconButton className={styles.controlButton!} onClick={onToggleMute} aria-label={muted ? 'Включить микрофон' : 'Выключить микрофон'}>
                  {muted ? <MicOff /> : <Mic />}
                </IconButton>
                {session.mode === 'video' && (
                  <IconButton className={styles.controlButton!} onClick={onToggleCamera} aria-label={cameraOff ? 'Включить камеру' : 'Выключить камеру'}>
                    {cameraOff ? <VideocamOff /> : <Videocam />}
                  </IconButton>
                )}
                <IconButton className={styles.endButton!} onClick={onEnd} aria-label="Завершить звонок">
                  <CallEnd />
                </IconButton>
              </>
            )}
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}
