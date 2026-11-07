import { describe, expect, it } from 'vitest';
import type { AnchorRecord, ContentNode } from '@noteforest/layout';
import {
  buildSegments,
  katexHtml,
  labelHtml,
  measurementCardHtml,
  segmentsHtml,
  type PageContentBlock,
  type SegmentOptions,
} from '../src/renderer/src/page/segments';

const assets = {
  'asset-image': 'noteforest-asset://asset/asset-image',
};

function options(overrides: Partial<SegmentOptions> = {}): SegmentOptions {
  return {
    assets,
    tableColumns: {},
    listIndent: 18,
    ...overrides,
  };
}

function block(children: ContentNode[], label?: string): PageContentBlock {
  return {
    id: 'b1',
    ...(label === undefined ? {} : { label }),
    content: { type: 'doc', children },
  };
}

function text(value: string, marks?: ContentNode['marks']): ContentNode {
  return {
    type: 'text',
    text: value,
    ...(marks === undefined ? {} : { marks }),
  };
}

function paragraph(value: string, marks?: ContentNode['marks']): ContentNode {
  return { type: 'paragraph', children: [text(value, marks)] };
}

describe('static page segments', () => {
  it('renders the current content model with safe segment boundaries', () => {
    const content: ContentNode[] = [
      paragraph('Intro <value>'),
      { type: 'heading', attrs: { level: 2 }, children: [text('Heading')] },
      {
        type: 'bulletList',
        children: [
          { type: 'listItem', children: [paragraph('First item')] },
          {
            type: 'listItem',
            children: [
              paragraph('Second item'),
              {
                type: 'orderedList',
                attrs: { start: 3 },
                children: [{ type: 'listItem', children: [paragraph('Nested item')] }],
              },
            ],
          },
        ],
      },
      {
        type: 'blockquote',
        children: [paragraph('Quoted line')],
      },
      {
        type: 'codeBlock',
        attrs: { text: 'const a = 1;\nconst b = 2;' },
        children: [text('const a = 1;\nconst b = 2;')],
      },
      { type: 'blockMath', attrs: { latex: 'x^2' } },
      { type: 'mathBlock', attrs: { latex: 'y^2' } },
      {
        type: 'image',
        attrs: { assetId: 'asset-image', alt: 'Diagram', width: 320, height: 200 },
      },
      {
        type: 'table',
        attrs: { headerRow: true },
        children: [
          {
            type: 'tableRow',
            children: [
              { type: 'tableHeader', children: [paragraph('λ')] },
              { type: 'tableHeader', children: [paragraph('vector')] },
            ],
          },
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [paragraph('1')] },
              { type: 'tableCell', children: [paragraph('(1, −1)')] },
            ],
          },
        ],
      },
    ];
    const segments = buildSegments(block(content), options());

    expect(segments.map((segment) => segment.kind)).toEqual([
      'paragraph',
      'heading',
      'list-item',
      'list-item',
      'list-item',
      'blockquote-paragraph',
      'code-line',
      'code-line',
      'math',
      'math',
      'image',
      'table-row',
      'table-row',
    ]);
    expect(segments.map((segment) => segment.index)).toEqual(
      segments.map((_, index) => index),
    );
    expect(segments.map((segment) => segment.breakableBefore)).toEqual(
      segments.map((_, index) => index > 0),
    );
    expect(segments[0]!.html).toContain('Intro &lt;value&gt;');
    expect(segments[2]!.html).toContain('nf-li');
    expect(segments[3]!.html).toContain('Second item');
    expect(segments[4]!.html).toContain('3.');
    expect(segments[6]!.kind).toBe('code-line');
    expect(segments[7]!.html).toContain('const b = 2;');
    expect(segments[8]!.html).toContain('katex');
    expect(segments[9]!.html).toContain('display');
    expect(segments[10]!.html).toContain('noteforest-asset://asset/asset-image');
    expect(segments[11]!.tableKey).toBe('8');
    expect(segments[11]!.rowIndex).toBe(0);
    expect(segments[11]!.html).toContain('nf-table-row-header');
    expect(segments[12]!.rowIndex).toBe(1);
    expect(segments[12]!.html).toContain('(1, −1)');
  });

  it('wraps text, formula, code, and image anchors as measurement sources', () => {
    const anchors: AnchorRecord[] = [
      {
        id: 'a-code',
        blockId: 'b1',
        kind: 'code',
        quote: 'const b',
        codeToken: 'const b',
      },
    ];
    const content: ContentNode[] = [
      paragraph(
        'Anchor me',
        [{ type: 'anchor', attrs: { anchorIds: ['a-text'] } }],
      ),
      {
        type: 'paragraph',
        children: [
          { type: 'inlineMath', attrs: { latex: 'π', anchorIds: ['a-inline'] } },
        ],
      },
      {
        type: 'codeBlock',
        attrs: { text: 'const a = 1;\nconst b = 2;', anchorIds: ['a-code', 'a-whole'] },
        children: [text('const a = 1;\nconst b = 2;')],
      },
      {
        type: 'blockMath',
        attrs: { latex: 'z', anchorIds: ['a-block'] },
      },
      {
        type: 'image',
        attrs: {
          assetId: 'asset-image',
          alt: 'Diagram',
          anchorIds: ['a-image'],
        },
      },
    ];
    const segments = buildSegments(block(content), options({ anchors }));
    expect(segments[0]!.html).toContain('data-anchor-id="a-text"');
    expect(segments[1]!.html).toContain('data-anchor-id="a-inline"');
    expect(segments[2]!.html).not.toContain('data-anchor-id="a-code"');
    expect(segments[3]!.html).toContain('data-anchor-id="a-code"');
    // The whole-code anchor without a token hint is attached to the first line.
    expect(segments[2]!.html).toContain('data-anchor-id="a-whole"');
    expect(segments[4]!.html).toContain('data-anchor-id="a-block"');
    expect(segments[5]!.html).toContain('data-anchor-id="a-image"');
  });

  it('keeps block content inside an atomic table row or list item', () => {
    const content: ContentNode[] = [
      {
        type: 'table',
        children: [
          {
            type: 'tableRow',
            children: [
              {
                type: 'tableCell',
                children: [
                  {
                    type: 'bulletList',
                    children: [
                      { type: 'listItem', children: [paragraph('cell item one')] },
                      { type: 'listItem', children: [paragraph('cell item two')] },
                    ],
                  },
                  {
                    type: 'codeBlock',
                    attrs: { text: 'cellCode();' },
                    children: [text('cellCode();')],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'bulletList',
        children: [
          {
            type: 'listItem',
            children: [
              paragraph('item with math'),
              { type: 'blockMath', attrs: { latex: 'a+b' } },
            ],
          },
        ],
      },
    ];
    const segments = buildSegments(block(content), options());
    expect(segments[0]!.html).toContain('cell item one');
    expect(segments[0]!.html).toContain('cell item two');
    expect(segments[0]!.html).toContain('cellCode();');
    expect(segments[0]!.html).toContain('nf-li');
    expect(segments[0]!.html).toContain('nf-code-line');
    expect(segments[1]!.kind).toBe('list-item');
    expect(segments[1]!.html).toContain('nf-math-display');
  });

  it('renders a labeled placeholder for a missing or unsupported asset', () => {
    const content: ContentNode[] = [
      { type: 'image', attrs: { assetId: 'missing-asset', alt: 'Lost diagram' } },
      { type: 'image', attrs: { alt: 'No id' } },
    ];
    const segments = buildSegments(block(content), options());
    expect(segments[0]!.html).toContain('data-missing-asset="missing-asset"');
    expect(segments[0]!.html).toContain('Missing image: Lost diagram');
    expect(segments[1]!.html).toContain('data-missing-asset="unsupported"');
    expect(segments[1]!.html).toContain('Missing image: No id');
  });

  it('keeps invalid LaTeX as visible source and unknown nodes explicit', () => {
    expect(katexHtml('\\frac{1}{', true)).toContain('nf-math-error');
    const segments = buildSegments(
      block([
        { type: 'futureNode', children: [text('kept text')] },
        { type: 'emptyFutureNode' },
      ]),
      options(),
    );
    expect(segments[0]!.html).toContain('data-unknown-node="futureNode"');
    expect(segments[0]!.html).toContain('kept text');
    expect(segments[1]!.html).toContain('[Unsupported content: emptyFutureNode]');
  });

  it('produces the label, measurement card, and sliced segment HTML', () => {
    const content = [paragraph('One'), paragraph('Two'), paragraph('Three')];
    const segments = buildSegments(block(content, 'Label'), options());
    expect(labelHtml(block(content, 'Label'))).toContain('nf-label');
    expect(labelHtml(block(content))).toBe('');
    const card = measurementCardHtml(block(content, 'Label'), segments);
    expect(card).toContain('nf-page-card nf-measure-card');
    expect(card).toContain('nf-label');
    expect(card).toContain('data-seg="0"');
    const sliced = segmentsHtml(segments, 1, 3);
    expect(sliced).not.toContain('One');
    expect(sliced).toContain('Two');
    expect(sliced).toContain('Three');
    expect(sliced.match(/data-seg=/g)?.length).toBe(2);
  });
});
