import { describe, expect, it } from 'vitest';
import type { Asset, ContentNode, Document } from '@noteforest/core';
import { createDocument } from '@noteforest/core';
import { buildEditorDocument, contentToPM, pmToContent, stripUnbackedImages } from '../src/renderer/src/lib/adapter';
import {
  contentWithImage,
  contentWithImageAlt,
  contentWithImageAsset,
  defaultImageAlt,
  firstImage,
  imageFilesFromDataTransfer,
  imageNodeFor,
  mimeForImageFile,
} from '../src/renderer/src/lib/image';

const ASSET_ID = 'a'.repeat(64);
const ASSET: Asset = {
  id: ASSET_ID,
  path: `assets/${ASSET_ID}`,
  mime: 'image/png',
  bytes: 12,
  width: 640,
  height: 360,
  originalName: 'forest.png',
};

function documentWith(content: ContentNode, assets: Record<string, Asset> = {}): Document {
  const document = createDocument({
    id: 'doc-image',
    chapterId: 'chapter-image',
    title: 'Image test',
  });
  const blockId = 'block-image';
  return {
    ...document,
    assets,
    blocks: {
      ...document.blocks,
      [blockId]: { id: blockId, content },
    },
    chapters: [
      { ...document.chapters[0]!, id: 'chapter-image', topLevelBlockIds: [blockId] },
    ],
  };
}

function findImage(node: unknown): Record<string, unknown> | null {
  if (typeof node !== 'object' || node === null) return null;
  const record = node as { type?: unknown; attrs?: Record<string, unknown>; content?: unknown[] };
  if (record.type === 'image') return record.attrs ?? {};
  for (const child of record.content ?? []) {
    const found = findImage(child);
    if (found !== null) return found;
  }
  return null;
}

describe('image editor projection', () => {
  const content: ContentNode = {
    type: 'doc',
    children: [
      {
        type: 'image',
        attrs: { assetId: ASSET_ID, alt: 'Forest plot', width: 640, height: 360 },
      },
    ],
  };

  it('resolves assetId to the local protocol URL and marks a present asset', () => {
    const projected = contentToPM(content.children?.[0] ?? content, {
      knownAssets: new Set([ASSET_ID]),
    });
    expect(projected.attrs?.['src']).toBe(`noteforest-asset://asset/${ASSET_ID}`);
    expect(projected.attrs?.['missing']).toBe(false);
    expect(projected.attrs?.['alt']).toBe('Forest plot');
  });

  it('projects a missing asset as placeholder metadata instead of throwing', () => {
    const document = documentWith(content);
    const editorDocument = buildEditorDocument(document, new Set());
    const attrs = findImage(editorDocument);
    expect(attrs).not.toBeNull();
    expect(attrs?.['missing']).toBe(true);
    expect(attrs?.['src']).toBe(`noteforest-asset://asset/${ASSET_ID}`);
  });

  it('renders a present image from the canonical assets map', () => {
    const document = documentWith(content, { [ASSET_ID]: ASSET });
    const attrs = findImage(buildEditorDocument(document, new Set()));
    expect(attrs?.['missing']).toBe(false);
    expect(attrs?.['assetId']).toBe(ASSET_ID);
  });

  it('strips display-only fields on the way back to canonical content', () => {
    const projected = contentToPM(content.children?.[0] ?? content, {
      knownAssets: new Set([ASSET_ID]),
    });
    const roundTripped = pmToContent(projected);
    expect(roundTripped).toEqual({
      type: 'image',
      attrs: { assetId: ASSET_ID, alt: 'Forest plot', width: 640, height: 360 },
    });
    expect(roundTripped.attrs?.['src']).toBeUndefined();
    expect(roundTripped.attrs?.['missing']).toBeUndefined();
  });

  it('keeps a legacy display src only when no assetId exists', () => {
    const legacy = pmToContent({ type: 'image', attrs: { src: 'asset.png', alt: 'Legacy' } });
    expect(legacy.attrs).toEqual({ src: 'asset.png', alt: 'Legacy' });
  });

  it('drops unbacked pasted images while keeping asset-backed copies', () => {
    const pasted = stripUnbackedImages({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
        { type: 'image', attrs: { src: 'https://example.com/remote.png', alt: 'remote' } },
        { type: 'image', attrs: { assetId: ASSET_ID, src: `noteforest-asset://asset/${ASSET_ID}` } },
      ],
    });
    expect(pasted?.content?.map((node) => node.type)).toEqual(['paragraph', 'image']);
    expect(pasted?.content?.[1]?.attrs?.['assetId']).toBe(ASSET_ID);
  });
});

describe('image content helpers', () => {
  const image = imageNodeFor({ assetId: ASSET_ID, alt: 'Forest', width: 640, height: 360 });

  it('inserts into an empty block and appends after real content', () => {
    const empty: ContentNode = { type: 'doc', children: [{ type: 'paragraph' }] };
    expect(contentWithImage(empty, image).children).toEqual([image]);

    const withText: ContentNode = {
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Before' }] }],
    };
    expect(contentWithImage(withText, image).children).toEqual([
      ...(withText.children ?? []),
      image,
    ]);
  });

  it('finds the first image and edits only its alt text', () => {
    const content: ContentNode = {
      type: 'doc',
      children: [
        { type: 'paragraph', children: [{ type: 'text', text: 'Caption' }] },
        image,
      ],
    };
    const found = firstImage(content);
    expect(found?.path).toEqual([1]);
    expect(found?.assetId).toBe(ASSET_ID);
    const edited = contentWithImageAlt(content, found?.path ?? [], 'New description');
    const imageAfter = edited.children?.[1];
    expect(imageAfter?.attrs).toEqual({
      assetId: ASSET_ID,
      alt: 'New description',
      width: 640,
      height: 360,
    });
    expect(edited.children?.[0]).toEqual(content.children?.[0]);
  });

  it('replaces the asset while preserving alt text and anchor-relevant metadata', () => {
    const content: ContentNode = { type: 'doc', children: [image] };
    const replacement: Asset = {
      id: 'b'.repeat(64),
      path: `assets/${'b'.repeat(64)}`,
      mime: 'image/png',
      bytes: 24,
      width: 1200,
      height: 200,
    };
    const replaced = contentWithImageAsset(content, [0], replacement);
    expect(replaced.children?.[0]?.attrs).toEqual({
      assetId: replacement.id,
      alt: 'Forest',
      width: 1200,
      height: 200,
    });
    expect(content.children?.[0]?.attrs?.['assetId']).toBe(ASSET_ID);
  });

  it('derives a readable default alt and file MIME', () => {
    expect(defaultImageAlt('forest-plot_2026.png')).toBe('forest plot 2026');
    expect(defaultImageAlt(undefined)).toBe('');
    const png = new File([new Uint8Array([1, 2, 3])], 'chart.png', { type: 'image/png' });
    expect(mimeForImageFile(png)).toBe('image/png');
    const unknown = new File([new Uint8Array([1])], 'notes.txt', { type: 'text/plain' });
    expect(mimeForImageFile(unknown)).toBeUndefined();
    expect(
      imageFilesFromDataTransfer({
        files: [png, unknown],
        items: [],
      } as unknown as DataTransfer),
    ).toEqual([png]);
  });
});
