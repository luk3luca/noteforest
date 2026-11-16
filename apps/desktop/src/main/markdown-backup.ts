/**
 * Markdown guest-file backups.
 *
 * A `.md` file is external content, so its one previous copy does not live next
 * to it (a `.md.bak` in the vault would pollute the library tree). It lives in
 * app support, keyed by the absolute path:
 *
 *   <appSupport>/backups/markdown/<sha256(absolute path)>/
 *     previous.md
 *     meta.json   path, savedAt, mtime, size, hash
 *
 * One previous copy, overwritten by the next changed save; no rotating history
 * in v1. A moved/renamed file leaves its old backup directory behind (path
 * identity), and a future cleanup pass can remove it.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from '@noteforest/core/node';

export const MARKDOWN_BACKUP_VERSION = 1;

export interface MarkdownBackupMeta {
  version: number;
  /** Absolute path of the backed-up file. */
  path: string;
  /** ISO time of the save that produced this backup. */
  savedAt: string;
  /** ISO mtime of the previous bytes. */
  mtime: string;
  /** Byte length of the previous copy. */
  size: number;
  /** SHA-256 of the previous copy. */
  hash: string;
}

export interface MarkdownBackupPaths {
  directory: string;
  previous: string;
  meta: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function markdownBackupKey(filePath: string): string {
  return sha256(path.resolve(filePath));
}

export function markdownBackupPaths(
  appSupportDir: string,
  filePath: string,
): MarkdownBackupPaths {
  const directory = path.join(
    appSupportDir,
    'backups',
    'markdown',
    markdownBackupKey(filePath),
  );
  return {
    directory,
    previous: path.join(directory, 'previous.md'),
    meta: path.join(directory, 'meta.json'),
  };
}

export interface MarkdownBackupInput {
  appSupportDir: string;
  filePath: string;
  /** The exact bytes that are about to be replaced. */
  bytes: Uint8Array;
  mtimeMs: number;
  /** ISO time of this save; injected so tests are deterministic. */
  savedAt: string;
}

export type MarkdownBackupResult =
  | { ok: true; directory: string }
  | { ok: false; message: string; details?: string };

/**
 * Write the one previous copy and its metadata before the new bytes are
 * renamed into place. Both files are atomic; an existing backup is replaced.
 */
export async function writeMarkdownBackup(
  input: MarkdownBackupInput,
): Promise<MarkdownBackupResult> {
  const paths = markdownBackupPaths(input.appSupportDir, input.filePath);
  const meta: MarkdownBackupMeta = {
    version: MARKDOWN_BACKUP_VERSION,
    path: path.resolve(input.filePath),
    savedAt: input.savedAt,
    mtime: new Date(input.mtimeMs).toISOString(),
    size: input.bytes.byteLength,
    hash: sha256Bytes(input.bytes),
  };
  try {
    await fs.mkdir(paths.directory, { recursive: true });
    await writeFileAtomic(paths.previous, new Uint8Array(input.bytes));
    await writeFileAtomic(paths.meta, `${JSON.stringify(meta, null, 2)}\n`);
    return { ok: true, directory: paths.directory };
  } catch (error) {
    return {
      ok: false,
      message: 'The backup couldn’t be written.',
      details:
        error instanceof Error && error.message.length > 0 ? error.message : String(error),
    };
  }
}

/** Read the stored previous copy, for tests and a future restore surface. */
export async function readMarkdownBackup(
  appSupportDir: string,
  filePath: string,
): Promise<{ bytes: Buffer; meta: MarkdownBackupMeta } | null> {
  const paths = markdownBackupPaths(appSupportDir, filePath);
  try {
    const bytes = await fs.readFile(paths.previous);
    const meta = JSON.parse(await fs.readFile(paths.meta, 'utf8')) as MarkdownBackupMeta;
    return { bytes, meta };
  } catch {
    return null;
  }
}
