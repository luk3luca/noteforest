import { getSchema } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from '../src/renderer/src/editor/extensions';
import {
  FLAT_HEADING_MAX_LEVEL,
  headingLevel,
  headingLevelTransaction,
  headingMarkerAt,
  headingMarkerText,
  loweredHeadingLevel,
  NOTE_HEADING_MAX_LEVEL,
  raisedHeadingLevel,
} from '../src/renderer/src/lib/heading-marker';

const schema = getSchema(createEditorExtensions());

function heading(level: number, text: string): PMNode {
  return schema.node('heading', { level }, text.length === 0 ? null : [schema.text(text)]);
}

function paragraph(text: string): PMNode {
  return schema.node('paragraph', null, text.length === 0 ? null : [schema.text(text)]);
}

function stateWith(node: PMNode, offset = 0, to?: number): EditorState {
  const doc = schema.node('doc', null, [node]);
  // The node's content starts at position 1 (doc → node → content).
  const from = 1 + offset;
  const to0 = to === undefined ? from : 1 + to;
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, from, to0),
  });
}

describe('heading level helpers', () => {
  it('reads the level of a heading only', () => {
    expect(headingLevel(heading(2, 'Title'))).toBe(2);
    expect(headingLevel(paragraph('text'))).toBe(0);
  });

  it('caps the raise and lowers to a paragraph', () => {
    expect(raisedHeadingLevel(1, NOTE_HEADING_MAX_LEVEL)).toBe(2);
    expect(raisedHeadingLevel(2, NOTE_HEADING_MAX_LEVEL)).toBe(3);
    expect(raisedHeadingLevel(3, NOTE_HEADING_MAX_LEVEL)).toBeNull();
    expect(raisedHeadingLevel(3, FLAT_HEADING_MAX_LEVEL)).toBe(4);
    expect(raisedHeadingLevel(6, FLAT_HEADING_MAX_LEVEL)).toBeNull();
    expect(loweredHeadingLevel(3)).toBe(2);
    expect(loweredHeadingLevel(1)).toBe(0);
    expect(loweredHeadingLevel(0)).toBeNull();
  });

  it('writes one marker per level and none for a paragraph', () => {
    expect(headingMarkerText(1)).toBe('#');
    expect(headingMarkerText(3)).toBe('###');
    expect(headingMarkerText(6)).toBe('######');
    expect(headingMarkerText(0)).toBe('');
  });
});

describe('heading marker visibility', () => {
  it('shows the marker for an editable caret inside a heading', () => {
    const state = stateWith(heading(2, 'Title'), 1);
    expect(headingMarkerAt(state, { editable: true })).toEqual({
      pos: 1,
      level: 2,
      text: '##',
    });
  });

  it('hides it outside the heading, with a range, or when not editable', () => {
    const inHeading = stateWith(heading(2, 'Title'), 1);
    expect(headingMarkerAt(inHeading, { editable: false })).toBeNull();
    expect(headingMarkerAt(stateWith(paragraph('text'), 1), { editable: true })).toBeNull();
    expect(headingMarkerAt(stateWith(heading(2, 'Title'), 0, 3), { editable: true })).toBeNull();
  });
});

describe('heading level transaction', () => {
  it('raises H1→H2 with one transaction and no document text', () => {
    const state = stateWith(heading(1, 'Title'));
    const before = state.doc.textContent;
    const result = headingLevelTransaction(state, 'raise', NOTE_HEADING_MAX_LEVEL);
    expect(result).not.toBeNull();
    if (result === null || result === 'consume') throw new Error('expected a transaction');
    expect(result.level).toBe(2);
    expect(result.transaction.steps.length).toBe(1);
    const next = state.apply(result.transaction);
    expect(next.doc.child(0).type.name).toBe('heading');
    expect(next.doc.child(0).attrs['level']).toBe(2);
    expect(next.doc.textContent).toBe(before);
    expect(before).toBe('Title');
  });

  it('consumes the fourth # at the note cap', () => {
    expect(
      headingLevelTransaction(
        stateWith(heading(3, 'Title')),
        'raise',
        NOTE_HEADING_MAX_LEVEL,
      ),
    ).toBe('consume');
  });

  it('raises to H4 in the guest schema', () => {
    const result = headingLevelTransaction(
      stateWith(heading(3, 'Title')),
      'raise',
      FLAT_HEADING_MAX_LEVEL,
    );
    if (result === null || result === 'consume') throw new Error('expected a transaction');
    expect(stateWith(heading(3, 'Title')).apply(result.transaction).doc.child(0).attrs['level']).toBe(
      4,
    );
  });

  it('lowers H3→H2→H1→paragraph, one transaction each', () => {
    const h3 = stateWith(heading(3, 'Title'));
    const toH2 = headingLevelTransaction(h3, 'lower', NOTE_HEADING_MAX_LEVEL);
    if (toH2 === null || toH2 === 'consume') throw new Error('expected a transaction');
    expect(toH2.level).toBe(2);
    const h2 = h3.apply(toH2.transaction);
    expect(h2.doc.child(0).attrs['level']).toBe(2);

    const toH1 = headingLevelTransaction(h2, 'lower', NOTE_HEADING_MAX_LEVEL);
    if (toH1 === null || toH1 === 'consume') throw new Error('expected a transaction');
    expect(toH1.level).toBe(1);
    const h1 = h2.apply(toH1.transaction);

    const toParagraph = headingLevelTransaction(h1, 'lower', NOTE_HEADING_MAX_LEVEL);
    if (toParagraph === null || toParagraph === 'consume') {
      throw new Error('expected a transaction');
    }
    expect(toParagraph.level).toBe(0);
    const paragraphState = h1.apply(toParagraph.transaction);
    expect(paragraphState.doc.child(0).type.name).toBe('paragraph');
    expect(paragraphState.doc.textContent).toBe('Title');
    expect(toParagraph.transaction.steps.length).toBe(1);
  });

  it('does nothing away from the heading start or outside a heading', () => {
    expect(
      headingLevelTransaction(
        stateWith(heading(2, 'Title'), 2),
        'raise',
        NOTE_HEADING_MAX_LEVEL,
      ),
    ).toBeNull();
    expect(
      headingLevelTransaction(
        stateWith(paragraph('text'), 0),
        'lower',
        NOTE_HEADING_MAX_LEVEL,
      ),
    ).toBeNull();
  });
});
