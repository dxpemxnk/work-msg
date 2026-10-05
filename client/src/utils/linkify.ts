export type MessageTextPart =
  | { kind: 'text'; value: string }
  | { kind: 'link'; value: string; href: string };

const linkPattern =
  /https?:\/\/[^\s<]+|www\.[^\s<]+|(?<![@\p{L}\p{N}_-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[a-zа-я]{2,63}(?::\d{2,5})?(?:\/[^\s<]*)?/giu;
const trailingPunctuationPattern = /[.,!?;:)}\]]+$/u;

export function messageTextParts(text: string): MessageTextPart[] {
  const parts: MessageTextPart[] = [];
  let cursor = 0;

  for (const match of text.matchAll(linkPattern)) {
    const index = match.index;
    const rawLink = match[0];
    if (index > cursor) parts.push({ kind: 'text', value: text.slice(cursor, index) });

    const punctuation = rawLink.match(trailingPunctuationPattern)?.[0] ?? '';
    const value = punctuation ? rawLink.slice(0, -punctuation.length) : rawLink;
    const href = /^https?:\/\//iu.test(value) ? value : `https://${value}`;

    if (value) parts.push({ kind: 'link', value, href });
    if (punctuation) parts.push({ kind: 'text', value: punctuation });
    cursor = index + rawLink.length;
  }

  if (cursor < text.length) parts.push({ kind: 'text', value: text.slice(cursor) });
  return parts.length > 0 ? parts : [{ kind: 'text', value: text }];
}
