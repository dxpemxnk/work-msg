import { useState } from 'react';
import { Close, Reply, Send } from '@mui/icons-material';
import { Box, IconButton, TextField, Typography } from '@mui/material';

import type { Message } from '@/types/messenger';
import { MESSAGE_MAX_LENGTH } from '@config/index';
import styles from './index.module.scss';

type MessageComposerProps = {
  disabled: boolean;
  replyTo: Message | null;
  onCancelReply: () => void;
  onSend: (body: string) => void;
};

export function MessageComposer({ disabled, replyTo, onCancelReply, onSend }: MessageComposerProps) {
  const [body, setBody] = useState('');

  const send = () => {
    const cleanBody = body.trim();
    if (!cleanBody || disabled) return;
    onSend(cleanBody);
    setBody('');
  };

  return (
    <Box className={styles.wrapper}>
      {replyTo && (
        <Box className={styles.replyBar}>
          <Reply color="primary" fontSize="small" />
          <Box className={styles.replyText}>
            <Typography variant="caption" className={styles.replyAuthor!}>Ответ для {replyTo.senderDisplayName}</Typography>
            <Typography variant="body2" noWrap>{replyTo.body}</Typography>
          </Box>
          <IconButton size="small" onClick={onCancelReply} aria-label="Отменить ответ"><Close fontSize="small" /></IconButton>
        </Box>
      )}
      <Box className={styles.composer}>
        <TextField
          fullWidth
          multiline
          maxRows={6}
          value={body}
          disabled={disabled}
          placeholder={replyTo ? 'Написать ответ…' : 'Написать сообщение…'}
          inputProps={{ maxLength: MESSAGE_MAX_LENGTH }}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <IconButton color="primary" disabled={disabled || !body.trim()} onClick={send} aria-label="Отправить сообщение">
          <Send />
        </IconButton>
      </Box>
    </Box>
  );
}
