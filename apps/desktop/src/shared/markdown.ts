/**
 * Markdown guest-file rules shared by the main process and the renderer.
 *
 * A `.md` file is not a NoteForest package: it has no document id, revision,
 * lock, Page settings, or forest structure. These helpers are intentionally
 * path- and DOM-free so both sides agree on what a Markdown path is and which
 * image sources may be resolved without ever fetching the network. The naming
 * rules themselves live in `@noteforest/core` so the vault scan and this
 * surface cannot disagree.
 */

import { isMarkdownFileName } from '@noteforest/core';

export {
  MARKDOWN_EXTENSIONS,
  markdownExtension,
  isMarkdownFileName,
  markdownFileTitle,
} from '@noteforest/core';

/**
 * Editable cap: a `.md` above 2 MB opens read-only instead of freezing the
 * window. The value is deliberately small: a guest file is parsed and
 * rendered synchronously, and a bigger file belongs in a Markdown editor.
 */
export const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;

/**
 * Conflict baseline recorded on open and after every successful save. `hash`
 * is the SHA-256 of the exact bytes, so an external write that keeps the size
 * and the mtime (a same-second edit from a coarse timestamp) is still caught.
 */
export interface MarkdownFileFingerprint {
  mtimeMs: number;
  size: number;
  hash: string;
}

/** True when the on-disk fingerprint no longer matches the recorded base. */
export function markdownFingerprintChanged(
  base: MarkdownFileFingerprint,
  current: MarkdownFileFingerprint,
): boolean {
  return (
    base.size !== current.size ||
    base.hash !== current.hash ||
    base.mtimeMs !== current.mtimeMs
  );
}

export function isMarkdownPath(path: string): boolean {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  const base = normalized.slice(normalized.lastIndexOf('/') + 1);
  return base.length > 0 && isMarkdownFileName(base);
}

export type MarkdownImageSource =
  | { kind: 'local'; relative: string }
  | { kind: 'remote'; reason: string }
  | { kind: 'unsafe'; reason: string };

const REMOTE_SCHEME = /^(?:https?|ftp|wss?):/i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Classify one Markdown image destination.
 *
 * Only a relative path inside the `.md` file's folder tree is resolvable.
 * Remote URLs, `data:`/`file:`/other schemes, absolute paths, backslashes,
 * parent traversal, hidden segments, and empty sources are placeholder-only.
 * No network request is ever made for a Markdown image.
 */
export function classifyMarkdownImageSource(source: string): MarkdownImageSource {
  const value = source.trim();
  if (value.length === 0) {
    return { kind: 'unsafe', reason: 'The image has no source.' };
  }
  if (value.startsWith('//')) {
    return { kind: 'remote', reason: 'Remote images are not loaded.' };
  }
  if (REMOTE_SCHEME.test(value)) {
    return { kind: 'remote', reason: 'Remote images are not loaded.' };
  }
  if (ANY_SCHEME.test(value)) {
    return { kind: 'unsafe', reason: 'Only local image files are supported.' };
  }
  if (value.startsWith('/') || value.startsWith('~') || /^[a-zA-Z]:[\\/]/.test(value)) {
    return { kind: 'unsafe', reason: 'Only images relative to this file are supported.' };
  }
  if (value.includes('\\')) {
    return { kind: 'unsafe', reason: 'Unsupported image path.' };
  }
  // Query and fragment are not part of a local file name.
  const withoutQuery = value.split(/[?#]/, 1)[0] ?? '';
  let decoded = withoutQuery;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    return { kind: 'unsafe', reason: 'Unsupported image path.' };
  }
  if (decoded.length === 0 || decoded.includes('\0')) {
    return { kind: 'unsafe', reason: 'The image has no source.' };
  }
  const rawSegments = decoded.split('/');
  const segments: string[] = [];
  for (const segment of rawSegments) {
    if (segment === '.') continue;
    if (segment.length === 0 || segment === '..' || segment.startsWith('.')) {
      return { kind: 'unsafe', reason: 'Images outside this file’s folder are not loaded.' };
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    return { kind: 'unsafe', reason: 'The image has no source.' };
  }
  return { kind: 'local', relative: segments.join('/') };
}
