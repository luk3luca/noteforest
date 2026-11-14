import { createChainableState, getSchema, type SingleCommands } from '@tiptap/core';
import type { Node as ProseNode, NodeType } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from '../src/renderer/src/editor/extensions';
import {
  PAREN_ORDERED_LIST_INPUT,
  ParenOrderedListInput,
  parenOrderedListRule,
  parenOrderedListStart,
} from '../src/renderer/src/editor/lists';

const schema = getSchema(createEditorExtensions());

function orderedListType(): NodeType {
  const type = schema.nodes['orderedList'];
  if (type === undefined) throw new Error('the editor schema has no orderedList node');
  return type;
}

/**
 * A document with one block whose body is the given paragraph text, plus the
 * document position where that text ends (where the input rule fires).
 */
function paragraphEndingWith(text: string): { state: EditorState; end: number } {
  const doc = schema.node('doc', null, [
    schema.node('chapter', { chapterId: 'c1', title: 'One' }, [
      schema.node('branchBlock', { blockId: 'A' }, [
        schema.node('blockBody', { blockId: 'A' }, [
          text.length === 0
            ? schema.node('paragraph', null)
            : schema.node('paragraph', null, [schema.text(text)]),
        ]),
      ]),
    ]),
  ]);
  let end: number | null = null;
  doc.descendants((node, position) => {
    if (end !== null) return false;
    if (node.type.name !== 'paragraph') return true;
    end = position + 1 + node.content.size;
    return false;
  });
  if (end === null) throw new Error('fixture has no paragraph');
  return { state: EditorState.create({ doc }), end };
}

interface MarkerResult {
  list: ProseNode | null;
  paragraphText: string;
}

/**
 * Runs the real input-rule handler over `typed` (already in the document, as
 * TipTap does after inserting the typed character) and returns the wrapped
 * list, if any. The rule never reads `commands`/`chain`/`can` (it keeps neither
 * marks nor attributes), so only the state, range, and match are meaningful.
 */
function applyMarker(typed: string): MarkerResult {
  const { state, end } = paragraphEndingWith(typed);
  const match = PAREN_ORDERED_LIST_INPUT.exec(typed);
  if (match === null) throw new Error(`${JSON.stringify(typed)} is not a paren marker`);
  const transaction = state.tr;
  const chainable = createChainableState({ state, transaction });
  parenOrderedListRule(orderedListType()).handler({
    state: chainable,
    range: { from: end - typed.length, to: end },
    match,
    commands: {} as SingleCommands,
    chain: () => {
      throw new Error('the paren ordered-list rule does not use the command chain');
    },
    can: () => {
      throw new Error('the paren ordered-list rule does not use the command chain');
    },
  });
  let list: ProseNode | null = null;
  transaction.doc.descendants((node) => {
    if (list !== null) return false;
    if (node.type.name !== 'orderedList') return true;
    list = node;
    return false;
  });
  let paragraphText = '';
  transaction.doc.descendants((node) => {
    if (node.type.name !== 'paragraph') return true;
    paragraphText = node.textContent;
    return false;
  });
  return { list, paragraphText };
}

describe('paren ordered-list input rule', () => {
  it('matches a number and a paren at the start of the text block', () => {
    expect(parenOrderedListStart('1) ')).toBe(1);
    expect(parenOrderedListStart('3) ')).toBe(3);
    expect(parenOrderedListStart('12) ')).toBe(12);
    expect(parenOrderedListStart('007) ')).toBe(7);
    // An ordered list starts at 1 or later; 0 is clamped, never negative.
    expect(parenOrderedListStart('0) ')).toBe(1);
  });

  it('does not match prose, the dot marker, or an incomplete marker', () => {
    // The native StarterKit rule owns the dot form; the two never overlap.
    expect(parenOrderedListStart('1. ')).toBeNull();
    expect(parenOrderedListStart('1)')).toBeNull();
    expect(parenOrderedListStart('1)x ')).toBeNull();
    expect(parenOrderedListStart('1)  ')).toBeNull();
    expect(parenOrderedListStart('(1) ')).toBeNull();
    expect(parenOrderedListStart('see 1) ')).toBeNull();
    expect(parenOrderedListStart('a) ')).toBeNull();
    expect(parenOrderedListStart('')).toBeNull();
  });

  it('wraps the text block in an ordered list with the typed start', () => {
    const first = applyMarker('1) ');
    expect(first.list?.attrs['start']).toBe(1);
    expect(first.paragraphText).toBe('');

    const third = applyMarker('3) ');
    expect(third.list?.attrs['start']).toBe(3);
    expect(third.paragraphText).toBe('');
    expect(third.list?.childCount).toBe(1);
    expect(third.list?.child(0).type.name).toBe('listItem');
  });

  it('clamps a 0) marker to start 1', () => {
    expect(applyMarker('0) ').list?.attrs['start']).toBe(1);
  });

  it('is registered once beside the native ordered-list rule', () => {
    const extensions = createEditorExtensions();
    const registered = extensions.filter(
      (extension) => extension.name === ParenOrderedListInput.name,
    );
    expect(registered).toHaveLength(1);
    expect(PAREN_ORDERED_LIST_INPUT.source).toBe('^(\\d+)\\)\\s$');
  });
});
