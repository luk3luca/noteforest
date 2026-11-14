/**
 * Markdown guest-file serializer: flat ProseMirror JSON -> normalized Markdown.
 *
 * `prosemirror-markdown` (the approved MIT dependency) owns the writer state,
 * escaping, mark nesting, and list indentation. The output is normalized
 * Markdown for the declared subset, not byte-identical to the source: no
 * round-trip with another editor is promised.
 */

import { MarkdownSerializer, MarkdownSerializerState } from 'prosemirror-markdown';
import type { Node as PMNode } from '@tiptap/pm/model';
import { flatMarkdownSchema } from './flat-schema';
import type { MarkdownDocumentJson } from './markdown-parse';

function codeMarkBoundary(node: PMNode, side: 1 | -1): string {
  let ticks = 0;
  const text = node.isText ? node.text ?? '' : '';
  for (const match of text.matchAll(/`+/g)) {
    ticks = Math.max(ticks, match[0].length);
  }
  let result = ticks > 0 && side > 0 ? ' `' : '`';
  for (let index = 0; index < ticks; index += 1) result += '`';
  return side < 0 && ticks > 0 ? `${result} ` : result;
}

function escapeImageText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/\[/g, '\\[');
}

function escapeImageUrl(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/ /g, '%20');
}

function fenceFor(content: string): string {
  let ticks = 0;
  for (const match of content.matchAll(/`+/g)) {
    ticks = Math.max(ticks, match[0].length);
  }
  return '`'.repeat(Math.max(3, ticks + 1));
}

function alignmentMark(align: unknown): string {
  if (align === 'left') return ':---';
  if (align === 'center') return ':---:';
  if (align === 'right') return '---:';
  return '---';
}

function cellMarkdown(cell: PMNode): string {
  const paragraph = cell.firstChild;
  if (paragraph === null) return '';
  // `MarkdownSerializerState` accepts the node/mark maps at runtime (the same
  // state the serializer builds), but its published constructor type omits
  // them. A local constructor type keeps the call checked.
  const StateWithMaps = MarkdownSerializerState as unknown as new (
    nodeSerializers: ConstructorParameters<typeof MarkdownSerializer>[0],
    markSerializers: ConstructorParameters<typeof MarkdownSerializer>[1],
    options: Record<string, unknown>,
  ) => MarkdownSerializerState;
  const state = new StateWithMaps(nodes, marks, {});
  state.renderInline(paragraph, true);
  const out = (state as unknown as { out: string }).out ?? '';
  return out
    .replace(/\s*\n+\s*/g, '<br>')
    .replace(/\|/g, '\\|')
    .trim();
}

const nodes: ConstructorParameters<typeof MarkdownSerializer>[0] = {
  doc(state, node) {
    state.renderContent(node);
  },
  text(state, node) {
    state.text(node.text ?? '');
  },
  frontmatter(state, node) {
    // Byte-identical `---…---` prefix. It owns its own trailing newline; no
    // `closeBlock`, so the normalized body follows immediately.
    const raw = typeof node.attrs['raw'] === 'string' ? node.attrs['raw'] : '';
    state.write(raw);
    if (raw.length > 0 && !raw.endsWith('\n')) state.write('\n');
  },
  paragraph(state, node) {
    state.renderInline(node);
    state.closeBlock(node);
  },
  heading(state, node) {
    const level = Number(node.attrs['level'] ?? 1);
    state.write(`${'#'.repeat(Math.min(6, Math.max(1, level)))} `);
    state.renderInline(node);
    state.closeBlock(node);
  },
  blockquote(state, node) {
    state.wrapBlock('> ', null, node, () => state.renderContent(node));
  },
  bulletList(state, node) {
    state.renderList(node, '  ', () => '* ');
  },
  orderedList(state, node) {
    const start = Number(node.attrs['start'] ?? 1);
    const width = String(start + Math.max(0, node.childCount - 1)).length;
    state.renderList(node, state.repeat(' ', width + 2), (index) =>
      `${String(start + index).padStart(width, ' ')}. `,
    );
  },
  listItem(state, node) {
    state.renderContent(node);
  },
  codeBlock(state, node) {
    const rawLanguage = typeof node.attrs['language'] === 'string' ? node.attrs['language'].trim() : '';
    const language = (rawLanguage.split(/\s+/)[0] ?? '').replace(/`/g, '');
    const content = node.textContent;
    const fence = fenceFor(content);
    state.write(`${fence}${language}\n`);
    state.text(content, false);
    if (content.length > 0 && !content.endsWith('\n')) state.write('\n');
    state.write(fence);
    state.closeBlock(node);
  },
  horizontalRule(state, node) {
    state.write('---');
    state.closeBlock(node);
  },
  hardBreak(state) {
    state.write('\\\n');
  },
  image(state, node) {
    const alt = typeof node.attrs['alt'] === 'string' ? node.attrs['alt'] : '';
    const src = typeof node.attrs['src'] === 'string' ? node.attrs['src'] : '';
    const title = typeof node.attrs['title'] === 'string' ? node.attrs['title'] : '';
    state.write(
      `![${escapeImageText(alt)}](${escapeImageUrl(src)}${title.length > 0 ? ` "${title.replace(/"/g, '\\"')}"` : ''})`,
    );
  },
  inlineMath(state, node) {
    const latex = typeof node.attrs['latex'] === 'string' ? node.attrs['latex'] : '';
    state.write(`$${latex}$`);
  },
  blockMath(state, node) {
    const latex = typeof node.attrs['latex'] === 'string' ? node.attrs['latex'] : '';
    state.write('$$');
    state.ensureNewLine();
    state.text(latex, false);
    state.ensureNewLine();
    state.write('$$');
    state.closeBlock(node);
  },
  table(state, node) {
    const rows: PMNode[] = [];
    for (let index = 0; index < node.childCount; index += 1) rows.push(node.child(index));
    const header = rows[0];
    if (header === undefined) return;
    const columns = header.childCount;
    if (columns === 0) return;
    const alignments: string[] = [];
    for (let index = 0; index < columns; index += 1) {
      alignments.push(alignmentMark(header.child(index).attrs['align']));
    }
    const writeRow = (row: PMNode): void => {
      const cells: string[] = [];
      for (let index = 0; index < columns; index += 1) {
        const cell = index < row.childCount ? row.child(index) : null;
        cells.push(cell === null ? '' : cellMarkdown(cell));
      }
      state.write(`| ${cells.join(' | ')} |\n`);
    };
    writeRow(header);
    state.write(`| ${alignments.join(' | ')} |\n`);
    for (const row of rows.slice(1)) writeRow(row);
    state.closeBlock(node);
  },
};

const marks: ConstructorParameters<typeof MarkdownSerializer>[1] = {
  bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
  italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
  strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  code: {
    open: (_state, _mark, parent, index) =>
      codeMarkBoundary(parent.child(index), -1),
    close: (_state, _mark, parent, index) =>
      codeMarkBoundary(parent.child(index - 1), 1),
    escape: false,
  },
  link: {
    open: () => '[',
    close: (_state, mark) => `](${escapeImageUrl(String(mark.attrs['href'] ?? ''))})`,
    mixable: false,
  },
  // Markdown has no underline; the text survives, the formatting normalizes.
  underline: { open: '', close: '', mixable: true },
};

const serializer = new MarkdownSerializer(nodes, marks, {
  strict: false,
  hardBreakNodeName: 'hardBreak',
});

/** Serialize a flat document to normalized Markdown with one final newline. */
export function serializeMarkdown(document: MarkdownDocumentJson): string {
  const node = flatMarkdownSchema().nodeFromJSON(document);
  const output = serializer.serialize(node, { tightLists: true });
  const first = node.firstChild;
  if (first !== null && first.type.name === 'frontmatter') {
    // The prefix is preserved byte-for-byte; only the body is normalized.
    const raw = typeof first.attrs['raw'] === 'string' ? first.attrs['raw'] : '';
    const body = output.startsWith(raw) ? output.slice(raw.length) : output;
    const normalizedBody = body.replace(/[ \t]+\n/g, '\n').trimEnd();
    return normalizedBody.length === 0 ? raw : `${raw}${normalizedBody}\n`;
  }
  const normalized = output.replace(/[ \t]+\n/g, '\n').trimEnd();
  return normalized.length === 0 ? '' : `${normalized}\n`;
}
