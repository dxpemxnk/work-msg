import { describe, expect, it } from 'vitest';

import { messageTextParts } from './linkify';

describe('messageTextParts', () => {
  it('extracts safe web links and keeps punctuation as text', () => {
    expect(messageTextParts('Документ: https://example.com/report?id=5.')).toEqual([
      { kind: 'text', value: 'Документ: ' },
      { kind: 'link', value: 'https://example.com/report?id=5', href: 'https://example.com/report?id=5' },
      { kind: 'text', value: '.' },
    ]);
  });

  it('adds https to www links and ignores executable schemes', () => {
    expect(messageTextParts('www.example.com javascript:alert(1)')).toEqual([
      { kind: 'link', value: 'www.example.com', href: 'https://www.example.com' },
      { kind: 'text', value: ' javascript:alert(1)' },
    ]);
  });

  it('recognizes a bare domain and does not turn an email into a link', () => {
    expect(messageTextParts('Открой ya.ru, но не user@example.com')).toEqual([
      { kind: 'text', value: 'Открой ' },
      { kind: 'link', value: 'ya.ru', href: 'https://ya.ru' },
      { kind: 'text', value: ', но не user@example.com' },
    ]);
  });
});
