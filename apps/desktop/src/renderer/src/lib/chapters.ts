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
