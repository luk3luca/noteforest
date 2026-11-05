/**
 * Code-anchor geometry (M3c3a).
 *
 * A code anchor stores Unicode code-point offsets inside one `codeBlock`. This
 * module maps a resolved range to the live DOM text of the block's `<pre>` and
 * measures one rectangle per visual line. Nothing here mutates the editor,
 * stores coordinates, or changes the code text; the block view recreates the
 * highlight layer from the current DOM on every layout pass.
 */

export interface CodeTextNode {
  node: Text;
  /** UTF-16 offset in the collected code text. */
  start: number;
  /** UTF-16 offset in the collected code text, exclusive. */
  end: number;
}

export interface CollectedCodeText {
  text: string;
  nodes: CodeTextNode[];
}

export interface CodeRangeRects {
  /** One viewport rect per visible line fragment. */
  highlights: DOMRect[];
  /** First selected line, used for the gutter/line marker. */
  firstLine: DOMRect | null;
}

/** Convert a Unicode code-point offset to a UTF-16 offset. */
export function codePointToUtf16(text: string, offset: number): number {
  if (!Number.isFinite(offset) || offset <= 0) return 0;
  const points = Array.from(text);
  if (offset >= points.length) return text.length;
  return points.slice(0, Math.trunc(offset)).join('').length;
}

/** Collect the visible text nodes of a code block in DOM order. */
export function collectCodeText(root: ParentNode): CollectedCodeText {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: CodeTextNode[] = [];
  let text = '';
  let current = walker.nextNode();
  while (current !== null) {
    const textNode = current as Text;
    const value = textNode.nodeValue ?? '';
    nodes.push({ node: textNode, start: text.length, end: text.length + value.length });
    text += value;
    current = walker.nextNode();
  }
  return { text, nodes };
}

function textNodeAt(
  collected: CollectedCodeText,
  offset: number,
): { node: Text; offset: number } | null {
  for (const entry of collected.nodes) {
    if (offset >= entry.start && offset <= entry.end) {
      return { node: entry.node, offset: offset - entry.start };
    }
  }
  return null;
}

function rangeAt(
  collected: CollectedCodeText,
  utf16Start: number,
  utf16End: number,
): Range | null {
  const start = textNodeAt(collected, Math.max(0, utf16Start));
  const end = textNodeAt(collected, Math.min(collected.text.length, utf16End));
  if (start === null || end === null) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

/**
 * Measure a resolved code range. A selection spanning several lines produces
 * one rect per line; the first non-empty rect is the gutter marker target.
 */
export function codeRangeRects(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
): CodeRangeRects {
  const collected = collectCodeText(root);
  const utf16Start = codePointToUtf16(collected.text, startOffset);
  const utf16End = codePointToUtf16(collected.text, endOffset);
  const range = rangeAt(collected, utf16Start, utf16End);
  if (range === null) return { highlights: [], firstLine: null };
  const highlights = [...range.getClientRects()].filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  range.detach();
  if (highlights.length > 0) {
    return { highlights, firstLine: highlights[0] ?? null };
  }

  // An empty visual range (for example a selection that ends at a line break)
  // still gets a caret-sized marker on its first line.
  const caret = rangeAt(collected, utf16Start, utf16Start);
  if (caret === null) return { highlights: [], firstLine: null };
  const caretRect = caret.getClientRects()[0] ?? caret.getBoundingClientRect();
  caret.detach();
  return {
    highlights: [],
    firstLine: caretRect.height > 0 ? caretRect : null,
  };
}

export interface LineMarkerRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Place a gutter dot just left of the first selected line's text. */
export function codeLineMarkerRect(firstLine: DOMRect): LineMarkerRect {
  const size = 5;
  return {
    left: firstLine.left - size - 3,
    top: firstLine.top + firstLine.height / 2 - size / 2,
    width: size,
    height: size,
  };
}
