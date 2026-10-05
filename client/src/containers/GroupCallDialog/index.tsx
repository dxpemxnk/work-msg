import { useEffect, useRef } from 'react';
import { CallEnd, Mic, MicOff, Videocam, VideocamOff } from '@mui/icons-material';
import { Box, Dialog, IconButton, Typography } from '@mui/material';

import { UserAvatar } from '@components/UserAvatar';
import type { GroupCallSession, GroupRemoteStream, User } from '@/types/messenger';
import styles from './index.module.scss';

type VideoTileProps = {
  user: User;
  stream: MediaStream | null;
  video: boolean;
  muted?: boolean;
  label?: string;
};

function VideoTile({ user, stream, video, muted = false, label }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
    if (audioRef.current) audioRef.current.srcObject = stream;
  }, [stream]);

  return (
    <Box className={styles.tile}>
      {video && stream ? (
        <video ref={videoRef} autoPlay playsInline muted={muted} className={styles.video} />
      ) : (
        <UserAvatar user={user} size={88} />
      )}
      {!muted && <audio ref={audioRef} autoPlay />}
      <Typography className={styles.participantName!}>{label ?? user.displayName}</Typography>
    </Box>
  );
}

type GroupCallDialogProps = {
  session: GroupCallSession | null;
  currentUser: User;
  localStream: MediaStream | null;
  remoteStreams: GroupRemoteStream[];
  muted: boolean;
  cameraOff: boolean;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
};

export function GroupCallDialog({
  session,
  currentUser,
  localStream,
  remoteStreams,
  muted,
  cameraOff,
  onLeave,
  onToggleMute,
  onToggleCamera,
}: GroupCallDialogProps) {
  if (!session) return null;
  const remoteByUserId = new Map(remoteStreams.map((item) => [item.user.id, item.stream]));
  const remoteParticipants = session.participants.filter(({ id }) => id !== currentUser.id);

  return (
    <Dialog open fullScreen disableEscapeKeyDown>
      <Box className={styles.call}>
        <Box className={styles.header}>
          <Typography variant="h5" className={styles.title!}>{session.title}</Typography>
          <Typography className={styles.subtitle!}>
            Групповой {session.mode === 'video' ? 'видеозвонок' : 'аудиозвонок'} · {session.participants.length} участников
          </Typography>
        </Box>
        <Box className={styles.grid}>
          <VideoTile
            user={currentUser}
            stream={cameraOff ? null : localStream}
            video={session.mode === 'video'}
            muted
            label={`${currentUser.displayName} (вы)`}
          />
          {remoteParticipants.map((user) => (
            <VideoTile
              key={user.id}
              user={user}
              stream={remoteByUserId.get(user.id) ?? null}
              video={session.mode === 'video'}
            />
          ))}
        </Box>
        <Box className={styles.controls}>
          <IconButton className={styles.controlButton!} onClick={onToggleMute} aria-label={muted ? 'Включить микрофон' : 'Выключить микрофон'}>
            {muted ? <MicOff /> : <Mic />}
          </IconButton>
          {session.mode === 'video' && (
            <IconButton className={styles.controlButton!} onClick={onToggleCamera} aria-label={cameraOff ? 'Включить камеру' : 'Выключить камеру'}>
              {cameraOff ? <VideocamOff /> : <Videocam />}
            </IconButton>
          )}
          <IconButton className={styles.endButton!} onClick={onLeave} aria-label="Выйти из звонка">
            <CallEnd />
          </IconButton>
        </Box>
      </Box>
    </Dialog>
  );
}
