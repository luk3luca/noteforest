import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACTIVE_TAB_FLOOR,
  INACTIVE_TAB_FLOOR,
  TAB_GAP,
  TAB_MAX_WIDTH,
  tabFloorWidth,
  visibleTabWindow,
} from '../src/renderer/src/lib/tab-policy';

/**
 * R3 tab width policy. The CSS owns the flexible geometry; these assertions keep
 * the declared widths and the JS overflow threshold on one contract:
 *
 * - every tab may expand to 220 px when space allows;
 * - inactive tabs shrink first, from 220 to 80;
 * - the active tab stays expanded and may shrink to 170 only at that floor;
 * - the visible window starts exactly when the floor widths no longer fit.
 */

const stylesSource = readFileSync(
  new URL('../src/renderer/src/styles.css', import.meta.url),
  'utf8',
);

function block(selector: string): string {
  const marker = `${selector} {`;
  const start = stylesSource.indexOf(marker);
  if (start < 0) throw new Error(`missing CSS block: ${marker}`);
  let depth = 0;
  const begin = start + marker.length;
  for (let index = begin - 1; index < stylesSource.length; index += 1) {
    const character = stylesSource[index];
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return stylesSource.slice(begin, index);
    }
  }
  throw new Error(`unterminated CSS block: ${marker}`);
}

function declaration(selector: string, property: string): string | undefined {
  for (const part of block(selector).split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    if (part.slice(0, colon).trim() !== property) continue;
    return part.slice(colon + 1).trim();
  }
  return undefined;
}

function tabs(count: number): { packagePath: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    packagePath: `/library/note-${index + 1}`,
  }));
}

describe('tab width policy', () => {
  it('keeps the ratified values', () => {
    expect(TAB_MAX_WIDTH).toBe(220);
    expect(INACTIVE_TAB_FLOOR).toBe(80);
    expect(ACTIVE_TAB_FLOOR).toBe(170);
    expect(TAB_GAP).toBe(4);
    expect(TAB_MAX_WIDTH).toBeGreaterThan(ACTIVE_TAB_FLOOR);
    expect(ACTIVE_TAB_FLOOR).toBeGreaterThan(INACTIVE_TAB_FLOOR);
  });

  it('declares the flex geometry once in the stylesheet', () => {
    expect(declaration('.nf-tab', 'flex')).toBe(`1 1000 ${TAB_MAX_WIDTH}px`);
    expect(declaration('.nf-tab', 'min-width')).toBe(`${INACTIVE_TAB_FLOOR}px`);
    expect(declaration('.nf-tab', 'max-width')).toBe(`${TAB_MAX_WIDTH}px`);
    expect(declaration('.nf-tab[data-active="true"]', 'flex')).toBe(
      `1 1 ${TAB_MAX_WIDTH}px`,
    );
    expect(declaration('.nf-tab[data-active="true"]', 'min-width')).toBe(
      `${ACTIVE_TAB_FLOOR}px`,
    );
    // The active tab may not grow wider than any tab.
    expect(declaration('.nf-tab[data-active="true"]', 'max-width')).toBe(
      `${TAB_MAX_WIDTH}px`,
    );
    // Inactive tabs shrink a hundred times faster: the active tab stays
    // expanded until every inactive tab is at its floor.
    const inactiveFlex = declaration('.nf-tab', 'flex') ?? '';
    const activeFlex = declaration('.nf-tab[data-active="true"]', 'flex') ?? '';
    const inactiveShrink = Number(inactiveFlex.split(/\s+/)[1]);
    const activeShrink = Number(activeFlex.split(/\s+/)[1]);
    expect(inactiveShrink).toBeGreaterThan(activeShrink * 10);
  });

  it('never shrinks the status icons or the close control', () => {
    expect(declaration('.nf-tab-missing', 'flex')).toBe('0 0 12px');
    expect(declaration('.nf-tab-lock', 'flex')).toBe('none');
    expect(declaration('.nf-tab-dot', 'flex')).toBe('0 0 5px');
    expect(declaration('.nf-tab-close', 'flex')).toBe('none');
  });

  it('starts the overflow window exactly at the floor width', () => {
    expect(tabFloorWidth(1)).toBe(ACTIVE_TAB_FLOOR);
    expect(tabFloorWidth(2)).toBe(ACTIVE_TAB_FLOOR + INACTIVE_TAB_FLOOR + TAB_GAP);
    expect(tabFloorWidth(14)).toBe(
      ACTIVE_TAB_FLOOR + 13 * (INACTIVE_TAB_FLOOR + TAB_GAP),
    );
  });

  it('keeps every tab when the floors fit', () => {
    const all = tabs(14);
    const window = visibleTabWindow(all, '/library/note-7', tabFloorWidth(14));
    expect(window).toHaveLength(14);
    expect(visibleTabWindow(all, '/library/note-7', Number.POSITIVE_INFINITY)).toHaveLength(
      14,
    );
  });

  it('windows the tabs only when the floor no longer fits', () => {
    const all = tabs(14);
    const window = visibleTabWindow(all, '/library/note-7', tabFloorWidth(14) - 1);
    expect(window.length).toBeLessThan(14);
    const first = window[0];
    const last = window.at(-1);
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    expect(window).toContainEqual(all[6]);
    const firstIndex = all.findIndex((tab) => tab.packagePath === first!.packagePath);
    const lastIndex = all.findIndex((tab) => tab.packagePath === last!.packagePath);
    expect(window).toEqual(all.slice(firstIndex, lastIndex + 1));
    expect(tabFloorWidth(window.length)).toBeLessThanOrEqual(tabFloorWidth(14) - 1);
  });

  it('always keeps the active tab in the window and respects the floor', () => {
    const all = tabs(14);
    for (let available = 180; available < tabFloorWidth(14); available += 40) {
      for (const active of ['/library/note-1', '/library/note-7', '/library/note-14']) {
        const window = visibleTabWindow(all, active, available);
        expect(window.some((tab) => tab.packagePath === active)).toBe(true);
        expect(tabFloorWidth(window.length)).toBeLessThanOrEqual(available);
        // A contiguous slice: no hidden tab between two visible ones.
        const firstIndex = all.findIndex((tab) => tab.packagePath === window[0]!.packagePath);
        expect(window).toEqual(all.slice(firstIndex, firstIndex + window.length));
      }
    }
  });
});
