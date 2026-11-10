import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyDesignTokens } from '../src/renderer/src/lib/apply-design-tokens';
import {
  DESIGN_TOKENS,
  DESIGN_TOKEN_CSS_VARIABLES,
} from '../src/renderer/src/lib/design-tokens';
import { GEOMETRY } from '../src/renderer/src/lib/geometry';

const stylesSource = readFileSync(
  new URL('../src/renderer/src/styles.css', import.meta.url),
  'utf8',
);
const mainSource = readFileSync(
  new URL('../src/renderer/src/main.tsx', import.meta.url),
  'utf8',
);

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

function declarations(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of source.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const property = part.slice(0, colon).trim();
    if (property.length === 0) continue;
    result.set(property, part.slice(colon + 1).trim());
  }
  return result;
}

function declaration(selector: string, property: string, source = css): string | undefined {
  return declarations(block(source, selector)).get(property);
}

const mappedVariables = Object.entries(DESIGN_TOKEN_CSS_VARIABLES);

describe('design tokens are the single source for CSS geometry', () => {
  it('keeps the ratified shell and layout values', () => {
    expect(DESIGN_TOKENS.editorPaddingBottom).toBe(88);
    expect(DESIGN_TOKENS.chapterGap).toBe(28);
    expect(DESIGN_TOKENS.siblingGap).toBe(24);
    expect(DESIGN_TOKENS.callout.safeGap).toBe(16);
    expect(DESIGN_TOKENS.siblingGap).toBeGreaterThanOrEqual(DESIGN_TOKENS.callout.safeGap);
    expect(DESIGN_TOKENS.rowIndent).toBe(26);
    expect(DESIGN_TOKENS.trunkInset).toBe(12);
    expect(DESIGN_TOKENS.trunkGap).toBe(0);
    expect(DESIGN_TOKENS.stemMin).toBe(12);
    expect(DESIGN_TOKENS.cardPadding).toBe(10);
    expect(DESIGN_TOKENS.topLevelMinWidth).toBe(160);
    expect(DESIGN_TOKENS.topLevelMaxWidth).toBe(480);
    expect(DESIGN_TOKENS.childMinWidth).toBe(144);
    expect(DESIGN_TOKENS.childMaxWidth).toBe(420);
  });

  it('publishes the documented CSS variables from the token module', () => {
    expect(DESIGN_TOKEN_CSS_VARIABLES).toMatchObject({
      '--nf-canvas-max': '3200px',
      '--nf-canvas-pad-x': '40px',
      '--nf-canvas-pad-top': '40px',
      '--nf-canvas-pad-bottom': '88px',
      '--nf-chapter-gap': '28px',
      '--nf-child-gap': '24px',
      '--nf-child-row-gap': '16px',
      '--nf-card-padding': '10px',
      '--nf-card-radius': '4px',
      '--nf-note-radius': '9px',
      '--nf-child-min-width': '144px',
      '--nf-child-max-width': '420px',
      '--nf-top-level-min-width': '160px',
      '--nf-top-level-max-width': '480px',
      '--nf-row-indent': '26px',
      '--nf-edge-width': '1.25',
      '--nf-edge-width-active': '1.75',
      '--nf-edge-width-muted': '1',
      '--nf-z-edge': '0',
      '--nf-z-right-group': '0',
      '--nf-z-lane': '1',
      '--nf-z-card': '2',
    });
  });

  it('applies every mapped variable to the root before rendering', () => {
    const applied = new Map<string, string>();
    applyDesignTokens({
      style: {
        setProperty: (name: string, value: string) => {
          applied.set(name, value);
        },
      },
    });
    for (const [name, value] of mappedVariables) {
      expect(applied.get(name), name).toBe(value);
    }

    const callIndex = mainSource.indexOf('applyDesignTokens();');
    expect(callIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeLessThan(mainSource.indexOf('createRoot(container)'));
  });

  it('does not declare a CSS value that the token module owns', () => {
    const root = block(css, ':root');
    for (const [name] of mappedVariables) {
      expect(root.includes(`${name}:`), `${name} is applied at boot`).toBe(false);
      expect(css.includes(`var(${name},`), `${name} has no literal fallback`).toBe(false);
    }
    expect(css).not.toContain('--radius-block');
    expect(css).not.toMatch(/--nf-child-gap:\s*24px/);
  });

  it('consumes every CSS-bound token through a root variable', () => {
    for (const [name] of mappedVariables) {
      expect(css.includes(`var(${name})`), `${name} is consumed by styles.css`).toBe(true);
    }
  });

  it('wires the canvas, chapter, group, and card geometry', () => {
    expect(declaration('.nf-canvas', 'max-width')).toBe('var(--nf-canvas-max)');
    expect(declaration('.nf-canvas', 'padding')).toBe(
      'var(--nf-canvas-pad-top) var(--nf-canvas-pad-x) var(--nf-canvas-pad-bottom)',
    );
    expect(declaration('.nf-chapter', 'margin-bottom')).toBe('var(--nf-chapter-gap)');
    expect(declaration('.nf-chapter-blocks > div', 'gap')).toBe('var(--nf-child-row-gap)');
    expect(declaration('.nf-branch-children', 'margin-left')).toBe('var(--nf-child-gap)');
    expect(declaration('.nf-branch-children-inner > div', 'gap')).toBe(
      'var(--nf-child-row-gap)',
    );
    expect(declaration('.nf-block-node.nf-below-row', 'margin-left')).toBe(
      'var(--nf-row-indent)',
    );

    expect(declaration('.nf-block-body', 'min-width')).toBe('var(--nf-child-min-width)');
    expect(declaration('.nf-block-body', 'max-width')).toBe('var(--nf-child-max-width)');
    expect(declaration('.nf-block-body', 'padding')).toBe('var(--nf-card-padding)');
    expect(declaration('.nf-block-body', 'border-radius')).toBe('var(--nf-note-radius)');
    // The Continuous note radius is a separate token; Page cards keep the
    // shared 4 px radius (V0 visual must not change Page/PDF).
    expect(declaration('.nf-page-card', 'border-radius')).toBe('var(--nf-card-radius)');
    expect(declaration('.nf-block-body[data-top-level="true"]', 'min-width')).toBe(
      'var(--nf-top-level-min-width)',
    );
    expect(declaration('.nf-block-body[data-top-level="true"]', 'max-width')).toBe(
      'var(--nf-top-level-max-width)',
    );
  });

  it('wires the responsive canvas steps without new literals', () => {
    const medium = block(css, '@media (max-width: 1100px)');
    const compact = block(css, '@media (max-width: 900px)');
    expect(declaration('.nf-canvas', 'padding', medium)).toBe(
      'var(--nf-canvas-pad-top-medium) var(--nf-canvas-pad-x-medium) var(--nf-canvas-pad-bottom-medium)',
    );
    expect(declaration('.nf-canvas', 'padding', compact)).toBe(
      'var(--nf-canvas-pad-top-compact) var(--nf-canvas-pad-x-compact) var(--nf-canvas-pad-bottom-compact)',
    );
  });

  it('wires the edge widths and the documented stacking order', () => {
    expect(declaration('.nf-edge-path', 'stroke-width')).toBe('var(--nf-edge-width)');
    expect(declaration('.nf-edge-trunk', 'stroke-width')).toBe('var(--nf-edge-width)');
    expect(declaration('.nf-edge-reference', 'stroke-width')).toBe('var(--nf-edge-width)');
    expect(declaration('.nf-edge-reference-arrow', 'stroke-width')).toBe(
      'var(--nf-edge-width)',
    );
    expect(declaration('.nf-edge-active', 'stroke-width')).toBe(
      'var(--nf-edge-width-active)',
    );
    expect(declaration('.nf-edge-muted', 'stroke-width')).toBe(
      'var(--nf-edge-width-muted)',
    );
    expect(declaration('.nf-edge-layer', 'z-index')).toBe('var(--nf-z-edge)');
    expect(
      declaration(
        '.nf-block-inner[data-callouts="true"] > div > .react-renderer.node-blockBody > .nf-block-body',
        'z-index',
      ),
    ).toBe('var(--nf-z-card)');
    expect(
      declaration(
        '.nf-block-inner[data-callouts="true"] > div > .react-renderer.node-calloutLane',
        'z-index',
      ),
    ).toBe('var(--nf-z-lane)');
    expect(
      declaration(
        '.nf-block-inner[data-callouts="true"] > div > .react-renderer.node-branchChildren',
        'z-index',
      ),
    ).toBe('var(--nf-z-right-group)');
  });

  it('keeps router-only geometry in TS with no CSS copy', () => {
    expect(DESIGN_TOKENS.calloutGap).toBe(16);
    expect(DESIGN_TOKENS.calloutMinWidth).toBe(240);
    expect(DESIGN_TOKENS.calloutMaxWidth).toBe(480);
    expect(DESIGN_TOKENS.callout.maxAnchorOffset).toBe(160);
    expect(GEOMETRY.edgeArrowLength).toBe(6);
    expect(GEOMETRY.edgeArrowHalfWidth).toBe(3);
    expect(GEOMETRY.edgeGap).toBe(2);
    expect(GEOMETRY.edgeRadius).toBe(2);

    for (const name of [
      '--nf-trunk-inset',
      '--nf-trunk-gap',
      '--nf-stem-min',
      '--nf-callout-gap',
      '--nf-callout-lane-min',
      '--nf-callout-lane-max',
      '--nf-callout-safe-gap',
      '--nf-callout-max-anchor-offset',
      '--nf-edge-arrow-length',
      '--nf-edge-arrow-half-width',
    ]) {
      expect(css.includes(name), `${name} is router-only`).toBe(false);
    }
  });

  it('removed the unused bus/port spacing tokens', () => {
    expect('edgeBusOffset' in DESIGN_TOKENS).toBe(false);
    expect('edgePortSpacing' in DESIGN_TOKENS).toBe(false);
  });
});
