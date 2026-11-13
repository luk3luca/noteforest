import { describe, expect, it } from 'vitest';
import type { ContentNode } from '@noteforest/core';
import {
  codeFenceLanguageToken,
  codeLanguageLabel,
  normalizeCodeLanguage,
  parseCodeFenceParagraph,
} from '../src/renderer/src/lib/code-fence';
import {
  findInlineMathInput,
  isBlockMathEnterTrigger,
  parseBlockMathParagraph,
  unwrapFormulaSource,
} from '../src/renderer/src/lib/formula-input';
import {
  escapeGfmCell,
  gfmAlignmentRow,
  gfmFromTableNode,
  parseGfmTable,
  serializeGfmTable,
  splitGfmRow,
} from '../src/renderer/src/lib/gfm-table';
import {
  isInlineOnlyCell,
  normalizeTableCellChildren,
} from '../src/renderer/src/lib/table-cell';
import {
  rememberTableSize,
  rememberedTableSize,
  TABLE_PICKER_MAX,
  TABLE_PICKER_MIN,
} from '../src/renderer/src/lib/table-insert';

function paragraph(...children: ContentNode[]): ContentNode {
  return children.length === 0
    ? { type: 'paragraph' }
    : { type: 'paragraph', children };
}

function text(value: string): ContentNode {
  return { type: 'text', text: value };
}

describe('code fence parsing (A)', () => {
  it('accepts exactly three backticks with an optional language token', () => {
    expect(parseCodeFenceParagraph('```')).toBe('');
    expect(parseCodeFenceParagraph('```python')).toBe('python');
    expect(parseCodeFenceParagraph('```c++')).toBe('c++');
    expect(parseCodeFenceParagraph('text ```')).toBeNull();
    expect(parseCodeFenceParagraph('```py extra')).toBeNull();
    expect(parseCodeFenceParagraph('```py`')).toBeNull();
    expect(parseCodeFenceParagraph('``')).toBeNull();
  });

  it('stores an empty language as plaintext', () => {
    expect(normalizeCodeLanguage('')).toBe('plaintext');
    expect(normalizeCodeLanguage('   ')).toBe('plaintext');
    expect(normalizeCodeLanguage(null)).toBe('plaintext');
    expect(normalizeCodeLanguage(' Python ')).toBe('Python');
    expect(codeLanguageLabel('plaintext')).toBeNull();
    expect(codeLanguageLabel('')).toBeNull();
    expect(codeLanguageLabel(undefined)).toBeNull();
    expect(codeLanguageLabel('python')).toBe('python');
    expect(codeFenceLanguageToken('plaintext')).toBe('');
    expect(codeFenceLanguageToken('ts')).toBe('ts');
  });
});

describe('formula input guards (C)', () => {
  it('matches $…$ with the Obsidian guards', () => {
    expect(findInlineMathInput('$2*2$')?.latex).toBe('2*2');
    expect(findInlineMathInput('$a_1$')?.latex).toBe('a_1');
    expect(findInlineMathInput('$x^2$')?.latex).toBe('x^2');
    expect(findInlineMathInput('$100$')?.latex).toBe('100');
    expect(findInlineMathInput('text $x$ more')?.latex).toBe('x');
  });

  it('rejects spaces at either edge, newlines, inner $ and $$ delimiters', () => {
    expect(findInlineMathInput('$ x$')).toBeNull();
    expect(findInlineMathInput('$x $')).toBeNull();
    expect(findInlineMathInput('$x\ny$')).toBeNull();
    expect(findInlineMathInput('$5 and $6')).toBeNull();
    expect(findInlineMathInput('$a$b$c$')?.latex).toBe('a');
    expect(findInlineMathInput('$$x$$')).toBeNull();
    expect(findInlineMathInput('$$$x$$$')).toBeNull();
  });

  it('parses $$…$$ only as a whole paragraph', () => {
    expect(parseBlockMathParagraph('$$E=mc^2$$')).toBe('E=mc^2');
    expect(parseBlockMathParagraph('before $$E=mc^2$$')).toBeNull();
    expect(parseBlockMathParagraph('$$a$b$$')).toBeNull();
    expect(parseBlockMathParagraph('$$$$')).toBeNull();
    expect(isBlockMathEnterTrigger('$$')).toBe(true);
    expect(isBlockMathEnterTrigger('$')).toBe(false);
  });

  it('unwraps a matching delimiter pair for the source editor', () => {
    expect(unwrapFormulaSource('$x^2$')).toBe('x^2');
    expect(unwrapFormulaSource('$$E=mc^2$$')).toBe('E=mc^2');
    expect(unwrapFormulaSource('x^2')).toBe('x^2');
    expect(unwrapFormulaSource('$x')).toBe('$x');
  });
});

describe('GFM table parser (D)', () => {
  const table = [
    '| Name | Value |',
    '| --- | :---: |',
    '| lambda | 1.25 |',
  ].join('\n');

  it('parses a header, alignment row and data rows', () => {
    expect(parseGfmTable(table)).toEqual({
      header: ['Name', 'Value'],
      align: [null, 'center'],
      rows: [['lambda', '1.25']],
    });
  });

  it('requires a delimiter row and at least one data row', () => {
    expect(parseGfmTable('| Name | Value |\n| lambda | 1.25 |')).toBeNull();
    expect(parseGfmTable('| Name | Value |\n| --- | --- |')).toBeNull();
    expect(parseGfmTable('Name | Value\n--- | ---\nlambda | 1.25')).toEqual({
      header: ['Name', 'Value'],
      align: [null, null],
      rows: [['lambda', '1.25']],
    });
  });

  it('rejects inconsistent column counts', () => {
    expect(
      parseGfmTable('| a | b |\n| --- | --- |\n| 1 |'),
    ).toBeNull();
    expect(
      parseGfmTable('| a | b |\n| --- | --- |\n| 1 | 2 | 3 |'),
    ).toBeNull();
    expect(
      parseGfmTable('| a | b |\n| --- |\n| 1 | 2 |'),
    ).toBeNull();
  });

  it('tolerates blank lines around the table only', () => {
    expect(parseGfmTable(`\n${table}\n\n`)?.rows).toEqual([['lambda', '1.25']]);
    expect(parseGfmTable(`| a | b |\n| --- | --- |\n| 1 | 2 |\n\ntail`)).toBeNull();
  });

  it('splits escaped pipes and maps <br> to a hard break', () => {
    expect(splitGfmRow('| a \\| b | c |')).toEqual(['a | b', 'c']);
    expect(parseGfmTable('| a | b |\n| --- | --- |\n| 1<br>2 | 3 |')?.rows).toEqual([
      ['1\n2', '3'],
    ]);
  });
});

describe('GFM table serializer (D)', () => {
  it('escapes pipes, writes <br> and the alignment row', () => {
    expect(escapeGfmCell('a | b')).toBe('a \\| b');
    expect(escapeGfmCell('a\nb')).toBe('a<br>b');
    expect(gfmAlignmentRow(['left', 'center', 'right', null])).toBe(
      '| :--- | :---: | ---: | --- |',
    );
    expect(
      serializeGfmTable({
        header: ['A | B', 'C'],
        align: ['right', null],
        rows: [['1\n2', '|']],
      }),
    ).toBe('| A \\| B | C |\n| ---: | --- |\n| 1<br>2 | \\| |');
  });

  it('round-trips its own output through the parser', () => {
    const data = {
      header: ['A | B', 'C'],
      align: ['right', 'center'] as const,
      rows: [['1\n2', '|']],
    };
    const parsed = parseGfmTable(serializeGfmTable({ ...data, align: [...data.align] }));
    expect(parsed).toEqual({
      header: ['A | B', 'C'],
      align: ['right', 'center'],
      rows: [['1\n2', '|']],
    });
  });

  it('serializes a table node with header alignment', () => {
    const table = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', attrs: { align: 'center' }, content: [paragraph(text('Name'))] },
            { type: 'tableHeader', content: [paragraph(text('Value'))] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [paragraph(text('lambda'))] },
            { type: 'tableCell', content: [paragraph(text('1 | 2'))] },
          ],
        },
      ],
    };
    expect(gfmFromTableNode(table)).toBe(
      '| Name | Value |\n| :---: | --- |\n| lambda | 1 \\| 2 |',
    );
    expect(gfmFromTableNode({ type: 'paragraph' })).toBeNull();
  });
});

describe('inline-only cell normalisation (D)', () => {
  it('keeps an already inline cell unchanged', () => {
    const cell = [paragraph(text('one'))];
    expect(normalizeTableCellChildren(cell)).toBe(cell);
    expect(isInlineOnlyCell(cell)).toBe(true);
  });

  it('joins paragraphs with hard breaks', () => {
    expect(
      normalizeTableCellChildren([paragraph(text('one')), paragraph(text('two'))]),
    ).toEqual([
      {
        type: 'paragraph',
        children: [text('one'), { type: 'hardBreak' }, text('two')],
      },
    ]);
  });

  it('maps list items to one line each', () => {
    const list: ContentNode = {
      type: 'bulletList',
      children: [
        { type: 'listItem', children: [paragraph(text('a'))] },
        { type: 'listItem', children: [paragraph(text('b'))] },
      ],
    };
    expect(normalizeTableCellChildren([paragraph(text('head')), list])).toEqual([
      {
        type: 'paragraph',
        children: [
          text('head'),
          { type: 'hardBreak' },
          text('a'),
          { type: 'hardBreak' },
          text('b'),
        ],
      },
    ]);
  });

  it('flattens a code block and a block formula to inline content', () => {
    expect(
      normalizeTableCellChildren([
        { type: 'codeBlock', children: [text('const x = 1;')] },
      ]),
    ).toEqual([paragraph(text('const x = 1;'))]);
    expect(
      normalizeTableCellChildren([{ type: 'mathBlock', attrs: { latex: 'x^2' } }]),
    ).toEqual([paragraph({ type: 'inlineMath', attrs: { latex: 'x^2' } })]);
  });

  it('turns an empty rich cell into one empty paragraph', () => {
    expect(normalizeTableCellChildren([])).toEqual([{ type: 'paragraph' }]);
    expect(normalizeTableCellChildren(undefined)).toEqual([{ type: 'paragraph' }]);
    expect(isInlineOnlyCell(undefined)).toBe(false);
  });
});

describe('table insert picker memory (D)', () => {
  it('remembers the last size and clamps to 1–10', () => {
    rememberTableSize(4, 6);
    expect(rememberedTableSize()).toEqual({ rows: 4, cols: 6 });
    rememberTableSize(0, 99);
    expect(rememberedTableSize()).toEqual({
      rows: TABLE_PICKER_MIN,
      cols: TABLE_PICKER_MAX,
    });
    rememberTableSize(3, 3);
  });
});
