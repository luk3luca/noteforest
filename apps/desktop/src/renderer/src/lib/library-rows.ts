/**
 * Library row presentation (S1 icon semantics).
 *
 * A row's *kind* — not its colour — is what tells a NoteForest note from a
 * Markdown guest file: the note glyph is `NotebookText`, the `.md` glyph is
 * `FileText`, and the file extension is rendered as a separate `text-3` suffix
 * after the title. Splitting the suffix out of the title is pure string work, so
 * it can be tested without a DOM.
 */

/**
 * Split a Markdown file name into its display title and extension suffix:
 * `diario.md` → `diario` + `.md`. The suffix keeps the file's original case and
 * is empty for a name without an extension. The full basename stays the row's
 * accessible label; only the visible title is split.
 */
export function markdownTitleSuffix(fileName: string): { base: string; suffix: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return { base: fileName, suffix: '' };
  return { base: fileName.slice(0, dot), suffix: fileName.slice(dot) };
}
