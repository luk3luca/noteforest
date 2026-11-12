import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Batch V visual guards. The Electron UI suite covers the live geometry and
 * computed styles; this suite keeps the CSS contract for states that need a
 * special document (missing/locked tabs) from drifting silently.
 */

const stylesSource = readFileSync(
  new URL('../src/renderer/src/styles.css', import.meta.url),
  'utf8',
);
const css = stylesSource
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function block(selector: string): string {
  const marker = `${selector} {`;
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`missing CSS block: ${marker}`);
  let depth = 0;
  const begin = start + marker.length;
  for (let index = begin - 1; index < css.length; index += 1) {
    const character = css[index];
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(begin, index);
    }
  }
  throw new Error(`unterminated CSS block: ${marker}`);
}

function declaration(selector: string, property: string): string | undefined {
  for (const part of block(selector).split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    if (part.slice(0, colon).trim() !== property) continue;
    return part
      .slice(colon + 1)
      .replace(/\s*!important\s*$/, '')
      .trim();
  }
  return undefined;
}

describe('Batch V visual contracts', () => {
  it('keeps one 980 px Settings surface with a fixed height and content column', () => {
    expect(declaration('.nf-settings-modal', 'width')).toBe('980px');
    expect(declaration('.nf-settings-modal', 'max-width')).toBe('92vw');
    expect(declaration('.nf-settings', 'height')).toBe('580px');
    expect(declaration('.nf-settings-pane', 'max-width')).toBe('536px');
    expect(declaration('.nf-settings-pane', 'margin')).toBe('0 auto');
    expect(stylesSource).not.toContain('.nf-settings-modal-page');
    expect(css).toContain(
      '@media (max-width: 920px) { .nf-settings-modal { width: 840px; } .nf-settings-preview { display: none; }',
    );
  });

  it('keeps the active tab expanded and inactive tabs compact at the floor', () => {
    expect(declaration('.nf-tab', 'flex')).toBe('0 1 96px');
    expect(declaration('.nf-tab', 'min-width')).toBe('80px');
    expect(declaration('.nf-tab', 'max-width')).toBe('96px');
    expect(declaration('.nf-tab[data-active="true"]', 'flex')).toBe('1 1 170px');
    expect(declaration('.nf-tab[data-active="true"]', 'min-width')).toBe('170px');
    expect(declaration('.nf-tab[data-active="true"]', 'max-width')).toBe('220px');
  });

  it('never shrinks tab status icons or the close control', () => {
    expect(declaration('.nf-tab-missing', 'flex')).toBe('0 0 12px');
    expect(declaration('.nf-tab-missing', 'width')).toBe('12px');
    expect(declaration('.nf-tab-missing', 'height')).toBe('12px');
    expect(declaration('.nf-tab-missing', 'border-radius')).toBe('50%');
    expect(declaration('.nf-tab-lock', 'flex')).toBe('none');
    expect(declaration('.nf-tab-close', 'flex')).toBe('none');
    expect(declaration('.nf-tab-dot', 'flex')).toBe('0 0 5px');
  });

  it('keeps the toast surface on the app tokens', () => {
    expect(declaration('[data-sonner-toaster]', '--width')).toBe('340px');
    const toast = "[data-sonner-toaster] [data-sonner-toast][data-styled='true']";
    expect(declaration(toast, 'padding')).toBe('12px 14px');
    expect(declaration(toast, 'border-radius')).toBe('var(--radius-panel)');
    expect(declaration(toast, 'background')).toBe('var(--surface-3)');
    expect(declaration(toast, 'border')).toBe('1px solid var(--border-1)');
    expect(declaration(toast, 'box-shadow')).toBe('var(--shadow-toast)');
    expect(declaration(`${toast} [data-title]`, 'font-size')).toBe(
      'calc(12.5px * var(--ui-scale))',
    );
    expect(declaration(`${toast} [data-title]`, 'font-weight')).toBe('500');
    expect(declaration(`${toast} [data-description]`, 'font-size')).toBe(
      'calc(11.5px * var(--ui-scale))',
    );
    expect(declaration(`${toast} [data-description]`, 'font-weight')).toBe('400');
    expect(declaration(`${toast} [data-description]`, 'color')).toBe(
      'var(--text-2)',
    );
    expect(declaration(`${toast} [data-icon]`, 'width')).toBe('16px');
    expect(declaration(`${toast} [data-icon] svg`, 'stroke-width')).toBe('1.5');
    expect(declaration("[data-sonner-toast][data-type='success'] [data-icon]", 'color')).toBe(
      'var(--success)',
    );
    expect(declaration("[data-sonner-toast][data-type='warning'] [data-icon]", 'color')).toBe(
      'var(--warning)',
    );
    expect(declaration("[data-sonner-toast][data-type='error'] [data-icon]", 'color')).toBe(
      'var(--danger)',
    );
  });
});
