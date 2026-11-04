/** Chapter placement rules shared by the UI and its unit tests. */

export interface ChapterRef {
  id: string;
}

/**
 * "+ Add chapter" inserts immediately after the active chapter (the chapter of
 * the selected block). Without a selection it appends after the last chapter.
 * An unknown/stale chapter id also appends rather than rejecting the command.
 */
export function chapterInsertIndex(
  chapters: readonly ChapterRef[],
  activeChapterId: string | null,
): number {
  if (activeChapterId === null) return chapters.length;
  const index = chapters.findIndex((chapter) => chapter.id === activeChapterId);
  return index < 0 ? chapters.length : index + 1;
}

export interface ChapterCanvasRef extends ChapterRef {
  title?: string;
}

/**
 * Whether the editor canvas must render chapters instead of the pristine
 * empty-document call to action. A new document has one untitled empty
 * chapter; a legacy document may have named or multiple empty chapters that
 * must stay visible so they can receive a top-level block.
 */
export function showsChapterCanvas(
  chapters: readonly ChapterCanvasRef[],
  blockCount: number,
): boolean {
  if (blockCount > 0) return true;
  if (chapters.length > 1) return true;
  return chapters.some((chapter) => (chapter.title?.trim().length ?? 0) > 0);
}
