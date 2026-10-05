import { useMemo } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';

import { useCreateDirectMutation, useCreateGroupMutation } from '@services/api/messenger';
import type { Conversation, User } from '@/types/messenger';
import { apiErrorMessage } from '@utils/apiError';
import styles from './index.module.scss';

type DialogKind = 'direct' | 'group';
type FormValues = { userId: string; title: string; memberIds: string[] };

type CreateConversationDialogProps = {
  kind: DialogKind | null;
  users: User[];
  currentUserId: string;
  onClose: () => void;
  onCreated: (conversation: Conversation) => void;
};

export function CreateConversationDialog({ kind, users, currentUserId, onClose, onCreated }: CreateConversationDialogProps) {
  const candidates = useMemo(() => users.filter(({ id }) => id !== currentUserId), [currentUserId, users]);
  const [createDirect, directState] = useCreateDirectMutation();
  const [createGroup, groupState] = useCreateGroupMutation();
  const isGroup = kind === 'group';
  const requestError = directState.error ?? groupState.error;

  const formik = useFormik<FormValues>({
    initialValues: { userId: '', title: '', memberIds: [] },
    enableReinitialize: true,
    validationSchema: isGroup
      ? yup.object({
          title: yup.string().trim().min(1, 'Введите название').max(120, 'Не больше 120 символов').required('Введите название'),
          memberIds: yup.array().of(yup.string().required()).min(1, 'Выберите хотя бы одного участника'),
        })
      : yup.object({ userId: yup.string().required('Выберите пользователя') }),
    onSubmit: async ({ userId, title, memberIds }, helpers) => {
      try {
        const conversation = isGroup
          ? await createGroup({ title: title.trim(), memberIds }).unwrap()
          : await createDirect(userId).unwrap();
        helpers.resetForm();
        onCreated(conversation);
      } catch {
        // RTK Query exposes the error through mutation state below.
      }
    },
  });

  const close = () => {
    formik.resetForm();
    onClose();
  };

  return (
    <Dialog open={kind !== null} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={formik.handleSubmit} className={styles.form}>
        <DialogTitle>{isGroup ? 'Новая группа' : 'Новый личный чат'}</DialogTitle>
        <DialogContent>
          {requestError && <Alert severity="error" className={styles.error!}>{apiErrorMessage(requestError)}</Alert>}
          {isGroup ? (
            <>
              <TextField
                autoFocus
                fullWidth
                margin="dense"
                label="Название группы"
                name="title"
                value={formik.values.title}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={Boolean(formik.touched.title && formik.errors.title)}
                helperText={formik.touched.title && formik.errors.title}
              />
              <FormGroup className={styles.members!}>
                {candidates.map((user) => (
                  <FormControlLabel
                    key={user.id}
                    label={user.displayName}
                    control={
                      <Checkbox
                        checked={formik.values.memberIds.includes(user.id)}
                        onChange={(_, checked) => {
                          const next = checked
                            ? [...formik.values.memberIds, user.id]
                            : formik.values.memberIds.filter((id) => id !== user.id);
                          void formik.setFieldValue('memberIds', next, true);
                        }}
                      />
                    }
                  />
                ))}
              </FormGroup>
              {formik.touched.memberIds && typeof formik.errors.memberIds === 'string' && <Alert severity="warning">{formik.errors.memberIds}</Alert>}
            </>
          ) : (
            <FormControl fullWidth margin="dense" error={Boolean(formik.touched.userId && formik.errors.userId)}>
              <InputLabel id="direct-user-label">Пользователь</InputLabel>
              <Select
                labelId="direct-user-label"
                label="Пользователь"
                name="userId"
                value={formik.values.userId}
                onChange={formik.handleChange}
              >
                {candidates.map((user) => <MenuItem key={user.id} value={user.id}>{user.displayName}</MenuItem>)}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Отмена</Button>
          <Button type="submit" variant="contained" disabled={formik.isSubmitting || directState.isLoading || groupState.isLoading}>
            Создать
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
