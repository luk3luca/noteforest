import { describe, expect, it } from 'vitest';
import type { ContentNode } from '@noteforest/core';
import {
  blockBodyContent,
  pmToContent,
  withBody,
  type PMNode,
} from '../src/renderer/src/lib/adapter';
import {
  blockContentFromEditorJson,
  editorJsonIsEmpty,
} from '../src/renderer/src/lib/page-edit';

const blockContent: ContentNode = {
  type: 'doc',
  children: [
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          text: 'Forest ',
          marks: [{ type: 'strong' }],
        },
        {
          type: 'text',
          text: 'anchor',
          marks: [{ type: 'anchor', attrs: { anchorIds: ['anchor-text'] } }],
        },
        { type: 'inlineMath', attrs: { latex: 'x^2' } },
      ],
    },
    {
      type: 'bulletList',
      children: [
        {
          type: 'listItem',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', text: 'First item' }],
            },
          ],
        },
      ],
    },
    {
      type: 'blockquote',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'Quoted study note.' }],
        },
      ],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'ts', anchorIds: ['anchor-code'] },
      children: [{ type: 'text', text: 'const value = 1;' }],
    },
    {
      type: 'mathBlock',
      attrs: { latex: '\\sum_i x_i', anchorIds: ['anchor-formula'] },
    },
    {
      type: 'image',
      attrs: {
        assetId: 'asset-forest',
        alt: 'Forest',
        width: 320,
        height: 180,
        anchorIds: ['anchor-image'],
      },
    },
    {
      type: 'table',
      children: [
        {
          type: 'tableRow',
          children: [
            {
              type: 'tableHeader',
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', text: 'Term' }],
                },
              ],
            },
            {
              type: 'tableCell',
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', text: 'Value' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('Page Edit content adapter', () => {
  it('round-trips a block body through the shared ProseMirror projection', () => {
    const projected = blockBodyContent(
      blockContent,
      new Set(['asset-forest']),
    );
    const edited = withBody(blockContent, {
      type: 'doc',
      children: projected.map((node) => pmToContent(node)),
    });
    expect(edited).toEqual(blockContent);
  });

  it('replaces only the body and preserves unknown root fields', () => {
    const base: ContentNode = {
      type: 'doc',
      attrs: { futureRootFlag: true },
      children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Old' }] }],
    };
    const editorJson: PMNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'New' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'math ' },
            { type: 'inlineMath', attrs: { latex: 'y=1' } },
          ],
        },
      ],
    };
    const result = blockContentFromEditorJson(base, editorJson);
    expect(result.attrs).toEqual({ futureRootFlag: true });
    expect(result.children).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: 'New' }] },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'math ' },
          { type: 'inlineMath', attrs: { latex: 'y=1' } },
        ],
      },
    ]);

    const empty = blockContentFromEditorJson(base, { type: 'doc' });
    expect(empty.children).toEqual([]);
    expect(empty.attrs).toEqual({ futureRootFlag: true });
  });

  it('detects an empty editor without treating atomic content as empty', () => {
    expect(editorJsonIsEmpty({ type: 'doc' })).toBe(true);
    expect(
      editorJsonIsEmpty({
        type: 'doc',
        content: [{ type: 'paragraph' }, { type: 'paragraph', content: [] }],
      }),
    ).toBe(true);
    expect(
      editorJsonIsEmpty({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
      }),
    ).toBe(false);
    expect(
      editorJsonIsEmpty({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: 'x' } }] },
        ],
      }),
    ).toBe(false);
    expect(
      editorJsonIsEmpty({
        type: 'doc',
        content: [{ type: 'image', attrs: { assetId: 'asset-1' } }],
      }),
    ).toBe(false);
    expect(
      editorJsonIsEmpty({
        type: 'doc',
        content: [{ type: 'codeBlock', content: [] }],
      }),
    ).toBe(false);
  });

  it('keeps anchor marks and atomic anchor ids through the round trip', () => {
    const projected = blockBodyContent(blockContent);
    const paragraph = projected[0] as PMNode;
    const anchorText = paragraph.content?.[1];
    expect(anchorText?.marks).toEqual([
      { type: 'anchor', attrs: { anchorIds: ['anchor-text'] } },
    ]);
    expect(projected[3]?.attrs).toMatchObject({ anchorIds: ['anchor-code'] });
    expect(projected[4]?.attrs).toMatchObject({ anchorIds: ['anchor-formula'] });
    expect(projected[5]?.attrs).toMatchObject({ anchorIds: ['anchor-image'] });

    const restored = withBody(blockContent, {
      type: 'doc',
      children: projected.map((node) => pmToContent(node)),
    });
    expect(restored).toEqual(blockContent);
  });
});
