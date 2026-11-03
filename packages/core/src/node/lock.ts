/**
 * Single-writer lock file per document package (Node-only).
 *
 * A lock lives in app support, keyed by the package's absolute path, and names
 * PID, host, session, and heartbeat. Concurrent readers never take the lock.
 * A stale lock (dead process on the same host, or heartbeat older than the TTL)
 * is never stolen automatically: `breakStale` must be explicit.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic } from './atomic.js';
import { defaultAppSupportDir, locksDir, sha256Hex } from './paths.js';

export const LOCK_FILE_VERSION = 1;
export const DEFAULT_LOCK_STALE_AFTER_MS = 5 * 60 * 1000;

export interface LockRecord {
  version: number;
  documentPath: string;
  documentId?: string;
  pid: number;
  host: string;
  sessionId: string;
  token: string;
  acquiredAt: string;
  heartbeatAt: string;
}

export interface LockHandle {
  readonly path: string;
  readonly record: LockRecord;
  /** Refresh heartbeatAt. Throws if the lock was lost. */
  refresh(): Promise<LockRecord>;
  /** Release only if this session still owns the lock. */
  release(): Promise<boolean>;
  /** True when the lock file still belongs to this session. */
  isHeld(): Promise<boolean>;
}

export interface LockFailure {
  ok: false;
  reason: 'locked' | 'stale-lock';
  message: string;
  lockPath: string;
  existing: LockRecord | null;
  corrupt: boolean;
}

export interface LockSuccess {
  ok: true;
  handle: LockHandle;
}

export type AcquireLockResult = LockSuccess | LockFailure;

export interface AcquireLockOptions {
  appSupportDir?: string;
  lockDir?: string;
  documentId?: string;
  staleAfterMs?: number;
  breakStale?: boolean;
  now?: () => number;
  hostname?: string;
  pid?: number;
  sessionId?: string;
}

export function lockPathForPackage(packagePath: string, appSupportDir?: string): string {
  const directory = locksDir(appSupportDir ?? defaultAppSupportDir());
  return path.join(directory, `${sha256Hex(path.resolve(packagePath))}.lock`);
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

export function isLockStale(record: LockRecord, options: AcquireLockOptions = {}): boolean {
  const now = options.now?.() ?? Date.now();
  const hostname = options.hostname ?? os.hostname();
  const heartbeat = Date.parse(record.heartbeatAt);
  if (!Number.isFinite(heartbeat)) return true;
  if (record.host === hostname && !isProcessAlive(record.pid)) return true;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_LOCK_STALE_AFTER_MS;
  return now - heartbeat > staleAfterMs;
}

interface ReadLockResult {
  record: LockRecord | null;
  corrupt: boolean;
}

async function readLockFile(lockPath: string): Promise<ReadLockResult> {
  let text: string;
  try {
    text = await fs.readFile(lockPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { record: null, corrupt: false };
    }
    throw error;
  }
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    const record: LockRecord = {
      version: typeof value['version'] === 'number' ? value['version'] : 0,
      documentPath: typeof value['documentPath'] === 'string' ? value['documentPath'] : '',
      pid: typeof value['pid'] === 'number' ? value['pid'] : 0,
      host: typeof value['host'] === 'string' ? value['host'] : '',
      sessionId: typeof value['sessionId'] === 'string' ? value['sessionId'] : '',
      token: typeof value['token'] === 'string' ? value['token'] : '',
      acquiredAt: typeof value['acquiredAt'] === 'string' ? value['acquiredAt'] : '',
      heartbeatAt: typeof value['heartbeatAt'] === 'string' ? value['heartbeatAt'] : '',
    };
    if (typeof value['documentId'] === 'string') record.documentId = value['documentId'];
    const valid =
      record.version === LOCK_FILE_VERSION &&
      record.documentPath.length > 0 &&
      record.pid > 0 &&
      record.host.length > 0 &&
      record.token.length > 0 &&
      !Number.isNaN(Date.parse(record.acquiredAt)) &&
      !Number.isNaN(Date.parse(record.heartbeatAt));
    return valid ? { record, corrupt: false } : { record: null, corrupt: true };
  } catch {
    return { record: null, corrupt: true };
  }
}

function createHandle(lockPath: string, record: LockRecord): LockHandle {
  return {
    path: lockPath,
    record,
    async refresh(): Promise<LockRecord> {
      const current = await readLockFile(lockPath);
      if (current.record === null || current.record.token !== record.token) {
        throw new Error('lock lost: lock file no longer belongs to this session');
      }
      const updated: LockRecord = {
        ...record,
        heartbeatAt: new Date().toISOString(),
      };
      await writeFileAtomic(lockPath, `${JSON.stringify(updated, null, 2)}\n`);
      record.heartbeatAt = updated.heartbeatAt;
      return record;
    },
    async release(): Promise<boolean> {
      const current = await readLockFile(lockPath);
      if (current.record === null || current.record.token !== record.token) return false;
      try {
        await fs.unlink(lockPath);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ENOENT';
      }
    },
    async isHeld(): Promise<boolean> {
      const current = await readLockFile(lockPath);
      return current.record !== null && current.record.token === record.token;
    },
  };
}

/**
 * Acquire the single-writer lock.
 *
 * If a lock exists and is live, returns `locked`. If it is stale or corrupt,
 * returns `stale-lock` unless `breakStale: true` was passed explicitly.
 */
export async function acquireDocumentLock(
  packagePath: string,
  options: AcquireLockOptions = {},
): Promise<AcquireLockResult> {
  const absolutePackage = path.resolve(packagePath);
  const lockPath = options.lockDir
    ? path.join(options.lockDir, `${sha256Hex(absolutePackage)}.lock`)
    : lockPathForPackage(absolutePackage, options.appSupportDir);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await readLockFile(lockPath);
    if (existing.record !== null || existing.corrupt) {
      const stale =
        existing.record !== null
          ? isLockStale(existing.record, options)
          : true;
      if (stale) {
        if (options.breakStale !== true) {
          return {
            ok: false,
            reason: 'stale-lock',
            message: existing.corrupt
              ? 'lock file is corrupt; stale lock recovery requires explicit confirmation'
              : 'stale lock file found; stale lock recovery requires explicit confirmation',
            lockPath,
            existing: existing.record,
            corrupt: existing.corrupt,
          };
        }
        await fs.unlink(lockPath).catch(() => undefined);
      } else {
        return {
          ok: false,
          reason: 'locked',
          message: 'document is already open for writing in another session',
          lockPath,
          existing: existing.record,
          corrupt: false,
        };
      }
    }

    const now = new Date(options.now?.() ?? Date.now()).toISOString();
    const record: LockRecord = {
      version: LOCK_FILE_VERSION,
      documentPath: absolutePackage,
      pid: options.pid ?? process.pid,
      host: options.hostname ?? os.hostname(),
      sessionId: options.sessionId ?? randomUUID(),
      token: randomUUID(),
      acquiredAt: now,
      heartbeatAt: now,
    };
    if (options.documentId !== undefined) record.documentId = options.documentId;

    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`);
      await handle.sync();
      await handle.close();
      handle = null;
      return { ok: true, handle: createHandle(lockPath, record) };
    } catch (error) {
      if (handle !== null) await handle.close().catch(() => undefined);
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Another process won the race; loop and report its lock.
    }
  }

  const existing = await readLockFile(lockPath);
  return {
    ok: false,
    reason: existing.record !== null && isLockStale(existing.record, options) ? 'stale-lock' : 'locked',
    message: 'could not acquire document lock',
    lockPath,
    existing: existing.record,
    corrupt: existing.corrupt,
  };
}

/** Read a lock without acquiring it (diagnostics). */
export async function readDocumentLock(
  packagePath: string,
  options: Pick<AcquireLockOptions, 'appSupportDir' | 'lockDir'> = {},
): Promise<LockRecord | null> {
  const lockPath = options.lockDir
    ? path.join(options.lockDir, `${sha256Hex(path.resolve(packagePath))}.lock`)
    : lockPathForPackage(packagePath, options.appSupportDir);
  const result = await readLockFile(lockPath);
  return result.record;
}

/** Explicitly remove a stale/corrupt lock. Refuses to remove a live lock. */
export async function breakStaleLock(
  packagePath: string,
  options: AcquireLockOptions = {},
): Promise<{ ok: boolean; reason?: 'locked' | 'missing' | 'io-error'; message?: string }> {
  const absolutePackage = path.resolve(packagePath);
  const lockPath = options.lockDir
    ? path.join(options.lockDir, `${sha256Hex(absolutePackage)}.lock`)
    : lockPathForPackage(absolutePackage, options.appSupportDir);
  const existing = await readLockFile(lockPath);
  if (existing.record === null && !existing.corrupt) {
    return { ok: false, reason: 'missing', message: 'no lock file to break' };
  }
  if (existing.record !== null && !isLockStale(existing.record, options)) {
    return { ok: false, reason: 'locked', message: 'lock is live; refusing to break it' };
  }
  try {
    await fs.unlink(lockPath);
    return { ok: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'io-error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
