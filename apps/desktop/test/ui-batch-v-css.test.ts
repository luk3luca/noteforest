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
  it('keeps one 1180 px Settings surface with a viewport-capped height and content column', () => {
    expect(declaration('.nf-settings-modal', 'width')).toBe('1180px');
    expect(declaration('.nf-settings-modal', 'max-width')).toBe('92vw');
    expect(declaration('.nf-settings-modal', 'height')).toBe(
      'min(820px, calc(100vh - 132px))',
    );
    expect(declaration('.nf-settings', 'height')).toBe('100%');
    expect(declaration('.nf-settings-pane', 'max-width')).toBe('536px');
    expect(declaration('.nf-settings-pane', 'margin')).toBe('0 auto');
    expect(stylesSource).not.toContain('.nf-settings-modal-page');
    // One shared preview rail for Page, Continuous, and Appearance.
    expect(declaration('.nf-settings-preview', 'width')).toBe(
      'clamp(320px, 34%, 400px)',
    );
    expect(declaration('.nf-settings-preview', 'border-left')).toBe(
      '1px solid var(--border-1)',
    );
    expect(css).toContain(
      '@media (max-width: 920px) { .nf-settings-modal { width: 840px; } .nf-settings-preview { display: none; }',
    );
  });

  it('lets every tab expand and shrinks inactive tabs first (R3)', () => {
    expect(declaration('.nf-tab', 'flex')).toBe('1 1000 220px');
    expect(declaration('.nf-tab', 'min-width')).toBe('80px');
    expect(declaration('.nf-tab', 'max-width')).toBe('220px');
    expect(declaration('.nf-tab[data-active="true"]', 'flex')).toBe('1 1 220px');
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

  it('keeps the shell polish: titlebar optical center and the 18 px branch port', () => {
    expect(declaration('.nf-titlebar', 'height')).toBe('30px');
    expect(declaration('.nf-titlebar', 'padding')).toBe('0 14px 0 84px');
    expect(declaration('.nf-app-name', 'line-height')).toBe('1');
    expect(declaration('.nf-app-name', 'transform')).toBe('translateY(0.5px)');
    expect(declaration('.nf-branch-port', 'min-width')).toBe('18px');
    expect(declaration('.nf-branch-port', 'height')).toBe('18px');
    expect(declaration('.nf-branch-port', 'right')).toBe('-9px');
    expect(declaration('.nf-branch-port', 'top')).toBe('-9px');
    expect(declaration('.nf-branch-port', 'border')).toBe('1px solid var(--border-2)');
    expect(declaration('.nf-branch-port', 'background')).toBe('var(--surface-2)');
    expect(declaration('.nf-branch-port', 'border-radius')).toBe('999px');
    expect(declaration('.nf-branch-port:hover', 'background')).toBe('var(--surface-3)');
    // The count is inside the same circle, not a second bubble.
    expect(declaration('.nf-branch-port[data-collapsed="true"] .nf-port-dot', 'border')).toBe(
      undefined,
    );
    expect(
      declaration('.nf-branch-port[data-collapsed="true"] .nf-port-dot', 'background'),
    ).toBe(undefined);
    expect(declaration('.nf-bubble-button', 'width')).toBe('26px');
    expect(declaration('.nf-bubble-button', 'height')).toBe('26px');
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

  it('keeps one Settings control geometry for segmented groups and selects', () => {
    expect(declaration('.nf-segmented', 'display')).toBe('inline-grid');
    expect(declaration('.nf-segmented', 'grid-auto-flow')).toBe('column');
    expect(declaration('.nf-segmented', 'grid-auto-columns')).toBe('1fr');
    expect(declaration('.nf-segmented', 'width')).toBe('320px');
    expect(declaration('.nf-segmented', 'max-width')).toBe('100%');
    expect(declaration('.nf-segmented', 'height')).toBe('28px');
    expect(declaration('.nf-segmented-item', 'min-width')).toBe('0');
    expect(declaration('.nf-segmented-item', 'padding')).toBe('0 6px');
    expect(declaration('.nf-segmented-item', 'text-align')).toBe('center');
    expect(declaration('.nf-segmented-item', 'white-space')).toBe('nowrap');
    expect(declaration('.nf-select-wrap', 'position')).toBe('relative');
    expect(declaration('.nf-select-wrap', 'width')).toBe('320px');
    expect(declaration('.nf-select', 'appearance')).toBe('none');
    expect(declaration('.nf-select', 'width')).toBe('320px');
    expect(declaration('.nf-select', 'height')).toBe('28px');
    expect(declaration('.nf-select', 'padding')).toBe('0 30px 0 8px');
    expect(declaration('.nf-select-chevron', 'right')).toBe('9px');
    expect(declaration('.nf-select-chevron', 'width')).toBe('14px');
    expect(declaration('.nf-select-chevron', 'height')).toBe('14px');
    expect(declaration('.nf-select-chevron', 'pointer-events')).toBe('none');
    expect(declaration('.nf-select-chevron', 'color')).toBe('var(--text-3)');
  });

  it('resets only the node-view wrapper first/last margins inside a card', () => {
    expect(declaration('.nf-block-prose > :first-child > :first-child', 'margin-top')).toBe('0');
    expect(declaration('.nf-block-prose > :last-child > :last-child', 'margin-bottom')).toBe('0');
    // The direct resets stay: they cover a wrapper that is itself the content.
    expect(declaration('.nf-block-prose > *:first-child', 'margin-top')).toBe('0');
    expect(declaration('.nf-block-prose > *:last-child', 'margin-bottom')).toBe('0');
  });

  it('renders the anchor quote as a squared chip, not a pill', () => {
    expect(declaration('.nf-callout-quote', 'border-radius')).toBe(
      'var(--radius-control)',
    );
    expect(declaration('.nf-callout-quote', 'border')).toBe('1px solid var(--border-1)');
    expect(declaration('.nf-callout-quote', 'background')).toBe('var(--surface-2)');
    expect(declaration('.nf-callout-quote', 'color')).toBe('var(--text-2)');
    expect(declaration('.nf-callout-quote:hover', 'border-color')).toBe('var(--border-2)');
    expect(declaration('.nf-callout-quote:hover', 'color')).toBe('var(--text-1)');
    expect(declaration('.nf-callout-quote-glyph', 'color')).toBe('var(--accent)');
    expect(
      declaration('.nf-callout-quote[data-anchor-selected="true"]', 'background'),
    ).toBe('var(--accent-soft)');
    expect(
      declaration('.nf-callout-quote[data-anchor-selected="true"]', 'box-shadow'),
    ).toBe('inset 0 0 0 1px var(--accent-strong)');
    expect(declaration('.nf-callout-quote-code', 'font-family')).toBe('var(--mono-font)');
    expect(declaration('.nf-callout-quote-formula', 'max-width')).toBe(
      'min(180px, 100%)',
    );
  });
});
