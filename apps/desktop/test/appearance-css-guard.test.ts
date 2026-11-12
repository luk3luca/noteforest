import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * R3 shell color contract guards (design §7).
 *
 * 1. No shell hex/rgba outside the theme blocks and the Page skin rules.
 * 2. Every migration alias is a `var()` reference, never a duplicated value.
 * 3. The accent scale lives only in the registry; the stylesheet derives.
 * 4. Page and print never read the shell UI font or the UI scale; the code font
 *    is the one appearance value that reaches the paper.
 */

const stylesSource = readFileSync(
  new URL('../src/renderer/src/styles.css', import.meta.url),
  'utf8',
);
const printSource = readFileSync(
  new URL('../src/renderer/src/print/print.css', import.meta.url),
  'utf8',
);
const mainSource = readFileSync(
  new URL('../src/renderer/src/main.tsx', import.meta.url),
  'utf8',
);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function matchingBrace(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('unterminated CSS block');
}

/** Selector list normalized to one-space, comma-separated form. */
function normalizeSelector(selector: string): string {
  return selector
    .split(',')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
    .join(', ');
}

/** A selector that may carry a literal: a theme block or a Page-skin rule. */
function isColorCarrier(selector: string): boolean {
  const parts = normalizeSelector(selector).split(', ');
  return parts.every(
    (part) =>
      part === 'html' ||
      part === 'html[data-theme="dark"]' ||
      part === 'html[data-theme="light"]' ||
      part === ':root' ||
      part.includes('nf-page'),
  );
}

interface CssRule {
  selector: string;
  body: string;
}

/** Every plain rule at any nesting depth of `@media`/`@supports`. */
function collectRules(source: string): CssRule[] {
  const rules: CssRule[] = [];
  const text = stripComments(source);
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf('{', index);
    if (open < 0) break;
    const selector = text.slice(index, open).trim();
    const close = matchingBrace(text, open);
    const body = text.slice(open + 1, close);
    if (selector.startsWith('@media') || selector.startsWith('@supports')) {
      rules.push(...collectRules(body));
    } else {
      rules.push({ selector, body });
    }
    index = close + 1;
  }
  return rules;
}

const rules = collectRules(stylesSource);

function declarationsOf(body: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const property = part.slice(0, colon).trim();
    if (property.length === 0 || property.startsWith('/*')) continue;
    result.set(property, part.slice(colon + 1).replace(/\s*!important\s*$/, '').trim());
  }
  return result;
}

function rule(selector: string): CssRule {
  const found = rules.find(
    (candidate) => normalizeSelector(candidate.selector) === selector,
  );
  if (found === undefined) throw new Error(`missing CSS rule: ${selector}`);
  return found;
}

const LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

/** WCAG relative luminance of a `#rrggbb` token value. */
function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const cleaned = hex.replace('#', '');
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : cleaned;
  expect(full, `${hex} is a #rrggbb token`).toMatch(/^[0-9a-f]{6}$/);
  return (
    0.2126 * channel(Number.parseInt(full.slice(0, 2), 16)) +
    0.7152 * channel(Number.parseInt(full.slice(2, 4), 16)) +
    0.0722 * channel(Number.parseInt(full.slice(4, 6), 16))
  );
}

function contrast(left: string, right: string): number {
  const first = luminance(left);
  const second = luminance(right);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Every shell surface a text role can sit on. */
const SHELL_SURFACES = [
  '--bg-app',
  '--bg-canvas',
  '--bg-sidebar',
  '--surface-1',
  '--surface-2',
  '--surface-3',
] as const;

const TEXT_ROLES = ['--text-1', '--text-2', '--text-3'] as const;

describe('shell color contract', () => {
  it('allows color literals only in the theme blocks and the Page skin', () => {
    const offenders: string[] = [];
    for (const candidate of rules) {
      if (isColorCarrier(candidate.selector)) continue;
      const matches = candidate.body.match(LITERAL);
      if (matches === null) continue;
      offenders.push(`${candidate.selector}: ${matches.join(' ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('meets 4.5:1 for every shell text role on every shell surface, in both themes', () => {
    for (const selector of ['html, html[data-theme="dark"]', 'html[data-theme="light"]']) {
      const declarations = declarationsOf(rule(selector).body);
      const surfaces = SHELL_SURFACES.map((name) => {
        const value = declarations.get(name);
        expect(value, `${selector} ${name}`).toBeDefined();
        return { name, value: value as string };
      });
      for (const role of TEXT_ROLES) {
        const text = declarations.get(role);
        expect(text, `${selector} ${role}`).toBeDefined();
        for (const surface of surfaces) {
          expect(
            contrast(text as string, surface.value),
            `${selector} ${role} on ${surface.name}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('keeps the light text hierarchy: text-3 stays lighter than text-2', () => {
    const light = declarationsOf(rule('html[data-theme="light"]').body);
    expect(light.get('--text-2')).toBe('#4d5a63');
    expect(luminance(light.get('--text-3') as string)).toBeGreaterThan(
      luminance(light.get('--text-2') as string),
    );
    // text-1 is the darkest step, so the three roles read as a hierarchy.
    expect(luminance(light.get('--text-1') as string)).toBeLessThan(
      luminance(light.get('--text-2') as string),
    );
  });

  it('keeps the canonical roles on the dark and light theme blocks', () => {
    for (const selector of ['html, html[data-theme="dark"]']) {
      const declarations = declarationsOf(rule(selector).body);
      for (const role of [
        '--bg-app',
        '--bg-canvas',
        '--bg-sidebar',
        '--surface-1',
        '--surface-2',
        '--surface-3',
        '--text-1',
        '--text-2',
        '--text-3',
        '--border-1',
        '--border-2',
        '--edge',
        '--edge-muted',
        '--danger',
        '--danger-soft',
        '--danger-border',
        '--success',
        '--success-soft',
        '--warning',
        '--warning-soft',
        '--warning-border',
        '--overlay',
        '--shadow-panel',
        '--shadow-overlay',
      ]) {
        expect(declarations.has(role), `${selector} ${role}`).toBe(true);
      }
    }
    const light = declarationsOf(rule('html[data-theme="light"]').body);
    for (const role of ['--bg-app', '--bg-canvas', '--surface-1', '--text-1', '--border-1']) {
      expect(light.has(role), `light ${role}`).toBe(true);
    }
  });

  it('keeps every migration alias a var() reference', () => {
    const aliases = new Map<string, string>();
    for (const candidate of rules) {
      if (candidate.selector !== ':root') continue;
      for (const [name, value] of declarationsOf(candidate.body)) {
        aliases.set(name, value);
      }
    }
    const expected: Record<string, string> = {
      '--shell': 'var(--bg-app)',
      '--canvas': 'var(--bg-canvas)',
      '--sidebar': 'var(--bg-sidebar)',
      '--text': 'var(--text-1)',
      '--text-secondary': 'var(--text-2)',
      '--text-tertiary': 'var(--text-3)',
      '--border': 'var(--border-1)',
      '--border-strong': 'var(--border-2)',
      '--accent-ring': 'var(--accent-strong)',
      '--edge-active': 'var(--accent-strong)',
      '--focus-ring': 'var(--accent-ring)',
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(aliases.get(name), name).toBe(value);
    }
  });

  it('derives the ring roles instead of declaring a second color', () => {
    for (const name of ['--accent-ring', '--focus-ring', '--edge-active']) {
      const values = rules.filter((candidate) => candidate.body.includes(`${name}:`));
      for (const candidate of values) {
        const value = declarationsOf(candidate.body).get(name);
        expect(value, `${candidate.selector} ${name}`).toMatch(/^var\(--/);
      }
    }
  });

  it('never declares an accent value in the stylesheet', () => {
    // The accent scale is registry data applied at runtime (design §4).
    for (const name of ['--accent', '--accent-strong', '--accent-soft', '--accent-hover', '--accent-contrast']) {
      expect(
        new RegExp(`(^|[;\\s])${name}\\s*:`).test(stripComments(stylesSource)),
        `${name} must come from the registry`,
      ).toBe(false);
    }
  });

  it('applies the default appearance before the first React render', () => {
    const appearanceIndex = mainSource.indexOf('applyAppearance(DEFAULT_APPEARANCE');
    expect(appearanceIndex).toBeGreaterThan(-1);
    expect(appearanceIndex).toBeLessThan(mainSource.indexOf('createRoot(container)'));
  });
});

describe('paper isolation', () => {
  const pageRules = rules.filter((candidate) => candidate.selector.includes('nf-page'));

  it('gives the Page surface its own fixed font stack', () => {
    const scope = declarationsOf(rule('.nf-page-scope').body);
    expect(scope.get('font-family')).toBe('var(--nf-page-font)');
    const skin = declarationsOf(rule(':root').body);
    // The fixed Page font is declared on the Page skin root block, not the
    // shell root: no Page rule may inherit the shell UI font.
    const carriers = rules.filter(
      (candidate) => candidate.selector === ':root' && candidate.body.includes('--nf-page-font:'),
    );
    expect(carriers.length).toBe(1);
    expect(skin.get('--nf-page-font')).toBeUndefined();
  });

  it('never reads the shell UI font or UI scale inside a Page rule', () => {
    for (const candidate of pageRules) {
      expect(candidate.body.includes('var(--ui-font)'), candidate.selector).toBe(false);
      expect(candidate.body.includes('var(--ui-scale)'), candidate.selector).toBe(false);
    }
  });

  it('reads code through the code font only', () => {
    const code = pageRules.find(
      (candidate) => candidate.selector === '.nf-page-scope .nf-code-line',
    );
    expect(code).toBeDefined();
    expect(declarationsOf(code!.body).get('font-family')).toBe('var(--mono-font)');
    const inline = rule('.nf-page-scope .nf-inline-code');
    expect(declarationsOf(inline.body).get('font-family')).toBe('var(--mono-font)');
  });

  it('keeps the paper free of shell color roles', () => {
    // The paper (sheet, cards, fragments, selection, overlays, edges) is its own
    // light skin: a theme or accent switch cannot recolor it (design §6).
    const paperPrefixes = [
      '.nf-page-scope',
      '.nf-page-card',
      '.nf-page-fragment',
      '.nf-page-sheet',
      '.nf-page-edit-',
      '.nf-page-edge-',
      '.nf-page-header',
      '.nf-page-footer',
      '.nf-page-ghost',
      '.nf-page-continues',
      '.nf-page-badge',
      '.nf-page-placeholder',
    ];
    const shellRoles =
      /var\(--(accent|focus-ring|edge-active|danger|success|warning|text-1|text-2|text-3|border-1|border-2|surface-1|surface-2|surface-3|bg-app|bg-canvas|bg-sidebar)\b/;
    for (const candidate of pageRules) {
      if (!paperPrefixes.some((prefix) => candidate.selector.startsWith(prefix))) continue;
      expect(shellRoles.test(candidate.body), candidate.selector).toBe(false);
    }
  });

  it('keeps the print skin free of shell tokens', () => {
    for (const token of ['--ui-font', '--ui-scale', '--bg-', '--text-1', '--surface-1', '--accent']) {
      expect(printSource.includes(token), `print.css ${token}`).toBe(false);
    }
  });

  it('publishes the code font on the print root as --mono-font', () => {
    const source = readFileSync(
      new URL('../src/renderer/src/print/PrintDocument.tsx', import.meta.url),
      'utf8',
    );
    expect(source.includes("'--mono-font': codeFontStack(model.codeFont)")).toBe(true);
    expect(source.includes('data-print-code-font={model.codeFont}')).toBe(true);
  });
});
