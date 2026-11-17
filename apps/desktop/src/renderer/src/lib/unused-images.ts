/**
 * Unused images on Health (DR1b): the plan, the row text, the action copy.
 *
 * `planAssetGc` (core) is the single decision: an asset record is reclaimable
 * only when no image node, no image anchor, and no retained backup names it.
 * This module never re-implements that rule; it turns the plan into the rows the
 * sidebar and the confirm dialog render, and it owns the one source of the
 * strings, so the section, the dialog and the toast cannot drift.
 *
 * Nothing here touches the filesystem, the document, or a platform call.
 */

import { planAssetGc, type Asset, type Document } from '@noteforest/core';

export interface UnusedImageView {
  id: string;
  /** `originalName`, or the recorded path's last segment when it is absent. */
  name: string;
  mime: string;
  /** Recorded byte count; 0 when the record does not carry one. */
  bytes: number;
  /** `bytes` as a short human size, or empty when the record has no size. */
  size: string;
}

export const UNUSED_IMAGES_SECTION_TITLE = 'Unused images';

/**
 * The dialog list cap. It is the same limit the other record lists use
 * (`RecoverySurface` shows at most 20 lines): the count and the total above the
 * list always describe every row, so a cap never hides the decision.
 */
export const UNUSED_IMAGES_CONFIRM_LIMIT = 20;

/** Last path segment: `assets/<name>` → `<name>`. */
export function assetPathBasename(path: string): string {
  const parts = path.split('/').filter((part) => part.length > 0);
  return parts.at(-1) ?? path;
}

export function unusedImageName(asset: Asset): string {
  const original = asset.originalName?.trim() ?? '';
  if (original.length > 0) return original;
  return assetPathBasename(asset.path);
}

/**
 * Short binary byte size with one unit: `900 B`, `12.4 kB`, `3.1 MB`. The size
 * is informational, so a rounded value is enough and the exact byte count is
 * never shown.
 */
export function formatImageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    const kilobytes = bytes / 1024;
    return `${kilobytes >= 10 ? Math.round(kilobytes) : kilobytes.toFixed(1)} kB`;
  }
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

/**
 * The plan as rows, in a stable name order. `retainedAssetIds` must be the
 * backup scan for the same document; an absent scan is never treated as
 * "no backups" by the caller, so this function only maps what it is given.
 */
export function unusedImageViews(
  document: Document,
  retainedAssetIds: Iterable<string>,
): UnusedImageView[] {
  const plan = planAssetGc(document, { retainedAssetIds });
  const views: UnusedImageView[] = [];
  for (const id of plan.reclaimable) {
    const asset = document.assets[id];
    if (asset === undefined) continue;
    const bytes = asset.bytes ?? 0;
    views.push({
      id,
      name: unusedImageName(asset),
      mime: asset.mime,
      bytes,
      size: asset.bytes === undefined ? '' : formatImageBytes(bytes),
    });
  }
  return views.sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
  );
}

export function unusedImagesTotalBytes(views: readonly UnusedImageView[]): number {
  return views.reduce((total, view) => total + view.bytes, 0);
}

function imageCountText(count: number): string {
  return `${count} ${count === 1 ? 'image' : 'images'}`;
}

/** The section's footer action: `Clean up 3 unused images…`. */
export function unusedImagesActionLabel(count: number): string {
  return `Clean up ${count} unused ${count === 1 ? 'image' : 'images'}…`;
}

/** The confirm body's first line: the count and the total size. */
export function unusedImagesSummaryLine(count: number, totalBytes: number): string {
  return `${imageCountText(count)} · ${formatImageBytes(totalBytes)}`;
}

/** `and 5 more` under a capped dialog list; empty when everything is listed. */
export function unusedImagesMoreLine(hidden: number): string {
  return hidden <= 0 ? '' : `and ${hidden} more`;
}

/** Success line: what moved, and nothing else. */
export function unusedImagesMovedMessage(count: number): string {
  return `Moved ${imageCountText(count)} to the Trash.`;
}

/**
 * Failure line after an aborted pass: the assets already handled are named by
 * count, so the user knows the state without opening Details.
 */
export function unusedImagesPartialMessage(moved: number, total: number): string {
  if (moved === 0) return '';
  return `Moved ${moved} of ${total} unused images to the Trash. The rest stay in the note.`;
}
