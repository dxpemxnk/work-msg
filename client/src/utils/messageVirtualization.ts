export type MessageScrollSnapshot = {
  firstKey: string | undefined;
  lastKey: string | undefined;
  anchorKey: string | undefined;
  offsetWithinAnchor: number;
  nearBottom: boolean;
};

export function resolveMessageListUpdate(
  previous: MessageScrollSnapshot,
  nextFirstKey: string | undefined,
  nextLastKey: string | undefined
): 'follow-end' | 'preserve-anchor' | 'none' {
  if (previous.lastKey !== nextLastKey && previous.nearBottom) return 'follow-end';
  if (previous.firstKey !== nextFirstKey && previous.anchorKey !== undefined) return 'preserve-anchor';
  return 'none';
}
