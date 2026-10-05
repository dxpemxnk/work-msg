import { useState, type MouseEvent } from 'react';
import {
  Call,
  ChatBubbleOutline,
  ContentCopy,
  Forward,
  MoreHoriz,
  PersonAddAlt1,
  PersonRemove,
  PushPin,
  PushPinOutlined,
  Reply,
  SentimentSatisfiedAlt,
  VisibilityOutlined,
} from '@mui/icons-material';
import {
  Badge,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';

import type { Message, PendingMessage, ReplyPreview, User } from '@/types/messenger';
import { MessageBody } from '@components/MessageBody';
import { MessageReadersDialog } from '@components/MessageReadersDialog';
import { UserAvatar } from '@components/UserAvatar';
import styles from './index.module.scss';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const;

type MessageItemProps = {
  value: Message | PendingMessage;
  savedMessage: Message | null;
  sender: User | undefined;
  own: boolean;
  currentUserId: string;
  online: boolean;
  pending: boolean;
  groupLayout: boolean;
  highlighted: boolean;
  readBy: User[];
  onlineUserIds: ReadonlySet<string>;
  children: React.ReactNode;
  onReply: (message: Message) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onWriteDirect: (userId: string) => void;
  onOpenProfile: (user: User, anchorEl: HTMLElement) => void;
  onJumpToMessage: (replyTo: ReplyPreview) => void;
  onTogglePin: (messageId: string) => void;
  onForward: (message: Message) => void;
};

export function MessageItem({
  value,
  savedMessage,
  sender,
  own,
  currentUserId,
  online,
  pending,
  groupLayout,
  highlighted,
  readBy,
  onlineUserIds,
  children,
  onReply,
  onToggleReaction,
  onWriteDirect,
  onOpenProfile,
  onJumpToMessage,
  onTogglePin,
  onForward,
}: MessageItemProps) {
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [reactionAnchor, setReactionAnchor] = useState<HTMLElement | null>(null);
  const [readersOpen, setReadersOpen] = useState(false);
  const pinNotificationTarget = value.body.startsWith('📌 Закреплено сообщение: ')
    ? value.replyTo
    : null;
  const notificationKind = value.body.startsWith('📞')
    ? 'call'
    : value.body.startsWith('📌')
      ? 'pin'
      : value.body.startsWith('👤')
        ? value.body.includes('исключён') || value.body.includes('покинул') ? 'member-removed' : 'member-added'
        : null;
  const notificationText = notificationKind ? value.body.replace(/^(📞|📌|👤)\s*/u, '') : value.body;

  const openMenu = (event: MouseEvent) => {
    event.preventDefault();
    if (!savedMessage) return;
    setMenuPosition({ top: event.clientY, left: event.clientX });
  };

  const reply = () => {
    if (savedMessage) onReply(savedMessage);
    setMenuPosition(null);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(value.body);
    setMenuPosition(null);
  };

  const react = (emoji: string) => {
    if (savedMessage) onToggleReaction(savedMessage.id, emoji);
    setReactionAnchor(null);
    setMenuPosition(null);
  };

  const senderButton = sender ? (
    <button
      type="button"
      className={styles.senderButton}
      onClick={(event) => {
        event.stopPropagation();
        onOpenProfile(sender, event.currentTarget);
      }}
    >
      {sender.displayName}
    </button>
  ) : (
    <Typography component="span" className={styles.sender!}>{value.senderDisplayName}</Typography>
  );

  if (notificationKind) {
    const notificationIcon = notificationKind === 'call'
      ? <Call />
      : notificationKind === 'pin'
        ? <PushPin />
        : notificationKind === 'member-added'
          ? <PersonAddAlt1 />
          : <PersonRemove />;
    return (
      <Box
        id={savedMessage ? `message-${savedMessage.id}` : undefined}
        className={`${styles.notificationRow!} ${styles[notificationKind]!} ${highlighted ? styles.highlighted! : ''}`}
      >
        <Box className={styles.notificationIcon}>{notificationIcon}</Box>
        <Box className={styles.notificationContent}>
          <Box className={styles.notificationLine}>
            {senderButton}
            {pinNotificationTarget ? (
              <button
                type="button"
                className={styles.notificationTarget}
                onClick={() => onJumpToMessage(pinNotificationTarget)}
              >
                {notificationText}
              </button>
            ) : (
              <Typography component="span" className={styles.notificationText!}>{notificationText}</Typography>
            )}
            <Box className={styles.notificationMeta}>{children}</Box>
          </Box>
          {value.replyTo && notificationKind === 'pin' && (
            <button
              type="button"
              className={styles.replyPreview}
              onClick={() => onJumpToMessage(value.replyTo!)}
              aria-label={`Перейти к сообщению ${value.replyTo.senderDisplayName}`}
            >
              <Typography variant="caption" className={styles.replyAuthor!}>{value.replyTo.senderDisplayName}</Typography>
              <Typography variant="body2" noWrap>{value.replyTo.body}</Typography>
            </button>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      id={savedMessage ? `message-${savedMessage.id}` : undefined}
      className={`${styles.row!} ${own && !groupLayout ? styles.ownRow! : ''} ${groupLayout ? styles.groupRow! : ''} ${highlighted ? styles.highlighted! : ''}`}
      onContextMenu={openMenu}
    >
      {sender && (
        <Badge
          overlap="circular"
          variant="dot"
          color={online ? 'success' : 'default'}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          className={`${styles.avatarBadge!} ${online ? styles.onlineBadge! : styles.offlineBadge!}`}
        >
          <UserAvatar user={sender} size={36} />
        </Badge>
      )}

      <Box className={styles.messageColumn}>
        <Paper
          variant="outlined"
          className={`${styles.bubble!} ${own && !groupLayout ? styles.ownBubble! : ''} ${groupLayout ? styles.groupMessage! : ''} ${pending ? styles.pendingBubble! : ''}`}
        >
          {groupLayout ? (
            <Box className={styles.groupHeader}>
              {senderButton}
              <Box className={styles.groupMeta}>{children}</Box>
            </Box>
          ) : (
            !own && senderButton
          )}
          {value.replyTo && (
            <button
              type="button"
              className={styles.replyPreview}
              onClick={() => onJumpToMessage(value.replyTo!)}
              aria-label={`Перейти к сообщению ${value.replyTo.senderDisplayName}`}
            >
              <Typography variant="caption" className={styles.replyAuthor!}>{value.replyTo.senderDisplayName}</Typography>
              <Typography variant="body2" noWrap>{value.replyTo.body}</Typography>
            </button>
          )}
          {value.forwardedFrom && (
            <Box className={styles.forwardPreview}>
              <Forward fontSize="small" />
              <Box className={styles.forwardText}>
                <Typography variant="caption" className={styles.replyAuthor!}>Переслано от {value.forwardedFrom.senderDisplayName}</Typography>
              </Box>
            </Box>
          )}
          {pinNotificationTarget ? (
            <button
              type="button"
              className={styles.pinNotificationLink}
              onClick={() => onJumpToMessage(pinNotificationTarget)}
              aria-label="Перейти к закреплённому сообщению"
            >
              <Typography component="span">{value.body}</Typography>
            </button>
          ) : (
            <MessageBody body={value.body} />
          )}
          {!groupLayout && children}
        </Paper>

        {savedMessage && savedMessage.reactions.length > 0 && (
          <Box className={`${styles.reactions!} ${own && !groupLayout ? styles.ownReactions! : ''}`}>
            {savedMessage.reactions.map((reaction) => (
              <button
                type="button"
                key={reaction.emoji}
                className={`${styles.reaction!} ${reaction.userIds.includes(currentUserId) ? styles.selectedReaction! : ''}`}
                onClick={() => react(reaction.emoji)}
                aria-label={`Реакция ${reaction.emoji}: ${reaction.count}`}
              >
                <span>{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </button>
            ))}
          </Box>
        )}
      </Box>

      {savedMessage && (
        <Box className={styles.actions}>
          {groupLayout && !own && sender && (
            <Tooltip title="Написать лично">
              <IconButton size="small" onClick={() => onWriteDirect(sender.id)} aria-label={`Написать лично ${sender.displayName}`}>
                <ChatBubbleOutline fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Ответить">
            <IconButton size="small" onClick={reply} aria-label="Ответить на сообщение"><Reply fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Добавить реакцию">
            <IconButton size="small" onClick={(event) => setReactionAnchor(event.currentTarget)} aria-label="Добавить реакцию">
              <SentimentSatisfiedAlt fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Другие действия">
            <IconButton size="small" onClick={(event) => setMenuPosition({ top: event.clientY, left: event.clientX })} aria-label="Другие действия">
              <MoreHoriz fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      <Menu
        anchorEl={reactionAnchor}
        open={Boolean(reactionAnchor)}
        onClose={() => setReactionAnchor(null)}
      >
        <Box className={styles.reactionPicker}>
          {REACTIONS.map((emoji) => (
            <IconButton key={emoji} onClick={() => react(emoji)} aria-label={`Поставить реакцию ${emoji}`}>
              <span className={styles.emoji}>{emoji}</span>
            </IconButton>
          ))}
        </Box>
      </Menu>

      <Menu
        className={styles.contextMenu!}
        open={Boolean(menuPosition)}
        onClose={() => setMenuPosition(null)}
        anchorReference="anchorPosition"
        anchorPosition={menuPosition ?? { top: 0, left: 0 }}
      >
        {groupLayout && !own && sender && (
          <MenuItem onClick={() => { setMenuPosition(null); onWriteDirect(sender.id); }}>
            <ChatBubbleOutline fontSize="small" />Написать лично
          </MenuItem>
        )}
        <MenuItem onClick={reply}><Reply fontSize="small" />Ответить</MenuItem>
        <MenuItem onClick={() => { setMenuPosition(null); onForward(savedMessage!); }}>
          <Forward fontSize="small" />Переслать
        </MenuItem>
        <MenuItem onClick={() => { setMenuPosition(null); onTogglePin(savedMessage!.id); }}>
          {savedMessage?.isPinned ? <PushPin fontSize="small" /> : <PushPinOutlined fontSize="small" />}
          {savedMessage?.isPinned ? 'Открепить' : 'Закрепить'}
        </MenuItem>
        {own && (
          <MenuItem onClick={() => { setMenuPosition(null); setReadersOpen(true); }}>
            <VisibilityOutlined fontSize="small" />Кто прочитал ({readBy.length})
          </MenuItem>
        )}
        <MenuItem onClick={() => void copy()}><ContentCopy fontSize="small" />Копировать текст</MenuItem>
        <Box className={styles.contextReactions}>
          <Typography variant="caption">Поставить реакцию</Typography>
          <Box className={styles.reactionPicker}>
            {REACTIONS.map((emoji) => (
              <IconButton key={emoji} size="small" onClick={() => react(emoji)} aria-label={`Поставить реакцию ${emoji}`}>
                <span className={styles.emoji}>{emoji}</span>
              </IconButton>
            ))}
          </Box>
        </Box>
      </Menu>

      <MessageReadersDialog
        open={readersOpen}
        readers={readBy}
        onlineUserIds={onlineUserIds}
        onClose={() => setReadersOpen(false)}
        onWriteDirect={onWriteDirect}
      />
    </Box>
  );
}
