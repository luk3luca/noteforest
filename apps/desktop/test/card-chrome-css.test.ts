import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DESIGN_TOKENS } from '../src/renderer/src/lib/design-tokens';

/**
 * Card chrome guards (S2.2, `docs/design/card-chrome.md`).
 *
 * 1. Text chips are rounded rectangles. `border-radius: 999px` (a capsule) is
 *    forbidden outside `.nf-branch-port`, which stays a circular icon port.
 * 2. The eight text chips share the control radius, a 1 px border and, on the
 *    Continuous surface, the 20 px chip height.
 * 3. The chrome row is in flow: neither the row nor its chips are absolute, so
 *    nothing floats over the card edge or the next card.
 * 4. See also and Referenced by keep their dashed/solid distinction.
 */

const stylesSource = readFileSync(
  new URL('../src/renderer/src/styles.css', import.meta.url),
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

function normalizeSelector(selector: string): string {
  return selector
    .split(',')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
    .join(', ');
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

function declarations(body: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const property = part.slice(0, colon).trim();
    if (property.length === 0) continue;
    result.set(
      property,
      part
        .slice(colon + 1)
        .replace(/\s*!important\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }
  return result;
}

const rules = collectRules(stylesSource);

function declarationsOf(selector: string): Map<string, string> {
  const rule = rules.find(
    (candidate) => normalizeSelector(candidate.selector) === selector,
  );
  if (rule === undefined) throw new Error(`missing CSS rule: ${selector}`);
  return declarations(rule.body);
}

/** Text chips: the app's rounded rectangle, never a capsule. */
const TEXT_CHIPS = [
  '.nf-anchor-warning',
  '.nf-ref-chip',
  '.nf-callout-state',
  '.nf-image-action',
  '.nf-image-draw-hint',
  '.nf-recovery-pill',
  '.nf-tree-shared',
] as const;

/** Continuous-only chips: a fixed 20 px row height. */
const CONTINUOUS_20PX_CHIPS = [
  '.nf-anchor-warning',
  '.nf-ref-chip',
  '.nf-callout-state',
  '.nf-image-action',
  '.nf-image-draw-hint',
  '.nf-recovery-pill',
  '.nf-tree-shared',
] as const;

describe('text chips are not capsules', () => {
  it('allows border-radius 999px only on the branch port', () => {
    const offenders =
      [...stripComments(stylesSource).matchAll(/border-radius:\s*999px/g)].length;
    const capsuleRules = rules.filter((rule) =>
      /border-radius:\s*999px/.test(rule.body),
    );
    expect(offenders).toBe(capsuleRules.length);
    expect(capsuleRules.map((rule) => normalizeSelector(rule.selector))).toEqual([
      '.nf-branch-port',
    ]);
    // The one exception is the circular icon port, and it stays circular.
    expect(declarationsOf('.nf-branch-port').get('border-radius')).toBe('999px');
  });

  it('gives every text chip the control radius and a 1 px border', () => {
    for (const selector of TEXT_CHIPS) {
      const style = declarationsOf(selector);
      expect(style.get('border-radius'), selector).toBe('var(--radius-control)');
      // See also is the one dashed chip; the rest are solid. Both are 1 px.
      expect(style.get('border'), `${selector} border`).toMatch(/^1px (solid|dashed) /);
    }
    // The Page badge draws its 1 px border from its defect/anchor variants; on
    // the paper surface only the radius is in scope (design §2 exception).
    expect(declarationsOf('.nf-page-badge').get('border-radius')).toBe(
      'var(--radius-control)',
    );
  });

  it('gives every Continuous text chip the 20 px chip height', () => {
    for (const selector of CONTINUOUS_20PX_CHIPS) {
      expect(declarationsOf(selector).get('height'), selector).toBe('20px');
    }
    // The Page badge keeps its Page/PDF geometry; only its radius changed.
    expect(declarationsOf('.nf-page-badge').has('height')).toBe(false);
  });
});

describe('card chrome row', () => {
  it('keeps the row and its chips in flow inside the card', () => {
    const row = declarationsOf('.nf-block-chrome');
    expect(row.has('position')).toBe(false);
    expect(row.get('display')).toBe('flex');
    expect(row.get('flex-wrap')).toBe('wrap');
    expect(row.get('margin-top')).toBe('6px');
    for (const selector of ['.nf-anchor-warning', '.nf-ref-chip']) {
      expect(declarationsOf(selector).has('position'), selector).toBe(false);
    }
    // The removed overlay helper is gone with its absolute positioning.
    expect(
      rules.some((rule) => normalizeSelector(rule.selector) === '.nf-ref-chips'),
    ).toBe(false);
  });

  it('keeps the See also dashed and Referenced by solid distinction', () => {
    expect(declarationsOf('.nf-ref-chip').get('border')).toContain('dashed');
    expect(declarationsOf('.nf-ref-chip').get('border-radius')).toBe(
      'var(--radius-control)',
    );
    expect(declarationsOf('.nf-ref-chip-referenced-by').get('border-style')).toBe(
      'solid',
    );
  });

  it('aligns the callout quote chip with the state and reference chips at 20 px', () => {
    // Phase 6 chip fix: the quote chip is a button with a 11 px face, the state
    // and reference chips keep 20 px / 10.5 px. All three read as one 20 px row
    // at rest; the quote may still grow for a KaTeX formula.
    const quote = declarationsOf('.nf-callout-quote');
    expect(quote.get('min-height')).toBe('20px');
    expect(quote.get('font-size')).toBe('11px');
    expect(quote.has('height')).toBe(false);
    expect(declarationsOf('.nf-callout-quote-code').get('font-size')).toBe('11px');
    for (const selector of ['.nf-callout-state', '.nf-ref-chip']) {
      expect(declarationsOf(selector).get('height'), selector).toBe('20px');
      expect(declarationsOf(selector).get('font-size'), selector).toBe('10.5px');
    }
  });

  it('keeps the canvas inset clear of the 16 px gutter and drag handle', () => {
    // The gutter is 16 px to the left of the card and 14 px wide; the canvas
    // inset is what keeps it inside the visible scroll area at every width.
    expect(declarationsOf('.nf-gutter').get('left')).toBe('-16px');
    expect(declarationsOf('.nf-gutter').get('width')).toBe('14px');
    for (const padding of [
      DESIGN_TOKENS.editorPaddingX,
      DESIGN_TOKENS.editorPaddingXMedium,
      DESIGN_TOKENS.editorPaddingXCompact,
    ]) {
      expect(padding).toBeGreaterThanOrEqual(16);
    }
    // The token is applied at boot, so the stylesheet consumes the variable and
    // never repeats the literal.
    expect(declarationsOf('.nf-canvas').get('padding')).toBe(
      'var(--nf-canvas-pad-top) var(--nf-canvas-pad-x) var(--nf-canvas-pad-bottom)',
    );
  });
});
