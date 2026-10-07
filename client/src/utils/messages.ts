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

type RecoverMessagePagesOptions = {
  after: number;
  limit: number;
  isCurrent: () => boolean;
  loadPage: (after: number, limit: number) => Promise<Message[]>;
  acceptPage: (messages: Message[], recoveredThrough: number) => void;
};

export async function recoverMessagePages({
  after,
  limit,
  isCurrent,
  loadPage,
  acceptPage,
}: RecoverMessagePagesOptions): Promise<{ recoveredThrough: number; completed: boolean }> {
  let recoveredThrough = after;
  while (isCurrent()) {
    const page = await loadPage(recoveredThrough, limit);
    if (!isCurrent()) return { recoveredThrough, completed: false };
    const pageEnd = page.at(-1)?.sequence;
    if (pageEnd !== undefined) recoveredThrough = pageEnd;
    acceptPage(page, recoveredThrough);
    if (page.length < limit) return { recoveredThrough, completed: true };
  }
  return { recoveredThrough, completed: false };
}
