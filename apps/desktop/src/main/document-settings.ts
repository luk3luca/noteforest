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
  DocumentSettingsSaveInput,
  DocumentSettingsSaveResult,
  SettingsFileStatus,
  SettingsSaveResult,
} from '../shared/api.js';
import {
  normalizeDocumentSettingsFile,
  serializeDocumentSettingsFile,
  upsertDocumentSettingsEntry,
  type DocumentSettingsEntry,
  type LegacySessionOverride,
  migrateSessionOverrides,
} from '../shared/document-settings.js';

const FILE_NAME = 'document-settings.json';

export interface DocumentSettingsRead {
  entries: DocumentSettingsEntry[];
  status: SettingsFileStatus;
}

export function documentSettingsPath(directory: string): string {
  return path.join(directory, FILE_NAME);
}

export async function preserveCorruptFile(filePath: string): Promise<string | null> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const extension = path.extname(filePath);
  const base = filePath.slice(0, filePath.length - extension.length);
  let target = `${base}.corrupt-${stamp}${extension}`;
  let counter = 1;
  while (await pathExists(target)) {
    counter += 1;
    target = `${base}.corrupt-${stamp}-${counter}${extension}`;
  }
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
