/**
 * Image-anchor authoring geometry (M3c3b2).
 *
 * Canonical image selectors store a rect normalized to the image's intrinsic
 * dimensions, plus the crop the selection was made against. The editor works in
 * CSS pixels, so this module is the only bridge between a drag over the rendered
 * image and the durable 0–1 rect. Nothing here stores display pixels or touches
 * the DOM.
 */

import type {
  AnchorBinding,
  ImageAnchorSelector,
} from '@noteforest/core';
import { getNodeAtPath, imageAssetId } from '@noteforest/core';

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ClientPoint {
  x: number;
  y: number;
}

export interface ClientBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ImageAuthoringMode = 'region' | 'point';

export interface ImageAnchorDraft {
  blockId: string;
  nodePath: number[];
  assetId: string;
  rect: NormalizedRect;
  crop: NormalizedRect;
  point: boolean;
  label: string;
}

export type ImageAnchorBinding = Extract<AnchorBinding, { kind: 'image' }>;

export const FULL_IMAGE_CROP: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

const RECT_EPSILON = 1e-9;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundUnit(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function finiteUnit(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/** Read a normalized crop from image attrs; malformed/absent crop is full. */
export function cropFromImageAttrs(attrs: Record<string, unknown> | undefined): NormalizedRect {
  const crop = attrs?.['crop'];
  if (!isRecord(crop)) return { ...FULL_IMAGE_CROP };
  const x = finiteUnit(crop['x']);
  const y = finiteUnit(crop['y']);
  const width = finiteUnit(crop['width']);
  const height = finiteUnit(crop['height']);
  if (x === null || y === null || width === null || height === null) {
    return { ...FULL_IMAGE_CROP };
  }
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 + RECT_EPSILON || y + height > 1 + RECT_EPSILON) {
    return { ...FULL_IMAGE_CROP };
  }
  return { x, y, width, height };
}

/** True when a selector rect is a valid non-empty region or exact point. */
export function isValidImageSelection(rect: NormalizedRect, point: boolean): boolean {
  if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
    return false;
  }
  if (rect.x < 0 || rect.y < 0 || rect.width < 0 || rect.height < 0) return false;
  if (rect.x + rect.width > 1 + RECT_EPSILON || rect.y + rect.height > 1 + RECT_EPSILON) {
    return false;
  }
  if (point) return rect.width === 0 && rect.height === 0;
  return rect.width > 0 && rect.height > 0;
}

function clientToNormalized(point: ClientPoint, box: ClientBox): ClientPoint | null {
  if (box.width <= 0 || box.height <= 0) return null;
  return {
    x: clamp((point.x - box.left) / box.width, 0, 1),
    y: clamp((point.y - box.top) / box.height, 0, 1),
  };
}

function intrinsicFromDisplay(
  point: ClientPoint,
  crop: NormalizedRect,
): ClientPoint {
  return {
    x: crop.x + point.x * crop.width,
    y: crop.y + point.y * crop.height,
  };
}

/**
 * Map a click over the rendered image to an exact zero-size point selector.
 * The point is clamped to the visible image, never rounded into a 1-pixel
 * region, and `point` stays true exactly when width and height are zero.
 */
export function normalizedPointFromClient(
  box: ClientBox,
  point: ClientPoint,
  crop: NormalizedRect = FULL_IMAGE_CROP,
): NormalizedRect | null {
  const displayPoint = clientToNormalized(point, box);
  if (displayPoint === null) return null;
  const intrinsic = intrinsicFromDisplay(displayPoint, crop);
  const rect = {
    x: roundUnit(clamp(intrinsic.x, 0, 1)),
    y: roundUnit(clamp(intrinsic.y, 0, 1)),
    width: 0,
    height: 0,
  };
  return isValidImageSelection(rect, true) ? rect : null;
}

/**
 * Map a drag rectangle over the rendered image to a normalized intrinsic rect.
 * A region smaller than `minPixels` on either axis is rejected (an empty drag
 * is not a region); the result is clamped inside the image and never uses
 * display pixels.
 */
export function normalizedRegionFromClient(
  box: ClientBox,
  start: ClientPoint,
  end: ClientPoint,
  crop: NormalizedRect = FULL_IMAGE_CROP,
  minPixels = 3,
): NormalizedRect | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const left = clamp(Math.min(start.x, end.x), box.left, box.left + box.width);
  const top = clamp(Math.min(start.y, end.y), box.top, box.top + box.height);
  const right = clamp(Math.max(start.x, end.x), box.left, box.left + box.width);
  const bottom = clamp(Math.max(start.y, end.y), box.top, box.top + box.height);
  if (right - left < minPixels || bottom - top < minPixels) return null;

  const topLeft = clientToNormalized({ x: left, y: top }, box);
  const bottomRight = clientToNormalized({ x: right, y: bottom }, box);
  if (topLeft === null || bottomRight === null) return null;
  const intrinsicTopLeft = intrinsicFromDisplay(topLeft, crop);
  const intrinsicBottomRight = intrinsicFromDisplay(bottomRight, crop);

  const x = roundUnit(clamp(intrinsicTopLeft.x, 0, 1));
  const y = roundUnit(clamp(intrinsicTopLeft.y, 0, 1));
  const width = roundUnit(clamp(intrinsicBottomRight.x - intrinsicTopLeft.x, 0, 1 - x));
  const height = roundUnit(clamp(intrinsicBottomRight.y - intrinsicTopLeft.y, 0, 1 - y));
  const rect = { x, y, width, height };
  return isValidImageSelection(rect, false) ? rect : null;
}

/**
 * Project a normalized intrinsic rect into the visible image box. The result is
 * normalized to the displayed crop; a region fully outside the crop is null.
 * With the full-image crop (the only crop the M3 UI creates) this is identity.
 */
export function displayRectForAnchor(
  rect: NormalizedRect,
  crop: NormalizedRect = FULL_IMAGE_CROP,
): NormalizedRect | null {
  if (!isValidImageSelection(rect, rect.width === 0 && rect.height === 0)) return null;
  if (crop.width <= 0 || crop.height <= 0) return null;
  const displayX = (rect.x - crop.x) / crop.width;
  const displayY = (rect.y - crop.y) / crop.height;
  const displayWidth = rect.width / crop.width;
  const displayHeight = rect.height / crop.height;
  const left = clamp(displayX, 0, 1);
  const top = clamp(displayY, 0, 1);
  const right = clamp(displayX + displayWidth, 0, 1);
  const bottom = clamp(displayY + displayHeight, 0, 1);
  if (rect.width > 0 && (right <= left || bottom <= top)) return null;
  return {
    x: roundUnit(left),
    y: roundUnit(top),
    width: roundUnit(Math.max(0, right - left)),
    height: roundUnit(Math.max(0, bottom - top)),
  };
}

/** Label stored in the selector: alt text, with a stable generic fallback. */
export function imageAnchorLabel(alt: string | undefined): string {
  const clean = (alt ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > 0 ? clean : 'Image';
}

export function imageAnchorKindLabel(point: boolean): 'point' | 'region' {
  return point ? 'point' : 'region';
}

export function imageAnchorSelector(draft: ImageAnchorDraft): ImageAnchorSelector {
  return {
    kind: 'image',
    assetId: draft.assetId,
    rect: { ...draft.rect },
    crop: { ...draft.crop },
    point: draft.point,
    label: draft.label,
  };
}

export function imageAnchorBinding(draft: ImageAnchorDraft): ImageAnchorBinding {
  return {
    kind: 'image',
    nodePath: [...draft.nodePath],
    assetId: draft.assetId,
    rect: { ...draft.rect },
    crop: { ...draft.crop },
    point: draft.point,
  };
}

/** Image node/asset facts for one canonical block path; pure and total. */
export function imageAnchorTarget(
  content: Parameters<typeof getNodeAtPath>[0],
  nodePath: readonly number[],
): { assetId: string; alt: string; crop: NormalizedRect } | null {
  const node = getNodeAtPath(content, nodePath);
  if (node === null || node.type !== 'image') return null;
  const assetId = imageAssetId(node);
  if (assetId === null) return null;
  const alt = typeof node.attrs?.['alt'] === 'string' ? (node.attrs['alt'] as string) : '';
  return { assetId, alt, crop: cropFromImageAttrs(node.attrs) };
}
