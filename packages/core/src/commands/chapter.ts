/**
 * Chapter aggregate: create, rename, reorder, delete.
 *
 * Chapters group top-level blocks; pages are never chapter containers.
 */

import type { CoreContext } from '../ids.js';
import { chapterIdForBlock } from '../structure.js';
import type { Chapter, Document } from '../types.js';
import {
  allIds,
  assertId,
  assertIndex,
  chapterOrFail,
  collectSubtree,
  freshId,
  reject,
  removeBlocks,
  type ChangeSet,
} from './shared.js';
import type {
  ChapterCreateCommand,
  ChapterDeleteCommand,
  ChapterRenameCommand,
  ChapterReorderCommand,
  DocumentCommand,
} from './types.js';

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function applyChapterCreate(
  document: Document,
  command: ChapterCreateCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  const chapterId = command.chapterId ?? freshId(document, context);
  assertId(chapterId, 'chapterId');
  if (allIds(document).has(chapterId)) {
    reject('duplicate-id', `ID "${chapterId}" already exists`);
  }
  if (command.title !== undefined && typeof command.title !== 'string') {
    reject('invalid-command', 'chapter title must be a string');
  }
  const index = command.atIndex ?? document.chapters.length;
  assertIndex(index, document.chapters.length, 'chapter index');
  const chapter: Chapter = { id: chapterId, topLevelBlockIds: [] };
  if (command.title !== undefined) chapter.title = command.title;
  document.chapters.splice(index, 0, chapter);
  changes.chapter(chapterId);
  changes.createdChapter(chapterId);
  return {
    type: 'chapter.delete',
    chapterId,
    blockHandling: { kind: 'reject-if-not-empty' },
  };
}

export function applyChapterRename(
  document: Document,
  command: ChapterRenameCommand,
  _context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  assertId(command.chapterId, 'chapterId');
  const chapter = chapterOrFail(document, command.chapterId);
  if (command.title !== null && typeof command.title !== 'string') {
    reject('invalid-command', 'chapter title must be a string or null');
  }
  const previous = chapter.title ?? null;
  if (command.title === null) delete chapter.title;
  else chapter.title = command.title;
  changes.chapter(chapter.id);
  return { type: 'chapter.rename', chapterId: chapter.id, title: previous };
}

export function applyChapterReorder(
  document: Document,
  command: ChapterReorderCommand,
  _context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  assertId(command.chapterId, 'chapterId');
  chapterOrFail(document, command.chapterId);
  assertIndex(command.toIndex, document.chapters.length - 1, 'chapter index');
  const fromIndex = document.chapters.findIndex((chapter) => chapter.id === command.chapterId);
  if (fromIndex < 0) reject('not-found', 'chapter does not exist');
  const [chapter] = document.chapters.splice(fromIndex, 1);
  if (chapter === undefined) reject('internal-invariant', 'chapter disappeared');
  document.chapters.splice(command.toIndex, 0, chapter);
  changes.chapter(chapter.id);
  return { type: 'chapter.reorder', chapterId: chapter.id, toIndex: fromIndex };
}

export function applyChapterDelete(
  document: Document,
  command: ChapterDeleteCommand,
  _context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  assertId(command.chapterId, 'chapterId');
  const chapter = chapterOrFail(document, command.chapterId);
  if (document.chapters.length <= 1) {
    reject('last-chapter', 'a document must keep at least one chapter');
  }
  const chapterIndex = document.chapters.indexOf(chapter);
  const handling = command.blockHandling;
  if (handling.kind === 'reject-if-not-empty') {
    if (chapter.topLevelBlockIds.length > 0) {
      reject('chapter-in-use', 'chapter still contains top-level blocks');
    }
    document.chapters.splice(chapterIndex, 1);
    changes.chapter(chapter.id);
    return {
      type: 'chapter.create',
      chapterId: chapter.id,
      ...(chapter.title === undefined ? {} : { title: chapter.title }),
      atIndex: chapterIndex,
    };
  }
  if (handling.kind === 'move-to-chapter') {
    assertId(handling.chapterId, 'chapterId');
    if (handling.chapterId === chapter.id) {
      reject('invalid-command', 'cannot move blocks into the chapter being deleted');
    }
    const target = chapterOrFail(document, handling.chapterId);
    target.topLevelBlockIds.push(...chapter.topLevelBlockIds);
    for (const blockId of chapter.topLevelBlockIds) changes.block(blockId);
    changes.chapter(target.id);
    document.chapters.splice(chapterIndex, 1);
    changes.chapter(chapter.id);
    return null;
  }
  for (const blockId of [...chapter.topLevelBlockIds]) {
    const subtree = collectSubtree(document, blockId);
    removeBlocks(document, subtree, changes);
  }
  document.chapters.splice(chapterIndex, 1);
  changes.chapter(chapter.id);
  return null;
}

export function chapterForBlock(document: Document, blockId: string): string | null {
  return chapterIdForBlock(document, blockId);
}
