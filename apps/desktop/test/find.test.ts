import { describe, expect, it } from 'vitest';
import type {
  Anchor,
  Branch,
  ContentBlock,
  ContentNode,
  Document,
} from '@noteforest/core';
import { getSchema } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { createEditorExtensions } from '../src/renderer/src/editor/extensions';
import {
  findHighlightKey,
  findHighlightPlugin,
} from '../src/renderer/src/editor/find-decorations';
import { buildEditorDocument } from '../src/renderer/src/lib/adapter';
import {
  FIND_RESULT_LIMIT,
  findInDocument,
  findRanges,
  findReadingOrder,
  findSnippet,
  literalRanges,
  literalRangesUtf16,
  normalizeFindQuery,
} from '../src/renderer/src/lib/find';
import { flattenBlocks } from '../src/renderer/src/lib/tree';

/**
 * Find engine (`⌘F`, docs/design/find-bar.md).
 *
 * The engine is the one source of truth for what a query matches: the six
 * approved fields, case-insensitive and literal, one result per occurrence, in
 * reading order, capped at 100. The decoration test proves the Continuous
 * highlight marks every match and exactly one current hit.
 */

const TIMESTAMP = '2026-11-15T10:00:00.000Z';

function paragraph(...children: ContentNode[]): ContentNode {
  return { type: 'paragraph', children };
}

function text(value: string, anchorIds?: string[]): ContentNode {
  const node: ContentNode = { type: 'text', text: value };
  if (anchorIds !== undefined) {
    node.marks = [{ type: 'anchor', attrs: { anchorIds: [...anchorIds] } }];
  }
  return node;
}

function doc(...children: ContentNode[]): ContentNode {
  return { type: 'doc', children };
}

function block(id: string, content: ContentNode, label?: string): ContentBlock {
  return { id, content, ...(label === undefined ? {} : { label }) };
}

function branch(
  id: string,
  sourceBlockId: string,
  targetBlockId: string,
  options: { order?: string; role?: Branch['role']; anchorId?: string; label?: string } = {},
): Branch {
  return {
    id,
    source: {
      blockId: sourceBlockId,
      ...(options.anchorId === undefined ? {} : { anchorId: options.anchorId }),
    },
    targetBlockId,
    role: options.role ?? 'primary',
    order: options.order ?? 'a',
    ...(options.label === undefined ? {} : { label: options.label }),
  };
}

function textAnchor(id: string, blockId: string, quote: string): Anchor {
  return { id, blockId, kind: 'text', selector: { kind: 'text', quote }, quote };
}

function baseDocument(): Document {
  return {
    schemaVersion: 2,
    id: 'find-fixture',
    title: 'Find fixture',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    revision: 1,
    chapters: [],
    blocks: {},
    anchors: {},
    branches: {},
    assets: {},
  };
}

/**
 * Chapters → top-level blocks → DFS. `A` has an anchored child `A1` and a direct
 * child `A2`; the anchored child must come first (outline order, D3).
 */
function nestedDocument(): Document {
  const document = baseDocument();
  document.chapters = [
    { id: 'c1', title: 'Alpha chapter', topLevelBlockIds: ['A', 'D'] },
    { id: 'c2', title: 'Beta chapter', topLevelBlockIds: ['E'] },
  ];
  document.blocks = {
    A: block('A', doc(paragraph(text('Alpha root has one token', ['anchor-a']), text(' and beta'))), 'Root'),
    A1: block('A1', doc(paragraph(text('Anchored child mentions beta once')))),
    A2: block('A2', doc(paragraph(text('Direct child also mentions beta')))),
    A2a: block('A2a', doc(paragraph(text('Grandchild beta')))),
    D: block('D', doc(paragraph(text('Second root without it')))),
    E: block('E', doc(paragraph(text('Beta chapter block'))), 'Beta'),
  };
  document.anchors = {
    'anchor-a': textAnchor('anchor-a', 'A', 'Alpha root'),
  };
  document.branches = {
    'b-anchored': branch('b-anchored', 'A', 'A1', { order: 'a', anchorId: 'anchor-a' }),
    'b-direct': branch('b-direct', 'A', 'A2', { order: 'b' }),
    'b-grand': branch('b-grand', 'A2', 'A2a', { order: 'a' }),
  };
  return document;
}

describe('literal case-insensitive matching', () => {
  it('is case-insensitive and finds every occurrence', () => {
    expect(literalRanges('Eigen value, EIGEN again', 'eigen')).toEqual([
      { start: 0, end: 5 },
      { start: 13, end: 18 },
    ]);
  });

  it('is literal: a regex query matches its own characters', () => {
    // `.*` is not a pattern: it only matches a literal dot then a star.
    expect(literalRanges('alpha .* beta', '.*')).toEqual([{ start: 6, end: 8 }]);
    expect(literalRanges('alpha beta', '.*')).toEqual([]);
    expect(literalRanges('a1 a2 a3', 'a\\d')).toEqual([]);
  });

  it('keeps code point offsets for astral text', () => {
    expect(literalRanges('😀 λ value', 'λ')).toEqual([{ start: 2, end: 3 }]);
    expect(literalRangesUtf16('😀 λ value', 'λ')).toEqual([{ start: 3, end: 4 }]);
  });

  it('builds a one-line snippet with ellipses around the match', () => {
    const text = `${'a'.repeat(60)} needle ${'b'.repeat(60)}`;
    const snippet = findSnippet(text, 61, 67);
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('needle');
    expect(snippet.split('\n')).toHaveLength(1);
  });
});

describe('shared find query mode', () => {
  it('collapses whitespace and trims without rewriting the caller value', () => {
    expect(normalizeFindQuery('  come   qui  ')).toBe('come qui');
    expect(normalizeFindQuery('\ncome\t\tqui\r\n')).toBe('come qui');
    expect(normalizeFindQuery('   \n\t ')).toBe('');
    // The normalizer is a pure string helper: the caller keeps what was typed.
    const raw = 'come  ';
    expect(normalizeFindQuery(raw)).toBe('come');
    expect(raw).toBe('come  ');
  });

  it('matches with a single space across repeated spaces and line breaks', () => {
    expect(findRanges('come  qui', 'come   qui')).toEqual([{ start: 0, end: 9 }]);
    expect(findRanges('come\nqui', 'come qui')).toEqual([{ start: 0, end: 8 }]);
    expect(findRanges('😀 come qui', 'come   qui')).toEqual([{ start: 2, end: 10 }]);
  });

  it('keeps code point offsets and is case-insensitive', () => {
    expect(findRanges('😀 Eigen value, EIGEN again', 'eigen')).toEqual([
      { start: 2, end: 7 },
      { start: 15, end: 20 },
    ]);
  });

  it('bounds matches to whole words only when asked', () => {
    const text = 'eigenvalue eigenvector eigen mille';
    expect(findRanges(text, 'eigen')).toEqual([
      { start: 0, end: 5 },
      { start: 11, end: 16 },
      { start: 23, end: 28 },
    ]);
    expect(findRanges(text, 'eigen', true)).toEqual([{ start: 23, end: 28 }]);
    expect(findRanges('mille', 'il')).toEqual([{ start: 1, end: 3 }]);
    expect(findRanges('mille', 'il', true)).toEqual([]);
    // Underscore and digits are word characters too.
    expect(findRanges('eigen_value', 'eigen', true)).toEqual([]);
    expect(findRanges('eigen2', 'eigen', true)).toEqual([]);
  });

  it('keeps the strict matcher strict for anchor and formula-term callers', () => {
    // Anchors and formula terms call `literalRanges`; whitespace stays verbatim
    // and substrings still match there (F3 isolation).
    expect(literalRanges('come  qui', 'come   qui')).toEqual([]);
    expect(literalRanges('come qui', 'come qui')).toEqual([{ start: 0, end: 8 }]);
    expect(literalRanges('mille', 'il')).toEqual([{ start: 1, end: 3 }]);
    expect(literalRanges('  come  ', 'come')).toEqual([{ start: 2, end: 6 }]);
  });

  it('normalizes the document scan and treats a blank query as empty', () => {
    const document = baseDocument();
    document.chapters = [{ id: 'c1', title: 'One', topLevelBlockIds: ['A'] }];
    document.blocks = { A: block('A', doc(paragraph(text('come and come again')))) };
    expect(findInDocument(document, 'come').total).toBe(2);
    for (const query of ['come ', 'come   ', '  come  ']) {
      expect(findInDocument(document, query).total).toBe(2);
    }
    expect(findInDocument(document, '   ')).toEqual({
      results: [],
      total: 0,
      truncated: false,
    });
  });

  it('finds a phrase across a paragraph break and a hard break', () => {
    const document = baseDocument();
    document.chapters = [{ id: 'c1', title: 'One', topLevelBlockIds: ['P', 'H'] }];
    document.blocks = {
      P: block('P', doc(paragraph(text('come')), paragraph(text('qui')))),
      H: block(
        'H',
        doc(paragraph(text('come'), { type: 'hardBreak' }, text('qui'))),
      ),
    };
    const report = findInDocument(document, 'come   qui');
    expect(report.total).toBe(2);
    expect(report.results.map((result) => result.blockId)).toEqual(['P', 'H']);
    expect(report.results[0]).toMatchObject({ start: 0, end: 8, snippet: 'come qui' });
    expect(report.results[1]).toMatchObject({ start: 0, end: 8, snippet: 'come qui' });
    expect(findInDocument(document, 'come\nqui').total).toBe(2);
  });

  it('applies whole-word to every field the engine scans', () => {
    const document = baseDocument();
    document.chapters = [
      { id: 'c1', title: 'eigenvalues chapter', topLevelBlockIds: ['A', 'B'] },
    ];
    document.blocks = {
      A: block('A', doc(paragraph(text('plain body without the word')))),
      B: block(
        'B',
        doc(
          paragraph(text('code and formula follow')),
          {
            type: 'codeBlock',
            attrs: { text: 'let eigenvalues = 1', language: 'ts' },
            children: [text('let eigenvalues = 1')],
          },
          paragraph(text('inline '), { type: 'inlineMath', attrs: { latex: 'eigenvalues' } }),
        ),
      ),
    };
    document.anchors = {
      stale: {
        id: 'stale',
        blockId: 'A',
        kind: 'text',
        selector: { kind: 'text', quote: 'eigenvalues note' },
        quote: 'eigenvalues note',
      },
    };
    document.branches = {
      reference: branch('reference', 'A', 'B', {
        role: 'reference',
        label: 'eigenvalues bridge',
      }),
    };
    expect(findInDocument(document, 'eigenvalue').total).toBe(5);
    expect(findInDocument(document, 'eigenvalue', { wholeWord: true }).total).toBe(0);
    // Substring mode still finds the word inside a longer token.
    expect(findInDocument(document, 'eigen').total).toBe(5);
    expect(findInDocument(document, 'eigen', { wholeWord: true }).total).toBe(0);
  });
});

describe('find over the document model', () => {
  it('searches block text, case-insensitively', () => {
    const report = findInDocument(nestedDocument(), 'BETA');
    expect(report.results.length).toBeGreaterThan(0);
    const body = report.results.filter((result) => result.field !== 'chapter');
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((result) => result.field === 'text' || result.field === 'label')).toBe(true);
    expect(report.total).toBe(report.results.length);
    expect(report.truncated).toBe(false);
  });

  it('reports one result per occurrence', () => {
    const document = baseDocument();
    document.chapters = [{ id: 'c1', title: 'One', topLevelBlockIds: ['A'] }];
    document.blocks = {
      A: block('A', doc(paragraph(text('echo echo echo')))),
    };
    const report = findInDocument(document, 'echo');
    expect(report.results.map((result) => result.start)).toEqual([0, 5, 10]);
    expect(report.results.map((result) => result.occurrence)).toEqual([0, 1, 2]);
  });

  it('searches chapter titles and branch labels once each', () => {
    const document = nestedDocument();
    document.branches['b-direct'] = {
      ...document.branches['b-direct'],
      label: 'beta branch',
    } as Branch;
    const report = findInDocument(document, 'beta');
    const chapters = report.results.filter((result) => result.kind === 'chapter');
    const labels = report.results.filter((result) => result.kind === 'label');
    expect(chapters.map((result) => result.chapterId)).toEqual(['c2']);
    expect(labels).toHaveLength(1);
    expect(labels[0]?.branchId).toBe('b-direct');
    expect(labels[0]?.blockId).toBe('A');
    // One result per label, at the source block, before its children.
    expect(
      report.results.map((result) => `${result.kind}:${result.blockId ?? result.chapterId}`),
    ).toEqual([
      'text:A',
      'label:A',
      'text:A1',
      'text:A2',
      'text:A2a',
      'chapter:c2',
      'text:E',
    ]);
  });

  it('searches code text and LaTeX source', () => {
    const document = baseDocument();
    document.chapters = [{ id: 'c1', title: 'One', topLevelBlockIds: ['A'] }];
    document.blocks = {
      A: block(
        'A',
        doc(
          paragraph(text('Inline '), { type: 'inlineMath', attrs: { latex: 'x^2 + y^2' } }),
          {
            type: 'codeBlock',
            attrs: { text: 'const eigenvalue = 1', language: 'ts' },
            children: [text('const eigenvalue = 1')],
          },
        ),
      ),
    };
    const report = findInDocument(document, 'eigen');
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.kind).toBe('code');
    expect(report.results[0]?.field).toBe('code');
    expect(report.results[0]?.start).toBe(6);

    const formula = findInDocument(document, 'y^2');
    expect(formula.results).toHaveLength(1);
    expect(formula.results[0]?.kind).toBe('formula');
    expect(formula.results[0]?.field).toBe('formula');
  });

  it('reports a text match inside an anchor range as an Anchor result', () => {
    const document = nestedDocument();
    const report = findInDocument(document, 'alpha');
    const anchorHits = report.results.filter((result) => result.kind === 'anchor');
    expect(anchorHits).toHaveLength(1);
    expect(anchorHits[0]?.anchorId).toBe('anchor-a');
    expect(anchorHits[0]?.field).toBe('text');
    expect(anchorHits[0]?.blockId).toBe('A');
  });

  it('reports a stored quote that is no longer in the content on the record', () => {
    const document = baseDocument();
    document.chapters = [{ id: 'c1', title: 'One', topLevelBlockIds: ['A'] }];
    document.blocks = { A: block('A', doc(paragraph(text('Rewritten sentence')))) };
    document.anchors = {
      stale: {
        id: 'stale',
        blockId: 'A',
        kind: 'text',
        selector: { kind: 'text', quote: 'lost phrase' },
        quote: 'lost phrase',
      },
    };
    const report = findInDocument(document, 'lost');
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.kind).toBe('anchor');
    expect(report.results[0]?.field).toBe('quote');
    expect(report.results[0]?.anchorId).toBe('stale');
    expect(report.results[0]?.snippet).toBe('lost phrase');
  });

  it('ranks a formula anchor hit with its anchor id', () => {
    const document = baseDocument();
    document.chapters = [{ id: 'c1', title: 'One', topLevelBlockIds: ['A'] }];
    document.blocks = {
      A: block(
        'A',
        doc(
          paragraph(text('Given '), {
            type: 'inlineMath',
            attrs: { latex: 'x^2', anchorIds: ['fa'] },
          }),
        ),
      ),
    };
    document.anchors = {
      fa: {
        id: 'fa',
        blockId: 'A',
        kind: 'formula',
        selector: { kind: 'formula', form: 'whole', latex: 'x^2' },
        quote: 'x^2',
      },
    };
    const report = findInDocument(document, 'x^2');
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.kind).toBe('anchor');
    expect(report.results[0]?.anchorId).toBe('fa');
    expect(report.results[0]?.field).toBe('formula');
  });

  it('reads in DFS chapter order with anchored children before direct children', () => {
    const document = nestedDocument();
    // The order helper must agree with the canonical reading order.
    expect(findReadingOrder(document)).toEqual(flattenBlocks(document));
    expect(findReadingOrder(document)).toEqual(['A', 'A1', 'A2', 'A2a', 'D', 'E']);

    const report = findInDocument(document, 'beta');
    // Chapter titles sit at their chapter position: c1 (A, its label, the DFS
    // children), then c2's title, then E.
    expect(
      report.results.map((result) => `${result.kind}:${result.blockId ?? result.chapterId}`),
    ).toEqual(['text:A', 'text:A1', 'text:A2', 'text:A2a', 'chapter:c2', 'text:E']);
  });

  it('caps the result list at 100 and reports the true total', () => {
    const document = baseDocument();
    const blockIds: string[] = [];
    for (let index = 0; index < 40; index += 1) {
      const id = `b${index}`;
      blockIds.push(id);
      document.blocks[id] = block(id, doc(paragraph(text('repeat repeat repeat'))));
    }
    document.chapters = [{ id: 'c1', title: 'Many', topLevelBlockIds: blockIds }];
    const report = findInDocument(document, 'repeat');
    expect(FIND_RESULT_LIMIT).toBe(100);
    expect(report.results).toHaveLength(100);
    expect(report.total).toBe(120);
    expect(report.truncated).toBe(true);
  });

  it('returns nothing for an empty query', () => {
    expect(findInDocument(nestedDocument(), '')).toEqual({
      results: [],
      total: 0,
      truncated: false,
    });
  });

  it('scans 300 and 1,000 blocks within the design budget', () => {
    const build = (count: number): Document => {
      const document = baseDocument();
      const blockIds: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const id = `block-${index}`;
        blockIds.push(id);
        document.blocks[id] = block(
          id,
          doc(
            paragraph(
              text(
                `Block ${index} carries a sentence with enough words to measure the find scan for eigenvalue study notes.`,
              ),
            ),
          ),
        );
        if (index > 0) {
          document.branches[`branch-${index}`] = branch(
            `branch-${index}`,
            `block-${Math.floor((index - 1) / 3)}`,
            id,
            { order: `a${index}` },
          );
        }
      }
      document.chapters = [{ id: 'c1', title: 'Large', topLevelBlockIds: blockIds.slice(0, 1) }];
      return document;
    };

    for (const [count, budget] of [
      [300, 16],
      [1000, 50],
    ] as const) {
      const document = build(count);
      // Warm-up keeps the measurement about the scan, not the first JIT pass.
      findInDocument(document, 'eigenvalue');
      const samples: number[] = [];
      for (let run = 0; run < 5; run += 1) {
        const started = performance.now();
        const report = findInDocument(document, 'eigenvalue');
        samples.push(performance.now() - started);
        expect(report.total).toBeGreaterThan(0);
      }
      samples.sort((left, right) => left - right);
      const median = samples[Math.floor(samples.length / 2)] ?? 0;
      console.log(`find scan: ${count} blocks in ${median.toFixed(2)} ms (median of 5)`);
      expect(median).toBeLessThan(budget);
    }
  });
});

describe('Continuous find decoration', () => {
  const schema = getSchema(createEditorExtensions());

  function stateFor(document: Document): EditorState {
    const pmDocument = schema.nodeFromJSON(
      buildEditorDocument(document, new Set(), new Set()),
    );
    return EditorState.create({ schema, doc: pmDocument, plugins: [findHighlightPlugin()] });
  }

  function decorationSnapshot(state: EditorState): Array<{
    from: number;
    to: number;
    current: boolean;
    classes: string;
  }> {
    const decorations =
      findHighlightKey.getState(state)?.decorations.find() ?? [];
    return decorations.map((decoration) => ({
      from: decoration.from,
      to: decoration.to,
      current: decoration.type.attrs['data-find-current'] === 'true',
      classes: String(decoration.type.attrs['class'] ?? ''),
    }));
  }

  function decorationFixture(): Document {
    const document = baseDocument();
    document.chapters = [
      { id: 'c1', title: 'Eigen', topLevelBlockIds: ['A', 'B'] },
    ];
    document.blocks = {
      A: block('A', doc(paragraph(text('An eigenvalue is a scalar; Eigenvalue λ.')))),
      B: block(
        'B',
        doc(
          paragraph(text('The eigenvector of A.')),
          {
            type: 'codeBlock',
            attrs: { text: 'let eigen = 1', language: 'ts' },
            children: [text('let eigen = 1')],
          },
        ),
      ),
    };
    return document;
  }

  it('marks every match and exactly one current hit', () => {
    let state = stateFor(decorationFixture());
    state = state.apply(
      state.tr.setMeta(findHighlightKey, {
        query: 'eigen',
        blockId: 'B',
        occurrence: 1,
      }),
    );
    const decorations = decorationSnapshot(state);
    // A: eigenvalue + Eigenvalue; B: eigenvector + the code token.
    expect(decorations).toHaveLength(4);
    expect(decorations.filter((decoration) => decoration.current)).toHaveLength(1);
    expect(decorations.map((decoration) => decoration.classes)).toEqual([
      'nf-find-hit',
      'nf-find-hit',
      'nf-find-hit',
      'nf-find-hit nf-find-hit-current',
    ]);
    // The current hit is the fourth match, in the code block of block B.
    expect(decorations[3]?.current).toBe(true);
    for (const decoration of decorations) {
      expect(decoration.to).toBeGreaterThan(decoration.from);
    }
  });

  it('moves the current mark with the block occurrence index', () => {
    let state = stateFor(decorationFixture());
    state = state.apply(
      state.tr.setMeta(findHighlightKey, { query: 'eigen', blockId: 'A', occurrence: 1 }),
    );
    const current = decorationSnapshot(state).find((decoration) => decoration.current);
    expect(current).toBeDefined();
    // The second match in A is the capitalized Eigenvalue.
    const text = state.doc.textBetween(current?.from ?? 0, current?.to ?? 0);
    expect(text).toBe('Eigen');
  });

  it('normalizes the query and honours the shared whole-word mode', () => {
    let state = stateFor(decorationFixture());
    state = state.apply(
      state.tr.setMeta(findHighlightKey, {
        query: '  EIGEN  ',
        wholeWord: false,
        blockId: 'A',
        occurrence: 0,
      }),
    );
    expect(decorationSnapshot(state)).toHaveLength(4);

    state = state.apply(
      state.tr.setMeta(findHighlightKey, {
        query: 'eigen',
        wholeWord: true,
        blockId: 'B',
        occurrence: 0,
      }),
    );
    const decorations = decorationSnapshot(state);
    // eigenvalue, Eigenvalue and eigenvector are rejected; the code token stays.
    expect(decorations).toHaveLength(1);
    expect(
      state.doc.textBetween(decorations[0]?.from ?? 0, decorations[0]?.to ?? 0),
    ).toBe('eigen');
    expect(decorations[0]?.current).toBe(true);
  });

  it('marks a phrase that spans a paragraph break on both lines', () => {
    const document = baseDocument();
    document.chapters = [{ id: 'c1', title: 'Lines', topLevelBlockIds: ['L'] }];
    document.blocks = {
      L: block(
        'L',
        doc(paragraph(text('come')), paragraph(text('qui')), paragraph(text('come qui'))),
      ),
    };
    let state = stateFor(document);
    state = state.apply(
      state.tr.setMeta(findHighlightKey, {
        query: 'come   qui',
        blockId: 'L',
        occurrence: 1,
      }),
    );
    const decorations = decorationSnapshot(state);
    expect(decorations).toHaveLength(3);
    expect(decorations.map((decoration) => decoration.classes)).toEqual([
      'nf-find-hit',
      'nf-find-hit',
      'nf-find-hit nf-find-hit-current',
    ]);
    expect(
      state.doc.textBetween(decorations[0]?.from ?? 0, decorations[0]?.to ?? 0),
    ).toBe('come');
    expect(
      state.doc.textBetween(decorations[1]?.from ?? 0, decorations[1]?.to ?? 0),
    ).toBe('qui');
    expect(
      state.doc.textBetween(decorations[2]?.from ?? 0, decorations[2]?.to ?? 0),
    ).toBe('come qui');
  });

  it('clears the marks when the bar closes and rebuilds on a document edit', () => {
    let state = stateFor(decorationFixture());
    state = state.apply(
      state.tr.setMeta(findHighlightKey, { query: 'eigen', blockId: 'A', occurrence: 0 }),
    );
    expect(decorationSnapshot(state).length).toBeGreaterThan(0);

    state = state.apply(state.tr.setMeta(findHighlightKey, null));
    expect(decorationSnapshot(state)).toHaveLength(0);

    state = state.apply(
      state.tr.setMeta(findHighlightKey, { query: 'eigen', blockId: 'A', occurrence: 0 }),
    );
    const before = decorationSnapshot(state).length;
    // Insert inside a real block body (the code token), the way an edit does:
    // text appended outside any block carries no block id and is not find content.
    let insertPosition = -1;
    state.doc.descendants((node, position) => {
      if (insertPosition >= 0) return false;
      if (node.isText && node.text === 'let eigen = 1') {
        insertPosition = position + (node.text?.length ?? 0);
        return false;
      }
      return undefined;
    });
    expect(insertPosition).toBeGreaterThan(0);
    const inserted = state.doc.type.schema.text(' eigen');
    state = state.apply(state.tr.insert(insertPosition, inserted));
    // The highlight survives the edit and re-scans the new text.
    expect(decorationSnapshot(state).length).toBe(before + 1);
  });
});
