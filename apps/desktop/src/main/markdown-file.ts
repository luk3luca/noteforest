/**
 * Markdown guest-file access in the main process.
 *
 * A `.md` file is read as ordinary UTF-8 text and registered with its own
 * folder as the confined image root. Nothing here creates a NoteForest package,
 * lock, revision, recent entry, or Page setting.
 *
 * M2 owns the write path: an atomic temp→rename save, one `.md.bak` with the
 * previous bytes, and a re-stat conflict check against the fingerprint recorded
 * on open/after each save. A file that changed outside the app is never
 * overwritten without the explicit Overwrite choice.
 *
 * This module has no Electron import so its size guard, path containment,
 * image resolution, and save rules can be unit-tested in plain Node.
 */

import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  MAX_MARKDOWN_BYTES,
  classifyMarkdownImageSource,
  isMarkdownFileName,
  markdownFileTitle,
  markdownFingerprintChanged,
  type MarkdownFileFingerprint,
} from '../shared/markdown.js';
import type {
  MarkdownImageResolution,
  MarkdownOpenResult,
  MarkdownSaveInput,
  MarkdownSaveResult,
} from '../shared/api.js';
import { imageMimeFromName, MAX_IMAGE_BYTES } from '../shared/images.js';
import {
  markdownAssetUrl,
  type MarkdownAssetResolution,
} from './markdown-protocol-response.js';

interface RegisteredMarkdownFile {
  rootId: string;
  root: string;
}

/** Canonical file path -> confined root. Populated by a successful read. */
const markdownFiles = new Map<string, RegisteredMarkdownFile>();
/** Root id -> canonical folder, for the protocol handler. */
const markdownRoots = new Map<string, string>();

function rootIdFor(root: string): string {
  return createHash('sha256').update(root).digest('hex').slice(0, 16);
}

function registerMarkdownFile(filePath: string): RegisteredMarkdownFile {
  const root = path.dirname(filePath);
  const existing = markdownFiles.get(filePath);
  if (existing !== undefined) return existing;
  const rootId = rootIdFor(root);
  const registered = { rootId, root };
  markdownFiles.set(filePath, registered);
  markdownRoots.set(rootId, root);
  return registered;
}

/** True when `candidate` is `root` itself or one of its descendants. */
export function isInsideMarkdownRoot(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function failure(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error);
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function markdownHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fingerprintOf(
  stats: { mtimeMs: number; size: number },
  bytes: Uint8Array,
): MarkdownFileFingerprint {
  return { mtimeMs: stats.mtimeMs, size: stats.size, hash: markdownHash(bytes) };
}

function sizeLabel(bytes: number): string {
  const kb = Math.ceil(bytes / 1024);
  return kb > 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${kb} KB`;
}

/**
 * Read one `.md` file by absolute path. The returned path is the canonical
 * real path, so the tab/session key is stable across `..` and symlinked
 * parents.
 *
 * Size guard (documented in `shared/markdown.ts`): up to 2 MB the file is
 * editable with a conflict fingerprint; above 2 MB it is not parsed at all and
 * the tab opens a read-only panel with the size and reason, so a huge file can
 * never freeze the window and is never written.
 */
export async function readMarkdownFile(inputPath: string): Promise<MarkdownOpenResult> {
  if (!path.isAbsolute(inputPath)) return failure('The Markdown path is not absolute.');
  if (!isMarkdownFileName(inputPath)) {
    return failure('Choose a Markdown file (.md).');
  }
  let realPath: string;
  try {
    realPath = await fs.realpath(inputPath);
  } catch (error) {
    return failure(`Could not open the Markdown file: ${messageOf(error)}`);
  }
  let stats;
  try {
    stats = await fs.stat(realPath);
  } catch (error) {
    return failure(`Could not read the Markdown file: ${messageOf(error)}`);
  }
  if (!stats.isFile()) return failure('The Markdown path is not a file.');

  registerMarkdownFile(realPath);

  if (stats.size > MAX_MARKDOWN_BYTES) {
    return {
      ok: true,
      file: {
        path: realPath,
        title: markdownFileTitle(realPath),
        markdown: '',
        base: null,
        readOnly: true,
        tooLarge: true,
        readOnlyReason: `This Markdown file is ${sizeLabel(stats.size)}, above the ${MAX_MARKDOWN_BYTES / (1024 * 1024)} MB editing limit. It is not opened here; use a Markdown editor. Nothing is written.`,
      },
    };
  }

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(realPath);
  } catch (error) {
    return failure(`Could not read the Markdown file: ${messageOf(error)}`);
  }
  if (bytes.byteLength > MAX_MARKDOWN_BYTES) {
    // The file grew between the stat and the read; never parse a race winner.
    return {
      ok: true,
      file: {
        path: realPath,
        title: markdownFileTitle(realPath),
        markdown: '',
        base: null,
        readOnly: true,
        tooLarge: true,
        readOnlyReason: `This Markdown file is ${sizeLabel(bytes.byteLength)}, above the ${MAX_MARKDOWN_BYTES / (1024 * 1024)} MB editing limit. It is not opened here; use a Markdown editor. Nothing is written.`,
      },
    };
  }
  return {
    ok: true,
    file: {
      path: realPath,
      title: markdownFileTitle(realPath),
      markdown: bytes.toString('utf8'),
      base: fingerprintOf(stats, bytes),
      readOnly: false,
    },
  };
}

class MarkdownConflictError extends Error {}

function saveFailure(
  code: 'conflict' | 'missing' | 'read-only' | 'permission' | 'disk-full' | 'unknown',
  message: string,
  base?: MarkdownFileFingerprint | null,
): MarkdownSaveResult {
  return base === undefined ? { ok: false, code, message } : { ok: false, code, message, base };
}

function mapWriteError(error: unknown): MarkdownSaveResult {
  const code = errorCode(error);
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
    return saveFailure('permission', `Could not write the Markdown file: ${messageOf(error)}`);
  }
  if (code === 'ENOSPC' || code === 'EDQUOT') {
    return saveFailure('disk-full', `Could not write the Markdown file: ${messageOf(error)}`);
  }
  if (code === 'ENOENT') {
    return saveFailure('missing', 'The Markdown file is no longer on disk. Nothing was written.');
  }
  return saveFailure('unknown', `Could not save the Markdown file: ${messageOf(error)}`);
}

/**
 * Temp file in the target directory → write → fsync → rename, preserving the
 * existing POSIX mode. `beforeRename` is the last conflict re-stat: it runs
 * after the bytes are durable and before the target is replaced.
 */
async function writeMarkdownAtomic(
  targetPath: string,
  bytes: Uint8Array,
  mode: number,
  beforeRename?: () => Promise<void>,
): Promise<void> {
  const directory = path.dirname(targetPath);
  const tempPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(tempPath, 'wx', mode & 0o777);
    // `open` mode is filtered by the process umask; the guest file keeps its
    // previous permissions exactly.
    await handle.chmod(mode & 0o777).catch(() => undefined);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    if (beforeRename !== undefined) await beforeRename();
    await fs.rename(tempPath, targetPath);
    try {
      const directoryHandle = await fs.open(directory, 'r');
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch {
      // Directory fsync is best-effort and not supported on every platform.
    }
  } catch (error) {
    if (handle !== null) await handle.close().catch(() => undefined);
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

/**
 * Atomically save one Markdown guest file.
 *
 * Steps, in order:
 * 1. canonicalize and stat; a missing file is `missing` and is never recreated;
 * 2. read the current bytes and compare size/hash/mtime with `base`;
 * 3. write one `.<name>.bak` (the exact previous bytes) atomically;
 * 4. write the new bytes to a temp file, fsync, re-stat, rename.
 *
 * A changed base (or a change detected just before rename) is a conflict; the
 * caller must ask Reload / Overwrite / Cancel. `overwriteExternal` is sent only
 * by the explicit Overwrite choice.
 */
export async function saveMarkdownFile(input: MarkdownSaveInput): Promise<MarkdownSaveResult> {
  if (!path.isAbsolute(input.path)) {
    return saveFailure('unknown', 'The Markdown path is not absolute.');
  }
  if (!isMarkdownFileName(input.path)) {
    return saveFailure('unknown', 'Choose a Markdown file (.md).');
  }
  let realPath: string;
  try {
    realPath = await fs.realpath(input.path);
  } catch (error) {
    return errorCode(error) === 'ENOENT'
      ? saveFailure('missing', 'The Markdown file is no longer on disk. Nothing was written.')
      : mapWriteError(error);
  }
  let stats;
  try {
    stats = await fs.stat(realPath);
  } catch (error) {
    return errorCode(error) === 'ENOENT'
      ? saveFailure('missing', 'The Markdown file is no longer on disk. Nothing was written.')
      : mapWriteError(error);
  }
  if (!stats.isFile()) {
    return saveFailure('missing', 'The Markdown file is no longer on disk. Nothing was written.');
  }
  if (stats.size > MAX_MARKDOWN_BYTES) {
    return saveFailure(
      'read-only',
      `This Markdown file is above the ${MAX_MARKDOWN_BYTES / (1024 * 1024)} MB editing limit. Nothing was written.`,
    );
  }
  let current: Buffer;
  try {
    current = await fs.readFile(realPath);
  } catch (error) {
    return mapWriteError(error);
  }
  const currentFingerprint = fingerprintOf(stats, current);

  if (!input.overwriteExternal) {
    if (input.base === null || markdownFingerprintChanged(input.base, currentFingerprint)) {
      return saveFailure(
        'conflict',
        'This Markdown file changed outside NoteForest. Nothing was written.',
        currentFingerprint,
      );
    }
  }

  const next = Buffer.from(input.markdown, 'utf8');
  if (next.length === current.length && markdownHash(next) === currentFingerprint.hash) {
    // Nothing to write: a no-op save keeps the file (and its mtime) untouched.
    return { ok: true, base: currentFingerprint, unchanged: true };
  }

  // One backup with the exact previous bytes; no rotating history.
  try {
    await writeMarkdownAtomic(`${realPath}.bak`, current, stats.mode);
  } catch (error) {
    return mapWriteError(error);
  }

  try {
    await writeMarkdownAtomic(realPath, next, stats.mode, async () => {
      const again = await fs.stat(realPath);
      const againBytes = await fs.readFile(realPath);
      if (markdownFingerprintChanged(currentFingerprint, fingerprintOf(again, againBytes))) {
        throw new MarkdownConflictError('conflict-before-rename');
      }
    });
  } catch (error) {
    if (error instanceof MarkdownConflictError) {
      return saveFailure(
        'conflict',
        'This Markdown file changed outside NoteForest while saving. Nothing was written.',
      );
    }
    return mapWriteError(error);
  }

  let after;
  try {
    after = await fs.stat(realPath);
  } catch (error) {
    return mapWriteError(error);
  }
  registerMarkdownFile(realPath);
  const base = fingerprintOf(after, next);
  return { ok: true, base, unchanged: false };
}

/**
 * Resolve one Markdown image to a confined protocol URL.
 *
 * Remote URLs are never fetched; absolute, hidden, traversal, and non-image
 * paths are placeholders. Missing files are reported now so the node view shows
 * the labelled placeholder instead of a broken-image glyph.
 */
export async function resolveMarkdownImage(
  filePath: string,
  source: string,
): Promise<MarkdownImageResolution> {
  let realPath: string;
  try {
    realPath = await fs.realpath(filePath);
  } catch {
    return { ok: false, reason: 'The Markdown file is not open.' };
  }
  const registered = markdownFiles.get(realPath);
  if (registered === undefined) {
    return { ok: false, reason: 'Reopen the Markdown file to load its images.' };
  }
  const classified = classifyMarkdownImageSource(source);
  if (classified.kind !== 'local') {
    return { ok: false, reason: classified.reason };
  }
  const mime = imageMimeFromName(classified.relative);
  if (mime === undefined) {
    return { ok: false, reason: 'Only local image files are supported.' };
  }
  const target = path.resolve(registered.root, classified.relative);
  if (!isInsideMarkdownRoot(registered.root, target)) {
    return { ok: false, reason: 'Images outside this file’s folder are not loaded.' };
  }
  try {
    const linkStats = await fs.lstat(target);
    if (linkStats.isSymbolicLink()) {
      return { ok: false, reason: 'Symbolic links are not loaded.' };
    }
    if (!linkStats.isFile()) {
      return { ok: false, reason: 'Image file not found.' };
    }
    if (linkStats.size > MAX_IMAGE_BYTES) {
      return { ok: false, reason: 'Image file is too large.' };
    }
    const realTarget = await fs.realpath(target);
    if (!isInsideMarkdownRoot(registered.root, realTarget)) {
      return { ok: false, reason: 'Images outside this file’s folder are not loaded.' };
    }
  } catch {
    return { ok: false, reason: 'Image file not found.' };
  }
  return {
    ok: true,
    url: markdownAssetUrl(registered.rootId, classified.relative),
  };
}

/** Protocol-side asset read. Only registered roots and image files. */
export async function resolveMarkdownAsset(
  rootId: string,
  relativePath: string,
): Promise<MarkdownAssetResolution> {
  const root = markdownRoots.get(rootId);
  if (root === undefined) return { ok: false, reason: 'root-not-open' };
  const mime = imageMimeFromName(relativePath);
  if (mime === undefined) return { ok: false, reason: 'unsupported-image' };
  const target = path.resolve(root, relativePath);
  if (!isInsideMarkdownRoot(root, target)) return { ok: false, reason: 'outside-root' };
  try {
    const linkStats = await fs.lstat(target);
    if (linkStats.isSymbolicLink()) return { ok: false, reason: 'symlink' };
    if (!linkStats.isFile()) return { ok: false, reason: 'image-missing' };
    if (linkStats.size > MAX_IMAGE_BYTES) return { ok: false, reason: 'image-too-large' };
    const realTarget = await fs.realpath(target);
    if (!isInsideMarkdownRoot(root, realTarget)) return { ok: false, reason: 'outside-root' };
    const bytes = await fs.readFile(realTarget);
    return { ok: true, bytes: new Uint8Array(bytes), mime };
  } catch {
    return { ok: false, reason: 'image-missing' };
  }
}
