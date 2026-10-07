import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select } from '@mui/material';

import type { Conversation, Message } from '@/types/messenger';

type ForwardMessageDialogProps = {
  message: Message | null;
  conversations: Conversation[];
  onClose: () => void;
  onForward: (conversationId: string, message: Message) => Promise<void>;
};

export function ForwardMessageDialog({ message, conversations, onClose, onForward }: ForwardMessageDialogProps) {
  const [conversationId, setConversationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const close = () => {
    setConversationId('');
    setError(null);
    onClose();
  };

  const forward = async () => {
    if (!message || !conversationId) return;
    setIsLoading(true);
    setError(null);
    try {
      await onForward(conversationId, message);
      setConversationId('');
      onClose();
    } catch {
      setError('Не удалось добавить пересылку в локальную очередь');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={Boolean(message)} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>Переслать сообщение</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{error}</Alert>}
        <FormControl fullWidth margin="normal">
          <InputLabel id="forward-conversation-label">Беседа</InputLabel>
          <Select
            labelId="forward-conversation-label"
            label="Беседа"
            value={conversationId}
            onChange={(event) => setConversationId(event.target.value)}
          >
            {conversations.map((conversation) => (
              <MenuItem key={conversation.id} value={conversation.id}>{conversation.displayTitle}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={isLoading}>Отмена</Button>
        <Button variant="contained" onClick={() => void forward()} disabled={!conversationId || isLoading}>Переслать</Button>
      </DialogActions>
    </Dialog>
  );
}
