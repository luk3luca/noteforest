/**
 * GFM table parsing and serialization (special-text editing, area D).
 *
 * One small parser is shared by typed conversion (a blank paragraph or
 * `Mod-Enter`), GFM paste conversion, and the read-only source popover. The
 * serializer is the "Copy as Markdown" output: escaped pipes, `<br>` hard
 * breaks and the alignment row.
 *
 * Scope is deliberately narrow: a header row, a delimiter row, at least one
 * data row, and the same number of cells in every row. Merged cells, captions,
 * headerless tables and a general Markdown parser are out of scope.
 */

export type GfmTableAlign = 'left' | 'center' | 'right';

export interface GfmTableData {
  header: string[];
  align: Array<GfmTableAlign | null>;
  rows: string[][];
}

/** Structural JSON shape shared by the editor and the canonical content. */
export interface TableContentNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TableContentNode[];
  /** Canonical (`children`) spelling; accepted by the serializer too. */
  children?: TableContentNode[];
  text?: string;
}

function childNodes(node: TableContentNode): TableContentNode[] {
  return node.content ?? node.children ?? [];
}

const DELIMITER_CELL = /^:?-+:?$/;

/**
 * Split one GFM row on unescaped pipes. A leading/trailing pipe is optional;
 * `\|` is an escaped pipe and `\\` an escaped backslash. Backtick code spans
 * are treated as plain text: the serializer escapes every pipe, so its own
 * output round-trips.
 */
export function splitGfmRow(line: string): string[] {
  let source = line.trim();
  if (source.startsWith('|')) source = source.slice(1);
  if (source.endsWith('|') && !source.endsWith('\\|')) source = source.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';
    const next = source[index + 1] ?? '';
    if (character === '\\' && next === '|') {
      cell += '|';
      index += 1;
      continue;
    }
    if (character === '\\' && next === '\\') {
      cell += '\\';
      index += 1;
      continue;
    }
    if (character === '|') {
      cells.push(normalizeCell(cell));
      cell = '';
      continue;
    }
    cell += character;
  }
  cells.push(normalizeCell(cell));
  return cells;
}

/** Trim, unescape `\\|` remains, and map `<br>` back to a hard break. */
function normalizeCell(value: string): string {
  return value.trim().replace(/<br\s*\/?>/gi, '\n');
}

function alignOfCell(cell: string): GfmTableAlign | null {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return null;
}

function hasPipe(line: string): boolean {
  return line.includes('|');
}

function isDelimiterRow(cells: readonly string[]): boolean {
  if (cells.length === 0) return false;
  return cells.every((cell) => DELIMITER_CELL.test(cell.replace(/\s/g, '')));
}

/**
 * Parse a GFM table. Returns null for anything that is not a complete table:
 * a missing delimiter, an inconsistent column count, a missing data row.
 */
export function parseGfmTableLines(lines: readonly string[]): GfmTableData | null {
  const source = [...lines];
  while (source.length > 0 && (source[source.length - 1] ?? '').trim().length === 0) {
    source.pop();
  }
  while (source.length > 0 && (source[0] ?? '').trim().length === 0) {
    source.shift();
  }
  if (source.length < 3) return null;
  const headerLine = source[0] ?? '';
  const delimiterLine = source[1] ?? '';
  if (!hasPipe(headerLine) || !hasPipe(delimiterLine)) return null;
  const header = splitGfmRow(headerLine);
  const delimiter = splitGfmRow(delimiterLine);
  if (header.length === 0 || header.length !== delimiter.length) return null;
  if (!isDelimiterRow(delimiter)) return null;
  const align = delimiter.map(alignOfCell);
  const rows: string[][] = [];
  for (const line of source.slice(2)) {
    if (line.trim().length === 0) return null;
    if (!hasPipe(line)) return null;
    const cells = splitGfmRow(line);
    if (cells.length !== header.length) return null;
    rows.push(cells);
  }
  if (rows.length === 0) return null;
  return { header, align, rows };
}

/** Parse a plain-text clipboard payload or a typed paragraph run. */
export function parseGfmTable(text: string): GfmTableData | null {
  return parseGfmTableLines(text.replace(/\r\n?/g, '\n').split('\n'));
}

/** Escape one cell for GFM: pipes are escaped, hard breaks become `<br>`. */
export function escapeGfmCell(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>').replace(/\|/g, '\\|');
}

/** The delimiter row for a set of alignments. */
export function gfmAlignmentRow(align: ReadonlyArray<GfmTableAlign | null>): string {
  const cells = align.map((entry) => {
    if (entry === 'left') return ':---';
    if (entry === 'center') return ':---:';
    if (entry === 'right') return '---:';
    return '---';
  });
  return `| ${cells.join(' | ')} |`;
}

function serializeRow(cells: readonly string[]): string {
  return `| ${cells.map((cell) => escapeGfmCell(cell ?? '')).join(' | ')} |`;
}

/** Serialize table data to GFM (header, alignment row, body rows). */
export function serializeGfmTable(data: GfmTableData): string {
  const align =
    data.align.length === data.header.length
      ? data.align
      : data.header.map(() => null);
  const lines = [serializeRow(data.header), gfmAlignmentRow(align)];
  for (const row of data.rows) lines.push(serializeRow(row));
  return lines.join('\n');
}

function inlineText(node: TableContentNode): string {
  if (typeof node.text === 'string') return node.text;
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'inlineMath' || node.type === 'blockMath') {
    const latex = node.attrs?.['latex'];
    return typeof latex === 'string' ? `$${latex}$` : '';
  }
  return childNodes(node).map(inlineText).join('');
}

/** Concatenate a cell's blocks into one GFM cell value. */
export function tableCellText(cell: TableContentNode): string {
  const blocks = childNodes(cell);
  return blocks
    .map((block) =>
      block.type === 'paragraph' || block.type === 'heading'
        ? childNodes(block).map(inlineText).join('')
        : inlineText(block),
    )
    .join('\n');
}

function cellAlign(cell: TableContentNode | undefined): GfmTableAlign | null {
  const value = cell?.attrs?.['align'];
  return value === 'left' || value === 'center' || value === 'right' ? value : null;
}

/** Serialize an editor/canonical table node. Returns null for a non-table. */
export function gfmFromTableNode(table: TableContentNode): string | null {
  if (table.type !== 'table') return null;
  const rows = childNodes(table).filter((row) => row.type === 'tableRow');
  if (rows.length === 0) return null;
  const headerRow = rows[0];
  if (headerRow === undefined) return null;
  const headerCells = childNodes(headerRow);
  return serializeGfmTable({
    header: headerCells.map((cell) => tableCellText(cell)),
    align: headerCells.map(cellAlign),
    rows: rows.slice(1).map((row) => childNodes(row).map((cell) => tableCellText(cell))),
  });
}
