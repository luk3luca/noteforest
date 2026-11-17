import { describe, expect, it } from 'vitest';
import type { ContentBlock, ContentNode, Document } from '@noteforest/core';
import { findInDocument, type FindResult } from '../src/renderer/src/lib/find';
import {
  mapFindResultToPageRanges,
  nodePathKey,
  type PageTextRange,
} from '../src/renderer/src/page/find-page-ranges';
import {
  buildSegments,
  type PageRenderSegment,
  type SegmentOptions,
} from '../src/renderer/src/page/segments';

/**
 * Find in Page offset mapping (F4a, docs/design/highlight.md §6).
 *
 * The mapping turns an engine result into `(page segment, offsets)` pairs: the
 * only thing the Page highlight needs to build a `Range` without touching the
 * measured DOM. These cases pin the shapes the page can produce — a phrase
 * across two segments, a boundary inside one segment, a match at the very start
 * of a block — and the one case the page cannot address (a code block rendered
 * inside an atomic container), which must be reported, never fatal.
 */

const TIMESTAMP = '2026-11-17T10:00:00.000Z';

function paragraph(...children: ContentNode[]): ContentNode {
  return { type: 'paragraph', children };
}

function text(value: string, marks?: ContentNode['marks']): ContentNode {
  const node: ContentNode = { type: 'text', text: value };
  if (marks !== undefined) node.marks = marks;
  return node;
}

function doc(...children: ContentNode[]): ContentNode {
  return { type: 'doc', children };
}

function block(id: string, content: ContentNode, label?: string): ContentBlock {
  return { id, content, ...(label === undefined ? {} : { label }) };
}

function codeBlock(value: string): ContentNode {
  return { type: 'codeBlock', attrs: { text: value, language: 'ts' }, children: [text(value)] };
}

function document(...blocks: ContentBlock[]): Document {
  return {
    schemaVersion: 2,
    id: 'find-page-ranges',
    title: 'Find page ranges',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    revision: 0,
    chapters: [
      {
        id: 'chapter-1',
        title: 'Study notes',
        topLevelBlockIds: blocks.map((entry) => entry.id),
      },
    ],
    blocks: Object.fromEntries(blocks.map((entry) => [entry.id, entry])),
    anchors: {},
    branches: {},
  };
}

function options(overrides: Partial<SegmentOptions> = {}): SegmentOptions {
  return { assets: {}, tableColumns: {}, listIndent: 18, ...overrides };
}

function segmentsOf(content: ContentBlock): PageRenderSegment[] {
  return buildSegments(content, options());
}

function resultsOf(content: Document, query: string, wholeWord = false): FindResult[] {
  return findInDocument(content, query, { wholeWord }).results;
}

/** The text a rendered segment shows, so offsets are checked against it. */
function renderedText(html: string): string {
  return html
    // A hard break renders `<br>` and stands for the one newline the projection
    // text has there: the offset coordinate counts it as one code point.
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function segmentByPath(
  segments: readonly PageRenderSegment[],
  nodePath: readonly number[],
): PageRenderSegment {
  const found = segments.find(
    (segment) => nodePathKey(segment.nodePath) === nodePathKey(nodePath),
  );
  expect(found, `segment ${nodePathKey(nodePath)} exists`).toBeDefined();
  return found!;
}

/** The rendered text each range covers, in order. */
function covered(
  ranges: readonly PageTextRange[],
  segments: readonly PageRenderSegment[],
): string[] {
  return ranges.map((range) => {
    const segment = segmentByPath(segments, range.nodePath);
    const body = renderedText(segment.html);
    expect(range.end).toBeLessThanOrEqual(Array.from(body).length);
    return Array.from(body).slice(range.start, range.end).join('');
  });
}

function mapFor(
  content: ContentBlock,
  result: FindResult,
  query: string,
  wholeWord = false,
) {
  const segments = segmentsOf(content);
  const mapping = mapFindResultToPageRanges({
    block: content,
    segments,
    result,
    query,
    wholeWord,
  });
  return { segments, mapping };
}

describe('find in Page offset mapping', () => {
  it('maps a match at the very start of a block to offset 0', () => {
    const content = block('alpha', doc(paragraph(text('Eigenvalue of A'))));
    const [result] = resultsOf(document(content), 'eigen');
    expect(result).toBeDefined();
    const { segments, mapping } = mapFor(content, result!, 'eigen');
    expect(mapping.unmapped).toBe(false);
    expect(mapping.ranges).toEqual([{ nodePath: [0], start: 0, end: 5 }]);
    expect(covered(mapping.ranges, segments)).toEqual(['Eigen']);
  });

  it('yields one range per segment for a phrase across two paragraphs', () => {
    const content = block('lines', doc(paragraph(text('come')), paragraph(text('qui'))));
    const [result] = resultsOf(document(content), 'come   qui');
    expect(result).toBeDefined();
    expect(result!.kind).toBe('text');
    const { segments, mapping } = mapFor(content, result!, 'come   qui');
    // One occurrence, two ranges: the same shape the Continuous decoration has.
    expect(mapping.ranges).toHaveLength(2);
    expect(mapping.ranges.map((range) => range.nodePath)).toEqual([[0], [1]]);
    expect(covered(mapping.ranges, segments)).toEqual(['come', 'qui']);
  });

  it('keeps the two halves of a hard-break boundary inside one segment', () => {
    const content = block(
      'break',
      doc(paragraph(text('alpha'), { type: 'hardBreak' } as ContentNode, text('beta'))),
    );
    const [result] = resultsOf(document(content), 'alpha beta');
    expect(result).toBeDefined();
    const { segments, mapping } = mapFor(content, result!, 'alpha beta');
    expect(mapping.ranges).toHaveLength(2);
    // The break renders one `<br>`, which is exactly the projection's newline:
    // the two text nodes meet across a one-character boundary and the rendered
    // text stays one string with the line break in it.
    expect(mapping.ranges).toEqual([
      { nodePath: [0], start: 0, end: 5 },
      { nodePath: [0], start: 6, end: 10 },
    ]);
    expect(covered(mapping.ranges, segments)).toEqual(['alpha', 'beta']);
    expect(renderedText(segmentByPath(segments, [0]).html)).toBe('alpha\nbeta');
  });

  it('offsets a match inside a second inline text node by the text before it', () => {
    const content = block(
      'marks',
      doc(paragraph(text('The '), text('eigen', [{ type: 'bold' }]), text('value'))),
    );
    const [result] = resultsOf(document(content), 'eigen');
    expect(result).toBeDefined();
    const { segments, mapping } = mapFor(content, result!, 'eigen');
    expect(mapping.ranges).toEqual([{ nodePath: [0], start: 4, end: 9 }]);
    expect(covered(mapping.ranges, segments)).toEqual(['eigen']);
  });

  it('splits a code match that spans two lines into two line ranges', () => {
    const content = block('code', doc(codeBlock('alpha\nbeta')));
    const [result] = resultsOf(document(content), 'alpha beta');
    expect(result).toBeDefined();
    expect(result!.field).toBe('code');
    const { segments, mapping } = mapFor(content, result!, 'alpha beta');
    expect(mapping.ranges.map((range) => range.nodePath)).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(covered(mapping.ranges, segments)).toEqual(['alpha', 'beta']);
  });

  it('keeps two code blocks of one block apart through the occurrence index', () => {
    const content = block('two', doc(codeBlock('needle = 1'), codeBlock('needle = 1')));
    const results = resultsOf(document(content), 'needle');
    expect(results).toHaveLength(2);
    // Both results report the same node-relative offsets; only the occurrence
    // index says which code block each one belongs to.
    expect(results[0]!.start).toBe(results[1]!.start);
    const first = mapFor(content, results[0]!, 'needle');
    const second = mapFor(content, results[1]!, 'needle');
    expect(first.mapping.ranges.map((range) => range.nodePath)).toEqual([[0, 0]]);
    expect(second.mapping.ranges.map((range) => range.nodePath)).toEqual([[1, 0]]);
    expect(covered(first.mapping.ranges, first.segments)).toEqual(['needle']);
    expect(covered(second.mapping.ranges, second.segments)).toEqual(['needle']);
  });

  it('maps a match inside a table cell to the row segment', () => {
    const content = block(
      'table',
      doc({
        type: 'table',
        children: [
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [paragraph(text('Alpha'))] },
              { type: 'tableCell', children: [paragraph(text('A needle here'))] },
            ],
          },
        ],
      }),
    );
    const [result] = resultsOf(document(content), 'needle');
    expect(result).toBeDefined();
    const { segments, mapping } = mapFor(content, result!, 'needle');
    expect(mapping.ranges).toHaveLength(1);
    expect(mapping.ranges[0]!.nodePath).toEqual([0, 0]);
    expect(covered(mapping.ranges, segments)).toEqual(['needle']);
  });

  it('reports a code block inside an atomic container as unmapped', () => {
    const content = block(
      'quote',
      doc({ type: 'blockquote', children: [paragraph(text('A quote')), codeBlock('needle')] }),
    );
    const [result] = resultsOf(document(content), 'needle');
    expect(result).toBeDefined();
    expect(result!.field).toBe('code');
    const { mapping } = mapFor(content, result!, 'needle');
    // Recorded, never fatal: the blockquote renders one segment, not one per
    // code line, so the page cannot address the code text.
    expect(mapping).toEqual({ ranges: [], unmapped: true });
  });

  it('reports fields with no page text as unmapped', () => {
    const content = block(
      'formula',
      doc(
        paragraph(
          text('The spectrum '),
          { type: 'inlineMath', attrs: { latex: '\\sigma(A)' } } as ContentNode,
        ),
      ),
    );
    const [result] = resultsOf(document(content), 'sigma');
    expect(result).toBeDefined();
    expect(result!.field).toBe('formula');
    const { mapping } = mapFor(content, result!, 'sigma');
    expect(mapping).toEqual({ ranges: [], unmapped: true });
  });

  it('is pure: the same input always yields the same ranges', () => {
    const content = block('alpha', doc(paragraph(text('Eigenvalue of A'))));
    const [result] = resultsOf(document(content), 'eigen');
    const first = mapFor(content, result!, 'eigen').mapping;
    const second = mapFor(content, result!, 'eigen').mapping;
    expect(second).toEqual(first);
  });
});
