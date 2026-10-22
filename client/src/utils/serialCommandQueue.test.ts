import { describe, expect, it } from 'vitest';

import { SerialCommandQueue } from './serialCommandQueue';

type Command = { clientMessageId: string };

describe('SerialCommandQueue', () => {
  it('continues after a rejected command and allows retrying its id', async () => {
    const queue = new SerialCommandQueue<Command, string>();
    const failed = queue.enqueue({ clientMessageId: 'failed' }, () => Promise.reject(new Error('storage failure')));
    await expect(failed).rejects.toThrow('storage failure');
    await expect(queue.enqueue({ clientMessageId: 'next' }, () => Promise.resolve('next'))).resolves.toBe('next');
    await expect(queue.enqueue({ clientMessageId: 'failed' }, () => Promise.resolve('retried'))).resolves.toBe('retried');
  });
  it('executes different commands strictly in enqueue order', async () => {
    const queue = new SerialCommandQueue<Command, string>();
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = queue.enqueue({ clientMessageId: 'first' }, async () => {
      order.push('first:start');
      await firstGate;
      order.push('first:end');
      return 'first';
    });
    const second = queue.enqueue({ clientMessageId: 'second' }, () => {
      order.push('second:start');
      return Promise.resolve('second');
    });

    await Promise.resolve();
    expect(order).toEqual(['first:start']);
    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('deduplicates concurrent runs of the same client message', async () => {
    const queue = new SerialCommandQueue<Command, string>();
    let calls = 0;
    const execute = async () => {
      calls += 1;
      await Promise.resolve();
      return 'sent';
    };

    const first = queue.enqueue({ clientMessageId: 'same' }, execute);
    const duplicate = queue.enqueue({ clientMessageId: 'same' }, execute);

    expect(duplicate).toBe(first);
    await expect(duplicate).resolves.toBe('sent');
    expect(calls).toBe(1);
  });
});
