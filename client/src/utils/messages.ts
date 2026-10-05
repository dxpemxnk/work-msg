import type { Message } from '@/types/messenger';

export function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>();
  const byClientId = new Map<string, string>();

  for (const message of [...current, ...incoming]) {
    const previousId = byClientId.get(message.clientMessageId);
    if (previousId && previousId !== message.id) byId.delete(previousId);
    byId.set(message.id, message);
    byClientId.set(message.clientMessageId, message.id);
  }

  return [...byId.values()].sort((left, right) => left.sequence - right.sequence);
}

