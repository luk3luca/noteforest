/**
 * One-at-a-time async queue.
 *
 * Structural document commands and content commits must never overlap: the
 * created block ID has to come from the command result, and the editor buffer
 * must be reconciled against one canonical document. This queue is pure and
 * testable; `DocumentRuntime` owns one instance.
 */

export interface SerialQueue {
  /** Run `task` after every previously enqueued task has settled. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Resolve when the current tail settles (never rejects). */
  idle(): Promise<void>;
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve();

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const started = tail.then(task, task);
      tail = started.then(
        () => undefined,
        () => undefined,
      );
      return started;
    },
    idle(): Promise<void> {
      return tail;
    },
  };
}
