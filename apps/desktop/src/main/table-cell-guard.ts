/**
 * The table-cell load guard (VH1, part B).
 *
 * The editor's table cells hold exactly one paragraph of inline content: text,
 * marks, inline math and hard breaks (`editor/tables.ts`). A canonical document
 * may still contain a cell with block content — several paragraphs, a list, a
 * code block, a nested table, an image, a rule — written by a hand-copied file,
 * an old backup, or a future build. The app never shipped such a file, so there
 * is no population to migrate, and flattening the cell would silently destroy
 * content and orphan any anchor inside it.
 *
 * Decision (17 November 2026, `docs/tasks/table-cell-guard.md`): **refuse
 * loudly**. The detection is pure and read-only; the caller (`library.ts`)
 * turns a refusal into the existing unreadable/recovery state *before* the
 * package is opened, so the store never acquires a writable path and
 * `document.json` stays byte-identical. The raw sentence belongs under
 * `Details`; no row ever reads it verbatim.
 */

import type { ContentNode, Document } from '@noteforest/core';

/** One cell the inline-only editor cannot represent. */
export interface TableCellRefusal {
  /** The block that owns the table. */
  blockId: string;
  /** Dotted path to the offending cell inside the block content. */
  path: string;
  /** The raw explanation, shown under `Details`. */
  message: string;
}

const CELL_TYPES = new Set(['tableCell', 'tableHeader']);

function isParagraphOnly(children: readonly ContentNode[] | undefined): boolean {
  return children !== undefined && children.length === 1 && children[0]?.type === 'paragraph';
}

/** `holds 2 blocks (paragraph, bulletList)`; one kind per distinct type. */
function describeCell(children: readonly ContentNode[] | undefined): string {
  const list = children === undefined ? [] : [...children];
  if (list.length === 0) return 'has no content';
  if (list.length > 1) {
    const kinds = [...new Set(list.map((child) => child.type))];
    return `holds ${list.length} blocks (${kinds.join(', ')})`;
  }
  return `holds one ${list[0]?.type ?? 'block'} block`;
}

function walk(
  node: ContentNode,
  path: string,
  blockId: string,
  found: TableCellRefusal[],
): void {
  if (CELL_TYPES.has(node.type)) {
    if (!isParagraphOnly(node.children)) {
      const detail = describeCell(node.children);
      found.push({
        blockId,
        path,
        message: `${path}: table cell ${detail}; a table cell holds one paragraph of inline content`,
      });
      return;
    }
  }
  const children = node.children;
  if (!Array.isArray(children)) return;
  children.forEach((child, index) => {
    walk(child, `${path}.children.${index}`, blockId, found);
  });
}

/**
 * Every cell the editor cannot represent, in document order. An empty result
 * means the document opens as before; the caller refuses on the first entry.
 */
export function unrepresentableTableCells(document: Document): TableCellRefusal[] {
  const found: TableCellRefusal[] = [];
  for (const [blockId, block] of Object.entries(document.blocks)) {
    const content = block.content;
    if (content === undefined || content === null) continue;
    walk(content, `blocks.${blockId}.content`, blockId, found);
  }
  return found;
}

/** True when a document needs the guard at all (cheap text gate for the loader). */
export function mentionsTableCells(text: string): boolean {
  return text.includes('tableCell') || text.includes('tableHeader');
}
