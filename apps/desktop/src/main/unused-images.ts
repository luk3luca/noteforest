/**
 * Unused-image cleanup at the byte boundary (DR1b, decision 17 November 2026).
 *
 * `planAssetGc` decides which asset *records* nothing names; the renderer lists
 * them in Health and asks this module to move one file to the OS Trash before
 * the record is removed with the existing guarded `asset.remove` command.
 *
 * The policy for destructive actions is the app's: the bytes go to the Trash,
 * exactly like Move to Trash for a note, and are never unlinked. This function
 * is the only place that touches `assets/<id>` destructively, so every check
 * that protects the bytes lives here:
 *
 * - the record must exist in the live canonical document;
 * - no image node and no image anchor may name the id (the same guard
 *   `asset.remove` applies, checked again at the instant of the move);
 * - the file is the content address inside the package's real `assets/`, after
 *   both roots are resolved; a symlink, a directory, or a crafted record path
 *   is refused rather than followed;
 * - a missing file is not a failure: there is nothing to move, and removing the
 *   dead record is the cleanup.
 *
 * The caller (main IPC) supplies `trashItem`, so the Electron `shell` import
 * stays in `index.ts` and this module is unit-tested with a recorder.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { imageAssetReferences, type Document } from '@noteforest/core';
import type { TrashUnusedImageResult } from '../shared/api.js';

/** Same shape as the note Move to Trash: Electron's `shell.trashItem`. */
export type TrashItem = (target: string) => Promise<void>;

/** Minimal store shape needed to move one unused asset; testable without IPC. */
export interface UnusedAssetStore {
  readonly packagePath: string;
  readonly assetsPath: string;
  readonly document: Document | null;
  /** A read-only open can move bytes but could never remove the record. */
  readonly readOnly?: boolean;
}

const ASSET_ID_PATTERN = /^[0-9a-f]{64}$/;
const ASSETS_DIRECTORY = 'assets';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : String(error);
}

/** Strict containment: `candidate` must be below `root`, not equal to it. */
function isStrictlyInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function refused(
  code: Extract<TrashUnusedImageResult, { ok: false }>['code'],
  message: string,
  details?: string,
): TrashUnusedImageResult {
  return { ok: false, code, message, ...(details === undefined ? {} : { details }) };
}

/**
 * Move one unused asset file to the OS Trash.
 *
 * `trashed: false` means the file was already missing; the record is still
 * unreferenced, so the caller may remove it. On any failure nothing was moved
 * (or the OS refused the move) and the record must stay.
 */
export async function trashUnusedAsset(
  store: UnusedAssetStore,
  assetId: string,
  trashItem: TrashItem,
): Promise<TrashUnusedImageResult> {
  if (typeof assetId !== 'string' || !ASSET_ID_PATTERN.test(assetId)) {
    return refused('not-found', 'That image is no longer in the note.');
  }
  const document = store.document;
  if (document === null) {
    return refused('not-open', 'This note isn’t open, so its images can’t be cleaned up.');
  }
  const asset = Object.hasOwn(document.assets, assetId)
    ? document.assets[assetId]
    : undefined;
  if (asset === undefined || asset.id !== assetId) {
    return refused('not-found', 'That image is no longer in the note.');
  }
  if (store.readOnly === true) {
    return refused('read-only', 'This note is open read-only.');
  }
  const references = imageAssetReferences(document, assetId);
  if (references.length > 0) {
    return refused('asset-in-use', 'This image is still in use.');
  }

  // A record path is metadata: only the content address inside this package's
  // real `assets/` directory may be moved. Both roots are resolved so a
  // symlinked `assets/` entry can never make the target escape the package.
  const packageRoot = await fs.realpath(store.packagePath).catch(() => null);
  const assetsRoot = await fs.realpath(store.assetsPath).catch(() => null);
  if (packageRoot === null || assetsRoot === null || !isStrictlyInside(packageRoot, assetsRoot)) {
    return refused(
      'outside-assets',
      'The image files are outside the note, so nothing was moved.',
    );
  }
  const expectedPath = path.join(assetsRoot, assetId);
  const recordedPath = path.resolve(packageRoot, asset.path);
  if (recordedPath !== expectedPath || !isStrictlyInside(assetsRoot, recordedPath)) {
    return refused(
      'outside-assets',
      'The image files are outside the note, so nothing was moved.',
      `${asset.path} is not ${ASSETS_DIRECTORY}/${assetId}`,
    );
  }

  let stat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stat = await fs.lstat(expectedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // No bytes to preserve: the dead record is the whole problem.
      return { ok: true, trashed: false };
    }
    return refused(
      'trash-failed',
      'The image couldn’t be moved to the Trash.',
      `${expectedPath} · ${errorMessage(error)}`,
    );
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return refused(
      'outside-assets',
      'The image files are outside the note, so nothing was moved.',
      `${expectedPath} is not a regular file`,
    );
  }
  const realPath = await fs.realpath(expectedPath).catch(() => null);
  if (realPath === null || realPath !== expectedPath || !isStrictlyInside(assetsRoot, realPath)) {
    return refused(
      'outside-assets',
      'The image files are outside the note, so nothing was moved.',
      `${expectedPath} resolves outside ${ASSETS_DIRECTORY}`,
    );
  }

  try {
    await trashItem(expectedPath);
  } catch (error) {
    return refused(
      'trash-failed',
      'The image couldn’t be moved to the Trash.',
      `${expectedPath} · ${errorMessage(error)}`,
    );
  }
  return { ok: true, trashed: true };
}
