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
 * Product-owner guard: no block, card, chapter, library, page, tree, or
 * document-level status row may use a left accent bar. The Continuous card is
 * `.nf-block-body` (not `.nf-block-card`, which is the DOM measurement hook),
 * the Page renderer draws `.nf-page-card` on `.nf-page-sheet`, and callouts
 * share `.nf-block-body` with `data-callout`. Anchored outline rows are grouped
 * by indentation and the quote; selection is the same full-row ring as every
 * other row. R4 status surfaces (save failure, draft materialize, read-only
 * panel/slim bar) are neutral detached panels with no stripe.
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
  'nf-save-failure',
  'nf-draft-banner',
  'nf-status-panel',
  'nf-status-slim',
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
  'nf-save-failure',
  'nf-draft-banner',
  'nf-status-panel',
  'nf-status-slim',
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

  it('keeps the save-failure and status panels neutral detached surfaces (R4)', async () => {
    const css = await readFile(stylesPath, 'utf8');
    const allRules = rules(css);
    for (const token of ['nf-save-failure', 'nf-draft-banner', 'nf-status-panel', 'nf-status-slim']) {
      const surface = allRules.find((rule) =>
        rule.selector.trim().endsWith(`.${token}`),
      );
      expect(surface, `${token} base rule exists`).toBeDefined();
      expect(surface?.body, `${token} has no left stripe`).not.toMatch(
        /border-(inline-start|left)\s*:/,
      );
      expect(surface?.body, `${token} has no left accent shadow`).not.toMatch(
        /box-shadow\s*:/,
      );
    }
    const saveFailure = allRules.find((rule) =>
      rule.selector.trim().endsWith('.nf-save-failure'),
    );
    expect(saveFailure?.body).toMatch(/border:\s*1px solid var\(--border-1\)/);
    expect(saveFailure?.body).toContain('border-radius: var(--radius-panel)');
    expect(saveFailure?.body).toContain('background: var(--surface-1)');
  });
});
