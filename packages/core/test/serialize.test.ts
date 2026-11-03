import { describe, expect, it } from 'vitest';
import { parseDocumentJson, parseDocumentValue, stringifyDocument } from '../src/serialize.js';
import { validateDocument } from '../src/validation.js';
import { deterministicContext, newDocument, run, textContent, addTopLevel } from './helpers.js';

function sampleDocument() {
  const context = deterministicContext();
  let document = newDocument(context);
  const a = addTopLevel(document, 'A', context);
  document = a.document;
  const b = addTopLevel(document, 'B', context);
  document = b.document;
  return { context, document, a: a.blockId, b: b.blockId };
}

describe('canonical JSON parsing', () => {
  it('parses a valid document and keeps warnings separate from errors', () => {
    const { document } = sampleDocument();
    const json = stringifyDocument(document);
    const parsed = parseDocumentJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document).toEqual(document);
    expect(parsed.report.ok).toBe(true);
    expect(parsed.report.warnings).toEqual([]);
  });

  it('rejects malformed JSON with a typed error', () => {
    const parsed = parseDocumentJson('{ "schemaVersion": 1, ');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('malformed-json');
    expect(parsed.error.message).toContain('not valid JSON');
  });

  it('rejects non-object JSON', () => {
    const parsed = parseDocumentJson('[1, 2, 3]');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.code).toBe('invalid-document');
  });

  it('opens a newer schema read-only with a typed error', () => {
    const { document } = sampleDocument();
    const newer = { ...document, schemaVersion: 2 };
    const parsed = parseDocumentJson(JSON.stringify(newer));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('newer-schema');
    expect(parsed.error.details?.['schemaVersion']).toBe(2);
  });

  it('rejects an invalid schema version', () => {
    const { document } = sampleDocument();
    const parsed = parseDocumentValue({ ...document, schemaVersion: 0 });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.code).toBe('invalid-schema-version');
  });

  it('attaches validation issues to invalid-document errors', () => {
    const { document, a } = sampleDocument();
    const invalid = structuredClone(document);
    delete invalid.blocks[a];
    const parsed = parseDocumentValue(invalid);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('invalid-document');
    expect(parsed.report).toBeDefined();
    expect(parsed.report?.errors.length).toBeGreaterThan(0);
    expect(parsed.error.issues?.length).toBeGreaterThan(0);
  });

  it('round-trips annotations, view state, and reference branches', () => {
    const { context, document, a, b } = sampleDocument();
    const withExtras = structuredClone(document);
    withExtras.annotations = [{ id: 'ann1', type: 'highlight', target: { blockId: a } }];
    withExtras.viewState = {
      mode: 'reader',
      currentPage: 2,
      focusedBlockId: a,
      collapsed: [b],
      futureViewField: true,
    };
    withExtras.branches['ref1'] = {
      id: 'ref1',
      source: { blockId: a },
      targetBlockId: b,
      role: 'reference',
      order: 'a',
      label: 'see also',
    };
    const report = validateDocument(withExtras);
    expect(report.ok).toBe(true);
    expect(report.warnings.some((issue) => issue.code === 'unsupported-m2-feature')).toBe(true);

    const parsed = parseDocumentJson(stringifyDocument(withExtras));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.annotations).toEqual(withExtras.annotations);
    expect(parsed.document.viewState?.['futureViewField']).toBe(true);
    expect(parsed.document.branches['ref1']?.role).toBe('reference');
    expect(parsed.document.branches['ref1']?.label).toBe('see also');
    void context;
  });

  it('serializes pretty by default and compact on request', () => {
    const { document } = sampleDocument();
    const pretty = stringifyDocument(document);
    expect(pretty.endsWith('\n')).toBe(true);
    expect(pretty).toContain('\n  "schemaVersion"');
    const compact = stringifyDocument(document, { pretty: false });
    expect(compact).not.toContain('\n  "schemaVersion"');
    expect(compact.endsWith('\n')).toBe(true);
  });
});

describe('serialization keeps command output canonical', () => {
  it('round-trips a tree with nested primary branches', () => {
    const { context, document, a } = sampleDocument();
    const child = run(
      document,
      {
        type: 'block.create',
        content: textContent('child'),
        placement: { kind: 'child', parentBlockId: a },
      },
      context,
    );
    const parsed = parseDocumentJson(stringifyDocument(child.document));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.document).toEqual(child.document);
      expect(Object.values(parsed.document.branches)[0]?.role).toBe('primary');
    }
  });
});
