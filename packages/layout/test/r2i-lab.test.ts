import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'vitest';
import {
  createEstimatedMeasurement,
  DEFAULT_PAGE_SETTINGS,
  layoutDocument,
  pageLayoutOptions,
  paginate,
  type NoteDocument,
} from '../src/index.js';

const ROOT = resolve(import.meta.dirname, '../../..');
const OUT = process.env.R2I_OUT ?? resolve(ROOT, 'artifacts/r2i/lab.json');

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

function synthetic(
  id: string,
  specs: Array<[string, string, string]>,
  edges: Array<[string, string]>,
): NoteDocument {
  return {
    schemaVersion: 2,
    id,
    title: id,
    blocks: Object.fromEntries(specs.map(([blockId, label, text]) => [
      blockId,
      textBlock(blockId, label, text),
    ])),
    anchors: {},
    branches: Object.fromEntries(
      edges.map(([from, to], index) => [
        `b${index}`,
        {
          id: `b${index}`,
          source: { blockId: from },
          targetBlockId: to,
          role: 'primary' as const,
          order: `m${index}`,
        },
      ]),
    ),
    chapters: [{ id: 'chapter-1', title: 'Chapter', topLevelBlockIds: [specs[0]![0]] }],
    assets: {},
  };
}

const LONG =
  'A long body of text that fills the readable measure so the measured card reaches the page maximum width before the layout decides whether the subtree fits.';
const LONGER = `${LONG} ${LONG}`;

const CASES: Array<{ name: string; document: NoteDocument }> = [
  {
    name: 'r2i-p-c1-g1',
    document: synthetic(
      'r2i-p-c1-g1',
      [
        ['root', 'Root', 'Root'],
        ['child', 'Child', LONG],
        ['grandchild', 'Grandchild', LONG],
      ],
      [
        ['root', 'child'],
        ['child', 'grandchild'],
      ],
    ),
  },
  {
    name: 'r2i-nested',
    document: synthetic(
      'r2i-nested',
      [
        ['root', 'Root', 'Root'],
        ['child', 'Child', LONG],
        ['grandchild', 'Grandchild', LONG],
        ['great', 'Great-grandchild', LONG],
      ],
      [
        ['root', 'child'],
        ['child', 'grandchild'],
        ['grandchild', 'great'],
      ],
    ),
  },
  {
    name: 'r2i-siblings',
    document: synthetic(
      'r2i-siblings',
      [
        ['root', 'Root', 'Root'],
        ['child', 'Child', LONG],
        ['grandchild', 'Grandchild', LONG],
        ['leaf', 'Sibling leaf', 'A short sibling leaf.'],
      ],
      [
        ['root', 'child'],
        ['root', 'leaf'],
        ['child', 'grandchild'],
      ],
    ),
  },
];

function loadFixture(name: string): NoteDocument {
  return JSON.parse(readFileSync(resolve(ROOT, 'fixtures', name), 'utf8')) as NoteDocument;
}

function loadShowcase(): NoteDocument | null {
  try {
    return JSON.parse(
      readFileSync('/Users/luca/Documents/NoteForest/note-forest-showcase/document.json', 'utf8'),
    ) as NoteDocument;
  } catch {
    return null;
  }
}

function metrics(name: string, document: NoteDocument) {
  const layout = layoutDocument(
    document,
    createEstimatedMeasurement(document),
    pageLayoutOptions(DEFAULT_PAGE_SETTINGS.theme),
    DEFAULT_PAGE_SETTINGS.setup,
  );
  const pages = paginate(layout, document);
  const directChildren = new Map<string, typeof layout.blocks>();
  for (const block of layout.blocks) {
    if (block.role !== 'child' || !block.parentBlockId) continue;
    const list = directChildren.get(block.parentBlockId) ?? [];
    list.push(block);
    directChildren.set(block.parentBlockId, list);
  }
  let wrappedGroups = 0;
  let wrappedChildren = 0;
  for (const [parentId, children] of directChildren) {
    const parent = layout.blockById[parentId];
    if (!parent) continue;
    const rightX = parent.x + parent.width + DEFAULT_PAGE_SETTINGS.theme.siblingGap;
    const wrapped = children.filter((child) => Math.abs(child.x - rightX) > 0.25);
    if (wrapped.length > 0) {
      wrappedGroups += 1;
      wrappedChildren += wrapped.length;
    }
  }
  const usedArea = layout.blocks.reduce((total, block) => total + block.width * block.height, 0);
  const bandArea = layout.chapters.reduce(
    (total, chapter) => total + layout.geometry.contentWidthPx * chapter.height,
    0,
  );
  return {
    name,
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
    wrappedChildren,
    wrappedPlacements: Object.fromEntries(
      layout.blocks
        .filter((block) => block.role === 'child' && block.placement === 'below')
        .map((block) => [block.blockId, Number(block.x.toFixed(1))]),
    ),
  };
}

describe('r2i page lab', () => {
  it('records page count and whitespace for the Page product defaults', () => {
    const rows = CASES.map((entry) => metrics(entry.name, entry.document));
    for (const name of ['scale-300.json', 'wide-fan.json', 'deep-chain.json']) {
      rows.push(metrics(name, loadFixture(name)));
    }
    const showcase = loadShowcase();
    if (showcase) rows.push(metrics('showcase', showcase));
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(rows, null, 2));
  });
});
