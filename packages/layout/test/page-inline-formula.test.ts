import { describe, expect, it } from 'vitest';
import {
  createEstimatedMeasurement,
  DEFAULT_LAYOUT_OPTIONS,
  layoutDocument,
  paginate,
  type BlockMeasurement,
  type ContentBlock,
  type ContentNode,
  type ContinuousLayout,
  type MeasurementMode,
  type MeasurementPort,
  type NoteDocument,
} from '../src/index.js';
import { anchorViewFor, FIXTURE_PAGE_SETUP } from './helpers.js';

/**
 * Plan #12 — a long inline formula keeps the standard card.
 *
 * The DOM port measures the real KaTeX box; the estimator is the DOM-free
 * oracle and counts rendered symbols, not LaTeX source characters. These tests
 * pin the Page width policy: a formula wider than the readable measure grows
 * the card to the available Page content width, a fitting formula leaves the
 * card and the page count alone, a formula wider than the page keeps the
 * existing `content-too-wide` defect, and a table cell is out of scope.
 */

/** 80 rendered symbols: wider than the 420 px measure, narrower than the page. */
const LONG_FORMULA =
  '1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12 + 13 + 14 + 15 + 16 + 17 + 18 + 19 + 20 + 21 + 22 + 23 + 24 + 25 + 26 + 27 + 28 + 29 + 30';

/** 170 rendered symbols: wider than the A4 portrait content box. */
const OVERSIZE_FORMULA = `${LONG_FORMULA} + 31 + 32 + 33 + 34 + 35 + 36 + 37 + 38 + 39 + 40 + 41 + 42 + 43 + 44 + 45 + 46 + 47 + 48 + 49 + 50 + 51 + 52 + 53 + 54 + 55 + 56 + 57 + 58 + 59 + 60`;

/** Paragraph text that already fills the readable measure on its own. */
const FILLING_TEXT =
  'A paragraph that already fills the readable measure with plain prose before it ends.';

function formulaBlock(id: string, latex: string, intro = 'The identity '): ContentBlock {
  return {
    id,
    content: {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: intro },
            { type: 'inlineMath', attrs: { latex } },
          ],
        },
      ],
    },
  };
}

function textBlock(id: string, text: string): ContentBlock {
  return {
    id,
    content: { type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
  };
}

function tableCellFormulaBlock(id: string, latex: string): ContentBlock {
  return {
    id,
    content: {
      type: 'doc',
      children: [
        {
          type: 'table',
          children: [
            {
              type: 'tableRow',
              children: [
                { type: 'tableHeader', children: [{ type: 'text', text: 'Value' }] },
                {
                  type: 'tableCell',
                  children: [{ type: 'inlineMath', attrs: { latex } } as ContentNode],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

function makeDocument(blocks: ContentBlock[]): NoteDocument {
  return {
    schemaVersion: 2,
    id: 'inline-formula-width',
    title: 'Inline formula width',
    blocks: Object.fromEntries(blocks.map((block) => [block.id, block])),
    anchors: {},
    branches: {},
    chapters: [
      {
        id: 'chapter-1',
        title: 'Chapter',
        topLevelBlockIds: blocks.map((block) => block.id),
      },
    ],
    assets: {},
  };
}

function layoutOf(document: NoteDocument): ContinuousLayout {
  return layoutDocument(
    document,
    createEstimatedMeasurement(document),
    {},
    FIXTURE_PAGE_SETUP,
    anchorViewFor(document),
  );
}

/**
 * A DOM-shaped stub. KaTeX 0.18 splits a long formula into breakable bases, so
 * the real min-content measurement stops well below the rendered formula; the
 * estimator cannot reproduce that asymmetry. This stub pins the layout policy
 * on the reported formula width alone.
 */
function underReportedMinContentPort(renderedFormulaWidth: number): MeasurementPort {
  const chrome = 2 * (DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder);
  return {
    measure(block: ContentBlock, mode: MeasurementMode): BlockMeasurement {
      const contentWidth =
        mode.kind === 'max-content'
          ? renderedFormulaWidth + 80
          : mode.kind === 'min-content'
            ? 300
            : mode.contentWidth;
      const contentTop = DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder;
      return {
        blockId: block.id,
        mode,
        cardWidth: contentWidth + chrome,
        contentWidth,
        contentHeight: 40,
        contentTop,
        labelHeight: 0,
        cardHeight:
          contentTop +
          40 +
          DEFAULT_LAYOUT_OPTIONS.cardPadding +
          DEFAULT_LAYOUT_OPTIONS.cardBorder,
        maxContentWidth: renderedFormulaWidth + 80,
        minContentWidth: 300,
        inlineFormulaWidth: renderedFormulaWidth,
        segments: [
          {
            index: 0,
            kind: 'paragraph',
            nodePath: [0],
            y: 0,
            height: 40,
            breakableBefore: false,
          },
        ],
        anchors: [],
        tableColumns: {},
        missingAssetIds: [],
      };
    },
  };
}

describe('page inline formula width (plan #12)', () => {
  it('grows the card to the available page content width for a formula wider than the readable measure', () => {
    const document = makeDocument([formulaBlock('formula', LONG_FORMULA)]);
    const port = createEstimatedMeasurement(document);
    const intrinsic = port.measure(document.blocks['formula']!, { kind: 'max-content' });
    const layout = layoutOf(document);
    const pageWidth = layout.geometry.contentWidthPx;

    // Premise: the rendered formula is wider than the card measure but fits the page.
    expect(intrinsic.inlineFormulaWidth).toBeGreaterThan(DEFAULT_LAYOUT_OPTIONS.maxContentWidth);
    expect(intrinsic.inlineFormulaWidth).toBeLessThanOrEqual(pageWidth);

    const block = layout.blockById['formula']!;
    expect(block.x).toBe(0);
    expect(block.width).toBeCloseTo(pageWidth, 5);
    expect(block.measurement.inlineFormulaWidth).toBe(intrinsic.inlineFormulaWidth);
    expect(layout.defects.some((defect) => defect.code === 'content-too-wide')).toBe(false);

    // The formula is one paragraph segment and one page fragment: never cut.
    const pages = paginate(layout, document);
    expect(pages.pageCount).toBe(1);
    expect(block.measurement.segments).toHaveLength(1);
    expect(
      pages.pages[0]!.fragments.filter((fragment) => fragment.blockId === 'formula'),
    ).toHaveLength(1);
  });

  it('grows the card from the rendered formula width even when min-content under-reports it', () => {
    const document = makeDocument([formulaBlock('formula', 'x^2 + 1')]);
    const layout = layoutDocument(
      document,
      underReportedMinContentPort(620),
      {},
      FIXTURE_PAGE_SETUP,
      anchorViewFor(document),
    );

    // 620 px is above the 420 px measure but below the 642 px page. Plain
    // min-content is only 300 px, so the old policy kept the 420 px card and
    // the formula wrapped; the rendered width alone must grow the card.
    expect(layout.blockById['formula']!.width).toBeCloseTo(layout.geometry.contentWidthPx, 5);
    expect(
      layout.defects.some(
        (defect) => defect.code === 'content-too-wide' && defect.blockId === 'formula',
      ),
    ).toBe(false);
  });

  it('keeps the standard card and the page count for a formula that fits', () => {
    const withFormula = makeDocument([formulaBlock('with-formula', 'x^2 + 1', FILLING_TEXT)]);
    const withoutFormula = makeDocument([textBlock('text-only', FILLING_TEXT)]);
    const port = createEstimatedMeasurement(withFormula);
    const intrinsic = port.measure(withFormula.blocks['with-formula']!, { kind: 'max-content' });

    expect(intrinsic.inlineFormulaWidth).toBeLessThan(DEFAULT_LAYOUT_OPTIONS.maxContentWidth);

    const formulaLayout = layoutOf(withFormula);
    const textLayout = layoutOf(withoutFormula);
    const formulaBlockLayout = formulaLayout.blockById['with-formula']!;
    const textBlockLayout = textLayout.blockById['text-only']!;

    // The readable cap still decides the card width; the formula does not grow it.
    expect(formulaBlockLayout.contentWidth).toBeCloseTo(DEFAULT_LAYOUT_OPTIONS.maxContentWidth, 6);
    expect(formulaBlockLayout.width).toBeCloseTo(textBlockLayout.width, 6);
    expect(formulaBlockLayout.width).toBeLessThan(formulaLayout.geometry.contentWidthPx);

    expect(paginate(formulaLayout, withFormula).pageCount).toBe(
      paginate(textLayout, withoutFormula).pageCount,
    );
    expect(paginate(formulaLayout, withFormula).pageCount).toBe(1);
  });

  it('reports the existing content-too-wide defect when the formula is wider than the page content box', () => {
    const document = makeDocument([formulaBlock('formula', OVERSIZE_FORMULA)]);
    const port = createEstimatedMeasurement(document);
    const intrinsic = port.measure(document.blocks['formula']!, { kind: 'max-content' });
    const layout = layoutOf(document);
    const pageWidth = layout.geometry.contentWidthPx;
    const block = layout.blockById['formula']!;

    expect(intrinsic.inlineFormulaWidth).toBeGreaterThan(pageWidth);
    // The card stops at the page; the formula is neither scaled nor clipped.
    expect(block.width).toBeCloseTo(pageWidth, 5);
    expect(block.contentWidth).toBeLessThan(intrinsic.inlineFormulaWidth);

    const defect = layout.defects.find(
      (candidate) => candidate.code === 'content-too-wide' && candidate.blockId === 'formula',
    );
    expect(defect).toBeDefined();
    expect(defect!.blocksExport).toBe(true);
    expect(defect!.message).toContain(`${Math.round(intrinsic.inlineFormulaWidth)} px`);
  });

  it('does not count a table-cell formula: the cell stays one paragraph', () => {
    const document = makeDocument([tableCellFormulaBlock('table', LONG_FORMULA)]);
    const port = createEstimatedMeasurement(document);
    const intrinsic = port.measure(document.blocks['table']!, { kind: 'max-content' });
    const layout = layoutOf(document);
    const block = layout.blockById['table']!;

    // The table keeps its own layout: the formula never widens the block card.
    expect(intrinsic.inlineFormulaWidth).toBe(0);
    expect(block.contentWidth).toBeCloseTo(DEFAULT_LAYOUT_OPTIONS.maxContentWidth, 6);
    expect(block.width).toBeLessThan(layout.geometry.contentWidthPx);
  });
});
