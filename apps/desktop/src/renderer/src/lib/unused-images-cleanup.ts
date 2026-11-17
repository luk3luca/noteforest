/**
 * The unused-image cleanup pass (DR1b).
 *
 * The order per asset is the decision of 17 November 2026:
 *
 * 1. re-plan and re-check the reference guard immediately before acting, so a
 *    stale list can never delete something that became referenced;
 * 2. move `assets/<id>` to the OS Trash through the main process (never an
 *    unlink, and the path is confined there);
 * 3. remove the record with the existing guarded `asset.remove` command.
 *
 * If step 3 fails after step 2 the record stays and the existing missing-asset
 * state (placeholder + broken anchor) is the accepted end state; the bytes are
 * in the Trash. The pass aborts on the first failure and reports how many
 * assets it handled.
 *
 * Pure with injected ports, so the ordering, the skip rule and the abort are
 * unit-tested without Electron, files, or a document store.
 */

import { imageAssetReferences, planAssetGc, type Document } from '@noteforest/core';
import { unusedImagesMovedMessage, unusedImagesPartialMessage } from './unused-images';

export interface UnusedCleanupPorts {
  /** Fresh backup scan, run once at the start of the pass. */
  backupAssetIds(): Promise<
    { ok: true; assetIds: string[] } | { ok: false; message: string; details?: string }
  >;
  /** The live canonical document at call time. */
  document(): Document;
  /** Move one unused file to the OS Trash (main process confinement). */
  trash(
    assetId: string,
  ): Promise<{ ok: true; trashed: boolean } | { ok: false; message: string; details?: string }>;
  /** Remove one asset record through the guarded command. */
  removeRecord(
    assetId: string,
  ): Promise<{ ok: boolean; message?: string; details?: string }>;
}

export interface UnusedCleanupFailure {
  assetId: string;
  message: string;
  details?: string;
}

export interface UnusedCleanupResult {
  ok: boolean;
  /** Assets whose bytes moved and whose record is gone, in order. */
  moved: string[];
  /** Assets that were no longer reclaimable at action time; never touched. */
  skipped: string[];
  /** The asset the pass stopped on, when it failed. */
  failed: UnusedCleanupFailure | null;
  /** One short line for the toast; empty only when there is nothing to say. */
  message: string;
  /** Technical line for `Details`: the failed step's path or OS error. */
  details?: string;
}

export async function cleanUnusedImages(
  assetIds: readonly string[],
  ports: UnusedCleanupPorts,
): Promise<UnusedCleanupResult> {
  const requested = [...new Set(assetIds)];
  const moved: string[] = [];
  const skipped: string[] = [];

  const scan = await ports.backupAssetIds();
  if (!scan.ok) {
    return {
      ok: false,
      moved,
      skipped,
      failed: null,
      message: scan.message,
      ...(scan.details === undefined ? {} : { details: scan.details }),
    };
  }
  const retained = new Set(scan.assetIds);

  const stopped = (assetId: string, message: string, details?: string): UnusedCleanupResult => ({
    ok: false,
    moved,
    skipped,
    failed: { assetId, message, ...(details === undefined ? {} : { details }) },
    message:
      unusedImagesPartialMessage(moved.length, requested.length) || message,
    ...(details === undefined ? {} : { details }),
  });

  for (const assetId of requested) {
    // Re-plan immediately before acting: the document and the backup set are
    // the inputs, and a record that became referenced is simply skipped.
    const document = ports.document();
    const reclaimable = new Set(
      planAssetGc(document, { retainedAssetIds: retained }).reclaimable,
    );
    if (!reclaimable.has(assetId) || imageAssetReferences(document, assetId).length > 0) {
      skipped.push(assetId);
      continue;
    }

    const trashed = await ports.trash(assetId);
    if (!trashed.ok) {
      return stopped(
        assetId,
        trashed.message,
        trashed.details,
      );
    }

    // Only after the bytes are safely in the Trash is the record removed. A
    // failure here leaves the missing-asset state, never a record-only delete.
    const removed = await ports.removeRecord(assetId);
    if (!removed.ok) {
      return stopped(
        assetId,
        removed.message ?? 'The image couldn’t be removed.',
        removed.details,
      );
    }
    moved.push(assetId);
  }

  return {
    ok: true,
    moved,
    skipped,
    failed: null,
    message:
      moved.length > 0
        ? unusedImagesMovedMessage(moved.length)
        : requested.length === 0
          ? ''
          : 'Nothing was removed. These images are in use again.',
  };
}
