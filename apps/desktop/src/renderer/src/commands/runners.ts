/**
 * The renderer runner map: one behavior per application command.
 *
 * The map is exhaustive over `AppCommandId`, so a new manifest record fails the
 * build until it has a behavior. It holds no availability logic and no reason
 * copy: the dispatcher decides, this map runs the shipped action.
 */

import type { AppCommandId } from '../../../shared/commands';
import {
  activeRuntime,
  addTopLevelContextual,
  adjustActiveLayoutZoom,
  closeActiveTab,
  closeFind,
  createChapter,
  createNewDocument,
  findNext,
  findPrevious,
  fitActiveLayout,
  goToContinuous,
  openDocumentHealth,
  openFind,
  openMarkdownDialog,
  redoActive,
  reopenClosedTab,
  resetActiveLayoutZoom,
  revealActive,
  saveActive,
  setActiveDocumentLayout,
  stepActivePage,
  toggleActiveInteractionMode,
  toggleFocusBranch,
  toggleSidebar,
  undoActive,
} from '../actions';
import { exportActiveDocument } from '../export/export-flow';
import { allRuntimes } from '../state/registry';
import { useShell } from '../state/shell';

function shell() {
  return useShell.getState();
}

/** Move to the previous/next open tab; a no-op with fewer than two tabs. */
function cycleActiveTab(direction: -1 | 1): void {
  const state = shell();
  const index = state.tabs.findIndex((tab) => tab.packagePath === state.activeTab);
  if (index < 0 || state.tabs.length < 2) return;
  const next = state.tabs[(index + direction + state.tabs.length) % state.tabs.length];
  if (next !== undefined) state.setActiveTab(next.packagePath);
}

export const RUNNERS: Record<AppCommandId, () => void> = {
  'new-document': () => void createNewDocument(),
  'open-document': () => shell().setPaletteOpen(true, { documentsOnly: true }),
  'open-markdown': () => void openMarkdownDialog(),
  save: () => void saveActive(),
  'close-tab': () => void closeActiveTab(),
  'close-window': () => window.close(),
  'reopen-tab': () => void reopenClosedTab(),
  'new-chapter': () => void createChapter(),
  'add-block': () => {
    const runtime = activeRuntime();
    if (runtime !== null) addTopLevelContextual(runtime);
  },
  'export-pdf': () => exportActiveDocument(),
  'rename-document': () => shell().openDialog({ kind: 'rename-document' }),
  reveal: () => revealActive(),
  undo: () => undoActive(),
  redo: () => redoActive(),
  'find-open': () => openFind(),
  'find-next': () => findNext(),
  'find-previous': () => findPrevious(),
  'link-reference': () => {
    const blockId = activeRuntime()?.selectedBlockId ?? null;
    if (blockId !== null) shell().openDialog({ kind: 'link-reference', blockId });
  },
  'command-palette': () => shell().setPaletteOpen(!shell().paletteOpen),
  'toggle-sidebar': () => toggleSidebar(),
  'zoom-in': () => adjustActiveLayoutZoom(0.1),
  'zoom-out': () => adjustActiveLayoutZoom(-0.1),
  'zoom-reset': () => resetActiveLayoutZoom(),
  'fit-width': () => fitActiveLayout('fit-width'),
  'fit-page': () => fitActiveLayout('fit-page'),
  'focus-branch': () => toggleFocusBranch(),
  'continuous-layout': () => goToContinuous(),
  'page-layout': () => setActiveDocumentLayout('page'),
  'toggle-interaction-mode': () => toggleActiveInteractionMode(),
  'anchor-health': () => openDocumentHealth(),
  'tab-next': () => cycleActiveTab(1),
  'tab-previous': () => cycleActiveTab(-1),
  'tab-next-bracket': () => cycleActiveTab(1),
  'tab-previous-bracket': () => cycleActiveTab(-1),
  'close-find': () => closeFind(),
  'page-previous': () => stepActivePage(-1),
  'page-next': () => stepActivePage(1),
  settings: () => shell().openDialog({ kind: 'settings' }),
  'settings-shortcuts': () => shell().openDialog({ kind: 'settings', page: 'editor' }),
  flush: () => {
    for (const runtime of allRuntimes()) void runtime.flush();
  },
};
