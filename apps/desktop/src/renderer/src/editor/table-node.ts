/**
 * Build ProseMirror table nodes from parsed GFM data (area D).
 *
 * The header row is `tableHeader` cells; every cell holds exactly one
 * paragraph of inline content. `<br>` / newline cell values become hard breaks.
 */

import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import type { GfmTableAlign, GfmTableData } from '../lib/gfm-table';

function cellContent(schema: Schema, value: string): PMNode[] {
  const hardBreak = schema.nodes['hardBreak'];
  const result: PMNode[] = [];
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, index) => {
    if (index > 0 && hardBreak !== undefined) result.push(hardBreak.create());
    if (line.length > 0) result.push(schema.text(line));
  });
  return result;
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
