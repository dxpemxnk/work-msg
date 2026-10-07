import { useEffect, useMemo, useRef, useState } from 'react';
import { AddComment, ArrowBack, Call, GroupAdd, Logout, PeopleAltOutlined, PushPinOutlined, Search, Videocam } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';

import { ConnectionStatus } from '@components/ConnectionStatus';
import { ConversationList } from '@components/ConversationList';
import { ConversationDetailsPanel } from '@components/ConversationDetailsPanel';
import { ConversationSearch } from '@components/ConversationSearch';
import { MessageComposer } from '@components/MessageComposer';
import { MessageList } from '@components/MessageList';
import { PresenceIndicator } from '@components/PresenceIndicator';
import { UserAvatar } from '@components/UserAvatar';
import { UserProfilePopover } from '@components/UserProfilePopover';
import { CreateConversationDialog } from '@containers/CreateConversationDialog';
import { CallDialog } from '@containers/CallDialog';
import { GroupMembersDialog } from '@containers/GroupMembersDialog';
import { GroupCallDialog } from '@containers/GroupCallDialog';
import { ForwardMessageDialog } from '@containers/ForwardMessageDialog';
import { PinnedMessagesDialog } from '@containers/PinnedMessagesDialog';
import { useCreateDirectMutation, useDeleteSessionMutation, useGetPinnedMessagesQuery } from '@services/api/messenger';
import type { Message, User } from '@/types/messenger';
import { apiErrorMessage } from '@utils/apiError';
import { useMessenger } from '@utils/hooks/useMessenger';
import { useDirectCall } from '@utils/hooks/useDirectCall';
import { useGroupCall } from '@utils/hooks/useGroupCall';
import styles from './index.module.scss';

type DialogKind = 'direct' | 'group' | null;

export function MessengerWorkspace({ currentUser, onUserChange }: { currentUser: User; onUserChange: (user: User | null) => void }) {
  const messenger = useMessenger(currentUser);
  const call = useDirectCall({ socket: messenger.socket, currentUser });
  const groupCall = useGroupCall({ socket: messenger.socket, currentUser });
  const [dialogKind, setDialogKind] = useState<DialogKind>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [focusMessage, setFocusMessage] = useState<{ id: string; sequence: number; requestId: number } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [pinnedAnchorEl, setPinnedAnchorEl] = useState<HTMLElement | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [profileAnchorEl, setProfileAnchorEl] = useState<HTMLElement | null>(null);
  const focusRequestRef = useRef(0);
  const [logout] = useDeleteSessionMutation();
  const [createDirect] = useCreateDirectMutation();
  const { data: pinnedMessages = [] } = useGetPinnedMessagesQuery(
    messenger.selectedConversation?.id ?? '',
    { skip: !messenger.selectedConversation }
  );

  const directPeer = useMemo(
    () => messenger.selectedConversation?.type === 'DIRECT'
      ? messenger.selectedConversation.members.find(({ user }) => user.id !== currentUser.id)?.user ?? null
      : null,
    [currentUser.id, messenger.selectedConversation]
  );

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru');
    if (!query) return messenger.conversations;
    return messenger.conversations.filter(({ displayTitle, lastMessage }) =>
      `${displayTitle} ${lastMessage?.body ?? ''}`.toLocaleLowerCase('ru').includes(query)
    );
  }, [messenger.conversations, search]);

  const directPeerOnline = Boolean(directPeer && messenger.onlineUserIds.has(directPeer.id));
  const callDisabled = !directPeerOnline || messenger.connection !== 'online' || Boolean(call.session) || Boolean(groupCall.session);
  const groupCallDisabled = messenger.connection !== 'online' || Boolean(call.session) || Boolean(groupCall.session);

  useEffect(() => {
    setReplyingTo(null);
    setFocusMessage(null);
    setDetailsOpen(true);
    setPinnedAnchorEl(null);
    setForwardingMessage(null);
    setProfileUser(null);
    setProfileAnchorEl(null);
  }, [messenger.selectedId]);

  const handleLogout = async () => {
    try {
      await logout().unwrap();
    } finally {
      onUserChange(null);
    }
  };

  const openDirectFromMessage = async (userId: string) => {
    try {
      const conversation = await createDirect(userId).unwrap();
      messenger.openCreatedConversation(conversation);
    } catch (requestError) {
      messenger.setError(apiErrorMessage(requestError));
    }
  };

  const callUser = async (userId: string) => {
    try {
      const conversation = await createDirect(userId).unwrap();
      messenger.openCreatedConversation(conversation);
      await call.startCall(conversation, 'audio');
    } catch (requestError) {
      messenger.setError(apiErrorMessage(requestError));
    }
  };

  const focusFoundMessage = (message: Message) => {
    focusRequestRef.current += 1;
    setFocusMessage({ id: message.id, sequence: message.sequence, requestId: focusRequestRef.current });
  };

  return (
    <Box className={styles.workspace}>
      <Paper
        square
        className={`${styles.sidebar!} ${messenger.selectedConversation ? styles.sidebarHidden! : ''}`}
      >
        <Box className={styles.sidebarHeader}>
          <Typography variant="h5" className={styles.brand!}>Экспертиза</Typography>
          <Typography variant="body2" className={styles.subtitle!}>Корпоративный мессенджер</Typography>
          <Box className={styles.actions}>
            <Button fullWidth variant="contained" startIcon={<AddComment />} onClick={() => setDialogKind('direct')}>Новый чат</Button>
            <IconButton color="primary" onClick={() => setDialogKind('group')} aria-label="Создать группу"><GroupAdd /></IconButton>
          </Box>
          <TextField
            fullWidth
            size="small"
            placeholder="Поиск"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={styles.search!}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
          />
        </Box>
        <Divider />
        <Box className={styles.conversationArea}>
          <ConversationList conversations={filteredConversations} selectedId={messenger.selectedId} onSelect={(conversation) => void messenger.selectConversation(conversation)} />
        </Box>
        <Divider />
        <Box className={styles.profile}>
          <Box className={styles.profileRow}>
            <UserAvatar user={currentUser} size={38} />
            <Box className={styles.profileText}>
              <Typography className={styles.profileName!} noWrap>{currentUser.displayName}</Typography>
              <ConnectionStatus state={messenger.connection} />
            </Box>
            <IconButton size="small" onClick={() => void handleLogout()} aria-label="Сменить пользователя"><Logout /></IconButton>
          </Box>
        </Box>
      </Paper>

      <Paper
        square
        className={styles.content!}
      >
        {messenger.selectedConversation ? (
          <>
            <Box className={styles.contentHeader}>
              <IconButton className={styles.backButton!} onClick={messenger.closeConversation} aria-label="Назад к беседам">
                <ArrowBack />
              </IconButton>
              <Box>
                <Typography variant="h6" className={styles.conversationTitle!}>{messenger.selectedConversation.displayTitle}</Typography>
                {messenger.selectedConversation.type === 'GROUP' ? (
                  <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    aria-label="Показать участников группы"
                    onClick={() => setMembersOpen(true)}
                    className={styles.membersButton!}
                  >
                    {messenger.selectedConversation.members.length} участников
                  </Button>
                ) : (
                  <PresenceIndicator online={directPeerOnline} />
                )}
              </Box>
              {messenger.selectedConversation.type === 'DIRECT' && (
                <ConversationSearch
                  key={messenger.selectedConversation.id}
                  onSearch={messenger.searchConversationMessages}
                  onSelect={focusFoundMessage}
                />
              )}
              <Box className={styles.headerActions}>
                {messenger.selectedConversation.type === 'GROUP' && (
                  <IconButton
                    color={detailsOpen ? 'primary' : 'default'}
                    onClick={() => setDetailsOpen((open) => !open)}
                    aria-label={detailsOpen ? 'Скрыть участников' : 'Показать участников'}
                  >
                    <PeopleAltOutlined />
                  </IconButton>
                )}
                <IconButton
                  color={pinnedMessages.length > 0 ? 'primary' : 'default'}
                  onClick={(event) => setPinnedAnchorEl(event.currentTarget)}
                  aria-label="Закреплённые сообщения"
                >
                  <PushPinOutlined />
                </IconButton>
                {messenger.selectedConversation.type === 'DIRECT' && (
                  <Box className={styles.callActions}>
                  <IconButton
                    color="primary"
                    disabled={callDisabled}
                    onClick={() => void call.startCall(messenger.selectedConversation!, 'audio')}
                    aria-label="Начать аудиозвонок"
                  >
                    <Call />
                  </IconButton>
                  <IconButton
                    color="primary"
                    disabled={callDisabled}
                    onClick={() => void call.startCall(messenger.selectedConversation!, 'video')}
                    aria-label="Начать видеозвонок"
                  >
                    <Videocam />
                  </IconButton>
                  </Box>
                )}
                {messenger.selectedConversation.type === 'GROUP' && (
                  <Box className={styles.callActions}>
                    <IconButton
                      color="primary"
                      disabled={groupCallDisabled}
                      onClick={() => void groupCall.joinCall(messenger.selectedConversation!, 'audio')}
                      aria-label="Начать групповой аудиозвонок"
                    >
                      <Call />
                    </IconButton>
                    <IconButton
                      color="primary"
                      disabled={groupCallDisabled}
                      onClick={() => void groupCall.joinCall(messenger.selectedConversation!, 'video')}
                      aria-label="Начать групповой видеозвонок"
                    >
                      <Videocam />
                    </IconButton>
                  </Box>
                )}
              </Box>
            </Box>
            <Box className={styles.conversationShell}>
              <Box className={styles.chatColumn}>
                <MessageList
                  messages={messenger.messages}
                  pending={messenger.pending}
                  members={messenger.selectedConversation.members}
                  currentUserId={currentUser.id}
                  onlineUserIds={messenger.onlineUserIds}
                  groupLayout={messenger.selectedConversation.type === 'GROUP'}
                  loading={messenger.historyLoading}
                  loadingOlder={messenger.olderLoading}
                  canLoadOlder={messenger.hasOlder}
                  onLoadOlder={() => void messenger.loadOlder()}
                  onRetry={(id) => void messenger.retryMessage(id)}
                  onReply={setReplyingTo}
                  onToggleReaction={(messageId, emoji) => void messenger.toggleReaction(messageId, emoji)}
                  onWriteDirect={(userId) => void openDirectFromMessage(userId)}
                  onOpenProfile={(user, anchorEl) => {
                    setProfileUser(user);
                    setProfileAnchorEl(anchorEl);
                  }}
                  onEnsureMessage={messenger.ensureMessage}
                  focusMessage={focusMessage}
                  onTogglePin={(messageId) => void messenger.togglePin(messageId)}
                  onForward={setForwardingMessage}
                />
                <MessageComposer
                  disabled={messenger.connection !== 'online'}
                  replyTo={replyingTo}
                  onCancelReply={() => setReplyingTo(null)}
                  onSend={(body) => {
                    void messenger.sendMessage(body, replyingTo ?? undefined);
                    setReplyingTo(null);
                  }}
                />
              </Box>
              {messenger.selectedConversation.type === 'GROUP' && detailsOpen && (
                <ConversationDetailsPanel
                  conversation={messenger.selectedConversation}
                  currentUserId={currentUser.id}
                  onlineUserIds={messenger.onlineUserIds}
                  onSearch={messenger.searchConversationMessages}
                  onSelectMessage={focusFoundMessage}
                  onOpenProfile={(user, anchorEl) => {
                    setProfileUser(user);
                    setProfileAnchorEl(anchorEl);
                  }}
                  onManageMembers={() => setMembersOpen(true)}
                />
              )}
            </Box>
          </>
        ) : (
          <Box className={styles.emptyContent}>
            <Box className={styles.emptyText}>
              <Typography variant="h5" className={styles.emptyTitle!}>Выберите беседу</Typography>
              <Typography className={styles.emptyDescription!}>Или создайте новый личный чат или группу.</Typography>
            </Box>
          </Box>
        )}
      </Paper>

      <CreateConversationDialog
        kind={dialogKind}
        users={messenger.users}
        currentUserId={currentUser.id}
        onClose={() => setDialogKind(null)}
        onCreated={(conversation) => {
          setDialogKind(null);
          messenger.openCreatedConversation(conversation);
        }}
      />
      <GroupMembersDialog
        conversation={
          messenger.selectedConversation?.type === 'GROUP'
            ? messenger.selectedConversation
            : null
        }
        currentUserId={currentUser.id}
        onlineUserIds={messenger.onlineUserIds}
        users={messenger.users}
        open={membersOpen && messenger.selectedConversation?.type === 'GROUP'}
        onClose={() => setMembersOpen(false)}
        onOpenConversation={(conversation) => {
          setMembersOpen(false);
          messenger.openCreatedConversation(conversation);
        }}
        onConversationUpdated={(conversation) => messenger.openCreatedConversation(conversation)}
      />
      <PinnedMessagesDialog
        conversationId={messenger.selectedConversation?.id ?? null}
        anchorEl={pinnedAnchorEl}
        open={Boolean(pinnedAnchorEl)}
        onClose={() => setPinnedAnchorEl(null)}
        onSelect={focusFoundMessage}
        onTogglePin={(messageId) => void messenger.togglePin(messageId)}
      />
      <ForwardMessageDialog
        message={forwardingMessage}
        conversations={messenger.conversations}
        onClose={() => setForwardingMessage(null)}
        onForward={messenger.forwardMessage}
      />
      <UserProfilePopover
        user={profileUser}
        anchorEl={profileAnchorEl}
        online={Boolean(profileUser && messenger.onlineUserIds.has(profileUser.id))}
        own={profileUser?.id === currentUser.id}
        onClose={() => {
          setProfileUser(null);
          setProfileAnchorEl(null);
        }}
        onWrite={(userId) => void openDirectFromMessage(userId)}
        onCall={(userId) => void callUser(userId)}
      />
      <CallDialog
        session={call.session}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        muted={call.muted}
        cameraOff={call.cameraOff}
        onAccept={() => void call.acceptCall()}
        onReject={call.rejectCall}
        onEnd={call.endCall}
        onToggleMute={call.toggleMute}
        onToggleCamera={call.toggleCamera}
      />
      <GroupCallDialog
        session={groupCall.session}
        currentUser={currentUser}
        localStream={groupCall.localStream}
        remoteStreams={groupCall.remoteStreams}
        muted={groupCall.muted}
        cameraOff={groupCall.cameraOff}
        onLeave={groupCall.leaveCall}
        onToggleMute={groupCall.toggleMute}
        onToggleCamera={groupCall.toggleCamera}
      />
      <Snackbar open={Boolean(messenger.error)} autoHideDuration={5000} onClose={() => messenger.setError(null)}>
        <Alert severity="error" onClose={() => messenger.setError(null)}>{messenger.error}</Alert>
      </Snackbar>
      <Snackbar open={Boolean(call.notice)} autoHideDuration={5000} onClose={() => call.setNotice(null)}>
        <Alert severity="info" onClose={() => call.setNotice(null)}>{call.notice}</Alert>
      </Snackbar>
      <Snackbar open={Boolean(groupCall.notice)} autoHideDuration={5000} onClose={() => groupCall.setNotice(null)}>
        <Alert severity="info" onClose={() => groupCall.setNotice(null)}>{groupCall.notice}</Alert>
      </Snackbar>
      <Snackbar
        open={Boolean(groupCall.availableCall && !groupCall.session)}
        message={groupCall.availableCall
          ? `${groupCall.availableCall.user.displayName} начал(а) групповой ${groupCall.availableCall.mode === 'video' ? 'видеозвонок' : 'аудиозвонок'}`
          : ''}
        action={groupCall.availableCall && messenger.selectedConversation?.id === groupCall.availableCall.conversationId
          ? (
              <Button
                color="inherit"
                onClick={() => void groupCall.joinCall(messenger.selectedConversation!, groupCall.availableCall!.mode)}
              >
                Войти
              </Button>
            )
          : undefined}
      />
    </Box>
  );
}
