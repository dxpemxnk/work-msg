import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Typography } from '@mui/material';

import { UserAvatar } from '@components/UserAvatar';
import { useCreateDevSessionMutation, useGetDevUsersQuery } from '@services/api/messenger';
import type { User } from '@/types/messenger';
import { apiErrorMessage } from '@utils/apiError';
import styles from './index.module.scss';

export function DevLogin({ onLogin }: { onLogin: (user: User) => void }) {
  const { data: users = [], isLoading, error } = useGetDevUsersQuery();
  const [login, loginState] = useCreateDevSessionMutation();
  const [selectedId, setSelectedId] = useState<string>();

  const handleLogin = async (user: User) => {
    setSelectedId(user.id);
    try {
      onLogin(await login(user.id).unwrap());
    } finally {
      setSelectedId(undefined);
    }
  };

  return (
    <Box className={styles.page}>
      <Paper className={styles.card!}>
        <Typography variant="h4" className={styles.title!}>Мессенджер</Typography>
        <Typography className={styles.description!}>
          Локальный режим. Выберите тестового пользователя.
        </Typography>
        {error && <Alert severity="error" className={styles.error!}>{apiErrorMessage(error)}</Alert>}
        {loginState.error && <Alert severity="error" className={styles.error!}>{apiErrorMessage(loginState.error)}</Alert>}
        {isLoading ? (
          <Box className={styles.loading}><CircularProgress /></Box>
        ) : (
          <Box className={styles.users}>
            {users.map((user) => (
              <Button
                key={user.id}
                variant="outlined"
                size="large"
                disabled={loginState.isLoading}
                onClick={() => void handleLogin(user)}
                className={styles.userButton!}
              >
                <UserAvatar user={user} />
                <Box className={styles.userText}>
                  <Typography className={styles.userName!}>{user.displayName}</Typography>
                  <Typography variant="caption" color="text.secondary">{user.login}</Typography>
                </Box>
                {selectedId === user.id && <CircularProgress size={20} />}
              </Button>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
