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
import { COMMAND_REASONS } from '../../../shared/commands';

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
/**
 * The one Read-mode refusal sentence (D2). The palette row, the key and the
 * menu toast all read it from the command manifest.
 */
export const READ_MODE_TOAST = COMMAND_REASONS.READ_MODE;

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

/**
 * True when the **per-document page settings** may be authored: either layout
 * in Edit, on a writable document (`docs/design/manual-breaks.md` §4).
 *
 * Page settings are not document content (ADR-0008): a manual break, a margin,
 * or a density is a personal lens over the note, so Page Edit can change them
 * even though shell-level block authoring stays Continuous-only. Read still
 * disables every one of them, and a read-only/locked document is writable by
 * nobody.
 */
export function pageSettingsAuthoringEnabled(
  runtime: EditabilityRuntime | null,
  view: EditabilityView | undefined,
): boolean {
  if (runtime === null || !runtime.editable) return false;
  return (view?.interactionMode ?? 'edit') === 'edit';
}
