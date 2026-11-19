/**
 * Build ProseMirror table nodes from parsed GFM data (area D; v0.1.1).
 *
 * The header row is `tableHeader` cells; every cell holds exactly one
 * paragraph of inline content. The cell value is parsed by the shared inline
 * layer (`lib/gfm-inline.ts`), so bold/italic/strike/code, inline math and
 * hard breaks become real schema marks/nodes instead of literal delimiters.
 */

import type { Mark, Node as PMNode, Schema } from '@tiptap/pm/model';
import type { GfmTableAlign, GfmTableData } from '../lib/gfm-table';
import { parseGfmInline, type GfmInlineMark, type GfmInlineNode } from '../lib/gfm-inline';

function marksFor(schema: Schema, names: readonly GfmInlineMark[]): Mark[] {
  const marks: Mark[] = [];
  for (const name of names) {
    const type = schema.marks[name];
    if (type !== undefined) marks.push(type.create());
  }
  return marks;
}

function inlineNodes(schema: Schema, nodes: readonly GfmInlineNode[]): PMNode[] {
  const result: PMNode[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      if (node.text.length === 0) continue;
      result.push(schema.text(node.text, marksFor(schema, node.marks)));
      continue;
    }
    if (node.type === 'hardBreak') {
      const hardBreak = schema.nodes['hardBreak'];
      if (hardBreak !== undefined) result.push(hardBreak.create());
      continue;
    }
    const inlineMath = schema.nodes['inlineMath'];
    if (inlineMath !== undefined) {
      result.push(inlineMath.create({ latex: node.latex }));
    } else if (node.latex.length > 0) {
      // A schema without the math node keeps the source as text instead of
      // dropping it; the editor and the flat guest schema both have it.
      result.push(schema.text(`$${node.latex}$`));
    }
  }
  return result;
}

function cellContent(schema: Schema, value: string): PMNode[] {
  return inlineNodes(schema, parseGfmInline(value));
}

function cellNode(
  schema: Schema,
  type: 'tableCell' | 'tableHeader',
  value: string,
  align: GfmTableAlign | null,
): PMNode | null {
  const nodeType = schema.nodes[type];
  const paragraph = schema.nodes['paragraph'];
  if (nodeType === undefined || paragraph === undefined) return null;
  const content = cellContent(schema, value);
  return nodeType.create(
    align === null ? null : { align },
    paragraph.create(null, content.length === 0 ? null : content),
  );
}

/** Convert parsed GFM data into a table node, or null when the schema lacks it. */
export function tableNodeFromGfm(schema: Schema, data: GfmTableData): PMNode | null {
  const tableType = schema.nodes['table'];
  const rowType = schema.nodes['tableRow'];
  if (tableType === undefined || rowType === undefined) return null;
  const headerCells: PMNode[] = [];
  const align = data.header.map((_, index) => data.align[index] ?? null);
  for (const [index, value] of data.header.entries()) {
    const cell = cellNode(schema, 'tableHeader', value, align[index] ?? null);
    if (cell === null) return null;
    headerCells.push(cell);
  }
  const rows: PMNode[] = [rowType.create(null, headerCells)];
  for (const row of data.rows) {
    const cells: PMNode[] = [];
    for (const [index, value] of row.entries()) {
      const cell = cellNode(schema, 'tableCell', value, align[index] ?? null);
      if (cell === null) return null;
      cells.push(cell);
    }
    rows.push(rowType.create(null, cells));
  }
  return tableType.create(null, rows);
}
