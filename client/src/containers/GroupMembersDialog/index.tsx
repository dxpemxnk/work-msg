import { useState } from 'react';
import { ChatBubbleOutline, DeleteOutline, PersonAdd } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  MenuItem,
  Select,
} from '@mui/material';

import { UserAvatar } from '@components/UserAvatar';
import { PresenceIndicator } from '@components/PresenceIndicator';
import { useAddMemberMutation, useCreateDirectMutation, useRemoveMemberMutation } from '@services/api/messenger';
import type { Conversation, User } from '@/types/messenger';
import { apiErrorMessage } from '@utils/apiError';
import styles from './index.module.scss';

type GroupMembersDialogProps = {
  conversation: Conversation | null;
  currentUserId: string;
  open: boolean;
  onlineUserIds: ReadonlySet<string>;
  users: User[];
  onClose: () => void;
  onOpenConversation: (conversation: Conversation) => void;
  onConversationUpdated: (conversation: Conversation) => void;
};

export function GroupMembersDialog({
  conversation,
  currentUserId,
  open,
  onlineUserIds,
  users,
  onClose,
  onOpenConversation,
  onConversationUpdated,
}: GroupMembersDialogProps) {
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [changingUserId, setChangingUserId] = useState<string | null>(null);
  const [createDirect, { error: directError, isLoading: directLoading, reset: resetDirect }] = useCreateDirectMutation();
  const [addMember, { error: addError, isLoading: adding, reset: resetAdd }] = useAddMemberMutation();
  const [removeMember, { error: removeError, isLoading: removing, reset: resetRemove }] = useRemoveMemberMutation();
  const busy = directLoading || adding || removing;
  const error = directError ?? addError ?? removeError;

  const close = () => {
    if (busy) return;
    setOpeningUserId(null);
    setSelectedUser(null);
    resetDirect();
    resetAdd();
    resetRemove();
    onClose();
  };

  const invite = async () => {
    if (!conversation || !selectedUser) return;
    setChangingUserId(selectedUser.id);
    try {
      const updated = await addMember({ id: conversation.id, userId: selectedUser.id }).unwrap();
      setSelectedUser(null);
      onConversationUpdated(updated);
    } catch {
      // RTK Query keeps the request error for the Alert above.
    } finally {
      setChangingUserId(null);
    }
  };

  const remove = async (userId: string) => {
    if (!conversation) return;
    setChangingUserId(userId);
    try {
      const updated = await removeMember({ id: conversation.id, userId }).unwrap();
      onConversationUpdated(updated);
    } catch {
      // RTK Query keeps the request error for the Alert above.
    } finally {
      setChangingUserId(null);
    }
  };

  const openDirect = async (userId: string) => {
    setOpeningUserId(userId);
    try {
      const directConversation = await createDirect(userId).unwrap();
      onOpenConversation(directConversation);
      close();
    } catch {
      setOpeningUserId(null);
    }
  };

  const members = [...(conversation?.members ?? [])].sort((left, right) => {
    if (left.role !== right.role) return left.role === 'OWNER' ? -1 : 1;
    return left.user.displayName.localeCompare(right.user.displayName, 'ru');
  });
  const memberIds = new Set(members.map(({ user }) => user.id));
  const availableUsers = users.filter(({ id, status }) => status === 'ACTIVE' && !memberIds.has(id));
  const isOwner = conversation?.role === 'OWNER';

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>
        Участники
        {conversation && ` — ${conversation.displayTitle}`}
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" className={styles.error!}>{apiErrorMessage(error)}</Alert>}
        {isOwner && (
          <Box className={styles.invite}>
            <FormControl fullWidth size="small">
              <InputLabel id="invite-user-label">Пригласить пользователя</InputLabel>
              <Select
                labelId="invite-user-label"
                label="Пригласить пользователя"
                value={selectedUser?.id ?? ''}
                onChange={(event) => {
                  setSelectedUser(availableUsers.find(({ id }) => id === event.target.value) ?? null);
                }}
              >
                {availableUsers.map((user) => (
                  <MenuItem key={user.id} value={user.id}>{user.displayName} (@{user.login})</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={adding ? <CircularProgress size={16} color="inherit" /> : <PersonAdd />}
              disabled={!selectedUser || busy}
              onClick={() => void invite()}
            >
              Добавить
            </Button>
          </Box>
        )}
        <List disablePadding>
          {members.map(({ user, role }) => {
            const isCurrentUser = user.id === currentUserId;
            const isOpening = openingUserId === user.id;

            return (
              <ListItem
                key={user.id}
                divider
                disableGutters
                secondaryAction={
                  isCurrentUser ? (
                    <Chip label="Вы" size="small" />
                  ) : (
                    <Box className={styles.memberActions}>
                      <Button
                        size="small"
                        startIcon={isOpening ? <CircularProgress size={16} /> : <ChatBubbleOutline />}
                        disabled={busy}
                        onClick={() => void openDirect(user.id)}
                      >
                        Написать
                      </Button>
                      {isOwner && role !== 'OWNER' && (
                        <Button
                          size="small"
                          color="error"
                          startIcon={removing && changingUserId === user.id ? <CircularProgress size={16} color="inherit" /> : <DeleteOutline />}
                          disabled={busy}
                          onClick={() => void remove(user.id)}
                        >
                          Удалить
                        </Button>
                      )}
                    </Box>
                  )
                }
              >
                <ListItemAvatar>
                  <UserAvatar user={user} size={40} />
                </ListItemAvatar>
                <ListItemText
                  primary={user.displayName}
                  secondary={
                    <Box className={styles.memberDetails} component="span">
                      <Box component="span">@{user.login}</Box>
                      {role === 'OWNER' && <Chip label="Владелец" size="small" color="primary" variant="outlined" />}
                      {!isCurrentUser && <PresenceIndicator online={onlineUserIds.has(user.id)} />}
                    </Box>
                  }
                  secondaryTypographyProps={{ component: 'div' }}
                  className={styles.memberText!}
                />
              </ListItem>
            );
          })}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}
