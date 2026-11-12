/**
 * R3 tab sizing policy.
 *
 * The CSS owns the flexible geometry: every tab may expand to 220 px, inactive
 * tabs shrink first (down to an 80 px floor), and the active tab keeps its
 * expanded width until the inactive tabs are at the floor, then may shrink to
 * 170 px. This module owns the one threshold the JS needs: when the floor
 * widths no longer fit, the visible window shrinks and the overflow menu lists
 * every tab. Keep the constants in sync with `.nf-tab` / `.nf-tab[data-active]`
 * in `styles.css` (guard: `apps/desktop/test/tab-policy.test.ts`).
 */

export const TAB_GAP = 4;
/** Every tab may expand up to this width when space allows. */
export const TAB_MAX_WIDTH = 220;
/** Inactive tabs shrink from 220 to this floor before overflow starts. */
export const INACTIVE_TAB_FLOOR = 80;
/** The active tab shrinks to this floor only at the inactive floor. */
export const ACTIVE_TAB_FLOOR = 170;

export interface TabIdentity {
  packagePath: string;
}

/** Floor width of a visible window with `count` tabs (active + inactives). */
export function tabFloorWidth(count: number): number {
  return ACTIVE_TAB_FLOOR + Math.max(0, count - 1) * (INACTIVE_TAB_FLOOR + TAB_GAP);
}

/**
 * The tabs that fit at the floor widths, centred on the active tab and growing
 * alternately toward the end and the start. Every hidden tab stays reachable
 * through the overflow menu; the tablist never scrolls horizontally.
 */
export function visibleTabWindow<T extends TabIdentity>(
  tabs: readonly T[],
  activeTab: string | null,
  available: number,
): readonly T[] {
  if (tabs.length === 0) return tabs;
  if (!Number.isFinite(available)) return tabs;
  if (tabFloorWidth(tabs.length) <= available) return tabs;

  const activeIndex = tabs.findIndex((tab) => tab.packagePath === activeTab);
  let start = activeIndex < 0 ? 0 : activeIndex;
  let end = start;
  const fits = (nextStart: number, nextEnd: number): boolean =>
    tabFloorWidth(nextEnd - nextStart + 1) <= available;
  let preferAfter = true;
  while (true) {
    const canAfter = end + 1 < tabs.length && fits(start, end + 1);
    const canBefore = start - 1 >= 0 && fits(start - 1, end);
    if (preferAfter && canAfter) end += 1;
    else if (!preferAfter && canBefore) start -= 1;
    else if (canAfter) end += 1;
    else if (canBefore) start -= 1;
    else break;
    preferAfter = !preferAfter;
  }
  return tabs.slice(start, end + 1);
}
