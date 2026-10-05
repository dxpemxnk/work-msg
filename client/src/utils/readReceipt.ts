import type { Member } from '@/types/messenger';

export interface ReadReceipt {
  readCount: number;
  recipientCount: number;
  allRead: boolean;
}

export function getReadReceipt(
  sequence: number,
  members: Member[],
  currentUserId: string
): ReadReceipt {
  const recipients = members.filter(({ user, visibleFromSequence }) =>
    user.id !== currentUserId && visibleFromSequence <= sequence
  );
  const readCount = recipients.filter(({ lastReadSequence }) => lastReadSequence >= sequence).length;

  return {
    readCount,
    recipientCount: recipients.length,
    allRead: recipients.length > 0 && readCount === recipients.length,
  };
}

export function readReceiptLabel(receipt: ReadReceipt): string {
  if (receipt.readCount === 0) return 'Доставлено';
  if (receipt.allRead && receipt.recipientCount === 1) return 'Прочитано';
  if (receipt.allRead) return 'Прочитано всеми';
  return `Прочитали ${receipt.readCount} из ${receipt.recipientCount}`;
}
