import { getSchema } from '@tiptap/core';
import { closeHistory, history, undo, undoDepth } from '@tiptap/pm/history';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import type { ContentBlock, Document } from '@noteforest/core';
import { describe, expect, it } from 'vitest';
import { buildEditorDocument } from '../src/renderer/src/lib/adapter';
import { createEditorExtensions } from '../src/renderer/src/editor/extensions';
import {
  captureTextHistory,
  createBlockPositionMapper,
  mapHistorySteps,
} from '../src/renderer/src/state/text-history';

const editorSchema = getSchema(createEditorExtensions());

function block(id: string, text: string): ContentBlock {
  return {
    id,
    content: { type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
  };
}

function fixture(): Document {
  return {
    schemaVersion: 1,
    id: 'doc',
    title: 'Text history',
    createdAt: '2026-11-06T10:00:00.000Z',
    updatedAt: '2026-11-06T10:00:00.000Z',
    revision: 1,
    pageSetup: {
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    },
    manualBreakBeforeBlockIds: [],
    chapters: [{ id: 'c1', title: 'One', topLevelBlockIds: ['A'] }],
    blocks: {
      A: block('A', 'Parent'),
      B: block('B', 'Short'),
      C: block('C', 'Long'),
    },
    anchors: {},
    branches: {
      ab: {
        id: 'ab',
        source: { blockId: 'A' },
        targetBlockId: 'B',
        role: 'primary',
        order: 'a',
      },
      ac: {
        id: 'ac',
        source: { blockId: 'A' },
        targetBlockId: 'C',
        role: 'primary',
        order: 'b',
      },
    },
    assets: {},
    annotations: [],
  };
}

function editorDoc(document: Document, below: ReadonlySet<string>): ProseNode {
  return editorSchema.nodeFromJSON(buildEditorDocument(document, new Set(), below));
}

/** Insert at the end of the first text node inside one block body. */
function endOfBlock(doc: ProseNode, blockId: string): number {
  let position: number | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name !== 'blockBody' || node.attrs['blockId'] !== blockId) return true;
    node.descendants((child, childPos) => {
      if (position !== null) return false;
      if (child.isText) {
        position = pos + 1 + childPos + child.nodeSize;
        return false;
      }
      return true;
    });
    return false;
  });
  if (position === null) throw new Error(`No text in block ${blockId}`);
  return position;
}

function applyText(
  state: EditorState,
  blockId: string,
  text: string,
  close: boolean,
): EditorState {
  const transaction = state.tr.insertText(text, endOfBlock(state.doc, blockId));
  if (close) closeHistory(transaction);
  return state.apply(transaction);
}

function replay(
  baseline: ProseNode,
  events: ReturnType<typeof captureTextHistory>['events'],
): EditorState {
  let state = EditorState.create({ doc: baseline, plugins: [history()] });
  for (const event of events) {
    const mapping = createBlockPositionMapper(event.before, state.doc);
    const steps = mapHistorySteps(event.steps, mapping);
    const transaction = state.tr;
    for (const step of steps) {
      expect(transaction.maybeStep(step).failed).toBe(null);
    }
    closeHistory(transaction);
    state = state.apply(transaction);
  }
  return state;
}

describe('text history across a view-only placement rebuild', () => {
  it('captures events from the oldest doc and replays the final doc exactly', () => {
    const document = fixture();
    const oldDoc = editorDoc(document, new Set());
    const state = applyText(
      applyText(EditorState.create({ doc: oldDoc, plugins: [history()] }), 'B', ' one', true),
      'C',
      ' two',
      true,
    );

    const captured = captureTextHistory(state);
    expect(captured.events).toHaveLength(2);
    expect(captured.baseline.textContent).not.toContain('one');
    expect(captured.baseline.textContent).not.toContain('two');
    expect(captured.final.eq(state.doc)).toBe(true);
    expect(undoDepth(state)).toBe(2);

    // Replaying keeps one undo entry per captured event, in order, even when
    // one of the edited blocks moves into the below lane.
    const rebuilt = replay(editorDoc(document, new Set(['C'])), captured.events);
    expect(rebuilt.doc.textContent).toContain('Short one');
    expect(rebuilt.doc.textContent).toContain('Long two');
    expect(undoDepth(rebuilt)).toBe(2);
    expect(rebuilt.doc.childCount).toBe(state.doc.childCount);

    let firstUndo = rebuilt;
    undo(firstUndo, (transaction) => {
      firstUndo = firstUndo.apply(transaction);
    });
    expect(firstUndo.doc.textContent).toContain('Short one');
    expect(firstUndo.doc.textContent).not.toContain('Long two');
    expect(firstUndo.doc.childCount).toBe(state.doc.childCount);

    let secondUndo = firstUndo;
    undo(secondUndo, (transaction) => {
      secondUndo = secondUndo.apply(transaction);
    });
    expect(secondUndo.doc.textContent).not.toContain('Short one');
    expect(secondUndo.doc.childCount).toBe(state.doc.childCount);
    expect(undoDepth(secondUndo)).toBe(0);
  });

  it('replays a text edit from a block that moves from right to below', () => {
    const document = fixture();
    const oldDoc = editorDoc(document, new Set());
    const state = applyText(
      EditorState.create({ doc: oldDoc, plugins: [history()] }),
      'C',
      ' moved-edit',
      true,
    );
    const captured = captureTextHistory(state);
    expect(captured.events).toHaveLength(1);

    // C moves to the below lane, so every old position outside C also shifts.
    const projected = editorDoc(document, new Set(['C']));
    const rebuilt = replay(projected, captured.events);

    expect(rebuilt.doc.textContent).toContain('Long moved-edit');
    expect(rebuilt.doc.textContent).toContain('Short');
    expect(undoDepth(rebuilt)).toBe(1);
    rebuilt.doc.check();

    // Undo restores the pre-edit content without touching any block count.
    let undone = rebuilt;
    expect(
      undo(undone, (transaction) => {
        undone = undone.apply(transaction);
      }),
    ).toBe(true);
    expect(undone.doc.textContent).not.toContain('moved-edit');
    expect(undone.doc.textContent).toContain('Long');
  });

  it('maps a text edit in an unmoved block while another block moves below', () => {
    const document = fixture();
    const oldDoc = editorDoc(document, new Set());
    const state = applyText(
      EditorState.create({ doc: oldDoc, plugins: [history()] }),
      'B',
      ' short-edit',
      true,
    );
    const captured = captureTextHistory(state);

    const rebuilt = replay(editorDoc(document, new Set(['C'])), captured.events);
    expect(rebuilt.doc.textContent).toContain('Short short-edit');
    expect(undoDepth(rebuilt)).toBe(1);
    rebuilt.doc.check();
  });
});
