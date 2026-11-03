import type {
  AnchorAttachment,
  ContinuousLayout,
  EdgeLayout,
  LayoutBlock,
  LayoutDefect,
  NoteDocument,
  PaginatedDocument,
} from '@noteforest/layout';
import type { ExportResult } from '../../shared/api';
import { layoutOnly, type LayoutMetrics } from './state/layoutPipeline';

export type ViewMode = 'reader' | 'page';

export interface TestState {
  fixtureFile: string;
  documentId: string;
  title: string;
  view: ViewMode;
  blockCount: number;
  pageCount: number;
  chapterCount: number;
  metrics: LayoutMetrics;
  defects: LayoutDefect[];
  blocks: Array<{
    blockId: string;
    chapterId: string;
    role: string;
    depth: number;
    parentBlockId: string | null;
    anchorId: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    contentTop: number;
    segmentCount: number;
    segments: Array<{
      index: number;
      kind: string;
      height: number;
      rowIndex?: number;
      tableKey?: string;
    }>;
  }>;
  anchors: AnchorAttachment[];
  edges: EdgeLayout[];
  pages: Array<{
    pageNumber: number;
    chapterId: string;
    yStart: number;
    yEnd: number;
    isChapterStart: boolean;
    overflow: boolean;
    fragmentCount: number;
    fragments: Array<{
      blockId: string;
      startSegment: number;
      endSegment: number;
      isFirst: boolean;
      isLast: boolean;
      x: number;
      y: number;
      width: number;
      height: number;
      continuesToPage: number | null;
      continuedFromPage: number | null;
    }>;
    continuationIn: PaginatedDocument['pages'][number]['continuationIn'];
    continuationOut: PaginatedDocument['pages'][number]['continuationOut'];
  }>;
}

export interface StabilityReport {
  fixtureFile: string;
  add: {
    newBlockId: string;
    keptRatio: number;
    movedBlocks: string[];
    unrelatedChaptersMoved: number;
  };
  delete: {
    deletedBlockId: string;
    outsideAffectedMoved: number;
    survivingBlocks: number;
  };
  reference: {
    positionsIdentical: boolean;
    pageBreaksIdentical: boolean;
    pageCountBefore: number;
    pageCountAfter: number;
  };
}

export interface PageViewGeometry {
  devicePixelRatio: number;
  pages: Array<{
    pageNumber: number;
    rect: { x: number; y: number; width: number; height: number };
    fragments: Array<{
      blockId: string;
      label: string | null;
      labelRect: { x: number; y: number; width: number; height: number } | null;
      rect: { x: number; y: number; width: number; height: number };
      startSegment: number;
      endSegment: number;
    }>;
  }>;
}

export interface ReferenceReport {
  fixtureFile: string;
  positionsIdentical: boolean;
  pageBreaksIdentical: boolean;
  pageCountBefore: number;
  pageCountAfter: number;
  addedBranchId: string;
}

export interface NoteForestTestApi {
  ready: boolean;
  getState(): TestState;
  setView(view: ViewMode): Promise<void>;
  loadFixture(file: string): Promise<void>;
  exportPdf(): Promise<ExportResult>;
  stabilityProbe(): Promise<StabilityReport>;
  referenceProbe(): Promise<ReferenceReport>;
  getPageViewGeometry(): PageViewGeometry;
}

interface BlockPosition {
  x: number;
  y: number;
}

function blockPositions(layout: ContinuousLayout): Map<string, BlockPosition> {
  const map = new Map<string, BlockPosition>();
  for (const block of layout.blocks) map.set(block.blockId, { x: block.x, y: block.y });
  return map;
}

function pageBreakSignature(pages: PaginatedDocument): string {
  return pages.pages
    .map((page) => `${page.pageNumber}:${page.chapterId}:${page.yStart.toFixed(3)}:${page.yEnd.toFixed(3)}`)
    .join('|');
}

function cloneDocument(document: NoteDocument): NoteDocument {
  return structuredClone(document);
}

function removeBlock(document: NoteDocument, blockId: string): void {
  delete document.blocks[blockId];
  for (const [branchId, branch] of Object.entries(document.branches)) {
    if (branch.source.blockId === blockId || branch.targetBlockId === blockId) {
      delete document.branches[branchId];
    }
  }
  for (const chapter of document.chapters) {
    chapter.topLevelBlockIds = chapter.topLevelBlockIds.filter((id) => id !== blockId);
  }
}

function addedBlock(id: string) {
  return {
    id,
    label: 'Stability probe',
    content: {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'A single added block used by the stability gate.' }],
        },
      ],
    },
    border: 'subtle' as const,
  };
}

export function runStabilityProbe(
  file: string,
  document: NoteDocument,
  assets: Record<string, string>,
): StabilityReport {
  const baseline = layoutOnly(document, assets);
  const baselinePositions = blockPositions(baseline.layout);
  const lastChapter = document.chapters[document.chapters.length - 1];
  if (!lastChapter) throw new Error('Stability probe needs at least one chapter.');

  const added = cloneDocument(document);
  const newBlockId = `${document.id}-stability-added`;
  added.blocks[newBlockId] = addedBlock(newBlockId);
  const addedChapter = added.chapters[added.chapters.length - 1]!;
  addedChapter.topLevelBlockIds = [...addedChapter.topLevelBlockIds, newBlockId];
  const afterAdd = layoutOnly(added, assets);
  const addedPositions = blockPositions(afterAdd.layout);
  const movedBlocks: string[] = [];
  let kept = 0;
  let compared = 0;
  for (const [blockId, before] of baselinePositions) {
    const after = addedPositions.get(blockId);
    if (!after) continue;
    compared += 1;
    if (Math.abs(after.x - before.x) <= 2 && Math.abs(after.y - before.y) <= 2) kept += 1;
    else movedBlocks.push(blockId);
  }
  let unrelatedChaptersMoved = 0;
  for (const block of baseline.layout.blocks) {
    if (block.chapterId === lastChapter.id) continue;
    const after = addedPositions.get(block.blockId);
    if (!after) continue;
    if (Math.abs(after.x - block.x) > 1 || Math.abs(after.y - block.y) > 1) unrelatedChaptersMoved += 1;
  }

  const deleted = cloneDocument(document);
  const candidates = [...(deleted.chapters[deleted.chapters.length - 1]?.topLevelBlockIds ?? [])];
  const deletedBlockId =
    candidates.length > 1 ? candidates[Math.max(0, candidates.length - 5)]! : candidates[0]!;
  removeBlock(deleted, deletedBlockId);
  const afterDelete = layoutOnly(deleted, assets);
  const deletedPositions = blockPositions(afterDelete.layout);
  let outsideAffectedMoved = 0;
  let survivingBlocks = 0;
  for (const block of baseline.layout.blocks) {
    if (block.blockId === deletedBlockId) continue;
    const after = deletedPositions.get(block.blockId);
    if (!after) continue;
    survivingBlocks += 1;
    if (block.chapterId === lastChapter.id) continue;
    if (Math.abs(after.x - block.x) > 1 || Math.abs(after.y - block.y) > 1) outsideAffectedMoved += 1;
  }

  const referenced = cloneDocument(document);
  const referenceChapter = referenced.chapters[0]!;
  const sourceId = referenceChapter.topLevelBlockIds[0];
  const targetId = referenceChapter.topLevelBlockIds[1] ?? referenceChapter.topLevelBlockIds[0];
  if (sourceId && targetId) {
    referenced.branches['stability-reference-edge'] = {
      id: 'stability-reference-edge',
      source: { blockId: sourceId },
      targetBlockId: targetId,
      role: 'reference',
      order: 'z1',
      label: 'stability probe',
    };
  }
  const afterReference = layoutOnly(referenced, assets);
  let positionsIdentical = true;
  for (const [blockId, before] of baselinePositions) {
    const after = blockPositions(afterReference.layout).get(blockId);
    if (!after || Math.abs(after.x - before.x) > 0.01 || Math.abs(after.y - before.y) > 0.01) {
      positionsIdentical = false;
      break;
    }
  }
  const pageBreaksIdentical =
    pageBreakSignature(baseline.pages) === pageBreakSignature(afterReference.pages);

  return {
    fixtureFile: file,
    add: {
      newBlockId,
      keptRatio: compared === 0 ? 0 : kept / compared,
      movedBlocks,
      unrelatedChaptersMoved,
    },
    delete: {
      deletedBlockId,
      outsideAffectedMoved,
      survivingBlocks,
    },
    reference: {
      positionsIdentical,
      pageBreaksIdentical,
      pageCountBefore: baseline.pages.pageCount,
      pageCountAfter: afterReference.pages.pageCount,
    },
  };
}

export function runReferenceProbe(
  file: string,
  document: NoteDocument,
  assets: Record<string, string>,
): ReferenceReport {
  const baseline = layoutOnly(document, assets);
  const baselinePositions = blockPositions(baseline.layout);
  const modified = cloneDocument(document);
  const chapter = modified.chapters[0];
  if (!chapter) throw new Error('Reference probe needs at least one chapter.');
  const sourceId = chapter.topLevelBlockIds[0];
  const targetId = chapter.topLevelBlockIds[1] ?? chapter.topLevelBlockIds[0];
  const addedBranchId = 'spike-reference-probe';
  if (sourceId && targetId) {
    modified.branches[addedBranchId] = {
      id: addedBranchId,
      source: { blockId: sourceId },
      targetBlockId: targetId,
      role: 'reference',
      order: 'z-reference',
      label: 'reference probe',
    };
  }
  const after = layoutOnly(modified, assets);
  const afterPositions = blockPositions(after.layout);
  let positionsIdentical = true;
  for (const [blockId, before] of baselinePositions) {
    const next = afterPositions.get(blockId);
    if (!next || Math.abs(next.x - before.x) > 0.01 || Math.abs(next.y - before.y) > 0.01) {
      positionsIdentical = false;
      break;
    }
  }
  return {
    fixtureFile: file,
    positionsIdentical,
    pageBreaksIdentical: pageBreakSignature(baseline.pages) === pageBreakSignature(after.pages),
    pageCountBefore: baseline.pages.pageCount,
    pageCountAfter: after.pages.pageCount,
    addedBranchId,
  };
}

export function stateFromRun(
  file: string,
  view: ViewMode,
  document: NoteDocument,
  layout: ContinuousLayout,
  pages: PaginatedDocument,
  metrics: LayoutMetrics,
): TestState {
  return {
    fixtureFile: file,
    documentId: document.id,
    title: document.title,
    view,
    blockCount: layout.blocks.length,
    pageCount: pages.pageCount,
    chapterCount: layout.chapters.length,
    metrics,
    defects: pages.defects,
    blocks: layout.blocks.map((block: LayoutBlock) => ({
      blockId: block.blockId,
      chapterId: block.chapterId,
      role: block.role,
      depth: block.depth,
      parentBlockId: block.parentBlockId,
      anchorId: block.anchorId,
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
      contentTop: block.contentTop,
      segmentCount: block.measurement.segments.length,
      segments: block.measurement.segments.map((segment) => ({
        index: segment.index,
        kind: segment.kind,
        height: segment.height,
        rowIndex: segment.rowIndex,
        tableKey: segment.tableKey,
      })),
    })),
    anchors: layout.anchors,
    edges: layout.edges,
    pages: pages.pages.map((page) => ({
      pageNumber: page.pageNumber,
      chapterId: page.chapterId,
      yStart: page.yStart,
      yEnd: page.yEnd,
      isChapterStart: page.isChapterStart,
      overflow: page.overflow,
      fragmentCount: page.fragments.length,
      fragments: page.fragments.map((fragment) => ({
        blockId: fragment.blockId,
        startSegment: fragment.startSegment,
        endSegment: fragment.endSegment,
        isFirst: fragment.isFirst,
        isLast: fragment.isLast,
        x: fragment.page.x,
        y: fragment.page.y,
        width: fragment.page.width,
        height: fragment.page.height,
        continuesToPage: fragment.continuesToPage,
        continuedFromPage: fragment.continuedFromPage,
      })),
      continuationIn: page.continuationIn,
      continuationOut: page.continuationOut,
    })),
  };
}

export function pageViewGeometryFromDom(): PageViewGeometry {
  const pages: PageViewGeometry['pages'] = [];
  for (const pageElement of document.querySelectorAll<HTMLElement>('[data-page-number]')) {
    const pageRect = pageElement.getBoundingClientRect();
    const fragments: PageViewGeometry['pages'][number]['fragments'] = [];
    for (const fragment of pageElement.querySelectorAll<HTMLElement>('[data-fragment-block]')) {
      const rect = fragment.getBoundingClientRect();
      const label = fragment.querySelector<HTMLElement>('.nf-label');
      const labelRect = label?.getBoundingClientRect();
      fragments.push({
        blockId: fragment.dataset['fragmentBlock'] ?? '',
        label: label?.textContent ?? null,
        labelRect: labelRect
          ? {
              x: labelRect.left - pageRect.left,
              y: labelRect.top - pageRect.top,
              width: labelRect.width,
              height: labelRect.height,
            }
          : null,
        rect: {
          x: rect.left - pageRect.left,
          y: rect.top - pageRect.top,
          width: rect.width,
          height: rect.height,
        },
        startSegment: Number(fragment.dataset['fragmentStart'] ?? '0'),
        endSegment: Number(fragment.dataset['fragmentEnd'] ?? '0'),
      });
    }
    pages.push({
      pageNumber: Number(pageElement.dataset['pageNumber'] ?? '0'),
      rect: { x: 0, y: 0, width: pageRect.width, height: pageRect.height },
      fragments,
    });
  }
  return { devicePixelRatio: window.devicePixelRatio, pages };
}
