import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Page-view document fixtures.
 *
 * UI/visual tests write a real package into the isolated library instead of
 * mutating a seeded document: page orientation is document-level v1 data and
 * there is no orientation command yet, so a fixture file is the honest path.
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
  orientation = 'landscape',
  chapterTitle = 'Chapter 1',
  blocks = [],
  branches = [],
}) {
  const chapterId = 'chapter-1';
  return {
    schemaVersion: 1,
    id,
    title,
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
    revision: 0,
    pageSetup: {
      size: 'A4',
      orientation,
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    },
    manualBreakBeforeBlockIds: [],
    chapters: [
      {
        id: chapterId,
        title: chapterTitle,
        topLevelBlockIds: blocks
          .filter((block) => !branches.some((branch) => branch.targetBlockId === block.id))
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
    anchors: {},
    branches: Object.fromEntries(
      branches.map((branch, index) => [
        branch.id,
        {
          id: branch.id,
          source: { blockId: branch.sourceBlockId },
          targetBlockId: branch.targetBlockId,
          role: 'primary',
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

/** Portrait fixture long enough for continuation/ghost markers. */
export function portraitLongDocument() {
  const parent = textBlock('parent', 'Parent topic', 'A short parent that owns a long branch.');
  const child = longTextBlock('child', 'Long branch', 90);
  return pageDocument({
    id: 'portrait-long',
    title: 'Portrait long study',
    orientation: 'portrait',
    chapterTitle: 'Long argument',
    blocks: [parent, child],
    branches: [
      { id: 'branch-parent-child', sourceBlockId: 'parent', targetBlockId: 'child' },
    ],
  });
}

export function multiChapterDocument() {
  const document = pageDocument({
    id: 'multi-chapter-page',
    title: 'Two chapters',
    orientation: 'portrait',
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
    orientation: 'portrait',
    chapterTitle: 'Empty chapter',
    blocks: [],
  });
}

export function missingImageDocument() {
  return pageDocument({
    id: 'missing-image-page',
    title: 'Missing image page',
    orientation: 'landscape',
    chapterTitle: 'Images',
    blocks: [
      textBlock('intro', 'Intro', 'This page references an image whose asset is missing.'),
      imageBlock('missing-image', 'Lost figure', 'missing-asset-id', 'Lost diagram'),
    ],
  });
}
