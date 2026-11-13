/**
 * Inline-only table cells (special-text editing, area D).
 *
 * The editor table cell holds exactly one paragraph of inline content: text,
 * marks, inline math and hard breaks. Legacy documents may still contain rich
 * cells (several paragraphs, lists, code). On load the editor projects them
 * into the inline-only shape with a pure function: paragraphs and block lines
 * are joined with hard breaks, list items become one line each. The canonical
 * document is not migrated and the document schema version does not change:
 * the first edit of that table simply stores the normalized cell.
 */

import type { ContentNode } from '@noteforest/core';

function inlineChildren(node: ContentNode): ContentNode[] {
  return [...(node.children ?? [])];
}

/** One block as zero or more inline lines (no separator nodes). */
function blockLines(node: ContentNode): ContentNode[][] {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return [inlineChildren(node)];
    case 'blockquote':
    case 'listItem':
      return (node.children ?? []).flatMap((child) => blockLines(child));
    case 'bulletList':
    case 'orderedList':
      return (node.children ?? []).flatMap((item) => blockLines(item));
    case 'codeBlock': {
      const direct = typeof node.text === 'string' ? node.text : '';
      const nested = (node.children ?? [])
        .map((child) => (typeof child.text === 'string' ? child.text : ''))
        .join('');
      const text = direct.length > 0 ? direct : nested;
      return [text.length > 0 ? [{ type: 'text', text }] : []];
    }
    case 'mathBlock': {
      const latex = node.attrs?.['latex'];
      return [typeof latex === 'string' && latex.length > 0
        ? [{ type: 'inlineMath', attrs: { latex } }]
        : []];
    }
    case 'inlineMath':
    case 'text':
    case 'hardBreak':
      return [[node]];
    default:
      // Images, tables and rules have no inline projection. Their children are
      // flattened as a best-effort source instead of dropping text silently.
      return (node.children ?? []).flatMap((child) => blockLines(child));
  }
}

/**
 * Flatten every block of a rich cell into one inline line per block. A cell
 * that already has one paragraph is returned unchanged (same array reference),
 * so an untouched table never rewrites its canonical content.
 */
export function normalizeTableCellChildren(
  children: readonly ContentNode[] | undefined,
): ContentNode[] {
  const source = children === undefined ? [] : [...children];
  if (source.length === 1 && source[0]?.type === 'paragraph') return children as ContentNode[];
  const lines = source.flatMap((node) => blockLines(node));
  const inline: ContentNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) inline.push({ type: 'hardBreak' });
    inline.push(...line);
  });
  return [{ type: 'paragraph', ...(inline.length === 0 ? {} : { children: inline }) }];
}

/** True when a cell is already exactly one paragraph. */
export function isInlineOnlyCell(children: readonly ContentNode[] | undefined): boolean {
  return children !== undefined && children.length === 1 && children[0]?.type === 'paragraph';
}
