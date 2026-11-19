/**
 * GFM table-cell inline layer (v0.1.1, Track A).
 *
 * A table cell holds exactly one paragraph of inline content. This module is
 * the neutral AST between that content and the GFM cell source:
 *
 * - `parseGfmInline` reads the narrow GFM inline subset the cells support:
 *   bold (`**`), italic (`*`), strike (`~~`), inline code, inline math (`$…$`
 *   with the same Obsidian guards as the editor input rule) and hard breaks
 *   (`<br>` or a newline).
 * - `serializeGfmInline` writes the same subset back with one escape contract
 *   for `\`, `*`, `_`, `` ` ``, `$` and `~`. Pipes are **not** escaped here:
 *   the table row layer owns them (`escapeGfmCell`).
 *
 * The parser is deliberately narrow. Links, highlights and anchors are not
 * GFM cell syntax and stay plain text. `_` is escaped on write but is not an
 * emphasis delimiter on read; only `*` opens emphasis.
 *
 * The row splitter resolves the structural pipe escape (`\|`) and leaves every
 * other escape to this layer, so an escaped delimiter is unescaped exactly
 * once.
 */

import { findInlineMathInput } from './formula-input';

/** Inline marks a cell can carry through GFM. */
export type GfmInlineMark = 'bold' | 'italic' | 'strike' | 'code';

export interface GfmInlineText {
  type: 'text';
  text: string;
  /** Sorted by `MARK_ORDER`; empty for plain text. */
  marks: GfmInlineMark[];
}

export interface GfmInlineHardBreak {
  type: 'hardBreak';
}

export interface GfmInlineMath {
  type: 'inlineMath';
  latex: string;
}

export type GfmInlineNode = GfmInlineText | GfmInlineHardBreak | GfmInlineMath;

const MARK_ORDER: readonly GfmInlineMark[] = ['bold', 'italic', 'strike', 'code'];

/**
 * Characters a backslash escapes in the inline source. `|` is absent on
 * purpose: the row splitter already resolved the structural pipe.
 */
const ESCAPABLE = new Set(['\\', '*', '_', '`', '$', '~']);

function sortedMarks(marks: readonly GfmInlineMark[]): GfmInlineMark[] {
  return MARK_ORDER.filter((mark) => marks.includes(mark));
}

function withMark(marks: readonly GfmInlineMark[], mark: GfmInlineMark): GfmInlineMark[] {
  return sortedMarks(marks.includes(mark) ? marks : [...marks, mark]);
}

function pushText(
  out: GfmInlineNode[],
  text: string,
  marks: readonly GfmInlineMark[],
): void {
  if (text.length === 0) return;
  out.push({ type: 'text', text, marks: sortedMarks(marks) });
}

function countRun(source: string, index: number, character: string): number {
  let length = 0;
  while (source[index + length] === character) length += 1;
  return length;
}

/** The index of the next backtick run of exactly `length`, or -1. */
function codeFenceEnd(source: string, from: number, length: number): number {
  let index = from;
  while (index < source.length) {
    if (source[index] === '`') {
      const run = countRun(source, index, '`');
      if (run === length) return index;
      index += run;
      continue;
    }
    index += 1;
  }
  return -1;
}

/** The first closure of `delimiter` that is not escaped or inside code/math. */
function emphasisClose(source: string, from: number, delimiter: '*' | '**' | '~~'): number {
  let index = from;
  while (index < source.length) {
    const character = source[index] ?? '';
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === '`') {
      const run = countRun(source, index, '`');
      const close = codeFenceEnd(source, index + run, run);
      index = close < 0 ? index + run : close + run;
      continue;
    }
    if (character === '$') {
      const match = findInlineMathInput(source.slice(index));
      index += match !== null && match.index === 0 ? match.text.length : 1;
      continue;
    }
    if (delimiter === '~~') {
      if (source.startsWith('~~', index)) return index;
    } else if (delimiter === '**') {
      if (source.startsWith('**', index)) return index;
    } else if (character === '*') {
      // A run of exactly two is a bold opener/closer, not an italic one. A
      // run of three closes the italic and leaves `**` for the bold that
      // follows (`*a***b**` is italic a then bold b).
      if (countRun(source, index, '*') === 2) {
        index += 2;
        continue;
      }
      return index;
    }
    index += 1;
  }
  return -1;
}

/** The index of the next run of exactly `length` stars, or -1. */
function starRunEnd(source: string, from: number, length: number): number {
  let index = from;
  while (index < source.length) {
    const character = source[index] ?? '';
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === '`') {
      const run = countRun(source, index, '`');
      const close = codeFenceEnd(source, index + run, run);
      index = close < 0 ? index + run : close + run;
      continue;
    }
    if (character === '$') {
      const match = findInlineMathInput(source.slice(index));
      index += match !== null && match.index === 0 ? match.text.length : 1;
      continue;
    }
    if (character === '*') {
      const run = countRun(source, index, '*');
      if (run === length) return index;
      index += run;
      continue;
    }
    index += 1;
  }
  return -1;
}

function parseInto(
  source: string,
  marks: readonly GfmInlineMark[],
  out: GfmInlineNode[],
): void {
  let text = '';
  let index = 0;
  const flush = (): void => {
    pushText(out, text, marks);
    text = '';
  };

  while (index < source.length) {
    const character = source[index] ?? '';

    if (character === '\\') {
      const next = source[index + 1];
      if (next !== undefined && ESCAPABLE.has(next)) {
        text += next;
        index += 2;
        continue;
      }
      // A lone backslash (or one before a non-special character) is literal.
      text += '\\';
      index += 1;
      continue;
    }

    if (character === '\n') {
      flush();
      out.push({ type: 'hardBreak' });
      index += 1;
      continue;
    }

    if (character === '<') {
      const br = /^<br\s*\/?>/i.exec(source.slice(index));
      if (br !== null) {
        flush();
        out.push({ type: 'hardBreak' });
        index += br[0].length;
        continue;
      }
    }

    if (character === '`') {
      const run = countRun(source, index, '`');
      const close = codeFenceEnd(source, index + run, run);
      if (close < 0) {
        text += '`'.repeat(run);
        index += run;
        continue;
      }
      let content = source.slice(index + run, close);
      if (
        content.length > 1 &&
        content.startsWith(' ') &&
        content.endsWith(' ') &&
        content.trim().length > 0
      ) {
        content = content.slice(1, -1);
      }
      flush();
      pushText(out, content, withMark(marks, 'code'));
      index = close + run;
      continue;
    }

    if (character === '$') {
      const match = findInlineMathInput(source.slice(index));
      if (match !== null && match.index === 0) {
        flush();
        out.push({ type: 'inlineMath', latex: match.latex });
        index += match.text.length;
        continue;
      }
      text += '$';
      index += 1;
      continue;
    }

    if (character === '~' && source.startsWith('~~', index)) {
      const close = emphasisClose(source, index + 2, '~~');
      if (close < 0 || close === index + 2) {
        text += '~~';
        index += 2;
        continue;
      }
      flush();
      parseInto(source.slice(index + 2, close), withMark(marks, 'strike'), out);
      index = close + 2;
      continue;
    }

    if (character === '*') {
      if (source.startsWith('***', index)) {
        const strongEm = starRunEnd(source, index + 3, 3);
        if (strongEm > index + 3) {
          flush();
          parseInto(
            source.slice(index + 3, strongEm),
            withMark(withMark(marks, 'bold'), 'italic'),
            out,
          );
          index = strongEm + 3;
          continue;
        }
      }
      const delimiter = source.startsWith('**', index) ? '**' : '*';
      const length = delimiter.length;
      const close = emphasisClose(source, index + length, delimiter);
      if (close < 0 || close === index + length) {
        text += delimiter;
        index += length;
        continue;
      }
      flush();
      parseInto(
        source.slice(index + length, close),
        withMark(marks, delimiter === '**' ? 'bold' : 'italic'),
        out,
      );
      index = close + length;
      continue;
    }

    text += character;
    index += 1;
  }

  flush();
}

/** Merge adjacent text nodes with the same marks; drop empty nodes. */
function coalesce(nodes: readonly GfmInlineNode[]): GfmInlineNode[] {
  const result: GfmInlineNode[] = [];
  for (const node of nodes) {
    const previous = result[result.length - 1];
    if (
      node.type === 'text' &&
      node.text.length > 0 &&
      previous?.type === 'text' &&
      previous.marks.length === node.marks.length &&
      previous.marks.every((mark, index) => mark === node.marks[index])
    ) {
      previous.text += node.text;
      continue;
    }
    if (node.type === 'text' && node.text.length === 0) continue;
    result.push(node);
  }
  return result;
}

/** Parse one GFM cell value into the neutral inline AST. */
export function parseGfmInline(source: string): GfmInlineNode[] {
  const out: GfmInlineNode[] = [];
  parseInto(source, [], out);
  return coalesce(out);
}

function escapeText(value: string): string {
  return value.replace(/[\\*_`$~]/g, (character) => `\\${character}`);
}

const MARK_DELIMITER: Readonly<Record<Exclude<GfmInlineMark, 'code'>, string>> = {
  bold: '**',
  italic: '*',
  strike: '~~',
};

/** A code span whose fence is longer than any backtick run in the content. */
function codeSpan(value: string): string {
  const runs = value.match(/`+/g) ?? [];
  const longest = runs.reduce((length, run) => Math.max(length, run.length), 0);
  const fence = '`'.repeat(longest + 1);
  const pad =
    value.startsWith('`') ||
    value.endsWith('`') ||
    (value.startsWith(' ') && value.endsWith(' '))
      ? ' '
      : '';
  return `${fence}${pad}${value}${pad}${fence}`;
}

function textMarkup(value: string, marks: readonly GfmInlineMark[]): string {
  return marks.includes('code') ? codeSpan(value) : escapeText(value);
}

/**
 * Serialize the neutral inline AST back to one GFM cell value.
 *
 * Marks are a flat set per text run, so the writer keeps an open-delimiter
 * stack and only closes the marks that change: `**a *b* c**` is one bold run
 * around an italic run, not three independently wrapped fragments. A non-text
 * node (math, hard break) closes every open mark so the atom is never swallowed
 * by emphasis.
 */
export function serializeGfmInline(nodes: readonly GfmInlineNode[]): string {
  let result = '';
  const open: Array<Exclude<GfmInlineMark, 'code'>> = [];

  const closeTo = (target: readonly GfmInlineMark[]): void => {
    let common = 0;
    while (
      common < open.length &&
      common < target.length &&
      open[common] === target[common]
    ) {
      common += 1;
    }
    for (let index = open.length - 1; index >= common; index -= 1) {
      const mark = open[index];
      if (mark !== undefined) result += MARK_DELIMITER[mark];
    }
    open.length = common;
  };

  const openTo = (target: readonly GfmInlineMark[]): void => {
    for (let index = open.length; index < target.length; index += 1) {
      const mark = target[index];
      if (mark === undefined || mark === 'code') continue;
      result += MARK_DELIMITER[mark];
      open.push(mark);
    }
  };

  const closeAll = (): void => closeTo([]);

  for (const node of nodes) {
    if (node.type === 'text') {
      const target = node.marks.filter(
        (mark): mark is Exclude<GfmInlineMark, 'code'> => mark !== 'code',
      );
      closeTo(target);
      openTo(target);
      const lines = node.text.split('\n');
      lines.forEach((line, index) => {
        if (index > 0) {
          closeAll();
          result += '<br>';
          openTo(target);
        }
        if (line.length > 0) result += textMarkup(line, node.marks);
      });
      continue;
    }
    closeAll();
    result += node.type === 'hardBreak' ? '<br>' : `$${node.latex}$`;
  }
  closeAll();
  return result;
}
