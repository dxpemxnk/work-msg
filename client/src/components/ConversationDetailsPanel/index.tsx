import { ManageAccounts } from '@mui/icons-material';
import { Badge, Box, Button, Divider, List, ListItemButton, ListItemText, Typography } from '@mui/material';

import type { Conversation, Message, User } from '@/types/messenger';
import { ConversationSearch } from '@components/ConversationSearch';
import { UserAvatar } from '@components/UserAvatar';
import styles from './index.module.scss';

type ConversationDetailsPanelProps = {
  conversation: Conversation;
  currentUserId: string;
  onlineUserIds: ReadonlySet<string>;
  onSearch: (query: string) => Promise<Message[]>;
  onSelectMessage: (message: Message) => void;
  onOpenProfile: (user: User, anchorEl: HTMLElement) => void;
  onManageMembers: () => void;
};

export function ConversationDetailsPanel({
  conversation,
  currentUserId,
  onlineUserIds,
  onSearch,
  onSelectMessage,
  onOpenProfile,
  onManageMembers,
}: ConversationDetailsPanelProps) {
  return (
    <Box component="aside" className={styles.panel}>
      <Box className={styles.panelHeader}>
        <ConversationSearch compact onSearch={onSearch} onSelect={onSelectMessage} />
      </Box>
      <Box className={styles.tools}>
        <Button fullWidth startIcon={<ManageAccounts />} onClick={onManageMembers}>Управление</Button>
      </Box>
      <Divider />
      <Typography variant="overline" className={styles.title!}>Участники — {conversation.members.length}</Typography>
      <List dense className={styles.members!}>
        {conversation.members.map(({ user, role }) => {
          const own = user.id === currentUserId;
          const online = onlineUserIds.has(user.id);
          return (
            <ListItemButton key={user.id} onClick={(event) => onOpenProfile(user, event.currentTarget)}>
              <Badge
                overlap="circular"
                variant="dot"
                className={`${styles.avatarBadge!} ${online ? styles.online! : styles.offline!}`}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              >
                <UserAvatar user={user} size={34} />
              </Badge>
              <ListItemText
                className={styles.memberText!}
                primary={user.displayName}
                secondary={own ? 'Вы' : role === 'OWNER' ? 'Владелец' : online ? 'В сети' : 'Не в сети'}
                primaryTypographyProps={{ noWrap: true }}
              />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}
