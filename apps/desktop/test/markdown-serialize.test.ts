import { describe, expect, it } from 'vitest';
import {
  parseMarkdown,
  type MarkdownDocumentJson,
  type MarkdownNodeJson,
} from '../src/renderer/src/markdown/markdown-parse';
import { serializeMarkdown } from '../src/renderer/src/markdown/markdown-serialize';

const ROUND_TRIP = `# Heading

Paragraph with *italic*, **bold**, ~~strike~~, \`inline code\` and a [link](https://example.com).

A hard break\\
continues.

- bullet one
  - nested bullet
- bullet two

1. ordered one
2. ordered two

> quoted first
>
> quoted second

\`\`\`ts
const value = 1;
\`\`\`

| Left | Center | Right |
| :--- | :---: | ---: |
| a | b | c |

Inline $x^2$ math.

$$
a^2 + b^2 = c^2
$$

---

![Local](assets/pic.png)
`;

function collect(node: MarkdownNodeJson): MarkdownNodeJson[] {
  return [node, ...(node.content ?? []).flatMap(collect)];
}

function canonical(document: MarkdownDocumentJson): string {
  return JSON.stringify(document);
}

describe('Markdown serializer', () => {
  it('serializes every declared block and mark with normalized Markdown', () => {
    const markdown = serializeMarkdown(parseMarkdown(ROUND_TRIP));
    expect(markdown).toContain('# Heading');
    expect(markdown).toContain('**bold**');
    expect(markdown).toContain('*italic*');
    expect(markdown).toContain('~~strike~~');
    expect(markdown).toContain('`inline code`');
    expect(markdown).toContain('[link](https://example.com)');
    expect(markdown).toContain('* bullet one');
    expect(markdown).toContain('1. ordered one');
    expect(markdown).toContain('> quoted first');
    expect(markdown).toContain('```ts');
    expect(markdown).toContain('| Left | Center | Right |');
    expect(markdown).toContain('| :--- | :---: | ---: |');
    expect(markdown).toContain('$x^2$');
    expect(markdown).toContain('$$\na^2 + b^2 = c^2\n$$');
    expect(markdown).toContain('---');
    expect(markdown).toContain('![Local](assets/pic.png)');
  });

  it('round-trips the subset through normalized Markdown', () => {
    const first = parseMarkdown(ROUND_TRIP);
    const markdown = serializeMarkdown(first);
    const second = parseMarkdown(markdown);
    expect(canonical(second)).toBe(canonical(first));
    // Normalization is idempotent: a second pass writes the same bytes.
    expect(serializeMarkdown(second)).toBe(markdown);
  });

  it('keeps frontmatter verbatim and raw text/unsupported syntax visible', () => {
    const source = `---
title: Fixture
---

<div>raw</div>

MDX <Component />`;
    const markdown = serializeMarkdown(parseMarkdown(source));
    expect(markdown.startsWith('---\ntitle: Fixture\n---\n')).toBe(true);
    expect(markdown).not.toContain('```yaml');
    expect(markdown).toContain('<div>raw</div>');
    expect(markdown).toContain('<Component />');
  });

  it('round-trips YAML frontmatter byte-identically before the normalized body', () => {
    const prefix = [
      '---',
      'title: "A: quoted # not a comment"',
      "note: 'single: quote'",
      '# a comment with --- inside',
      'tags: [alpha, beta]',
      'ratio: 3:14',
      '---',
      '',
    ].join('\n');
    const source = `${prefix}# Heading\n\nBody with **bold**.\n`;
    const document = parseMarkdown(source);
    const frontmatter = document.content[0];
    expect(frontmatter?.type).toBe('frontmatter');
    expect(frontmatter?.attrs?.['raw']).toBe(prefix);
    const saved = serializeMarkdown(document);
    expect(saved.startsWith(prefix)).toBe(true);
    expect(saved.slice(prefix.length)).toBe('# Heading\n\nBody with **bold**.\n');
    // Re-parsing the saved bytes keeps the same prefix and the same content.
    const again = parseMarkdown(saved);
    expect(again.content[0]?.attrs?.['raw']).toBe(prefix);
    expect(again.content).toEqual(document.content);
  });

  it('writes a frontmatter-only file without adding or losing bytes', () => {
    const source = '---\ntitle: Only\n---\n';
    expect(serializeMarkdown(parseMarkdown(source))).toBe(source);
    expect(serializeMarkdown(parseMarkdown('---\ntitle: Only\n---'))).toBe(
      '---\ntitle: Only\n---',
    );
  });

  it('escapes table pipes and keeps cell inline marks', () => {
    const document = parseMarkdown(
      '| A | B |\n| --- | --- |\n| a \\| b | **bold** |',
    );
    const markdown = serializeMarkdown(document);
    expect(markdown).toContain('| a \\| b | **bold** |');
    expect(parseMarkdown(markdown).content).toEqual(document.content);
  });

  it('writes a fenced block for code containing backticks', () => {
    const document = parseMarkdown('````\n```\ninner\n```\n````');
    const markdown = serializeMarkdown(document);
    expect(markdown).toContain('````');
    expect(parseMarkdown(markdown).content).toEqual(document.content);
  });

  it('escapes inline code that itself contains a backtick', () => {
    const document = parseMarkdown('``a ` b``');
    const markdown = serializeMarkdown(document);
    expect(parseMarkdown(markdown).content).toEqual(document.content);
  });

  it('keeps a space in a local image path encoded', () => {
    const document = parseMarkdown('![pic](assets/pic%20one.png)');
    const markdown = serializeMarkdown(document);
    expect(markdown).toContain('assets/pic%20one.png');
    expect(parseMarkdown(markdown).content).toEqual(document.content);
  });

  it('serializes a document with only math and images after a re-parse', () => {
    const source = '$a$ ![pic](assets/a.png)\n\n$$\nb\n$$';
    const first = parseMarkdown(source);
    const second = parseMarkdown(serializeMarkdown(first));
    expect(canonical(second)).toBe(canonical(first));
    expect(collect(first).filter((node) => node.type === 'image')).toHaveLength(1);
  });
});
