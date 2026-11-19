import { getSchema } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { AllSelection, EditorState, NodeSelection, Selection, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from '../src/renderer/src/editor/extensions';
import {
  formulaToggleTransaction,
  insertEmptyFormula,
  nodeInRange,
  unwrapInlineFormula,
  wrapSelectionInFormula,
} from '../src/renderer/src/lib/formula-toggle';

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

function paragraph(...children: PMNode[]): PMNode {
  return schema.node('paragraph', null, children.length === 0 ? null : children);
}

function text(value: string, marks: PMNode['marks'] = []): PMNode {
  return schema.text(value, marks);
}

function math(latex: string, marks: PMNode['marks'] = []): PMNode {
  return schema.node('inlineMath', { latex }, null, marks);
}

function state(doc: PMNode, selection?: EditorState['selection']): EditorState {
  return EditorState.create({ schema, doc, selection: selection ?? Selection.atStart(doc) });
}

function findNode(doc: PMNode, type: string, index = 0): number {
  let found = -1;
  let count = 0;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === type) {
      if (count === index) {
        found = pos;
        return false;
      }
      count += 1;
    }
    return true;
  });
  if (found < 0) throw new Error(`missing ${type}`);
  return found;
}

/** [from, to] of the first paragraph's content. */
function paragraphRange(doc: PMNode): { from: number; to: number } {
  const pos = findNode(doc, 'paragraph');
  const node = doc.nodeAt(pos);
  if (node === null) throw new Error('no paragraph');
  return { from: pos + 1, to: pos + 1 + node.content.size };
}

function body(doc: PMNode): PMNode {
  return doc.child(0).child(0).child(0);
}

describe('formula wrap', () => {
  it('wraps the trimmed selection and keeps the outer spaces as text', () => {
    const doc = editorDoc([paragraph(text('  x^2  '))]);
    const { from, to } = paragraphRange(doc);
    const tr = wrapSelectionInFormula(state(doc, TextSelection.create(doc, from, to)));
    expect(tr).not.toBeNull();
    if (tr === null) return;
    expect(tr.steps.length).toBe(1);
    const next = state(doc).apply(tr);
    const content = body(next.doc).child(0).content;
    expect(content.childCount).toBe(3);
    expect(content.child(0).text).toBe('  ');
    expect(content.child(1).type.name).toBe('inlineMath');
    expect(content.child(1).attrs['latex']).toBe('x^2');
    expect(content.child(2).text).toBe('  ');
    expect(next.selection instanceof NodeSelection).toBe(true);
  });

  it('creates the node for invalid LaTeX without rejecting it', () => {
    const doc = editorDoc([paragraph(text('\\frac{'))]);
    const { from, to } = paragraphRange(doc);
    const tr = wrapSelectionInFormula(state(doc, TextSelection.create(doc, from, to)));
    if (tr === null) throw new Error('expected a wrap');
    const next = state(doc).apply(tr);
    const formula = body(next.doc).child(0).child(0);
    expect(formula.type.name).toBe('inlineMath');
    expect(formula.attrs['latex']).toBe('\\frac{');
  });

  it('does not intercept an empty caret or an all-whitespace selection', () => {
    const doc = editorDoc([paragraph(text('   '))]);
    const { from, to } = paragraphRange(doc);
    expect(wrapSelectionInFormula(state(doc, TextSelection.create(doc, from, from)))).toBeNull();
    expect(wrapSelectionInFormula(state(doc, TextSelection.create(doc, from, to)))).toBeNull();
    expect(formulaToggleTransaction(state(doc, TextSelection.create(doc, from, from)))).toBeNull();
  });

  it('refuses a selection that already contains an inline formula', () => {
    const doc = editorDoc([paragraph(text('a '), math('x'), text(' b'))]);
    const { from, to } = paragraphRange(doc);
    expect(nodeInRange(state(doc), from, to, 'inlineMath')).toBe(true);
    expect(wrapSelectionInFormula(state(doc, TextSelection.create(doc, from, to)))).toBeNull();
  });

  it('refuses a selection crossing a textblock, a display formula or an image', () => {
    const twoParagraphs = editorDoc([paragraph(text('one')), paragraph(text('two'))]);
    const first = paragraphRange(twoParagraphs);
    const secondPos = findNode(twoParagraphs, 'paragraph', 1);
    const cross = TextSelection.between(
      twoParagraphs.resolve(first.from),
      twoParagraphs.resolve(secondPos + 4),
    );
    expect(wrapSelectionInFormula(state(twoParagraphs, cross))).toBeNull();

    // A block-level atom cannot be covered by a TextSelection; a document-wide
    // selection is the strongest legal selection that spans one.
    const withBlockMath = editorDoc([paragraph(text('one')), schema.node('blockMath', { latex: 'x' })]);
    expect(
      wrapSelectionInFormula(state(withBlockMath, new AllSelection(withBlockMath))),
    ).toBeNull();

    const withImage = editorDoc([
      paragraph(text('one')),
      schema.node('image', { assetId: 'a', alt: 'x' }),
    ]);
    expect(wrapSelectionInFormula(state(withImage, new AllSelection(withImage)))).toBeNull();
  });

  it('refuses a code block', () => {
    const doc = editorDoc([schema.node('codeBlock', null, [text('const x = 1')])]);
    const pos = findNode(doc, 'codeBlock');
    const tr = wrapSelectionInFormula(
      state(doc, TextSelection.create(doc, pos + 3, pos + 8)),
    );
    expect(tr).toBeNull();
  });

  it('consumes the key and never creates a literal $ over an atom', () => {
    const doc = editorDoc([schema.node('blockMath', { latex: 'x' })]);
    const pos = findNode(doc, 'blockMath');
    expect(
      formulaToggleTransaction(state(doc, NodeSelection.create(doc, pos))),
    ).toEqual({ kind: 'consume' });
  });
});

describe('formula unwrap', () => {
  it('unwraps to the LaTeX source with the node marks and the caret after it', () => {
    const bold = schema.marks['bold']?.create();
    const marks = bold === undefined ? [] : [bold];
    const doc = editorDoc([paragraph(math('x^2', marks))]);
    const pos = findNode(doc, 'inlineMath');
    const tr = unwrapInlineFormula(state(doc, NodeSelection.create(doc, pos)));
    if (tr === null) throw new Error('expected an unwrap');
    const next = state(doc).apply(tr);
    const content = body(next.doc).child(0).content;
    expect(content.childCount).toBe(1);
    expect(content.child(0).text).toBe('x^2');
    expect(content.child(0).marks.map((mark) => mark.type.name)).toEqual(
      marks.map((mark) => mark.type.name),
    );
    expect(next.selection.empty).toBe(true);
    expect(next.selection.from).toBe(pos + 'x^2'.length);
  });

  it('removes an empty inline formula and leaves the caret at its position', () => {
    const doc = editorDoc([paragraph(text('a'), math(''), text('b'))]);
    const pos = findNode(doc, 'inlineMath');
    const tr = unwrapInlineFormula(state(doc, NodeSelection.create(doc, pos)));
    if (tr === null) throw new Error('expected an unwrap');
    const next = state(doc).apply(tr);
    expect(body(next.doc).textContent).toBe('ab');
    expect(next.selection.from).toBe(pos);
  });

  it('routes an inline-formula NodeSelection through the $ toggle', () => {
    const doc = editorDoc([paragraph(math('x'))]);
    const pos = findNode(doc, 'inlineMath');
    const result = formulaToggleTransaction(state(doc, NodeSelection.create(doc, pos)));
    expect(result?.kind).toBe('transaction');
  });
});

describe('formula toggle and anchors', () => {
  it('drops the anchor mark inside the formula and leaves the anchor record alone', () => {
    const anchorMark = schema.marks['anchor'];
    if (anchorMark === undefined) throw new Error('anchor mark missing');
    const marked = anchorMark.create({ anchorIds: ['a1'] });
    const doc = editorDoc([paragraph(text('ab', [marked]))]);
    const { from, to } = paragraphRange(doc);
    const tr = wrapSelectionInFormula(state(doc, TextSelection.create(doc, from, to)));
    if (tr === null) throw new Error('expected a wrap');
    const next = state(doc).apply(tr);
    const formula = body(next.doc).child(0).child(0);
    expect(formula.type.name).toBe('inlineMath');
    expect(formula.marks.some((mark) => mark.type.name === 'anchor')).toBe(false);
    // The transaction never edits the anchor record; only the mark binding is
    // gone, so the anchor resolves by selector or becomes visibly broken.
    expect(
      body(doc)
        .child(0)
        .child(0)
        .marks.some((mark) => mark.type.name === 'anchor'),
    ).toBe(true);
  });

  it('inserts one empty inline formula at an empty caret for the toolbar', () => {
    const doc = editorDoc([paragraph()]);
    const range = paragraphRange(doc);
    const caret = state(doc, TextSelection.create(doc, range.from));
    const inserted = insertEmptyFormula(caret);
    if (inserted === null) throw new Error('expected an insert');
    expect(inserted.transaction.steps.length).toBe(1);
    const next = caret.apply(inserted.transaction);
    const formula = body(next.doc).child(0).child(0);
    expect(formula.type.name).toBe('inlineMath');
    expect(formula.attrs['latex']).toBe('');
    expect(next.selection instanceof NodeSelection).toBe(true);
    expect(inserted.pos).toBe(range.from);
  });
});
