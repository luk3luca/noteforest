import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesPath = resolve(import.meta.dirname, '../src/renderer/src/styles.css');

interface CssRule {
  selector: string;
  body: string;
}

function rules(css: string): CssRule[] {
  const result: CssRule[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const selector = (match[1] ?? '').trim();
    const body = match[2] ?? '';
    if (selector.length > 0) result.push({ selector, body });
  }
  return result;
}

/**
 * Product-owner guard: no block, card, chapter, library, page, or tree row may
 * use a left accent bar. The Continuous card is `.nf-block-body` (not
 * `.nf-block-card`, which is the DOM measurement hook), the Page renderer draws
 * `.nf-page-card` on `.nf-page-sheet`, and callouts share `.nf-block-body`
 * with `data-callout`. Anchored outline rows are grouped by indentation and the
 * quote; selection is the same full-row ring as every other row.
 */
const LEFT_ACCENT_FREE = [
  'nf-tree',
  'nf-block-card',
  'nf-block-body',
  'nf-block-inner',
  'nf-card',
  'nf-chapter',
  'nf-library-row',
  'nf-page-card',
  'nf-page-sheet',
  'data-callout',
];

/**
 * Classes that must exist in the stylesheet and be covered. The DOM-only hooks
 * (`nf-block-card`) and the shared `nf-card` prefix are filtered but cannot be
 * required: they are not class selectors here.
 */
const REQUIRED_COVERAGE = [
  'nf-tree',
  'nf-block-body',
  'nf-block-inner',
  'nf-chapter',
  'nf-library-row',
  'nf-page-card',
  'nf-page-sheet',
  'data-callout',
];

describe('no left accent bars', () => {
  it('keeps left borders out of every tree, block, callout, page, and library row', async () => {
    const css = await readFile(stylesPath, 'utf8');
    const rowRules = rules(css).filter((rule) =>
      LEFT_ACCENT_FREE.some((token) => rule.selector.includes(token)),
    );
    expect(rowRules.length).toBeGreaterThan(0);
    // The real surfaces must be covered. `nf-block-card` is a DOM hook and
    // `nf-card` is a shared custom-property prefix; both are filtered but are
    // not class selectors in this stylesheet.
    for (const token of REQUIRED_COVERAGE) {
      expect(
        rowRules.some((rule) => rule.selector.includes(token)),
        `the guard actually covers ${token}`,
      ).toBe(true);
    }
    for (const rule of rowRules) {
      expect(rule.body, `${rule.selector} has no left border accent`).not.toMatch(
        /border-(inline-start|left)\s*:/,
      );
      expect(rule.body, `${rule.selector} has no left accent shadow`).not.toMatch(
        /box-shadow\s*:[^;]*\b(?:-?2px|3px|4px)\s+0(?:px)?\s+0(?:px)?[^;]*/,
      );
    }
  });

  it('removes the anchor-row left rule and the first/last radius adjustments', async () => {
    const css = await readFile(stylesPath, 'utf8');
    const anchorRules = rules(css).filter((rule) =>
      rule.selector.includes('.nf-tree-anchor-row'),
    );
    expect(anchorRules.length).toBeGreaterThan(0);
    for (const rule of anchorRules) {
      expect(rule.body, `${rule.selector} has no left rule`).not.toMatch(
        /border-(inline-start|left)\s*:/,
      );
      expect(rule.body, `${rule.selector} keeps the standard row radius`).not.toMatch(
        /border-(start-start|end-start)-radius\s*:/,
      );
    }
    const selected = anchorRules.find((rule) =>
      rule.selector.includes('[data-anchor-selected="true"]'),
    );
    expect(selected).toBeDefined();
    expect(selected?.body).toContain('inset 0 0 0 1px var(--accent)');
  });
});
