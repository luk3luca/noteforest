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
 * Product-owner guard: no block, card, chapter, library, or tree row may use a
 * left accent bar. Anchored outline rows are grouped by indentation and the
 * quote; selection is the same full-row ring as every other row.
 */
describe('no left accent bars', () => {
  it('keeps left borders out of tree, block, card, chapter, and library rows', async () => {
    const css = await readFile(stylesPath, 'utf8');
    const rowRules = rules(css).filter((rule) =>
      /(nf-tree|nf-block-card|nf-card|nf-chapter|nf-library-row)/.test(rule.selector),
    );
    expect(rowRules.length).toBeGreaterThan(0);
    for (const rule of rowRules) {
      expect(rule.body, `${rule.selector} has no left border accent`).not.toMatch(
        /border-(inline-start|left)\s*:/,
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
