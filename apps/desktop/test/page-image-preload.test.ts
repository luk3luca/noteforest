import { describe, expect, it } from 'vitest';
import type { ContentBlock, ContentNode } from '@noteforest/layout';
import { imageAssetIdsToPreload } from '../src/renderer/src/page/measurement';
import { buildSegments, type SegmentOptions } from '../src/renderer/src/page/segments';

const urls: Record<string, string> = {
  'image-known': 'noteforest-asset://asset/image-known',
  'image-unknown': 'noteforest-asset://asset/image-unknown',
  'image-width-only': 'noteforest-asset://asset/image-width-only',
  'image-height-only': 'noteforest-asset://asset/image-height-only',
  'image-zero-height': 'noteforest-asset://asset/image-zero-height',
  unreferenced: 'noteforest-asset://asset/unreferenced',
};

function image(attrs: Record<string, unknown>): ContentNode {
  return { type: 'image', attrs };
}

function paragraph(...children: ContentNode[]): ContentNode {
  return { type: 'paragraph', children };
}

function block(id: string, children: ContentNode[]): ContentBlock {
  return { id, content: { type: 'doc', children } };
}

describe('page measurement image preload set', () => {
  it('never requests an image that renders from intrinsic width and height attributes', () => {
    const blocks = [
      block('known', [
        image({ assetId: 'image-known', alt: 'Known', width: 640, height: 360 }),
      ]),
    ];
    expect(imageAssetIdsToPreload(blocks, urls)).toEqual([]);
  });

  it('preloads only images whose rendered markup lacks a dimension', () => {
    const blocks = [
      block('images', [
        image({ assetId: 'image-known', width: 640, height: 360 }),
        image({ assetId: 'image-unknown', alt: 'No dimensions' }),
        image({ assetId: 'image-width-only', width: 320 }),
        image({ assetId: 'image-height-only', height: 200 }),
        image({ assetId: 'image-zero-height', width: 320, height: 0 }),
        image({ alt: 'No asset id' }),
        image({ assetId: 'asset-without-url', width: 100, height: 100 }),
      ]),
    ];
    expect(imageAssetIdsToPreload(blocks, urls)).toEqual([
      'image-unknown',
      'image-width-only',
      'image-height-only',
      'image-zero-height',
    ]);
  });

  it('finds nested image nodes and dedupes one asset referenced more than once', () => {
    const nested: ContentNode = {
      type: 'table',
      children: [
        {
          type: 'tableRow',
          children: [
            {
              type: 'tableCell',
              children: [
                paragraph(image({ assetId: 'image-unknown', alt: 'Cell image' })),
              ],
            },
          ],
        },
      ],
    };
    const blocks = [
      block('a', [paragraph(image({ assetId: 'image-unknown' })), nested]),
      block('b', [image({ assetId: 'image-unknown' })]),
    ];
    expect(imageAssetIdsToPreload(blocks, urls)).toEqual(['image-unknown']);
  });

  it('keeps the dimensioned image box while dropping its measurement-only source', () => {
    const known = block('known', [
      image({ assetId: 'image-known', alt: 'Known', width: 640, height: 360 }),
    ]);
    const measurementOptions: SegmentOptions = {
      assets: urls,
      tableColumns: {},
      listIndent: 18,
      requestIntrinsicImages: false,
    };
    const [measured] = buildSegments(known, measurementOptions);
    expect(measured!.html).not.toContain('src=');
    expect(measured!.html).toContain('width="640"');
    expect(measured!.html).toContain('height="360"');

    const [page] = buildSegments(known, {
      ...measurementOptions,
      requestIntrinsicImages: undefined,
    });
    expect(page!.html).toContain('src="noteforest-asset://asset/image-known"');

    const [partial] = buildSegments(
      block('partial', [image({ assetId: 'image-width-only', width: 320 })]),
      measurementOptions,
    );
    expect(partial!.html).toContain('src="noteforest-asset://asset/image-width-only"');
  });

  it('returns no preload work for an empty document or an empty asset map', () => {
    expect(imageAssetIdsToPreload([], urls)).toEqual([]);
    expect(
      imageAssetIdsToPreload(
        [block('known', [image({ assetId: 'image-known', width: 640, height: 360 })])],
        {},
      ),
    ).toEqual([]);
  });
});
