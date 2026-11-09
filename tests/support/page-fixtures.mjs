import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Page-view document fixtures.
 *
 * UI/visual tests write a real canonical package into the isolated library.
 * Page setup and manual breaks are personal settings (ADR-0008), so fixtures
 * never carry them; this slice renders with the product default page settings.
 */

export function paragraph(text) {
  return { type: 'paragraph', children: [{ type: 'text', text }] };
}

export function textBlock(id, label, text) {
  return { id, label, content: { type: 'doc', children: [paragraph(text)] } };
}

export function longTextBlock(id, label, count = 80) {
  return {
    id,
    label,
    content: {
      type: 'doc',
      children: Array.from({ length: count }, (_, index) =>
        paragraph(
          `Paragraph ${index + 1}. The paginator prefers a break between paragraphs, so this long block continues with a stable marker instead of cutting a line.`,
        ),
      ),
    },
  };
}

export function imageBlock(id, label, assetId, alt = 'Lost diagram', dimensions) {
  return {
    id,
    label,
    content: {
      type: 'doc',
      children: [
        {
          type: 'image',
          attrs: {
            assetId,
            alt,
            ...(dimensions === undefined
              ? {}
              : { width: dimensions.width, height: dimensions.height }),
          },
        },
      ],
    },
  };
}

/**
 * One chapter with the given top-level blocks and optional primary branches.
 * Extra content fields are intentionally absent: this is a valid canonical
 * package, not a test-only projection.
 */
export function pageDocument({
  id = 'page-fixture',
  title = 'Page fixture',
  chapterTitle = 'Chapter 1',
  blocks = [],
  anchors = [],
  branches = [],
}) {
  const chapterId = 'chapter-1';
  return {
    schemaVersion: 2,
    id,
    title,
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
    revision: 0,
    chapters: [
      {
        id: chapterId,
        title: chapterTitle,
        topLevelBlockIds: blocks
          .filter(
            (block) =>
              !branches.some(
                (branch) =>
                  branch.targetBlockId === block.id && (branch.role ?? 'primary') === 'primary',
              ),
          )
          .map((block) => block.id),
      },
    ],
    blocks: Object.fromEntries(
      blocks.map((block) => [
        block.id,
        {
          id: block.id,
          ...(block.label === undefined ? {} : { label: block.label }),
          content: block.content,
        },
      ]),
    ),
    anchors: Object.fromEntries(anchors.map((anchor) => [anchor.id, anchor])),
    branches: Object.fromEntries(
      branches.map((branch, index) => [
        branch.id,
        {
          id: branch.id,
          source: {
            blockId: branch.sourceBlockId,
            ...(branch.sourceAnchorId === undefined
              ? {}
              : { anchorId: branch.sourceAnchorId }),
          },
          targetBlockId: branch.targetBlockId,
          role: branch.role ?? 'primary',
          ...(branch.label === undefined ? {} : { label: branch.label }),
          order: branch.order ?? `m${index}`,
        },
      ]),
    ),
    assets: {},
  };
}

export async function writePagePackage(libraryPath, name, document, assetFiles = {}) {
  const packagePath = resolve(libraryPath, name);
  await mkdir(resolve(packagePath, 'assets'), { recursive: true });
  for (const [assetId, sourcePath] of Object.entries(assetFiles)) {
    await copyFile(sourcePath, resolve(packagePath, 'assets', assetId));
  }
  await writeFile(
    resolve(packagePath, 'document.json'),
    JSON.stringify(document, null, 2),
    'utf8',
  );
  return packagePath;
}

/**
 * Small page-arrow fixture: a primary direct child, an anchored callout, and a
 * labeled reference. `manualBreakBeforeBlockIds: ['callout']` turns both
 * primary/callout and reference edges into cross-page indicators.
 */
export function pageArrowsDocument() {
  const sourceText = 'An eigenvalue is a scalar.';
  const quote = 'eigenvalue';
  const start = sourceText.indexOf(quote);
  const source = {
    id: 'source',
    label: 'Source',
    content: {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            ...(start > 0 ? [{ type: 'text', text: sourceText.slice(0, start) }] : []),
            {
              type: 'text',
              text: quote,
              marks: [{ type: 'anchor', attrs: { anchorId: 'anchor-1' } }],
            },
            ...(start + quote.length < sourceText.length
              ? [{ type: 'text', text: sourceText.slice(start + quote.length) }]
              : []),
          ],
        },
      ],
    },
  };
  return pageDocument({
    id: 'page-arrows',
    title: 'Page arrows',
    chapterTitle: 'Arrows',
    blocks: [
      source,
      textBlock('direct', 'Direct child', 'A direct primary child placed to the right.'),
      textBlock('callout', 'Anchored callout', 'An anchored callout placed below its anchor.'),
      textBlock('ref', 'Reference target', 'A labeled reference target.'),
    ],
    anchors: [
      {
        id: 'anchor-1',
        blockId: 'source',
        kind: 'text',
        selector: { kind: 'text', quote, prefix: 'An ', suffix: ' is' },
        quote,
        prefix: 'An ',
        suffix: ' is',
      },
    ],
    branches: [
      {
        id: 'branch-direct',
        sourceBlockId: 'source',
        targetBlockId: 'direct',
        role: 'primary',
      },
      {
        id: 'branch-callout',
        sourceBlockId: 'source',
        sourceAnchorId: 'anchor-1',
        targetBlockId: 'callout',
        role: 'primary',
      },
      {
        id: 'branch-reference',
        sourceBlockId: 'source',
        targetBlockId: 'ref',
        role: 'reference',
        label: 'also uses',
      },
    ],
  });
}

/**
 * R2b beside-packing fixture: a wide parent with two anchored callouts and a
 * direct child, plus a nested child that also has a callout and a direct child.
 * One chapter, one page at A4 landscape; no image or font dependency.
 */
export function sidePackingDocument() {
  const rootLead = 'An ';
  const rootAnchorQuote = 'eigenvalue';
  const rootText =
    'An eigenvalue is a scalar that a linear map sends to a multiple of itself. ' +
    'The scalar is the multiple and the vector is its eigenvector.';
  const midQuote = 'multiple';
  const midStart = rootText.indexOf(midQuote);
  const childText = 'A direct child beside its parent.';
  const nestedQuote = 'beside';
  const nestedStart = childText.indexOf(nestedQuote);
  const root = {
    id: 'side-root',
    label: 'Side root',
    content: {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: rootLead },
            {
              type: 'text',
              text: rootAnchorQuote,
              marks: [{ type: 'anchor', attrs: { anchorIds: ['anchor-root'] } }],
            },
            { type: 'text', text: rootText.slice(rootLead.length + rootAnchorQuote.length, midStart) },
            {
              type: 'text',
              text: midQuote,
              marks: [{ type: 'anchor', attrs: { anchorIds: ['anchor-mid'] } }],
            },
            { type: 'text', text: rootText.slice(midStart + midQuote.length) },
          ],
        },
      ],
    },
  };
  const child = {
    id: 'side-child',
    label: 'Direct child',
    content: {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: childText.slice(0, nestedStart) },
            {
              type: 'text',
              text: nestedQuote,
              marks: [{ type: 'anchor', attrs: { anchorIds: ['anchor-nested'] } }],
            },
            { type: 'text', text: childText.slice(nestedStart + nestedQuote.length) },
          ],
        },
      ],
    },
  };
  return pageDocument({
    id: 'side-packing',
    title: 'Side packing',
    chapterTitle: 'Packing',
    blocks: [
      root,
      textBlock('side-callout-root', 'Root callout', 'A scalar multiple only stretches the vector.'),
      textBlock('side-callout-mid', 'Mid callout', 'The multiplier is the eigenvalue.'),
      child,
      textBlock('side-callout-child', 'Nested callout', 'A nested note beside the child.'),
      textBlock('side-grandchild', 'Grandchild', 'Grandchild beside the child.'),
      textBlock('side-ref', 'Reference target', 'A labeled reference target.'),
    ],
    anchors: [
      {
        id: 'anchor-root',
        blockId: 'side-root',
        kind: 'text',
        selector: { kind: 'text', quote: rootAnchorQuote, prefix: 'An ', suffix: ' is' },
        quote: rootAnchorQuote,
        prefix: 'An ',
        suffix: ' is',
      },
      {
        id: 'anchor-mid',
        blockId: 'side-root',
        kind: 'text',
        selector: { kind: 'text', quote: midQuote, prefix: 'a ', suffix: ' of' },
        quote: midQuote,
        prefix: 'a ',
        suffix: ' of',
      },
      {
        id: 'anchor-nested',
        blockId: 'side-child',
        kind: 'text',
        selector: { kind: 'text', quote: nestedQuote, prefix: 'child ', suffix: ' its' },
        quote: nestedQuote,
        prefix: 'child ',
        suffix: ' its',
      },
    ],
    branches: [
      {
        id: 'branch-callout-root',
        sourceBlockId: 'side-root',
        sourceAnchorId: 'anchor-root',
        targetBlockId: 'side-callout-root',
        role: 'primary',
      },
      {
        id: 'branch-callout-mid',
        sourceBlockId: 'side-root',
        sourceAnchorId: 'anchor-mid',
        targetBlockId: 'side-callout-mid',
        role: 'primary',
      },
      {
        id: 'branch-child',
        sourceBlockId: 'side-root',
        targetBlockId: 'side-child',
        role: 'primary',
      },
      {
        id: 'branch-callout-child',
        sourceBlockId: 'side-child',
        sourceAnchorId: 'anchor-nested',
        targetBlockId: 'side-callout-child',
        role: 'primary',
      },
      {
        id: 'branch-grandchild',
        sourceBlockId: 'side-child',
        targetBlockId: 'side-grandchild',
        role: 'primary',
      },
      {
        id: 'branch-reference',
        sourceBlockId: 'side-root',
        targetBlockId: 'side-ref',
        role: 'reference',
        label: 'also uses',
      },
    ],
  });
}

/**
 * R2f edge-topology fixture.
 *
 * Root with two direct children that share the right level column (child 2 is
 * lower than the parent), one indented grandchild under child 1, and two
 * anchored callouts below the root. The screenshot in the brief is the visual
 * reference; this fixture reproduces its topology without images.
 */
export function pageEdgeTopologyDocument() {
  const rootText =
    'A small forest. This block has three direct children and two anchored callouts. It shows layout, markers, and quote chips together.';
  const firstQuote = 'three direct children';
  const secondQuote = 'two anchored callouts';
  const firstStart = rootText.indexOf(firstQuote);
  const secondStart = rootText.indexOf(secondQuote);
  const root = {
    id: 'top-root',
    label: 'A small forest',
    content: {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            ...(firstStart > 0 ? [{ type: 'text', text: rootText.slice(0, firstStart) }] : []),
            {
              type: 'text',
              text: firstQuote,
              marks: [{ type: 'anchor', attrs: { anchorIds: ['anchor-top-first'] } }],
            },
            {
              type: 'text',
              text: rootText.slice(firstStart + firstQuote.length, secondStart),
            },
            {
              type: 'text',
              text: secondQuote,
              marks: [{ type: 'anchor', attrs: { anchorIds: ['anchor-top-second'] } }],
            },
            { type: 'text', text: rootText.slice(secondStart + secondQuote.length) },
          ],
        },
      ],
    },
  };
  return pageDocument({
    id: 'page-edge-topology',
    title: 'Page edge topology',
    chapterTitle: 'Topology',
    blocks: [
      root,
      textBlock(
        'top-child-1',
        'Direct child 1',
        'First direct child, with one grandchild to show the indentation rule clearly when the right column has no room left for another card.',
      ),
      textBlock('top-child-2', 'Direct child 2', 'Second direct child.'),
      textBlock('top-grandchild', 'Grandchild', 'Third level of the same structure.'),
      textBlock(
        'top-callout-1',
        'Three children',
        'Direct children stay right while there is room; when room runs out they wrap below, after the callouts.',
      ),
      textBlock(
        'top-callout-2',
        'Two callouts',
        'Callouts stay below the parent, in the safe zone; arrows enter from the left.',
      ),
    ],
    anchors: [
      {
        id: 'anchor-top-first',
        blockId: 'top-root',
        kind: 'text',
        selector: { kind: 'text', quote: firstQuote, prefix: 'has ', suffix: ' and' },
        quote: firstQuote,
        prefix: 'has ',
        suffix: ' and',
      },
      {
        id: 'anchor-top-second',
        blockId: 'top-root',
        kind: 'text',
        selector: { kind: 'text', quote: secondQuote, prefix: 'and ', suffix: '.' },
        quote: secondQuote,
        prefix: 'and ',
        suffix: '.',
      },
    ],
    branches: [
      {
        id: 'branch-top-child-1',
        sourceBlockId: 'top-root',
        targetBlockId: 'top-child-1',
        role: 'primary',
      },
      {
        id: 'branch-top-child-2',
        sourceBlockId: 'top-root',
        targetBlockId: 'top-child-2',
        role: 'primary',
      },
      {
        id: 'branch-top-grandchild',
        sourceBlockId: 'top-child-1',
        targetBlockId: 'top-grandchild',
        role: 'primary',
      },
      {
        id: 'branch-top-callout-1',
        sourceBlockId: 'top-root',
        sourceAnchorId: 'anchor-top-first',
        targetBlockId: 'top-callout-1',
        role: 'primary',
      },
      {
        id: 'branch-top-callout-2',
        sourceBlockId: 'top-root',
        sourceAnchorId: 'anchor-top-second',
        targetBlockId: 'top-callout-2',
        role: 'primary',
      },
    ],
  });
}

/**
 * R2g trunk-continuity fixture.
 *
 * Root's right group has child 1 on page 1 and child 2 on page 3; page 2 is a
 * pass-through page for the root trunk. Child 1's nested group wraps below and
 * crosses to its grandchild on page 2, so two independent trunks run in
 * parallel at different x. The UI test sets the two manual breaks.
 */
export function pageTrunkContinuityDocument() {
  return pageDocument({
    id: 'page-trunk-continuity',
    title: 'Page trunk continuity',
    chapterTitle: 'Trunk',
    blocks: [
      textBlock('r2g-root', 'Trunk root', 'A short root whose children continue across pages.'),
      textBlock(
        'r2g-child-1',
        'Child one',
        'First child, with a nested trunk that crosses a page. This sentence is long enough that the card takes the full readable maximum width, so the nested group cannot fit beside it and wraps below instead.',
      ),
      textBlock('r2g-grandchild', 'Grandchild', 'Nested child on a later page with enough text to keep a readable card width when the page measures it.'),
      textBlock('r2g-great-grandchild', 'Great-grandchild', 'Fourth level beside its parent on the same page.'),
      textBlock('r2g-child-2', 'Child two', 'Second child on the last page of the trunk.'),
    ],
    branches: [
      {
        id: 'branch-r2g-child-1',
        sourceBlockId: 'r2g-root',
        targetBlockId: 'r2g-child-1',
        role: 'primary',
      },
      {
        id: 'branch-r2g-grandchild',
        sourceBlockId: 'r2g-child-1',
        targetBlockId: 'r2g-grandchild',
        role: 'primary',
      },
      {
        id: 'branch-r2g-great-grandchild',
        sourceBlockId: 'r2g-grandchild',
        targetBlockId: 'r2g-great-grandchild',
        role: 'primary',
      },
      {
        id: 'branch-r2g-child-2',
        sourceBlockId: 'r2g-root',
        targetBlockId: 'r2g-child-2',
        role: 'primary',
      },
    ],
  });
}

/**
 * R2i subtree-aware wrap fixtures.
 *
 * Every fixture keeps the first child card narrow enough to fit beside its
 * parent while the whole child subtree does not. R2i must therefore move the
 * atomic direct-child group below the parent at the Page child indent instead
 * of leaving the child right and burning a lower-left column under it.
 */
export function pageSubtreeWrapDocument() {
  return pageDocument({
    id: 'page-subtree-wrap',
    title: 'Page subtree wrap',
    chapterTitle: 'Subtree wrap',
    blocks: [
      textBlock('r2i-root', 'Root', 'Root'),
      textBlock(
        'r2i-child',
        'Child',
        'A first child whose card fits beside the root, but whose whole subtree needs more room than the root right column leaves for it.',
      ),
      textBlock(
        'r2i-grandchild',
        'Grandchild',
        'The grandchild fits beside its own parent after the direct-child group wraps below the root at the child indent.',
      ),
    ],
    branches: [
      { id: 'branch-r2i-child', sourceBlockId: 'r2i-root', targetBlockId: 'r2i-child' },
      {
        id: 'branch-r2i-grandchild',
        sourceBlockId: 'r2i-child',
        targetBlockId: 'r2i-grandchild',
      },
    ],
  });
}

export function pageSubtreeWrapNestedDocument() {
  return pageDocument({
    id: 'page-subtree-wrap-nested',
    title: 'Page subtree wrap nested',
    chapterTitle: 'Nested wrap',
    blocks: [
      textBlock('r2i-nested-root', 'Root', 'Root'),
      textBlock(
        'r2i-nested-child',
        'Child',
        'A first child whose full subtree is wider than the root right column, so the whole group moves below the root at the child indent.',
      ),
      textBlock(
        'r2i-nested-grandchild',
        'Grandchild',
        'This grandchild still does not fit beside the child at the new origin, so it wraps one more level below its own parent.',
      ),
      textBlock(
        'r2i-nested-great',
        'Great-grandchild',
        'The great-grandchild fits beside the grandchild once both groups have wrapped to their child indents.',
      ),
    ],
    branches: [
      {
        id: 'branch-r2i-nested-child',
        sourceBlockId: 'r2i-nested-root',
        targetBlockId: 'r2i-nested-child',
      },
      {
        id: 'branch-r2i-nested-grandchild',
        sourceBlockId: 'r2i-nested-child',
        targetBlockId: 'r2i-nested-grandchild',
      },
      {
        id: 'branch-r2i-nested-great',
        sourceBlockId: 'r2i-nested-grandchild',
        targetBlockId: 'r2i-nested-great',
      },
    ],
  });
}

export function pageSubtreeWrapSiblingsDocument() {
  return pageDocument({
    id: 'page-subtree-wrap-siblings',
    title: 'Page subtree wrap siblings',
    chapterTitle: 'Atomic wrap',
    blocks: [
      textBlock('r2i-sibling-root', 'Root', 'Root'),
      textBlock(
        'r2i-sibling-child',
        'Child with a branch',
        'A first child whose full subtree does not fit beside the root, even though its own card does fit in the right column.',
      ),
      textBlock(
        'r2i-sibling-grandchild',
        'Grandchild',
        'The grandchild belongs to the first child and must not split the direct-child group into a mixed right and below row.',
      ),
      textBlock('r2i-sibling-leaf', 'Sibling leaf', 'A second direct child that fits beside the root on its own.'),
    ],
    branches: [
      {
        id: 'branch-r2i-sibling-child',
        sourceBlockId: 'r2i-sibling-root',
        targetBlockId: 'r2i-sibling-child',
      },
      {
        id: 'branch-r2i-sibling-grandchild',
        sourceBlockId: 'r2i-sibling-child',
        targetBlockId: 'r2i-sibling-grandchild',
      },
      {
        id: 'branch-r2i-sibling-leaf',
        sourceBlockId: 'r2i-sibling-root',
        targetBlockId: 'r2i-sibling-leaf',
      },
    ],
  });
}

export function pageSubtreeWrapCalloutDocument() {
  const rootText = 'A root with an anchored callout below it.';
  const quote = 'anchored callout';
  const start = rootText.indexOf(quote);
  const root = {
    id: 'r2i-callout-root',
    label: 'Root',
    content: {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            ...(start > 0 ? [{ type: 'text', text: rootText.slice(0, start) }] : []),
            {
              type: 'text',
              text: quote,
              marks: [{ type: 'anchor', attrs: { anchorId: 'anchor-r2i-callout' } }],
            },
            ...(start + quote.length < rootText.length
              ? [{ type: 'text', text: rootText.slice(start + quote.length) }]
              : []),
          ],
        },
      ],
    },
  };
  return pageDocument({
    id: 'page-subtree-wrap-callout',
    title: 'Page subtree wrap callout',
    chapterTitle: 'Callout and wrap',
    blocks: [
      root,
      textBlock('r2i-callout-note', 'Callout', 'An anchored callout that stays below its parent.'),
      textBlock(
        'r2i-callout-child',
        'Child',
        'A first child whose full subtree does not fit beside the root, so the direct-child group wraps below the callout stack.',
      ),
      textBlock(
        'r2i-callout-grandchild',
        'Grandchild',
        'The grandchild stays beside its own parent after the atomic group wrap, never in the callout lane.',
      ),
    ],
    anchors: [
      {
        id: 'anchor-r2i-callout',
        blockId: 'r2i-callout-root',
        kind: 'text',
        selector: { kind: 'text', quote, prefix: 'with an ', suffix: ' below' },
        quote,
        prefix: 'with an ',
        suffix: ' below',
      },
    ],
    branches: [
      {
        id: 'branch-r2i-callout-note',
        sourceBlockId: 'r2i-callout-root',
        sourceAnchorId: 'anchor-r2i-callout',
        targetBlockId: 'r2i-callout-note',
        role: 'primary',
      },
      {
        id: 'branch-r2i-callout-child',
        sourceBlockId: 'r2i-callout-root',
        targetBlockId: 'r2i-callout-child',
        role: 'primary',
      },
      {
        id: 'branch-r2i-callout-grandchild',
        sourceBlockId: 'r2i-callout-child',
        targetBlockId: 'r2i-callout-grandchild',
        role: 'primary',
      },
    ],
  });
}

/** Long fixture that spans pages, producing continuation/ghost markers. */
export function longDocument() {
  const parent = textBlock('parent', 'Parent topic', 'A short parent that owns a long branch.');
  const child = longTextBlock('child', 'Long branch', 90);
  return pageDocument({
    id: 'portrait-long',
    title: 'Long study',
    chapterTitle: 'Long argument',
    blocks: [parent, child],
    branches: [
      { id: 'branch-parent-child', sourceBlockId: 'parent', targetBlockId: 'child' },
    ],
  });
}

/**
 * Many short top-level blocks: pages break between blocks because no block has
 * an internal safe break. Every derived page starts at a block boundary, which
 * makes page-start markers deterministic without canonical manual breaks.
 */
export function multiPageBlocksDocument(count = 36) {
  return pageDocument({
    id: 'multi-page-blocks',
    title: 'Continuous markers',
    chapterTitle: 'Derived pages',
    blocks: Array.from({ length: count }, (_, index) =>
      textBlock(
        `b${index + 1}`,
        `Block ${index + 1}`,
        'A short top-level block used to derive a page boundary between cards.',
      ),
    ),
  });
}

export function multiChapterDocument() {
  const document = pageDocument({
    id: 'multi-chapter-page',
    title: 'Two chapters',
    chapterTitle: 'Chapter 1',
    blocks: [textBlock('chapter-1-block', 'Chapter one block', 'First chapter body.')],
  });
  document.chapters.push({
    id: 'chapter-2',
    title: 'Chapter 2',
    topLevelBlockIds: ['chapter-2-block'],
  });
  document.blocks['chapter-2-block'] = {
    id: 'chapter-2-block',
    label: 'Chapter two block',
    content: { type: 'doc', children: [paragraph('Second chapter body.')] },
  };
  return document;
}

export function emptyDocument() {
  return pageDocument({
    id: 'empty-page',
    title: 'Empty page fixture',
    chapterTitle: 'Empty chapter',
    blocks: [],
  });
}

export function missingImageDocument() {
  return pageDocument({
    id: 'missing-image-page',
    title: 'Missing image page',
    chapterTitle: 'Images',
    blocks: [
      textBlock('intro', 'Intro', 'This page references an image whose asset is missing.'),
      imageBlock('missing-image', 'Lost figure', 'missing-asset-id', 'Lost diagram'),
    ],
  });
}

/**
 * R2c compaction fixture: a short parent, an anchored callout, three direct
 * children (one with its own child), and a reference target. The compact page
 * width fits the callout and all three children in the parent's row, so the
 * UI can assert row filling, recursion, arrows, and the Page Edit overlay.
 */
export function compactionDocument() {
  const rootText = 'An eigenvalue is a scalar.';
  const rootQuote = 'eigenvalue';
  const rootStart = rootText.indexOf(rootQuote);
  const root = {
    id: 'comp-root',
    label: 'Compaction root',
    content: {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            ...(rootStart > 0 ? [{ type: 'text', text: rootText.slice(0, rootStart) }] : []),
            {
              type: 'text',
              text: rootQuote,
              marks: [{ type: 'anchor', attrs: { anchorIds: ['anchor-comp-root'] } }],
            },
            ...(rootStart + rootQuote.length < rootText.length
              ? [{ type: 'text', text: rootText.slice(rootStart + rootQuote.length) }]
              : []),
          ],
        },
      ],
    },
  };
  return pageDocument({
    id: 'compaction-page',
    title: 'Compaction page',
    chapterTitle: 'Compaction',
    blocks: [
      root,
      textBlock('comp-callout', 'Root callout', 'A scalar multiple only stretches the vector.'),
      textBlock('comp-child', 'Direct child', 'A direct child with its own branch.'),
      textBlock('comp-leaf-2', 'Second leaf', 'Second leaf in the same row.'),
      textBlock('comp-leaf-3', 'Third leaf', 'Third leaf in the same row.'),
      textBlock('comp-grandchild', 'Grandchild', 'Grandchild in the child column.'),
      textBlock('comp-ref', 'Reference target', 'A labeled reference target.'),
    ],
    anchors: [
      {
        id: 'anchor-comp-root',
        blockId: 'comp-root',
        kind: 'text',
        selector: { kind: 'text', quote: rootQuote, prefix: 'An ', suffix: ' is' },
        quote: rootQuote,
        prefix: 'An ',
        suffix: ' is',
      },
    ],
    branches: [
      {
        id: 'branch-comp-callout',
        sourceBlockId: 'comp-root',
        sourceAnchorId: 'anchor-comp-root',
        targetBlockId: 'comp-callout',
        role: 'primary',
      },
      {
        id: 'branch-comp-child',
        sourceBlockId: 'comp-root',
        targetBlockId: 'comp-child',
        role: 'primary',
      },
      {
        id: 'branch-comp-leaf-2',
        sourceBlockId: 'comp-root',
        targetBlockId: 'comp-leaf-2',
        role: 'primary',
      },
      {
        id: 'branch-comp-leaf-3',
        sourceBlockId: 'comp-root',
        targetBlockId: 'comp-leaf-3',
        role: 'primary',
      },
      {
        id: 'branch-comp-grandchild',
        sourceBlockId: 'comp-child',
        targetBlockId: 'comp-grandchild',
        role: 'primary',
      },
      {
        id: 'branch-comp-reference',
        sourceBlockId: 'comp-root',
        targetBlockId: 'comp-ref',
        role: 'reference',
        label: 'also uses',
      },
    ],
  });
}
