/**
 * M3a1 anchor model, binding, resolution, and A1–A12 validation.
 *
 * These tests are pure core tests: no editor, DOM, app, or e2e.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  anchorSelectorMirrorIssues,
  codeBlockText,
  codePointLength,
  codePointSlice,
  compareNodePaths,
  contentOrderKey,
  findProjectionQuoteCandidates,
  getNodeAtPath,
  mergeAnchorBinding,
  normalizeAnchorIds,
  plainTextProjection,
  readAnchorIds,
  readAnchorIdsRaw,
  readContentAnchorBinding,
  removeAnchorBinding,
  resolveAnchor,
  resolveBlockAnchors,
  resolveDocumentAnchors,
  splitTextNode,
  textRangesForProjectionRange,
  validateAnchorSelector,
  withAnchorIds,
  withAtomicAnchorIds,
  withTextAnchorIds,
} from '../src/anchors.js';
import type { AnchorBinding } from '../src/anchors.js';
import { directChildIds, subtreeBlockIds } from '../src/structure.js';
import type { Anchor, ContentNode, Document } from '../src/types.js';
import { parseDocumentJson } from '../src/serialize.js';
import { validateDocument } from '../src/validation.js';
import {
  addChild,
  addTopLevel,
  deterministicContext,
  newDocument,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function doc(...children: ContentNode[]): ContentNode {
  return { type: 'doc', children };
}

function paragraph(...children: ContentNode[]): ContentNode {
  return { type: 'paragraph', children };
}

function text(value: string, anchorIds?: string[]): ContentNode {
  if (anchorIds === undefined) return { type: 'text', text: value };
  return {
    type: 'text',
    text: value,
    marks: [{ type: 'anchor', attrs: { anchorIds } }],
  };
}

function inlineMath(latex: string, anchorIds?: string[]): ContentNode {
  return {
    type: 'inlineMath',
    attrs: anchorIds === undefined ? { latex } : { latex, anchorIds },
  };
}

function codeBlock(
  code: string,
  anchorIds?: string[],
  language = 'python',
): ContentNode {
  return {
    type: 'codeBlock',
    attrs: {
      text: code,
      language,
      ...(anchorIds === undefined ? {} : { anchorIds }),
    },
  };
}

function image(
  assetId: string,
  anchorIds?: string[],
  extra: Record<string, unknown> = {},
): ContentNode {
  return {
    type: 'image',
    attrs: {
      assetId,
      ...(anchorIds === undefined ? {} : { anchorIds }),
      ...extra,
    },
  };
}

function textAnchor(
  id: string,
  blockId: string,
  selector: Record<string, unknown>,
): Anchor {
  return {
    id,
    blockId,
    kind: 'text',
    selector: { kind: 'text', ...selector },
  };
}

function formulaAnchor(
  id: string,
  blockId: string,
  selector: Record<string, unknown>,
): Anchor {
  return {
    id,
    blockId,
    kind: 'formula',
    selector: { kind: 'formula', ...selector },
  };
}

function codeAnchor(
  id: string,
  blockId: string,
  selector: Record<string, unknown>,
): Anchor {
  return {
    id,
    blockId,
    kind: 'code',
    selector: { kind: 'code', ...selector },
  };
}

function imageAnchor(
  id: string,
  blockId: string,
  assetId: string,
  rect = { x: 0.2, y: 0.3, width: 0.1, height: 0.1 },
  extra: Record<string, unknown> = {},
): Anchor {
  return {
    id,
    blockId,
    kind: 'image',
    selector: {
      kind: 'image',
      assetId,
      rect,
      point: rect.width === 0 && rect.height === 0,
      ...extra,
    },
  };
}

function baseDocument(content: ContentNode): {
  document: Document;
  blockId: string;
  targetBlockId: string;
} {
  const context = deterministicContext();
  let document = newDocument(context);
  const source = addTopLevel(document, 'Source', context);
  document = source.document;
  const target = addTopLevel(document, 'Target', context);
  document = target.document;
  const block = document.blocks[source.blockId];
  if (block === undefined) throw new Error('source block missing');
  block.content = structuredClone(content);
  return { document, blockId: source.blockId, targetBlockId: target.blockId };
}

function attach(
  document: Document,
  anchor: Anchor,
  targetBlockId: string,
  role: 'primary' | 'reference' = 'reference',
): Document {
  document.anchors[anchor.id] = anchor;
  const branchId = `branch-${anchor.id}`;
  document.branches[branchId] = {
    id: branchId,
    source: { blockId: anchor.blockId, anchorId: anchor.id },
    targetBlockId,
    role,
    order: 'a',
  };
  return document;
}

function resolveWithBranch(
  content: ContentNode,
  anchor: Anchor,
): ReturnType<typeof resolveAnchor> {
  const { document, blockId, targetBlockId } = baseDocument(content);
  anchor.blockId = blockId;
  attach(document, anchor, targetBlockId);
  return resolveAnchor(document, anchor.id);
}

function deepFreeze(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fixturePath(name: string): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../fixtures',
    name,
  );
}

// ---------------------------------------------------------------------------
// Selector shapes
// ---------------------------------------------------------------------------

describe('anchor selector shapes', () => {
  it('accepts one valid selector per kind', () => {
    expect(validateAnchorSelector({ kind: 'text', quote: 'x' }).issues).toEqual([]);
    expect(
      validateAnchorSelector({ kind: 'formula', form: 'whole', latex: 'x^2' }).issues,
    ).toEqual([]);
    expect(
      validateAnchorSelector({
        kind: 'formula',
        form: 'term',
        latex: '\\lambda',
        latexStart: 5,
        occurrenceHint: 1,
        latexPrefix: 'Av = ',
      }).issues,
    ).toEqual([]);
    expect(
      validateAnchorSelector({
        kind: 'code',
        quote: 'eigvals',
        startOffset: 2,
        endOffset: 9,
        lineStart: 1,
        lineEnd: 1,
      }).issues,
    ).toEqual([]);
    expect(
      validateAnchorSelector({
        kind: 'image',
        assetId: 'sha256-a',
        rect: { x: 0, y: 0, width: 1, height: 1 },
        crop: { x: 0, y: 0, width: 1, height: 1 },
        point: false,
      }).issues,
    ).toEqual([]);
  });

  it('flags kind mismatch, missing fields, and invalid image geometry', () => {
    const mismatch = validateAnchorSelector(
      { kind: 'code', quote: 'x' },
      'text',
    );
    expect(mismatch.issues.some((entry) => entry.message.includes('does not match'))).toBe(true);

    const term = validateAnchorSelector({ kind: 'formula', form: 'term', latex: '' });
    expect(term.issues.some((entry) => entry.message.includes('must not be empty'))).toBe(true);

    const zeroPoint = validateAnchorSelector({
      kind: 'image',
      assetId: 'a',
      rect: { x: 0.2, y: 0.2, width: 0, height: 0 },
      point: false,
    });
    expect(zeroPoint.issues.some((entry) => entry.message.includes('point must be true'))).toBe(
      true,
    );

    const outside = validateAnchorSelector({
      kind: 'image',
      assetId: 'a',
      rect: { x: 0.9, y: 0, width: 0.2, height: 1 },
      point: false,
    });
    expect(outside.issues.some((entry) => entry.message.includes('fit inside'))).toBe(true);
  });

  it('flags unknown selector kinds without dropping them', () => {
    const validation = validateAnchorSelector({ kind: 'future-anchor', value: 1 });
    expect(validation.issues.map((entry) => entry.code)).toContain('unsupported-anchor-kind');
    expect(validation.selector).toMatchObject({ kind: 'future-anchor', value: 1 });
  });

  it('selects the canonical selector value over a disagreeing mirror', () => {
    const anchor: Anchor = {
      id: 'a1',
      blockId: 'b1',
      kind: 'text',
      selector: { kind: 'text', quote: 'alpha', prefix: 'a ' },
      quote: 'beta',
      prefix: 'a ',
    };
    const issues = anchorSelectorMirrorIssues(anchor);
    expect(issues.some((entry) => entry.field === 'quote')).toBe(true);
    expect(issues.some((entry) => entry.field === 'prefix')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Binding helpers and content projection
// ---------------------------------------------------------------------------

describe('anchorIds binding helpers', () => {
  it('reads anchorIds with legacy fallback and normalizes sorting', () => {
    const legacy = { type: 'text', text: 'x', marks: [{ type: 'anchor', attrs: { anchorId: 'a1' } }] };
    expect(readAnchorIds(legacy)).toEqual(['a1']);

    const both = {
      type: 'text',
      text: 'x',
      marks: [{ type: 'anchor', attrs: { anchorIds: ['b', 'a'], anchorId: 'a' } }],
    };
    expect(readAnchorIds(both)).toEqual(['a', 'b']);
    expect(readAnchorIdsRaw(both).legacyConflict).toBe(false);

    const conflict = {
      type: 'text',
      text: 'x',
      marks: [{ type: 'anchor', attrs: { anchorIds: ['b'], anchorId: 'a' } }],
    };
    expect(readAnchorIds(conflict)).toEqual(['b']);
    expect(readAnchorIdsRaw(conflict).legacyConflict).toBe(true);
    expect(normalizeAnchorIds(['b', 'a', 'a', ''])).toEqual(['a', 'b']);
  });

  it('writes one sorted anchor mark and preserves other marks', () => {
    const node: ContentNode = {
      type: 'text',
      text: 'x',
      marks: [
        { type: 'strong' },
        { type: 'anchor', attrs: { anchorIds: ['b'], anchorId: 'legacy' } },
      ],
    };
    const updated = withTextAnchorIds(node, ['c', 'a', 'c']);
    expect(updated.marks).toHaveLength(2);
    const anchorMarks = (updated.marks ?? []).filter((mark) => mark.type === 'anchor');
    expect(anchorMarks).toHaveLength(1);
    expect(anchorMarks[0]?.attrs).toEqual({ anchorIds: ['a', 'c'] });
    expect(updated.marks?.[0]?.type).toBe('strong');
    // The input is untouched.
    expect(node.marks?.[1]?.attrs).toEqual({ anchorIds: ['b'], anchorId: 'legacy' });

    const cleared = withTextAnchorIds(updated, []);
    expect((cleared.marks ?? []).some((mark) => mark.type === 'anchor')).toBe(false);
  });

  it('writes sorted atomic attrs and removes empty or legacy bindings', () => {
    const node = codeBlock('x', ['b', 'a']);
    expect(node.attrs?.['anchorIds']).toEqual(['b', 'a']);
    const updated = withAtomicAnchorIds(node, ['c', 'a']);
    expect(updated.attrs?.['anchorIds']).toEqual(['a', 'c']);
    const cleared = withAtomicAnchorIds(updated, []);
    expect(cleared.attrs?.['anchorIds']).toBeUndefined();

    const addLegacy = withAnchorIds(codeBlock('x'), ['a']);
    expect(addLegacy.attrs?.['anchorIds']).toEqual(['a']);
  });

  it('splits text nodes by Unicode code point and keeps marks', () => {
    const node: ContentNode = {
      type: 'text',
      text: 'a😀b',
      marks: [{ type: 'anchor', attrs: { anchorIds: ['a1'] } }],
    };
    expect(codePointLength(node.text ?? '')).toBe(3);
    const split = splitTextNode(node, 2);
    expect(split?.[0]?.text).toBe('a😀');
    expect(split?.[1]?.text).toBe('b');
    expect(codePointSlice('a😀b', 1, 3)).toBe('😀b');
    expect(split?.[0]?.marks?.[0]?.attrs?.['anchorIds']).toEqual(['a1']);
    expect(splitTextNode(node, 0)).toBeNull();
    expect(splitTextNode(node, 3)).toBeNull();
  });

  it('merges overlapping bindings by splitting text nodes and removes them cleanly', () => {
    const content = doc(paragraph(text('abcdef')));
    const outer: AnchorBinding = {
      kind: 'text',
      ranges: [{ nodePath: [0, 0], start: 0, end: 6 }],
    };
    const inner: AnchorBinding = {
      kind: 'text',
      ranges: [{ nodePath: [0, 0], start: 2, end: 4 }],
    };
    const withOuter = mergeAnchorBinding(content, 'a1', outer);
    const withBoth = mergeAnchorBinding(withOuter, 'a2', inner);

    const outerRead = readContentAnchorBinding(withBoth, 'a1');
    const innerRead = readContentAnchorBinding(withBoth, 'a2');
    expect(outerRead?.textRanges).toHaveLength(3);
    expect(innerRead?.textRanges).toHaveLength(1);
    const paragraphNode = getNodeAtPath(withBoth, [0]);
    expect(paragraphNode?.children?.map((node) => node.text)).toEqual(['ab', 'cd', 'ef']);
    expect(paragraphNode?.children?.[1]?.marks?.[0]?.attrs?.['anchorIds']).toEqual(['a1', 'a2']);

    const removed = removeAnchorBinding(withBoth, 'a2');
    expect(readContentAnchorBinding(removed, 'a2')).toBeNull();
    expect(readContentAnchorBinding(removed, 'a1')?.textRanges).toHaveLength(3);
    expect((getNodeAtPath(removed, [0])?.children?.[1]?.marks ?? []).length).toBe(1);

    const atomic = mergeAnchorBinding(
      codeBlock('x'),
      'a3',
      { kind: 'code', nodePath: [], startOffset: 0, endOffset: 1 },
    );
    expect(atomic.attrs?.['anchorIds']).toEqual(['a3']);
  });

  it('projects plain text with inline math, image alt text, and block barriers', () => {
    const content = doc(
      paragraph(
        text('An '),
        text('eigenvalue', ['a1']),
        text(' is '),
        inlineMath('\\lambda'),
        { type: 'hardBreak' },
        text('done'),
      ),
      paragraph(text('Next')),
      codeBlock('const x = 1;'),
    );
    const projection = plainTextProjection(content);
    expect(projection.text).toBe('An eigenvalue is \\lambda\ndone\nNext\n');
    expect(projection.length).toBe(codePointLength(projection.text));
    expect(projection.segments.some((segment) => segment.kind === 'inlineMath')).toBe(true);
    expect(projection.segments.some((segment) => segment.kind === 'hardBreak')).toBe(true);
    expect(projection.barriers.some((barrier) => barrier.kind === 'block-atomic')).toBe(true);

    const ranges = textRangesForProjectionRange(projection, 3, 13);
    expect(ranges).toEqual([{ nodePath: [0, 1], start: 0, end: 10 }]);

    const candidates = findProjectionQuoteCandidates(projection, 'eigenvalue');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.crossesBarrier).toBe(false);
    expect(candidates[0]?.prefix).toBe('An ');
  });

  it('orders anchors by content position and ID', () => {
    const first = contentOrderKey([0, 1], 0, 'a1');
    const second = contentOrderKey([0, 1], 5, 'a1');
    const third = contentOrderKey([0, 2], 0, 'a1');
    expect(compareNodePaths([0, 1], [0, 2])).toBeLessThan(0);
    expect(first < second).toBe(true);
    expect(second < third).toBe(true);
    expect(contentOrderKey([1], 0, 'a1') < contentOrderKey([1], 0, 'a2')).toBe(true);
  });

  it('uses code attrs.text or child text consistently', () => {
    expect(codeBlockText(codeBlock('abc'))).toBe('abc');
    expect(
      codeBlockText({
        type: 'codeBlock',
        attrs: { language: 'ts' },
        children: [{ type: 'text', text: 'abc' }, { type: 'text', text: 'def' }],
      }),
    ).toBe('abcdef');
  });
});

// ---------------------------------------------------------------------------
// Resolution — text
// ---------------------------------------------------------------------------

describe('text anchor resolution', () => {
  it('resolves one contiguous multi-node run across inline math', () => {
    const content = doc(
      paragraph(
        text('see '),
        text('x', ['a1']),
        inlineMath('\\lambda'),
        text('y', ['a1']),
        text(' end'),
      ),
    );
    const anchor = textAnchor('a1', 'source', { quote: 'x\\lambday' });
    const { document, blockId, targetBlockId } = baseDocument(content);
    anchor.blockId = blockId;
    attach(document, anchor, targetBlockId);
    const resolution = resolveAnchor(document, 'a1');
    expect(resolution.state).toBe('resolved');
    expect(resolution.reason).toBe('exact-binding');
    expect(resolution.resolved?.range.kind).toBe('text');
    if (resolution.resolved?.range.kind === 'text') {
      expect(resolution.resolved.range.ranges).toHaveLength(2);
      expect(resolution.resolved.range.projectionStart).toBe(4);
      expect(resolution.resolved.range.projectionEnd).toBe(13);
    }
  });

  it('resolves overlapping anchors that share one mark array', () => {
    const content = doc(paragraph(text('eigenvalue', ['a1', 'a2'])));
    const { document, blockId, targetBlockId } = baseDocument(content);
    attach(document, textAnchor('a1', blockId, { quote: 'eigenvalue' }), targetBlockId);
    attach(document, textAnchor('a2', blockId, { quote: 'eigenvalue' }), targetBlockId);
    expect(resolveAnchor(document, 'a1').state).toBe('resolved');
    expect(resolveAnchor(document, 'a2').state).toBe('resolved');
    expect(validateDocument(document).warnings.filter((issue) => issue.code.startsWith('anchor-'))).toEqual([]);
  });

  it('breaks a second disjoint run with an unmarked gap', () => {
    const content = doc(
      paragraph(
        text('one ', ['a1']),
        text('gap'),
        text('two', ['a1']),
      ),
    );
    const resolution = resolveWithBranch(content, textAnchor('a1', 'source', { quote: 'one' }));
    expect(resolution.state).toBe('broken');
    expect(resolution.reason).toBe('not-contiguous');
  });

  it('breaks a duplicate entry in one mark array', () => {
    const content = doc(paragraph(text('term', ['a1', 'a1'])));
    const resolution = resolveWithBranch(content, textAnchor('a1', 'source', { quote: 'term' }));
    expect(resolution.state).toBe('broken');
    expect(resolution.reason).toBe('duplicate-binding');
  });

  it('resolves a unique quote fallback and marks repeated quotes ambiguous', () => {
    const unique = doc(paragraph(text('x term y')));
    expect(
      resolveWithBranch(unique, textAnchor('a1', 'source', { quote: 'term' })).state,
    ).toBe('resolved');

    const repeated = doc(paragraph(text('x term y term z')));
    const ambiguous = resolveWithBranch(
      repeated,
      textAnchor('a2', 'source', { quote: 'term' }),
    );
    expect(ambiguous.state).toBe('ambiguous');
    expect(ambiguous.candidates).toHaveLength(2);
    expect(ambiguous.reason).toBe('multiple-candidates');
  });

  it('uses exact prefix and suffix to resolve exactly one repeated quote', () => {
    const content = doc(paragraph(text('x term y term z')));
    const anchor = textAnchor('a1', 'source', {
      quote: 'term',
      prefix: 'x ',
      suffix: ' y term z',
    });
    const resolution = resolveWithBranch(content, anchor);
    expect(resolution.state).toBe('resolved');
    expect(resolution.reason).toBe('unique-context');
    if (resolution.resolved?.range.kind === 'text') {
      expect(resolution.resolved.range.projectionStart).toBe(2);
    }
  });

  it('reports broken when the stored quote is absent', () => {
    const content = doc(paragraph(text('nothing here')));
    const resolution = resolveWithBranch(
      content,
      textAnchor('a1', 'source', { quote: 'missing' }),
    );
    expect(resolution.state).toBe('broken');
    expect(resolution.reason).toBe('quote-missing');
  });

  it('parses a legacy anchorId mark as a text binding', () => {
    const content = doc(
      paragraph({
        type: 'text',
        text: 'eigenvalue',
        marks: [{ type: 'anchor', attrs: { anchorId: 'a1' } }],
      }),
    );
    const resolution = resolveWithBranch(content, textAnchor('a1', 'source', { quote: 'eigenvalue' }));
    expect(resolution.state).toBe('resolved');
    expect(resolution.reason).toBe('exact-binding');
  });

  it('breaks a text binding that crosses a block-level atomic node', () => {
    const content = doc(
      paragraph(text('before ', ['a1'])),
      { type: 'mathBlock', attrs: { latex: 'x^2' } },
      paragraph(text('after', ['a1'])),
    );
    const resolution = resolveWithBranch(content, textAnchor('a1', 'source', { quote: 'before' }));
    expect(resolution.state).toBe('broken');
    expect(resolution.reason).toBe('crosses-barrier');
  });

  it('is idle without an outgoing branch and never reads lastKnown', () => {
    const { document } = baseDocument(doc(paragraph(text('term'))));
    document.anchors['a1'] = {
      ...textAnchor('a1', Object.keys(document.blocks)[0] ?? '', { quote: 'term' }),
      lastKnown: { contentOrder: 99, page: 7 },
    };
    const idle = resolveAnchor(document, 'a1');
    expect(idle.state).toBe('idle');
    expect(idle.reason).toBe('no-outgoing-branch');
    expect(idle.resolved).toBeNull();
    expect(resolveDocumentAnchors(document).counts.idle).toBe(1);
  });

  it('reports block-missing when the anchor block no longer exists', () => {
    const { document, blockId, targetBlockId } = baseDocument(doc(paragraph(text('term'))));
    const anchor = textAnchor('a1', blockId, { quote: 'term' });
    attach(document, anchor, targetBlockId);
    anchor.blockId = 'missing-block';
    document.anchors['a1'] = anchor;
    const resolution = resolveAnchor(document, 'a1');
    expect(resolution.state).toBe('block-missing');
    expect(resolution.reason).toBe('block-missing');
  });

  it('breaks a text record bound to an atomic node', () => {
    const content = doc({ type: 'mathBlock', attrs: { latex: 'x', anchorIds: ['a1'] } });
    const resolution = resolveWithBranch(content, textAnchor('a1', 'source', { quote: 'x' }));
    expect(resolution.state).toBe('broken');
    expect(resolution.reason).toBe('kind-mismatch');
  });
});

// ---------------------------------------------------------------------------
// Resolution — formula
// ---------------------------------------------------------------------------

describe('formula anchor resolution', () => {
  it('resolves multiple anchors on one formula node', () => {
    const content = doc(inlineMath('Av = \\lambda v', ['a1', 'a2']));
    const { document, blockId, targetBlockId } = baseDocument(content);
    attach(
      document,
      formulaAnchor('a1', blockId, { form: 'whole', latex: 'Av = \\lambda v' }),
      targetBlockId,
    );
    attach(
      document,
      formulaAnchor('a2', blockId, { form: 'term', latex: '\\lambda' }),
      targetBlockId,
    );
    expect(resolveAnchor(document, 'a1').state).toBe('resolved');
    expect(resolveAnchor(document, 'a2').state).toBe('resolved');
  });

  it('resolves a whole-formula node binding', () => {
    const content = doc(inlineMath('Av = \\lambda v', ['a1']));
    const anchor = formulaAnchor('a1', 'source', {
      form: 'whole',
      latex: 'Av = \\lambda v',
    });
    const resolution = resolveWithBranch(content, anchor);
    expect(resolution.state).toBe('resolved');
    expect(resolution.reason).toBe('exact-binding');
    expect(resolution.resolved?.range).toMatchObject({ kind: 'formula', form: 'whole' });
  });

  it('resolves a unique term and breaks a missing term', () => {
    const content = doc(inlineMath('Av = \\lambda v', ['a1']));
    expect(
      resolveWithBranch(
        content,
        formulaAnchor('a1', 'source', { form: 'term', latex: '\\lambda' }),
      ).state,
    ).toBe('resolved');
    expect(
      resolveWithBranch(
        content,
        formulaAnchor('a1', 'source', { form: 'term', latex: '\\mu' }),
      ).state,
    ).toBe('broken');
  });

  it('marks repeated terms ambiguous even with an occurrence hint', () => {
    const content = doc(inlineMath('\\lambda + \\lambda', ['a1']));
    const resolution = resolveWithBranch(
      content,
      formulaAnchor('a1', 'source', {
        form: 'term',
        latex: '\\lambda',
        occurrenceHint: 1,
      }),
    );
    expect(resolution.state).toBe('ambiguous');
    expect(resolution.candidates).toHaveLength(2);
  });

  it('keeps an invalid LaTeX source and resolves the whole-formula binding', () => {
    const content = doc(inlineMath('\\frac{', ['a1']));
    const resolution = resolveWithBranch(
      content,
      formulaAnchor('a1', 'source', { form: 'whole', latex: '\\frac{' }),
    );
    expect(resolution.state).toBe('resolved');
  });

  it('breaks an invalid formula form instead of guessing a whole formula', () => {
    const content = doc(inlineMath('x^2', ['a1']));
    const resolution = resolveWithBranch(
      content,
      formulaAnchor('a1', 'source', { form: 'bogus', latex: 'x^2' }),
    );
    expect(resolution.state).toBe('broken');
    expect(resolution.reason).toBe('invalid-selector');
  });

  it('resolves a unique selector fallback when the binding is missing', () => {
    const content = doc(inlineMath('Av = \\lambda v'));
    const resolution = resolveWithBranch(
      content,
      formulaAnchor('a1', 'source', { form: 'whole', latex: 'Av = \\lambda v' }),
    );
    expect(resolution.state).toBe('resolved');
    expect(resolution.reason).toBe('unique-quote');
  });

  it('resolves an M2 formula record without form as a whole formula binding', () => {
    const content = doc({
      type: 'inlineMath',
      attrs: { latex: 'Av = \\lambda v', anchorId: 'a1' },
    });
    const anchor: Anchor = {
      id: 'a1',
      blockId: 'source',
      kind: 'formula',
      selector: { kind: 'formula', quote: 'Av = \\lambda v' },
      quote: 'Av = \\lambda v',
    };
    const resolution = resolveWithBranch(content, anchor);
    expect(resolution.state).toBe('resolved');
    expect(resolution.reason).toBe('exact-binding');
    expect(resolution.issues.some((issue) => issue.code === 'invalid-selector')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Resolution — code
// ---------------------------------------------------------------------------

describe('code anchor resolution', () => {
  it('resolves a unique quote inside the bound code block', () => {
    const content = doc(codeBlock('xx eigvals(A)', ['a1']));
    const resolution = resolveWithBranch(
      content,
      codeAnchor('a1', 'source', {
        quote: 'eigvals',
        startOffset: 0,
        endOffset: 7,
      }),
    );
    expect(resolution.state).toBe('resolved');
    if (resolution.resolved?.range.kind === 'code') {
      expect(resolution.resolved.range.start).toBe(3);
      expect(resolution.resolved.range.end).toBe(10);
      expect(resolution.resolved.range.lineStart).toBe(1);
    }
  });

  it('keeps offsets as hints when the code shifts', () => {
    const content = doc(codeBlock('xx eigvals(A)', ['a1']));
    const resolution = resolveWithBranch(
      content,
      codeAnchor('a1', 'source', { quote: 'eigvals', startOffset: 100, endOffset: 107 }),
    );
    expect(resolution.state).toBe('resolved');
  });

  it('marks repeated quotes ambiguous even when the offset hint points at one', () => {
    const content = doc(codeBlock('eigvals = eigvals(A)', ['a1']));
    const resolution = resolveWithBranch(
      content,
      codeAnchor('a1', 'source', {
        quote: 'eigvals',
        startOffset: 0,
        endOffset: 7,
        occurrenceHint: 1,
      }),
    );
    expect(resolution.state).toBe('ambiguous');
    expect(resolution.candidates).toHaveLength(2);
  });

  it('keeps repeated quotes ambiguous even when context and offsets point at one', () => {
    const content = doc(codeBlock('eigvals = eigvals(A)', ['a1']));
    const resolution = resolveWithBranch(
      content,
      codeAnchor('a1', 'source', {
        quote: 'eigvals',
        prefix: '',
        suffix: ' = eigvals(A)',
        startOffset: 0,
        endOffset: 7,
        occurrenceHint: 1,
      }),
    );
    expect(resolution.state).toBe('ambiguous');
    expect(resolution.reason).toBe('multiple-candidates');
    expect(resolution.candidates).toHaveLength(2);
    expect(resolution.resolved).toBeNull();
  });

  it('breaks a missing quote and survives a language change', () => {
    const content = doc(codeBlock('const x = 1;', ['a1']));
    expect(
      resolveWithBranch(content, codeAnchor('a1', 'source', { quote: 'missing' })).state,
    ).toBe('broken');

    const changed = doc(codeBlock('const x = 1;', ['a1'], 'typescript'));
    expect(
      resolveWithBranch(changed, codeAnchor('a1', 'source', { quote: 'x = 1' })).state,
    ).toBe('resolved');
  });

  it('reads text from codeBlock children as well as attrs.text', () => {
    const content = doc({
      type: 'codeBlock',
      attrs: { language: 'ts', anchorIds: ['a1'] },
      children: [{ type: 'text', text: 'const token = 1;' }],
    });
    const resolution = resolveWithBranch(
      content,
      codeAnchor('a1', 'source', { quote: 'token' }),
    );
    expect(resolution.state).toBe('resolved');
  });

  it('resolves a unique code fallback and marks two code nodes ambiguous', () => {
    const one = doc(codeBlock('first token'), codeBlock('second'));
    expect(
      resolveWithBranch(one, codeAnchor('a1', 'source', { quote: 'token' })).state,
    ).toBe('resolved');

    const two = doc(codeBlock('first token'), codeBlock('second token'));
    expect(
      resolveWithBranch(two, codeAnchor('a2', 'source', { quote: 'token' })).state,
    ).toBe('ambiguous');
  });
});

// ---------------------------------------------------------------------------
// Resolution — image
// ---------------------------------------------------------------------------

describe('image anchor resolution', () => {
  function imageDocument(content: ContentNode): {
    document: Document;
    blockId: string;
    targetBlockId: string;
  } {
    const base = baseDocument(content);
    base.document.assets['asset-1'] = {
      id: 'asset-1',
      path: 'assets/one.png',
      mime: 'image/png',
    };
    base.document.assets['asset-2'] = {
      id: 'asset-2',
      path: 'assets/two.png',
      mime: 'image/png',
    };
    return base;
  }

  it('resolves an exact image node binding and ignores display resize', () => {
    const content = doc(image('asset-1', ['a1'], { displayWidth: 640, displayHeight: 480 }));
    const { document, blockId, targetBlockId } = imageDocument(content);
    attach(document, imageAnchor('a1', blockId, 'asset-1'), targetBlockId);
    const resolution = resolveAnchor(document, 'a1');
    expect(resolution.state).toBe('resolved');
    expect(resolution.resolved?.range).toMatchObject({
      kind: 'image',
      assetId: 'asset-1',
      point: false,
    });
  });

  it('resolves two regions on one image and two images sharing one asset', () => {
    const regions = doc(image('asset-1', ['a1', 'a2']));
    const first = imageDocument(regions);
    attach(
      first.document,
      imageAnchor('a1', first.blockId, 'asset-1', { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }),
      first.targetBlockId,
    );
    attach(
      first.document,
      imageAnchor('a2', first.blockId, 'asset-1', { x: 0.5, y: 0.5, width: 0.2, height: 0.2 }),
      first.targetBlockId,
    );
    expect(resolveAnchor(first.document, 'a1').state).toBe('resolved');
    expect(resolveAnchor(first.document, 'a2').state).toBe('resolved');

    const shared = doc(image('asset-1', ['a1']), image('asset-1', ['a2']));
    const second = imageDocument(shared);
    attach(second.document, imageAnchor('a1', second.blockId, 'asset-1'), second.targetBlockId);
    attach(second.document, imageAnchor('a2', second.blockId, 'asset-1'), second.targetBlockId);
    expect(resolveAnchor(second.document, 'a1').state).toBe('resolved');
    expect(resolveAnchor(second.document, 'a2').state).toBe('resolved');
  });

  it('breaks asset changes, crop changes, and missing assets without reattaching', () => {
    const changed = doc(image('asset-2', ['a1']));
    const changedBase = imageDocument(changed);
    attach(changedBase.document, imageAnchor('a1', changedBase.blockId, 'asset-1'), changedBase.targetBlockId);
    expect(resolveAnchor(changedBase.document, 'a1')).toMatchObject({
      state: 'broken',
      reason: 'asset-changed',
    });

    const cropped = doc(image('asset-1', ['a1'], { crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }));
    const croppedBase = imageDocument(cropped);
    attach(croppedBase.document, imageAnchor('a1', croppedBase.blockId, 'asset-1'), croppedBase.targetBlockId);
    expect(resolveAnchor(croppedBase.document, 'a1')).toMatchObject({
      state: 'broken',
      reason: 'crop-changed',
    });

    const missing = doc(image('asset-1', ['a1']));
    const missingBase = baseDocument(missing);
    const missingAnchor = imageAnchor('a1', missingBase.blockId, 'asset-1');
    attach(missingBase.document, missingAnchor, missingBase.targetBlockId);
    expect(resolveAnchor(missingBase.document, 'a1')).toMatchObject({
      state: 'broken',
      reason: 'asset-missing',
    });
  });

  it('requires confirmation for an image selector without a node binding', () => {
    const content = doc(image('asset-1'), image('asset-1'));
    const { document, blockId, targetBlockId } = imageDocument(content);
    attach(document, imageAnchor('a1', blockId, 'asset-1'), targetBlockId);
    const resolution = resolveAnchor(document, 'a1');
    expect(resolution.state).toBe('ambiguous');
    expect(resolution.reason).toBe('candidate-requires-confirmation');
    expect(resolution.candidates).toHaveLength(2);
  });

  it('breaks an invalid image rect selector', () => {
    const content = doc(image('asset-1', ['a1']));
    const { document, blockId, targetBlockId } = imageDocument(content);
    attach(
      document,
      imageAnchor('a1', blockId, 'asset-1', { x: 2, y: 0, width: 0.1, height: 0.1 }),
      targetBlockId,
    );
    const resolution = resolveAnchor(document, 'a1');
    expect(resolution.state).toBe('broken');
    expect(resolution.reason).toBe('invalid-selector');
  });
});

// ---------------------------------------------------------------------------
// Block/document resolution and mutation safety
// ---------------------------------------------------------------------------

describe('block and document resolution', () => {
  it('resolves all anchors in content order without mutating the document', () => {
    const content = doc(
      paragraph(text('first', ['a2']), text(' second', ['a1'])),
      paragraph(text('third', ['a3'])),
    );
    const { document, blockId, targetBlockId } = baseDocument(content);
    attach(document, textAnchor('a1', blockId, { quote: 'second' }), targetBlockId);
    attach(document, textAnchor('a2', blockId, { quote: 'first' }), targetBlockId);
    attach(document, textAnchor('a3', blockId, { quote: 'third' }), targetBlockId);
    const snapshot = JSON.stringify(document);
    deepFreeze(document);

    const blockResolutions = resolveBlockAnchors(document, blockId);
    expect(blockResolutions.map((entry) => entry.anchorId)).toEqual(['a2', 'a1', 'a3']);

    const all = resolveDocumentAnchors(document);
    expect(all.anchorIds).toEqual(['a1', 'a2', 'a3']);
    expect(all.counts).toEqual({
      resolved: 3,
      ambiguous: 0,
      broken: 0,
      idle: 0,
      'block-missing': 0,
    });
    expect(JSON.stringify(document)).toBe(snapshot);
    expect(() => validateDocument(document)).not.toThrow();
    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it('does not mutate selectors or content while resolving', () => {
    const content = doc(paragraph(text('Alpha', ['a1'])));
    const { document, blockId, targetBlockId } = baseDocument(content);
    const anchor = textAnchor('a1', blockId, { quote: 'alpha', prefix: 'A' });
    anchor.quote = 'mirror';
    attach(document, anchor, targetBlockId);
    const snapshot = JSON.stringify(document);
    const resolution = resolveAnchor(document, 'a1');
    expect(resolution.state).toBe('resolved');
    expect(resolution.issues.some((entry) => entry.code === 'selector-mismatch')).toBe(true);
    expect(JSON.stringify(document)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Validation A1–A12
// ---------------------------------------------------------------------------

describe('anchor validation A1–A12', () => {
  it('A1 rejects an anchor whose block does not exist', () => {
    const { document } = baseDocument(doc(paragraph(text('x'))));
    document.anchors['a1'] = {
      id: 'a1',
      blockId: 'missing-block',
      kind: 'text',
      selector: { kind: 'text', quote: 'x' },
    };
    const report = validateDocument(document);
    expect(report.ok).toBe(false);
    expect(report.errors.some((issue) => issue.code === 'dangling-anchor')).toBe(true);
  });

  it('A2 warns about a mark without a record and accepts a record without a binding', () => {
    const withMark = baseDocument(doc(paragraph(text('x', ['a1']))));
    const report = validateDocument(withMark.document);
    expect(report.ok).toBe(true);
    expect(
      report.warnings.some(
        (issue) => issue.code === 'anchor-without-record' && issue.ids?.includes('a1'),
      ),
    ).toBe(true);

    const recordOnly = baseDocument(doc(paragraph(text('x'))));
    recordOnly.document.anchors['a2'] = textAnchor('a2', recordOnly.blockId, { quote: 'x' });
    const recordReport = validateDocument(recordOnly.document);
    expect(recordReport.ok).toBe(true);
    expect(recordReport.warnings.filter((issue) => issue.code.startsWith('anchor-'))).toEqual([]);
  });

  it('A3 warns about disjoint runs and duplicate array entries', () => {
    const disjoint = baseDocument(
      doc(paragraph(text('one', ['a1']), text('gap'), text('two', ['a1']))),
    );
    attach(
      disjoint.document,
      textAnchor('a1', disjoint.blockId, { quote: 'one' }),
      disjoint.targetBlockId,
    );
    const report = validateDocument(disjoint.document);
    expect(report.ok).toBe(true);
    expect(report.warnings.some((issue) => issue.code === 'anchor-not-contiguous')).toBe(true);

    const duplicate = baseDocument(doc(paragraph(text('term', ['a1', 'a1']))));
    attach(
      duplicate.document,
      textAnchor('a1', duplicate.blockId, { quote: 'term' }),
      duplicate.targetBlockId,
    );
    const duplicateReport = validateDocument(duplicate.document);
    expect(
      duplicateReport.warnings.some((issue) => issue.code === 'duplicate-anchor-binding'),
    ).toBe(true);
  });

  it('A3 warns about one atomic ID in two nodes', () => {
    const { document, blockId, targetBlockId } = baseDocument(
      doc(codeBlock('one', ['a1']), codeBlock('two', ['a1'])),
    );
    attach(document, codeAnchor('a1', blockId, { quote: 'one' }), targetBlockId);
    const report = validateDocument(document);
    expect(
      report.warnings.some((issue) => issue.code === 'duplicate-anchor-binding'),
    ).toBe(true);
    expect(resolveAnchor(document, 'a1').reason).toBe('duplicate-binding');
  });

  it('A4 warns when the content node kind does not match', () => {
    const { document, blockId, targetBlockId } = baseDocument(
      doc({ type: 'mathBlock', attrs: { latex: 'x', anchorIds: ['a1'] } }),
    );
    attach(document, textAnchor('a1', blockId, { quote: 'x' }), targetBlockId);
    const report = validateDocument(document);
    expect(report.ok).toBe(true);
    expect(report.warnings.some((issue) => issue.code === 'anchor-kind-mismatch')).toBe(true);
  });

  it('A5 warns about invalid selectors and mirror disagreements', () => {
    const { document, blockId, targetBlockId } = baseDocument(doc(paragraph(text('Alpha', ['a1']))));
    const anchor = textAnchor('a1', blockId, { quote: 'Alpha' });
    anchor.selector = { kind: 'code', quote: 'Alpha' };
    anchor.quote = 'Different';
    attach(document, anchor, targetBlockId);
    const report = validateDocument(document);
    expect(report.ok).toBe(true);
    expect(report.warnings.some((issue) => issue.code === 'invalid-anchor-selector')).toBe(true);
    expect(report.warnings.some((issue) => issue.code === 'anchor-selector-mismatch')).toBe(true);
  });

  it('A8 reports duplicate source-target branches regardless of role', () => {
    const context = deterministicContext();
    let document = newDocument(context);
    const parent = addTopLevel(document, 'Parent', context);
    document = parent.document;
    const child = addChild(document, parent.blockId, 'Child', context);
    document = child.document;
    document.branches['duplicate-ref'] = {
      id: 'duplicate-ref',
      source: { blockId: parent.blockId },
      targetBlockId: child.blockId,
      role: 'reference',
      order: 'r',
    };
    const report = validateDocument(document);
    expect(report.ok).toBe(true);
    expect(report.warnings.some((issue) => issue.code === 'duplicate-branch')).toBe(true);
  });

  it('A9 warns about duplicate branch order within one port and role', () => {
    const context = deterministicContext();
    let document = newDocument(context);
    const source = addTopLevel(document, 'Source', context);
    document = source.document;
    const b = addTopLevel(document, 'B', context);
    document = b.document;
    const c = addTopLevel(document, 'C', context);
    document = c.document;
    document.branches['ref-b'] = {
      id: 'ref-b',
      source: { blockId: source.blockId },
      targetBlockId: b.blockId,
      role: 'reference',
      order: 'a',
    };
    document.branches['ref-c'] = {
      id: 'ref-c',
      source: { blockId: source.blockId },
      targetBlockId: c.blockId,
      role: 'reference',
      order: 'a',
    };
    const report = validateDocument(document);
    expect(report.ok).toBe(true);
    expect(report.warnings.some((issue) => issue.code === 'duplicate-branch-order')).toBe(true);
  });

  it('A10 still rejects a root in two chapters', () => {
    const { document, blockId } = baseDocument(doc(paragraph(text('x'))));
    document.chapters.push({
      id: 'chapter-2',
      title: 'Second',
      topLevelBlockIds: [blockId],
    });
    const report = validateDocument(document);
    expect(report.ok).toBe(false);
    expect(report.errors.some((issue) => issue.code === 'block-in-two-chapters')).toBe(true);
  });

  it('A11 keeps reference branches out of the primary traversal', () => {
    const { document, blockId, targetBlockId } = baseDocument(doc(paragraph(text('x'))));
    document.branches['see-also'] = {
      id: 'see-also',
      source: { blockId },
      targetBlockId,
      role: 'reference',
      order: 'a',
    };
    expect(directChildIds(document, blockId)).toEqual([]);
    expect(subtreeBlockIds(document, blockId)).toEqual([blockId]);
  });

  it('A12 preserves and flags unknown anchor kinds', () => {
    const { document, blockId, targetBlockId } = baseDocument(doc(paragraph(text('x'))));
    document.anchors['a1'] = {
      id: 'a1',
      blockId,
      kind: 'future-kind' as Anchor['kind'],
      selector: { kind: 'future-kind', payload: { kept: true } },
      extensions: { future: true },
    };
    attach(document, document.anchors['a1'] as Anchor, targetBlockId);
    const report = validateDocument(document);
    expect(report.ok).toBe(true);
    expect(report.warnings.some((issue) => issue.code === 'unsupported-anchor-kind')).toBe(true);
    expect(document.anchors['a1']?.selector).toEqual({
      kind: 'future-kind',
      payload: { kept: true },
    });
    const resolution = resolveAnchor(document, 'a1');
    expect(resolution.state).toBe('broken');
    expect(resolution.reason).toBe('unsupported-kind');
  });

  it('keeps every M2/M3 fixture valid and resolves its anchors', async () => {
    for (const name of ['golden-eigenvalues.json', 'broken-anchor.json', 'shared-child.json']) {
      const payload = await fs.readFile(fixturePath(name), 'utf8');
      const parsed = parseDocumentJson(payload);
      if (!parsed.ok) {
        throw new Error(`${name} does not validate: ${parsed.error.message}`);
      }
      expect(parsed.report.ok, name).toBe(true);
      expect(
        parsed.report.warnings.filter(
          (issue) =>
            issue.code === 'unsupported-m2-feature' && issue.message.toLowerCase().includes('anchor'),
        ),
        name,
      ).toEqual([]);
    }

    const golden = parseDocumentJson(
      await fs.readFile(fixturePath('golden-eigenvalues.json'), 'utf8'),
    );
    if (!golden.ok) throw new Error('golden fixture did not parse');
    expect(resolveAnchor(golden.document, 'a1').state).toBe('resolved');
    expect(resolveAnchor(golden.document, 'a2').state).toBe('resolved');
    // The golden fixture has no outgoing branch from a3, so it is idle (OD-2).
    expect(resolveAnchor(golden.document, 'a3').state).toBe('idle');

    const broken = parseDocumentJson(
      await fs.readFile(fixturePath('broken-anchor.json'), 'utf8'),
    );
    if (!broken.ok) throw new Error('broken-anchor fixture did not parse');
    expect(resolveAnchor(broken.document, 'f9-a1')).toMatchObject({
      state: 'broken',
      reason: 'quote-missing',
    });
    expect(resolveAnchor(broken.document, 'f9-a2')).toMatchObject({
      state: 'broken',
      reason: 'not-contiguous',
    });
  });
});

