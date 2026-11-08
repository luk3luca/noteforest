import { getSchema } from '@tiptap/core';
import { closeHistory, history, undo, undoDepth } from '@tiptap/pm/history';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { EditorState, type Transaction } from '@tiptap/pm/state';
import type { ContentBlock, Document } from '@noteforest/core';
import { describe, expect, it, vi } from 'vitest';
import { createEditorExtensions } from '../src/renderer/src/editor/extensions';
import { buildEditorDocument } from '../src/renderer/src/lib/adapter';
import { DocumentRuntime } from '../src/renderer/src/state/runtime';
import {
  EditorProjection,
  auditBlockIds,
  extractBlockBodies,
  projectWithEditorBodies,
  replaceEditorDocument,
  replayTextHistory,
  type EditorProjectionHost,
  type EditorSurface,
} from '../src/renderer/src/state/editor-projection';
import type { OpenDocumentSnapshot } from '../src/shared/api';

const editorSchema = getSchema(createEditorExtensions());

function block(id: string, text: string): ContentBlock {
  return {
    id,
    content: { type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
  };
}

function fixture(): Document {
  return {
    schemaVersion: 2,
    id: 'doc',
    title: 'Editor projection',
    createdAt: '2026-11-06T10:00:00.000Z',
    updatedAt: '2026-11-06T10:00:00.000Z',
    revision: 1,
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

/** Canonical document without C, for reconcile/mismatch cases. */
function withoutC(document: Document): Document {
  const { ac: _removed, ...branches } = document.branches;
  const { C: _block, ...blocks } = document.blocks;
  return { ...document, blocks, branches };
}

function host(
  document: Document,
  options: { collapsed?: ReadonlySet<string>; selectedBlockId?: string | null } = {},
): EditorProjectionHost {
  return {
    document: () => document,
    collapsed: () => options.collapsed ?? new Set<string>(),
    selectedBlockId: () => options.selectedBlockId ?? null,
    reveal: () => undefined,
  };
}

function projection(
  document: Document,
  options: { collapsed?: ReadonlySet<string>; selectedBlockId?: string | null } = {},
): { target: EditorProjection; notices: string[] } {
  const notices: string[] = [];
  const target = new EditorProjection({
    ...host(document, options),
    setRepairNotice: (message) => {
      notices.push(message);
    },
  });
  return { target, notices };
}

function editorState(json: ReturnType<typeof buildEditorDocument>): EditorState {
  return EditorState.create({
    doc: editorSchema.nodeFromJSON(json),
    plugins: [history()],
  });
}

/**
 * Minimal editor double for projection paths that do not focus. It keeps an
 * EditorState and applies dispatched transactions, which is exactly what
 * replace/reconcile/placement read. TipTap's real editor behaviour is covered
 * by the UI suite; focus is out of scope for this double.
 */
class StateEditor {
  state: EditorState;

  focused = false;

  readonly view: {
    dispatch(transaction: Transaction): void;
    dom: { querySelectorAll(selector: string): never[] };
  };

  constructor(state: EditorState) {
    this.state = state;
    this.view = {
      dispatch: (transaction) => {
        this.state = this.state.apply(transaction);
      },
      dom: { querySelectorAll: () => [] },
    };
  }

  get schema(): EditorState['schema'] {
    return this.state.schema;
  }

  get isFocused(): boolean {
    return this.focused;
  }
}

/** Attach the double; only the members the projection reads are implemented. */
function attachDouble(target: EditorProjection, state: EditorState): StateEditor {
  const editor = new StateEditor(state);
  target.attach(editor as unknown as Parameters<EditorProjection['attach']>[0]);
  return editor;
}

function surfaceFor(state: EditorState): {
  surface: EditorSurface;
  current: () => EditorState;
  transactions: Transaction[];
} {
  let current = state;
  const transactions: Transaction[] = [];
  return {
    surface: {
      state: () => current,
      dispatch: (transaction) => {
        transactions.push(transaction);
        current = current.apply(transaction);
      },
    },
    current: () => current,
    transactions,
  };
}

function findBranch(doc: ProseNode, blockId: string): ProseNode {
  let found: ProseNode | null = null;
  doc.descendants((node) => {
    if (found !== null) return false;
    if (node.type.name === 'branchBlock' && node.attrs['blockId'] === blockId) {
      found = node;
      return false;
    }
    return true;
  });
  if (found === null) throw new Error(`No branchBlock "${blockId}" in the projection.`);
  return found;
}

function childOfType(node: ProseNode, type: string): ProseNode | null {
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (child.type.name === type) return child;
  }
  return null;
}

function branchIds(group: ProseNode | null): string[] {
  const ids: string[] = [];
  group?.forEach((child) => {
    ids.push(String(child.attrs['blockId']));
  });
  return ids;
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

function applyText(state: EditorState, blockId: string, text: string): EditorState {
  const transaction = state.tr.insertText(text, endOfBlock(state.doc, blockId));
  closeHistory(transaction);
  return state.apply(transaction);
}

function chapters(doc: ProseNode): ProseNode[] {
  return doc.content.content.filter((node) => node.type.name === 'chapter');
}

function expectChaptersEqual(actual: ProseNode, expectedJson: ReturnType<typeof buildEditorDocument>): void {
  const expected = editorSchema.nodeFromJSON(expectedJson);
  const actualChapters = chapters(actual);
  const expectedChapters = chapters(expected);
  expect(actualChapters).toHaveLength(expectedChapters.length);
  actualChapters.forEach((node, index) => {
    expect(node.eq(expectedChapters[index] as ProseNode)).toBe(true);
  });
}

describe('editor projection build and extraction', () => {
  it('builds from canonical structure, collapse, and measured placement', () => {
    const document = fixture();
    const { target } = projection(document, { collapsed: new Set(['A']) });

    const initial = editorSchema.nodeFromJSON(target.build());
    expect(initial.firstChild?.type.name).toBe('chapter');
    expect(initial.firstChild?.attrs['chapterId']).toBe('c1');
    const parent = findBranch(initial, 'A');
    expect(parent.attrs['collapsed']).toBe(true);
    expect(childOfType(parent, 'blockBody')?.attrs['collapsed']).toBe(true);
    expect(childOfType(parent, 'calloutLane')).toBeNull();
    expect(branchIds(childOfType(parent, 'branchChildren'))).toEqual(['B', 'C']);

    // A placement change is view-only: it rebuilds the buffer, not canonical.
    const editor = attachDouble(target, editorState(target.build()));
    target.applyChildPlacement(new Set(['C']));
    const rebuilt = editor.state.doc;
    const rebuiltParent = findBranch(rebuilt, 'A');
    const lane = childOfType(rebuiltParent, 'calloutLane');
    expect(lane).not.toBeNull();
    const row = lane?.firstChild;
    expect(row?.attrs['blockId']).toBe('C');
    expect(row?.attrs['belowRow']).toBe(true);
    expect(row?.attrs['rowKind']).toBe('direct');
    expect(branchIds(childOfType(rebuiltParent, 'branchChildren'))).toEqual(['B']);
    // Collapse state survives the placement rebuild.
    expect(findBranch(rebuilt, 'A').attrs['collapsed']).toBe(true);
    expect(document.chapters[0]?.topLevelBlockIds).toEqual(['A']);
    expect(Object.keys(document.branches)).toEqual(['ab', 'ac']);
  });

  it('extracts every block body independently of collapse and placement', () => {
    const document = fixture();
    const { target } = projection(document);
    const baseline = extractBlockBodies(editorSchema.nodeFromJSON(target.build()));

    const { target: placed } = projection(document, { collapsed: new Set(['A']) });
    placed.applyChildPlacement(new Set(['C']));
    const placedBodies = extractBlockBodies(editorSchema.nodeFromJSON(placed.build()));

    expect([...placedBodies.keys()].sort()).toEqual(['A', 'B', 'C']);
    for (const [id, body] of baseline) {
      expect(placedBodies.get(id)?.content).toEqual(body.content);
    }
    expect(baseline.get('B')?.content.children?.[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', text: 'Short' }],
    });
    // No editor attached: the extraction is empty, matching the runtime guard.
    expect(target.extractBodies().size).toBe(0);
  });

  it('projects uncommitted editor text into a placement rebuild', () => {
    const document = fixture();
    const oldProjection = editorSchema.nodeFromJSON(buildEditorDocument(document, new Set()));
    const edited = applyText(editorState(buildEditorDocument(document, new Set())), 'B', ' kept');

    const projected = projectWithEditorBodies(
      document,
      new Set(),
      new Set(['C']),
      edited.doc,
    );
    const rebuilt = editorSchema.nodeFromJSON(projected);
    expect(rebuilt.textContent).toContain('Short kept');
    expect(findBranch(rebuilt, 'C').attrs['belowRow']).toBe(true);
    expect(oldProjection.textContent).not.toContain('kept');
  });
});

describe('editor projection replace', () => {
  it('replaces the buffer without touching the text history', () => {
    const document = fixture();
    const state = applyText(
      editorState(buildEditorDocument(document, new Set())),
      'B',
      ' kept',
    );
    expect(undoDepth(state)).toBe(1);
    const target = editorSchema.nodeFromJSON(
      projectWithEditorBodies(document, new Set(), new Set(['C']), state.doc),
    );
    const harness = surfaceFor(state);
    replaceEditorDocument(harness.surface, target.toJSON());

    expect(undoDepth(harness.current())).toBe(1);
    expect(harness.transactions).toHaveLength(1);
    expect(harness.transactions[0]?.getMeta('addToHistory')).toBe(false);
    expect(harness.transactions[0]?.getMeta('preventUpdate')).toBe(true);
    expect(harness.current().doc.textContent).toContain('Short kept');
    expect(findBranch(harness.current().doc, 'C').attrs['belowRow']).toBe(true);
  });
});

describe('editor projection text history across a placement rebuild', () => {
  it('replays every text event, one undo entry per event, onto the new projection', () => {
    const document = fixture();
    const state = applyText(
      applyText(editorState(buildEditorDocument(document, new Set())), 'B', ' one'),
      'C',
      ' two',
    );
    expect(undoDepth(state)).toBe(2);
    const below = new Set(['C']);
    const expected = projectWithEditorBodies(document, new Set(), below, state.doc);
    const harness = surfaceFor(state);

    replayTextHistory(
      harness.surface,
      (editorDocument) => projectWithEditorBodies(document, new Set(), below, editorDocument),
      expected,
    );

    const rebuilt = harness.current();
    expect(rebuilt.doc.textContent).toContain('Short one');
    expect(rebuilt.doc.textContent).toContain('Long two');
    expect(undoDepth(rebuilt)).toBe(2);
    expectChaptersEqual(rebuilt.doc, expected);
    // C is projected into the below lane, with its text edit preserved.
    expect(findBranch(rebuilt.doc, 'C').attrs['belowRow']).toBe(true);

    let firstUndo = rebuilt;
    expect(
      undo(firstUndo, (transaction) => {
        firstUndo = firstUndo.apply(transaction);
      }),
    ).toBe(true);
    expect(firstUndo.doc.textContent).toContain('Short one');
    expect(firstUndo.doc.textContent).not.toContain('Long two');
    expect(firstUndo.doc.textContent).toContain('Long');

    let secondUndo = firstUndo;
    expect(
      undo(secondUndo, (transaction) => {
        secondUndo = secondUndo.apply(transaction);
      }),
    ).toBe(true);
    expect(secondUndo.doc.textContent).not.toContain('Short one');
    expect(secondUndo.doc.textContent).toContain('Short');
    expect(undoDepth(secondUndo)).toBe(0);
  });

  it('falls back to the rebuilt projection with empty history when a step cannot map', () => {
    const document = fixture();
    const reduced = withoutC(document);
    const state = applyText(
      editorState(buildEditorDocument(document, new Set())),
      'B',
      ' kept',
    );
    const expected = projectWithEditorBodies(reduced, new Set(), new Set(), state.doc);
    const harness = surfaceFor(state);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    replayTextHistory(
      harness.surface,
      (editorDocument) => projectWithEditorBodies(reduced, new Set(), new Set(), editorDocument),
      expected,
    );

    const rebuilt = harness.current();
    // The replay cannot find C in the reduced projection: the rebuild falls
    // back to the expected projection and clears the text stack instead of
    // corrupting the document.
    expect(rebuilt.doc.textContent).toContain('Short kept');
    expect(rebuilt.doc.textContent).not.toContain('Long');
    expect(undoDepth(rebuilt)).toBe(0);
    expectChaptersEqual(rebuilt.doc, expected);
    expect(
      warn.mock.calls.some(([message]) =>
        String(message).includes('text history replay failed'),
      ),
    ).toBe(true);
    warn.mockRestore();
  });
});

describe('editor projection reconcile', () => {
  it('detects extra and missing block IDs against canonical', () => {
    const document = fixture();
    const full = editorSchema.nodeFromJSON(buildEditorDocument(document, new Set()));
    const canonical = new Set(Object.keys(document.blocks));
    expect(auditBlockIds(full, canonical)).toEqual({
      placeholder: false,
      extra: [],
      missing: [],
    });

    const reduced = new Set(['A', 'B']);
    expect(auditBlockIds(full, reduced)).toEqual({
      placeholder: false,
      extra: ['C'],
      missing: [],
    });
    const expanded = new Set(['A', 'B', 'C', 'D']);
    expect(auditBlockIds(full, expanded)).toEqual({
      placeholder: false,
      extra: [],
      missing: ['D'],
    });

    // A placeholder branchBlock is reported separately, never as an ID.
    const json = buildEditorDocument(document, new Set());
    const chapter = json.content?.[0];
    chapter?.content?.push({
      type: 'branchBlock',
      attrs: { blockId: '', depth: 0, topLevel: true },
      content: [
        {
          type: 'blockBody',
          attrs: { blockId: '', depth: 0 },
          content: [{ type: 'paragraph' }],
        },
      ],
    });
    const withPlaceholder = editorSchema.nodeFromJSON(json);
    expect(auditBlockIds(withPlaceholder, canonical)).toEqual({
      placeholder: true,
      extra: [],
      missing: [],
    });
  });

  it('rebuilds and reports a notice when canonical is missing an editor block', () => {
    const document = fixture();
    const { target, notices } = projection(withoutC(document));
    const editor = attachDouble(target, editorState(buildEditorDocument(document, new Set())));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const rebuilt = target.reconcile(null);

    expect(rebuilt).toBe(true);
    expect(notices).toEqual([
      'The editor was rebuilt from the saved document to remove an untracked block.',
    ]);
    expect(editor.state.doc.textContent).not.toContain('Long');
    expect(auditBlockIds(editor.state.doc, new Set(['A', 'B']))).toEqual({
      placeholder: false,
      extra: [],
      missing: [],
    });
    warn.mockRestore();
  });

  it('rebuilds and reports a notice when an editor block is missing', () => {
    const document = fixture();
    const { target, notices } = projection(document);
    const editor = attachDouble(
      target,
      editorState(buildEditorDocument(withoutC(document), new Set())),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const rebuilt = target.reconcile(null);

    expect(rebuilt).toBe(true);
    expect(notices).toEqual([
      'The editor was rebuilt from the saved document to restore blocks removed from the canvas.',
    ]);
    expect(editor.state.doc.textContent).toContain('Long');
    warn.mockRestore();
  });

  it('rebuilds a placeholder block without surfacing a repair notice', () => {
    const document = fixture();
    const { target, notices } = projection(document);
    const json = buildEditorDocument(document, new Set());
    json.content?.[0]?.content?.push({
      type: 'branchBlock',
      attrs: { blockId: '', depth: 0, topLevel: true },
      content: [
        {
          type: 'blockBody',
          attrs: { blockId: '', depth: 0 },
          content: [{ type: 'paragraph' }],
        },
      ],
    });
    const editor = attachDouble(target, editorState(json));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const rebuilt = target.reconcile(null);

    expect(rebuilt).toBe(true);
    expect(notices).toEqual([]);
    expect(auditBlockIds(editor.state.doc, new Set(['A', 'B', 'C']))).toEqual({
      placeholder: false,
      extra: [],
      missing: [],
    });
    warn.mockRestore();
  });

  it('leaves a matching buffer untouched', () => {
    const document = fixture();
    const { target, notices } = projection(document);
    const editor = attachDouble(target, editorState(buildEditorDocument(document, new Set())));
    const before = editor.state.doc;

    expect(target.reconcile(null)).toBe(false);
    expect(notices).toEqual([]);
    expect(editor.state.doc).toBe(before);
  });
});

describe('runtime projection delegation', () => {
  it('reveals collapsed ancestors before focusing, with no editor mounted', () => {
    const document = fixture();
    const snapshot: OpenDocumentSnapshot = {
      packagePath: '/tmp/noteforest-test/library/projection',
      document,
      status: 'editable',
      errors: [],
      warnings: [],
    };
    const runtime = new DocumentRuntime(snapshot, ['A'], null);

    runtime.focusBlock('B');

    expect(runtime.collapsed.has('A')).toBe(false);
    expect(runtime.version).toBe(1);
    runtime.dispose();
  });
});
