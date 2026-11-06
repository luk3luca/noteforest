/**
 * Text-history capture and replay across a view-only editor rebuild.
 *
 * ProseMirror history stores position-based steps. A projection rebuild moves
 * whole branch nodes between the right group and the below lane, so those
 * positions no longer match the rebuilt document. The canonical document and
 * the user-visible undo model are untouched: this module captures the text
 * events from the history plugin, rebases each event through a block-relative
 * position map, and lets the caller replay them as fresh history events on the
 * rebuilt projection.
 *
 * Only `blockBody` content is mapped. Text edits always live there, so a text
 * event never needs to map a wrapper position; an unexpected step fails
 * loudly and the caller falls back to the previous rebuild.
 */

import type { Node as ProseNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Mappable, Step } from '@tiptap/pm/transform';
import { redo, undo } from '@tiptap/pm/history';

export interface TextHistoryEvent {
  /** Document before the event, in the old projection. */
  before: ProseNode;
  /** Document after the event, in the old projection. */
  after: ProseNode;
  /** Forward steps that turn `before` into `after`. */
  steps: readonly Step[];
}

export interface CapturedTextHistory {
  /** Oldest document reachable through the text undo stack. */
  baseline: ProseNode;
  /** Text events in chronological order. */
  events: readonly TextHistoryEvent[];
  /** Current document (the top of the text history). */
  final: ProseNode;
}

type HistoryCommand = (
  state: EditorState,
  dispatch?: (transaction: Transaction) => void,
) => boolean;

function runHistoryCommand(command: HistoryCommand, state: EditorState): Transaction | null {
  let captured: Transaction | null = null;
  const handled = command(state, (transaction) => {
    if (captured === null) captured = transaction;
  });
  return handled ? captured : null;
}

/**
 * Read the text history without touching the live editor state.
 *
 * Undo first collects every event down to the oldest text state; redo then
 * walks back up and returns the forward transactions in chronological order.
 * Both passes run against local copies of the EditorState, so the editor
 * document, selection and history plugin stay exactly as they were.
 */
export function captureTextHistory(state: EditorState): CapturedTextHistory {
  let probe = state;
  let undos = 0;
  while (true) {
    const transaction = runHistoryCommand(undo, probe);
    if (transaction === null) break;
    probe = probe.apply(transaction);
    undos += 1;
    if (undos > 10_000) {
      throw new Error('Text history is longer than the safety bound.');
    }
  }
  const baseline = probe.doc;
  const events: TextHistoryEvent[] = [];
  while (true) {
    const transaction = runHistoryCommand(redo, probe);
    if (transaction === null) break;
    const before = probe.doc;
    const next = probe.apply(transaction);
    events.push({ before, after: next.doc, steps: [...transaction.steps] });
    probe = next;
  }
  return { baseline, events, final: probe.doc };
}

interface BodyRange {
  id: string;
  from: number;
  to: number;
}

function blockBodyRanges(doc: ProseNode): Map<string, BodyRange> {
  const ranges = new Map<string, BodyRange>();
  doc.descendants((node, position) => {
    if (node.type.name !== 'blockBody') return true;
    const id = node.attrs['blockId'];
    if (typeof id !== 'string' || id.length === 0) return false;
    if (!ranges.has(id)) {
      ranges.set(id, { id, from: position + 1, to: position + 1 + node.content.size });
    }
    return false;
  });
  return ranges;
}

const NOT_DELETED = {
  deleted: false,
  deletedBefore: false,
  deletedAfter: false,
  deletedAcross: false,
} as const;

/**
 * Map positions from one editor document to a projection of the same blocks.
 *
 * Positions inside a `blockBody` keep their block-relative offset, so a text
 * edit maps correctly even when the block itself moved between the right group
 * and the below lane. Positions at a body's opening/closing boundary map to
 * the same boundary. Any other position (a wrapper-only edit) is rejected.
 */
export function createBlockPositionMapper(from: ProseNode, to: ProseNode): Mappable {
  const fromRanges = blockBodyRanges(from);
  const toRanges = blockBodyRanges(to);
  for (const id of fromRanges.keys()) {
    if (!toRanges.has(id)) {
      throw new Error(`Text history replay cannot find block "${id}" in the rebuilt projection.`);
    }
  }

  const mapResult = (position: number): { pos: number } & typeof NOT_DELETED => {
    for (const range of fromRanges.values()) {
      const target = toRanges.get(range.id);
      if (target === undefined) continue;
      if (position >= range.from && position <= range.to) {
        return { pos: target.from + (position - range.from), ...NOT_DELETED };
      }
      if (position === range.from - 1) {
        return { pos: target.from - 1, ...NOT_DELETED };
      }
      if (position === range.to + 1) {
        return { pos: target.to + 1, ...NOT_DELETED };
      }
    }
    throw new Error(
      `Text history replay cannot map position ${position}; only block content is allowed.`,
    );
  };

  return {
    map: (position: number) => mapResult(position).pos,
    mapResult,
  };
}

/** Map every step of one text event through the block-relative position map. */
export function mapHistorySteps(steps: readonly Step[], mapping: Mappable): Step[] {
  const mapped: Step[] = [];
  for (const step of steps) {
    const next = step.map(mapping);
    if (next === null) {
      throw new Error('Text history replay produced an empty step.');
    }
    mapped.push(next);
  }
  return mapped;
}
