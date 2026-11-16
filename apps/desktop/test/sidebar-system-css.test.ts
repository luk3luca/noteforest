import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sidebarDepthIndent } from '../src/renderer/src/lib/sidebar-rows';

/**
 * S1 sidebar system guard (`docs/design/sidebar.md`, `docs/tasks/sidebar-system.md`).
 *
 * The four sections used to share nothing but the panel inset. This file keeps
 * the single source from drifting again, without the app running:
 *
 * 1. the `--sb-*` tokens exist and their values are the approved ones;
 * 2. no sidebar rule declares a literal `font-size`, so a section cannot
 *    invent a size outside the five-value scale;
 * 3. the row ladder, the header, the result-card variants, the group divider
 *    and the scroll gutter are wired where the design says;
 * 4. the needs-repair indicator is a dot, not a counter.
 */

const stylesSource = readFileSync(
  resolve(import.meta.dirname, '../src/renderer/src/styles.css'),
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

function normalizeSelector(selector: string): string {
  return selector
    .split(',')
    .map((part) => part.replace(/\s+/g, ' ').trim().replace(/'/g, '"'))
    .filter((part) => part.length > 0)
    .join(', ');
}

function declarationsOf(body: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const property = part.slice(0, colon).trim();
    if (property.length === 0) continue;
    result.set(property, part.slice(colon + 1).replace(/\s*!important\s*$/, '').trim());
  }
  return result;
}

function declaration(selector: string, property: string): string | undefined {
  const wanted = normalizeSelector(selector);
  const found = rules.find((candidate) => normalizeSelector(candidate.selector) === wanted);
  if (found === undefined) throw new Error(`missing CSS rule: ${selector}`);
  return declarationsOf(found.body).get(property);
}

/**
 * Class prefixes that belong to the sidebar surfaces. A rule whose selector
 * carries one of them must read its `font-size` from a `--sb-*` token.
 */
const SIDEBAR_PREFIXES = [
  '.nf-sidebar',
  '.nf-library',
  '.nf-tree',
  '.nf-search-',
  '.nf-section-',
  '.nf-health',
  '.nf-activity',
  '.nf-topics',
  '.nf-breaks',
  '.nf-empty-line',
] as const;

/**
 * The 560 px repair dialog shares the Health prefix but is not the sidebar:
 * `docs/design/document-health-sidebar.md` §3 is its own surface.
 */
const NOT_SIDEBAR =
  /\.nf-health-(dialog|kicker|severity|candidate|preview|decision|confirm|issue|menu|branch|repair)|\.nf-library-settings/;

function isSidebarRule(selector: string): boolean {
  const parts = normalizeSelector(selector).split(', ');
  if (parts.length === 0) return false;
  return parts.every(
    (part) =>
      SIDEBAR_PREFIXES.some((prefix) => part.includes(prefix)) &&
      !NOT_SIDEBAR.test(part),
  );
}

const sidebarRules = rules.filter((candidate) => isSidebarRule(candidate.selector));

const TOKENS: Record<string, string> = {
  '--sb-title': 'calc(13px * var(--ui-scale))',
  '--sb-row': 'calc(12.5px * var(--ui-scale))',
  '--sb-result': 'calc(12px * var(--ui-scale))',
  '--sb-meta': 'calc(10.5px * var(--ui-scale))',
  '--sb-label': 'calc(9.5px * var(--ui-scale))',
  '--sb-count': 'calc(11px * var(--ui-scale))',
  '--sb-row-height': '28px',
  '--sb-result-height': '40px',
};

describe('sidebar type scale is the single source', () => {
  it('declares the approved --sb-* tokens on the root', () => {
    const root = declarationsOf(
      rules.find((candidate) => candidate.selector.trim() === ':root')?.body ?? '',
    );
    for (const [name, value] of Object.entries(TOKENS)) {
      expect(root.get(name), name).toBe(value);
    }
  });

  it('never declares a literal font-size in a sidebar rule', () => {
    expect(sidebarRules.length).toBeGreaterThan(40);
    const offenders = sidebarRules
      .filter((candidate) => {
        const value = declarationsOf(candidate.body).get('font-size');
        return value !== undefined && !value.startsWith('var(--sb-');
      })
      .map(
        (candidate) =>
          `${normalizeSelector(candidate.selector)}: ${declarationsOf(candidate.body).get('font-size')}`,
      );
    expect(offenders).toEqual([]);
  });

  it('uses every token it declares', () => {
    const css = stripComments(stylesSource);
    for (const name of Object.keys(TOKENS)) {
      expect(css.includes(`var(${name})`), `${name} is consumed`).toBe(true);
    }
  });

  it('reads each row role from its own token', () => {
    // Section title (Library switcher, Outline, Health, Search).
    expect(declaration('.nf-section-title', 'font-size')).toBe('var(--sb-title)');
    expect(declaration('.nf-section-title', 'font-weight')).toBe('600');
    expect(declaration('.nf-library-name', 'font-size')).toBe('var(--sb-title)');
    // Navigation rows: Library document, Library folder, Outline node.
    expect(declaration('.nf-library-open', 'font-size')).toBe('var(--sb-row)');
    expect(declaration('.nf-library-folder-row', 'font-size')).toBe('var(--sb-row)');
    expect(declaration('.nf-tree', 'font-size')).toBe('var(--sb-row)');
    // Result card first line and meta line.
    expect(declaration('.nf-result-row', 'font-size')).toBe('var(--sb-result)');
    expect(declaration('.nf-search-snippet', 'font-size')).toBe('var(--sb-result)');
    expect(declaration('.nf-health-row-quote', 'font-size')).toBe('var(--sb-result)');
    expect(declaration('.nf-health-row-meta', 'font-size')).toBe('var(--sb-meta)');
    expect(declaration('.nf-tree-count', 'font-size')).toBe('var(--sb-meta)');
    // Group labels.
    expect(declaration('.nf-search-group-label', 'font-size')).toBe('var(--sb-label)');
    expect(declaration('.nf-health-section-name', 'font-size')).toBe('var(--sb-label)');
    expect(declaration('.nf-search-group-label', 'text-transform')).toBe('uppercase');
    expect(declaration('.nf-health-section-name', 'text-transform')).toBe('uppercase');
  });
});

describe('sidebar row ladder', () => {
  it('keeps the 28 and 40 px heights on the tokens', () => {
    expect(declaration('.nf-library-open', 'height')).toBe('var(--sb-row-height)');
    expect(declaration('.nf-tree-row', 'min-height')).toBe('var(--sb-row-height)');
    expect(declaration('.nf-section-head', 'min-height')).toBe('var(--sb-row-height)');
    expect(declaration('.nf-search-group-row', 'min-height')).toBe('var(--sb-row-height)');
    expect(declaration('.nf-health-section-row', 'min-height')).toBe('var(--sb-row-height)');
    // The two-line problem row is the card's own height, no fourth value.
    expect(declaration('.nf-result-row', 'padding')).toBe('7px 8px');
    expect(declaration('.nf-result-row', 'border-radius')).toBe('4px');
    // The group chevron is a 16 px box on the left for both sections.
    expect(declaration('.nf-search-group-chevron', 'width')).toBe('16px');
    expect(declaration('.nf-health-section-chevron', 'width')).toBe('16px');
  });

  it('keeps the one section header and its count metric', () => {
    expect(declaration('.nf-section-head', 'padding')).toBe('2px 6px 4px');
    expect(declaration('.nf-section-count', 'font-size')).toBe('var(--sb-count)');
    expect(declaration('.nf-section-count', 'font-variant-numeric')).toBe('tabular-nums');
    expect(declaration('.nf-section-count', 'color')).toBe('var(--text-3)');
    // Library and Search put their controls after the count; Health keeps the
    // refresh out of the header entirely.
    expect(stylesSource).not.toContain('.nf-health-refresh-head');
  });

  it('steps the Outline 12 px per level and caps at three levels', () => {
    expect([1, 2, 3, 4, 5, 9].map((level) => sidebarDepthIndent(level))).toEqual([
      6, 18, 30, 42, 42, 42,
    ]);
    expect(sidebarDepthIndent(0)).toBe(6);
  });
});

describe('result cards and group dividers', () => {
  it('has exactly two card variants: current for Search, selected for Health', () => {
    expect(declaration('.nf-result-row[data-current="true"]', 'border-color')).toBe(
      'var(--accent)',
    );
    expect(declaration('.nf-result-row[data-current="true"]', 'box-shadow')).toBe(
      '0 0 0 1px var(--accent)',
    );
    expect(declaration('.nf-result-row[data-selected="true"]', 'border-color')).toBe(
      'var(--border-2)',
    );
    const selected = rules.find(
      (candidate) =>
        normalizeSelector(candidate.selector) === '.nf-result-row[data-selected="true"]',
    );
    expect(selected?.body).not.toMatch(/accent/);
    // No third variant and no pill.
    const variants = rules
      .filter((candidate) => candidate.selector.includes('.nf-result-row'))
      .map((candidate) => normalizeSelector(candidate.selector))
      .filter((selector) => selector.includes('['));
    expect(variants.sort()).toEqual([
      '.nf-result-row[data-current="true"]',
      '.nf-result-row[data-selected="true"]',
    ]);
    for (const candidate of rules.filter((rule) =>
      rule.selector.includes('.nf-result-row'),
    )) {
      expect(candidate.body).not.toMatch(/border-radius:\s*(999|1[0-9]{2,})px/);
    }
  });

  it('puts the divider on the group with symmetric 8 px padding', () => {
    expect(declaration('.nf-sidebar-group', 'padding')).toBe('8px 0');
    expect(declaration('.nf-sidebar-group', 'border-top')).toBe(
      '1px solid var(--border-1)',
    );
    expect(declaration('.nf-sidebar-group:first-child', 'border-top')).toBe('0');
    // No header that follows a group carries the rule any more.
    for (const candidate of rules.filter((rule) =>
      /nf-(section-head|search-group-row|health-section-row)/.test(
        normalizeSelector(rule.selector),
      ),
    )) {
      expect(candidate.body, `${candidate.selector} has no border-top`).not.toMatch(
        /border-top\s*:/,
      );
    }
  });
});

describe('one scroll owner', () => {
  it('reserves the 10 px gutter inside .nf-sidebar-scroll', () => {
    expect(declaration('.nf-sidebar-scroll', 'scrollbar-gutter')).toBe('stable');
    expect(declaration('.nf-sidebar-scroll', 'overflow-y')).toBe('auto');
    expect(declaration('.nf-sidebar-scroll', 'overflow-x')).toBe('hidden');
    expect(declaration('.nf-sidebar-scroll', 'padding')).toBe('0 8px 8px');
    // The reserved gutter is the global classic scrollbar, painted as a
    // transparent track and a thumb that only exists when needed.
    expect(declaration('::-webkit-scrollbar', 'width')).toBe('10px');
    expect(declaration('::-webkit-scrollbar-track', 'background')).toBe('transparent');
  });

  it('never adds a second scroll container inside the panel', () => {
    for (const candidate of sidebarRules) {
      const overflowY = declarationsOf(candidate.body).get('overflow-y');
      if (overflowY === undefined) continue;
      expect(
        normalizeSelector(candidate.selector),
        'only .nf-sidebar-scroll scrolls vertically',
      ).toBe('.nf-sidebar-scroll');
    }
  });

  it('does not touch the persisted width model', () => {
    // The gutter is internal: no rule may read or set the panel width on the
    // scroll container.
    const scroll = declarationsOf(
      rules.find(
        (candidate) => normalizeSelector(candidate.selector) === '.nf-sidebar-scroll',
      )?.body ?? '',
    );
    expect(scroll.has('width')).toBe(false);
    expect(scroll.has('max-width')).toBe(false);
    expect(scroll.has('margin')).toBe(false);
  });
});

describe('needs-repair dot', () => {
  it('is a 6 px circle at top-right and no counter is left', () => {
    expect(declaration('.nf-activity-dot', 'width')).toBe('6px');
    expect(declaration('.nf-activity-dot', 'height')).toBe('6px');
    expect(declaration('.nf-activity-dot', 'border-radius')).toBe('50%');
    expect(declaration('.nf-activity-dot', 'background')).toBe('var(--danger)');
    expect(declaration('.nf-activity-dot', 'top')).toBe('4px');
    expect(declaration('.nf-activity-dot', 'right')).toBe('4px');
    expect(stylesSource).not.toContain('.nf-activity-badge');
    expect(declaration('.nf-activity-section', 'position')).toBe('relative');
  });
});
