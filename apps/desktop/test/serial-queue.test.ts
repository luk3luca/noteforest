import { describe, expect, it } from 'vitest';
import { createSerialQueue } from '../src/renderer/src/lib/serial-queue';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('structural command queue', () => {
  it('runs tasks one at a time in enqueue order', async () => {
    const queue = createSerialQueue();
    const events: string[] = [];
    let running = 0;
    let maximum = 0;
    const first = deferred<void>();
    const second = deferred<void>();

    const firstRun = queue.run(async () => {
      running += 1;
      maximum = Math.max(maximum, running);
      events.push('first:start');
      await first.promise;
      events.push('first:end');
      running -= 1;
    });
    const secondRun = queue.run(async () => {
      running += 1;
      maximum = Math.max(maximum, running);
      events.push('second:start');
      await second.promise;
      events.push('second:end');
      running -= 1;
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    first.resolve();
    await firstRun;
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
    second.resolve();
    await Promise.all([firstRun, secondRun]);
    expect(maximum).toBe(1);
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('continues after a failed task and surfaces the failure to its caller', async () => {
    const queue = createSerialQueue();
    const failed = queue.run(async () => {
      throw new Error('rejected command');
    });
    const next = queue.run(async () => 'next');
    await expect(failed).rejects.toThrow('rejected command');
    await expect(next).resolves.toBe('next');
    await expect(queue.idle()).resolves.toBeUndefined();
  });

  it('returns the command result ID to the queued caller', async () => {
    const queue = createSerialQueue();
    let created: string | null = null;
    const outcome = await queue.run(async () => {
      const result = { ok: true, created: { blockIds: ['block-1'] } };
      created = result.created.blockIds[0] ?? null;
      return result;
    });
    expect(created).toBe('block-1');
    expect(outcome.created.blockIds).toEqual(['block-1']);
  });
});
