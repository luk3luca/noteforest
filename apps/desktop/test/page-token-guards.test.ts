import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT_OPTIONS,
  EDGE_STYLE,
  PAGE_BODY_PT_FLOOR,
  PAGE_DENSITY_DEFAULT,
  PAGE_DENSITY_MAX,
  PAGE_DENSITY_MIN,
  PAGE_DENSITY_STEP,
  PAGE_MAX_CARD_WIDTH_MAX,
  PAGE_MAX_CARD_WIDTH_MIN,
  PAGE_MIN_CONTENT_WIDTH_FLOOR,
  PAGE_THEME_PRESETS,
  pageCssVariables,
} from '@noteforest/layout';
import {
  DESIGN_TOKENS,
  DESIGN_TOKEN_CSS_VARIABLES,
} from '../src/renderer/src/lib/design-tokens';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

const stylesSource = read('../src/renderer/src/styles.css');
const layoutSource = read('../../../packages/layout/src/layout.ts');
const pageSettingsSource = read('../../../packages/layout/src/page-settings.ts');
const typesSource = read('../../../packages/layout/src/types.ts');
const pageViewSource = read('../src/renderer/src/page/PageView.tsx');
const measurementSource = read('../src/renderer/src/page/measurement.ts');
const pageEditorSource = read('../src/renderer/src/page/PageBlockEditor.tsx');
const printDocumentSource = read('../src/renderer/src/print/PrintDocument.tsx');

const indexDoc = read('../../../docs/design-tokens.md');
const pageDoc = read('../../../docs/design-tokens-page.md');
const continuousDoc = read('../../../docs/design-tokens-continuous.md');

const css = stylesSource
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function block(source: string, header: string): string {
  const marker = `${header} {`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`missing CSS block: ${marker}`);
  let depth = 0;
  const begin = start + marker.length;
  for (let index = begin - 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(begin, index);
    }
  }
  throw new Error(`unterminated CSS block: ${marker}`);
}

function declaration(selector: string, property: string): string | undefined {
  for (const part of block(css, selector).split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    if (part.slice(0, colon).trim() === property) return part.slice(colon + 1).trim();
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function numericRow(doc: string, name: string): [number, number] | null {
  const pattern = new RegExp(
    '^\\| `' + escapeRegExp(name) + '`(?: \\([^)]*\\))? \\| ([0-9.]+) \\| ([0-9.]+) \\|',
    'm',
  );
  const match = doc.match(pattern);
  return match === null ? null : [Number(match[1]), Number(match[2])];
}

function valueRow(doc: string, name: string): number | null {
  const pattern = new RegExp('^\\| `' + escapeRegExp(name) + '` \\| ([0-9.]+) \\|', 'm');
  const match = doc.match(pattern);
  return match === null ? null : Number(match[1]);
}

describe('Page and Continuous token ownership', () => {
  it('keeps the token index and both surface docs linked', () => {
    expect(indexDoc).toContain('design-tokens-page.md');
    expect(indexDoc).toContain('design-tokens-continuous.md');
    expect(pageDoc).toContain('design-tokens.md');
    expect(pageDoc).toContain('design-tokens-continuous.md');
    expect(continuousDoc).toContain('design-tokens.md');
    expect(continuousDoc).toContain('design-tokens-page.md');
  });

  it('documents every PageTheme field and every compact/comfortable value', () => {
    for (const key of Object.keys(PAGE_THEME_PRESETS.compact)) {
      expect(pageDoc, `Page doc missing ${key}`).toContain(`\`${key}\``);
    }
    for (const key of Object.keys(DEFAULT_LAYOUT_OPTIONS)) {
      expect(pageDoc, `Page doc missing LayoutOptions.${key}`).toContain(`\`${key}\``);
    }

    for (const [key, value] of Object.entries(PAGE_THEME_PRESETS.compact)) {
      if (typeof value !== 'number') continue;
      const row = numericRow(pageDoc, key);
      expect(row, `Page doc missing numeric row ${key}`).not.toBeNull();
      expect(row?.[0], `${key} compact`).toBe(value);
      expect(row?.[1], `${key} comfortable`).toBe(PAGE_THEME_PRESETS.comfortable[
        key as keyof typeof PAGE_THEME_PRESETS.comfortable
      ]);
    }

    for (const [key, value] of Object.entries(DEFAULT_LAYOUT_OPTIONS)) {
      if (typeof value !== 'number') continue;
      expect(valueRow(pageDoc, key), `Page doc default for ${key}`).toBe(value);
    }
  });

  it('documents the exported Page density/readability constants', () => {
    const constants: Array<[string, number]> = [
      ['PAGE_DENSITY_MIN', PAGE_DENSITY_MIN],
      ['PAGE_DENSITY_MAX', PAGE_DENSITY_MAX],
      ['PAGE_DENSITY_STEP', PAGE_DENSITY_STEP],
      ['PAGE_DENSITY_DEFAULT', PAGE_DENSITY_DEFAULT],
      ['PAGE_BODY_PT_FLOOR', PAGE_BODY_PT_FLOOR],
      ['PAGE_MIN_CONTENT_WIDTH_FLOOR', PAGE_MIN_CONTENT_WIDTH_FLOOR],
      ['PAGE_MAX_CARD_WIDTH_MIN', PAGE_MAX_CARD_WIDTH_MIN],
      ['PAGE_MAX_CARD_WIDTH_MAX', PAGE_MAX_CARD_WIDTH_MAX],
    ];
    for (const [name, value] of constants) {
      expect(valueRow(pageDoc, name), `Page doc constant ${name}`).toBe(value);
    }

    expect(PAGE_THEME_PRESETS.compact.childIndent).toBe(26);
    expect(PAGE_THEME_PRESETS.comfortable.childIndent).toBe(26);
    expect(DEFAULT_LAYOUT_OPTIONS.childIndent).toBe(26);
    expect(pageDoc).toContain('engine default');
  });

  it('documents every Continuous shell token, CSS variable, and shared edge value', () => {
    for (const key of Object.keys(DESIGN_TOKENS)) {
      if (key === 'callout') {
        expect(continuousDoc).toContain('`callout.maxAnchorOffset`');
        expect(continuousDoc).toContain('`callout.safeGap`');
        continue;
      }
      if (key === 'zIndex') {
        for (const nested of Object.keys(DESIGN_TOKENS.zIndex)) {
          expect(continuousDoc).toContain(`\`zIndex.${nested}\``);
        }
        continue;
      }
      expect(continuousDoc, `Continuous doc missing ${key}`).toContain(`\`${key}\``);
    }
    for (const name of Object.keys(DESIGN_TOKEN_CSS_VARIABLES)) {
      expect(continuousDoc, `Continuous doc missing ${name}`).toContain(name);
    }
    for (const name of Object.keys(EDGE_STYLE)) {
      expect(continuousDoc, `Continuous doc missing EDGE_STYLE.${name}`).toContain(`\`${name}\``);
    }
    expect(continuousDoc).toContain('DocumentViewState.zoom');
  });

  it('removes stale ownership wording', () => {
    for (const doc of [indexDoc, pageDoc, continuousDoc]) {
      expect(doc).not.toContain('M6');
      expect(doc).not.toMatch(/cumulative/i);
    }
    expect(typesSource).not.toMatch(/cumulative/i);
    expect(typesSource).not.toContain('compaction for compact');
    expect(typesSource).toContain('ENGINE_DEFAULT_CHILD_INDENT');
  });
});

describe('Page CSS consumes only Page-owned variables', () => {
  const pageVariables = Object.keys(pageCssVariables(PAGE_THEME_PRESETS.compact));

  it('has no compact PageTheme fallback copy in CSS', () => {
    for (const name of pageVariables) {
      expect(stylesSource, `${name} must not be declared in CSS`).not.toContain(`${name}:`);
      expect(css, `${name} must be consumed from the runtime map`).toContain(`var(${name})`);
    }
  });

  it('sizes Page measurement from the Page cap, not a Continuous token', () => {
    expect(declaration('.nf-measure-card', 'width')).toBe('var(--nf-page-max-card-width)');
    expect(declaration('.nf-measure-settle', 'width')).toBe('var(--nf-page-max-card-width)');
    expect(declaration('.nf-measure-card', 'width')).not.toContain('--nf-child-max-width');
  });

  it('keeps Continuous-only tokens out of the Page content scope', () => {
    const start = stylesSource.indexOf('\n.nf-page-scope {');
    const end = stylesSource.indexOf('\n.nf-page-view {');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const pageContent = stylesSource.slice(start, end);

    for (const token of [
      '--nf-canvas-',
      '--nf-chapter-gap',
      '--nf-child-gap',
      '--nf-child-row-gap',
      '--nf-card-padding',
      '--nf-child-min-width',
      '--nf-child-max-width',
      '--nf-top-level-',
      '--nf-row-indent',
      '--nf-callout-',
      '--nf-lane-width',
      '--nf-right-group-height',
      '--nf-sidebar-width',
    ]) {
      expect(pageContent, `Page content reads Continuous token ${token}`).not.toContain(token);
    }
    // The card radius is an explicitly shared primitive, not a leak.
    expect(pageContent).toContain('var(--nf-card-radius)');
  });

  it('applies the same Page variable map on every runtime surface', () => {
    expect(pageViewSource).toContain('pageCssVariables(settings.theme)');
    expect(measurementSource).toContain('applyPageCssVariables(host, settings.theme)');
    expect(pageEditorSource).toContain('pageCssVariables(settings.theme)');
    expect(printDocumentSource).toContain('model.cssVariables');
  });
});

describe('legacy Page values are gone or explicitly owned', () => {
  it('removes the unnamed legacy literals and dead conversions', () => {
    expect(layoutSource).not.toContain('CALLOUT_ROW_INDENT');
    // The only 144 is the named legacy constant declaration; no inline literal remains.
    expect(layoutSource.match(/\b144\b/g) ?? []).toHaveLength(1);
    expect(layoutSource).toContain('LEGACY_BESIDE_READABLE_WIDTH = 144;');
    expect(layoutSource).toContain('LEGACY_BESIDE_READABLE_WIDTH');
    expect(layoutSource).toContain('LEGACY_BESIDE_ANCHOR_INSET');
    expect(pageSettingsSource).not.toContain('pxToMm');
    expect(pageSettingsSource).not.toContain('MM_PER_PX');
    expect(pageSettingsSource).toContain('mmToPx');
  });

  it('keeps the engine default documented instead of reading a Page preset silently', () => {
    expect(DEFAULT_LAYOUT_OPTIONS.childIndent).toBe(PAGE_THEME_PRESETS.compact.childIndent);
    expect(pageDoc).toMatch(/engine default/);
    expect(pageDoc).toContain('Continuous renderer does not call `layoutDocument`');
  });
});
