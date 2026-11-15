/**
 * Return focus to the Health list after its repair modal closes (S2).
 *
 * The modal is dismissed after a mutation, so React Aria's automatic focus
 * restore would land on a button that no longer exists. The dialog names the
 * row that should own focus instead: the next issue after a repair, or the same
 * row after a plain close. When the sidebar is not showing Health there is
 * nothing to focus and the previous behaviour stands.
 */

import { useShell } from '../state/shell';

export function focusHealthRow(rowId: string | null): void {
  requestAnimationFrame(() => {
    const state = useShell.getState();
    if (state.sidebarCollapsed || state.sidebarTab !== 'health') return;
    const target =
      rowId === null
        ? null
        : document.querySelector<HTMLElement>(
            `[data-health-row-button="true"][data-health-key="${CSS.escape(rowId)}"]`,
          );
    const fallback = document.querySelector<HTMLElement>(
      '[data-health-section-toggle="true"]',
    );
    (target ?? fallback)?.focus();
  });
}
