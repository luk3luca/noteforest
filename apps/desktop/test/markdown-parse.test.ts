import { describe, expect, it } from 'vitest';
import { flatMarkdownSchema } from '../src/renderer/src/markdown/flat-schema';
import {
  parseMarkdown,
  splitInlineMath,
  type MarkdownDocumentJson,
  type MarkdownNodeJson,
} from '../src/renderer/src/markdown/markdown-parse';

const FIXTURE = `---
title: Fixture
owner: Luca
---

# Heading 1

## Heading 2

###### Heading 6

A paragraph with *italic*, **bold**, ~~strike~~, \`inline code\`, a [web link](https://example.com) and an [internal link](#section).
A hard break line\\
continues here.

- first bullet
  - nested bullet
- second bullet

3. third ordered
4. fourth ordered

> quoted paragraph
>
> second quoted paragraph

\`\`\`ts
const value: number = 1;
\`\`\`

    indented code line

| Left | Center | Right |
| :--- | :---: | ---: |
| a | b | c |
| d | e | f |

Inline $x^2 + y^2$ math sits here.

$$
a^2 + b^2 = c^2
$$

---

![Local image](assets/pic.png)

![Remote image](https://example.com/pic.png)

<div>raw html block</div>

- [ ] task item

A footnote reference[^1].

[^1]: footnote text

<Component prop={1} />
`;

function collect(node: MarkdownNodeJson): MarkdownNodeJson[] {
  return [node, ...(node.content ?? []).flatMap(collect)];
}

function nodesOfType(document: MarkdownDocumentJson, type: string): MarkdownNodeJson[] {
  return document.content.flatMap(collect).filter((node) => node.type === type);
}

function textOf(document: MarkdownDocumentJson): string {
  return nodesOfType(document, 'text')
    .map((node) => node.text ?? '')
    .join('');
}

describe('Markdown parser', () => {
  it('parses the declared GFM subset into a valid flat document', () => {
    const document = parseMarkdown(FIXTURE);
    expect(() => flatMarkdownSchema().nodeFromJSON(document).check()).not.toThrow();

    const headings = nodesOfType(document, 'heading');
    expect(headings.map((heading) => heading.attrs?.['level'])).toEqual([1, 2, 6]);

    expect(nodesOfType(document, 'bulletList')).toHaveLength(3);
    expect(nodesOfType(document, 'orderedList')[0]?.attrs?.['start']).toBe(3);
    expect(nodesOfType(document, 'blockquote')).toHaveLength(1);
    expect(nodesOfType(document, 'horizontalRule')).toHaveLength(1);
    expect(nodesOfType(document, 'table')).toHaveLength(1);
    expect(nodesOfType(document, 'tableRow')).toHaveLength(3);
    expect(nodesOfType(document, 'tableHeader')).toHaveLength(3);
    expect(nodesOfType(document, 'tableCell')).toHaveLength(6);
    expect(nodesOfType(document, 'tableCell')[0]?.attrs?.['align']).toBe('left');
    expect(nodesOfType(document, 'tableCell')[2]?.attrs?.['align']).toBe('right');

    const infos = nodesOfType(document, 'codeBlock').map((node) => node.attrs?.['language']);
    expect(infos).toEqual(['yaml', 'ts', null]);
    expect(nodesOfType(document, 'inlineMath')[0]?.attrs?.['latex']).toBe('x^2 + y^2');
    expect(nodesOfType(document, 'blockMath')[0]?.attrs?.['latex']).toBe(
      'a^2 + b^2 = c^2',
    );

    const images = nodesOfType(document, 'image');
    expect(images.map((image) => image.attrs?.['src'])).toEqual([
      'assets/pic.png',
      'https://example.com/pic.png',
    ]);

    const marks = new Set(
      nodesOfType(document, 'text').flatMap((node) =>
        (node.marks ?? []).map((mark) => mark.type),
      ),
    );
    expect(marks).toEqual(new Set(['bold', 'italic', 'strike', 'code', 'link']));
  });

  it('keeps raw HTML, frontmatter, footnotes, and MDX as plain text or a labelled block', () => {
    const document = parseMarkdown(FIXTURE);
    expect(nodesOfType(document, 'codeBlock')[0]?.attrs?.['language']).toBe('yaml');
    expect(textOf(document)).toContain('title: Fixture');
    expect(textOf(document)).toContain('<div>raw html block</div>');
    expect(textOf(document)).toContain('[^1]');
    expect(textOf(document)).toContain('<Component prop={1} />');
    // Never a script/iframe node: the flat schema has no raw-HTML node.
    expect(nodesOfType(document, 'html')).toHaveLength(0);
  });

  it('keeps internal links as text and only marks external links', () => {
    const document = parseMarkdown('[external](https://example.com) [internal](#here)');
    const links = nodesOfType(document, 'text').flatMap((node) =>
      (node.marks ?? []).filter((mark) => mark.type === 'link'),
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.attrs?.['href']).toBe('https://example.com');
    expect(textOf(document)).toContain('internal');
  });

  it('normalizes empty input to one paragraph and never throws', () => {
    expect(parseMarkdown('').content).toEqual([{ type: 'paragraph' }]);
    expect(parseMarkdown('   \n\n').content).toEqual([{ type: 'paragraph' }]);
    expect(() => parseMarkdown('::: unknown\ncontent\n:::')).not.toThrow();
  });

  it('splits inline math with Obsidian-style guards', () => {
    expect(splitInlineMath('a $x$ b')).toEqual(['a ', { latex: 'x' }, ' b']);
    expect(splitInlineMath('$5 and $6')).toEqual(['$5 and $6']);
    expect(splitInlineMath('$$block$$')).toEqual(['$$block$$']);
    expect(splitInlineMath('$ x$')).toEqual(['$ x$']);
    expect(splitInlineMath('price $5 or $6')).toEqual(['price $5 or $6']);
  });

  it('does not parse math inside inline code', () => {
    const document = parseMarkdown('`$x$` and $y$');
    expect(nodesOfType(document, 'inlineMath').map((node) => node.attrs?.['latex'])).toEqual([
      'y',
    ]);
    expect(textOf(document)).toContain('$x$');
  });

  it('keeps code fences with an unknown language as text content', () => {
    const document = parseMarkdown('```unknownlang\nraw <tag> & stuff\n```');
    const code = nodesOfType(document, 'codeBlock')[0];
    expect(code?.attrs?.['language']).toBe('unknownlang');
    expect(code?.content?.[0]?.text).toBe('raw <tag> & stuff');
  });
});
