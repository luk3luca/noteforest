import { existsSync, readFileSync } from 'node:fs';
import type {
  BlockMeasurement,
  ContentBlock,
  ContinuousLayout,
  DerivedPage,
  LayoutOptions,
  MeasurementMode,
  MeasurementPort,
  NoteDocument,
  PageSettings,
} from '../src/index.js';
import {
  createEstimatedMeasurement,
  effectivePageTheme,
  layoutDocument,
  normalizePageSettings,
  PAGE_BODY_PT_FLOOR,
  PAGE_MAX_CARD_WIDTH_MAX,
  PAGE_MAX_CARD_WIDTH_MIN,
  PAGE_MIN_CONTENT_WIDTH_FLOOR,
  pageLayoutOptions,
  paginate,
} from '../src/index.js';
import { loadLabDocument } from './layout-lab.js';

import { anchorViewFor } from './helpers.js';
/**
 * M4e2 Page density lab (M4d1 + the 60-120% range).
 *
 * The layout pass is the real `layoutDocument` + `paginate`; measurement is the
 * DOM-free estimator with the same box options as the layout pass. Page counts
 * are therefore an estimate: typography is fixed in the estimator, while the
 * real DOM also shrinks text. The authoritative real-DOM numbers come from the
 * M4d1/M4e2 UI suite; this lab records the reproducible trend for showcase,
 * stress, and scale-300 at every slider step.
 */

export const STRESS_PATH =
  '~/Documents/NoteForest/note-forest-stress-test/document.json';
export const DENSITY_STEPS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2] as const;

export type DensityFixture = 'showcase' | 'stress' | 'scale-300';

export interface DensityLabRow {
  label: string;
  densityPercent: number;
  bodyPt: number;
  heading1Pt: number;
  bodyClamped: boolean;
  cardPadding: number;
  segmentGap: number;
  siblingGap: number;
  wrapIndent: number;
  maxCardWidth: number;
  minContentWidth: number;
  blocks: number;
  pages: number;
  whitespaceRatio: number;
  layoutHeight: number;
  defects: number;
  contentTooWide: number;
  layoutOverflow: number;
}

export interface DensityLabResult {
  settings: PageSettings;
  layoutOptions: LayoutOptions;
  layout: ContinuousLayout;
  pages: DerivedPage[];
  row: DensityLabRow;
}

export function readStressDocument(): NoteDocument | null {
  if (!existsSync(STRESS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(STRESS_PATH, 'utf8')) as NoteDocument;
  } catch {
    return null;
  }
}

export function loadDensityDocument(name: DensityFixture): NoteDocument | null {
  if (name === 'stress') return readStressDocument();
  return loadLabDocument(name === 'scale-300' ? 'scale-300.json' : 'showcase');
}

export function densityFixtures(): DensityFixture[] {
  const fixtures: DensityFixture[] = ['scale-300'];
  if (readStressDocument() !== null) fixtures.push('stress');
  if (loadLabDocument('showcase') !== null) fixtures.push('showcase');
  return fixtures;
}

/**
 * Scale the DOM-free estimate's content by the effective type ratio.
 *
 * The estimator uses fixed typography (14 px body, 7 px char); the real DOM
 * Page theme shrinks type with density. Without this wrapper a lower density
 * would only narrow the cards and the lab would understate the dezoom. Padding,
 * gaps, and card chrome already come from the density-scaled layout options.
 */
function densityMeasurement(
  document: NoteDocument,
  layoutOptions: LayoutOptions,
  typeScale: number,
): MeasurementPort {
  const inner = createEstimatedMeasurement(document, layoutOptions);
  const scale = (value: number): number => value * typeScale;
  return {
    measure(block: ContentBlock, mode: MeasurementMode): BlockMeasurement {
      const measured = inner.measure(block, mode);
      const segments = measured.segments.map((segment) => ({
        ...segment,
        y: scale(segment.y),
        height: scale(segment.height),
      }));
      const anchors = measured.anchors.map((anchor) => ({
        ...anchor,
        x: scale(anchor.x),
        y: scale(anchor.y),
        width: scale(anchor.width),
        height: scale(anchor.height),
      }));
      const labelHeight = scale(measured.labelHeight);
      const contentHeight = scale(measured.contentHeight);
      // Keep the density-scaled padding/border from the layout options; only
      // the type-driven part of the card changes here.
      const contentTop = measured.contentTop - measured.labelHeight + labelHeight;
      const bottomPadding =
        measured.cardHeight - measured.contentTop - measured.contentHeight;
      const maxContentWidth = scale(measured.maxContentWidth);
      const minContentWidth = scale(measured.minContentWidth);
      const contentWidth = scale(measured.contentWidth);
      return {
        ...measured,
        cardWidth: contentWidth + (measured.cardWidth - measured.contentWidth),
        contentWidth,
        contentHeight,
        contentTop,
        labelHeight,
        cardHeight: contentTop + contentHeight + bottomPadding,
        maxContentWidth,
        minContentWidth,
        segments,
        anchors,
      };
    },
  };
}

export function computeDensityMetrics(
  label: string,
  document: NoteDocument,
  density: number,
): DensityLabResult {
  const settings = normalizePageSettings({ theme: { density } });
  const layoutOptions = pageLayoutOptions(settings.theme);
  const effective = effectivePageTheme(settings.theme);
  const typeScale = settings.theme.bodyPt > 0 ? effective.bodyPt / settings.theme.bodyPt : 1;
  const layout = layoutDocument(
    document,
    densityMeasurement(document, layoutOptions, typeScale),
    layoutOptions,
    settings.setup,
      anchorViewFor(document),
  );
  const pages = paginate(layout, document, {
    manualBreakBeforeBlockIds: [...settings.manualBreakBeforeBlockIds],
  });
  const layoutHeight = layout.chapters.reduce((total, chapter) => total + chapter.height, 0);
  const usedArea = layout.blocks.reduce((total, block) => total + block.width * block.height, 0);
  const bandArea = layout.chapters.reduce(
    (total, chapter) => total + layout.geometry.contentWidthPx * chapter.height,
    0,
  );
  const defectsByCode = new Map<string, number>();
  for (const defect of layout.defects) {
    defectsByCode.set(defect.code, (defectsByCode.get(defect.code) ?? 0) + 1);
  }
  return {
    settings,
    layoutOptions,
    layout,
    pages: pages.pages,
    row: {
      label,
      densityPercent: Math.round(settings.theme.density * 100),
      bodyPt: effective.bodyPt,
      heading1Pt: effective.heading1Pt,
      bodyClamped: effective.bodyPt <= PAGE_BODY_PT_FLOOR + 0.001,
      cardPadding: effective.cardPadding,
      segmentGap: effective.segmentGap,
      siblingGap: effective.siblingGap,
      wrapIndent: effective.wrapIndent,
      maxCardWidth: effective.maxCardWidth,
      minContentWidth: effective.minContentWidth,
      blocks: layout.blocks.length,
      pages: pages.pageCount,
      whitespaceRatio: bandArea > 0 ? 1 - usedArea / bandArea : 0,
      layoutHeight,
      defects: layout.defects.length,
      contentTooWide: defectsByCode.get('content-too-wide') ?? 0,
      layoutOverflow: defectsByCode.get('layout-overflow') ?? 0,
    },
  };
}

/** Guard the density contract on every lab row. */
export function densityInvariantFailures(row: DensityLabRow): string[] {
  const failures: string[] = [];
  if (row.bodyPt < PAGE_BODY_PT_FLOOR) {
    failures.push(`${row.label} ${row.densityPercent}%: body ${row.bodyPt} pt < ${PAGE_BODY_PT_FLOOR} pt`);
  }
  if (row.minContentWidth < PAGE_MIN_CONTENT_WIDTH_FLOOR) {
    failures.push(
      `${row.label} ${row.densityPercent}%: minContentWidth ${row.minContentWidth} < ${PAGE_MIN_CONTENT_WIDTH_FLOOR}`,
    );
  }
  if (row.maxCardWidth < PAGE_MAX_CARD_WIDTH_MIN) {
    failures.push(
      `${row.label} ${row.densityPercent}%: maxCardWidth ${row.maxCardWidth} < ${PAGE_MAX_CARD_WIDTH_MIN}`,
    );
  }
  if (row.maxCardWidth > Math.max(PAGE_MAX_CARD_WIDTH_MAX, row.minContentWidth)) {
    failures.push(
      `${row.label} ${row.densityPercent}%: maxCardWidth ${row.maxCardWidth} > readable clamp`,
    );
  }
  return failures;
}

export function formatDensityTable(rows: readonly DensityLabRow[]): string {
  const header = [
    'fixture',
    'density',
    'body',
    'h1',
    'pad',
    'gap',
    'max card',
    'min content',
    'pages',
    'whitespace',
    'height',
    'defects',
    'note',
  ];
  const body = rows.map((row) => [
    row.label,
    `${row.densityPercent}%`,
    `${row.bodyPt}pt`,
    `${row.heading1Pt}pt`,
    String(row.cardPadding),
    String(row.segmentGap),
    String(row.maxCardWidth),
    String(row.minContentWidth),
    String(row.pages),
    `${(row.whitespaceRatio * 100).toFixed(1)}%`,
    row.layoutHeight.toFixed(1),
    String(row.defects),
    row.bodyClamped ? 'body floor' : 'curve',
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...body.map((row) => row[index]?.length ?? 0)),
  );
  const render = (cells: string[]): string =>
    cells
      .map((cell, index) =>
        index === 0 ? cell.padEnd(widths[index] ?? 0) : cell.padStart(widths[index] ?? 0),
      )
      .join(' | ');
  return [
    render(header),
    widths.map((width) => '-'.repeat(width)).join('-|-'),
    ...body.map(render),
  ].join('\n');
}
