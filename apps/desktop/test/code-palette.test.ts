import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODE_THEMES, contrastRatio } from '../src/renderer/src/lib/code-themes';

/**
 * Code palette contract (editor appearance phase 1 → B2 registry, design:
 * code-palette.md, code-themes.md).
 *
 * Monokai and One Light are the shipped classic palettes and stay available in
 * the code-theme registry with the values this document pins. The fixed-light
 * Page paper keeps One Light in both app themes, so it never reads a shell
 * `--code-*` role; the `hljs-*` selectors stay scoped to the Continuous
 * surface, the flat Markdown guest editor, and the Page surface.
 *
 * The registry ↔ stylesheet equality and the computed worst role are guarded by
 * `code-themes.test.ts`; this file owns the classic values, the paper roles, and
 * the selector scoping that protects tables, inline code, and prose.
 */

const stylesSource = readFileSync(
  new URL('../src/renderer/src/styles.css', import.meta.url),
  'utf8',
);
const css = stylesSource
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const MONOKAI = {
  keyword: '#f92672',
  string: '#e6db74',
  number: '#ae81ff',
  comment: '#75715e',
  function: '#a6e22e',
  type: '#66d9ef',
  tag: '#f92672',
  meta: '#fd971f',
} as const;

const ONE_LIGHT = {
  keyword: '#a626a4',
  string: '#50a14f',
  number: '#986801',
  comment: '#a0a1a7',
  function: '#4078f2',
  type: '#c18401',
  tag: '#e45649',
  meta: '#986801',
} as const;

const PAGE_ONE_LIGHT = {
  '--nf-page-code-keyword': '#a626a4',
  '--nf-page-code-string': '#50a14f',
  '--nf-page-code-number': '#986801',
  '--nf-page-code-comment': '#a0a1a7',
  '--nf-page-code-function': '#4078f2',
  '--nf-page-code-type': '#c18401',
  '--nf-page-code-tag': '#e45649',
  '--nf-page-code-meta': '#986801',
} as const;

function uncommented(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim();
}

function blockAt(source: string, marker: string, required?: string): string {
  let from = 0;
  while (from < source.length) {
    const start = source.indexOf(marker, from);
    if (start < 0) break;
    const open = source.indexOf('{', start + marker.length - 1);
    if (open < 0) break;
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
      const character = source[index];
      if (character === '{') depth += 1;
      if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          const body = source.slice(open + 1, index);
          if (required === undefined || body.includes(required)) return body;
          break;
        }
      }
    }
    from = start + marker.length;
  }
  throw new Error(`missing CSS block: ${marker}`);
}

function declarations(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of source.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    result.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  return result;
}

interface CssRule {
  selector: string;
  body: string;
}

/** Flat rules, including selectors that start with a newline in a list. */
function collectRules(source: string): CssRule[] {
  const rules: CssRule[] = [];
  const text = uncommented(source);
  for (const match of text.matchAll(/(?:^|(?<=}))\s*([^{}@]+?)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? '').trim();
    if (selector.length === 0) continue;
    rules.push({ selector, body: match[2] ?? '' });
  }
  return rules;
}

describe('classic code palettes', () => {
  it('keeps Monokai and One Light in the registry with the documented values', () => {
    const monokai = CODE_THEMES.find((theme) => theme.id === 'monokai');
    const oneLight = CODE_THEMES.find((theme) => theme.id === 'one-light');
    expect(monokai).toBeDefined();
    expect(oneLight).toBeDefined();
    expect(monokai?.roles).toEqual(MONOKAI);
    expect(oneLight?.roles).toEqual(ONE_LIGHT);
    expect(monokai?.polarity).toBe('dark');
    expect(oneLight?.polarity).toBe('light');
    // A theme brings its own surface; the classic palettes are not recoloured.
    expect(monokai?.surface).toMatch(/^#[0-9a-f]{6}$/);
    expect(oneLight?.surface).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('keeps comments quieter than code in both classic themes', () => {
    for (const id of ['monokai', 'one-light'] as const) {
      const theme = CODE_THEMES.find((entry) => entry.id === id);
      expect(theme).toBeDefined();
      const ratios = Object.entries(theme?.roles ?? {}).map(
        ([role, value]) => [role, contrastRatio(value, theme?.surface ?? '#000000')] as const,
      );
      for (const [role, ratio] of ratios) {
        expect(ratio, `${id} ${role}`).toBeGreaterThanOrEqual(2.3);
      }
      const lowest = ratios.reduce((low, entry) => (entry[1] < low[1] ? entry : low));
      expect(lowest[0], `${id} quietest role`).toBe('comment');
    }
  });

  it('leaves the app-theme blocks without syntax roles', () => {
    // The root always carries data-code-theme (B2), so no shell theme block
    // owns a code role any more.
    for (const marker of ['html, html[data-theme="dark"]', 'html[data-theme="light"]']) {
      const block = declarations(blockAt(css, marker));
      for (const token of [
        '--code-surface',
        '--code-text',
        '--code-keyword',
        '--code-comment',
      ]) {
        expect(block.has(token), `${marker} ${token}`).toBe(false);
      }
    }
  });
});

describe('page code palette', () => {
  it('gives the fixed-light Page paper its own One Light roles', () => {
    const page = declarations(blockAt(css, ':root', '--nf-page-ink'));
    for (const [token, value] of Object.entries(PAGE_ONE_LIGHT)) {
      expect(page.get(token), token).toBe(value);
    }
  });

  it('scopes every hljs rule to the Continuous, Markdown or Page surface', () => {
    const rules = collectRules(stylesSource).filter((rule) => rule.selector.includes('hljs-'));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      for (const part of rule.selector.split(',').map((value) => value.trim())) {
        expect(
          part.startsWith('.nf-continuous-surface ') ||
            part.startsWith('.nf-page-scope ') ||
            part.startsWith('.nf-markdown-editor '),
          part,
        ).toBe(true);
      }
    }
  });

  it('never reads the shell code roles on the paper', () => {
    const pageRules = collectRules(stylesSource).filter((rule) =>
      rule.selector.split(',').some((part) => part.trim().startsWith('.nf-page-scope')),
    );
    for (const rule of pageRules) {
      if (!rule.selector.includes('hljs-')) continue;
      expect(rule.body, rule.selector).not.toMatch(/var\(--code-/);
      expect(rule.body, rule.selector).toMatch(/var\(--nf-page-code-/);
    }
  });

  it('leaves the Page code surfaces backgrounds and borders unchanged', () => {
    const rules = collectRules(stylesSource);
    const segment = rules.find(
      (rule) => rule.selector === '.nf-page-scope .nf-seg-code-line',
    );
    expect(segment).toBeDefined();
    expect(declarations(segment!.body).get('background')).toBe('#f5f7f9');
    expect(declarations(segment!.body).get('border-left')).toBe('1px solid #e0e5e9');
    const line = rules.find((rule) => rule.selector === '.nf-page-scope .nf-code-line');
    expect(declarations(line!.body).get('white-space')).toBe('pre');
  });
});
