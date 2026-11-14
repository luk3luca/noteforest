import { getSchema } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { EditorState, Selection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from '../src/renderer/src/editor/extensions';
import { paragraphAroundTableTransaction } from '../src/renderer/src/editor/table-commands';

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

function paragraph(text?: string): PMNode {
  return schema.node('paragraph', null, text === undefined ? undefined : [schema.text(text)]);
}

function table(): PMNode {
  return schema.node('table', null, [
    schema.node('tableRow', null, [
      schema.node('tableCell', null, [paragraph('a')]),
      schema.node('tableCell', null, [paragraph('b')]),
    ]),
    schema.node('tableRow', null, [
      schema.node('tableCell', null, [paragraph('c')]),
      schema.node('tableCell', null, [paragraph('d')]),
    ]),
  ]);
}

function blockBody(doc: PMNode): PMNode {
  return doc.child(0).child(0).child(0);
}

function cellCaret(doc: PMNode): EditorState['selection'] {
  let inside = -1;
  doc.descendants((node, pos) => {
    if (inside >= 0) return false;
    if (node.type.name === 'tableCell') {
      inside = pos + 3;
      return false;
    }
    return true;
  });
  if (inside < 0) throw new Error('missing table cell');
  return Selection.near(doc.resolve(inside));
}

describe('table paragraph actions', () => {
  it('inserts a paragraph before the table and puts the caret in it', () => {
    const doc = editorDoc([paragraph('intro'), table()]);
    const before = EditorState.create({ schema, doc, selection: cellCaret(doc) });
    const plan = paragraphAroundTableTransaction(before, 'before');
    expect(plan).not.toBeNull();
    expect(plan?.tr.steps.length).toBe(1);

    const next = before.apply(plan!.tr);
    const body = blockBody(next.doc);
    expect(body.childCount).toBe(3);
    expect(body.child(0).textContent).toBe('intro');
    expect(body.child(1).type.name).toBe('paragraph');
    expect(body.child(1).textContent).toBe('');
    expect(body.child(2).type.name).toBe('table');
    expect(next.selection.$from.parent.type.name).toBe('paragraph');
    expect(next.selection.$from.parentOffset).toBe(0);
    expect(plan?.pos).toBe(next.selection.from);
  });

  it('inserts a paragraph after the table even when one already exists', () => {
    const doc = editorDoc([table(), paragraph('out')]);
    const before = EditorState.create({ schema, doc, selection: cellCaret(doc) });
    const plan = paragraphAroundTableTransaction(before, 'after');
    const body = blockBody(before.apply(plan!.tr).doc);
    expect(body.childCount).toBe(3);
    expect(body.child(0).type.name).toBe('table');
    expect(body.child(1).type.name).toBe('paragraph');
    expect(body.child(1).textContent).toBe('');
    expect(body.child(2).textContent).toBe('out');
  });

  it('is a no-op outside a table', () => {
    const doc = editorDoc([paragraph('no table')]);
    let pos = -1;
    doc.descendants((node, position) => {
      if (pos >= 0) return false;
      if (node.isText) {
        pos = position;
        return false;
      }
      return true;
    });
    const before = EditorState.create({ schema, doc, selection: Selection.near(doc.resolve(pos)) });
    expect(paragraphAroundTableTransaction(before, 'before')).toBeNull();
    expect(paragraphAroundTableTransaction(before, 'after')).toBeNull();
  });
});
