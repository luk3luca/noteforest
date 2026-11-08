import { describe, expect, it } from 'vitest';
import { createDocument, type Document } from '@noteforest/core';
import { createEstimatedMeasurement } from '@noteforest/layout';
import { toLayoutDocument } from '../src/renderer/src/page/adapter';
import {
  blockingDefects,
  clampPageNumber,
  computePageModel,
} from '../src/renderer/src/page/model';

function longDocument(): Document {
  const document = createDocument({
    id: 'doc-page-model',
    chapterId: 'ch-1',
    title: 'Page model',
  });
  const chapter = document.chapters[0]!;
  const ids: string[] = [];
  for (let index = 0; index < 24; index += 1) {
    const id = `b${index}`;
    ids.push(id);
    document.blocks[id] = {
      id,
      label: `Block ${index + 1}`,
      content: {
        type: 'doc',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: `Paragraph ${index + 1}: ${'The quick brown fox jumps over the lazy dog. '.repeat(3)}`,
              },
            ],
          },
        ],
      },
    };
  }
  chapter.topLevelBlockIds = ids;
  return document;
}

describe('page model pure parts', () => {
  it('derives pages through the shared layout engine with default page settings', () => {
    const document = longDocument();
    const model = computePageModel(
      toLayoutDocument(document),
      createEstimatedMeasurement(toLayoutDocument(document)),
    );
    expect(model.pageCount).toBeGreaterThan(0);
    expect(model.pages[0]!.chapterId).toBe('ch-1');
    expect(model.layout.pageSetup).toEqual({
      size: 'A4',
      orientation: 'landscape',
      margins: { top: 12, right: 12, bottom: 12, left: 12 },
    });
    expect(model.layout.geometry.pageWidthMm).toBe(297);
    expect(model.layout.geometry.pageHeightMm).toBe(210);
    expect(model.measurementCalls).toBeGreaterThan(0);
    expect(model.empty).toBe(false);
    expect(model.pages.every((page) => page.fragments.length > 0)).toBe(true);
  });

  it('returns no derived pages for an empty document', () => {
    const empty = createDocument({
      id: 'doc-empty',
      chapterId: 'ch-empty',
      title: 'Empty',
    });
    empty.chapters[0]!.title = 'Empty chapter';
    const model = computePageModel(
      toLayoutDocument(empty),
      createEstimatedMeasurement(toLayoutDocument(empty)),
    );
    expect(model.pages).toEqual([]);
    expect(model.pageCount).toBe(0);
    expect(model.empty).toBe(true);
    expect(model.defects.some((defect) => defect.code === 'empty-chapter')).toBe(true);
  });

  it('clamps page numbers and filters blocking defects', () => {
    expect(clampPageNumber(0, 4)).toBe(1);
    expect(clampPageNumber(9, 4)).toBe(4);
    expect(clampPageNumber(2.6, 4)).toBe(3);
    expect(clampPageNumber(Number.NaN, 4)).toBe(1);
    expect(clampPageNumber(3, 0)).toBe(1);

    expect(
      blockingDefects([
        { code: 'missing-asset', severity: 'warning', message: 'w', blocksExport: false },
        { code: 'no-safe-break', severity: 'blocking', message: 'b', blocksExport: true },
      ]).map((defect) => defect.code),
    ).toEqual(['no-safe-break']);
  });
});
