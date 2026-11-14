/**
 * Shared code highlighter (special-text A + editor appearance phase 1).
 *
 * One lowlight registry serves the Continuous editor decorations and the static
 * Page/print segment renderer, so a code block cannot drift between surfaces.
 * The editor uses `lowlight` through TipTap's CodeBlockLowlight; the Page
 * renderer runs the same language grammar per line.
 *
 * The page renderer must keep anchor spans in place. Highlighting splits a line
 * into nested `hljs-*` spans, so this module serializes the highlighted tree and
 * inserts one `nf-anchor` wrapper per matched token *around* the highlight
 * markup. The text survives byte for byte, which keeps the Page measurement,
 * pagination, and PDF text layer unchanged (colour only).
 */

import type { Element, RootContent, Text } from 'hast';
import { createLowlight, common } from 'lowlight';

/** The one lowlight instance shared by the editor and the Page renderer. */
export const lowlight = createLowlight(common);

/** A token-anchor occurrence inside one code line, in UTF-16 offsets. */
export interface CodeAnchorSpan {
  start: number;
  end: number;
  anchorId: string;
}

export interface CodeAnchorHint {
  anchorId: string;
  token: string;
}

/** Whether lowlight has a grammar (or alias) for this language name. */
export function isRegisteredCodeLanguage(language: string): boolean {
  return Boolean(lowlight.registered(language));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function attr(value: string): string {
  return `"${escapeAttr(value)}"`;
}

/**
 * Match code-token anchors against one raw line.
 *
 * The longest token wins an equal start position, and a token may occur more
 * than once (the same anchor then has several occurrences, as before). The
 * returned spans are sorted by start and never overlap.
 */
export function codeAnchorSpans(
  line: string,
  hints: readonly CodeAnchorHint[],
): CodeAnchorSpan[] {
  if (hints.length === 0 || line.length === 0) return [];
  const ordered = [...hints]
    .filter((hint) => hint.token.length > 0 && !hint.token.includes('\n'))
    .sort((left, right) => right.token.length - left.token.length);
  if (ordered.length === 0) return [];
  const spans: CodeAnchorSpan[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    let match: { start: number; token: string; anchorId: string } | null = null;
    for (const hint of ordered) {
      const start = line.indexOf(hint.token, cursor);
      if (start < 0) continue;
      if (
        match === null ||
        start < match.start ||
        (start === match.start && hint.token.length > match.token.length)
      ) {
        match = { start, token: hint.token, anchorId: hint.anchorId };
      }
    }
    if (match === null) break;
    spans.push({
      start: match.start,
      end: match.start + match.token.length,
      anchorId: match.anchorId,
    });
    cursor = match.start + match.token.length;
  }
  return spans;
}

interface HighlightFrame {
  tagName: string;
  className: string;
}

interface HighlightRun {
  text: string;
  frames: HighlightFrame[];
  anchorId: string | null;
}

function classNameOf(element: Element): string {
  const value = element.properties?.['className'];
  if (Array.isArray(value)) return value.join(' ');
  return typeof value === 'string' ? value : '';
}

function anchorAt(spans: readonly CodeAnchorSpan[], offset: number): CodeAnchorSpan | null {
  for (const span of spans) {
    if (offset < span.start) return null;
    if (offset < span.end) return span;
  }
  return null;
}

function pushTextRuns(
  value: string,
  start: number,
  frames: HighlightFrame[],
  spans: readonly CodeAnchorSpan[],
  out: HighlightRun[],
): void {
  let cursor = 0;
  while (cursor < value.length) {
    const absolute = start + cursor;
    const span = anchorAt(spans, absolute);
    const end = span === null ? value.length : Math.min(value.length, span.end - start);
    // The next span starts after this run when the current text lies outside
    // one; split there so no wrapper ever crosses a token boundary.
    const nextStart =
      span === null
        ? spans.find((candidate) => candidate.start > absolute)?.start
        : undefined;
    const limit = nextStart === undefined ? end : Math.min(end, nextStart - start);
    out.push({
      text: value.slice(cursor, limit),
      frames,
      anchorId: span?.anchorId ?? null,
    });
    cursor = limit;
  }
}

function collectRuns(
  nodes: readonly RootContent[],
  frames: HighlightFrame[],
  spans: readonly CodeAnchorSpan[],
  state: { offset: number },
  out: HighlightRun[],
): void {
  for (const node of nodes) {
    if (node.type === 'text') {
      const text = node as Text;
      pushTextRuns(text.value, state.offset, frames, spans, out);
      state.offset += text.value.length;
      continue;
    }
    if (node.type !== 'element') continue;
    const className = classNameOf(node);
    collectRuns(
      node.children,
      [...frames, { tagName: node.tagName, className }],
      spans,
      state,
      out,
    );
  }
}

function emitRuns(runs: readonly HighlightRun[]): string {
  let html = '';
  let open: HighlightFrame[] = [];
  let openAnchor: string | null = null;

  const closeFramesTo = (target: number): void => {
    while (open.length > target) {
      const frame = open.pop();
      if (frame !== undefined) html += `</${frame.tagName}>`;
    }
  };

  for (const run of runs) {
    if (run.anchorId !== openAnchor) {
      closeFramesTo(0);
      if (openAnchor !== null) html += '</span>';
      openAnchor = run.anchorId;
      if (openAnchor !== null) {
        html += `<span class="nf-anchor" data-anchor-id=${attr(openAnchor)}>`;
      }
    }
    let shared = 0;
    while (
      shared < open.length &&
      shared < run.frames.length &&
      open[shared]?.tagName === run.frames[shared]?.tagName &&
      open[shared]?.className === run.frames[shared]?.className
    ) {
      shared += 1;
    }
    closeFramesTo(shared);
    for (let index = shared; index < run.frames.length; index += 1) {
      const frame = run.frames[index];
      if (frame === undefined) continue;
      const attributes =
        frame.className.length > 0 ? ` class=${attr(frame.className)}` : '';
      html += `<${frame.tagName}${attributes}>`;
      open.push(frame);
    }
    html += escapeHtml(run.text);
  }
  closeFramesTo(0);
  if (openAnchor !== null) html += '</span>';
  return html;
}

/** Plain text fallback that still keeps every anchor span (never drops one). */
function plainLineHtml(line: string, spans: readonly CodeAnchorSpan[]): string {
  let html = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) html += escapeHtml(line.slice(cursor, span.start));
    html += `<span class="nf-anchor" data-anchor-id=${attr(span.anchorId)}>${escapeHtml(
      line.slice(span.start, span.end),
    )}</span>`;
    cursor = span.end;
  }
  html += escapeHtml(line.slice(cursor));
  return html;
}

/**
 * Highlight one code line with the block's language grammar.
 *
 * A registered language (including `plaintext`) uses its own grammar; an
 * unknown language falls back to lowlight auto-detection, exactly like the
 * editor decorations. Anchor spans wrap the highlight markup so measurement
 * still sees one rectangle per token occurrence.
 */
export function highlightCodeLineHtml(
  line: string,
  language: string,
  spans: readonly CodeAnchorSpan[],
): string {
  if (line.length === 0) return '';
  try {
    const root = isRegisteredCodeLanguage(language)
      ? lowlight.highlight(language, line)
      : lowlight.highlightAuto(line);
    const runs: HighlightRun[] = [];
    collectRuns(root.children, [], spans, { offset: 0 }, runs);
    return emitRuns(runs);
  } catch {
    return plainLineHtml(line, spans);
  }
}
