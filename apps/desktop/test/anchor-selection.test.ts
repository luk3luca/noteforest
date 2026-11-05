import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import type { ContentNode } from '@noteforest/core';
import { createEditorExtensions } from '../src/renderer/src/editor/extensions';
import {
  contentToPM,
  pmToContent,
  stripAnchorBindings,
  type PMNode,
} from '../src/renderer/src/lib/adapter';
import { formulaBindingInBody, textBindingInBody } from '../src/renderer/src/lib/anchor-selection';

function body(...content: PMNode[]): PMNode {
  return { type: 'blockBody', content };
}

describe('editor selection -> core text binding', () => {
  it('maps text around inline math and leaves the atom unmarked', () => {
    const result = textBindingInBody(
      body({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Let ' },
          { type: 'inlineMath', attrs: { latex: '\\lambda' } },
          { type: 'text', text: ' be' },
        ],
      }),
      1,
      9,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.binding).toEqual({
      kind: 'text',
      ranges: [
        { nodePath: [0, 0], start: 0, end: 4 },
        { nodePath: [0, 2], start: 0, end: 3 },
      ],
    });
  });

  it('maps a selection across paragraphs inside one block', () => {
    const result = textBindingInBody(
      body(
        { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] },
      ),
      1,
      12,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.binding.ranges).toEqual([
      { nodePath: [0, 0], start: 0, end: 5 },
      { nodePath: [1, 0], start: 0, end: 4 },
    ]);
  });

  it('converts UTF-16 offsets to code-point offsets', () => {
    const result = textBindingInBody(
      body({ type: 'paragraph', content: [{ type: 'text', text: 'A😀B' }] }),
      2,
      4,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.binding.ranges).toEqual([{ nodePath: [0, 0], start: 1, end: 2 }]);
  });

  it('rejects a selection that crosses a block-level atomic node', () => {
    const result = textBindingInBody(
      body(
        { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
        { type: 'image', attrs: { src: 'asset.png' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
      ),
      1,
      20,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('crosses-barrier');
  });

  it('rejects a selection that crosses a table cell boundary', () => {
    const result = textBindingInBody(
      body({
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Left' }] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Right' }] }] },
            ],
          },
        ],
      }),
      2,
      16,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('crosses-cell');
  });

  it('rejects a selection made only of inline math', () => {
    const result = textBindingInBody(
      body({
        type: 'paragraph',
        content: [{ type: 'inlineMath', attrs: { latex: '\\lambda' } }],
      }),
      1,
      2,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no-text');
  });
});

describe('editor selection -> core whole-formula binding', () => {
  it('maps a selected block formula to its atomic node path', () => {
    const result = formulaBindingInBody(
      body(
        { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
        { type: 'blockMath', attrs: { latex: 'Av = \\lambda v' } },
      ),
      8,
    );
    expect(result).toEqual({
      ok: true,
      binding: { kind: 'formula', form: 'whole', nodePath: [1] },
      latex: 'Av = \\lambda v',
    });
  });

  it('maps a selected inline formula to the nested node path', () => {
    const result = formulaBindingInBody(
      body({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Let ' },
          { type: 'inlineMath', attrs: { latex: 'x^2' } },
          { type: 'text', text: ' be' },
        ],
      }),
      5,
    );
    expect(result).toEqual({
      ok: true,
      binding: { kind: 'formula', form: 'whole', nodePath: [0, 1] },
      latex: 'x^2',
    });
  });

  it('rejects a position that is not a formula node start', () => {
    const result = formulaBindingInBody(
      body({ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }),
      1,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no-formula');
  });
});

describe('formula anchor attributes in the core <-> ProseMirror adapter', () => {
  it('maps mathBlock/blockMath and keeps the atomic anchorIds array', () => {
    const core: ContentNode = {
      type: 'doc',
      children: [
        {
          type: 'mathBlock',
          attrs: { latex: 'E = mc^2', anchorIds: ['b', 'a'] },
        },
        { type: 'inlineMath', attrs: { latex: 'x', anchorIds: ['c'] } },
      ],
    };
    const pm = contentToPM(core);
    expect(pm.content?.[0]).toMatchObject({
      type: 'blockMath',
      attrs: { latex: 'E = mc^2', anchorIds: ['a', 'b'] },
    });
    expect(pm.content?.[1]).toMatchObject({
      type: 'inlineMath',
      attrs: { latex: 'x', anchorIds: ['c'] },
    });
    expect(pmToContent(pm)).toMatchObject({
      children: [
        { type: 'mathBlock', attrs: { latex: 'E = mc^2', anchorIds: ['a', 'b'] } },
        { type: 'inlineMath', attrs: { latex: 'x', anchorIds: ['c'] } },
      ],
    });
  });

  it('omits an empty atomic anchorIds array and folds the legacy single ID', () => {
    const core: ContentNode = {
      type: 'doc',
      children: [
        { type: 'inlineMath', attrs: { latex: 'x', anchorId: 'legacy' } },
        { type: 'mathBlock', attrs: { latex: 'y' } },
      ],
    };
    const pm = contentToPM(core);
    expect(pm.content?.[0]?.attrs).toEqual({ latex: 'x', anchorIds: ['legacy'] });
    expect(pm.content?.[1]?.attrs).toEqual({ latex: 'y' });

    const roundTrip = pmToContent(pm);
    expect(roundTrip.children?.[0]?.attrs).toEqual({ latex: 'x', anchorIds: ['legacy'] });
    expect(roundTrip.children?.[1]?.attrs).toEqual({ latex: 'y' });
  });
});

describe('anchor mark schema', () => {
  it('is non-inclusive at the end and carries anchorIds', () => {
    const schema = getSchema(createEditorExtensions());
    const mark = schema.marks['anchor'];
    expect(mark).toBeDefined();
    expect(mark?.spec.inclusive).toBe(false);
    expect(mark?.spec.attrs?.['anchorIds']).toMatchObject({ default: [] });
    expect(mark?.spec.toDOM).toBeDefined();
    expect(mark?.spec.parseDOM?.[0]?.tag).toBe('span[data-anchor-mark]');
  });
});

describe('anchor marks in the core <-> ProseMirror adapter', () => {
  it('keeps one sorted anchor mark and folds the legacy single ID', () => {
    const core: ContentNode = {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'eigenvalue',
              marks: [
                { type: 'bold' },
                { type: 'anchor', attrs: { anchorIds: ['b', 'a', 'a'] } },
                { type: 'anchor', attrs: { anchorId: 'c' } },
              ],
            },
          ],
        },
      ],
    };
    const pm = contentToPM(core);
    const marks = pm.content?.[0]?.content?.[0]?.marks ?? [];
    expect(marks).toHaveLength(2);
    expect(marks.find((mark) => mark.type === 'anchor')?.attrs).toEqual({
      anchorIds: ['a', 'b', 'c'],
    });
    expect(pmToContent(pm)).toMatchObject({
      children: [
        {
          children: [
            {
              text: 'eigenvalue',
              marks: [
                { type: 'bold' },
                { type: 'anchor', attrs: { anchorIds: ['a', 'b', 'c'] } },
              ],
            },
          ],
        },
      ],
    });
  });

  it('drops empty anchor marks instead of writing an empty array', () => {
    const core: ContentNode = {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'plain', marks: [{ type: 'anchor', attrs: { anchorIds: [] } }] },
          ],
        },
      ],
    };
    const pm = contentToPM(core);
    expect(pm.content?.[0]?.content?.[0]?.marks).toBeUndefined();
    expect(pmToContent(pm).children?.[0]?.content?.[0]?.marks).toBeUndefined();
  });

  it('strips anchor IDs from pasted inline content and atomic attrs', () => {
    const pasted: PMNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'eigenvalue',
              marks: [{ type: 'anchor', attrs: { anchorIds: ['a1'] } }],
            },
          ],
        },
        { type: 'image', attrs: { src: 'x.png', anchorIds: ['a2'] } },
      ],
    };
    const stripped = stripAnchorBindings(pasted);
    expect(stripped.content?.[0]?.content?.[0]?.marks).toBeUndefined();
    expect(stripped.content?.[1]?.attrs).toEqual({ src: 'x.png' });
    // The source (clipboard slice) is never mutated.
    expect(pasted.content?.[0]?.content?.[0]?.marks).toHaveLength(1);
    expect(pasted.content?.[1]?.attrs).toEqual({ src: 'x.png', anchorIds: ['a2'] });
  });
});
