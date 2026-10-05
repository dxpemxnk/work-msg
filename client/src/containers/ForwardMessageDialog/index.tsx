import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select } from '@mui/material';

import type { Conversation, Message } from '@/types/messenger';
import { useSendMessageMutation } from '@services/api/messenger';
import { apiErrorMessage } from '@utils/apiError';

type ForwardMessageDialogProps = {
  message: Message | null;
  conversations: Conversation[];
  onClose: () => void;
};

export function ForwardMessageDialog({ message, conversations, onClose }: ForwardMessageDialogProps) {
  const [conversationId, setConversationId] = useState('');
  const [sendMessage, { error, isLoading, reset }] = useSendMessageMutation();

  const close = () => {
    if (isLoading) return;
    setConversationId('');
    reset();
    onClose();
  };

  const forward = async () => {
    if (!message || !conversationId) return;
    try {
      await sendMessage({
        conversationId,
        clientMessageId: crypto.randomUUID(),
        body: message.body,
        forwardedFromMessageId: message.id,
      }).unwrap();
      close();
    } catch {
      // RTK Query exposes the error below.
    }
  };

  return (
    <Dialog open={Boolean(message)} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>Переслать сообщение</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{apiErrorMessage(error)}</Alert>}
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
