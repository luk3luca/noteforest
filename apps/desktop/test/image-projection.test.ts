import { describe, expect, it } from 'vitest';
import type { Asset, ContentNode, Document } from '@noteforest/core';
import { createDocument } from '@noteforest/core';
import { buildEditorDocument, contentToPM, markCrossDocumentImages, pmToContent, stripUnbackedImages } from '../src/renderer/src/lib/adapter';
import {
  contentWithImage,
  contentWithImageAlt,
  contentWithImageAsset,
  defaultImageAlt,
  firstImage,
  imageActionLabel,
  imageFilesFromDataTransfer,
  imageNodeFor,
  imagesInContent,
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

function findCallout(node: unknown): Record<string, unknown> | null {
  if (typeof node !== 'object' || node === null) return null;
  const record = node as { type?: unknown; attrs?: Record<string, unknown>; content?: unknown[] };
  if (record.attrs?.['callout'] === true) return record.attrs;
  for (const child of record.content ?? []) {
    const found = findCallout(child);
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

  it('projects a missing file or changed hash as missing without dropping the record', () => {
    const document = documentWith(content, { [ASSET_ID]: ASSET });
    for (const state of ['asset-missing', 'asset-changed'] as const) {
      const attrs = findImage(
        buildEditorDocument(document, new Set(), new Set(), { [ASSET_ID]: state }),
      );
      expect(attrs?.['missing'], state).toBe(true);
      expect(attrs?.['assetId'], state).toBe(ASSET_ID);
      expect(attrs?.['src'], state).toBe(`noteforest-asset://asset/${ASSET_ID}`);
      // Canonical dimensions stay in the document; the placeholder never uses
      // them, and the projection must not rewrite stored metadata.
      expect(attrs?.['width'], state).toBe(640);
      expect(attrs?.['height'], state).toBe(360);
    }
  });

  it('keeps the callout state in sync with session image availability', () => {
    const document = documentWith(content, { [ASSET_ID]: ASSET });
    const blockId = 'block-image';
    const childId = 'block-child';
    document.blocks[childId] = {
      id: childId,
      content: { type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Child' }] }] },
    };
    document.anchors['anchor-image'] = {
      id: 'anchor-image',
      blockId,
      kind: 'image',
      selector: {
        kind: 'image',
        assetId: ASSET_ID,
        rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        point: false,
      },
    };
    document.branches['branch-image'] = {
      id: 'branch-image',
      source: { blockId, anchorId: 'anchor-image' },
      targetBlockId: childId,
      role: 'primary',
      order: 'a1',
    };
    const editorDocument = buildEditorDocument(document, new Set(), new Set(), {
      [ASSET_ID]: 'asset-changed',
    });
    const callout = findCallout(editorDocument);
    expect(callout?.['anchorState']).toBe('broken');
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

  it('drops a legacy src with no assetId but preserves alt text', () => {
    const legacy = pmToContent({ type: 'image', attrs: { src: 'asset.png', alt: 'Legacy' } });
    expect(legacy.attrs).toEqual({ alt: 'Legacy' });
    expect(legacy.attrs?.['src']).toBeUndefined();
  });

  it('projects a src-only legacy image as a labeled placeholder and never exposes its path', () => {
    const projected = contentToPM({
      type: 'image',
      attrs: { src: 'file:///Users/luca/secret/forest.png', alt: 'Legacy local' },
    });
    expect(projected.attrs?.['src']).toBeUndefined();
    expect(projected.attrs?.['missing']).toBe(true);
    expect(projected.attrs?.['missingReason']).toBe('unsupported-src');
    expect(projected.attrs?.['alt']).toBe('Legacy local');
  });

  it('drops display-only image fields on the way back to canonical content', () => {
    const legacy = pmToContent({
      type: 'image',
      attrs: {
        src: 'data:image/png;base64,AAAA',
        alt: 'Embedded',
        missing: true,
        missingReason: 'unsupported-src',
        title: 'old',
      },
    });
    expect(legacy.attrs).toEqual({ alt: 'Embedded' });
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

  it('marks a pasted image from another package as a pending placeholder without its assetId', () => {
    const pasted = markCrossDocumentImages(
      {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              assetId: ASSET_ID,
              src: `noteforest-asset://asset/${ASSET_ID}`,
              alt: 'Forest',
              width: 640,
              height: 360,
            },
          },
          { type: 'image', attrs: { assetId: 'b'.repeat(64), alt: 'Local' } },
        ],
      },
      new Set(['b'.repeat(64)]),
    );
    const foreign = pasted.content?.[0];
    expect(foreign?.attrs?.['assetId']).toBeUndefined();
    expect(foreign?.attrs?.['clipboardAssetId']).toBe(ASSET_ID);
    expect(foreign?.attrs?.['src']).toBeUndefined();
    expect(foreign?.attrs?.['alt']).toBe('Forest');
    expect(foreign?.attrs?.['width']).toBe(640);
    const local = pasted.content?.[1];
    expect(local?.attrs?.['assetId']).toBe('b'.repeat(64));
    expect(local?.attrs?.['clipboardAssetId']).toBeUndefined();
    // The pending id is editor-only and never reaches canonical content.
    expect(pmToContent(foreign ?? { type: 'image' }).attrs?.['clipboardAssetId']).toBeUndefined();
  });

  it('keeps a durable cross-document placeholder label without an assetId', () => {
    const projected = contentToPM({
      type: 'image',
      attrs: { alt: 'Forest', unavailable: 'cross-document-copy' },
    });
    expect(projected.attrs?.['missing']).toBe(true);
    expect(projected.attrs?.['missingReason']).toBe('cross-document-copy');
    expect(projected.attrs?.['unavailable']).toBe('cross-document-copy');
    const canonical = pmToContent(projected);
    expect(canonical.attrs).toEqual({ alt: 'Forest', unavailable: 'cross-document-copy' });
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

  it('finds every image with its canonical path for per-image menus', () => {
    const second = imageNodeFor({ assetId: 'b'.repeat(64), alt: 'Chart' });
    const content: ContentNode = {
      type: 'doc',
      children: [{ type: 'paragraph' }, image, { type: 'paragraph' }, second],
    };
    const images = imagesInContent(content);
    expect(images.map((entry) => entry.path)).toEqual([[1], [3]]);
    expect(images.map((entry) => entry.assetId)).toEqual([ASSET_ID, 'b'.repeat(64)]);
    expect(imageActionLabel(images[0]!, 0)).toBe('Image 1 (Forest)');
    expect(imageActionLabel(images[1]!, 1)).toBe('Image 2 (Chart)');

    // The second path edits only the second image.
    const edited = contentWithImageAlt(content, images[1]!.path, 'Chart 2026');
    expect(edited.children?.[1]?.attrs?.['alt']).toBe('Forest');
    expect(edited.children?.[3]?.attrs?.['alt']).toBe('Chart 2026');
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
