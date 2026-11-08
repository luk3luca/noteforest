import { branchAnchorQuote, primaryBranches } from './document.js';
import type {
  ChapterLayout,
  ContinuousLayout,
  ContinuationIn,
  ContinuationOut,
  DerivedPage,
  LayoutBlock,
  LayoutDefect,
  NoteDocument,
  PageFragment,
  PaginatedDocument,
} from './types.js';

const EPSILON = 0.25;

interface CandidatePoint {
  y: number;
  /** For a candidate that falls inside a block at a safe segment boundary. */
  internal: Map<string, number>;
}

interface PageOptions {
  manualBreakBeforeBlockIds?: string[];
}

interface FragmentWithPage {
  fragment: PageFragment;
  page: DerivedPage;
}

function chapterBlocks(layout: ContinuousLayout, chapter: ChapterLayout): LayoutBlock[] {
  return layout.blocks
    .filter((block) => block.chapterId === chapter.id)
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
}

function candidatePoints(blocks: LayoutBlock[], chapterHeight: number): CandidatePoint[] {
  const map = new Map<number, CandidatePoint>();
  const add = (y: number, blockId?: string, segmentIndex?: number): void => {
    if (y < -EPSILON) return;
    const key = Math.round(y * 1000) / 1000;
    let point = map.get(key);
    if (!point) {
      point = { y: key, internal: new Map() };
      map.set(key, point);
    }
    if (blockId && segmentIndex !== undefined) point.internal.set(blockId, segmentIndex);
  };
  for (const block of blocks) {
    add(block.y);
    add(block.y + block.height);
    for (const candidate of block.breakCandidates) {
      add(block.y + block.contentTop + candidate.y, block.blockId, candidate.segmentIndex);
    }
  }
  add(chapterHeight);
  return [...map.values()].sort((a, b) => a.y - b.y);
}

function isValidBreakAt(y: number, blocks: LayoutBlock[], points: CandidatePoint[]): boolean {
  const point = points.find((candidate) => Math.abs(candidate.y - y) < EPSILON);
  if (!point) return false;
  for (const block of blocks) {
    if (y > block.y + EPSILON && y < block.y + block.height - EPSILON) {
      if (!point.internal.has(block.blockId)) return false;
    }
  }
  return true;
}

function contentBetween(yStart: number, yEnd: number, blocks: LayoutBlock[]): boolean {
  return blocks.some(
    (block) => block.y < yEnd - EPSILON && block.y + block.height > yStart + EPSILON,
  );
}

function segmentStartAt(block: LayoutBlock, y: number): number | null {
  for (const candidate of block.breakCandidates) {
    const absolute = block.y + block.contentTop + candidate.y;
    if (Math.abs(absolute - y) < EPSILON) return candidate.segmentIndex;
  }
  return null;
}

function firstSegmentAtOrAfter(block: LayoutBlock, y: number): number {
  for (const segment of block.measurement.segments) {
    const absolute = block.y + block.contentTop + segment.y;
    if (absolute >= y - EPSILON) return segment.index;
  }
  return Math.max(0, block.measurement.segments.length - 1);
}

function tableRowTooTall(block: LayoutBlock, contentHeight: number): boolean {
  return block.measurement.segments.some(
    (segment) => segment.kind === 'table-row' && segment.height > contentHeight + EPSILON,
  );
}

export function paginate(
  layout: ContinuousLayout,
  document: NoteDocument,
  options: PageOptions = {},
): PaginatedDocument {
  const pages: DerivedPage[] = [];
  const defects: LayoutDefect[] = [...layout.defects];
  const manualBreakWarnings: LayoutDefect[] = [];
  const contentHeight = layout.geometry.contentHeightPx;
  const hints = new Set(options.manualBreakBeforeBlockIds ?? []);
  const hintValidation = new Map<string, { chapterId: string; y: number; valid: boolean }>();

  const addDefect = (defect: LayoutDefect): void => {
    const duplicate = defects.some(
      (existing) =>
        existing.code === defect.code &&
        existing.blockId === defect.blockId &&
        existing.pageNumber === defect.pageNumber &&
        existing.message === defect.message,
    );
    if (!duplicate) defects.push(defect);
  };

  // Preflight: table rows taller than the page content area are defects, never cuts.
  for (const block of layout.blocks) {
    for (const segment of block.measurement.segments) {
      if (segment.kind === 'table-row' && segment.height > contentHeight + EPSILON) {
        addDefect({
          code: 'too-tall-row',
          severity: 'blocking',
          message: `Table row ${segment.index + 1} in block ${block.blockId} is ${Math.round(segment.height)} px tall; the page content area is ${Math.round(contentHeight)} px. The row is atomic and is not cut.`,
          blockId: block.blockId,
          chapterId: block.chapterId,
          blocksExport: true,
        });
      }
    }
  }

  for (const chapter of layout.chapters) {
    const blocks = chapterBlocks(layout, chapter);
    if (blocks.length === 0 || chapter.height <= EPSILON) continue;
    const points = candidatePoints(blocks, chapter.height);

    // Resolve manual hints before pagination so impossible hints are reported once.
    for (const blockId of hints) {
      const block = layout.blockById[blockId];
      if (!block) {
        const warning: LayoutDefect = {
          code: 'impossible-hint',
          severity: 'warning',
          message: `Manual break hint names unknown block ${blockId}; it is ignored.`,
          blockId,
          blocksExport: false,
        };
        manualBreakWarnings.push(warning);
        addDefect(warning);
        continue;
      }
      if (block.chapterId !== chapter.id) {
        if (!hintValidation.has(blockId)) {
          hintValidation.set(blockId, { chapterId: block.chapterId, y: block.y, valid: false });
        }
        continue;
      }
      const y = block.y;
      const valid = y <= EPSILON || isValidBreakAt(y, blocks, points);
      hintValidation.set(blockId, { chapterId: chapter.id, y, valid });
      if (!valid) {
        const warning: LayoutDefect = {
          code: 'impossible-hint',
          severity: 'warning',
          message: `Manual break hint before block ${blockId} cannot be honored without cutting another block; it is ignored.`,
          blockId,
          chapterId: chapter.id,
          blocksExport: false,
        };
        manualBreakWarnings.push(warning);
        addDefect(warning);
      }
    }

    const validHints = [...hintValidation.values()]
      .filter((hint) => hint.chapterId === chapter.id && hint.valid && hint.y > EPSILON)
      .map((hint) => hint.y)
      .sort((a, b) => a - b);

    let yStart = 0;
    let pageIndex = 0;
    while (yStart < chapter.height - EPSILON) {
      if (pageIndex > 10000) {
        addDefect({
          code: 'internal',
          severity: 'blocking',
          message: `Pagination of chapter ${chapter.id} did not converge.`,
          chapterId: chapter.id,
          blocksExport: true,
        });
        break;
      }
      const limit = yStart + contentHeight;
      const validInRange = points.filter(
        (point) =>
          point.y > yStart + EPSILON && point.y <= limit + EPSILON && isValidBreakAt(point.y, blocks, points),
      );
      let naturalEnd: number;
      let overflow = false;
      if (validInRange.length > 0) {
        naturalEnd = validInRange[validInRange.length - 1]!.y;
      } else {
        const beyond = points.find(
          (point) => point.y > yStart + EPSILON && isValidBreakAt(point.y, blocks, points),
        );
        naturalEnd = beyond ? beyond.y : chapter.height;
        overflow = naturalEnd > limit + EPSILON;
      }

      let pageEnd = naturalEnd;
      const nextHint = validHints.find(
        (hint) => hint > yStart + EPSILON && hint <= pageEnd + EPSILON,
      );
      if (nextHint !== undefined) {
        if (Math.abs(nextHint - pageEnd) < EPSILON) {
          // The page naturally ends at the hinted block: honored.
        } else if (contentBetween(yStart, nextHint, blocks)) {
          pageEnd = nextHint;
          overflow = pageEnd > limit + EPSILON;
        } else {
          const warning: LayoutDefect = {
            code: 'impossible-hint',
            severity: 'warning',
            message: `Manual break hint at y=${Math.round(nextHint)} would create an empty page; it is ignored.`,
            chapterId: chapter.id,
            blocksExport: false,
          };
          manualBreakWarnings.push(warning);
          addDefect(warning);
        }
      }

      if (pageEnd <= yStart + EPSILON) {
        addDefect({
          code: 'internal',
          severity: 'blocking',
          message: `Pagination stalled at chapter ${chapter.id}, y=${Math.round(yStart)}.`,
          chapterId: chapter.id,
          blocksExport: true,
        });
        break;
      }
      if (pageEnd > limit + EPSILON) {
        const culprits = blocks.filter(
          (block) =>
            block.y < pageEnd - EPSILON &&
            block.y + block.height > limit + EPSILON &&
            (block.y + block.height > yStart + EPSILON),
        );
        const culprit = culprits[0];
        if (culprit) {
          const tooTall = tableRowTooTall(culprit, contentHeight);
          if (tooTall && defects.some((defect) => defect.code === 'too-tall-row' && defect.blockId === culprit.blockId)) {
            // The preflight pass already reported this atomic row; do not duplicate it.
          } else addDefect({
            code: tooTall ? 'too-tall-row' : 'no-safe-break',
            severity: 'blocking',
            message: tooTall
              ? `Block ${culprit.blockId} contains a table row taller than the page content area; the row is atomic, so page ${pages.length + 1} overflows. Export is blocked.`
              : `Block ${culprit.blockId} has no safe break inside page ${pages.length + 1}'s content height (${Math.round(contentHeight)} px). It overflows by ${Math.round(pageEnd - limit)} px rather than being cut. Export is blocked.`,
            blockId: culprit.blockId,
            chapterId: chapter.id,
            pageNumber: pages.length + 1,
            blocksExport: true,
          });
        } else {
          addDefect({
            code: 'no-safe-break',
            severity: 'blocking',
            message: `Chapter ${chapter.id} page ${pages.length + 1} overflows its content area without a safe break.`,
            chapterId: chapter.id,
            pageNumber: pages.length + 1,
            blocksExport: true,
          });
        }
      }

      const fragments: PageFragment[] = [];
      for (const block of blocks) {
        const blockBottom = block.y + block.height;
        if (block.y >= pageEnd - EPSILON || blockBottom <= yStart + EPSILON) continue;
        const sourceTop = Math.max(block.y, yStart);
        const sourceBottom = Math.min(blockBottom, pageEnd);
        const isFirst = sourceTop <= block.y + EPSILON;
        const isLast = sourceBottom >= blockBottom - EPSILON;
        const segmentCount = block.measurement.segments.length;
        let startSegment = 0;
        let endSegment = segmentCount;
        if (!isFirst && segmentCount > 0) {
          const candidate = segmentStartAt(block, yStart);
          if (candidate === null) {
            addDefect({
              code: 'internal',
              severity: 'blocking',
              message: `Page ${pages.length + 1} starts inside block ${block.blockId} but not at a safe segment boundary.`,
              blockId: block.blockId,
              chapterId: chapter.id,
              pageNumber: pages.length + 1,
              blocksExport: true,
            });
            startSegment = firstSegmentAtOrAfter(block, yStart);
          } else {
            startSegment = candidate;
          }
        }
        if (!isLast && segmentCount > 0) {
          const candidate = segmentStartAt(block, pageEnd);
          if (candidate === null) {
            addDefect({
              code: 'internal',
              severity: 'blocking',
              message: `Page ${pages.length + 1} ends inside block ${block.blockId} but not at a safe segment boundary.`,
              blockId: block.blockId,
              chapterId: chapter.id,
              pageNumber: pages.length + 1,
              blocksExport: true,
            });
            endSegment = segmentCount;
          } else {
            endSegment = candidate;
          }
        }
        const pageY = sourceTop - yStart;
        const fragment: PageFragment = {
          blockId: block.blockId,
          chapterId: block.chapterId,
          role: block.role,
          depth: block.depth,
          source: {
            x: block.x,
            y: sourceTop,
            width: block.width,
            height: sourceBottom - sourceTop,
          },
          page: {
            x: block.x,
            y: pageY,
            width: block.width,
            height: sourceBottom - sourceTop,
          },
          startSegment,
          endSegment,
          isFirst,
          isLast,
          isPageStart: pageY <= EPSILON,
          continuesToPage: null,
          continuedFromPage: null,
        };
        fragments.push(fragment);
      }

      fragments.sort((a, b) => {
        if (Math.abs(a.page.y - b.page.y) > 0.5) return a.page.y - b.page.y;
        if (Math.abs(a.page.x - b.page.x) > 0.5) return a.page.x - b.page.x;
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.blockId < b.blockId ? -1 : a.blockId > b.blockId ? 1 : 0;
      });

      const page: DerivedPage = {
        pageNumber: pages.length + 1,
        chapterId: chapter.id,
        chapterIndex: chapter.index,
        chapterTitle: chapter.title,
        yStart,
        yEnd: pageEnd,
        isChapterStart: yStart <= EPSILON,
        fragments,
        continuationOut: [],
        continuationIn: [],
        overflow,
      };
      pages.push(page);
      yStart = pageEnd;
      pageIndex += 1;
    }
  }

  // Link continuations after page numbers exist.
  const fragmentPages = new Map<PageFragment, DerivedPage>();
  for (const page of pages) {
    for (const fragment of page.fragments) fragmentPages.set(fragment, page);
  }
  const byBlock = new Map<string, FragmentWithPage[]>();
  for (const page of pages) {
    for (const fragment of page.fragments) {
      const list = byBlock.get(fragment.blockId) ?? [];
      list.push({ fragment, page });
      byBlock.set(fragment.blockId, list);
    }
  }

  for (const [blockId, list] of byBlock) {
    list.sort((a, b) => a.page.pageNumber - b.page.pageNumber);
    for (let index = 0; index < list.length - 1; index += 1) {
      const current = list[index]!;
      const next = list[index + 1]!;
      if (current.fragment.isLast || next.fragment.isFirst) {
        addDefect({
          code: 'internal',
          severity: 'blocking',
          message: `Continuation chain for block ${blockId} is inconsistent between pages ${current.page.pageNumber} and ${next.page.pageNumber}.`,
          blockId,
          pageNumber: current.page.pageNumber,
          blocksExport: true,
        });
      }
      current.fragment.continuesToPage = next.page.pageNumber;
      next.fragment.continuedFromPage = current.page.pageNumber;
      const out: ContinuationOut = {
        blockId,
        fromPage: current.page.pageNumber,
        toPage: next.page.pageNumber,
        startSegment: current.fragment.startSegment,
        endSegment: current.fragment.endSegment,
      };
      current.page.continuationOut.push(out);

      const block = layout.blockById[blockId];
      const documentBlock = document.blocks[blockId];
      const parentId = block?.parentBlockId ?? null;
      const parent = parentId ? document.blocks[parentId] : undefined;
      const primary = primaryBranches(document).find(
        (branch) => branch.targetBlockId === blockId,
      );
      const anchorQuote = primary ? branchAnchorQuote(document, primary) : null;
      const incoming: ContinuationIn = {
        blockId,
        fromPage: current.page.pageNumber,
        toPage: next.page.pageNumber,
        startSegment: next.fragment.startSegment,
        endSegment: next.fragment.endSegment,
        ghostParent: {
          parentBlockId: parentId,
          parentLabel: parent?.label ?? (block ? chapterTitleFor(layout, block.chapterId) : 'Document'),
          blockLabel: documentBlock?.label ?? blockId,
          anchorQuote,
        },
      };
      next.page.continuationIn.push(incoming);
    }
  }

  // Any valid hint that never became a page start was not honored.
  for (const [blockId, hint] of hintValidation) {
    if (!hint.valid) continue;
    if (hint.y <= EPSILON) continue;
    const honored = pages.some(
      (page) =>
        page.chapterId === hint.chapterId && Math.abs(page.yStart - hint.y) < EPSILON,
    );
    if (!honored) {
      const warning: LayoutDefect = {
        code: 'impossible-hint',
        severity: 'warning',
        message: `Manual break hint before block ${blockId} was not honored by the final pagination; no empty page was created.`,
        blockId,
        chapterId: hint.chapterId,
        blocksExport: false,
      };
      manualBreakWarnings.push(warning);
      addDefect(warning);
    }
  }

  return {
    pages,
    pageCount: pages.length,
    defects,
    manualBreakWarnings,
  };
}

function chapterTitleFor(layout: ContinuousLayout, chapterId: string): string {
  return layout.chapters.find((chapter) => chapter.id === chapterId)?.title ?? 'Document';
}

export function pageHasBlockingDefect(document: PaginatedDocument): boolean {
  return document.defects.some((defect) => defect.blocksExport);
}

export function continuationMarkersForPage(page: DerivedPage): {
  continuesOnPage: number | null;
  continuedFromPage: number | null;
} {
  const continuesOnPage = page.continuationOut[0]?.toPage ?? null;
  const continuedFromPage = page.continuationIn[0]?.fromPage ?? null;
  return { continuesOnPage, continuedFromPage };
}
