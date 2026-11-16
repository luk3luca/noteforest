import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_BAR_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_SNAP_WIDTH,
  clampSidebarContentWidth,
  sidebarContentWidth,
  sidebarPanelWidth,
} from '../src/shared/shell';
import { useShell } from '../src/renderer/src/state/shell';
import { markdownTitleSuffix } from '../src/renderer/src/lib/library-rows';

/**
 * S1 activity-bar contract.
 *
 * The live geometry (icon x stability, the 48 px collapsed card, the divider in
 * both states) is proven by the Electron UI suites; this file keeps the parts
 * that must not drift silently: the **content-width** model behind the
 * resizable panel, the `.md` title split, and the bar's CSS invariants.
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

describe('sidebar content-width model', () => {
  it('keeps the stored width as the content column and adds the 48 px bar', () => {
    expect(ACTIVITY_BAR_WIDTH).toBe(48);
    expect(sidebarPanelWidth(SIDEBAR_SNAP_WIDTH)).toBe(312);
    expect(sidebarContentWidth(312)).toBe(SIDEBAR_SNAP_WIDTH);
    expect(sidebarPanelWidth(SIDEBAR_MIN_WIDTH)).toBe(228);
    expect(sidebarPanelWidth(SIDEBAR_MAX_WIDTH)).toBe(688);
    // Round trip: a persisted 264 can never render as 216.
    for (const content of [180, 200, 264, 420, 640]) {
      expect(sidebarContentWidth(sidebarPanelWidth(content))).toBe(content);
    }
  });

  it('clamps a persisted or dragged width to the content range', () => {
    expect(clampSidebarContentWidth(120)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarContentWidth(900)).toBe(SIDEBAR_MAX_WIDTH);
    expect(clampSidebarContentWidth(Number.NaN)).toBe(SIDEBAR_SNAP_WIDTH);
    expect(clampSidebarContentWidth(263.6)).toBe(264);
  });

  it('clamps through the shell store, never through the rendered card', () => {
    const before = useShell.getState().sidebarWidth;
    useShell.getState().setSidebarWidth(SIDEBAR_SNAP_WIDTH);
    expect(useShell.getState().sidebarWidth).toBe(SIDEBAR_SNAP_WIDTH);
    useShell.getState().setSidebarWidth(40);
    expect(useShell.getState().sidebarWidth).toBe(SIDEBAR_MIN_WIDTH);
    useShell.getState().setSidebarWidth(1024);
    expect(useShell.getState().sidebarWidth).toBe(SIDEBAR_MAX_WIDTH);
    useShell.getState().setSidebarWidth(before);
  });
});

describe('library row title split', () => {
  it('splits the Markdown extension into a separate suffix', () => {
    expect(markdownTitleSuffix('diario.md')).toEqual({ base: 'diario', suffix: '.md' });
    expect(markdownTitleSuffix('a.b.markdown')).toEqual({ base: 'a.b', suffix: '.markdown' });
    expect(markdownTitleSuffix('X.MD')).toEqual({ base: 'X', suffix: '.MD' });
    expect(markdownTitleSuffix('notes')).toEqual({ base: 'notes', suffix: '' });
    expect(markdownTitleSuffix('.hidden')).toEqual({ base: '.hidden', suffix: '' });
    expect(markdownTitleSuffix('trailing.')).toEqual({ base: 'trailing.', suffix: '' });
  });
});

describe('activity bar CSS contract', () => {
  it('is a fixed 48 px leading column with 28 px buttons and 17 px icons', () => {
    expect(declaration('.nf-activity-bar', 'width')).toBe('48px');
    expect(declaration('.nf-activity-bar', 'flex')).toBe('0 0 48px');
    expect(declaration('.nf-activity-bar', 'flex-direction')).toBe('column');
    expect(declaration('.nf-activity-bar', 'gap')).toBe('8px');
    expect(declaration('.nf-activity-bar', 'padding')).toBe('8px 0');
    expect(declaration('.nf-activity-button', 'width')).toBe('28px');
    expect(declaration('.nf-activity-button', 'height')).toBe('28px');
    expect(declaration('.nf-activity-button', 'border-radius')).toBe('4px');
    expect(declaration('.nf-activity-icon', 'width')).toBe('17px');
    expect(declaration('.nf-activity-icon', 'height')).toBe('17px');
    expect(declaration('.nf-activity-sections', 'flex-direction')).toBe('column');
    expect(declaration('.nf-activity-sections', 'gap')).toBe('8px');
  });

  it('selects with surface-2 and a stroked icon, never a filled icon or accent stripe', () => {
    const selected = '.nf-activity-button[aria-selected=\'true\']';
    expect(declaration(selected, 'background')).toBe('var(--surface-2)');
    expect(declaration(selected, 'color')).toBe('var(--text-1)');
    // No accent indicator: no left rule, no inset ring on the active section.
    const selectedBody = block(selected);
    expect(selectedBody).not.toMatch(/border/);
    expect(selectedBody).not.toMatch(/box-shadow/);
    const sectionRules = [...css.matchAll(/[^{}]*nf-activity-[^{}]*\{[^{}]*\}/g)].map(
      (match) => match[0],
    );
    expect(sectionRules.length).toBeGreaterThan(0);
    for (const rule of sectionRules) {
      expect(rule, 'no left accent on the activity bar').not.toMatch(
        /border-(inline-start|left)\s*:/,
      );
      // Lucide is stroke-only: any fill paints the enclosed areas and turns
      // the glyph into a blob, so no state may set one.
      expect(rule, 'no activity icon fill in any state').not.toMatch(/\bfill\s*:/);
    }
  });

  it('keeps one Settings divider per state: bar group collapsed, footer expanded', () => {
    // Collapsed: the bar's own group above a 1 px divider. Expanded: the
    // full-width footer owns the divider and the bar's group is not rendered.
    expect(declaration('.nf-activity-foot', 'border-top')).toBe(
      '1px solid var(--border-1)',
    );
    expect(declaration('.nf-activity-foot', 'align-self')).toBe('stretch');
    expect(declaration('.nf-activity-foot', 'padding-top')).toBe('8px');
    expect(declaration('.nf-sidebar-foot', 'border-top')).toBe(
      '1px solid var(--border-1)',
    );
    // The footer row spans the card and puts the gear centre at x 24: 8 px
    // inset + 2 px start margin + 14 px half of the 28 px box.
    expect(declaration('.nf-sidebar-foot', 'padding')).toBe('6px 8px 8px');
    expect(declaration('.nf-sidebar-settings', 'flex')).toBe('1');
    expect(declaration('.nf-sidebar-settings-icon', 'width')).toBe('28px');
    expect(declaration('.nf-sidebar-settings-icon', 'height')).toBe('28px');
    expect(declaration('.nf-sidebar-settings-icon', 'margin-inline-start')).toBe('2px');
  });

  it('shows the needs-repair count as a 6 px dot, not a counter', () => {
    // S1 (docs/design/sidebar.md §8): the 13 px square counter is gone. The dot
    // is a status indicator: no text, no ring, and nothing at zero.
    expect(declaration('.nf-activity-dot', 'border-radius')).toBe('50%');
    expect(declaration('.nf-activity-dot', 'width')).toBe('6px');
    expect(declaration('.nf-activity-dot', 'height')).toBe('6px');
    expect(declaration('.nf-activity-dot', 'background')).toBe('var(--danger)');
    expect(declaration('.nf-activity-dot', 'top')).toBe('4px');
    expect(declaration('.nf-activity-dot', 'right')).toBe('4px');
    expect(declaration('.nf-activity-dot', 'position')).toBe('absolute');
    expect(declaration('.nf-activity-section', 'position')).toBe('relative');
    expect(stylesSource).not.toContain('.nf-activity-badge');
  });

  it('removes the segmented control, the header collapse button and the old rail', () => {
    for (const selector of [
      '.nf-sidebar-tabs',
      '.nf-sidebar-tab',
      '.nf-rail-head',
      '.nf-rail-foot',
      '.nf-library-file-icon',
    ]) {
      expect(stylesSource, `${selector} is gone`).not.toContain(selector);
    }
  });

  it('keeps the Library note and .md icons distinct without relying on colour', () => {
    expect(declaration('.nf-library-note-icon', 'color')).toBe('var(--text-2)');
    expect(declaration('.nf-library-markdown-icon', 'color')).toBe('var(--text-3)');
    expect(declaration('.nf-library-suffix', 'color')).toBe('var(--text-3)');
  });
});
