/**
 * Recent libraries manifest (`app-support/libraries.json`).
 *
 * One active library per window is session state; this file is the global
 * recents list (max 8, newest first). Paths are absolute and normalized for
 * storage; identity/dedupe in the main process uses `realpath` so symlinks and
 * case-insensitive volumes do not create duplicates. A corrupt file is kept as
 * a timestamped copy and read as an empty list with a warning; document
 * packages are never touched here.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from '@noteforest/core/node';

export const LIBRARY_ROOTS_VERSION = 1;
export const MAX_RECENT_LIBRARIES = 8;

export interface LibraryRootEntry {
  /** Absolute, normalized path chosen by the user. */
  path: string;
  lastOpenedAt: string;
}

export interface LibraryRootsFile {
  version: typeof LIBRARY_ROOTS_VERSION;
  libraries: LibraryRootEntry[];
}

export type LibraryRootsStatus = 'ok' | 'defaults' | 'corrupt' | 'unreadable' | 'newer';

export interface LibraryRootsRead {
  libraries: LibraryRootEntry[];
  status: LibraryRootsStatus;
  warnings: string[];
  /** Preserved copy for a corrupt file. */
  backupPath?: string;
}

export function librariesFilePath(appSupportDir: string): string {
  return path.join(appSupportDir, 'libraries.json');
}

export function normalizeLibraryPath(value: string): string {
  return path.resolve(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function timestampForBackup(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

function normalizeEntries(raw: unknown): LibraryRootEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: LibraryRootEntry[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (!isRecord(value)) continue;
    const entryPath = value['path'];
    const lastOpenedAt = value['lastOpenedAt'];
    if (typeof entryPath !== 'string' || entryPath.trim().length === 0) continue;
    if (typeof lastOpenedAt !== 'string' || lastOpenedAt.trim().length === 0) continue;
    const normalized = normalizeLibraryPath(entryPath);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    entries.push({ path: normalized, lastOpenedAt });
  }
  return sortAndCap(entries);
}

function timeOf(entry: LibraryRootEntry): number {
  const parsed = Date.parse(entry.lastOpenedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Newest first; ties keep their incoming order (stable sort). */
export function sortAndCap(entries: readonly LibraryRootEntry[]): LibraryRootEntry[] {
  return [...entries].sort((left, right) => timeOf(right) - timeOf(left)).slice(
    0,
    MAX_RECENT_LIBRARIES,
  );
}

export async function readLibraryRoots(appSupportDir: string): Promise<LibraryRootsRead> {
  const file = librariesFilePath(appSupportDir);
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { libraries: [], status: 'defaults', warnings: [] };
    }
    return {
      libraries: [],
      status: 'unreadable',
      warnings: [`Could not read libraries.json: ${errorMessage(error)}`],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const backupPath = await preserveCorruptLibraries(file);
    return {
      libraries: [],
      status: 'corrupt',
      warnings: [
        `libraries.json is corrupt and was ignored: ${errorMessage(error)}`,
        ...(backupPath === null
          ? []
          : [`A copy of the damaged file is kept at ${backupPath}.`]),
      ],
      ...(backupPath === null ? {} : { backupPath }),
    };
  }

  if (!isRecord(parsed) || !Array.isArray(parsed['libraries'])) {
    const backupPath = await preserveCorruptLibraries(file);
    return {
      libraries: [],
      status: 'corrupt',
      warnings: [
        'libraries.json is not an object with a libraries array; it was ignored.',
        ...(backupPath === null
          ? []
          : [`A copy of the damaged file is kept at ${backupPath}.`]),
      ],
      ...(backupPath === null ? {} : { backupPath }),
    };
  }

  const storedVersion = Number(parsed['version']);
  const libraries = normalizeEntries(parsed['libraries']);
  if (Number.isFinite(storedVersion) && storedVersion > LIBRARY_ROOTS_VERSION) {
    return {
      libraries,
      status: 'newer',
      warnings: [
        `libraries.json was written by a newer NoteForest version (${storedVersion}); the recents list may be incomplete.`,
      ],
    };
  }
  return { libraries, status: 'ok', warnings: [] };
}

async function preserveCorruptLibraries(file: string): Promise<string | null> {
  const backup = `${file}.corrupt-${timestampForBackup(new Date())}`;
  try {
    await fs.copyFile(file, backup);
    return backup;
  } catch {
    return null;
  }
}

export async function writeLibraryRoots(
  appSupportDir: string,
  libraries: readonly LibraryRootEntry[],
): Promise<void> {
  const document: LibraryRootsFile = {
    version: LIBRARY_ROOTS_VERSION,
    libraries: sortAndCap(
      normalizeEntries(
        libraries.map((entry) => ({ path: entry.path, lastOpenedAt: entry.lastOpenedAt })),
      ),
    ),
  };
  await fs.mkdir(appSupportDir, { recursive: true });
  await writeFileAtomic(
    librariesFilePath(appSupportDir),
    `${JSON.stringify(document, null, 2)}\n`,
  );
}

/** Add or move one path to the front, deduped by normalized path. */
export function upsertLibraryRecent(
  libraries: readonly LibraryRootEntry[],
  entry: LibraryRootEntry,
): LibraryRootEntry[] {
  const normalized = normalizeLibraryPath(entry.path);
  const kept = libraries.filter(
    (candidate) => normalizeLibraryPath(candidate.path) !== normalized,
  );
  return sortAndCap([{ path: normalized, lastOpenedAt: entry.lastOpenedAt }, ...kept]);
}

export function removeLibraryRecent(
  libraries: readonly LibraryRootEntry[],
  target: string,
): LibraryRootEntry[] {
  const normalized = normalizeLibraryPath(target);
  return libraries.filter(
    (candidate) => normalizeLibraryPath(candidate.path) !== normalized,
  );
}

/** Replace a missing library path, keeping one entry per normalized path. */
export function replaceLibraryRecent(
  libraries: readonly LibraryRootEntry[],
  from: string,
  to: LibraryRootEntry,
): LibraryRootEntry[] {
  const fromPath = normalizeLibraryPath(from);
  const withoutFrom = libraries.filter(
    (candidate) => normalizeLibraryPath(candidate.path) !== fromPath,
  );
  return upsertLibraryRecent(withoutFrom, to);
}

export function libraryBasename(libraryPath: string): string {
  const trimmed = libraryPath.replace(/[\\/]+$/, '');
  const base = path.basename(trimmed);
  return base.length > 0 ? base : trimmed;
}

/** Basenames that appear more than once; those rows show their parent path. */
export function duplicateLibraryBasenames(
  libraries: readonly LibraryRootEntry[],
): Set<string> {
  const counts = new Map<string, number>();
  for (const entry of libraries) {
    const name = libraryBasename(entry.path);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : String(error);
}
