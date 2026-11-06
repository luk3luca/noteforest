import { describe, expect, it } from 'vitest';
import type { ContentNode } from '@noteforest/core';
import {
  FULL_IMAGE_CROP,
  cropFromImageAttrs,
  displayRectForAnchor,
  imageAnchorBinding,
  imageAnchorLabel,
  imageAnchorSelector,
  imageAnchorTarget,
  isValidImageSelection,
  normalizedPointFromClient,
  normalizedRegionFromClient,
} from '../src/renderer/src/lib/image-anchor';

const BOX = { left: 100, top: 50, width: 400, height: 200 };

function imageContent(attrs: Record<string, unknown>): ContentNode {
  return { type: 'doc', children: [{ type: 'image', attrs }] };
}

describe('image anchor geometry', () => {
  it('maps a click to an exact zero-size point normalized to intrinsic dimensions', () => {
    const rect = normalizedPointFromClient(BOX, { x: 300, y: 150 });
    expect(rect).toEqual({ x: 0.5, y: 0.5, width: 0, height: 0 });
    expect(rect).not.toBeNull();
    expect(isValidImageSelection(rect!, true)).toBe(true);
    expect(isValidImageSelection(rect!, false)).toBe(false);
  });

  it('maps a point and a region through a crop into intrinsic coordinates', () => {
    const crop = { x: 0.25, y: 0.5, width: 0.5, height: 0.5 };
    const point = normalizedPointFromClient(BOX, { x: 100, y: 50 }, crop);
    expect(point).toEqual({ x: 0.25, y: 0.5, width: 0, height: 0 });

    const region = normalizedRegionFromClient(
      BOX,
      { x: 140, y: 70 },
      { x: 300, y: 150 },
      crop,
    );
    expect(region).not.toBeNull();
    expect(region).toMatchObject({ x: 0.3, y: 0.55, width: 0.2, height: 0.2 });
    expect(displayRectForAnchor(region!, crop)).toMatchObject({
      x: 0.1,
      y: 0.1,
      width: 0.4,
      height: 0.4,
    });
  });

  it('clamps a drag to the rendered image and rejects an empty region', () => {
    const clamped = normalizedRegionFromClient(
      BOX,
      { x: 90, y: 40 },
      { x: 520, y: 260 },
    );
    expect(clamped).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(normalizedRegionFromClient(BOX, { x: 200, y: 100 }, { x: 201, y: 101 })).toBeNull();
    expect(normalizedRegionFromClient(BOX, { x: 200, y: 100 }, { x: 200, y: 100 })).toBeNull();
  });

  it('builds the canonical selector/binding with a full crop and a durable label', () => {
    const draft = {
      blockId: 'block',
      nodePath: [0],
      assetId: 'a'.repeat(64),
      rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      crop: FULL_IMAGE_CROP,
      point: false,
      label: imageAnchorLabel('  Forest   plot '),
    };
    expect(imageAnchorSelector(draft)).toEqual({
      kind: 'image',
      assetId: 'a'.repeat(64),
      rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      crop: { x: 0, y: 0, width: 1, height: 1 },
      point: false,
      label: 'Forest plot',
    });
    expect(imageAnchorBinding(draft)).toEqual({
      kind: 'image',
      nodePath: [0],
      assetId: 'a'.repeat(64),
      rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      crop: { x: 0, y: 0, width: 1, height: 1 },
      point: false,
    });
  });

  it('rejects invalid point/region geometry and malformed crops', () => {
    expect(isValidImageSelection({ x: 0.2, y: 0.2, width: 0, height: 0 }, true)).toBe(true);
    expect(isValidImageSelection({ x: 0.2, y: 0.2, width: 0, height: 0 }, false)).toBe(false);
    expect(isValidImageSelection({ x: 0.2, y: 0.2, width: 0.1, height: 0 }, true)).toBe(false);
    expect(isValidImageSelection({ x: -0.1, y: 0, width: 0.2, height: 0.2 }, false)).toBe(false);
    expect(isValidImageSelection({ x: 0.9, y: 0, width: 0.2, height: 0.2 }, false)).toBe(false);
    expect(cropFromImageAttrs({ crop: { x: 0, y: 0, width: 0, height: 1 } })).toEqual(
      FULL_IMAGE_CROP,
    );
    expect(displayRectForAnchor({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 })).toEqual({
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.2,
    });
  });

  it('reads the image node target without inventing an asset', () => {
    const content = imageContent({ assetId: 'asset-1', alt: 'Diagram' });
    expect(imageAnchorTarget(content, [0])).toEqual({
      assetId: 'asset-1',
      alt: 'Diagram',
      crop: FULL_IMAGE_CROP,
    });
    expect(imageAnchorTarget(imageContent({ alt: 'No asset' }), [0])).toBeNull();
    expect(imageAnchorTarget(content, [1])).toBeNull();
  });
});
