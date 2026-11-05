/**
 * Convert an editor text selection into a platform-neutral core text binding.
 *
 * ProseMirror positions are UTF-16 code-unit offsets; the canonical binding is
 * Unicode code-point offsets inside text nodes. Only the editor adapter knows
 * PM positions, so this module is the single bridge used by the selection
 * toolbar and the keymap. It never mutates content and never applies a local
 * mark: the structural command applies the canonical binding.
 */

import type { AnchorBinding } from '@noteforest/core';
import type { Editor } from '@tiptap/core';
import type { PMNode } from './adapter';

export type TextAnchorBinding = Extract<AnchorBinding, { kind: 'text' }>;

export interface TextSelectionAnchor {
  blockId: string;
  binding: TextAnchorBinding;
}

export type TextSelectionFailure =
  | 'empty'
  | 'crosses-block'
  | 'crosses-barrier'
  | 'crosses-cell'
  | 'no-text'
  | 'no-block';

export type TextSelectionResult =
  | { ok: true; selection: TextSelectionAnchor }
  | { ok: false; reason: TextSelectionFailure; message: string };

const LEAF_TYPES = new Set(['image', 'hardBreak', 'inlineMath', 'horizontalRule']);
const BLOCK_ATOMIC_TYPES = new Set(['mathBlock', 'codeBlock', 'image', 'horizontalRule']);
const TABLE_CELL_TYPES = new Set(['tableCell', 'tableHeader']);

const FAILURE_MESSAGES: Record<TextSelectionFailure, string> = {
  empty: 'Select text to branch from.',
  'crosses-block': 'Anchors work within one block.',
  'crosses-barrier': 'Anchors cannot cross a display math, image, or code block.',
  'crosses-cell': 'Anchors work within one table cell.',
  'no-text': 'Select text (not only a formula or image) to branch from.',
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
  return { ok: true, selection: { blockId, binding: mapped.binding } };
}
