import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODE_THEME_IDS, type CodeThemeId } from '@noteforest/layout';
import {
  CODE_ROLES,
  CODE_THEMES,
  codeThemeOptionLabel,
  contrastLabel,
  contrastRatio,
  relativeLuminance,
  resolveCodeTheme,
  worstContrast,
  worstContrastRole,
} from '../src/renderer/src/lib/code-themes';

/**
 * Code theme contract (B2, design: code-themes.md).
 *
 * The registry is the product source: four themes, values verbatim, each with
 * its own code surface and ink. The stylesheet blocks are the rendering, so the
 * two must agree exactly and the contrast label the picker shows is recomputed
 * here — never typed. Page and print keep their own fixed One Light roles.
 */

const stylesSource = readFileSync(
  new URL('../src/renderer/src/styles.css', import.meta.url),
  'utf8',
);
const printSource = readFileSync(
  new URL('../src/renderer/src/print/print.css', import.meta.url),
  'utf8',
);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** The body of the first rule whose selector contains `marker`. */
function blockAt(source: string, marker: string): string {
  const text = stripComments(source).replace(/\s+/g, ' ');
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`missing CSS block: ${marker}`);
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, index);
    }
  }
  throw new Error(`unterminated CSS block: ${marker}`);
}

function declarations(body: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    result.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  return result;
}

/** The documented values, taken verbatim from the themes. */
const EXPECTED: Record<CodeThemeId, Record<string, string>> = {
  'dark-plus': {
    surface: '#1e1e1e',
    text: '#d4d4d4',
    keyword: '#569cd6',
    string: '#ce9178',
    number: '#b5cea8',
    comment: '#6a9955',
    function: '#dcdcaa',
    type: '#4ec9b0',
    tag: '#569cd6',
    meta: '#569cd6',
  },
  'light-plus': {
    surface: '#ffffff',
    text: '#000000',
    keyword: '#0000ff',
    string: '#a31515',
    number: '#098658',
    comment: '#008000',
    function: '#795e26',
    type: '#267f99',
    tag: '#800000',
    meta: '#0000ff',
  },
  monokai: {
    surface: '#272822',
    text: '#f8f8f2',
    keyword: '#f92672',
    string: '#e6db74',
    number: '#ae81ff',
    comment: '#75715e',
    function: '#a6e22e',
    type: '#66d9ef',
    tag: '#f92672',
    meta: '#fd971f',
  },
  'one-light': {
    surface: '#fafafa',
    text: '#383a42',
    keyword: '#a626a4',
    string: '#50a14f',
    number: '#986801',
    comment: '#a0a1a7',
    function: '#4078f2',
    type: '#c18401',
    tag: '#e45649',
    meta: '#986801',
  },
};

describe('code theme registry', () => {
  it('ships the four themes in the settings order with verbatim values', () => {
    expect(CODE_THEMES.map((theme) => theme.id)).toEqual([...CODE_THEME_IDS]);
    expect(CODE_THEMES.map((theme) => theme.label)).toEqual([
      'Dark+',
      'Light+',
      'Monokai',
      'One Light',
    ]);
    expect(CODE_THEMES.map((theme) => theme.polarity)).toEqual([
      'dark',
      'light',
      'dark',
      'light',
    ]);
    for (const theme of CODE_THEMES) {
      const expected = EXPECTED[theme.id];
      expect(theme.surface, `${theme.id} surface`).toBe(expected['surface']);
      expect(theme.text, `${theme.id} text`).toBe(expected['text']);
      for (const role of CODE_ROLES) {
        expect(theme.roles[role], `${theme.id} ${role}`).toBe(expected[role]);
      }
      // Eight roles, no ninth syntax slot smuggled in.
      expect(Object.keys(theme.roles).sort()).toEqual([...CODE_ROLES].sort());
    }
  });

  it('keeps every syntax role as a #rrggbb literal', () => {
    for (const theme of CODE_THEMES) {
      for (const value of [theme.surface, theme.text, ...Object.values(theme.roles)]) {
        expect(value, theme.id).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('code theme stylesheet rendering', () => {
  it('renders one block per theme equal to the registry', () => {
    for (const theme of CODE_THEMES) {
      const block = declarations(blockAt(stylesSource, `html[data-code-theme="${theme.id}"]`));
      expect(block.get('--code-surface'), `${theme.id} --code-surface`).toBe(theme.surface);
      expect(block.get('--code-text'), `${theme.id} --code-text`).toBe(theme.text);
      for (const role of CODE_ROLES) {
        expect(block.get(`--code-${role}`), `${theme.id} --code-${role}`).toBe(
          theme.roles[role],
        );
      }
      // One block per theme, no duplicated declarations.
      expect(block.size, `${theme.id} declaration count`).toBe(CODE_ROLES.length + 2);
    }
  });

  it('keeps the code roles off html and the app-theme blocks', () => {
    // The attribute always resolves: a theme block must not carry a code role,
    // or a missing attribute would paint a second, stale palette.
    for (const marker of ['html, html[data-theme="dark"]', 'html[data-theme="light"]']) {
      const block = declarations(blockAt(stylesSource, marker));
      for (const name of ['--code-surface', '--code-text']) {
        expect(block.has(name), `${marker} ${name}`).toBe(false);
      }
      for (const role of CODE_ROLES) {
        expect(block.has(`--code-${role}`), `${marker} --code-${role}`).toBe(false);
      }
    }
  });

  it('gives the shell code block the theme surface and ink', () => {
    const rule = stripComments(stylesSource).match(
      /\.nf-continuous-surface \.nf-code-block,\s*\.nf-markdown-document \.nf-code-block\s*\{([^}]*)\}/,
    );
    expect(rule).not.toBeNull();
    const body = declarations(rule?.[1] ?? '');
    expect(body.get('background')).toBe('var(--code-surface)');
    expect(body.get('color')).toBe('var(--code-text)');
  });

  it('never renders a code theme on the paper', () => {
    // The Page/print surface reads --nf-page-code-* only.
    expect(printSource.includes('--code-surface')).toBe(false);
    expect(printSource.includes('--code-text')).toBe(false);
    expect(printSource.includes('data-code-theme')).toBe(false);
    for (const match of stripComments(stylesSource).matchAll(
      /([^{}]+)\{([^{}]*)\}/g,
    )) {
      const selector = (match[1] ?? '').trim();
      const body = match[2] ?? '';
      if (!body.includes('data-code-theme')) continue;
      expect(selector).toMatch(/^html\[data-code-theme="[a-z-]+"\]$/);
    }
    // No Page rule reads the shell code roles.
    for (const match of stripComments(stylesSource).matchAll(
      /([^{}]+)\{([^{}]*)\}/g,
    )) {
      const selector = (match[1] ?? '').trim();
      if (!selector.includes('nf-page')) continue;
      expect(match[2] ?? '', selector).not.toMatch(/var\(--code-(surface|text|keyword)/);
    }
  });
});

describe('computed contrast', () => {
  it('recomputes every worst role from the registry', () => {
    const expected: Record<CodeThemeId, { role: string; label: string }> = {
      'dark-plus': { role: 'comment', label: '5.00' },
      'light-plus': { role: 'type', label: '4.59' },
      monokai: { role: 'comment', label: '3.03' },
      'one-light': { role: 'comment', label: '2.47' },
    };
    for (const theme of CODE_THEMES) {
      const worst = worstContrastRole(theme);
      expect(worst.role, `${theme.id} worst role`).toBe(expected[theme.id].role);
      expect(worst.ratio.toFixed(2), `${theme.id} worst ratio`).toBe(
        expected[theme.id].label,
      );
      expect(worstContrast(theme)).toBe(worst.ratio);
      // The minimum really is the minimum of the eight roles plus the ink.
      for (const value of [theme.text, ...Object.values(theme.roles)]) {
        expect(contrastRatio(value, theme.surface)).toBeGreaterThanOrEqual(
          worstContrast(theme) - 1e-9,
        );
      }
    }
  });

  it('labels AA only when every role passes the 4.5:1 body-text bar', () => {
    const labels = Object.fromEntries(
      CODE_THEMES.map((theme) => [theme.id, contrastLabel(theme)]),
    );
    expect(labels).toEqual({
      'dark-plus': 'AA 5.00',
      'light-plus': 'AA 4.59',
      monokai: '3.03',
      'one-light': '2.47',
    });
    for (const theme of CODE_THEMES) {
      const worst = worstContrast(theme);
      expect(contrastLabel(theme).startsWith('AA '), theme.id).toBe(worst >= 4.5);
    }
  });

  it('keeps both VS Code defaults above 4.5:1 on their own surface', () => {
    for (const id of ['dark-plus', 'light-plus'] as const) {
      const theme = resolveCodeTheme(id, 'dark');
      expect(worstContrast(theme), id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('shows the polarity and the computed label in the picker options', () => {
    expect(CODE_THEMES.map(codeThemeOptionLabel)).toEqual([
      'Dark+ (dark) · AA 5.00',
      'Light+ (light) · AA 4.59',
      'Monokai (dark) · 3.03',
      'One Light (light) · 2.47',
    ]);
  });

  it('uses the WCAG relative luminance and ratio definitions', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 10);
    // Symmetric, as WCAG defines it.
    expect(contrastRatio('#569cd6', '#1e1e1e')).toBeCloseTo(
      contrastRatio('#1e1e1e', '#569cd6'),
      10,
    );
  });
});

describe('code theme resolution', () => {
  it('follows the app theme for auto', () => {
    expect(resolveCodeTheme('auto', 'dark').id).toBe('dark-plus');
    expect(resolveCodeTheme('auto', 'light').id).toBe('light-plus');
  });

  it('keeps an explicit theme in either app theme', () => {
    for (const id of CODE_THEME_IDS) {
      expect(resolveCodeTheme(id, 'dark').id).toBe(id);
      expect(resolveCodeTheme(id, 'light').id).toBe(id);
    }
  });

  it('falls back to auto for a missing or unknown value', () => {
    expect(resolveCodeTheme(undefined, 'dark').id).toBe('dark-plus');
    expect(resolveCodeTheme(null, 'light').id).toBe('light-plus');
    expect(resolveCodeTheme('solarized' as CodeThemeId, 'dark').id).toBe('dark-plus');
  });
});
