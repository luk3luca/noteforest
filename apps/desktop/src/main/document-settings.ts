/**
 * File I/O for durable per-document personal settings (S2-2).
 *
 * The pure identity rules live in `shared/document-settings.ts`; this module
 * owns only the app-support file, corrupt-file preservation, and serialized
 * atomic writes. A single process-wide queue keeps rapid override changes in
 * order (last write wins) without a lost update across read-modify-write.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from '@noteforest/core/node';
import type {
  DocumentSettingsBackupView,
  DocumentSettingsRecoveryResult,
  DocumentSettingsSaveInput,
  DocumentSettingsSaveResult,
  SettingsFileStatus,
  SettingsSaveResult,
} from '../shared/api.js';
import {
  normalizeDocumentSettingsFile,
  normalizePackagePath,
  serializeDocumentSettingsFile,
  upsertDocumentSettingsEntry,
  type DocumentSettingsEntry,
  type LegacySessionOverride,
  migrateSessionOverrides,
} from '../shared/document-settings.js';

const FILE_NAME = 'document-settings.json';
const BACKUP_PREFIX = 'document-settings.backup-';

export interface DocumentSettingsRead {
  entries: DocumentSettingsEntry[];
  status: SettingsFileStatus;
}

export function documentSettingsPath(directory: string): string {
  return path.join(directory, FILE_NAME);
}

function timestampStem(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** First free `<file>.<label>-<timestamp>.json` path for a side-copy. */
async function uniqueSideCopyPath(filePath: string, label: string): Promise<string> {
  const extension = path.extname(filePath);
  const base = filePath.slice(0, filePath.length - extension.length);
  const stamp = timestampStem();
  let target = `${base}.${label}-${stamp}${extension}`;
  let counter = 1;
  while (await pathExists(target)) {
    counter += 1;
    target = `${base}.${label}-${stamp}-${counter}${extension}`;
  }
  return target;
}

export async function preserveCorruptFile(filePath: string): Promise<string | null> {
  const target = await uniqueSideCopyPath(filePath, 'corrupt');
  try {
    await fs.copyFile(filePath, target);
    return target;
  } catch {
    return null;
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : String(error);
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

/**
 * Read and normalize the map. A corrupt file is preserved as
 * `document-settings.corrupt-<timestamp>.json` and reported; it is never
 * overwritten implicitly on read.
 */
export async function readDocumentSettingsFile(
  directory: string,
): Promise<DocumentSettingsRead> {
  const file = documentSettingsPath(directory);
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (isMissing(error)) return { entries: [], status: { state: 'defaults' } };
    return {
      entries: [],
      status: { state: 'unreadable', message: errorMessage(error) },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const backupPath = await preserveCorruptFile(file);
    return {
      entries: [],
      status: {
        state: 'corrupt',
        message: errorMessage(error),
        ...(backupPath === null ? {} : { backupPath }),
      },
    };
  }
  const read = normalizeDocumentSettingsFile(parsed);
  return { entries: read.entries, status: { state: 'ok' } };
}

let writeQueue: Promise<void> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function writeEntries(
  directory: string,
  entries: readonly DocumentSettingsEntry[],
): Promise<SettingsSaveResult> {
  try {
    await fs.mkdir(directory, { recursive: true });
    await writeFileAtomic(
      documentSettingsPath(directory),
      serializeDocumentSettingsFile(entries),
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, message: `Could not save document settings: ${errorMessage(error)}` };
  }
}

/** Replace the whole map (bootstrap migration only). Serialized + atomic. */
export async function writeDocumentSettingsFile(
  directory: string,
  entries: readonly DocumentSettingsEntry[],
): Promise<SettingsSaveResult> {
  return enqueue(() => writeEntries(directory, entries));
}

/**
 * Apply one upsert/clear. Read-modify-write runs inside the queue so two rapid
 * IPC calls cannot lose each other; the last command wins.
 */
export async function saveDocumentSettings(
  directory: string,
  input: DocumentSettingsSaveInput,
): Promise<DocumentSettingsSaveResult> {
  return enqueue(async () => {
    const read = await readDocumentSettingsFile(directory);
    if (read.status.state === 'corrupt' || read.status.state === 'unreadable') {
      // A corrupt map is empty in memory. Writing would silently replace the
      // user's old overrides, so fail and let the UI surface the warning.
      return {
        ok: false,
        message:
          read.status.message ??
          'Document settings could not be read; no override was saved.',
      };
    }
    const entries = upsertDocumentSettingsEntry(read.entries, input, input.page);
    const written = await writeEntries(directory, entries);
    if (!written.ok) return written;
    return { ok: true };
  });
}

/**
 * Remove every entry for one document (Move to Trash). Identity is the
 * canonical document id first, plus the package path fallback for a path-only
 * legacy entry. A corrupt/unreadable map is never overwritten implicitly: the
 * cleanup is best effort and reports the read warning.
 */
export async function removeDocumentSettingsEntries(
  directory: string,
  identity: { documentId?: string | null; packagePath: string },
): Promise<SettingsSaveResult> {
  return enqueue(async () => {
    const read = await readDocumentSettingsFile(directory);
    if (read.status.state === 'corrupt' || read.status.state === 'unreadable') {
      return {
        ok: false,
        message:
          read.status.message ??
          'Document settings could not be read; the override entry was kept.',
      };
    }
    const id =
      typeof identity.documentId === 'string' && identity.documentId.trim().length > 0
        ? identity.documentId.trim()
        : null;
    const targetPath = normalizePackagePath(identity.packagePath);
    const next = read.entries.filter((entry) => {
      if (id !== null && entry.documentId === id) return false;
      if (normalizePackagePath(entry.packagePath) === targetPath) return false;
      return true;
    });
    if (next.length === read.entries.length) return { ok: true };
    return writeEntries(directory, next);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type DocumentSettingsBackupParse =
  | { ok: true; entries: DocumentSettingsEntry[] }
  | { ok: false; message: string };

/**
 * Parse and normalize one backup file. A backup is valid only when it is JSON
 * with an entry list; the shared normalizer then applies the same identity and
 * page-override rules as a normal read. Restore never writes a map it could not
 * read this way.
 */
export function parseDocumentSettingsBackup(text: string): DocumentSettingsBackupParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    return { ok: false, message: `The backup is not valid JSON: ${errorMessage(error)}` };
  }
  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed['entries'])
      ? (parsed['entries'] as unknown[])
      : null;
  if (list === null) {
    return { ok: false, message: 'The backup has no document settings entry list.' };
  }
  return { ok: true, entries: normalizeDocumentSettingsFile(parsed).entries };
}

/** Existing `.backup-<timestamp>.json` side-copies, newest filename first. */
async function documentSettingsBackupNames(directory: string): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith('.json'))
    .sort()
    .reverse();
}

export async function listDocumentSettingsBackups(
  directory: string,
): Promise<DocumentSettingsBackupView[]> {
  const backups: DocumentSettingsBackupView[] = [];
  for (const name of await documentSettingsBackupNames(directory)) {
    const filePath = path.join(directory, name);
    try {
      const info = await fs.stat(filePath);
      backups.push({ path: filePath, createdAt: info.mtime.toISOString() });
    } catch {
      // A vanished backup is not a candidate.
    }
  }
  return backups;
}

/**
 * Newest backup that parses and normalizes. The main process owns this choice;
 * an invalid newest file is skipped rather than restored.
 */
export async function findNewestValidDocumentSettingsBackup(
  directory: string,
): Promise<DocumentSettingsBackupView | null> {
  for (const backup of await listDocumentSettingsBackups(directory)) {
    try {
      const text = await fs.readFile(backup.path, 'utf8');
      if (parseDocumentSettingsBackup(text).ok) return backup;
    } catch {
      // Unreadable candidate; keep looking for an older valid one.
    }
  }
  return null;
}

/** Side-copy the current map before it is replaced. Best effort: a missing or
 * unreadable file has nothing to copy. */
async function backupCurrentMap(directory: string): Promise<string | null> {
  const file = documentSettingsPath(directory);
  if (!(await pathExists(file))) return null;
  const target = await uniqueSideCopyPath(file, 'backup');
  try {
    await fs.copyFile(file, target);
    return target;
  } catch {
    return null;
  }
}

/**
 * Explicit map reset (S3-13): copy the current file aside, then atomically
 * write an empty map through the serialized queue. This is the only path that
 * may replace a corrupt/unreadable map; ordinary saves stay refused until the
 * user chooses it.
 */
export async function resetDocumentSettings(
  directory: string,
): Promise<DocumentSettingsRecoveryResult> {
  return enqueue(async () => {
    const backupPath = await backupCurrentMap(directory);
    const written = await writeEntries(directory, []);
    if (!written.ok) return { ok: false, message: written.message };
    return {
      ok: true,
      entries: [],
      ...(backupPath === null ? {} : { backupPath }),
      backup: await findNewestValidDocumentSettingsBackup(directory),
    };
  });
}

/**
 * Restore the newest valid backup. The current file is copied aside first, the
 * chosen backup is re-read and normalized inside the queue, and any failure
 * leaves the current map untouched.
 */
export async function restoreDocumentSettingsBackup(
  directory: string,
): Promise<DocumentSettingsRecoveryResult> {
  return enqueue(async () => {
    const candidate = await findNewestValidDocumentSettingsBackup(directory);
    if (candidate === null) {
      return { ok: false, message: 'No valid document settings backup was found.' };
    }
    let text: string;
    try {
      text = await fs.readFile(candidate.path, 'utf8');
    } catch (error) {
      return { ok: false, message: `Could not read the backup: ${errorMessage(error)}` };
    }
    const parsed = parseDocumentSettingsBackup(text);
    if (!parsed.ok) {
      // The file changed since it was listed; never replace the map with it.
      return { ok: false, message: parsed.message };
    }
    const backupPath = await backupCurrentMap(directory);
    const written = await writeEntries(directory, parsed.entries);
    if (!written.ok) return { ok: false, message: written.message };
    return {
      ok: true,
      entries: parsed.entries,
      ...(backupPath === null ? {} : { backupPath }),
      backup: await findNewestValidDocumentSettingsBackup(directory),
    };
  });
}

/**
 * Move session-tab overrides into the map once per startup. Returns the entries
 * the renderer should use; a write failure is reported but never drops the
 * in-memory entries, so the current session still resolves them.
 */
export async function migrateLegacySessionOverrides(
  directory: string,
  legacy: readonly LegacySessionOverride[],
  documentIdByPath: ReadonlyMap<string, string>,
): Promise<{ entries: DocumentSettingsEntry[]; status: SettingsFileStatus }> {
  const read = await readDocumentSettingsFile(directory);
  const migrated = migrateSessionOverrides(read.entries, legacy, documentIdByPath);
  if (read.status.state === 'corrupt' || read.status.state === 'unreadable') {
    // Never overwrite a damaged map implicitly, even to migrate a session
    // override. The session value still applies in memory for this run.
    return { entries: migrated.entries, status: read.status };
  }
  if (migrated.migrated === 0) return { entries: migrated.entries, status: read.status };
  const written = await writeDocumentSettingsFile(directory, migrated.entries);
  if (!written.ok) {
    return {
      entries: migrated.entries,
      status: { state: 'unreadable', message: written.message },
    };
  }
  return { entries: migrated.entries, status: { state: 'ok' } };
}

/** Test-only: await the serialized queue. */
export async function flushDocumentSettingsWrites(): Promise<void> {
  await writeQueue;
}
