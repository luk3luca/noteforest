import { existsSync, readFileSync } from 'node:fs';
import type {
  ContinuousLayout,
  LayoutBlock,
  LayoutOptions,
  NoteDocument,
  WrapPolicy,
} from '../src/index.js';
import {
  blockRect,
  clearGap,
  createEstimatedMeasurement,
  DEFAULT_LAYOUT_OPTIONS,
  layoutDocument,
  overlaps,
  paginate,
} from '../src/index.js';
import { FIXTURES } from './helpers.js';
import { resolve } from 'node:path';

export const SHOWCASE_PATH = '/Users/luca/Documents/NoteForest/note-forest-showcase/document.json';
export const LAB_POLICIES: readonly WrapPolicy[] = [
  'right-first-per-child',
  'group-left-origin',
  'subtree-aware',
];
export const LAB_FIXTURES = ['scale-300.json', 'deep-chain.json', 'wide-fan.json'] as const;

const EPSILON = 0.25;

export interface LabMetrics {
  label: string;
  policy: WrapPolicy;
  wrapIndent: number;
  maxWrapIndent: number;
  blocks: number;
  pages: number;
  pageDelta: number;
  defects: number;
  contentTooWide: number;
  layoutOverflow: number;
  maxRightEdge: number;
  maxContentWidth: number;
  pageContentWidth: number;
  layoutHeight: number;
  whitespaceRatio: number;
  directGroups: number;
  wrappedGroups: number;
  wrappedChildren: number;
  maxWrapDepth: number;
}

export interface LabVariant {
  policy: WrapPolicy;
  wrapIndent?: number;
  maxWrapIndent?: number;
}

export function readShowcaseDocument(): NoteDocument | null {
  if (!existsSync(SHOWCASE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SHOWCASE_PATH, 'utf8')) as NoteDocument;
  } catch {
    return null;
  }
}

function wrappedChildrenByParent(
  layout: ContinuousLayout,
  layoutOptions: LayoutOptions,
): Map<string, LayoutBlock[]> {
  const childrenByParent = new Map<string, LayoutBlock[]>();
  for (const block of layout.blocks) {
    if (block.role !== 'child' || !block.parentBlockId) continue;
    const list = childrenByParent.get(block.parentBlockId) ?? [];
    list.push(block);
    childrenByParent.set(block.parentBlockId, list);
  }
  const wrapped = new Map<string, LayoutBlock[]>();
  for (const [parentId, children] of childrenByParent) {
    const parent = layout.blockById[parentId];
    if (!parent) continue;
    const rightX = parent.x + parent.width + layoutOptions.siblingGap;
    const below = children.filter((child) => Math.abs(child.x - rightX) > EPSILON);
    if (below.length > 0) wrapped.set(parentId, below);
  }
  return wrapped;
}

function maxWrapDepthOf(layout: ContinuousLayout, layoutOptions: LayoutOptions): number {
  const cache = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (blockId: string): number => {
    const cached = cache.get(blockId);
    if (cached !== undefined) return cached;
    if (visiting.has(blockId)) return 0;
    visiting.add(blockId);
    const block = layout.blockById[blockId];
    let depth = 0;
    if (block && block.role === 'child' && block.parentBlockId) {
      const parent = layout.blockById[block.parentBlockId];
      if (parent) {
        const rightX = parent.x + parent.width + layoutOptions.siblingGap;
        const below = Math.abs(block.x - rightX) > EPSILON ? 1 : 0;
        depth = below + depthOf(parent.blockId);
      }
    }
    visiting.delete(blockId);
    cache.set(blockId, depth);
    return depth;
  };
  let max = 0;
  for (const block of layout.blocks) max = Math.max(max, depthOf(block.blockId));
  return max;
}

export function computeLabMetrics(
  label: string,
  document: NoteDocument,
  variant: LabVariant | WrapPolicy,
): { layout: ContinuousLayout; metrics: LabMetrics } {
  const policy = typeof variant === 'string' ? variant : variant.policy;
  const wrapIndent =
    typeof variant === 'string'
      ? DEFAULT_LAYOUT_OPTIONS.wrapIndent
      : (variant.wrapIndent ?? DEFAULT_LAYOUT_OPTIONS.wrapIndent);
  const maxWrapIndent =
    typeof variant === 'string'
      ? DEFAULT_LAYOUT_OPTIONS.maxWrapIndent
      : (variant.maxWrapIndent ?? DEFAULT_LAYOUT_OPTIONS.maxWrapIndent);
  const layoutOptions: LayoutOptions = {
    ...DEFAULT_LAYOUT_OPTIONS,
    wrapIndent,
    maxWrapIndent,
    wrapPolicy: policy,
  };
  const layout = layoutDocument(document, createEstimatedMeasurement(document), layoutOptions);
  const pages = paginate(layout, document);
  const wrapped = wrappedChildrenByParent(layout, layoutOptions);
  const directGroupCount = new Set(
    layout.blocks
      .filter((block) => block.role === 'child' && block.parentBlockId)
      .map((block) => block.parentBlockId as string),
  ).size;
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
  const metrics: LabMetrics = {
    label,
    policy,
    wrapIndent,
    maxWrapIndent,
    blocks: layout.blocks.length,
    pages: pages.pageCount,
    pageDelta: 0,
    defects: layout.defects.length,
    contentTooWide: defectsByCode.get('content-too-wide') ?? 0,
    layoutOverflow: defectsByCode.get('layout-overflow') ?? 0,
    maxRightEdge: Math.max(0, ...layout.blocks.map((block) => block.x + block.width)),
    maxContentWidth: Math.max(0, ...layout.blocks.map((block) => block.contentWidth)),
    pageContentWidth: layout.geometry.contentWidthPx,
    layoutHeight,
    whitespaceRatio: bandArea > 0 ? 1 - usedArea / bandArea : 0,
    directGroups: directGroupCount,
    wrappedGroups: wrapped.size,
    wrappedChildren: [...wrapped.values()].reduce((total, list) => total + list.length, 0),
    maxWrapDepth: maxWrapDepthOf(layout, layoutOptions),
  };
  return { layout, metrics };
}

export function layoutInvariantFailures(layout: ContinuousLayout): string[] {
  const failures: string[] = [];
  const byChapter = new Map<string, LayoutBlock[]>();
  for (const block of layout.blocks) {
    const list = byChapter.get(block.chapterId) ?? [];
    list.push(block);
    byChapter.set(block.chapterId, list);
  }
  for (const blocks of byChapter.values()) {
    for (let i = 0; i < blocks.length; i += 1) {
      for (let j = i + 1; j < blocks.length; j += 1) {
        const a = blocks[i] as LayoutBlock;
        const b = blocks[j] as LayoutBlock;
        if (overlaps(blockRect(a), blockRect(b))) {
          failures.push(`overlap ${a.blockId}/${b.blockId}`);
          continue;
        }
        if (clearGap(blockRect(a), blockRect(b)) < 16) {
          failures.push(`gap ${a.blockId}/${b.blockId}`);
        }
      }
    }
  }
  return failures;
}

export function blockSignature(layout: ContinuousLayout): string[] {
  return layout.blocks.map((block) =>
    [
      block.blockId,
      block.x.toFixed(3),
      block.y.toFixed(3),
      block.width.toFixed(3),
      block.height.toFixed(3),
      block.subtreeBottom.toFixed(3),
    ].join(':'),
  );
}

export function formatBranchTree(layout: ContinuousLayout, rootId: string): string[] {
  const lines: string[] = [];
  const walk = (blockId: string, indent: number): void => {
    const block = layout.blockById[blockId];
    if (!block) return;
    lines.push(
      `${'  '.repeat(indent)}${block.blockId} [${block.role}] x=${block.x.toFixed(1)} y=${block.y.toFixed(1)} w=${block.width.toFixed(1)} h=${block.height.toFixed(1)}`,
    );
    for (const childId of block.childIds) walk(childId, indent + 1);
  };
  walk(rootId, 0);
  return lines;
}

export function formatMetricsTable(rows: LabMetrics[]): string {
  const header = [
    'fixture',
    'policy',
    'pages',
    'Δpages',
    'max right',
    'max content',
    'height',
    'whitespace',
    'wrap groups',
    'wrap children',
    'wrap depth',
    'c2w',
    'overflow',
  ];
  const body = rows.map((row) => [
    row.label,
    row.policy,
    String(row.pages),
    String(row.pageDelta),
    row.maxRightEdge.toFixed(1),
    row.maxContentWidth.toFixed(1),
    row.layoutHeight.toFixed(1),
    `${(row.whitespaceRatio * 100).toFixed(1)}%`,
    `${row.wrappedGroups}/${row.directGroups}`,
    String(row.wrappedChildren),
    String(row.maxWrapDepth),
    String(row.contentTooWide),
    String(row.layoutOverflow),
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...body.map((row) => row[index]?.length ?? 0)),
  );
  const render = (cells: string[]): string =>
    cells
      .map((cell, index) => (index === 0 ? cell.padEnd(widths[index] ?? 0) : cell.padStart(widths[index] ?? 0)))
      .join(' | ');
  return [render(header), widths.map((width) => '-'.repeat(width)).join('-|-'), ...body.map(render)].join(
    '\n',
  );
}

export function loadLabDocument(name: (typeof LAB_FIXTURES)[number] | 'showcase'): NoteDocument | null {
  if (name === 'showcase') return readShowcaseDocument();
  return JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8')) as NoteDocument;
}
