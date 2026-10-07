import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Done, DoneAll, PushPin } from '@mui/icons-material';
import { Box, Button, CircularProgress, Divider, Tooltip, Typography } from '@mui/material';

import type { Member, Message, PendingMessage, ReplyPreview, User } from '@/types/messenger';
import { MessageItem } from '@components/MessageItem';
import { formatDay, formatMessageTime } from '@utils/format';
import { useMessageVirtualizer } from '@utils/hooks/useMessageVirtualizer';
import { getReadReceipt, readReceiptLabel } from '@utils/readReceipt';
import styles from './index.module.scss';

type Entry =
  | { kind: 'saved'; value: Message }
  | { kind: 'pending'; value: PendingMessage };

type MeasuredRowProps = {
  children: ReactNode;
  index: number;
  start: number;
  measureRef: (element: Element | null) => void;
};

function MeasuredRow({ children, index, start, measureRef }: MeasuredRowProps) {
  return (
    <Box
      ref={measureRef}
      className={styles.virtualItem}
      data-index={index}
      style={{ '--virtual-start': `${start}px` } as CSSProperties}
    >
      {children}
    </Box>
  );
}

type MessageListProps = {
  messages: Message[];
  pending: PendingMessage[];
  members: Member[];
  currentUserId: string;
  onlineUserIds: Set<string>;
  groupLayout: boolean;
  loading: boolean;
  loadingOlder: boolean;
  loadingNewer: boolean;
  canLoadOlder: boolean;
  canLoadNewer: boolean;
  onLoadOlder: () => void;
  onLoadNewer: () => void;
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
  loadingNewer,
  canLoadOlder,
  canLoadNewer,
  onLoadOlder,
  onLoadNewer,
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
  const highlightTimerRef = useRef<number | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [jumpTargetId, setJumpTargetId] = useState<string | null>(null);
  const entries = useMemo<Entry[]>(
    () => [
      ...messages.map((message) => ({ kind: 'saved' as const, value: message })),
      ...pending.map((message) => ({ kind: 'pending' as const, value: message })),
    ],
    [messages, pending]
  );
  const entryKey = useCallback((entry: Entry) => entry.value.clientMessageId, []);
  const virtualList = useMessageVirtualizer({ items: entries, getKey: entryKey });

  useEffect(() => () => {
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
  }, []);

  const jumpToMessage = useCallback(async (replyTo: Pick<ReplyPreview, 'id' | 'sequence'>) => {
    await onEnsureMessage(replyTo.id, replyTo.sequence);
    setJumpTargetId(replyTo.id);
  }, [onEnsureMessage]);

  useEffect(() => {
    const messageId = jumpTargetId;
    if (!messageId) return;
    const localIndex = entries.findIndex(({ kind, value }) => kind === 'saved' && value.id === messageId);
    if (localIndex < 0) return;

    setJumpTargetId(null);
    virtualList.scrollToIndex(localIndex);
    setHighlightedMessageId(messageId);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedMessageId(null), 2000);
  }, [entries, jumpTargetId, virtualList.scrollToIndex]);

  useEffect(() => {
    if (focusMessage) void jumpToMessage(focusMessage);
  }, [focusMessage, jumpToMessage]);

  if (loading) {
    return <Box className={styles.loading}><CircularProgress /></Box>;
  }

  if (entries.length === 0) {
    return (
      <Box className={styles.empty}>
        <Typography className={styles.emptyText!}>Здесь пока нет сообщений. Начните переписку.</Typography>
      </Box>
    );
  }

  return (
    <Box className={styles.listShell}>
      {canLoadOlder && (
        <Box className={styles.loadOlder}>
          <Button size="small" disabled={loadingOlder} onClick={onLoadOlder}>
            {loadingOlder ? 'Загрузка…' : 'Загрузить предыдущие сообщения'}
          </Button>
        </Box>
      )}
      <Box ref={virtualList.parentRef} className={styles.list} onScroll={virtualList.onScroll}>
        <Box className={styles.virtualCanvas} style={{ height: virtualList.totalSize }}>
          {virtualList.virtualItems.map(({ index, key, start }) => {
          const { kind, value } = entries[index]!;
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
            <MeasuredRow key={key} index={index} start={start} measureRef={virtualList.measureElement}>
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
            </MeasuredRow>
          );
          })}
        </Box>
      </Box>
      {canLoadNewer && (
        <Box className={styles.loadNewer}>
          <Button size="small" disabled={loadingNewer} onClick={onLoadNewer}>
            {loadingNewer ? 'Загрузка…' : 'Загрузить следующие сообщения'}
          </Button>
        </Box>
      )}
    </Box>
  );
}
