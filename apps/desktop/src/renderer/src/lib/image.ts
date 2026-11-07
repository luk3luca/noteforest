/**
 * Pure helpers for image content.
 *
 * Canonical image nodes store only `assetId` (plus optional alt and intrinsic
 * dimensions). These functions build and edit that canonical shape; they never
 * touch the DOM or the filesystem.
 */

import type { Asset, AssetAvailabilityIndex, ContentNode } from '@noteforest/core';
import { withNodeAtPath } from '@noteforest/core';
import { imageMimeFromName } from '../../../shared/images';

export interface ContentImage {
  path: number[];
  node: ContentNode;
  assetId: string;
  alt: string;
  width: number | undefined;
  height: number | undefined;
}

export interface NewImageNode {
  assetId: string;
  alt?: string;
  width?: number;
  height?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringAttr(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function dimensionAttr(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

/** The first image node in block content, with its path from the content root. */
export function firstImage(content: ContentNode): ContentImage | null {
  return imagesInContent(content)[0] ?? null;
}

/**
 * Every image node in block content in document order, each with its canonical
 * path. Block menus that expose image actions must use the path of the image the
 * user selected, not always `firstImage`.
 */
export function imagesInContent(content: ContentNode): ContentImage[] {
  const images: ContentImage[] = [];
  const walk = (node: ContentNode, path: number[]): void => {
    if (node.type === 'image') {
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      images.push({
        path,
        node,
        assetId: stringAttr(attrs['assetId']),
        alt: stringAttr(attrs['alt']),
        width: dimensionAttr(attrs['width']),
        height: dimensionAttr(attrs['height']),
      });
      return;
    }
    for (const [index, child] of (node.children ?? []).entries()) {
      walk(child, [...path, index]);
    }
  };
  walk(content, []);
  return images;
}

/** Human label for an image action: its alt text, or `Image N`. */
export function imageActionLabel(image: ContentImage, index: number): string {
  const alt = image.alt.trim();
  return alt.length === 0 ? `Image ${index + 1}` : `Image ${index + 1} (${alt})`;
}

/** Why image region/point authoring is unavailable for one image node. */
export type ImageAuthoringBlockReason =
  | 'read-only'
  | 'asset-record-missing'
  | 'asset-missing'
  | 'asset-changed';

export interface ImageAuthoringGate {
  allowed: boolean;
  reason?: ImageAuthoringBlockReason;
}

/**
 * Authoring a region/point needs a rendered image: an editable document, an
 * asset record, and no session availability problem. The availability index
 * only stores non-available states, so an absent entry means "not observed as
 * unavailable" (the same rule the projection and anchor resolver use).
 */
export function imageAnchorAuthoringGate(input: {
  editable: boolean;
  assetId: string;
  hasAssetRecord: boolean;
  availability: AssetAvailabilityIndex | undefined;
}): ImageAuthoringGate {
  if (!input.editable) return { allowed: false, reason: 'read-only' };
  if (input.assetId.length === 0 || !input.hasAssetRecord) {
    return { allowed: false, reason: 'asset-record-missing' };
  }
  const state = input.availability?.[input.assetId];
  if (state === 'asset-changed') return { allowed: false, reason: 'asset-changed' };
  if (state !== undefined && state !== 'available') {
    return { allowed: false, reason: 'asset-missing' };
  }
  return { allowed: true };
}

/** Menu suffix naming the disabled reason; empty when authoring is allowed. */
export function imageAuthoringDisabledSuffix(
  reason: ImageAuthoringBlockReason | undefined,
): string {
  switch (reason) {
    case 'read-only':
      return ' — document is read-only';
    case 'asset-record-missing':
      return ' — image asset missing';
    case 'asset-missing':
      return ' — image file missing';
    case 'asset-changed':
      return ' — image asset changed';
    default:
      return '';
  }
}

/** A paragraph with no text and no inline children is the empty-block case. */
function isEmptyParagraph(node: ContentNode): boolean {
  if (node.type !== 'paragraph') return false;
  if ((node.marks ?? []).length > 0) return false;
  const children = node.children ?? [];
  if (children.length === 0) return true;
  return children.every(
    (child) => child.type === 'text' && (child.text ?? '').length === 0,
  );
}

/** Canonical image node for a freshly copied asset. */
export function imageNodeFor(input: NewImageNode): ContentNode {
  const attrs: Record<string, unknown> = { assetId: input.assetId };
  if (input.alt !== undefined) attrs['alt'] = input.alt;
  if (input.width !== undefined) attrs['width'] = input.width;
  if (input.height !== undefined) attrs['height'] = input.height;
  return { type: 'image', attrs };
}

/**
 * Insert an image into a block body. An empty block becomes the image; a block
 * with content appends the image after its existing body (the block menu path).
 */
export function contentWithImage(
  content: ContentNode,
  image: ContentNode,
): ContentNode {
  const children = [...(content.children ?? [])];
  if (children.length === 0 || children.every(isEmptyParagraph)) {
    return { ...content, type: 'doc', children: [image] };
  }
  return { ...content, type: 'doc', children: [...children, image] };
}

/** Replace the alt text of the image at `path`; every other attribute survives. */
export function contentWithImageAlt(
  content: ContentNode,
  path: readonly number[],
  alt: string,
): ContentNode {
  return withNodeAtPath(content, path, (node) => {
    if (node.type !== 'image') return node;
    const attrs = { ...(node.attrs ?? {}) };
    if (alt.length === 0) delete attrs['alt'];
    else attrs['alt'] = alt;
    return { ...node, attrs };
  });
}

/**
 * Point an existing image node at a new asset. The old alt text is deliberately
 * preserved: replacing the bytes must never delete user-authored text, and the
 * old image anchors become broken because their selector keeps the old assetId.
 * A repair marker only describes a placeholder, so `unavailable` and the
 * editor-only `clipboardAssetId` are dropped once an asset id exists.
 */
export function contentWithImageAsset(
  content: ContentNode,
  path: readonly number[],
  asset: Asset,
): ContentNode {
  return withNodeAtPath(content, path, (node) => {
    if (node.type !== 'image') return node;
    const attrs: Record<string, unknown> = { ...(node.attrs ?? {}) };
    delete attrs['unavailable'];
    delete attrs['clipboardAssetId'];
    attrs['assetId'] = asset.id;
    if (asset.width === undefined) delete attrs['width'];
    else attrs['width'] = asset.width;
    if (asset.height === undefined) delete attrs['height'];
    else attrs['height'] = asset.height;
    return { ...node, attrs };
  });
}

/** Human-readable default alt from a filename; the user can edit it later. */
export function defaultImageAlt(originalName: string | undefined): string {
  if (originalName === undefined || originalName.length === 0) return '';
  const withoutExtension = originalName.replace(/\.[^.]+$/, '');
  const words = withoutExtension.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words.length === 0 ? '' : words;
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return imageMimeFromName(file.name) !== undefined;
}

/**
 * Image files from a paste or drop. `files` is the common path; `items` covers
 * clipboards that expose a file only through the item list.
 */
export function imageFilesFromDataTransfer(data: DataTransfer | null): File[] {
  if (data === null) return [];
  const files = [...data.files];
  if (files.length === 0 && data.items.length > 0) {
    for (const item of data.items) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file !== null) files.push(file);
    }
  }
  const seen = new Set<string>();
  const images: File[] = [];
  for (const file of files) {
    if (!isImageFile(file)) continue;
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    images.push(file);
  }
  return images;
}

/** MIME type for a pasted/dropped file, accepting a correct `File.type` first. */
export function mimeForImageFile(file: File): string | undefined {
  if (file.type.startsWith('image/')) return file.type;
  return imageMimeFromName(file.name);
}
