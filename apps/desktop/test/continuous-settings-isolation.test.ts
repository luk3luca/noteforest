import { describe, expect, it } from 'vitest';
import {
  buildPageEdgeModel,
  CONTINUOUS_EDGE_STYLE,
  continuousCssVariables,
  continuousEdgeStyle,
  createEstimatedMeasurement,
  DEFAULT_CONTINUOUS_SETTINGS,
  DEFAULT_PAGE_SETTINGS,
  layoutDocument,
  normalizeContinuousSettings,
  pageCssVariables,
  pageLayoutOptions,
  pageSettingsFingerprint,
  paginate,
  type ContentBlock,
  type NoteDocument,
} from '@noteforest/layout';
import { buildPrintModel, type PrintModel } from '@noteforest/pdf';

/**
 * R6 Page/PDF isolation.
 *
 * Continuous settings write only the Continuous CSS variables and the
 * resolved Continuous edge style. This suite changes every Continuous field,
 * applies the resolved style to the shared Continuous object (the strongest
 * possible leak), and proves the Page layout, page count, Page edge model, and
 * complete print model are byte-identical.
 */

const ROOT_TEXT = 'A root with an anchored callout and two direct children.';
const QUOTE = 'anchored callout';

function paragraph(text: string) {
  return { type: 'paragraph', children: [{ type: 'text', text }] };
}

function textBlock(id: string, text: string): ContentBlock {
  return { id, label: id, content: { type: 'doc', children: [paragraph(text)] } };
}

function fixtureDocument(): NoteDocument {
  const start = ROOT_TEXT.indexOf(QUOTE);
  return {
    schemaVersion: 2,
    id: 'continuous-settings-isolation',
    title: 'Continuous settings isolation',
    createdAt: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T00:00:00.000Z',
    revision: 0,
    blocks: {
      root: {
        id: 'root',
        label: 'Root',
        content: {
          type: 'doc',
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', text: ROOT_TEXT.slice(0, start) },
                {
                  type: 'text',
                  text: QUOTE,
                  marks: [{ type: 'anchor', attrs: { anchorId: 'anchor-1' } }],
                },
                { type: 'text', text: ROOT_TEXT.slice(start + QUOTE.length) },
              ],
            },
          ],
        },
      },
      child1: textBlock('child1', 'First direct child.'),
      child2: textBlock('child2', 'Second direct child.'),
      callout: textBlock('callout', 'An anchored callout.'),
    },
    anchors: {
      'anchor-1': {
        id: 'anchor-1',
        blockId: 'root',
        kind: 'text',
        selector: { kind: 'text', quote: QUOTE },
        quote: QUOTE,
      },
    },
    branches: {
      'branch-callout': {
        id: 'branch-callout',
        source: { blockId: 'root', anchorId: 'anchor-1' },
        targetBlockId: 'callout',
        role: 'primary',
        order: 'a',
      },
      'branch-child-1': {
        id: 'branch-child-1',
        source: { blockId: 'root' },
        targetBlockId: 'child1',
        role: 'primary',
        order: 'b',
      },
      'branch-child-2': {
        id: 'branch-child-2',
        source: { blockId: 'root' },
        targetBlockId: 'child2',
        role: 'primary',
        order: 'c',
      },
    },
    chapters: [{ id: 'chapter-1', title: 'Chapter 1', topLevelBlockIds: ['root'] }],
    assets: {},
  };
}

interface PageRun {
  layout: ReturnType<typeof layoutDocument>;
  pages: ReturnType<typeof paginate>;
  edges: ReturnType<typeof buildPageEdgeModel>;
  print: PrintModel;
}

function runPage(): PageRun {
  const document = fixtureDocument();
  const measurement = createEstimatedMeasurement(document);
  const settings = DEFAULT_PAGE_SETTINGS;
  const layout = layoutDocument(
    document,
    measurement,
    pageLayoutOptions(settings.theme),
    settings.setup,
  );
  const pages = paginate(layout, document);
  const edges = buildPageEdgeModel(layout, pages.pages);
  const print = buildPrintModel(document, layout, pages, {
    settings,
    pageModelFingerprint: pageSettingsFingerprint(settings),
  });
  return { layout, pages, edges, print };
}

function serialized(run: PageRun): string {
  return JSON.stringify(run);
}

describe('Continuous settings never reach Page or PDF', () => {
  it('changes every Continuous field without moving Page geometry, page count, or the print model', () => {
    const baseline = runPage();
    const baselineCss = pageCssVariables(DEFAULT_PAGE_SETTINGS.theme);
    const poisoned = normalizeContinuousSettings({
      spacing: { chapterGap: 48, siblingGap: 40, childRowGap: 32 },
      arrows: { width: 2.5, activeWidth: 3, mutedWidth: 2, size: 10 },
      widths: { canvasMax: 4800, topLevelMax: 640, childMax: 560 },
    });
    expect(poisoned).not.toEqual(DEFAULT_CONTINUOUS_SETTINGS);
    const continuousCss = continuousCssVariables(poisoned);
    expect(continuousCss).not.toEqual(continuousCssVariables(DEFAULT_CONTINUOUS_SETTINGS));

    const original = { ...CONTINUOUS_EDGE_STYLE };
    try {
      Object.assign(CONTINUOUS_EDGE_STYLE, continuousEdgeStyle(poisoned));
      expect(CONTINUOUS_EDGE_STYLE.arrowLength).toBe(10);
      expect(CONTINUOUS_EDGE_STYLE.edgeWidth).toBe(2.5);

      const after = runPage();
      expect(serialized(after)).toBe(serialized(baseline));
      expect(after.pages.pages.length).toBe(baseline.pages.pages.length);
      expect(after.print.pageCount).toBe(baseline.print.pageCount);
      expect(after.print.geometry).toEqual(baseline.print.geometry);
      expect(after.print.cssVariables).toEqual(baselineCss);
      expect(after.print.fingerprint).toBe(baseline.print.fingerprint);
      expect(pageCssVariables(DEFAULT_PAGE_SETTINGS.theme)).toEqual(baselineCss);
    } finally {
      Object.assign(CONTINUOUS_EDGE_STYLE, original);
    }
  });
});
