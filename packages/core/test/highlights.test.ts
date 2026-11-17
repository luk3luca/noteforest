import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_HIGHLIGHT_TONE,
  HIGHLIGHT_MARK_TYPE,
  HIGHLIGHT_TONES,
  isHighlightTone,
  normalizeHighlightTone,
} from '../src/index.js';
import { parseDocumentJson, stringifyDocument } from '../src/serialize.js';
import type { Document } from '../src/types.js';
import { addTopLevel, deterministicContext, newDocument, run } from './helpers.js';

/**
 * Highlight mark contract (F4b, docs/design/highlight.md §2–§3).
 *
 * The mark is additive: canonical marks are open data and validation never
 * strips them, so no `schemaVersion` bump and no migration. These tests pin the
 * tone vocabulary and the byte-level round trip in both directions.
 */

function highlightedDocument(tone: unknown): Document {
  const context = deterministicContext(4000);
  const created = newDocument(context);
  const added = addTopLevel(created, 'Highlighted', context);
  const document = added.document;
  const block = document.blocks[added.blockId];
  if (block === undefined) throw new Error('fixture block missing');
  block.content = {
    type: 'doc',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'before ' },
          {
            type: 'text',
            text: 'marked',
            marks: [{ type: HIGHLIGHT_MARK_TYPE, attrs: { tone } }],
          },
          { type: 'text', text: ' after' },
        ],
      },
    ],
  };
  return document;
}

describe('highlight tone vocabulary', () => {
  it('pins the four tones, their order, and the default', () => {
    expect(HIGHLIGHT_MARK_TYPE).toBe('highlight');
    expect(HIGHLIGHT_TONES).toEqual(['blue', 'green', 'amber', 'rose']);
    expect(DEFAULT_HIGHLIGHT_TONE).toBe('blue');
    expect(isHighlightTone(DEFAULT_HIGHLIGHT_TONE)).toBe(true);
    for (const tone of HIGHLIGHT_TONES) expect(isHighlightTone(tone)).toBe(true);
  });

  it('normalizes an unknown tone to the default instead of throwing', () => {
    expect(normalizeHighlightTone('blue')).toBe('blue');
    expect(normalizeHighlightTone('rose')).toBe('rose');
    for (const unknown of ['violet', '', null, undefined, 7, {}, []]) {
      expect(normalizeHighlightTone(unknown)).toBe(DEFAULT_HIGHLIGHT_TONE);
    }
    expect(isHighlightTone('violet')).toBe(false);
  });
});

describe('highlight marks across save/load', () => {
  it('keeps a v2 document without highlights byte-identical', () => {
    const document = newDocument(deterministicContext(4100));
    expect(document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    const text = stringifyDocument(document);
    const parsed = parseDocumentJson(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.migratedFrom).toBeUndefined();
    expect(stringifyDocument(parsed.document)).toBe(text);
  });

  it('reopens a document with highlights and keeps every tone and the schemaVersion', () => {
    for (const tone of HIGHLIGHT_TONES) {
      const document = highlightedDocument(tone);
      const text = stringifyDocument(document);
      const parsed = parseDocumentJson(text);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(parsed.migratedFrom).toBeUndefined();
      expect(parsed.document).toEqual(document);
      expect(stringifyDocument(parsed.document)).toBe(text);
      const blockId = Object.keys(document.blocks).find((id) =>
        JSON.stringify(document.blocks[id]?.content).includes('"highlight"'),
      );
      expect(blockId).toBeDefined();
      expect(text).toContain('"tone": "' + tone + '"');
    }
  });

  it('validates a document with a highlight mark and never rewrites an unknown tone', () => {
    // Validation does not whitelist marks: a future tone is data, not an error,
    // and the renderer normalizes it to the default instead of dropping it.
    const document = highlightedDocument('violet');
    const parsed = parseDocumentJson(stringifyDocument(document));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.report.ok).toBe(true);
    expect(JSON.stringify(parsed.document)).toContain('"tone":"violet"');
    // A command that touches the document keeps the mark and stays schema v2.
    const touched = run(parsed.document, {
      type: 'document.rename',
      title: 'Renamed',
    });
    expect(touched.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(JSON.stringify(touched.document)).toContain('"type":"highlight"');
  });
});
