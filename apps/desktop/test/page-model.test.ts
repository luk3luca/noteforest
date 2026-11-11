import { describe, expect, it } from 'vitest';
import { createDocument, type Document } from '@noteforest/core';
import {
  DEFAULT_PAGE_SETTINGS,
  createEstimatedMeasurement,
  normalizePageSettings,
  pageLayoutOptions,
} from '@noteforest/layout';
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
      DEFAULT_PAGE_SETTINGS,
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

  it('passes the resolved A5 setup and personal manual breaks into layout + pagination', () => {
    const document = createDocument({
      id: 'doc-settings-model',
      chapterId: 'ch-settings',
      title: 'Settings model',
    });
    const chapter = document.chapters[0]!;
    for (const id of ['b1', 'b2']) {
      document.blocks[id] = {
        id,
        label: id,
        content: {
          type: 'doc',
          children: [{ type: 'paragraph', children: [{ type: 'text', text: `Short ${id}.` }] }],
        },
      };
    }
    chapter.topLevelBlockIds = ['b1', 'b2'];
    const settings = normalizePageSettings({
      setup: { size: 'A5', orientation: 'portrait' },
      manualBreakBeforeBlockIds: ['b2'],
    });
    const note = toLayoutDocument(document);
    const model = computePageModel(
      note,
      createEstimatedMeasurement(note),
      settings,
    );
    expect(model.layout.pageSetup).toEqual({
      size: 'A5',
      orientation: 'portrait',
      margins: { top: 12, right: 12, bottom: 12, left: 12 },
    });
    expect(model.layout.geometry.pageWidthMm).toBe(148);
    expect(model.layout.geometry.pageHeightMm).toBe(210);
    expect(model.pageCount).toBe(2);
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
      DEFAULT_PAGE_SETTINGS,
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

describe('Page density model lens (M4d1/M4e2)', () => {
  it('feeds the density lens into layout options and the model fingerprint', () => {
    const document = longDocument();
    const note = toLayoutDocument(document);
    const lowest = normalizePageSettings({ theme: { density: 0.6 } });
    const low = normalizePageSettings({ theme: { density: 0.8 } });
    const high = normalizePageSettings({ theme: { density: 1.2 } });
    const lowestModel = computePageModel(
      note,
      createEstimatedMeasurement(note, pageLayoutOptions(lowest.theme)),
      lowest,
    );
    const lowModel = computePageModel(
      note,
      createEstimatedMeasurement(note, pageLayoutOptions(low.theme)),
      low,
    );
    const highModel = computePageModel(
      note,
      createEstimatedMeasurement(note, pageLayoutOptions(high.theme)),
      high,
    );
    expect(lowestModel.layout.layoutOptions).toEqual(pageLayoutOptions(lowest.theme));
    expect(lowestModel.layout.layoutOptions).toMatchObject({
      cardPadding: 4.8,
      minContentWidth: 140,
      maxContentWidth: 252,
    });
    expect(lowModel.layout.layoutOptions).toEqual(pageLayoutOptions(low.theme));
    expect(highModel.layout.layoutOptions).toEqual(pageLayoutOptions(high.theme));
    expect(lowModel.layout.layoutOptions?.cardPadding).toBe(6.4);
    expect(highModel.layout.layoutOptions?.cardPadding).toBe(9.6);
    expect(lowestModel.layout.geometry).toEqual(highModel.layout.geometry);
    expect(lowestModel.settingsFingerprint).not.toBe(lowModel.settingsFingerprint);
    expect(lowModel.settingsFingerprint).not.toBe(highModel.settingsFingerprint);
    expect(lowestModel.pages.length).toBeGreaterThan(0);
    expect(lowModel.pages.length).toBeGreaterThan(0);
    expect(highModel.pages.length).toBeGreaterThan(0);
  });

  it('includes chrome in the model fingerprint without changing page geometry or pages', () => {
    const document = longDocument();
    const note = toLayoutDocument(document);
    const base = normalizePageSettings({});
    const chrome = normalizePageSettings({
      chrome: { header: 'none', footer: 'document', pageNumber: false },
    });
    const baseModel = computePageModel(
      note,
      createEstimatedMeasurement(note),
      base,
    );
    const chromeModel = computePageModel(
      note,
      createEstimatedMeasurement(note),
      chrome,
    );
    expect(chromeModel.settingsFingerprint).not.toBe(baseModel.settingsFingerprint);
    expect(chromeModel.pages).toEqual(baseModel.pages);
    expect(chromeModel.layout.geometry).toEqual(baseModel.layout.geometry);
  });
});
