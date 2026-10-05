import { ChatBubbleOutline, GroupOutlined } from '@mui/icons-material';
import { Badge, Box, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';

import type { Conversation } from '@/types/messenger';
import { formatConversationTime } from '@utils/format';
import styles from './index.module.scss';

type ConversationListProps = {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
};

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  if (conversations.length === 0) {
    return <Typography className={styles.empty!}>Бесед пока нет</Typography>;
  }

  return (
    <List disablePadding>
      {conversations.map((conversation) => (
        <ListItemButton
          key={conversation.id}
          selected={conversation.id === selectedId}
          onClick={() => onSelect(conversation)}
          className={styles.item!}
        >
          <ListItemIcon className={styles.icon!}>
            <Badge badgeContent={conversation.unreadCount} color="primary" max={99}>
              {conversation.type === 'GROUP' ? <GroupOutlined /> : <ChatBubbleOutline />}
            </Badge>
          </ListItemIcon>
          <ListItemText
            primary={conversation.displayTitle}
            secondary={conversation.lastMessage?.body ?? 'Сообщений пока нет'}
            primaryTypographyProps={{ noWrap: true, fontWeight: conversation.unreadCount > 0 ? 700 : 500 }}
            secondaryTypographyProps={{ noWrap: true }}
          />
          <Box className={styles.time}>
            <Typography variant="caption" className={styles.timeText!}>
              {formatConversationTime(conversation.updatedAt)}
            </Typography>
          </Box>
        </ListItemButton>
      ))}
    </List>
  );
}
