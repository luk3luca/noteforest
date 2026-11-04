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
  directChildIds,
  incomingBranch,
  parentIdOf,
} from './lib/tree';
import { recordScroll } from './state/session';

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
  const created = await runtime.applyStructural({
    type: 'chapter.create',
    title: 'New chapter',
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
  if (!block.ok) toast.error(block.message ?? 'Could not add the first block.');
  await runtime.saveNow();
  return block;
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

export function revealActive(): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  void window.noteforest.revealDocument(runtime.packagePath);
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

export function undoActive(): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  if (runtime.lastStructuralAt > runtime.lastTextAt && runtime.canUndoStructural) {
    void runtime.undoStructural().then(report);
    return;
  }
  if (runtime.editor !== null) {
    runtime.editor.commands.undo();
    return;
  }
  document.execCommand('undo');
}

export function redoActive(): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  if (runtime.lastStructuralAt > runtime.lastTextAt && runtime.canRedoStructural) {
    void runtime.redoStructural().then(report);
    return;
  }
  if (runtime.editor !== null) {
    runtime.editor.commands.redo();
    return;
  }
  document.execCommand('redo');
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
      onSelect: () => void window.noteforest.revealDocument(packagePath),
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
      onSelect: () => void window.noteforest.revealDocument(packagePath),
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
        const chapterId = runtime.document.chapters.at(-1)?.id;
        if (chapterId !== undefined) report(runtime.addTopLevel(chapterId));
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
      const chapterId = runtime?.document.chapters.at(-1)?.id;
      if (runtime !== null && chapterId !== undefined) report(runtime.addTopLevel(chapterId));
      break;
    }
    case 'undo':
      undoActive();
      break;
    case 'redo':
      redoActive();
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
