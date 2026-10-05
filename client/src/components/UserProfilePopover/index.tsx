import { Call, ChatBubbleOutline } from '@mui/icons-material';
import { Box, Button, Popover, Typography } from '@mui/material';

import type { User } from '@/types/messenger';
import { PresenceIndicator } from '@components/PresenceIndicator';
import { UserAvatar } from '@components/UserAvatar';
import styles from './index.module.scss';

type UserProfilePopoverProps = {
  user: User | null;
  anchorEl: HTMLElement | null;
  online: boolean;
  own: boolean;
  onClose: () => void;
  onWrite: (userId: string) => void;
  onCall: (userId: string) => void;
};

export function UserProfilePopover({
  user,
  anchorEl,
  online,
  own,
  onClose,
  onWrite,
  onCall,
}: UserProfilePopoverProps) {
  return (
    <Popover
      open={Boolean(anchorEl && user)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      PaperProps={{ className: styles.paper! }}
    >
      {user && (
        <Box className={styles.profile}>
          <Box className={styles.cover} />
          <Box className={styles.avatar}>
            <UserAvatar user={user} size={78} />
          </Box>
          <Box className={styles.details}>
            <Typography variant="h6" className={styles.name!}>{user.displayName}</Typography>
            <Typography className={styles.login!}>@{user.login}</Typography>
            <PresenceIndicator online={online} />
            {!own && (
              <Box className={styles.actions}>
                <Button
                  variant="outlined"
                  startIcon={<ChatBubbleOutline />}
                  onClick={() => { onClose(); onWrite(user.id); }}
                >
                  Написать
                </Button>
                <Button
                  variant="contained"
                  startIcon={<Call />}
                  disabled={!online}
                  onClick={() => { onClose(); onCall(user.id); }}
                >
                  Позвонить
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Popover>
  );
}
