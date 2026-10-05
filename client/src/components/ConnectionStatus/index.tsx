import { FiberManualRecord } from '@mui/icons-material';
import { Chip } from '@mui/material';

import type { ConnectionState } from '@/types/messenger';

const labels: Record<ConnectionState, string> = {
  connecting: 'Подключение',
  online: 'На связи',
  offline: 'Нет соединения',
  synchronizing: 'Синхронизация',
};

export function ConnectionStatus({ state }: { state: ConnectionState }) {
  const color = state === 'online' ? 'success' : state === 'offline' ? 'error' : 'warning';
  return <Chip size="small" color={color} variant="outlined" icon={<FiberManualRecord />} label={labels[state]} />;
}
