import { FiberManualRecord } from '@mui/icons-material';
import { Chip } from '@mui/material';

import type { ConnectionState } from '@/types/messenger';

const labels: Record<ConnectionState, string> = {
  connecting: 'Подключение',
  online: 'На связи',
  offline: 'Нет соединения',
  synchronizing: 'Синхронизация',
};

export function ConnectionStatus({ state, onRetry }: { state: ConnectionState; onRetry?: () => void }) {
  const color = state === 'online' ? 'success' : state === 'offline' ? 'error' : 'warning';
  const retryable = state === 'synchronizing' && Boolean(onRetry);
  return (
    <Chip
      size="small"
      color={color}
      variant="outlined"
      icon={<FiberManualRecord />}
      label={labels[state]}
      clickable={Boolean(retryable)}
      onClick={retryable ? onRetry : undefined}
      title={retryable ? 'Повторить синхронизацию' : undefined}
    />
  );
}
