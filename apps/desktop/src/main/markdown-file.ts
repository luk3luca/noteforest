/**
 * Markdown guest-file access in the main process.
 *
 * A `.md` file is read as ordinary UTF-8 text and registered with its own
 * folder as the confined image root. Nothing here creates a NoteForest package,
 * lock, revision, recent entry, or Page setting. M1 is read-only: the renderer
 * keeps edits in memory until the M2 save path exists.
 *
 * This module has no Electron import so its size guard, path containment, and
 * image resolution can be unit-tested in plain Node.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  MAX_MARKDOWN_BYTES,
  classifyMarkdownImageSource,
  isMarkdownFileName,
  markdownFileTitle,
} from '../shared/markdown.js';
import type {
  MarkdownImageResolution,
  MarkdownOpenResult,
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

/**
 * Read one `.md` file by absolute path. The returned path is the canonical
 * real path, so the tab/session key is stable across `..` and symlinked
 * parents. The size guard refuses a huge file instead of freezing the window.
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
  if (stats.size > MAX_MARKDOWN_BYTES) {
    return failure(
      `This Markdown file is too large to open (${Math.ceil(stats.size / 1024)} KB; limit ${MAX_MARKDOWN_BYTES / 1024} KB).`,
    );
  }
  let markdown: string;
  try {
    markdown = await fs.readFile(realPath, 'utf8');
  } catch (error) {
    return failure(`Could not read the Markdown file: ${messageOf(error)}`);
  }
  registerMarkdownFile(realPath);
  return {
    ok: true,
    file: { path: realPath, title: markdownFileTitle(realPath), markdown },
  };
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
