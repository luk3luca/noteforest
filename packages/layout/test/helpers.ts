import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  ContinuousLayout,
  LayoutOptions,
  NoteDocument,
  PageSetup,
  PaginatedDocument,
} from '../src/index.js';
import {
  createEstimatedMeasurement,
  DEFAULT_PAGE_SETTINGS,
  layoutDocument,
  paginate,
} from '../src/index.js';

export const FIXTURES = resolve(import.meta.dirname, '../../../fixtures');

/**
 * The pre-R1 fixture geometry (A4 portrait, 20 mm margins). Layout fixtures are
 * canonical documents now, so tests that depend on the old width/height inject
 * this setup explicitly instead of reading it from the document.
 */
export const FIXTURE_PAGE_SETUP: PageSetup = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
};

export interface FixtureLayoutOptions {
  setup?: PageSetup;
  layoutOptions?: Partial<LayoutOptions>;
  manualBreakBeforeBlockIds?: readonly string[];
}

export function loadFixture(name: string): NoteDocument {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8')) as NoteDocument;
}

export function layoutFixture(
  name: string,
  options: FixtureLayoutOptions = {},
): ContinuousLayout {
  const document = loadFixture(name);
  return layoutDocument(
    document,
    createEstimatedMeasurement(document),
    options.layoutOptions ?? {},
    options.setup ?? DEFAULT_PAGE_SETTINGS.setup,
  );
}

export function paginateFixture(
  name: string,
  options: FixtureLayoutOptions = {},
): {
  document: NoteDocument;
  layout: ContinuousLayout;
  pages: PaginatedDocument;
} {
  const document = loadFixture(name);
  const layout = layoutDocument(
    document,
    createEstimatedMeasurement(document),
    options.layoutOptions ?? {},
    options.setup ?? DEFAULT_PAGE_SETTINGS.setup,
  );
  const pages = paginate(layout, document, {
    manualBreakBeforeBlockIds: [...(options.manualBreakBeforeBlockIds ?? [])],
  });
  return { document, layout, pages };
}

export function blockFragments(pages: PaginatedDocument, blockId: string) {
  return pages.pages
    .flatMap((page) =>
      page.fragments
        .filter((fragment) => fragment.blockId === blockId)
        .map((fragment) => ({ ...fragment, pageNumber: page.pageNumber })),
    )
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

export function assertSegmentsAtomic(pages: PaginatedDocument, layout: ContinuousLayout): string[] {
  const failures: string[] = [];
  for (const block of layout.blocks) {
    if (block.measurement.segments.length === 0) continue;
    const fragments = blockFragments(pages, block.blockId);
    if (fragments.length === 0) continue;
    if (fragments[0]!.startSegment !== 0) {
      failures.push(`${block.blockId}: first fragment starts at ${fragments[0]!.startSegment}`);
    }
    if (fragments[fragments.length - 1]!.endSegment !== block.measurement.segments.length) {
      failures.push(`${block.blockId}: last fragment ends early`);
    }
    for (let index = 1; index < fragments.length; index += 1) {
      if (fragments[index]!.startSegment !== fragments[index - 1]!.endSegment) {
        failures.push(`${block.blockId}: fragment gap before page ${fragments[index]!.pageNumber}`);
      }
    }
    for (const segment of block.measurement.segments) {
      const containing = fragments.filter(
        (fragment) => fragment.startSegment <= segment.index && segment.index < fragment.endSegment,
      );
      if (containing.length !== 1) {
        failures.push(
          `${block.blockId}: segment ${segment.index} (${segment.kind}) is in ${containing.length} fragments`,
        );
      }
    }
  }
  return failures;
}
