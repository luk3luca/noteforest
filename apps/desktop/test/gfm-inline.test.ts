import { describe, expect, it } from 'vitest';
import {
  parseGfmInline,
  serializeGfmInline,
  type GfmInlineNode,
} from '../src/renderer/src/lib/gfm-inline';

function text(value: string, marks: string[] = []): GfmInlineNode {
  return { type: 'text', text: value, marks: marks as never };
}

function math(latex: string): GfmInlineNode {
  return { type: 'inlineMath', latex };
}

const breakNode: GfmInlineNode = { type: 'hardBreak' };

describe('GFM inline parser', () => {
  it('parses bold, italic and strike', () => {
    expect(parseGfmInline('**bold**')).toEqual([text('bold', ['bold'])]);
    expect(parseGfmInline('*italic*')).toEqual([text('italic', ['italic'])]);
    expect(parseGfmInline('~~strike~~')).toEqual([text('strike', ['strike'])]);
    expect(parseGfmInline('before **bold** after')).toEqual([
      text('before '),
      text('bold', ['bold']),
      text(' after'),
    ]);
  });

  it('parses nested marks as one flat text node per run', () => {
    expect(parseGfmInline('**bold *italic* text**')).toEqual([
      text('bold ', ['bold']),
      text('italic', ['bold', 'italic']),
      text(' text', ['bold']),
    ]);
    expect(parseGfmInline('~~a *b* c~~')).toEqual([
      text('a ', ['strike']),
      text('b', ['italic', 'strike']),
      text(' c', ['strike']),
    ]);
  });

  it('parses combined bold+italic runs and adjacent mark runs', () => {
    expect(parseGfmInline('***both***')).toEqual([text('both', ['bold', 'italic'])]);
    expect(parseGfmInline('*a***b**')).toEqual([
      text('a', ['italic']),
      text('b', ['bold']),
    ]);
    expect(parseGfmInline('**a***b*')).toEqual([
      text('a', ['bold']),
      text('b', ['italic']),
    ]);
  });

  it('parses inline code with a fence longer than its content', () => {
    expect(parseGfmInline('`code`')).toEqual([text('code', ['code'])]);
    expect(parseGfmInline('``a`b``')).toEqual([text('a`b', ['code'])]);
    expect(parseGfmInline('`**not bold**`')).toEqual([text('**not bold**', ['code'])]);
  });

  it('parses inline math with the editor input-rule guards', () => {
    expect(parseGfmInline('$x^2$')).toEqual([math('x^2')]);
    expect(parseGfmInline('a $a_1$ b')).toEqual([text('a '), math('a_1'), text(' b')]);
    expect(parseGfmInline('$5 and $10')).toEqual([text('$5 and $10')]);
    expect(parseGfmInline('$ x $')).toEqual([text('$ x $')]);
    expect(parseGfmInline('$x $')).toEqual([text('$x $')]);
    expect(parseGfmInline('$$x$$')).toEqual([text('$$x$$')]);
    expect(parseGfmInline('$x\ny$')).toEqual([text('$x'), breakNode, text('y$')]);
  });

  it('parses <br> and a newline as a hard break', () => {
    expect(parseGfmInline('a<br>b')).toEqual([text('a'), breakNode, text('b')]);
    expect(parseGfmInline('a<BR />b')).toEqual([text('a'), breakNode, text('b')]);
    expect(parseGfmInline('a\nb')).toEqual([text('a'), breakNode, text('b')]);
  });

  it('keeps unmatched delimiters literal', () => {
    expect(parseGfmInline('**bold')).toEqual([text('**bold')]);
    expect(parseGfmInline('*italic')).toEqual([text('*italic')]);
    expect(parseGfmInline('~~strike')).toEqual([text('~~strike')]);
    expect(parseGfmInline('`code')).toEqual([text('`code')]);
    expect(parseGfmInline('$math')).toEqual([text('$math')]);
    expect(parseGfmInline('****')).toEqual([text('****')]);
    expect(parseGfmInline('~~')).toEqual([text('~~')]);
  });

  it('unescapes escaped delimiters and keeps a lone backslash', () => {
    expect(parseGfmInline('\\*not italic\\*')).toEqual([text('*not italic*')]);
    expect(parseGfmInline('\\_not italic\\_')).toEqual([text('_not italic_')]);
    expect(parseGfmInline('\\`not code\\`')).toEqual([text('`not code`')]);
    expect(parseGfmInline('\\$5\\$')).toEqual([text('$5$')]);
    expect(parseGfmInline('\\~\\~')).toEqual([text('~~')]);
    expect(parseGfmInline('a\\\\b')).toEqual([text('a\\b')]);
    expect(parseGfmInline('a\\*')).toEqual([text('a*')]);
    expect(parseGfmInline('a\\')).toEqual([text('a\\')]);
  });

  it('keeps pipes and plain text untouched', () => {
    expect(parseGfmInline('a | b')).toEqual([text('a | b')]);
    expect(parseGfmInline('plain words')).toEqual([text('plain words')]);
    expect(parseGfmInline('')).toEqual([]);
  });
});

describe('GFM inline serializer', () => {
  it('writes marks, math and hard breaks', () => {
    expect(
      serializeGfmInline([
        text('bold', ['bold']),
        text(' '),
        text('italic', ['italic']),
        text(' '),
        text('strike', ['strike']),
        text(' '),
        text('code', ['code']),
        text(' '),
        math('x^2'),
        breakNode,
      ]),
    ).toBe('**bold** *italic* ~~strike~~ `code` $x^2$<br>');
  });

  it('escapes the inline delimiters and leaves pipes to the row layer', () => {
    expect(serializeGfmInline([text('a*b_c')])).toBe('a\\*b\\_c');
    expect(serializeGfmInline([text('a`b')])).toBe('a\\`b');
    expect(serializeGfmInline([text('$5')])).toBe('\\$5');
    expect(serializeGfmInline([text('a\\b')])).toBe('a\\\\b');
    expect(serializeGfmInline([text('a | b')])).toBe('a | b');
    expect(serializeGfmInline([text('~~x~~')])).toBe('\\~\\~x\\~\\~');
  });

  it('chooses a code fence longer than any backtick run', () => {
    expect(serializeGfmInline([text('a`b', ['code'])])).toBe('``a`b``');
    expect(serializeGfmInline([text('`a`', ['code'])])).toBe('`` `a` ``');
  });

  it('writes combined marks as one delimiter run', () => {
    expect(serializeGfmInline([text('both', ['bold', 'italic'])])).toBe('***both***');
    expect(
      serializeGfmInline([text('a', ['italic']), text('b', ['bold'])]),
    ).toBe('*a***b**');
    expect(
      serializeGfmInline([text('a', ['bold']), text('b', ['italic'])]),
    ).toBe('**a***b*');
  });

  it('splits a raw newline into a hard break', () => {
    expect(serializeGfmInline([text('a\nb')])).toBe('a<br>b');
  });

  it('round-trips every supported mark, math, break and escape', () => {
    const sources = [
      'plain',
      '**bold** and *italic* and ~~strike~~',
      '`code` and ``a`b``',
      'before $x^2$ after',
      'one<br>two',
      'escaped \\* \\_ \\` \\$ \\~ and a\\\\b',
      'a | b',
      '**bold *nested* text**',
      '***both***',
      '*a***b**',
      '**a***b*',
    ];
    for (const source of sources) {
      const first = parseGfmInline(source);
      const second = parseGfmInline(serializeGfmInline(first));
      expect(second, source).toEqual(first);
    }
  });
});
