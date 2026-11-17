/**
 * Which surface owns the global command channel right now (UI Sentinel F1).
 *
 * Settings and the other dialogs, the command palette, and the Export sheet are
 * modal: while one is open, a global shortcut or a native-menu command must not
 * act on the shell behind it. An open Export sheet that keeps accepting tab
 * switches could export a different document under the original filename.
 *
 * The predicate reads the live stores instead of a render-time flag, so it
 * describes the event that is arriving. Context menus and the Page Edit overlay
 * are not part of this gate: they are local surfaces, not modal command owners.
 */

import { useShell } from '../state/shell';
import { useExportUi } from '../export/export-flow';

export type OverlayOwner = 'dialog' | 'palette' | 'export';

export function activeOverlayOwner(): OverlayOwner | null {
  if (useShell.getState().dialog !== null) return 'dialog';
  if (useShell.getState().paletteOpen) return 'palette';
  // Any non-idle Export state keeps the sheet on screen: configure, overwrite,
  // running, and the terminal done/failed/cancelled result all own the surface
  // until the user dismisses them.
  if (useExportUi.getState().status !== 'idle') return 'export';
  return null;
}

/** True while a modal surface owns the global command channel. */
export function overlayOwnsCommands(): boolean {
  return activeOverlayOwner() !== null;
}

/**
 * Reactive form of `overlayOwnsCommands`, for a surface that must *leave the
 * tree* while a modal is open (the selection bubble): a store subscription is
 * what re-renders that surface, because opening a dialog dispatches no editor
 * transaction for `shouldShow` to run on.
 */
export function useOverlayOwnsCommands(): boolean {
  const dialogOpen = useShell((state) => state.dialog !== null || state.paletteOpen);
  const exportOpen = useExportUi((state) => state.status !== 'idle');
  return dialogOpen || exportOpen;
}
