/**
 * Convert an editor text selection into a platform-neutral core text binding.
 *
 * ProseMirror positions are UTF-16 code-unit offsets; the canonical binding is
 * Unicode code-point offsets inside text nodes. Only the editor adapter knows
 * PM positions, so this module is the single bridge used by the selection
 * toolbar and the keymap. It never mutates content and never applies a local
 * mark: the structural command applies the canonical binding.
 */

import type {
  AnchorBinding,
  CodeAnchorSelector,
  FormulaAnchorSelector,
  FormulaTermAnchorSelector,
} from '@noteforest/core';
import { codeAnchorSelectorForBinding } from '@noteforest/core';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { pmToContent, type PMNode } from './adapter';

export type TextAnchorBinding = Extract<AnchorBinding, { kind: 'text' }>;
export type FormulaWholeBinding = Extract<AnchorBinding, { kind: 'formula'; form: 'whole' }>;
export type FormulaTermBinding = Extract<AnchorBinding, { kind: 'formula'; form: 'term' }>;
export type FormulaSelectionBinding = FormulaWholeBinding | FormulaTermBinding;
export type CodeSelectionBinding = Extract<AnchorBinding, { kind: 'code' }>;

export interface TextSelectionAnchor {
  kind: 'text';
  blockId: string;
  binding: TextAnchorBinding;
}

export interface FormulaSelectionAnchor {
  kind: 'formula';
  blockId: string;
  binding: FormulaSelectionBinding;
  selector: FormulaAnchorSelector;
}

export interface CodeSelectionAnchor {
  kind: 'code';
  blockId: string;
  binding: CodeSelectionBinding;
  selector: CodeAnchorSelector;
}

/** One branch source derived from the editor's current selection. */
export type BranchSelectionAnchor =
  | TextSelectionAnchor
  | FormulaSelectionAnchor
  | CodeSelectionAnchor;

export type TextSelectionFailure =
  | 'empty'
  | 'crosses-block'
  | 'crosses-barrier'
  | 'crosses-cell'
  | 'no-text'
  | 'no-formula'
  | 'no-code'
  | 'no-block';

export type TextSelectionResult =
  | { ok: true; selection: BranchSelectionAnchor }
  | { ok: false; reason: TextSelectionFailure; message: string };

const LEAF_TYPES = new Set([
  'image',
  'hardBreak',
  'inlineMath',
  'mathBlock',
  'blockMath',
  'horizontalRule',
]);
const BLOCK_ATOMIC_TYPES = new Set([
  'mathBlock',
  'blockMath',
  'codeBlock',
  'image',
  'horizontalRule',
]);
const FORMULA_NODE_TYPES = new Set(['inlineMath', 'mathBlock', 'blockMath']);
const TABLE_CELL_TYPES = new Set(['tableCell', 'tableHeader']);

const FAILURE_MESSAGES: Record<TextSelectionFailure, string> = {
  empty: 'Select text or a formula to branch from.',
  'crosses-block': 'Anchors work within one block.',
  'crosses-barrier': 'Anchors cannot cross a display math, image, or code block.',
  'crosses-cell': 'Anchors work within one table cell.',
  'no-text': 'Select text, or select a whole formula with a click.',
  'no-formula': 'Select a whole formula with a click before branching.',
  'no-code': 'Place the caret inside a code block before branching from code.',
  'no-block': 'Place the caret inside a block before branching.',
};

function failure(reason: TextSelectionFailure): {
  ok: false;
  reason: TextSelectionFailure;
  message: string;
} {
  return { ok: false, reason, message: FAILURE_MESSAGES[reason] };
}

function nodeSize(node: PMNode): number {
  if (node.type === 'text') return (node.text ?? '').length;
  if (LEAF_TYPES.has(node.type)) return 1;
  let size = 0;
  for (const child of node.content ?? []) size += nodeSize(child);
  return size + 2;
}

/** Code-point offset for a UTF-16 offset inside one text node. */
function codePointOffset(text: string, utf16Offset: number): number {
  return Array.from(text.slice(0, utf16Offset)).length;
}

interface WalkState {
  ranges: Array<{ nodePath: number[]; start: number; end: number }>;
  barrier: 'crosses-barrier' | 'crosses-cell' | null;
}

function walkNode(
  node: PMNode,
  path: number[],
  offset: number,
  from: number,
  to: number,
  state: WalkState,
): void {
  const size = nodeSize(node);
  const start = offset;
  const end = offset + size;
  const overlaps = Math.min(to, end) > Math.max(from, start);

  if (node.type === 'text') {
    if (!overlaps) return;
    const text = node.text ?? '';
    const overlapStart = Math.max(from, start);
    const overlapEnd = Math.min(to, end);
    const codeStart = codePointOffset(text, overlapStart - start);
    const codeEnd = codePointOffset(text, overlapEnd - start);
    if (codeEnd > codeStart) {
      state.ranges.push({ nodePath: [...path], start: codeStart, end: codeEnd });
    }
    return;
  }

  if (BLOCK_ATOMIC_TYPES.has(node.type)) {
    if (overlaps) state.barrier = 'crosses-barrier';
    return;
  }

  if (TABLE_CELL_TYPES.has(node.type) && overlaps) {
    const inside = from >= start + 1 && to <= end - 1;
    if (!inside) state.barrier = 'crosses-cell';
  }

  if (node.type === 'hardBreak' || node.type === 'inlineMath') return;

  let childOffset = start + 1;
  const children = node.content ?? [];
  for (const [index, child] of children.entries()) {
    walkNode(child, [...path, index], childOffset, from, to, state);
    childOffset += nodeSize(child);
  }
}

/**
 * Map a selection [from, to) expressed in positions relative to the block
 * body's content to text-node ranges. Selection may include inline math,
 * hard breaks, and inline images; it may not cross a block-level atomic node
 * or a table-cell boundary.
 */
export function textBindingInBody(
  body: PMNode,
  from: number,
  to: number,
): { ok: true; binding: TextAnchorBinding } | { ok: false; reason: TextSelectionFailure; message: string } {
  if (to <= from) return failure('empty');
  const state: WalkState = { ranges: [], barrier: null };
  let childOffset = 0;
  for (const [index, child] of (body.content ?? []).entries()) {
    walkNode(child, [index], childOffset, from, to, state);
    childOffset += nodeSize(child);
  }
  if (state.barrier !== null) return failure(state.barrier);
  if (state.ranges.length === 0) return failure('no-text');
  return { ok: true, binding: { kind: 'text', ranges: state.ranges } };
}

/** Derive the canonical text binding for the editor's current text selection. */
export function textSelectionAnchor(editor: Editor): TextSelectionResult {
  const selection = editor.state.selection;
  if (selection.empty) return failure('empty');

  const $from = editor.state.doc.resolve(selection.from);
  let bodyDepth = -1;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'blockBody') {
      bodyDepth = depth;
      break;
    }
  }
  if (bodyDepth < 0) return failure('no-block');

  const body = $from.node(bodyDepth);
  const bodyStart = $from.before(bodyDepth) + 1;
  const bodyEnd = bodyStart + body.content.size;
  if (selection.from < bodyStart || selection.to > bodyEnd) {
    return failure('crosses-block');
  }

  const blockNode = $from.node(bodyDepth - 1);
  const blockId = blockNode.attrs['blockId'];
  if (blockNode.type.name !== 'branchBlock' || typeof blockId !== 'string') {
    return failure('no-block');
  }

  const mapped = textBindingInBody(
    body.toJSON() as PMNode,
    selection.from - bodyStart,
    selection.to - bodyStart,
  );
  if (!mapped.ok) return mapped;
  return { ok: true, selection: { kind: 'text', blockId, binding: mapped.binding } };
}

function isFormulaNodeType(type: string): boolean {
  return FORMULA_NODE_TYPES.has(type);
}

function findFormulaAt(
  node: PMNode,
  offset: number,
  path: number[],
): { node: PMNode; path: number[] } | null {
  let childOffset = 0;
  for (const [index, child] of (node.content ?? []).entries()) {
    const size = nodeSize(child);
    if (offset === childOffset && isFormulaNodeType(child.type)) {
      return { node: child, path: [...path, index] };
    }
    if (offset > childOffset && offset < childOffset + size) {
      return findFormulaAt(child, offset - childOffset - 1, [...path, index]);
    }
    childOffset += size;
  }
  return null;
}

/**
 * Map an atomic formula node at `from` (relative to the block body's content)
 * to its canonical whole-formula binding. A NodeSelection's `from` is the
 * position immediately before the selected node, so an exact offset match is
 * the node start. Works for a block formula and a formula nested inline.
 */
export function formulaBindingInBody(
  body: PMNode,
  from: number,
): { ok: true; binding: FormulaWholeBinding; latex: string } | {
  ok: false;
  reason: TextSelectionFailure;
  message: string;
} {
  const found = findFormulaAt(body, from, []);
  if (found === null) return failure('no-formula');
  const latex = typeof found.node.attrs?.['latex'] === 'string' ? found.node.attrs['latex'] : '';
  return {
    ok: true,
    binding: { kind: 'formula', form: 'whole', nodePath: found.path },
    latex,
  };
}

export const FORMULA_TERM_CONTEXT_LENGTH = 32;

export interface FormulaTermSelection {
  term: string;
  /** Unicode code point offset in the formula source, inclusive. */
  latexStart: number;
  /** Unicode code point offset in the formula source, exclusive. */
  latexEnd: number;
  /** Up to 32 code points of LaTeX context on each side. */
  latexPrefix: string;
  latexSuffix: string;
  /** 1-based occurrence of the term in the formula source. */
  occurrence: number;
}

/**
 * Map the math dialog's textarea selection to canonical formula-term fields.
 *
 * Textarea offsets are UTF-16; formula selectors use Unicode code points. The
 * occurrence is counted in the full source (not just the selection), and the
 * context is bounded so the durable selector stays small. An empty or
 * collapsed selection returns null; the caller decides whether a
 * whitespace-only term is actionable.
 */
export function formulaTermSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  contextLength = FORMULA_TERM_CONTEXT_LENGTH,
): FormulaTermSelection | null {
  if (!Number.isFinite(selectionStart) || !Number.isFinite(selectionEnd)) return null;
  const points = Array.from(value);
  const start = Math.max(0, Math.min(Math.trunc(selectionStart), value.length));
  const end = Math.max(start, Math.min(Math.trunc(selectionEnd), value.length));
  const latexStart = Array.from(value.slice(0, start)).length;
  const latexEnd = Array.from(value.slice(0, end)).length;
  if (latexEnd <= latexStart) return null;

  const termPoints = points.slice(latexStart, latexEnd);
  const term = termPoints.join('');
  if (term.length === 0) return null;

  const context = Number.isFinite(contextLength) ? Math.max(0, Math.trunc(contextLength)) : 0;
  const latexPrefix = points
    .slice(Math.max(0, latexStart - context), latexStart)
    .join('');
  const latexSuffix = points.slice(latexEnd, Math.min(points.length, latexEnd + context)).join('');

  let occurrence = 0;
  for (let index = 0; index <= latexStart; index += 1) {
    if (index + termPoints.length > points.length) break;
    let matches = true;
    for (let offset = 0; offset < termPoints.length; offset += 1) {
      if (points[index + offset] !== termPoints[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) occurrence += 1;
  }
  if (occurrence < 1) return null;

  return {
    term,
    latexStart,
    latexEnd,
    latexPrefix,
    latexSuffix,
    occurrence,
  };
}

/** Build the explicit term selector stored in the anchor record. */
export function formulaTermSelector(selection: FormulaTermSelection): FormulaTermAnchorSelector {
  return {
    kind: 'formula',
    form: 'term',
    latex: selection.term,
    latexStart: selection.latexStart,
    ...(selection.latexPrefix.length === 0 ? {} : { latexPrefix: selection.latexPrefix }),
    ...(selection.latexSuffix.length === 0 ? {} : { latexSuffix: selection.latexSuffix }),
    occurrenceHint: selection.occurrence,
  };
}

/** Build the atomic-node binding for a formula term anchor. */
export function formulaTermBinding(
  nodePath: readonly number[],
  selection: FormulaTermSelection,
): FormulaTermBinding {
  return {
    kind: 'formula',
    form: 'term',
    nodePath: [...nodePath],
    latex: selection.term,
    occurrence: selection.occurrence,
  };
}

function blockAndBodyAt(
  editor: Editor,
  position: number,
): { blockId: string; body: PMNode; bodyStart: number; bodyDepth: number } | null {
  const $from = editor.state.doc.resolve(position);
  let bodyDepth = -1;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'blockBody') {
      bodyDepth = depth;
      break;
    }
  }
  if (bodyDepth < 0) return null;
  const blockNode = $from.node(bodyDepth - 1);
  const blockId = blockNode.attrs['blockId'];
  if (blockNode.type.name !== 'branchBlock' || typeof blockId !== 'string') return null;
  return {
    blockId,
    body: $from.node(bodyDepth).toJSON() as PMNode,
    bodyStart: $from.before(bodyDepth) + 1,
    bodyDepth,
  };
}

export interface FormulaNodeLocation {
  blockId: string;
  nodePath: number[];
  latex: string;
}

/**
 * Locate the formula node starting at a ProseMirror position without relying on
 * the current selection. The math dialog receives this exact `pos` from the
 * formula node view, so it can branch from a term while the dialog owns focus.
 */
export function formulaNodeAt(editor: Editor, pos: number): FormulaNodeLocation | null {
  const located = blockAndBodyAt(editor, pos);
  if (located === null) return null;
  const mapped = formulaBindingInBody(located.body, pos - located.bodyStart);
  if (!mapped.ok) return null;
  return {
    blockId: located.blockId,
    nodePath: mapped.binding.nodePath,
    latex: mapped.latex,
  };
}

/** Derive the canonical whole-formula binding for an atomic formula NodeSelection. */
export function formulaSelectionAnchor(editor: Editor): TextSelectionResult {
  const selection = editor.state.selection;
  if (!(selection instanceof NodeSelection) || !isFormulaNodeType(selection.node.type.name)) {
    return failure('no-formula');
  }
  const located = blockAndBodyAt(editor, selection.from);
  if (located === null) return failure('no-block');
  const mapped = formulaBindingInBody(located.body, selection.from - located.bodyStart);
  if (!mapped.ok) return mapped;
  return {
    ok: true,
    selection: {
      kind: 'formula',
      blockId: located.blockId,
      binding: mapped.binding,
      selector: { kind: 'formula', form: 'whole', latex: mapped.latex },
    },
  };
}

/**
 * Map a selection range inside a code block to a canonical code binding and
 * selector. `nodePath` is relative to the block body's content root; offsets
 * are Unicode code points in the code text. The helper is pure so the editor
 * bridge and unit tests share one mapping.
 */
export function codeSelectionInBody(
  body: PMNode,
  nodePath: readonly number[],
  startUtf16: number,
  endUtf16: number,
):
  | { ok: true; binding: CodeSelectionBinding; selector: CodeAnchorSelector }
  | { ok: false; reason: TextSelectionFailure; message: string } {
  if (endUtf16 <= startUtf16) return failure('empty');
  const node = nodeAtPath(body, nodePath);
  if (node === null || node.type !== 'codeBlock') return failure('no-code');
  const text = pmText(node);
  const startOffset = codePointOffset(text, Math.max(0, startUtf16));
  const endOffset = codePointOffset(text, Math.min(text.length, endUtf16));
  if (endOffset <= startOffset) return failure('empty');
  const binding: CodeSelectionBinding = {
    kind: 'code',
    nodePath: [...nodePath],
    startOffset,
    endOffset,
  };
  const selector = codeAnchorSelectorForBinding(pmToContent(body), binding);
  if (selector === null) return failure('no-code');
  return { ok: true, binding, selector };
}

function nodeAtPath(node: PMNode, path: readonly number[]): PMNode | null {
  let current: PMNode | undefined = node;
  for (const index of path) {
    current = current.content?.[index];
    if (current === undefined) return null;
  }
  return current ?? null;
}

function pmText(node: PMNode): string {
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map(pmText).join('');
}

/**
 * Derive the canonical code binding for a selection inside one code block.
 *
 * Returns null when the selection is not inside a code block so the caller can
 * keep the existing text path unchanged. A selection that crosses the code
 * block boundary is rejected rather than treated as text.
 */
export function codeSelectionAnchor(editor: Editor): TextSelectionResult | null {
  const selection = editor.state.selection;
  const nodeSelection =
    selection instanceof NodeSelection && selection.node.type.name === 'codeBlock';
  if (!nodeSelection && selection.empty) return null;

  const anchorPosition = nodeSelection ? selection.from + 1 : selection.from;
  const $from = editor.state.doc.resolve(anchorPosition);
  let codeDepth = -1;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'codeBlock') {
      codeDepth = depth;
      break;
    }
  }
  if (codeDepth < 0) return null;

  const located = blockAndBodyAt(editor, anchorPosition);
  if (located === null) return failure('no-block');
  const codeStart = $from.start(codeDepth);
  const codeEnd = $from.end(codeDepth);
  let startUtf16: number;
  let endUtf16: number;
  if (nodeSelection) {
    startUtf16 = 0;
    endUtf16 = $from.node(codeDepth).textContent.length;
  } else {
    if (selection.from < codeStart || selection.to > codeEnd) {
      return failure('crosses-block');
    }
    startUtf16 = selection.from - codeStart;
    endUtf16 = selection.to - codeStart;
  }

  const nodePath: number[] = [];
  for (let depth = located.bodyDepth; depth < codeDepth; depth += 1) {
    nodePath.push($from.index(depth));
  }

  const mapped = codeSelectionInBody(located.body, nodePath, startUtf16, endUtf16);
  if (!mapped.ok) return mapped;
  return {
    ok: true,
    selection: {
      kind: 'code',
      blockId: located.blockId,
      binding: mapped.binding,
      selector: mapped.selector,
    },
  };
}

/**
 * The branch source for the current editor selection. A formula NodeSelection
 * takes the atomic whole-formula path; a range inside a code block takes the
 * code path; every other text caret/range keeps the text path unchanged.
 */
export function branchSelectionAnchor(editor: Editor): TextSelectionResult {
  const selection = editor.state.selection;
  if (selection instanceof NodeSelection && isFormulaNodeType(selection.node.type.name)) {
    return formulaSelectionAnchor(editor);
  }
  if (selection instanceof NodeSelection && selection.node.type.name === 'codeBlock') {
    return codeSelectionAnchor(editor) ?? textSelectionAnchor(editor);
  }
  if (!selection.empty && !(selection instanceof NodeSelection)) {
    const code = codeSelectionAnchor(editor);
    if (code !== null) return code;
  }
  return textSelectionAnchor(editor);
}

export interface BlockCaretLocation {
  blockId: string;
  /** Path relative to the block body's content root, matching core content. */
  nodePath: number[];
  /** Unicode code point offset inside the text leaf. */
  offset: number;
}

interface CaretMatch {
  nodePath: number[];
  offset: number;
}

function findCaretInBody(
  node: PMNode,
  path: number[],
  nodeStart: number,
  target: number,
  best: { inside: CaretMatch | null; left: CaretMatch | null; right: CaretMatch | null },
): void {
  if (node.type === 'text') {
    const text = node.text ?? '';
    const end = nodeStart + text.length;
    if (text.length === 0) return;
    if (target > nodeStart && target < end) {
      if (best.inside === null) {
        best.inside = { nodePath: [...path], offset: codePointOffset(text, target - nodeStart) };
      }
      return;
    }
    if (target === end && best.left === null) {
      best.left = { nodePath: [...path], offset: codePointOffset(text, text.length) };
      return;
    }
    if (target === nodeStart && best.right === null) {
      best.right = { nodePath: [...path], offset: 0 };
    }
    return;
  }

  let childOffset = nodeStart + 1;
  for (const [index, child] of (node.content ?? []).entries()) {
    findCaretInBody(child, [...path, index], childOffset, target, best);
    childOffset += nodeSize(child);
  }
}

/**
 * Map a collapsed ProseMirror selection to the canonical text leaf and code
 * point offset used by `block.split`. Returns null for a non-empty selection,
 * a caret outside a block, or a caret not adjacent to a text leaf (an empty
 * block, a formula/image node, or the gap before the first paragraph).
 */
export function blockCaretLocation(editor: Editor): BlockCaretLocation | null {
  const selection = editor.state.selection;
  if (!selection.empty || selection instanceof NodeSelection) return null;
  const $from = editor.state.doc.resolve(selection.from);
  let bodyDepth = -1;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'blockBody') {
      bodyDepth = depth;
      break;
    }
  }
  if (bodyDepth < 0) return null;
  const blockNode = $from.node(bodyDepth - 1);
  const blockId = blockNode.attrs['blockId'];
  if (blockNode.type.name !== 'branchBlock' || typeof blockId !== 'string') return null;
  const body = $from.node(bodyDepth);
  const bodyStart = $from.before(bodyDepth) + 1;
  const bodyOffset = selection.from - bodyStart;
  const best = {
    inside: null as CaretMatch | null,
    left: null as CaretMatch | null,
    right: null as CaretMatch | null,
  };
  // The body node is not part of its own content coordinate space: starting at
  // -1 makes its first child occupy offset 0, matching ProseMirror positions
  // relative to `bodyStart` above.
  findCaretInBody(body.toJSON() as PMNode, [], -1, bodyOffset, best);
  const match = best.inside ?? best.left ?? best.right;
  if (match === null || match.nodePath.length === 0) return null;
  return { blockId, nodePath: match.nodePath, offset: match.offset };
}
