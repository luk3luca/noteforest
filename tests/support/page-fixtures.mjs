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
