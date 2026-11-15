/**
 * Markdown guest-file naming rules shared by core, the main process, and the
 * renderer. Pure: no filesystem, no DOM.
 *
 * A `.md` file is an ordinary external file, never a NoteForest document. The
 * extension list lives in core so the vault scan and the guest-file surface can
 * never disagree about what a Markdown file is.
 */

export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd'] as const;

export function markdownExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return null;
  return fileName.slice(dot + 1).toLowerCase();
}

export function isMarkdownFileName(fileName: string): boolean {
  const extension = markdownExtension(fileName);
  return extension !== null && (MARKDOWN_EXTENSIONS as readonly string[]).includes(extension);
}

/** Display title for a Markdown file: the full basename, extension included. */
export function markdownFileTitle(path: string): string {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}
