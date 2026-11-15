/**
 * Continuous find highlighting (`⌘F`, docs/design/find-bar.md §5).
 *
 * A temporary ProseMirror decoration over the mounted editor buffer: every
 * literal occurrence of the query is marked, and the current one — identified
 * by its block id plus the 0-based index of the match inside that block — is
 * marked strongly. The decoration carries no document change: it is plugin
 * state only, never a history step, and it is cleared when the bar closes.
 *
 * The ranges are re-derived from the editor's own text nodes (`literalRangesUtf16`)
 * instead of translating the canonical model offsets into ProseMirror
 * positions. Text-node order is the same in both, so the block occurrence
 * index is the whole mapping the highlight needs; the canonical engine keeps
 * owning what is searchable and where the hits are.
 */

import { Extension } from '@tiptap/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { literalRangesUtf16 } from '../lib/find';

export interface FindHighlight {
  query: string;
  /** Block that owns the current hit; null when the current hit has no text. */
  blockId: string | null;
  /** 0-based index of the current hit among that block's text matches. */
  occurrence: number;
}

export interface FindHighlightState {
  highlight: FindHighlight | null;
  decorations: DecorationSet;
}

const EMPTY_STATE: FindHighlightState = {
  highlight: null,
  decorations: DecorationSet.empty,
};

export const findHighlightKey = new PluginKey<FindHighlightState>('nfFindHighlight');

/** One block's text nodes visited in document order. */
function buildDecorations(doc: ProseNode, highlight: FindHighlight | null): DecorationSet {
  if (highlight === null || highlight.query.length === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  const seenByBlock = new Map<string, number>();

  const visit = (node: ProseNode, position: number, blockId: string | null): void => {
    const owner =
      node.type.name === 'branchBlock' && typeof node.attrs['blockId'] === 'string'
        ? (node.attrs['blockId'] as string)
        : blockId;
    if (node.isText) {
      const text = node.text ?? '';
      if (text.length === 0) return;
      const block = owner ?? '';
      let occurrence = seenByBlock.get(block) ?? 0;
      for (const range of literalRangesUtf16(text, highlight.query)) {
        const from = position + range.start;
        const to = position + range.end;
        if (to <= from) continue;
        const current =
          owner !== null &&
          owner === highlight.blockId &&
          highlight.occurrence === occurrence;
        decorations.push(
          Decoration.inline(from, to, {
            class: current ? 'nf-find-hit nf-find-hit-current' : 'nf-find-hit',
            ...(current ? { 'data-find-current': 'true' } : {}),
          }),
        );
        occurrence += 1;
      }
      if (owner !== null) seenByBlock.set(block, occurrence);
      return;
    }
    // `doc` has no opening token: its children start at its own position.
    const base = node.type.name === 'doc' ? position : position + 1;
    node.forEach((child, offset) => visit(child, base + offset, owner));
  };

  visit(doc, 0, null);
  return DecorationSet.create(doc, decorations);
}

/**
 * Highlight all matches and the current one. The shell dispatches the highlight
 * (or `null` to clear) with `tr.setMeta(findHighlightKey, …)`; a document change
 * rebuilds the same highlight against the new text so the marks never drift.
 */
export function findHighlightPlugin(): Plugin<FindHighlightState> {
  return new Plugin<FindHighlightState>({
    key: findHighlightKey,
    state: {
      init: () => EMPTY_STATE,
      apply(transaction, previous, _oldState, newState) {
        const meta = transaction.getMeta(findHighlightKey) as
          | FindHighlight
          | null
          | undefined;
        if (meta !== undefined) {
          return {
            highlight: meta,
            decorations: buildDecorations(newState.doc, meta),
          };
        }
        if (!transaction.docChanged) return previous;
        return {
          highlight: previous.highlight,
          decorations: buildDecorations(newState.doc, previous.highlight),
        };
      },
    },
    props: {
      decorations(state) {
        return findHighlightKey.getState(state)?.decorations ?? null;
      },
    },
  });
}

export const FindHighlightExtension = Extension.create({
  name: 'nfFindHighlight',
  addProseMirrorPlugins() {
    return [findHighlightPlugin()];
  },
});
