import { Close, PushPin } from '@mui/icons-material';
import { Box, DialogContent, DialogTitle, IconButton, Paper, Popover, Tooltip, Typography } from '@mui/material';

import type { Message } from '@/types/messenger';
import { MessageBody } from '@components/MessageBody';
import { UserAvatar } from '@components/UserAvatar';
import { useGetPinnedMessagesQuery } from '@services/api/messenger';
import styles from './index.module.scss';

type PinnedMessagesDialogProps = {
  conversationId: string | null;
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onSelect: (message: Message) => void;
  onTogglePin: (messageId: string) => void;
};

export function PinnedMessagesDialog({ conversationId, anchorEl, open, onClose, onSelect, onTogglePin }: PinnedMessagesDialogProps) {
  const { data: messages = [], isLoading } = useGetPinnedMessagesQuery(conversationId ?? '', { skip: !open || !conversationId });
  const formatDate = (createdAt: string) => new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createdAt));

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      PaperProps={{ className: styles.popoverPaper! }}
    >
      <DialogTitle className={styles.dialogTitle!}>
        <Box className={styles.titleText}>
          <PushPin fontSize="small" />
          <Typography variant="h6">Закреплённые сообщения</Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Закрыть закреплённые сообщения"><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers className={styles.content!}>
        {!isLoading && messages.length === 0 && <Typography color="text.secondary">Закреплённых сообщений пока нет.</Typography>}
        <Box className={styles.list}>
          {messages.map((message) => (
            <Paper key={message.id} variant="outlined" className={styles.card!}>
              <Box className={styles.cardHeader}>
                <UserAvatar user={message.sender} size={38} />
                <button
                  type="button"
                  className={styles.messageLink}
                  onClick={() => { onSelect(message); onClose(); }}
                  aria-label={`Перейти к сообщению ${message.senderDisplayName}`}
                >
                  <Typography className={styles.sender!}>{message.senderDisplayName}</Typography>
                  <Typography variant="caption" className={styles.date!}>{formatDate(message.createdAt)}</Typography>
                </button>
                <Tooltip title="Открепить">
                  <IconButton size="small" onClick={() => onTogglePin(message.id)} aria-label="Открепить сообщение">
                    <Close fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              {message.replyTo && (
                <Box className={styles.quote}>
                  <Typography variant="caption" className={styles.quoteAuthor!}>{message.replyTo.senderDisplayName}</Typography>
                  <Typography variant="body2" noWrap>{message.replyTo.body}</Typography>
                </Box>
              )}
              <Box
                className={styles.body}
                role="button"
                tabIndex={0}
                aria-label={`Перейти к сообщению: ${message.body}`}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a')) return;
                  onSelect(message);
                  onClose();
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onSelect(message);
                  onClose();
                }}
              >
                <MessageBody body={message.body} />
              </Box>
            </Paper>
          ))}
        </Box>
        {isLoading && <Box className={styles.loading}><PushPin /><Typography>Загрузка…</Typography></Box>}
      </DialogContent>
    </Popover>
  );
}
