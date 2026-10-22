import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

describe('publisher scaling regression', () => {
  it('keeps SELECT count constant for 1/10/100 members and measures payload preparation', async () => {
    const built = await buildApp(loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:' }));
    try {
      const now = new Date().toISOString();
      const users = Array.from({ length: 100 }, (_, i) => `benchmark-${i}`);
      const insert = built.database.prepare(`INSERT INTO users
        (id, login, display_name, avatar_color, status, created_at, updated_at)
        VALUES (?, ?, ?, '#123456', 'ACTIVE', ?, ?)`);
      for (const id of users) insert.run(id, id, id, now, now);
      const results: { members: number; online: number; selects: number; medianMs: number; payloadBytes: number }[] = [];
      for (const size of [1, 10, 100]) {
        const owner = users[0]!;
        const group = built.repositories.conversations.createGroup(owner, `Benchmark ${size}`, users.slice(1, Math.max(2, size)));
        if (size === 1) built.repositories.conversations.removeMember(group.id, owner, users[1]!);
        const saved = built.services.messages.persist(owner, {
          conversationId: group.id, clientMessageId: randomUUID(), body: 'Benchmark ordinary message',
        });
        for (const online of [...new Set([0, Math.ceil(size * 0.1), size])]) {
          for (const id of users.slice(0, online)) built.io.sockets.adapter.rooms.set(`user:${id}`, new Set([`socket-${id}`]));
          let payloadBytes = 0;
          let deliveries = 0;
          const to = vi.spyOn(built.io, 'to').mockImplementation(() => ({
            emit: (_event: string, payload: unknown) => {
              payloadBytes += Buffer.byteLength(JSON.stringify(payload));
              deliveries += 1;
            },
          }) as unknown as ReturnType<typeof built.io.to>);
          const prepare = vi.spyOn(built.database, 'prepare');
          const times: number[] = [];
          let selects = 0;
          for (let sample = 0; sample < 30; sample += 1) {
            prepare.mockClear();
            payloadBytes = 0;
            deliveries = 0;
            const start = performance.now();
            built.services.messages.publishPersisted(saved);
            times.push(performance.now() - start);
            selects = prepare.mock.calls.filter(([sql]) => /^\s*SELECT/i.test(String(sql))).length;
            expect(selects).toBe(online === 0 ? 1 : 3);
            expect(deliveries).toBe(online);
          }
          times.sort((a, b) => a - b);
          results.push({ members: size, online, selects, medianMs: Number(times[15]!.toFixed(3)), payloadBytes });
          prepare.mockRestore();
          to.mockRestore();
          for (const id of users) built.io.sockets.adapter.rooms.delete(`user:${id}`);
        }
      }
      // Measures real repository/publisher work with simulated online rooms, not network delivery.
      console.table(results);
    } finally { await built.app.close(); }
  });
});
