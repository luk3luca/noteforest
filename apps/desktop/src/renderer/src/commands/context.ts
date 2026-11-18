/**
 * The one store reader behind the command manifest.
 *
 * Every adapter (menu, palette, key router) asks this function for the context
 * of a delivery. The manifest itself stays a pure function of this input, so no
 * store, React or Electron detail leaks into `shared/commands.ts`.
 */

import type { CommandContext } from '../../../shared/commands';
import {
  activeDocumentLayout,
  activeEditingEnabled,
  activeInteractionMode,
  activeRuntime,
} from '../actions';
import { findSurfaceActive, useShell } from '../state/shell';

export function commandContext(): CommandContext {
  const state = useShell.getState();
  const tab = state.tabs.find((item) => item.packagePath === state.activeTab);
  const runtime = activeRuntime();
  // A note needs its open runtime: a recovery or missing tab offers no document
  // command, exactly like the shipped palette gate.
  const document: CommandContext['document'] =
    runtime !== null ? 'note' : tab?.kind === 'markdown' ? 'guest' : 'none';
  return {
    document,
    layout: activeDocumentLayout(),
    mode: activeInteractionMode(),
    canAuthor: activeEditingEnabled(),
    hasSelection: runtime?.selectedBlockId !== null && runtime?.selectedBlockId !== undefined,
    findBarOpen: state.findOpen,
    findActive: findSurfaceActive(state),
    tabCount: state.tabs.length,
  };
}
