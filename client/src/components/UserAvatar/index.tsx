import { Avatar } from '@mui/material';

import type { User } from '@/types/messenger';
import styles from './index.module.scss';

type UserAvatarProps = { user: User; size?: number };

export function UserAvatar({ user, size = 40 }: UserAvatarProps) {
  const avatarStyle = {
    '--avatar-color': user.avatarColor,
    '--avatar-size': `${size}px`,
    '--avatar-font-size': `${size * 0.4}px`,
  } as React.CSSProperties;

  return (
    <Avatar className={styles.avatar!} style={avatarStyle}>
      {user.displayName
        .split(' ')
        .slice(0, 2)
        .map((part) => part[0])
        .join('')}
    </Avatar>
  );
}
