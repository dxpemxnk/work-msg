import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Typography,
} from '@mui/material';
import { ChatBubbleOutline } from '@mui/icons-material';

import type { User } from '@/types/messenger';
import { PresenceIndicator } from '@components/PresenceIndicator';
import { UserAvatar } from '@components/UserAvatar';
import styles from './index.module.scss';

type MessageReadersDialogProps = {
  open: boolean;
  readers: User[];
  onlineUserIds: ReadonlySet<string>;
  onClose: () => void;
  onWriteDirect: (userId: string) => void;
};

export function MessageReadersDialog({ open, readers, onlineUserIds, onClose, onWriteDirect }: MessageReadersDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Прочитали сообщение</DialogTitle>
      <DialogContent dividers>
        {readers.length === 0 ? (
          <Typography color="text.secondary">Пока никто не прочитал.</Typography>
        ) : (
          <List disablePadding>
            {readers.map((user) => (
              <ListItem
                key={user.id}
                disableGutters
                secondaryAction={
                  <Button
                    size="small"
                    startIcon={<ChatBubbleOutline />}
                    onClick={() => { onClose(); onWriteDirect(user.id); }}
                  >
                    Написать
                  </Button>
                }
              >
                <ListItemAvatar><UserAvatar user={user} size={38} /></ListItemAvatar>
                <ListItemText
                  primary={user.displayName}
                  secondary={
                    <Box component="span" className={styles.details}>
                      <Box component="span">@{user.login}</Box>
                      <PresenceIndicator online={onlineUserIds.has(user.id)} />
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Закрыть</Button></DialogActions>
    </Dialog>
  );
}
