import { describe, expect, it } from 'vitest';
import { createDocument, sequentialIdFactory, type ContentNode, type Document } from '@noteforest/core';
import {
  mentionsTableCells,
  unrepresentableTableCells,
} from '../src/main/table-cell-guard';

/**
 * VH1 part B: the table-cell load guard.
 *
 * The editor's cells are inline-only (one paragraph). Detection is pure; the
 * loader refuses a document with any other cell shape before it opens the
 * package, so no code path can project a rich cell into an inline-only one.
 */

function paragraph(...children: ContentNode[]): ContentNode {
  return children.length === 0
    ? { type: 'paragraph' }
    : { type: 'paragraph', children };
}

function text(value: string): ContentNode {
  return { type: 'text', text: value };
}

function list(...items: string[]): ContentNode {
  return {
    type: 'bulletList',
    children: items.map((item) => ({
      type: 'listItem',
      children: [paragraph(text(item))],
    })),
  };
}

/** One block whose body is `children`. */
function documentWith(...children: ContentNode[]): Document {
  const document = createDocument(
    { title: 'Guard' },
    { newId: sequentialIdFactory('guard'), now: () => '2026-11-17T00:00:00.000Z' },
  );
  document.blocks['block-1'] = {
    id: 'block-1',
    label: 'Table',
    content: { type: 'doc', children },
  };
  return document;
}

function cell(type: 'tableCell' | 'tableHeader', children: ContentNode[]): ContentNode {
  return { type, children };
}

/** A table whose first body cell is `children`. */
function tableWith(children: ContentNode[]): ContentNode {
  return {
    type: 'table',
    children: [
      {
        type: 'tableRow',
        children: [cell('tableHeader', [paragraph(text('Head'))])],
      },
      {
        type: 'tableRow',
        children: [cell('tableCell', children)],
      },
    ],
  };
}

describe('table-cell guard (VH1)', () => {
  it('accepts the inline-only cell the editor produces', () => {
    expect(
      unrepresentableTableCells(
        documentWith(tableWith([paragraph(text('one'), { type: 'hardBreak' }, text('two'))])),
      ),
    ).toEqual([]);
    expect(unrepresentableTableCells(documentWith(paragraph(text('no table'))))).toEqual([]);
  });

  it('refuses more than one paragraph', () => {
    const found = unrepresentableTableCells(
      documentWith(tableWith([paragraph(text('one')), paragraph(text('two'))])),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.blockId).toBe('block-1');
    expect(found[0]?.path).toBe('blocks.block-1.content.children.0.children.1.children.0');
    expect(found[0]?.message).toContain('holds 2 blocks (paragraph)');
  });

  it('refuses a list', () => {
    const found = unrepresentableTableCells(documentWith(tableWith([list('a', 'b')])));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('holds one bulletList block');
  });

  it('refuses a code block', () => {
    const found = unrepresentableTableCells(
      documentWith(tableWith([{ type: 'codeBlock', children: [text('const x = 1;')] }])),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('codeBlock');
  });

  it('refuses a nested table', () => {
    const found = unrepresentableTableCells(documentWith(tableWith([tableWith([paragraph(text('inner'))])])));
    expect(found).toHaveLength(1);
    expect(found[0]?.path).toBe('blocks.block-1.content.children.0.children.1.children.0');
    expect(found[0]?.message).toContain('holds one table block');
  });

  it('refuses an image', () => {
    const found = unrepresentableTableCells(
      documentWith(tableWith([{ type: 'image', attrs: { assetId: 'asset-1' } }])),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('holds one image block');
  });

  it('refuses a rule', () => {
    const found = unrepresentableTableCells(documentWith(tableWith([{ type: 'rule' }])));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('holds one rule block');
  });

  it('refuses a heading, a blockquote and a block formula', () => {
    for (const node of [
      { type: 'heading', attrs: { level: 2 }, children: [text('H')] },
      { type: 'blockquote', children: [paragraph(text('quote'))] },
      { type: 'mathBlock', attrs: { latex: 'x^2' } },
    ] satisfies ContentNode[]) {
      const found = unrepresentableTableCells(documentWith(tableWith([node])));
      expect(found, `${node.type} is refused`).toHaveLength(1);
      expect(found[0]?.message).toContain('one paragraph of inline content');
    }
  });

  it('refuses an empty cell and a cell without children', () => {
    const empty = unrepresentableTableCells(documentWith(tableWith([])));
    expect(empty).toHaveLength(1);
    expect(empty[0]?.message).toContain('has no content');
    const bareTable: ContentNode = {
      type: 'table',
      children: [{ type: 'tableRow', children: [{ type: 'tableCell' } as ContentNode] }],
    };
    const missing = unrepresentableTableCells(documentWith(bareTable));
    expect(missing).toHaveLength(1);
    expect(missing[0]?.path).toBe('blocks.block-1.content.children.0.children.0.children.0');
    expect(missing[0]?.message).toContain('has no content');
  });

  it('guards header cells too', () => {
    const found = unrepresentableTableCells(
      documentWith({
        type: 'table',
        children: [
          {
            type: 'tableRow',
            children: [cell('tableHeader', [paragraph(text('a')), paragraph(text('b'))])],
          },
        ],
      }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('table cell holds 2 blocks');
  });

  it('reports the offending block and cell across several blocks', () => {
    const document = documentWith(paragraph(text('clean')));
    document.blocks['block-2'] = {
      id: 'block-2',
      label: 'Second',
      content: { type: 'doc', children: [tableWith([list('x')])] },
    };
    document.blocks['block-3'] = {
      id: 'block-3',
      label: 'Third',
      content: { type: 'doc', children: [tableWith([paragraph(text('fine'))])] },
    };
    const found = unrepresentableTableCells(document);
    expect(found).toHaveLength(1);
    expect(found[0]?.blockId).toBe('block-2');
    expect(found[0]?.path).toBe('blocks.block-2.content.children.0.children.1.children.0');
  });

  it('detects a cell nested deeper inside a block body', () => {
    const found = unrepresentableTableCells(
      documentWith({ type: 'blockquote', children: [tableWith([list('nested')])] }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.path).toBe(
      'blocks.block-1.content.children.0.children.0.children.1.children.0',
    );
  });

  it('parses only documents that mention a table cell', () => {
    expect(mentionsTableCells('{"type":"paragraph"}')).toBe(false);
    expect(mentionsTableCells('{"type":"tableCell"}')).toBe(true);
    expect(mentionsTableCells('{"type":"tableHeader"}')).toBe(true);
  });
});
