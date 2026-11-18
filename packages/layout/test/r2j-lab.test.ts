import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createEstimatedMeasurement,
  DEFAULT_PAGE_SETTINGS,
  layoutDocument,
  pageLayoutOptions,
  paginate,
  type LayoutOptions,
  type NoteDocument,
  type PageSetup,
} from '../src/index.js';

import { anchorViewFor } from './helpers.js';
/**
 * R2j Page callout-mode lab.
 *
 * "Before" is the pre-R2j beside geometry (`calloutModes: false`), i.e. the
 * stacked callout lane. "After" is the resolved PageTheme path with the A/B2
 * mode choice. The estimator is DOM-free and deterministic, so the delta is
 * reproducible alongside the UI evidence.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const OUT = process.env.R2J_OUT ?? resolve(ROOT, 'artifacts/r2j/lab.json');

const A4_LANDSCAPE: PageSetup = {
  size: 'A4',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
const A5_PORTRAIT: PageSetup = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
const A5_PORTRAIT_STACKED: PageSetup = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 46, right: 46, bottom: 46, left: 46 },
};

const ROOT_TEXT =
  'An eigenvalue is a scalar and the callout lane root stays wide enough for the per-parent mode choice.';
const CHILD_TEXT =
  'A direct child with a nested branch and its own anchored callout. The mode choice repeats at depth.';

function textBlock(id: string, label: string, text: string) {
  return {
    id,
    label,
    content: {
      type: 'doc' as const,
      children: [
        {
          type: 'paragraph' as const,
          children: [{ type: 'text' as const, text }],
        },
      ],
    },
  };
}

function anchoredBlock(id: string, label: string, text: string, quote: string, anchorId: string) {
  const start = text.indexOf(quote);
  return {
    id,
    label,
    content: {
      type: 'doc' as const,
      children: [
        {
          type: 'paragraph' as const,
          children: [
            ...(start > 0 ? [{ type: 'text' as const, text: text.slice(0, start) }] : []),
            {
              type: 'text' as const,
              text: quote,
              marks: [{ type: 'anchor' as const, attrs: { anchorId } }],
            },
            ...(start + quote.length < text.length
              ? [{ type: 'text' as const, text: text.slice(start + quote.length) }]
              : []),
          ],
        },
      ],
    },
  };
}

function pageCalloutDocument(): NoteDocument {
  const firstQuote = 'eigenvalue';
  const secondQuote = 'callout lane';
  const nestedQuote = 'nested branch';
  return {
    schemaVersion: 2,
    id: 'r2j-lab',
    title: 'R2j callout modes',
    blocks: {
      root: anchoredBlock('root', 'Root', ROOT_TEXT, firstQuote, 'a-root'),
      calloutA: textBlock('calloutA', 'Callout A', 'A scalar multiple only stretches the vector.'),
      calloutB: textBlock('calloutB', 'Callout B', 'The multiplier is the eigenvalue.'),
      child: anchoredBlock('child', 'Child', CHILD_TEXT, nestedQuote, 'a-child'),
      childLeaf: textBlock('childLeaf', 'Second child', 'A second direct child in the same level column.'),
      nestedCallout: textBlock('nestedCallout', 'Nested callout', 'A nested callout for the child group.'),
      grandchild: textBlock('grandchild', 'Grandchild', 'A grandchild below its parent when it fits.'),
    },
    anchors: {
      'a-root': { id: 'a-root', blockId: 'root', kind: 'text', quote: firstQuote },
      'a-mid': { id: 'a-mid', blockId: 'root', kind: 'text', quote: secondQuote },
      'a-child': { id: 'a-child', blockId: 'child', kind: 'text', quote: nestedQuote },
    },
    branches: {
      'b-callout-a': {
        id: 'b-callout-a',
        source: { blockId: 'root', anchorId: 'a-root' },
        targetBlockId: 'calloutA',
        role: 'primary',
        order: 'a',
      },
      'b-callout-b': {
        id: 'b-callout-b',
        source: { blockId: 'root', anchorId: 'a-mid' },
        targetBlockId: 'calloutB',
        role: 'primary',
        order: 'b',
      },
      'b-child': {
        id: 'b-child',
        source: { blockId: 'root' },
        targetBlockId: 'child',
        role: 'primary',
        order: 'c',
      },
      'b-leaf': {
        id: 'b-leaf',
        source: { blockId: 'root' },
        targetBlockId: 'childLeaf',
        role: 'primary',
        order: 'd',
      },
      'b-nested-callout': {
        id: 'b-nested-callout',
        source: { blockId: 'child', anchorId: 'a-child' },
        targetBlockId: 'nestedCallout',
        role: 'primary',
        order: 'a',
      },
      'b-grandchild': {
        id: 'b-grandchild',
        source: { blockId: 'child' },
        targetBlockId: 'grandchild',
        role: 'primary',
        order: 'b',
      },
    },
    chapters: [{ id: 'chapter-1', title: 'Chapter', topLevelBlockIds: ['root'] }],
    assets: {},
  };
}

function pageCalloutShallowDocument(): NoteDocument {
  const firstQuote = 'eigenvalue';
  return {
    schemaVersion: 2,
    id: 'r2j-lab-shallow',
    title: 'R2j stacked fallback',
    blocks: {
      root: anchoredBlock('root', 'Root', ROOT_TEXT, firstQuote, 'a-root'),
      calloutA: textBlock('calloutA', 'Callout A', 'A scalar multiple only stretches the vector.'),
      child: textBlock('child', 'Child', 'A direct child below the callout stack.'),
      childLeaf: textBlock('childLeaf', 'Second child', 'A second direct child in the same level column.'),
    },
    anchors: {
      'a-root': { id: 'a-root', blockId: 'root', kind: 'text', quote: firstQuote },
    },
    branches: {
      'b-callout-a': {
        id: 'b-callout-a',
        source: { blockId: 'root', anchorId: 'a-root' },
        targetBlockId: 'calloutA',
        role: 'primary',
        order: 'a',
      },
      'b-child': {
        id: 'b-child',
        source: { blockId: 'root' },
        targetBlockId: 'child',
        role: 'primary',
        order: 'c',
      },
      'b-leaf': {
        id: 'b-leaf',
        source: { blockId: 'root' },
        targetBlockId: 'childLeaf',
        role: 'primary',
        order: 'd',
      },
    },
    chapters: [{ id: 'chapter-1', title: 'Chapter', topLevelBlockIds: ['root'] }],
    assets: {},
  };
}

function loadFixture(name: string): NoteDocument {
  return JSON.parse(readFileSync(resolve(ROOT, 'fixtures', name), 'utf8')) as NoteDocument;
}

function loadShowcase(): NoteDocument | null {
  try {
    return JSON.parse(
      readFileSync('~/Documents/NoteForest/note-forest-showcase/document.json', 'utf8'),
    ) as NoteDocument;
  } catch {
    return null;
  }
}

function options(calloutModes: boolean): LayoutOptions {
  return {
    ...pageLayoutOptions(DEFAULT_PAGE_SETTINGS.theme),
    calloutModes,
  };
}

function metrics(name: string, document: NoteDocument, setup: PageSetup, calloutModes: boolean) {
  const layout = layoutDocument(
    document,
    createEstimatedMeasurement(document),
    options(calloutModes),
    setup,
      anchorViewFor(document),
  );
  const pages = paginate(layout, document);
  const usedArea = layout.blocks.reduce((total, block) => total + block.width * block.height, 0);
  const bandArea = layout.chapters.reduce(
    (total, chapter) => total + layout.geometry.contentWidthPx * chapter.height,
    0,
  );
  const directChildren = new Map<string, number>();
  for (const block of layout.blocks) {
    if (block.role !== 'child' || !block.parentBlockId) continue;
    directChildren.set(block.parentBlockId, (directChildren.get(block.parentBlockId) ?? 0) + 1);
  }
  let wrappedGroups = 0;
  for (const [parentId, count] of directChildren) {
    const parent = layout.blockById[parentId];
    if (!parent) continue;
    const below = layout.blocks.filter(
      (block) =>
        block.role === 'child' &&
        block.parentBlockId === parentId &&
        block.placement === 'below',
    ).length;
    if (below > 0 && below === count) wrappedGroups += 1;
  }
  const rightCallouts = layout.blocks.filter(
    (block) => block.role === 'callout' && block.placement === 'right',
  ).length;
  const belowCallouts = layout.blocks.filter(
    (block) => block.role === 'callout' && block.placement === 'below',
  ).length;
  const b2Groups = new Set(
    layout.blocks
      .filter((block) => block.trunkGroup !== undefined)
      .map((block) => `${block.parentBlockId}:${block.trunkGroup}`),
  ).size;
  return {
    name,
    calloutModes,
    setup: `${setup.size}-${setup.orientation}`,
    blocks: layout.blocks.length,
    pages: pages.pageCount,
    defects: layout.defects.length,
    blockingDefects: pages.defects.filter((defect) => defect.blocksExport).length,
    contentTooWide: layout.defects.filter((defect) => defect.code === 'content-too-wide').length,
    layoutOverflow: layout.defects.filter((defect) => defect.code === 'layout-overflow').length,
    maxRightEdge: Math.max(0, ...layout.blocks.map((block) => block.x + block.width)),
    contentWidth: layout.geometry.contentWidthPx,
    layoutHeight: layout.chapters.reduce((total, chapter) => total + chapter.height, 0),
    whitespaceRatio: bandArea > 0 ? Number((1 - usedArea / bandArea).toFixed(4)) : 0,
    wrappedGroups,
    rightCallouts,
    belowCallouts,
    b2Groups,
  };
}

describe('r2j page callout-mode lab', () => {
  it('records page count, whitespace, and callout placement before/after the Page theme modes', () => {
    const cases: Array<{ name: string; document: NoteDocument; setup: PageSetup }> = [
      { name: 'A-multiple-callouts', document: pageCalloutDocument(), setup: A4_LANDSCAPE },
      { name: 'B2-no-right-lane', document: pageCalloutDocument(), setup: A5_PORTRAIT },
      { name: 'stacked-fallback', document: pageCalloutShallowDocument(), setup: A5_PORTRAIT_STACKED },
      { name: 'scale-300', document: loadFixture('scale-300.json'), setup: A4_LANDSCAPE },
      { name: 'wide-fan', document: loadFixture('wide-fan.json'), setup: A4_LANDSCAPE },
      { name: 'deep-chain', document: loadFixture('deep-chain.json'), setup: A4_LANDSCAPE },
    ];
    const showcase = loadShowcase();
    if (showcase) cases.push({ name: 'showcase', document: showcase, setup: A4_LANDSCAPE });

    const rows = cases.map((entry) => ({
      name: entry.name,
      before: metrics(entry.name, entry.document, entry.setup, false),
      after: metrics(entry.name, entry.document, entry.setup, true),
    }));

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(rows, null, 2));

    const a = rows.find((row) => row.name === 'A-multiple-callouts')!;
    expect(a.after.rightCallouts).toBeGreaterThan(0);
    expect(a.after.belowCallouts).toBe(0);
    const b2 = rows.find((row) => row.name === 'B2-no-right-lane')!;
    expect(b2.after.b2Groups).toBeGreaterThan(0);
    expect(b2.after.belowCallouts).toBeGreaterThan(0);
    const stacked = rows.find((row) => row.name === 'stacked-fallback')!;
    if (stacked.after.blockingDefects > 0) {
      const doc = cases.find((entry) => entry.name === 'stacked-fallback')!.document;
      const debug = layoutDocument(doc, createEstimatedMeasurement(doc), options(true), A5_PORTRAIT_STACKED, anchorViewFor(doc));
      console.error('STACKED DEFECTS', debug.defects.filter((d) => d.blocksExport).map((d) => `${d.code}:${d.blockId}:${d.message}`));
      console.error('BLOCKS', debug.blocks.map((b) => `${b.blockId}:${b.x},${b.y},${b.width}`));
    }
    expect(stacked.after.b2Groups).toBe(0);
    expect(stacked.after.belowCallouts).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.after.blockingDefects, `${row.name}: no blocking defect`).toBe(0);
      expect(row.after.contentTooWide, `${row.name}: no content-too-wide`).toBe(0);
      expect(row.after.layoutOverflow, `${row.name}: no layout-overflow`).toBe(0);
    }
  });
});
