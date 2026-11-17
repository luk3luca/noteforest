import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ContentNode } from '@noteforest/layout';
import {
  buildSegments,
  measurementCardHtml,
  segmentsHtml,
  type PageRenderSegment,
  type SegmentOptions,
} from '../src/renderer/src/page/segments';

/**
 * Find in Page plumbing guards (F4a, docs/design/highlight.md §6).
 *
 * Two things must stay true for the paint to work and for the paper to stay
 * clean:
 *
 * 1. every rendered page segment carries `data-node-path`, the content path the
 *    page model already has — the only link between a find offset and the DOM;
 * 2. the `::highlight()` rules are page-local, so the print compositor (which
 *    loads the same stylesheet and builds its own DOM from the print model)
 *    cannot paint a find highlight even if a registry name existed.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

const stylesSource = read('../src/renderer/src/styles.css');
const printCssSource = read('../src/renderer/src/print/print.css');
const printDocumentSource = read('../src/renderer/src/print/PrintDocument.tsx');
const printModelSource = read('../../../packages/pdf/src/printModel.ts');

const options: SegmentOptions = { assets: {}, tableColumns: {}, listIndent: 18 };

function text(value: string): ContentNode {
  return { type: 'text', text: value };
}

function paragraph(value: string): ContentNode {
  return { type: 'paragraph', children: [text(value)] };
}

const CODE = 'alpha\nbeta';

const blockContent: ContentNode = {
  type: 'doc',
  children: [
    paragraph('First paragraph'),
    { type: 'codeBlock', attrs: { text: CODE, language: 'ts' }, children: [text(CODE)] },
    {
      type: 'table',
      children: [
        {
          type: 'tableRow',
          children: [{ type: 'tableCell', children: [paragraph('Cell text')] }],
        },
      ],
    },
  ],
};

function segmentsOf(): PageRenderSegment[] {
  return buildSegments({ id: 'guard', content: blockContent }, options);
}

describe('find in Page plumbing', () => {
  it('tags every rendered segment with its content path', () => {
    const segments = segmentsOf();
    // paragraph [0], code lines [1,0] and [1,1], table row [2,0].
    expect(segments.map((segment) => segment.nodePath.join('.'))).toEqual([
      '0',
      '1.0',
      '1.1',
      '2.0',
    ]);
    const html = segmentsHtml(segments);
    for (const segment of segments) {
      expect(html).toContain(`data-node-path="${segment.nodePath.join('.')}"`);
    }
    // The tag appears once per segment: it is one attribute, never a wrapper.
    expect(html.match(/data-node-path=/g)).toHaveLength(segments.length);
    // The measurement card and the page card are the same markup.
    expect(measurementCardHtml({ id: 'guard', content: blockContent }, segments)).toContain(
      'data-node-path="0"',
    );
  });

  it('keeps the content path stable across a segment slice', () => {
    const segments = segmentsOf();
    const sliced = segmentsHtml(segments, 1, 3);
    expect(sliced).toContain('data-node-path="1.0"');
    expect(sliced).toContain('data-node-path="1.1"');
    expect(sliced).not.toContain('data-node-path="0"');
    expect(sliced).not.toContain('data-node-path="2.0"');
  });

  it('scopes both highlight rules to the live Page surface', () => {
    const css = stylesSource.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const rules = [...css.matchAll(/([^{}]*::highlight\([^)]*\)[^{}]*)\{/g)].map(([, selector]) =>
      selector!.trim(),
    );
    expect(rules).toEqual([
      '.nf-page-view ::highlight(nf-find)',
      '.nf-page-view ::highlight(nf-find-current)',
    ]);
    // Every highlight pseudo in the stylesheet is page-scoped: a global rule
    // would also style the print compositor's offscreen host, which shares the
    // app document in the M4c1 test surface.
    expect([...css.matchAll(/::highlight\(/g)]).toHaveLength(2);
    expect([...css.matchAll(/\.nf-page-view ::highlight\(/g)]).toHaveLength(2);
    expect(printCssSource).not.toContain('::highlight');
  });

  it('leaves the print compositor and the print model free of find highlighting', () => {
    for (const source of [printDocumentSource, printModelSource]) {
      expect(source).not.toMatch(/nf-find/);
      expect(source).not.toContain('CSS.highlights');
      expect(source).not.toContain('Highlight');
    }
  });
});
