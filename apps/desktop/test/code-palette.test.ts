import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Code palette contract (editor appearance phase 1, design: code-palette.md).
 *
 * Dark editor = Monokai, light editor = One Light, and the fixed-light Page
 * paper = One Light in both app themes. The `hljs-*` selectors may only be
 * scoped to the Continuous surface, the flat Markdown guest editor, and the
 * Page surface, so tables, inline code, and prose can never inherit a code
 * token colour.
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
  '--code-keyword': '#f92672',
  '--code-string': '#e6db74',
  '--code-number': '#ae81ff',
  '--code-comment': '#75715e',
  '--code-function': '#a6e22e',
  '--code-type': '#66d9ef',
  '--code-tag': '#f92672',
  '--code-meta': '#fd971f',
} as const;

const ONE_LIGHT = {
  '--code-keyword': '#a626a4',
  '--code-string': '#50a14f',
  '--code-number': '#986801',
  '--code-comment': '#a0a1a7',
  '--code-function': '#4078f2',
  '--code-type': '#c18401',
  '--code-tag': '#e45649',
  '--code-meta': '#986801',
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

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match === null || match[1] === undefined) throw new Error(`not a hex color: ${hex}`);
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const channels = hexToRgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  return (high + 0.05) / (low + 0.05);
}

describe('code palette contract', () => {
  it('uses Monokai in the dark theme', () => {
    const dark = declarations(blockAt(css, 'html, html[data-theme="dark"]'));
    for (const [token, value] of Object.entries(MONOKAI)) {
      expect(dark.get(token), token).toBe(value);
    }
  });

  it('uses One Light in the light theme', () => {
    const light = declarations(blockAt(css, 'html[data-theme="light"]'));
    for (const [token, value] of Object.entries(ONE_LIGHT)) {
      expect(light.get(token), token).toBe(value);
    }
  });

  it('gives the fixed-light Page paper its own One Light roles', () => {
    const page = declarations(blockAt(css, ':root', '--nf-page-ink'));
    for (const [token, value] of Object.entries(PAGE_ONE_LIGHT)) {
      expect(page.get(token), token).toBe(value);
    }
  });

  it('keeps comments readable but quieter than code in both themes', () => {
    const darkRatios = Object.entries(MONOKAI).map(
      ([token, value]) => [token, contrast(value, '#202329')] as const,
    );
    const lightRatios = Object.entries(ONE_LIGHT).map(
      ([token, value]) => [token, contrast(value, '#f5f7f9')] as const,
    );
    for (const [token, ratio] of [...darkRatios, ...lightRatios]) {
      expect(ratio, token).toBeGreaterThanOrEqual(2.3);
    }
    const min = (ratios: ReadonlyArray<readonly [string, number]>): string =>
      ratios.reduce((lowest, entry) => (entry[1] < lowest[1] ? entry : lowest))[0];
    expect(min(darkRatios)).toBe('--code-comment');
    expect(min(lightRatios)).toBe('--code-comment');
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
