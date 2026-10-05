import { useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';

import { DevLogin } from '@containers/DevLogin';
import { useLazyGetMeQuery } from '@services/api/messenger';
import type { User } from '@/types/messenger';
import { MessengerPage } from '@pages/Messenger';
import styles from './App.module.scss';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [getMe, { isLoading }] = useLazyGetMeQuery();
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    void getMe()
      .unwrap()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null))
      .finally(() => setBootstrapped(true));
  }, [getMe]);

  if (!bootstrapped || isLoading) {
    return (
      <Box className={styles.loader}>
        <CircularProgress aria-label="Загрузка мессенджера" />
      </Box>
    );
  }

  return currentUser ? (
    <MessengerPage currentUser={currentUser} onUserChange={setCurrentUser} />
  ) : (
    <DevLogin onLogin={setCurrentUser} />
  );
}
