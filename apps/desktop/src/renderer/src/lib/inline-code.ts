/**
 * Inline code range detection for the live-preview delimiters.
 *
 * The `code` mark stays canonical: no backtick is ever stored in the document.
 * While the caret is inside one contiguous marked range, the editor renders a
 * widget backtick at each end; when the caret leaves, the widgets disappear and
 * the range renders as the normal chip. The range calculation is pure so it is
 * unit-tested without a DOM.
 */

import type { MarkType, Node as PMNode } from '@tiptap/pm/model';

export interface InlineCodeRange {
  /** ProseMirror position immediately before the first marked character. */
  from: number;
  /** ProseMirror position immediately after the last marked character. */
  to: number;
}

/**
 * The contiguous `code`-marked range that contains `caret`, inside one
 * textblock. `contentStart` is the position of the block's first character
 * (`$from.start()`).
 */
export function codeMarkRangeIn(
  parent: PMNode,
  contentStart: number,
  caret: number,
  code: MarkType,
): InlineCodeRange | null {
  if (!parent.isTextblock || parent.type.name === 'codeBlock') return null;
  const contentEnd = contentStart + parent.content.size;
  if (caret < contentStart || caret > contentEnd) return null;

  let found: InlineCodeRange | null = null;
  let rangeStart: number | null = null;
  let rangeEnd: number | null = null;

  const flush = (): void => {
    if (found === null && rangeStart !== null && rangeEnd !== null) {
      if (caret >= rangeStart && caret <= rangeEnd) found = { from: rangeStart, to: rangeEnd };
    }
    rangeStart = null;
    rangeEnd = null;
  };

  parent.forEach((child, offset) => {
    const from = contentStart + offset;
    if (child.isText && child.marks.some((mark) => mark.type === code)) {
      if (rangeStart === null) rangeStart = from;
      rangeEnd = from + child.nodeSize;
      return;
    }
    flush();
  });
  flush();
  return found;
}
