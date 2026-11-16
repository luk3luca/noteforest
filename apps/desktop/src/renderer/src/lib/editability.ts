/**
 * One source of truth for whether the active document can be authored.
 *
 * ADR-0007 defines two independent axes: layout (continuous or page) and
 * interaction mode (edit or read). Page Edit exists as one active block
 * content overlay; it does not enable shell-level authoring (add block, add
 * child, sidebar add, block menus, drag/reorder, global undo). The predicates
 * are pure so the shell, palette, context menus, editor keymap, page overlay,
 * and unit truth table share exactly one rule.
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
export const READ_MODE_TITLE = 'Read mode — switch to Edit to make changes';
/** Visible suffix on palette and context-menu entries disabled by Read mode. */
export const READ_MODE_SUFFIX = ' — Read mode';
/** Short status/toast reason for a native-menu command blocked by Read mode. */
export const READ_MODE_TOAST = 'Read mode — switch to Edit to make changes.';

/**
 * True only for an active editable runtime in Continuous + Edit. A missing
 * view state falls back to the store default (Continuous + Edit). Page Edit is
 * deliberately false: shell-level commands, global undo, block menus, and
 * structural authoring stay Continuous-only in this slice.
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

/**
 * True only while the Page content overlay may edit one block. This is a
 * separate predicate from `editingEnabledFor`: enabling the overlay must not
 * enable shell, palette, sidebar, menu, drag, or global history commands.
 */
export function pageBlockEditingEnabledFor(
  runtime: EditabilityRuntime | null,
  view: EditabilityView | undefined,
): boolean {
  if (runtime === null || !runtime.editable) return false;
  const layout = view?.layout ?? 'continuous';
  const interactionMode = view?.interactionMode ?? 'read';
  return layout === 'page' && interactionMode === 'edit';
}
