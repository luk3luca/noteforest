/**
 * Atomic file writes for the Node layer.
 *
 * Temp file in the target directory → write → fsync → rename over the target →
 * best-effort directory fsync. On any failure the temp file is removed and the
 * previous target file is left byte-identical.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface AtomicWriteInfo {
  targetPath: string;
  tempPath: string;
  bytes: number;
}

export interface AtomicWriteHooks {
  /** Called after the temp file is written and flushed, before rename. */
  beforeRename?: (info: AtomicWriteInfo) => void | Promise<void>;
  /** Called after the directory exists, before the temp file is created. */
  beforeWrite?: (info: AtomicWriteInfo) => void | Promise<void>;
}

export interface AtomicWriteOptions {
  hooks?: AtomicWriteHooks;
  /** Fsync the containing directory after rename (default true). */
  fsyncDir?: boolean;
}

export interface AtomicWriteResult {
  targetPath: string;
  tempPath: string;
  bytes: number;
}

export async function writeFileAtomic(
  targetPath: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<AtomicWriteResult> {
  const absoluteTarget = path.resolve(targetPath);
  const directory = path.dirname(absoluteTarget);
  await fs.mkdir(directory, { recursive: true });

  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
  const tempPath = path.join(
    directory,
    `.${path.basename(absoluteTarget)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const info: AtomicWriteInfo = {
    targetPath: absoluteTarget,
    tempPath,
    bytes: buffer.byteLength,
  };

  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    await options.hooks?.beforeWrite?.(info);
    handle = await fs.open(tempPath, 'wx');
    await handle.writeFile(buffer);
    await handle.sync();
    await handle.close();
    handle = null;

    await options.hooks?.beforeRename?.(info);
    await fs.rename(tempPath, absoluteTarget);

    if (options.fsyncDir !== false) {
      try {
        const directoryHandle = await fs.open(directory, 'r');
        try {
          await directoryHandle.sync();
        } finally {
          await directoryHandle.close();
        }
      } catch {
        // Directory fsync is best-effort (not supported on every platform).
      }
    }
    return { targetPath: absoluteTarget, tempPath, bytes: buffer.byteLength };
  } catch (error) {
    if (handle !== null) {
      await handle.close().catch(() => undefined);
    }
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}
