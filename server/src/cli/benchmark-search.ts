import { performance } from 'node:perf_hooks';

import Database from 'better-sqlite3';

const options = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [key, value] = argument.replace(/^--/, '').split('=');
    return [key, Number(value)];
  })
) as Record<string, number>;
const messageCount = Number.isFinite(options.messages) ? options.messages! : 100_000;
const iterations = Number.isFinite(options.iterations) ? options.iterations! : 200;

if (messageCount < 1 || iterations < 1) {
  throw new Error('Параметры --messages и --iterations должны быть положительными числами');
}

const database = new Database(':memory:');
database.pragma('journal_mode = MEMORY');
database.pragma('synchronous = OFF');
database.exec(`
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    body TEXT NOT NULL
  );
  CREATE INDEX messages_conversation_sequence_idx
    ON messages(conversation_id, sequence);
`);

const insert = database.prepare(`
  INSERT INTO messages(conversation_id, sequence, body)
  VALUES ('benchmark-conversation', ?, ?)
`);
const seed = database.transaction(() => {
  for (let sequence = 1; sequence <= messageCount; sequence += 1) {
    const marker = sequence % 997 === 0 ? ' Важный проект: готовность 100%_тест.' : '';
    insert.run(sequence, `Сообщение номер ${sequence} для проверки поиска.${marker}`);
  }
});

const seedStartedAt = performance.now();
seed();
const seedDuration = performance.now() - seedStartedAt;

const search = database.prepare(`
  SELECT id, sequence, body
  FROM messages
  WHERE conversation_id = ?
    AND sequence >= ?
    AND body LIKE ? ESCAPE '\\'
  ORDER BY sequence DESC
  LIMIT ?
`);
const queries = ['проект', 'оект', '100%', '_тест', 'нет-такого-текста'];

function escapeLike(query: string): string {
  return query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function percentile(sorted: number[], value: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)]!;
}

function measure(run: (query: string) => unknown[]): { durations: number[]; matches: Map<string, number> } {
  for (const query of queries) run(query);
  const durations: number[] = [];
  const matches = new Map<string, number>();
  for (let index = 0; index < iterations; index += 1) {
    const query = queries[index % queries.length]!;
    const startedAt = performance.now();
    const rows = run(query);
    durations.push(performance.now() - startedAt);
    matches.set(query, rows.length);
  }
  durations.sort((left, right) => left - right);
  return { durations, matches };
}

const round = (value: number): number => Number(value.toFixed(3));
const summarize = ({ durations, matches }: ReturnType<typeof measure>) => ({
  queryMs: {
    p50: round(percentile(durations, 0.5)),
    p95: round(percentile(durations, 0.95)),
    p99: round(percentile(durations, 0.99)),
    max: round(durations.at(-1)!),
  },
  maximumSynchronousEventLoopStallMs: round(durations.at(-1)!),
  matches: Object.fromEntries(matches),
});
const baseline = measure((query) => search.all('benchmark-conversation', 1, `%${escapeLike(query)}%`, 50));
const sqliteVersion = database.prepare('SELECT sqlite_version() AS version').get() as { version: string };
const result = {
  engine: `SQLite ${sqliteVersion.version}`,
  messages: messageCount,
  iterations,
  seedMs: round(seedDuration),
  ...summarize(baseline),
};

console.log(JSON.stringify(result, null, 2));
database.close();
