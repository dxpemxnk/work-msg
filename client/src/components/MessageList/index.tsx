import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Done, DoneAll, PushPin } from '@mui/icons-material';
import { Box, Button, CircularProgress, Divider, Tooltip, Typography } from '@mui/material';

import type { Member, Message, PendingMessage, ReplyPreview, User } from '@/types/messenger';
import { MessageItem } from '@components/MessageItem';
import { formatDay, formatMessageTime } from '@utils/format';
import { getReadReceipt, readReceiptLabel } from '@utils/readReceipt';
import styles from './index.module.scss';

type MessageListProps = {
  messages: Message[];
  pending: PendingMessage[];
  members: Member[];
  currentUserId: string;
  onlineUserIds: Set<string>;
  groupLayout: boolean;
  loading: boolean;
  loadingOlder: boolean;
  canLoadOlder: boolean;
  onLoadOlder: () => void;
  onRetry: (clientMessageId: string) => void;
  onReply: (message: Message) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onWriteDirect: (userId: string) => void;
  onOpenProfile: (user: User, anchorEl: HTMLElement) => void;
  onEnsureMessage: (messageId: string, sequence: number) => Promise<void>;
  focusMessage: { id: string; sequence: number; requestId: number } | null;
  onTogglePin: (messageId: string) => void;
  onForward: (message: Message) => void;
};

export function MessageList({
  messages,
  pending,
  members,
  currentUserId,
  onlineUserIds,
  groupLayout,
  loading,
  loadingOlder,
  canLoadOlder,
  onLoadOlder,
  onRetry,
  onReply,
  onToggleReaction,
  onWriteDirect,
  onOpenProfile,
  onEnsureMessage,
  focusMessage,
  onTogglePin,
  onForward,
}: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const previousListRef = useRef<{ firstKey: string | null; lastKey: string | null; scrollHeight: number }>({
    firstKey: null,
    lastKey: null,
    scrollHeight: 0,
  });
  const wasNearBottomRef = useRef(true);
  const highlightTimerRef = useRef<number | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const entries = useMemo(
    () => [
      ...messages.map((message) => ({ kind: 'saved' as const, value: message })),
      ...pending.map((message) => ({ kind: 'pending' as const, value: message })),
    ],
    [messages, pending]
  );

  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const entryKey = ({ kind, value }: (typeof entries)[number]) => kind === 'saved' ? value.id : value.clientMessageId;
    const firstKey = entries[0] ? entryKey(entries[0]) : null;
    const lastEntry = entries.at(-1);
    const lastKey = lastEntry ? entryKey(lastEntry) : null;
    const previous = previousListRef.current;
    const stillContainsPreviousFirst = previous.firstKey !== null && entries.some((entry) => entryKey(entry) === previous.firstKey);
    const prependedHistory = stillContainsPreviousFirst && firstKey !== previous.firstKey;
    const sameTimeline = previous.lastKey !== null && entries.some((entry) => entryKey(entry) === previous.lastKey);

    if (prependedHistory) {
      element.scrollTop += element.scrollHeight - previous.scrollHeight;
    } else if (!sameTimeline || wasNearBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }

    previousListRef.current = { firstKey, lastKey, scrollHeight: element.scrollHeight };
    wasNearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }, [entries]);

  const trackScrollPosition = useCallback(() => {
    const element = listRef.current;
    if (element) wasNearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }, []);

  useEffect(() => () => {
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
  }, []);

  const jumpToMessage = useCallback(async (replyTo: Pick<ReplyPreview, 'id' | 'sequence'>) => {
    await onEnsureMessage(replyTo.id, replyTo.sequence);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(`message-${replyTo.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedMessageId(replyTo.id);
        if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = window.setTimeout(() => setHighlightedMessageId(null), 2000);
      });
    });
  }, [onEnsureMessage]);

  useEffect(() => {
    if (focusMessage) void jumpToMessage(focusMessage);
  }, [focusMessage, jumpToMessage]);

  if (loading) {
    return <Box className={styles.loading}><CircularProgress /></Box>;
  }

  return (
    <Box ref={listRef} className={styles.list} onScroll={trackScrollPosition}>
      {canLoadOlder && (
        <Box className={styles.loadOlder}>
          <Button size="small" disabled={loadingOlder} onClick={onLoadOlder}>
            {loadingOlder ? 'Загрузка…' : 'Загрузить предыдущие сообщения'}
          </Button>
        </Box>
      )}
      {entries.length === 0 && (
        <Box className={styles.empty}>
          <Typography className={styles.emptyText!}>Здесь пока нет сообщений. Начните переписку.</Typography>
        </Box>
      )}
      <Box className={styles.messages}>
        {entries.map(({ kind, value }, index) => {
          const own = value.senderId === currentUserId;
          const receipt = kind === 'saved' && own
            ? getReadReceipt(value.sequence, members, currentUserId)
            : null;
          const previous = entries[index - 1]?.value;
          const showDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(value.createdAt).toDateString();
          const savedMessage = kind === 'saved' ? value : null;
          const sender = members.find(({ user }) => user.id === value.senderId)?.user ?? savedMessage?.sender;
          const readBy = savedMessage
            ? members
                .filter(({ user, visibleFromSequence, lastReadSequence }) =>
                  user.id !== savedMessage.senderId &&
                  visibleFromSequence <= savedMessage.sequence &&
                  lastReadSequence >= savedMessage.sequence
                )
                .map(({ user }) => user)
            : [];
          return (
            <Box key={value.clientMessageId}>
              {showDay && (
                <Divider className={styles.dayDivider!}><Typography variant="caption">{formatDay(value.createdAt)}</Typography></Divider>
              )}
              <MessageItem
                value={value}
                savedMessage={savedMessage}
                sender={sender}
                own={own}
                currentUserId={currentUserId}
                online={onlineUserIds.has(value.senderId)}
                pending={kind === 'pending'}
                groupLayout={groupLayout}
                highlighted={savedMessage?.id === highlightedMessageId}
                readBy={readBy}
                onlineUserIds={onlineUserIds}
                onReply={onReply}
                onToggleReaction={onToggleReaction}
                onWriteDirect={onWriteDirect}
                onOpenProfile={onOpenProfile}
                onJumpToMessage={(replyTo) => void jumpToMessage(replyTo)}
                onTogglePin={onTogglePin}
                onForward={onForward}
              >
                  <Box className={styles.meta}>
                    <Typography variant="caption" className={styles.time!}>{formatMessageTime(value.createdAt)}</Typography>
                    {savedMessage?.isPinned && (
                      <Tooltip title="Сообщение закреплено" arrow>
                        <Box component="span" className={styles.pinnedMeta}>
                          <PushPin fontSize="inherit" />
                          <Typography variant="caption">Закреплено</Typography>
                        </Box>
                      </Tooltip>
                    )}
                    {kind === 'pending' && (
                      <Button size="small" color={value.status === 'failed' ? 'error' : 'inherit'} onClick={() => value.status === 'failed' && onRetry(value.clientMessageId)} className={styles.retry!}>
                        {value.status === 'failed' ? 'Повторить' : 'Отправка…'}
                      </Button>
                    )}
                    {receipt && (
                      <Tooltip title={readReceiptLabel(receipt)} arrow>
                        <Box component="span" className={styles.receipt}>
                          {receipt.readCount > 0 ? (
                            <DoneAll
                              className={`${styles.receiptIcon!} ${receipt.allRead ? styles.receiptRead! : styles.receiptDisabled!}`}
                            />
                          ) : (
                            <Done className={`${styles.receiptIcon!} ${styles.receiptDisabled!}`} />
                          )}
                        </Box>
                      </Tooltip>
                    )}
                  </Box>
              </MessageItem>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
