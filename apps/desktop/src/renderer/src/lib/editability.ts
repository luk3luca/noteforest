/**
 * One source of truth for whether the active document can be authored.
 *
 * ADR-0007 defines two independent axes: layout (continuous or page) and
 * interaction mode (edit or read). Page editing is not implemented, so Page is
 * always read-only for now. The predicate is pure so the shell, palette,
 * context menus, editor keymap, and unit truth table share exactly one rule.
 */

import type { DocumentLayout, InteractionMode } from '../../../shared/view-state';

/** The view-state fields that decide editability. */
export interface EditabilityView {
  layout: DocumentLayout;
  interactionMode: InteractionMode;
}

/** The runtime field that decides editability; a full DocumentRuntime fits. */
export interface EditabilityRuntime {
  editable: boolean;
}

/** Disabled control title used by sidebar add buttons. */
export const READ_MODE_TITLE = 'Read mode — switch to Edit to add content';
/** Visible suffix on palette and context-menu entries disabled by Read mode. */
export const READ_MODE_SUFFIX = ' — Read mode';
/** Short status/toast reason for a native-menu command blocked by Read mode. */
export const READ_MODE_TOAST = 'Read mode — switch to Continuous Edit to make changes.';

/**
 * True only for an active editable runtime in Continuous + Edit. A missing
 * view state falls back to the store default (Continuous + Edit). Page is
 * always false, including a corrupt/impossible Page + Edit state.
 */
export function editingEnabledFor(
  runtime: EditabilityRuntime | null,
  view: EditabilityView | undefined,
): boolean {
  if (runtime === null || !runtime.editable) return false;
  const layout = view?.layout ?? 'continuous';
  const interactionMode = view?.interactionMode ?? 'edit';
  return layout === 'continuous' && interactionMode === 'edit';
}
