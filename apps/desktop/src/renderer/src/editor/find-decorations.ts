/**
 * Continuous find highlighting (`⌘F`, docs/design/find-bar.md §5).
 *
 * A temporary ProseMirror decoration over the mounted editor buffer: every
 * occurrence of the query is marked, and the current one — identified by its
 * block id plus the 0-based index of the match inside that block — is marked
 * strongly. The decoration carries no document change: it is plugin state only,
 * never a history step, and it is cleared when the bar closes.
 *
 * The ranges are re-derived from the editor's own block bodies, but through the
 * **same** engine helpers the scan uses: the canonical block content is
 * projected, `findSearchUnits` builds one unit per text run (paragraphs and hard
 * breaks join, so a phrase across a line break highlights on both lines) and
 * `findRanges` applies the shared normalized/whole-word query mode. The
 * block occurrence index is therefore identical to `FindResult.occurrence`.
 *
 * The canonical engine keeps owning what is searchable and where the hits are;
 * this module only maps the engine's code-point offsets back to ProseMirror
 * UTF-16 positions by node path.
 */

import { Extension } from '@tiptap/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { buildBlockAnchorIndex, type ContentNode } from '@noteforest/core';
import { findRanges, findSearchUnits, normalizeFindQuery } from '../lib/find';
import { pmToContent, type PMNode } from '../lib/adapter';

export interface FindHighlight {
  query: string;
  /** Whole-word matching; off when omitted. */
  wholeWord?: boolean;
  /** Block that owns the current hit; null when the current hit has no text. */
  blockId: string | null;
  /** 0-based index of the current hit among that block's text/code matches. */
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

function pathKey(path: readonly number[]): string {
  return path.join('.');
}

interface TextLocation {
  /** Absolute ProseMirror position of the text node's first character. */
  from: number;
  /** Absolute ProseMirror position just past the text node. */
  to: number;
}

/**
 * Every text node and code block of one block body, keyed by canonical node
 * path. Paths start at the blockBody's own children, exactly as the canonical
 * projection numbers them.
 */
function bodyLocations(body: ProseNode, position: number): Map<string, TextLocation> {
  const locations = new Map<string, TextLocation>();
  const visit = (node: ProseNode, start: number, path: number[]): void => {
    if (node.isText) {
      locations.set(pathKey(path), {
        from: start,
        to: start + (node.text?.length ?? 0),
      });
      return;
    }
    if (node.type.name === 'codeBlock') {
      locations.set(pathKey(path), {
        from: start + 1,
        to: start + 1 + node.content.size,
      });
      return;
    }
    node.forEach((child, offset, index) => {
      visit(child, start + 1 + offset, [...path, index]);
    });
  };
  body.forEach((child, offset, index) => {
    visit(child, position + 1 + offset, [index]);
  });
  return locations;
}

/** One block's canonical body as the core projection reads it. */
function canonicalBody(body: ProseNode): ContentNode {
  const json = body.toJSON() as PMNode;
  return {
    type: 'doc',
    children: (json.content ?? []).map((child) => pmToContent(child)),
  };
}

function buildDecorations(doc: ProseNode, highlight: FindHighlight | null): DecorationSet {
  if (highlight === null) return DecorationSet.empty;
  const query = normalizeFindQuery(highlight.query);
  if (query.length === 0) return DecorationSet.empty;
  const wholeWord = highlight.wholeWord === true;
  const decorations: Decoration[] = [];

  const decorateBlockBody = (body: ProseNode, position: number): void => {
    const blockId =
      typeof body.attrs['blockId'] === 'string' ? (body.attrs['blockId'] as string) : null;
    if (blockId === null) return;
    const index = buildBlockAnchorIndex(blockId, canonicalBody(body));
    const locations = bodyLocations(body, position);
    let occurrence = 0;

    for (const unit of findSearchUnits(index)) {
      // Formulas are reported by the engine but have no inline text to mark;
      // formulas also never advance the block occurrence index.
      if (unit.kind === 'formula') continue;
      for (const range of findRanges(unit.text, query, wholeWord)) {
        const current =
          highlight.blockId === blockId && highlight.occurrence === occurrence;
        const attributes = {
          class: current ? 'nf-find-hit nf-find-hit-current' : 'nf-find-hit',
          ...(current ? { 'data-find-current': 'true' } : {}),
        };
        if (unit.kind === 'text') {
          // A match can span paragraphs or a hard break: mark every text part
          // it covers, split into one decoration per text node.
          for (const part of unit.parts ?? []) {
            if (part.kind !== 'text') continue;
            const from = Math.max(range.start, part.start);
            const to = Math.min(range.end, part.end);
            if (to <= from) continue;
            const location = locations.get(pathKey(part.nodePath));
            if (location === undefined) continue;
            const points = Array.from(part.text);
            const fromOffset =
              location.from + points.slice(0, from - part.start).join('').length;
            const toOffset =
              location.from + points.slice(0, to - part.start).join('').length;
            if (toOffset <= fromOffset || toOffset > location.to) continue;
            decorations.push(Decoration.inline(fromOffset, toOffset, attributes));
          }
        } else {
          const location = locations.get(pathKey(unit.nodePath));
          if (location === undefined) continue;
          const points = Array.from(unit.text);
          const fromOffset = location.from + points.slice(0, range.start).join('').length;
          const toOffset = location.from + points.slice(0, range.end).join('').length;
          if (toOffset <= fromOffset || toOffset > location.to) continue;
          decorations.push(Decoration.inline(fromOffset, toOffset, attributes));
        }
        occurrence += 1;
      }
    }
  };

  const visit = (node: ProseNode, position: number): void => {
    if (node.type.name === 'blockBody') {
      decorateBlockBody(node, position);
      return;
    }
    // `doc` has no opening token: its children start at its own position.
    const base = node.type.name === 'doc' ? position : position + 1;
    node.forEach((child, offset) => visit(child, base + offset));
  };

  visit(doc, 0);
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
