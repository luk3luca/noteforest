/**
 * Markdown guest-file parser: Markdown -> flat ProseMirror JSON.
 *
 * `markdown-it` (the approved MIT dependency) tokenizes the declared GFM
 * subset; this module maps those tokens onto the flat editor schema. Raw HTML,
 * frontmatter, footnotes, and MDX are plain text or a labelled code block and
 * are never executed. Unknown inline syntax is preserved as text, never
 * silently dropped.
 *
 * This is a view adapter: it creates no NoteForest `Document`, id, revision, or
 * forest structure. The output is validated against the flat schema; if a
 * construct cannot be represented, the whole source is kept as one text
 * paragraph instead of losing content.
 */

import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { flatMarkdownSchema } from './flat-schema';
import { splitFrontmatter } from './frontmatter';

export interface MarkdownMarkJson {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface MarkdownNodeJson {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: MarkdownMarkJson[];
  content?: MarkdownNodeJson[];
  text?: string;
}

export interface MarkdownDocumentJson {
  type: 'doc';
  content: MarkdownNodeJson[];
}

interface ActiveMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface InlineFrame {
  mark: ActiveMark | null;
}

const tokenizer = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: false,
});

const EXTERNAL_LINK = /^(?:https?|mailto):/i;

function paragraph(content: MarkdownNodeJson[] = []): MarkdownNodeJson {
  return content.length === 0
    ? { type: 'paragraph' }
    : { type: 'paragraph', content };
}

function emptyDocument(): MarkdownDocumentJson {
  return { type: 'doc', content: [paragraph()] };
}

function marksFor(frames: readonly InlineFrame[]): MarkdownMarkJson[] {
  const marks: MarkdownMarkJson[] = [];
  for (const frame of frames) {
    if (frame.mark === null) continue;
    if (marks.some((mark) => mark.type === frame.mark?.type)) continue;
    marks.push(
      frame.mark.attrs === undefined
        ? { type: frame.mark.type }
        : { type: frame.mark.type, attrs: frame.mark.attrs },
    );
  }
  return marks;
}

function sameMarks(
  left: readonly MarkdownMarkJson[] | undefined,
  right: readonly MarkdownMarkJson[],
): boolean {
  if (left === undefined || left.length !== right.length) return false;
  return left.every(
    (mark, index) =>
      mark.type === right[index]?.type &&
      JSON.stringify(mark.attrs ?? {}) === JSON.stringify(right[index]?.attrs ?? {}),
  );
}

function textNode(text: string, marks: MarkdownMarkJson[]): MarkdownNodeJson {
  return marks.length === 0
    ? { type: 'text', text }
    : { type: 'text', text, marks };
}

function pushText(nodes: MarkdownNodeJson[], value: string, marks: MarkdownMarkJson[]): void {
  if (value.length === 0) return;
  const previous = nodes.at(-1);
  if (previous !== undefined && previous.type === 'text' && sameMarks(previous.marks, marks)) {
    previous.text = (previous.text ?? '') + value;
    return;
  }
  nodes.push(textNode(value, marks));
}

/**
 * Split one text run into plain segments and `$…$` inline math.
 *
 * Guards: the content must be non-empty, must not start or end with
 * whitespace, must not contain a dollar, and `$$` is never an inline formula
 * (block math is recognized at the paragraph level).
 */
export function splitInlineMath(value: string): Array<string | { latex: string }> {
  const result: Array<string | { latex: string }> = [];
  let cursor = 0;
  let plainStart = 0;
  while (cursor < value.length) {
    if (
      value[cursor] !== '$' ||
      value[cursor + 1] === '$' ||
      (cursor > 0 && value[cursor - 1] === '$')
    ) {
      cursor += 1;
      continue;
    }
    const open = cursor;
    let close = open + 1;
    while (close < value.length && value[close] !== '$') close += 1;
    if (close >= value.length) break;
    const latex = value.slice(open + 1, close);
    if (
      latex.length === 0 ||
      latex.includes('$') ||
      latex.includes('\n') ||
      latex.startsWith(' ') ||
      latex.endsWith(' ') ||
      latex.startsWith('\t') ||
      latex.endsWith('\t')
    ) {
      cursor = open + 1;
      continue;
    }
    if (open > plainStart) result.push(value.slice(plainStart, open));
    result.push({ latex });
    cursor = close + 1;
    plainStart = cursor;
  }
  if (plainStart < value.length) result.push(value.slice(plainStart));
  return result;
}

function pushTextWithMath(
  nodes: MarkdownNodeJson[],
  value: string,
  marks: MarkdownMarkJson[],
): void {
  if (marks.some((mark) => mark.type === 'code')) {
    pushText(nodes, value, marks);
    return;
  }
  for (const segment of splitInlineMath(value)) {
    if (typeof segment === 'string') {
      pushText(nodes, segment, marks);
    } else {
      nodes.push({
        type: 'inlineMath',
        attrs: { latex: segment.latex },
        ...(marks.length === 0 ? {} : { marks }),
      });
    }
  }
}

/** Inline token stream -> paragraph inline nodes. */
export function inlineNodes(token: Token): MarkdownNodeJson[] {
  const nodes: MarkdownNodeJson[] = [];
  const frames: InlineFrame[] = [];
  const marks = (): MarkdownMarkJson[] => marksFor(frames);

  for (const child of token.children ?? []) {
    switch (child.type) {
      case 'text':
        pushTextWithMath(nodes, child.content, marks());
        break;
      case 'softbreak':
        // A source line break inside a paragraph is a soft break. Keep it as a
        // newline in the text (rendered as a space); the serializer writes it
        // back as a soft break.
        pushText(nodes, '\n', marks());
        break;
      case 'hardbreak':
        nodes.push({ type: 'hardBreak', ...(marks().length === 0 ? {} : { marks: marks() }) });
        break;
      case 'code_inline':
        pushText(nodes, child.content, [...marks(), { type: 'code' }]);
        break;
      case 'strong_open':
        frames.push({ mark: { type: 'bold' } });
        break;
      case 'em_open':
        frames.push({ mark: { type: 'italic' } });
        break;
      case 's_open':
        frames.push({ mark: { type: 'strike' } });
        break;
      case 'link_open': {
        const href = child.attrGet('href') ?? '';
        // External links render; internal links (`#…`, relative paths) are
        // text, per the approved Markdown design.
        frames.push({
          mark: EXTERNAL_LINK.test(href)
            ? {
                type: 'link',
                attrs: { href, target: '_blank', rel: 'noopener noreferrer' },
              }
            : null,
        });
        break;
      }
      case 'strong_close':
      case 'em_close':
      case 's_close':
      case 'link_close':
        frames.pop();
        break;
      case 'image': {
        const src = child.attrGet('src') ?? '';
        const title = child.attrGet('title') ?? null;
        nodes.push({
          type: 'image',
          attrs: { src, alt: child.content, title },
          ...(marks().length === 0 ? {} : { marks: marks() }),
        });
        break;
      }
      case 'html_inline':
        pushText(nodes, child.content, marks());
        break;
      default:
        // Footnotes, MDX-ish inline text, and unknown syntax stay visible.
        if (child.content.length > 0) pushText(nodes, child.content, marks());
        break;
    }
  }
  return nodes;
}

function blockMathLatex(inline: Token): string | null {
  if (!/\$\$/.test(inline.content)) return null;
  const children = inline.children ?? [];
  if (
    children.length === 0 ||
    children.some(
      (child) => child.type !== 'text' && child.type !== 'softbreak' && child.type !== 'hardbreak',
    )
  ) {
    return null;
  }
  const match = /^\$\$([\s\S]+?)\$\$$/.exec(inline.content.trim());
  if (match === null) return null;
  const latex = (match[1] ?? '').trim();
  return latex.length === 0 ? null : latex;
}

function tableCellAlign(token: Token): string | null {
  const align = token.attrGet('align');
  if (align === 'left' || align === 'center' || align === 'right') return align;
  const style = token.attrGet('style') ?? '';
  const match = /text-align:\s*(left|center|right)/i.exec(style);
  return match?.[1]?.toLowerCase() ?? null;
}

interface TableRowDraft {
  header: boolean;
  cells: Array<{ inline: Token | null; align: string | null }>;
}

function parseTable(tokens: Token[], start: number): { node: MarkdownNodeJson; next: number } | null {
  let index = start + 1;
  const rows: TableRowDraft[] = [];
  let inHeader = false;
  let current: TableRowDraft | null = null;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) break;
    if (token.type === 'table_close') {
      index += 1;
      break;
    }
    if (token.type === 'thead_open') inHeader = true;
    else if (token.type === 'thead_close') inHeader = false;
    else if (token.type === 'tr_open') current = { header: inHeader, cells: [] };
    else if (token.type === 'tr_close') {
      if (current !== null) rows.push(current);
      current = null;
    } else if (token.type === 'th_open' || token.type === 'td_open') {
      const align = tableCellAlign(token);
      const inline = tokens[index + 1]?.type === 'inline' ? tokens[index + 1] : null;
      current?.cells.push({ inline: inline ?? null, align });
    }
    index += 1;
  }
  if (rows.length === 0) return null;
  const kept = rows.filter((row) => row.cells.length > 0);
  if (kept.length === 0) return null;
  const content: MarkdownNodeJson[] = kept.map((row) => ({
    type: 'tableRow',
    content: row.cells.map((cell) => ({
      type: row.header ? 'tableHeader' : 'tableCell',
      ...(cell.align === null ? {} : { attrs: { align: cell.align } }),
      content: [paragraph(cell.inline === null ? [] : inlineNodes(cell.inline))],
    })),
  }));
  return { node: { type: 'table', content }, next: index };
}

function findClose(tokens: Token[], start: number, openType: string, closeType: string): number {
  let depth = 0;
  for (let index = start + 1; index < tokens.length; index += 1) {
    const type = tokens[index]?.type;
    if (type === openType) depth += 1;
    else if (type === closeType) {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return tokens.length;
}

function normalizeListItem(content: MarkdownNodeJson[]): MarkdownNodeJson[] {
  if (content.length === 0) return [paragraph()];
  const [first, ...rest] = content;
  if (first?.type === 'paragraph') return content;
  return [paragraph(), ...rest];
}

/** Block token stream -> block nodes. */
function parseBlocks(tokens: Token[], start = 0, end = tokens.length): MarkdownNodeJson[] {
  const blocks: MarkdownNodeJson[] = [];
  let index = start;
  while (index < end) {
    const token = tokens[index];
    if (token === undefined) break;
    switch (token.type) {
      case 'paragraph_open': {
        const inline = tokens[index + 1];
        const content = inline?.type === 'inline' ? inlineNodes(inline) : [];
        const latex = inline?.type === 'inline' ? blockMathLatex(inline) : null;
        if (latex !== null) blocks.push({ type: 'blockMath', attrs: { latex } });
        else blocks.push(paragraph(content));
        index += inline === undefined ? 2 : 3;
        break;
      }
      case 'heading_open': {
        const inline = tokens[index + 1];
        const level = Number.parseInt(token.tag.slice(1), 10);
        const node: MarkdownNodeJson = {
          type: 'heading',
          attrs: { level: Number.isFinite(level) ? level : 1 },
        };
        const content = inline?.type === 'inline' ? inlineNodes(inline) : [];
        if (content.length > 0) node.content = content;
        blocks.push(node);
        index += 3;
        break;
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const closeType = token.type === 'bullet_list_open' ? 'bullet_list_close' : 'ordered_list_close';
        const close = findClose(tokens, index, token.type, closeType);
        const items: MarkdownNodeJson[] = [];
        let cursor = index + 1;
        while (cursor < close) {
          const item = tokens[cursor];
          if (item?.type === 'list_item_open') {
            const itemClose = findClose(tokens, cursor, 'list_item_open', 'list_item_close');
            const content = normalizeListItem(parseBlocks(tokens, cursor + 1, itemClose));
            items.push({ type: 'listItem', content });
            cursor = itemClose + 1;
            continue;
          }
          cursor += 1;
        }
        const startValue =
          token.type === 'ordered_list_open'
            ? Number.parseInt(token.attrGet('start') ?? '1', 10)
            : 1;
        blocks.push({
          type: token.type === 'bullet_list_open' ? 'bulletList' : 'orderedList',
          ...(token.type === 'ordered_list_open' && Number.isFinite(startValue) && startValue !== 1
            ? { attrs: { start: startValue } }
            : {}),
          content: items,
        });
        index = close + 1;
        break;
      }
      case 'blockquote_open': {
        const close = findClose(tokens, index, 'blockquote_open', 'blockquote_close');
        const content = parseBlocks(tokens, index + 1, close);
        blocks.push({
          type: 'blockquote',
          content: content.length === 0 ? [paragraph()] : content,
        });
        index = close + 1;
        break;
      }
      case 'fence':
      case 'code_block': {
        const info = token.type === 'fence' ? token.info.trim().split(/\s+/)[0] ?? '' : '';
        const language = info.length > 0 ? info : null;
        const text = token.content.endsWith('\n')
          ? token.content.slice(0, -1)
          : token.content;
        blocks.push({
          type: 'codeBlock',
          attrs: { language },
          ...(text.length === 0 ? {} : { content: [{ type: 'text', text }] }),
        });
        index += 1;
        break;
      }
      case 'hr':
        blocks.push({ type: 'horizontalRule' });
        index += 1;
        break;
      case 'table_open': {
        const table = parseTable(tokens, index);
        if (table === null) {
          index += 1;
          break;
        }
        blocks.push(table.node);
        index = table.next;
        break;
      }
      case 'html_block':
        blocks.push(paragraph([{ type: 'text', text: token.content.replace(/\n$/, '') }]));
        index += 1;
        break;
      default: {
        // Unknown top-level token with text content stays visible.
        if (
          token.content.length > 0 &&
          !token.type.endsWith('_open') &&
          !token.type.endsWith('_close') &&
          token.type !== 'inline'
        ) {
          blocks.push(paragraph([{ type: 'text', text: token.content }]));
        }
        index += 1;
        break;
      }
    }
  }
  return blocks;
}

function sourceWithoutFrontmatter(source: string): {
  prefix: MarkdownNodeJson[];
  body: string;
} {
  const split = splitFrontmatter(source);
  if (split === null) return { prefix: [], body: source };
  return {
    prefix: [{ type: 'frontmatter', attrs: { raw: split.raw } }],
    body: split.body,
  };
}

function validDocument(
  candidate: MarkdownDocumentJson,
  source: string,
): MarkdownDocumentJson {
  try {
    const schema = flatMarkdownSchema();
    const node = schema.nodeFromJSON(candidate);
    node.check();
    return node.toJSON() as MarkdownDocumentJson;
  } catch {
    // Never drop content because one construct was unexpected: keep the whole
    // source as visible text.
    return {
      type: 'doc',
      content: [paragraph([{ type: 'text', text: source }])],
    };
  }
}

/**
 * Parse one Markdown file into flat ProseMirror JSON.
 *
 * The result is always a valid flat document with at least one block; the
 * parser never throws for malformed Markdown.
 */
export function parseMarkdown(source: string): MarkdownDocumentJson {
  try {
    // The frontmatter prefix is split from the original bytes (CRLF/BOM
    // included) so a save can re-emit it verbatim; only the body is normalized.
    const { prefix, body: rawBody } = sourceWithoutFrontmatter(source);
    const body = rawBody.replace(/\r\n?/g, '\n');
    if (prefix.length === 0 && body.trim().length === 0) return emptyDocument();
    const tokens = tokenizer.parse(body, {});
    const blocks = [...prefix, ...parseBlocks(tokens)];
    return validDocument(
      {
        type: 'doc',
        content: blocks.length === 0 ? [paragraph()] : blocks,
      },
      source,
    );
  } catch {
    return {
      type: 'doc',
      content: [paragraph([{ type: 'text', text: source }])],
    };
  }
}
