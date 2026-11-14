import { getSchema } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { EditorState, Selection, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from '../src/renderer/src/editor/extensions';
import { formulaKindTransaction } from '../src/renderer/src/lib/formula-convert';
import { formulaPasteTransaction } from '../src/renderer/src/lib/formula-paste';

const schema = getSchema(createEditorExtensions());

function editorDoc(children: PMNode[]): PMNode {
  return schema.node('doc', null, [
    schema.node('chapter', { chapterId: 'c1', title: 'One' }, [
      schema.node('branchBlock', { blockId: 'b1' }, [
        schema.node('blockBody', { blockId: 'b1' }, children),
      ]),
    ]),
  ]);
}

function state(doc: PMNode, selection?: EditorState['selection']): EditorState {
  return EditorState.create({
    schema,
    doc,
    selection: selection ?? Selection.atStart(doc),
  });
}

function blockBody(doc: PMNode): PMNode {
  return doc.child(0).child(0).child(0);
}

function findPos(doc: PMNode, type: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === type) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`missing ${type}`);
  return found;
}

function textPos(doc: PMNode, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.isText && node.text === text) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`missing text ${text}`);
  return found;
}

function inlineFormula(latex: string, anchorIds?: string[]): PMNode {
  return schema.node('inlineMath', {
    latex,
    ...(anchorIds === undefined ? {} : { anchorIds }),
  });
}

function blockFormula(latex: string): PMNode {
  return schema.node('blockMath', { latex });
}

describe('formula kind conversion', () => {
  it('turns an inline formula into one block between the surrounding text', () => {
    const paragraph = schema.node('paragraph', null, [
      schema.text('Av = '),
      inlineFormula('\\lambda v', ['a1']),
      schema.text(' v'),
    ]);
    const doc = editorDoc([paragraph]);
    const pos = findPos(doc, 'inlineMath');
    const before = state(doc);
    const plan = formulaKindTransaction(before, pos, 'blockMath', '\\lambda v');
    expect(plan).not.toBeNull();
    expect(plan?.tr.steps.length).toBe(1);

    const next = before.apply(plan!.tr);
    const body = blockBody(next.doc);
    expect(body.childCount).toBe(3);
    expect(body.child(0).type.name).toBe('paragraph');
    expect(body.child(0).textContent).toBe('Av = ');
    expect(body.child(1).type.name).toBe('blockMath');
    expect(body.child(1).attrs['latex']).toBe('\\lambda v');
    expect(body.child(1).attrs['anchorIds']).toEqual(['a1']);
    expect(body.child(2).type.name).toBe('paragraph');
    expect(body.child(2).textContent).toBe(' v');
    expect(plan?.pos).toBe(next.selection.from);
    expect(next.doc.nodeAt(plan!.pos)?.type.name).toBe('blockMath');
  });

  it('replaces a formula-only paragraph with the block and no empty paragraph', () => {
    const doc = editorDoc([schema.node('paragraph', null, [inlineFormula('x^2')])]);
    const pos = findPos(doc, 'inlineMath');
    const before = state(doc);
    const plan = formulaKindTransaction(before, pos, 'blockMath', 'x^2');
    const body = blockBody(before.apply(plan!.tr).doc);
    expect(body.childCount).toBe(1);
    expect(body.child(0).type.name).toBe('blockMath');
  });

  it('turns a block formula into a paragraph with the inline atom', () => {
    const doc = editorDoc([
      schema.node('paragraph', null, [schema.text('before')]),
      blockFormula('E=mc^2'),
      schema.node('paragraph', null, [schema.text('after')]),
    ]);
    const pos = findPos(doc, 'blockMath');
    const before = state(doc);
    const plan = formulaKindTransaction(before, pos, 'inlineMath', 'E=mc^2');
    expect(plan).not.toBeNull();
    expect(plan?.tr.steps.length).toBe(1);

    const next = before.apply(plan!.tr);
    const body = blockBody(next.doc);
    expect(body.childCount).toBe(3);
    expect(body.child(0).textContent).toBe('before');
    expect(body.child(1).type.name).toBe('paragraph');
    expect(body.child(1).childCount).toBe(1);
    expect(body.child(1).child(0).type.name).toBe('inlineMath');
    expect(body.child(1).child(0).attrs['latex']).toBe('E=mc^2');
    expect(body.child(2).textContent).toBe('after');
    expect(next.doc.nodeAt(plan!.pos)?.type.name).toBe('inlineMath');
  });

  it('uses the unsaved draft source and rejects a no-op or foreign node', () => {
    const doc = editorDoc([schema.node('paragraph', null, [inlineFormula('old')])]);
    const pos = findPos(doc, 'inlineMath');
    const before = state(doc);
    const plan = formulaKindTransaction(before, pos, 'blockMath', 'draft');
    expect(blockBody(before.apply(plan!.tr).doc).child(0).attrs['latex']).toBe('draft');
    expect(formulaKindTransaction(before, pos, 'inlineMath', 'old')).toBeNull();
    const paragraphPos = findPos(doc, 'paragraph');
    expect(formulaKindTransaction(before, paragraphPos, 'blockMath', 'x')).toBeNull();
  });
});

describe('formula paste', () => {
  it('inserts an inline formula at the caret inside a paragraph', () => {
    const doc = editorDoc([schema.node('paragraph', null, [schema.text('ab')])]);
    const end = textPos(doc, 'ab') + 2;
    const before = state(doc, Selection.near(doc.resolve(end)));
    const tr = formulaPasteTransaction(before, '$x^2$');
    expect(tr).not.toBeNull();
    const next = before.apply(tr!);
    const body = blockBody(next.doc);
    expect(body.childCount).toBe(1);
    const inline = body.child(0).child(1);
    expect(inline.type.name).toBe('inlineMath');
    expect(inline.attrs['latex']).toBe('x^2');
  });

  it('replaces the selection with an inline formula', () => {
    const doc = editorDoc([schema.node('paragraph', null, [schema.text('abcdef')])]);
    const from = textPos(doc, 'abcdef') + 1;
    const to = from + 4;
    const selected = state(doc, TextSelection.create(doc, from, to));
    const tr = formulaPasteTransaction(selected, '$y$');
    const next = selected.apply(tr!);
    expect(blockBody(next.doc).child(0).textContent).toBe('af');
    expect(blockBody(next.doc).child(0).child(1).type.name).toBe('inlineMath');
  });

  it('replaces an empty paragraph with a block formula', () => {
    const doc = editorDoc([schema.node('paragraph', null)]);
    const empty = findPos(doc, 'paragraph');
    const before = state(doc, Selection.near(doc.resolve(empty + 1)));
    const tr = formulaPasteTransaction(before, '$$E=mc^2$$');
    const next = before.apply(tr!);
    const body = blockBody(next.doc);
    expect(body.childCount).toBe(1);
    expect(body.child(0).type.name).toBe('blockMath');
    expect(body.child(0).attrs['latex']).toBe('E=mc^2');
  });

  it('inserts a block formula after a non-empty paragraph with a paragraph below', () => {
    const doc = editorDoc([schema.node('paragraph', null, [schema.text('hi')])]);
    const end = textPos(doc, 'hi') + 2;
    const before = state(doc, Selection.near(doc.resolve(end)));
    const tr = formulaPasteTransaction(before, '$$\\frac{1}{2}$$');
    const body = blockBody(before.apply(tr!).doc);
    expect(body.childCount).toBe(3);
    expect(body.child(0).textContent).toBe('hi');
    expect(body.child(1).type.name).toBe('blockMath');
    expect(body.child(2).type.name).toBe('paragraph');
    expect(body.child(2).textContent).toBe('');
  });

  it('keeps plain text, code blocks and mid-paragraph block pastes native', () => {
    const doc = editorDoc([schema.node('paragraph', null, [schema.text('ab')])]);
    const empty = findPos(doc, 'paragraph');
    const before = state(doc, Selection.near(doc.resolve(empty + 1)));
    expect(formulaPasteTransaction(before, 'plain text')).toBeNull();
    expect(formulaPasteTransaction(before, '$ x$')).toBeNull();

    const codeDoc = editorDoc([schema.node('codeBlock', null, [schema.text('const x = 1')])]);
    const codePos = textPos(codeDoc, 'const x = 1') + 3;
    const codeState = state(codeDoc, Selection.near(codeDoc.resolve(codePos)));
    expect(formulaPasteTransaction(codeState, '$x$')).toBeNull();

    const mid = state(doc, Selection.near(doc.resolve(empty + 2)));
    expect(formulaPasteTransaction(mid, '$$x$$')).toBeNull();
  });
});
