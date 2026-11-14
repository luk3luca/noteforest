import { Schema, type Node as PMNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { codeMarkRangeIn } from '../src/renderer/src/lib/inline-code';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    codeBlock: { content: 'text*', group: 'block' },
    text: { group: 'inline' },
  },
  marks: {
    code: {},
  },
});

const code = schema.marks['code'];
if (code === undefined) throw new Error('schema is missing the code mark');

function paragraphWithCode(): PMNode {
  return schema.node('paragraph', null, [
    schema.text('Run '),
    schema.text('npm', [code.create()]),
    schema.text(' now'),
  ]);
}

describe('inline code range at the caret', () => {
  // Paragraph content starts at position 1: "Run " is 1–4, "npm" is 5–7, and
  // " now" starts at 8.
  const paragraph = paragraphWithCode();

  it('finds the marked range from anywhere inside it, including both ends', () => {
    expect(codeMarkRangeIn(paragraph, 1, 5, code)).toEqual({ from: 5, to: 8 });
    expect(codeMarkRangeIn(paragraph, 1, 6, code)).toEqual({ from: 5, to: 8 });
    expect(codeMarkRangeIn(paragraph, 1, 8, code)).toEqual({ from: 5, to: 8 });
  });

  it('returns null when the caret is outside the marked range', () => {
    expect(codeMarkRangeIn(paragraph, 1, 4, code)).toBeNull();
    expect(codeMarkRangeIn(paragraph, 1, 9, code)).toBeNull();
    expect(codeMarkRangeIn(paragraph, 1, 12, code)).toBeNull();
  });

  it('keeps two separated ranges independent', () => {
    const two = schema.node('paragraph', null, [
      schema.text('one', [code.create()]),
      schema.text(' and '),
      schema.text('two', [code.create()]),
    ]);
    expect(codeMarkRangeIn(two, 1, 2, code)).toEqual({ from: 1, to: 4 });
    expect(codeMarkRangeIn(two, 1, 11, code)).toEqual({ from: 9, to: 12 });
    expect(codeMarkRangeIn(two, 1, 6, code)).toBeNull();
  });

  it('ignores code blocks and non-textblocks', () => {
    const block = schema.node('codeBlock', null, [schema.text('const x = 1')]);
    expect(codeMarkRangeIn(block, 1, 3, code)).toBeNull();
    expect(codeMarkRangeIn(schema.node('doc', null, [paragraph]), 1, 6, code)).toBeNull();
  });

  it('returns null for a caret outside the textblock content', () => {
    expect(codeMarkRangeIn(paragraph, 1, 0, code)).toBeNull();
    expect(codeMarkRangeIn(paragraph, 1, 99, code)).toBeNull();
  });
});
