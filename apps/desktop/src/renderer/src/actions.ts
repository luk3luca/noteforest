/** Application actions shared by the shell, menus, palette, and editor. */

import { toast } from 'sonner';
import type { DocumentCommand } from '@noteforest/core';
import type { MenuCommand, OpenDocumentResult } from '../../shared/api';
import type { ApplyOutcome, DocumentRuntime } from './state/runtime';
import {
  allRuntimes,
  getRuntime,
  registerRuntime,
  removeRuntime,
} from './state/registry';
import {
  useShell,
  type MenuEntry,
  type TabInfo,
} from './state/shell';
import {
  chapterIdOf,
  directChildIds,
  flattenBlocks,
  incomingBranch,
  parentIdOf,
} from './lib/tree';
import { recordScroll } from './state/session';
import { setEditorChapterFocus } from './editor/editor-ui';
import { chapterInsertIndex } from './lib/chapters';
import { chooseHistoryRoute, type HistoryAction } from './lib/history-routing';

function shell() {
  return useShell.getState();
}

export function activeRuntime(): DocumentRuntime | null {
  return getRuntime(shell().activeTab);
}

export function activeTab(): TabInfo | undefined {
  const state = shell();
  return state.tabs.find((tab) => tab.packagePath === state.activeTab);
}

export function report(outcome: ApplyOutcome | Promise<ApplyOutcome | void> | void): void {
  if (outcome === undefined) return;
  if (outcome instanceof Promise) {
    void outcome.then((value) => {
      if (value !== undefined && value !== null && !value.ok) {
        toast.error(value.message ?? 'The command was rejected.');
      }
    });
    return;
  }
  if (!outcome.ok) {
    toast.error(outcome.message ?? 'The command was rejected.');
  }
}

export async function openPath(packagePath: string): Promise<boolean> {
  const existing = getRuntime(packagePath);
  if (existing !== null) {
    shell().setActiveTab(packagePath);
    return true;
  }
  const result = await window.noteforest.openDocument(packagePath);
  if (isOpenFailure(result)) {
    toast.error(result.message);
    return false;
  }
  const runtime = registerRuntime(result, undefined, undefined);
  shell().openTab({
    packagePath,
    title: result.document.title,
    ...(result.status === 'read-only' ? { readOnlyReason: result.readOnlyReason } : {}),
  });
  if (result.status === 'read-only') {
    toast.error('This document opened read-only. Your file was not modified.');
  }
  void runtime;
  return true;
}

function isOpenFailure(
  result: OpenDocumentResult,
): result is { ok: false; message: string; packagePath: string } {
  return 'ok' in result && result.ok === false;
}

export async function createNewDocument(): Promise<void> {
  const result = await window.noteforest.createDocument({ title: 'Untitled' });
  if (!result.ok) {
    toast.error(result.message);
    return;
  }
  registerRuntime(result.snapshot, undefined, undefined);
  shell().setLibrary(result.library);
  shell().openTab({
    packagePath: result.snapshot.packagePath,
    title: result.snapshot.document.title,
  });
}

export async function createChapter(): Promise<ApplyOutcome | null> {
  const runtime = activeRuntime();
  if (runtime === null) return null;
  const selected = runtime.selectedBlockId;
  const selectedChapterId = selected === null ? null : chapterIdOf(runtime.document, selected);
  // Insert immediately after the active chapter; without a selection, append.
  const atIndex = chapterInsertIndex(runtime.document.chapters, selectedChapterId);
  const created = await runtime.applyStructural({
    type: 'chapter.create',
    title: 'New chapter',
    atIndex,
  });
  if (!created.ok) {
    toast.error(created.message ?? 'Could not create a chapter.');
    return created;
  }
  const chapterId = created.chapterId;
  if (chapterId === undefined) {
    toast.error('The chapter was created without an ID.');
    return { ok: false, message: 'The chapter was created without an ID.' };
  }
  const block = await runtime.applyStructural({
    type: 'block.create',
    placement: { kind: 'top-level', chapterId },
  });
  if (!block.ok) {
    toast.error(block.message ?? 'Could not add the first block.');
  }
  await runtime.saveNow();
  if (block.ok && runtime.editor !== null) {
    setEditorChapterFocus(runtime.editor, chapterId);
  }
  return { ...block, chapterId };
}

/**
 * Delete confirmation is a document command, not a text edit: plain Backspace
 * never deletes a block, ⌘Backspace/Delete does. A block with descendants
 * always asks promote vs subtree.
 */
export function requestBlockDelete(runtime: DocumentRuntime, blockId: string): void {
  const children = directChildIds(runtime.document, blockId);
  if (children.length > 0) {
    shell().openDialog({ kind: 'delete-block', blockId });
    return;
  }
  report(runtime.deleteBlock(blockId, 'promote'));
}

/** Add a top-level block to the chapter of the selected block, else the last. */
export function addTopLevelContextual(runtime: DocumentRuntime): void {
  const selected = runtime.selectedBlockId;
  const selectedChapterId = selected === null ? null : chapterIdOf(runtime.document, selected);
  const chapterId =
    selectedChapterId ?? runtime.document.chapters.at(-1)?.id ?? null;
  if (chapterId === null) return;
  report(
    runtime.addTopLevel(chapterId).then((outcome) => {
      if (outcome.ok && outcome.blockId !== undefined) {
        runtime.focusBlock(outcome.blockId);
      }
      return outcome;
    }),
  );
}

export async function renameDocument(title: string): Promise<void> {
  const runtime = activeRuntime();
  if (runtime === null) return;
  const clean = title.trim();
  if (clean.length === 0 || clean === runtime.document.title) return;
  const outcome = await runtime.applyStructural({ type: 'document.rename', title: clean });
  if (!outcome.ok) {
    toast.error(outcome.message ?? 'Could not rename the document.');
    return;
  }
  shell().updateTitle(runtime.packagePath, clean);
  await runtime.saveNow();
  const library = await window.noteforest.scanLibrary();
  shell().setLibrary(library);
}

export async function renameChapter(chapterId: string, title: string): Promise<void> {
  const runtime = activeRuntime();
  if (runtime === null) return;
  const clean = title.trim();
  report(
    await runtime.applyStructural({
      type: 'chapter.rename',
      chapterId,
      title: clean.length === 0 ? null : clean,
    }),
  );
}

export async function saveActive(): Promise<void> {
  const runtime = activeRuntime();
  if (runtime === null) return;
  await runtime.saveNow();
  if (runtime.saveState === 'error') {
    toast.error(runtime.saveError ?? 'Save failed.');
  }
}

export async function closeTab(
  packagePath: string,
  options: { force?: boolean; save?: boolean } = {},
): Promise<void> {
  const runtime = getRuntime(packagePath);
  const tab = shell().tabs.find((item) => item.packagePath === packagePath);
  if (
    runtime !== null &&
    runtime.dirty &&
    runtime.saveState !== 'saved' &&
    options.force !== true
  ) {
    shell().openDialog({ kind: 'close-tab', packagePath });
    return;
  }
  if (runtime !== null) {
    if (options.save !== false) {
      await runtime.flush();
      if (runtime.saveState === 'error') {
        toast.error(runtime.saveError ?? 'Could not save before closing the tab.');
        return;
      }
    }
    await window.noteforest.closeDocument(packagePath, { save: false });
    removeRuntime(packagePath);
  }
  if (tab !== undefined) shell().pushClosed(tab);
  shell().closeTab(packagePath);
}

export async function closeActiveTab(): Promise<void> {
  const current = shell().activeTab;
  if (current !== null) await closeTab(current);
}

export async function reopenClosedTab(): Promise<void> {
  const tab = shell().popClosed();
  if (tab === undefined) {
    toast.info('No recently closed tab.');
    return;
  }
  const opened = await openPath(tab.packagePath);
  if (!opened) {
    toast.error('That document is no longer available.');
  }
}

export function toggleSidebar(): void {
  shell().setSidebarCollapsed(!shell().sidebarCollapsed);
}

/* ------------------------------------------------------------------- view */

export function setActiveZoom(zoom: number): void {
  const current = shell().activeTab;
  if (current === null) return;
  shell().setDocumentZoom(current, zoom);
}

export function adjustActiveZoom(delta: number): void {
  const current = shell().activeTab;
  if (current === null) return;
  const view = shell().viewByDoc[current];
  setActiveZoom((view?.zoom ?? 1) + delta);
}

export function resetActiveZoom(): void {
  setActiveZoom(1);
}

/** Ask the active editor to compute a Fit-width zoom from its visible cards. */
export function fitActiveWidth(): void {
  if (shell().activeTab === null) return;
  window.dispatchEvent(new CustomEvent('nf:fit-width'));
}

/**
 * Toggle Focus branch around the selected block. This is navigation state
 * only: the document, the editor buffer, and the saved file are untouched.
 */
export function toggleFocusBranch(): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  const path = runtime.packagePath;
  const current = shell().viewByDoc[path]?.focusBlockId ?? null;
  if (current !== null) {
    shell().setDocumentFocus(path, null);
    return;
  }
  const target = runtime.selectedBlockId ?? flattenBlocks(runtime.document)[0] ?? null;
  if (target === null) return;
  shell().setDocumentFocus(path, target);
  runtime.focusBlock(target);
}

export function revealActive(): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  void revealDocumentPath(runtime.packagePath);
}

export async function revealDocumentPath(packagePath: string): Promise<void> {
  const result = await window.noteforest.revealDocument(packagePath);
  if (!result.ok) toast.error(result.message ?? 'Could not reveal the document.');
}

export function focusBlock(packagePath: string, blockId: string): void {
  const runtime = getRuntime(packagePath);
  if (runtime === null) return;
  shell().setActiveTab(packagePath);
  runtime.focusBlock(blockId);
  runtime.selectBlock(blockId);
  shell().setSelectedBlock(packagePath, blockId);
}

export function selectBlock(packagePath: string, blockId: string | null): void {
  const runtime = getRuntime(packagePath);
  if (runtime === null) return;
  runtime.selectBlock(blockId);
  shell().setSelectedBlock(packagePath, blockId);
}

/** Apply one text-history step and record that the user operation was text. */
function applyTextHistory(
  runtime: DocumentRuntime,
  action: HistoryAction,
): boolean {
  const editor = runtime.editor;
  if (editor === null) return false;
  const applied = action === 'undo' ? editor.commands.undo() : editor.commands.redo();
  if (applied) runtime.markTextHistory();
  return applied;
}

/**
 * One user-visible undo/redo command. The preferred stack is chosen from the
 * last operation; an empty preferred stack falls back once to the other stack.
 * The command never retries after a stack was chosen, so a single keypress can
 * never perform two undos.
 */
function runHistory(runtime: DocumentRuntime, action: HistoryAction): void {
  const route = chooseHistoryRoute({
    action,
    lastOperation: runtime.lastHistoryOperation,
    textAvailable: action === 'undo' ? runtime.canUndoText : runtime.canRedoText,
    structuralAvailable:
      action === 'undo' ? runtime.canUndoStructural : runtime.canRedoStructural,
    editorFocused: runtime.editor?.isFocused === true,
  });
  if (route.kind === 'text') {
    applyTextHistory(runtime, action);
    return;
  }
  if (route.kind === 'structural') {
    const outcome =
      action === 'undo' ? runtime.undoStructural() : runtime.redoStructural();
    void outcome.then(report);
  }
}

export function undoActive(): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  runHistory(runtime, 'undo');
}

export function redoActive(): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  runHistory(runtime, 'redo');
}

/* ------------------------------------------------------------------ menus */

export function openBlockMenu(blockId: string, anchor: { x: number; y: number }): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  const block = runtime.document.blocks[blockId];
  if (block === undefined) return;
  const children = directChildIds(runtime.document, blockId);
  const branch = incomingBranch(runtime.document, blockId);
  const hasParent = parentIdOf(runtime.document, blockId) !== null;
  const collapsed = runtime.collapsed.has(blockId);
  const entries: MenuEntry[] = [
    {
      id: 'focus',
      label: 'Focus block',
      onSelect: () => runtime.focusBlock(blockId),
    },
    {
      id: 'add-child',
      label: 'Add child block',
      shortcut: '⌃⏎',
      onSelect: () => report(runtime.addChild(blockId)),
    },
    {
      id: 'add-sibling',
      label: 'Add sibling block',
      shortcut: '⌥⏎',
      onSelect: () => report(runtime.addSibling(blockId)),
    },
    { id: 'sep-1', label: '', separator: true },
    {
      id: 'move',
      label: 'Move to…',
      onSelect: () => shell().openDialog({ kind: 'move', blockId }),
    },
    {
      id: 'move-up',
      label: 'Move up',
      shortcut: '⌥↑',
      onSelect: () => report(runtime.reorderSibling(blockId, -1)),
    },
    {
      id: 'move-down',
      label: 'Move down',
      shortcut: '⌥↓',
      onSelect: () => report(runtime.reorderSibling(blockId, 1)),
    },
    ...(hasParent
      ? [
          {
            id: 'outdent',
            label: 'Outdent',
            shortcut: '⇧Tab',
            onSelect: () => report(runtime.outdent(blockId)),
          },
        ]
      : []),
    ...(children.length > 0
      ? [
          {
            id: 'collapse',
            label: collapsed ? 'Expand branch' : 'Collapse branch',
            shortcut: '⌘.',
            onSelect: () => report(runtime.toggleCollapse(blockId)),
          },
        ]
      : []),
    { id: 'sep-2', label: '', separator: true },
    ...(branch === undefined
      ? []
      : [
          {
            id: 'detach',
            label: 'Detach from parent',
            onSelect: () => report(runtime.deleteBranch(blockId)),
          },
        ]),
    {
      id: 'delete',
      label: 'Delete block…',
      danger: true,
      onSelect: () => shell().openDialog({ kind: 'delete-block', blockId }),
    },
  ];
  shell().openContextMenu(anchor.x, anchor.y, entries);
}

export function openChapterMenu(
  chapterId: string,
  anchor: { x: number; y: number },
): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  shell().openContextMenu(anchor.x, anchor.y, [
    {
      id: 'rename-chapter',
      label: 'Rename chapter…',
      onSelect: () => shell().openDialog({ kind: 'rename-chapter', chapterId }),
    },
    {
      id: 'add-block',
      label: 'Add block',
      onSelect: () => report(runtime.addTopLevel(chapterId)),
    },
  ]);
}

export function openTabMenu(
  packagePath: string,
  anchor: { x: number; y: number },
): void {
  const tab = shell().tabs.find((item) => item.packagePath === packagePath);
  if (tab === undefined) return;
  shell().openContextMenu(anchor.x, anchor.y, [
    {
      id: 'activate',
      label: 'Open',
      onSelect: () => shell().setActiveTab(packagePath),
    },
    {
      id: 'rename',
      label: 'Rename document…',
      onSelect: () => {
        shell().setActiveTab(packagePath);
        shell().openDialog({ kind: 'rename-document' });
      },
    },
    {
      id: 'reveal',
      label: 'Reveal in Finder',
      onSelect: () => void revealDocumentPath(packagePath),
    },
    { id: 'sep', label: '', separator: true },
    {
      id: 'close',
      label: 'Close tab',
      shortcut: '⌘W',
      onSelect: () => void closeTab(packagePath),
    },
  ]);
}

export function openLibraryMenu(
  packagePath: string,
  anchor: { x: number; y: number },
): void {
  shell().openContextMenu(anchor.x, anchor.y, [
    {
      id: 'open',
      label: 'Open',
      onSelect: () => void openPath(packagePath),
    },
    {
      id: 'reveal',
      label: 'Reveal in Finder',
      onSelect: () => void revealDocumentPath(packagePath),
    },
    {
      id: 'rename',
      label: 'Rename document…',
      onSelect: () => {
        void openPath(packagePath).then((opened) => {
          if (opened) shell().openDialog({ kind: 'rename-document' });
        });
      },
    },
  ]);
}

/* --------------------------------------------------------------- palette */

function applyBlockType(level: 1 | 2 | 3 | null): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  const blockId = runtime.selectedBlockId;
  if (blockId === null) return;
  runtime.setBlockType(blockId, level);
}

export function paletteCommands(): MenuEntry[] {
  const runtime = activeRuntime();
  const selected = runtime?.selectedBlockId ?? null;
  return [
    { id: 'new-document', label: 'New document', shortcut: '⌘N', onSelect: () => void createNewDocument() },
    { id: 'new-chapter', label: 'New chapter', shortcut: '⇧⌘N', onSelect: () => void createChapter() },
    { id: 'save', label: 'Save now', shortcut: '⌘S', onSelect: () => void saveActive() },
    { id: 'close-tab', label: 'Close tab', shortcut: '⌘W', onSelect: () => void closeActiveTab() },
    { id: 'toggle-sidebar', label: 'Toggle sidebar', shortcut: '⌘\\', onSelect: toggleSidebar },
    { id: 'zoom-in', label: 'Zoom in', shortcut: '⌘+', onSelect: () => adjustActiveZoom(0.1) },
    { id: 'zoom-out', label: 'Zoom out', shortcut: '⌘−', onSelect: () => adjustActiveZoom(-0.1) },
    { id: 'zoom-reset', label: 'Actual size', shortcut: '⌘0', onSelect: resetActiveZoom },
    { id: 'fit-width', label: 'Fit width', shortcut: '⇧⌘0', onSelect: fitActiveWidth },
    { id: 'focus-branch', label: 'Focus branch', shortcut: '⇧⌘F', onSelect: toggleFocusBranch },
    {
      id: 'rename-document',
      label: 'Rename document…',
      onSelect: () => shell().openDialog({ kind: 'rename-document' }),
    },
    {
      id: 'reveal',
      label: 'Reveal document in Finder',
      onSelect: revealActive,
    },
    {
      id: 'add-block',
      label: 'Add top-level block',
      onSelect: () => {
        if (runtime === null) return;
        addTopLevelContextual(runtime);
      },
    },
    {
      id: 'add-child',
      label: 'Add child block',
      shortcut: '⌃⏎',
      onSelect: () => {
        if (runtime === null || selected === null) return;
        report(runtime.addChild(selected));
      },
    },
    {
      id: 'add-sibling',
      label: 'Add sibling block',
      shortcut: '⌥⏎',
      onSelect: () => {
        if (runtime === null || selected === null) return;
        report(runtime.addSibling(selected));
      },
    },
    { id: 'block-text', label: 'Block type: Text', onSelect: () => applyBlockType(null) },
    { id: 'block-h1', label: 'Block type: Heading 1', onSelect: () => applyBlockType(1) },
    { id: 'block-h2', label: 'Block type: Heading 2', onSelect: () => applyBlockType(2) },
    { id: 'block-h3', label: 'Block type: Heading 3', onSelect: () => applyBlockType(3) },
    {
      id: 'undo',
      label: 'Undo',
      shortcut: '⌘Z',
      onSelect: undoActive,
    },
    {
      id: 'redo',
      label: 'Redo',
      shortcut: '⇧⌘Z',
      onSelect: redoActive,
    },
    { id: 'settings', label: 'Settings…', shortcut: '⌘,', onSelect: () => shell().openDialog({ kind: 'settings' }) },
    {
      id: 'insert-table',
      label: 'Insert table',
      onSelect: () => {
        runtime?.editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      },
    },
    {
      id: 'insert-math',
      label: 'Insert math…',
      onSelect: () => shell().openDialog({ kind: 'math', mathKind: 'inline', latex: '', pos: null }),
    },
    {
      id: 'insert-code',
      label: 'Toggle code block',
      onSelect: () => runtime?.editor?.chain().focus().toggleCodeBlock().run(),
    },
  ];
}

export function runMenuCommand(command: MenuCommand): void {
  switch (command) {
    case 'new-document':
      void createNewDocument();
      break;
    case 'open-document':
      shell().setPaletteOpen(true, { documentsOnly: true });
      break;
    case 'save':
      void saveActive();
      break;
    case 'close-tab':
      void closeActiveTab();
      break;
    case 'reopen-tab':
      void reopenClosedTab();
      break;
    case 'toggle-sidebar':
      toggleSidebar();
      break;
    case 'command-palette':
      shell().setPaletteOpen(!shell().paletteOpen);
      break;
    case 'settings':
      shell().openDialog({ kind: 'settings' });
      break;
    case 'new-chapter':
      void createChapter();
      break;
    case 'add-block': {
      const runtime = activeRuntime();
      if (runtime !== null) addTopLevelContextual(runtime);
      break;
    }
    case 'undo':
      undoActive();
      break;
    case 'redo':
      redoActive();
      break;
    case 'zoom-in':
      adjustActiveZoom(0.1);
      break;
    case 'zoom-out':
      adjustActiveZoom(-0.1);
      break;
    case 'zoom-reset':
      resetActiveZoom();
      break;
    case 'fit-width':
      fitActiveWidth();
      break;
    case 'focus-branch':
      toggleFocusBranch();
      break;
    case 'flush':
      for (const runtime of allRuntimes()) void runtime.flush();
      break;
    case 'close-window':
      window.close();
      break;
    default:
      break;
  }
}

export function currentWordCount(): { words: number; blocks: number } {
  const runtime = activeRuntime();
  if (runtime === null) return { words: 0, blocks: 0 };
  let words = 0;
  for (const block of Object.values(runtime.document.blocks)) {
    const text = collect(block.content);
    if (text.length === 0) continue;
    words += text.split(/\s+/).filter((part) => part.length > 0).length;
  }
  return { words, blocks: Object.keys(runtime.document.blocks).length };
}

function collect(node: { children?: unknown[]; text?: unknown }): string {
  const parts: string[] = [];
  if (typeof node.text === 'string') parts.push(node.text);
  for (const child of node.children ?? []) {
    if (typeof child === 'object' && child !== null) parts.push(collect(child as { children?: unknown[]; text?: unknown }));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function recordActiveScroll(top: number): void {
  const current = shell().activeTab;
  if (current !== null) recordScroll(current, top);
}

export function applyDocumentCommand(command: DocumentCommand): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  report(runtime.applyStructural(command));
}
