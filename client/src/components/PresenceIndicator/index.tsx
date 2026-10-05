import { Box, Typography } from '@mui/material';
import styles from './index.module.scss';

export function PresenceIndicator({ online }: { online: boolean }) {
  return (
    <Box className={styles.indicator} component="span">
      <Box component="span" className={`${styles.dot!} ${online ? styles.online! : styles.offline!}`} />
      <Typography component="span" variant="body2" className={styles.label!}>
        {online ? 'В сети' : 'Не в сети'}
      </Typography>
    </Box>
  );
}
