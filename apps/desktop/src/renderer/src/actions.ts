/** Application actions shared by the shell, menus, palette, and editor. */

import { toast } from 'sonner';
import type { MenuCommand, OpenDocumentResult, RecoveryDocumentView } from '../../shared/api';
import type { ApplyOutcome, DocumentRuntime } from './state/runtime';
import {
  allRuntimes,
  getRuntime,
  registerRuntime,
  removeRuntime,
} from './state/registry';
import { useSettingsStore } from './state/settings';
import {
  useShell,
  type DocumentLayout,
  type InteractionMode,
  type MenuEntry,
  type PageFit,
  type TabInfo,
} from './state/shell';
import {
  anchorIsWarning,
  anchorQuote,
  anchorState,
  blockCount,
  blockTitle,
  chapterIdOf,
  countWords,
  deleteNeedsConfirmation,
  directChildIds,
  flattenBlocks,
  incomingBranch,
  incomingReferenceBranches,
  outgoingReferenceBranches,
  parentIdOf,
} from './lib/tree';
import {
  anchoredChildBranches,
  planBlockMerge,
  planBlockSplit,
  primaryParentBranch,
  subtreeBlockIds,
} from '@noteforest/core';
import type { Branch } from '@noteforest/core';
import { setEditorChapterFocus } from './editor/editor-ui';
import { chapterInsertIndex } from './lib/chapters';
import { chooseHistoryRoute, type HistoryAction } from './lib/history-routing';
import {
  imageActionLabel,
  imageAnchorAuthoringGate,
  imageAuthoringDisabledSuffix,
  imagesInContent,
  type ContentImage,
} from './lib/image';
import { beginImageAnchorAuthoring } from './lib/image-authoring';
import { insertImageFromDialog, replaceImageFromDialog } from './lib/image-insert';
import {
  editingEnabledFor,
  READ_MODE_SUFFIX,
  READ_MODE_TOAST,
} from './lib/editability';
import { commitPageEdit } from './page/page-edit-state';
import { exportActiveDocument } from './export/export-flow';
import {
  zoomCommandIsValid,
  type ZoomCommand,
} from './lib/view-zoom';

function shell() {
  return useShell.getState();
}

export function activeRuntime(): DocumentRuntime | null {
  return getRuntime(shell().activeTab);
}

/**
 * The single global editability gate. It is true only for an active editable
 * runtime in Continuous + Edit; Page and Continuous Read are both false.
 */
export function activeEditingEnabled(): boolean {
  const runtime = activeRuntime();
  return runtime !== null && editingEnabledFor(runtime, shell().viewByDoc[runtime.packagePath]);
}

/** Report a read-mode block once; returns true when the caller must stop. */
function blockedByReadMode(runtime: DocumentRuntime): boolean {
  if (editingEnabledFor(runtime, shell().viewByDoc[runtime.packagePath])) return false;
  toast.info(READ_MODE_TOAST);
  return true;
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
  if (isRecoveryResult(result)) {
    shell().openTab({
      packagePath: result.packagePath,
      title: result.title,
      recovery: {
        status: result.status,
        reason: result.reason,
        details: result.details,
        warnings: result.warnings,
      },
    });
    return true;
  }
  const runtime = registerRuntime(result, undefined, undefined);
  // A document moved/renamed on disk keeps its personal settings: re-key the
  // durable entry from the canonical id to the newly opened path (S2-2).
  useSettingsStore
    .getState()
    .adoptDocumentSettings(packagePath, result.document.id);
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

function isRecoveryResult(result: OpenDocumentResult): result is RecoveryDocumentView {
  return 'recovery' in result && result.recovery === true;
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
  if (blockedByReadMode(runtime)) return null;
  const selected = runtime.selectedBlockId;
  const selectedChapterId = selected === null ? null : chapterIdOf(runtime.document, selected);
  // Insert immediately after the active chapter; without a selection, append.
  const atIndex = chapterInsertIndex(runtime.document.chapters, selectedChapterId);
  // One queue task and one structural inverse: a single ⌘Z removes the new
  // chapter and its first block (see DocumentRuntime.createChapterWithFirstBlock).
  const created = await runtime.createChapterWithFirstBlock('New chapter', atIndex);
  if (!created.ok) {
    toast.error(created.message ?? 'Could not create a chapter.');
    return created;
  }
  const chapterId = created.chapterId;
  if (chapterId === undefined) {
    toast.error('The chapter was created without an ID.');
    return { ok: false, message: 'The chapter was created without an ID.' };
  }
  await runtime.saveNow();
  if (runtime.editor !== null) {
    setEditorChapterFocus(runtime.editor, chapterId);
  }
  return created;
}

/**
 * Delete confirmation is a document command, not a text edit: plain Backspace
 * never deletes a block, ⌘Backspace/Delete does. A block with descendants
 * always asks promote vs subtree. A leaf block asks only when incoming
 * reference edges from outside the deletion would be removed with it (S3-8);
 * a bare leaf keeps the fast path.
 */
export function requestBlockDelete(runtime: DocumentRuntime, blockId: string): void {
  if (blockedByReadMode(runtime)) return;
  if (deleteNeedsConfirmation(runtime.document, blockId)) {
    shell().openDialog({ kind: 'delete-block', blockId });
    return;
  }
  report(runtime.deleteBlock(blockId, 'promote'));
}

/** Add a top-level block to the chapter of the selected block, else the last. */
export function addTopLevelContextual(runtime: DocumentRuntime): void {
  if (blockedByReadMode(runtime)) return;
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
  if (blockedByReadMode(runtime)) return;
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
  if (!(await commitPageEdit(runtime.packagePath))) {
    toast.error('Could not commit the Page Edit block.');
    return;
  }
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
    if (!(await commitPageEdit(packagePath))) {
      toast.error('Could not commit the Page Edit block before closing the tab.');
      return;
    }
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
 * Adjust the zoom of the active layout: Continuous `zoom` or Page `pageZoom`.
 * Page never touches the hidden Continuous zoom and vice versa.
 */
export function adjustActiveLayoutZoom(delta: number): void {
  if (activeDocumentLayout() === 'page') {
    adjustActivePageZoom(delta);
    return;
  }
  adjustActiveZoom(delta);
}

/** 100% for the active layout (Page: manual zoom, no fit). */
export function resetActiveLayoutZoom(): void {
  if (activeDocumentLayout() === 'page') {
    resetActivePageZoom();
    return;
  }
  resetActiveZoom();
}

/**
 * Apply one zoom menu command to the active layout. `fit-page` only exists in
 * Page; calling it from Continuous is ignored instead of silently fitting a
 * page that is not on screen.
 */
export function fitActiveLayout(command: ZoomCommand): void {
  const layout = activeDocumentLayout();
  if (!zoomCommandIsValid(layout, command)) return;
  if (layout === 'page') {
    if (command === 'actual') resetActivePageZoom();
    else setActivePageFit(command === 'fit-page' ? 'page' : 'width');
    return;
  }
  if (command === 'actual') resetActiveZoom();
  else fitActiveWidth();
}

/* ------------------------------------------------- editor layouts and modes */

export function activeDocumentLayout(): DocumentLayout {
  const state = shell();
  return state.activeTab === null
    ? 'continuous'
    : state.viewByDoc[state.activeTab]?.layout ?? 'continuous';
}

/**
 * Switch the active document between the continuous editor and the page
 * layout. An open Page Edit overlay commits first; a rejected commit keeps both
 * the overlay and the view unchanged, so typed text is never lost.
 */
export function setActiveDocumentLayout(layout: DocumentLayout): void {
  const path = shell().activeTab;
  if (path === null) return;
  if ((shell().viewByDoc[path]?.layout ?? 'continuous') === layout) return;
  void commitPageEdit(path).then((committed) => {
    if (committed) shell().setDocumentLayout(path, layout);
  });
}

export function activeInteractionMode(): InteractionMode {
  const state = shell();
  return state.activeTab === null
    ? 'edit'
    : state.viewByDoc[state.activeTab]?.interactionMode ?? 'edit';
}

/**
 * Switch Edit/Read inside the active layout. A Page Edit overlay commits before
 * the mode changes; a rejected commit keeps the overlay open.
 */
export function setActiveInteractionMode(mode: InteractionMode): void {
  const path = shell().activeTab;
  if (path === null) return;
  const current = shell().viewByDoc[path];
  if ((current?.interactionMode ?? 'edit') === mode) return;
  void commitPageEdit(path).then((committed) => {
    if (committed) shell().setDocumentInteractionMode(path, mode);
  });
}

/** `⌘E`: Edit/Read inside Continuous or Page. */
export function toggleActiveInteractionMode(): void {
  const state = shell();
  const path = state.activeTab;
  if (path === null) return;
  const view = state.viewByDoc[path];
  const current = view?.interactionMode ?? (view?.layout === 'page' ? 'read' : 'edit');
  setActiveInteractionMode(current === 'edit' ? 'read' : 'edit');
}

export function setActivePageFit(fit: PageFit): void {
  const path = shell().activeTab;
  if (path === null) return;
  shell().setDocumentPageFit(path, fit);
}

export function adjustActivePageZoom(delta: number): void {
  const state = shell();
  const path = state.activeTab;
  if (path === null) return;
  const view = state.viewByDoc[path];
  state.setDocumentPageFit(path, 'none');
  state.setDocumentPageZoom(path, (view?.pageZoom ?? 1) + delta);
}

export function resetActivePageZoom(): void {
  const state = shell();
  const path = state.activeTab;
  if (path === null) return;
  state.setDocumentPageFit(path, 'none');
  state.setDocumentPageZoom(path, 1);
}

/**
 * Switch to the continuous editor in Edit mode and reveal one block. The page
 * layout uses this for double-click/Return and for the explicit "Open in
 * continuous editor" action; the continuous scroll is preserved for a plain
 * layout toggle, but this path intentionally reveals the chosen block.
 */
export function openBlockInContinuous(blockId: string | null): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  const path = runtime.packagePath;
  void commitPageEdit(path).then((committed) => {
    if (!committed) return;
    if (blockId !== null) runtime.selectBlock(blockId);
    shell().setDocumentLayout(path, 'continuous');
    shell().setDocumentInteractionMode(path, 'edit');
    if (blockId !== null) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          runtime.focusBlock(blockId, { scroll: true });
        });
      });
    }
  });
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
}

export function selectBlock(packagePath: string, blockId: string | null): void {
  const runtime = getRuntime(packagePath);
  if (runtime === null) return;
  runtime.selectBlock(blockId);
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
  if (blockedByReadMode(runtime)) return;
  runHistory(runtime, 'undo');
}

export function redoActive(): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  if (blockedByReadMode(runtime)) return;
  runHistory(runtime, 'redo');
}

/* ------------------------------------------------------------------ menus */

/** Entries that only navigate, select, follow, or change view state. */
function readOnlySafeMenuEntry(entry: MenuEntry): boolean {
  if (entry.separator === true) return true;
  return (
    entry.id === 'focus' ||
    entry.id === 'collapse' ||
    entry.id.startsWith('anchor-select-') ||
    entry.id.startsWith('anchor-cycle-') ||
    entry.id.startsWith('reference-open-') ||
    entry.id.startsWith('reference-back-')
  );
}

/**
 * Disable every mutating context-menu entry in Read mode and say why. The
 * whitelist is intentionally narrow: an unknown/new entry is treated as
 * mutating until it is proven navigation.
 */
function gateMenuEntries(entries: MenuEntry[], editingEnabled: boolean): MenuEntry[] {
  if (editingEnabled) return entries;
  return entries.map((entry) => {
    if (readOnlySafeMenuEntry(entry)) return entry;
    return {
      ...entry,
      label: `${entry.label}${READ_MODE_SUFFIX}`,
      disabled: true,
      onSelect: undefined,
    };
  });
}

/**
 * Make home / Move here entries for one outgoing reference. The core command
 * enforces the same preconditions; the menu disables the action and explains
 * why when the promotion is illegal (OD-7 root target, primary cycle).
 */
function referenceActionEntries(runtime: DocumentRuntime, branch: Branch): MenuEntry[] {
  if (branch.role !== 'reference') return [];
  const document = runtime.document;
  const targetTitle = blockTitle(document.blocks[branch.targetBlockId]);
  const targetIsRoot = primaryParentBranch(document, branch.targetBlockId) === undefined;
  const createsCycle = subtreeBlockIds(document, branch.targetBlockId).includes(
    branch.source.blockId,
  );
  const homeDisabled = targetIsRoot || createsCycle;
  const homeLabel = targetIsRoot
    ? 'Make home — target is already a root (use Move here)'
    : createsCycle
      ? 'Make home — would create a cycle'
      : `Make home: ${targetTitle}`;
  const moveLabel = createsCycle
    ? 'Move here — would create a cycle'
    : `Move here: ${targetTitle}`;
  return [
    {
      id: `reference-home-${branch.id}`,
      label: homeLabel,
      disabled: homeDisabled,
      ...(homeDisabled ? {} : { onSelect: () => report(runtime.makeHome(branch.id)) }),
    },
    {
      id: `reference-move-${branch.id}`,
      label: moveLabel,
      disabled: createsCycle,
      ...(createsCycle ? {} : { onSelect: () => report(runtime.moveHere(branch.id)) }),
    },
    {
      id: `reference-remove-${branch.id}`,
      label: `Remove reference to ${targetTitle}`,
      onSelect: () => report(runtime.deleteReference(branch.id)),
    },
  ];
}

/** Context menu for one reference chip (the source side of the edge). */
export function openReferenceMenu(
  branchId: string,
  anchor: { x: number; y: number },
): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  const branch = runtime.document.branches[branchId];
  if (branch === undefined) return;
  const entries: MenuEntry[] = [
    {
      id: `reference-open-${branch.id}`,
      label: `See also: ${blockTitle(runtime.document.blocks[branch.targetBlockId])}`,
      onSelect: () => runtime.focusBlock(branch.targetBlockId, { select: true }),
    },
    ...(branch.role === 'reference' ? referenceActionEntries(runtime, branch) : []),
  ];
  if (entries.length === 0) return;
  shell().openContextMenu(
    anchor.x,
    anchor.y,
    gateMenuEntries(
      entries,
      editingEnabledFor(runtime, shell().viewByDoc[runtime.packagePath]),
    ),
  );
}

/**
 * Image actions for one specific image node.
 *
 * `index`/`total` only shape the label: a block with several images prefixes
 * every entry with `Image N (alt)`, so the menu never silently acts on the
 * first image. The inline image menu passes `total = 1` because the surface
 * already belongs to that image.
 */
function imageActionEntries(
  runtime: DocumentRuntime,
  blockId: string,
  image: ContentImage,
  index: number,
  total: number,
): MenuEntry[] {
  const hasAssetRecord =
    image.assetId.length > 0 && runtime.document.assets[image.assetId] !== undefined;
  const authoringGate = imageAnchorAuthoringGate({
    editable: runtime.editable,
    assetId: image.assetId,
    hasAssetRecord,
    availability: runtime.assetAvailability,
  });
  const authoringSuffix = authoringGate.allowed
    ? ''
    : imageAuthoringDisabledSuffix(authoringGate.reason);
  const prefix = total > 1 ? `${imageActionLabel(image, index)}: ` : '';
  const idBase = `image-${image.path.join('.') || '0'}`;
  return [
    {
      id: `${idBase}-add-region`,
      label: `${prefix}Add image region…${authoringSuffix}`,
      disabled: !authoringGate.allowed,
      ...(authoringGate.allowed
        ? {
            onSelect: () =>
              beginImageAnchorAuthoring(runtime, blockId, image.path, 'region'),
          }
        : {}),
    },
    {
      id: `${idBase}-add-point`,
      label: `${prefix}Add image point…${authoringSuffix}`,
      disabled: !authoringGate.allowed,
      ...(authoringGate.allowed
        ? {
            onSelect: () =>
              beginImageAnchorAuthoring(runtime, blockId, image.path, 'point'),
          }
        : {}),
    },
    {
      id: `${idBase}-replace`,
      label: `${prefix}Replace image…`,
      disabled: !runtime.editable,
      ...(runtime.editable
        ? {
            onSelect: () =>
              void replaceImageFromDialog(runtime, blockId, image.path),
          }
        : {}),
    },
    {
      id: `${idBase}-alt`,
      label: `${prefix}Edit image alt text…`,
      onSelect: () =>
        shell().openDialog({
          kind: 'image-alt' as const,
          blockId,
          path: image.path,
          assetId: image.assetId,
          alt: image.alt,
        }),
    },
  ];
}

/**
 * Per-image context menu opened from an image node's own action button. The
 * path comes from the clicked node view, so two images in one block each act on
 * their own node.
 */
export function openImageMenu(
  blockId: string,
  path: readonly number[],
  anchor: { x: number; y: number },
): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  const block = runtime.document.blocks[blockId];
  if (block === undefined) return;
  const images = imagesInContent(block.content);
  const index = images.findIndex(
    (image) =>
      image.path.length === path.length &&
      image.path.every((value, position) => value === path[position]),
  );
  const image = images[index];
  if (image === undefined) return;
  shell().openContextMenu(
    anchor.x,
    anchor.y,
    gateMenuEntries(
      imageActionEntries(runtime, blockId, image, index, 1),
      editingEnabledFor(runtime, shell().viewByDoc[runtime.packagePath]),
    ),
  );
}

export function openBlockMenu(blockId: string, anchor: { x: number; y: number }): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  const block = runtime.document.blocks[blockId];
  if (block === undefined) return;
  const children = directChildIds(runtime.document, blockId);
  const branch = incomingBranch(runtime.document, blockId);
  const hasParent = parentIdOf(runtime.document, blockId) !== null;
  const images = imagesInContent(block.content);
  const imageEntries: MenuEntry[] = [];
  for (const [index, image] of images.entries()) {
    if (images.length > 1 && index > 0) {
      imageEntries.push({
        id: `sep-image-${image.path.join('.') || index}`,
        label: '',
        separator: true,
      });
    }
    imageEntries.push(
      ...imageActionEntries(
        runtime,
        blockId,
        image,
        index,
        images.length,
      ),
    );
  }
  const collapsed = runtime.collapsed.has(blockId);
  const caret = runtime.caretLocation();
  const splitCheck =
    caret !== null && caret.blockId === blockId
      ? planBlockSplit(runtime.document, blockId, {
          nodePath: caret.nodePath,
          offset: caret.offset,
        })
      : {
          ok: false as const,
          reason:
            caret === null
              ? 'place the caret inside this block'
              : 'the caret is in a different block',
        };
  const mergeCheck = planBlockMerge(runtime.document, blockId);
  const anchorGroups = new Map<string, { count: number; quote: string; warning: boolean }>();
  for (const anchored of anchoredChildBranches(runtime.document, blockId)) {
    const anchorId = anchored.source.anchorId;
    if (anchorId === undefined || runtime.document.blocks[anchored.targetBlockId] === undefined) {
      continue;
    }
    const group = anchorGroups.get(anchorId) ?? {
      count: 0,
      quote: anchorQuote(runtime.document, anchorId) || 'anchor',
      warning: anchorIsWarning(
        anchorState(runtime.document, anchorId, {
          assetAvailability: runtime.assetAvailability,
        }),
      ),
    };
    group.count += 1;
    anchorGroups.set(anchorId, group);
  }
  const anchorEntries: MenuEntry[] = [];
  for (const [anchorId, group] of anchorGroups) {
    const label = group.warning ? 'Select unresolved anchor' : 'Select anchor';
    anchorEntries.push({
      id: `anchor-select-${anchorId}`,
      label: `${label} “${group.quote}”`,
      onSelect: () => runtime.selectAnchor(blockId, anchorId),
    });
    if (group.count > 1) {
      anchorEntries.push({
        id: `anchor-cycle-${anchorId}`,
        label: `Next branch from “${group.quote}”`,
        onSelect: () => runtime.cycleAnchor(blockId, anchorId),
      });
    }
    anchorEntries.push({
      id: `anchor-link-reference-${anchorId}`,
      label: `Link “${group.quote}” as reference…`,
      onSelect: () => shell().openDialog({ kind: 'link-reference', blockId, anchorId }),
    });
  }

  const referenceEntries: MenuEntry[] = [];
  for (const reference of outgoingReferenceBranches(runtime.document, blockId)) {
    const targetTitle = blockTitle(runtime.document.blocks[reference.targetBlockId]);
    referenceEntries.push({
      id: `reference-open-${reference.id}`,
      label: `See also: ${targetTitle}`,
      onSelect: () => runtime.focusBlock(reference.targetBlockId, { select: true }),
    });
    referenceEntries.push(...referenceActionEntries(runtime, reference));
  }
  for (const reference of incomingReferenceBranches(runtime.document, blockId)) {
    const sourceTitle = blockTitle(runtime.document.blocks[reference.source.blockId]);
    const sourceAnchorId = reference.source.anchorId;
    const context =
      sourceAnchorId === undefined
        ? sourceTitle
        : `${sourceTitle} “${anchorQuote(runtime.document, sourceAnchorId)}”`;
    referenceEntries.push({
      id: `reference-back-${reference.id}`,
      label: `Referenced by: ${context}`,
      onSelect: () => runtime.focusBlock(reference.source.blockId, { select: true }),
    });
    referenceEntries.push({
      id: `reference-unlink-${reference.id}`,
      label: `Remove reference from ${sourceTitle}`,
      onSelect: () => report(runtime.deleteReference(reference.id)),
    });
  }

  const entries: MenuEntry[] = [
    {
      id: 'focus',
      label: 'Focus block',
      onSelect: () => runtime.focusBlock(blockId),
    },
    {
      id: 'insert-image',
      label: 'Insert image…',
      disabled: !runtime.editable,
      ...(runtime.editable
        ? { onSelect: () => void insertImageFromDialog(runtime, blockId) }
        : {}),
    },
    ...imageEntries,
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
    {
      id: 'split-at-caret',
      label: splitCheck.ok ? 'Split at caret' : `Split at caret — ${splitCheck.reason}`,
      disabled: !splitCheck.ok,
      ...(splitCheck.ok
        ? { onSelect: () => report(runtime.splitAtCaret(blockId)) }
        : {}),
    },
    {
      id: 'merge-previous',
      label: mergeCheck.ok
        ? 'Merge with previous'
        : `Merge with previous — ${mergeCheck.reason}`,
      disabled: !mergeCheck.ok,
      ...(mergeCheck.ok
        ? { onSelect: () => report(runtime.mergeBlock(blockId)) }
        : {}),
    },
    {
      id: 'link-reference',
      label: 'Link as reference…',
      shortcut: '⌘⇧L',
      onSelect: () => shell().openDialog({ kind: 'link-reference', blockId }),
    },
    ...(anchorEntries.length === 0
      ? []
      : [{ id: 'sep-anchors', label: '', separator: true }, ...anchorEntries]),
    ...(referenceEntries.length === 0
      ? []
      : [{ id: 'sep-references', label: '', separator: true }, ...referenceEntries]),
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
            id: 'demote',
            label: 'Demote to reference',
            onSelect: () => report(runtime.demoteBranch(branch.id)),
          },
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
  shell().openContextMenu(
    anchor.x,
    anchor.y,
    gateMenuEntries(
      entries,
      editingEnabledFor(runtime, shell().viewByDoc[runtime.packagePath]),
    ),
  );
}

export function openChapterMenu(
  chapterId: string,
  anchor: { x: number; y: number },
): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  shell().openContextMenu(
    anchor.x,
    anchor.y,
    gateMenuEntries(
      [
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
      ],
      editingEnabledFor(runtime, shell().viewByDoc[runtime.packagePath]),
    ),
  );
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
  const entry = shell().library?.documents.find(
    (document) => document.packagePath === packagePath,
  );
  const editable = entry === undefined || entry.status === 'ok';
  shell().openContextMenu(anchor.x, anchor.y, [
    {
      id: 'open',
      label: entry !== undefined && entry.status !== 'ok' ? 'Open recovery' : 'Open',
      onSelect: () => void openPath(packagePath),
    },
    {
      id: 'reveal',
      label: 'Reveal in Finder',
      onSelect: () => void revealDocumentPath(packagePath),
    },
    ...(editable
      ? [
          {
            id: 'rename',
            label: 'Rename document…',
            onSelect: () => {
              void openPath(packagePath).then((opened) => {
                if (opened) shell().openDialog({ kind: 'rename-document' });
              });
            },
          },
        ]
      : []),
  ]);
}

/* --------------------------------------------------------------- palette */

function applyBlockType(level: 1 | 2 | 3 | null): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  if (blockedByReadMode(runtime)) return;
  const blockId = runtime.selectedBlockId;
  if (blockId === null) return;
  runtime.setBlockType(blockId, level);
}

export function paletteCommands(): MenuEntry[] {
  const runtime = activeRuntime();
  const selected = runtime?.selectedBlockId ?? null;
  const editingEnabled = activeEditingEnabled();
  // Read mode disables the entry instead of silently ignoring the click; the
  // visible suffix is the reason and stays searchable.
  const gate = (entry: MenuEntry): MenuEntry => {
    if (runtime === null) {
      return {
        ...entry,
        disabled: true,
        reason: 'Open a document first',
        onSelect: undefined,
      };
    }
    if (editingEnabled) return entry;
    return {
      ...entry,
      disabled: true,
      reason: 'Read mode — switch to Continuous Edit to run this command',
      onSelect: undefined,
    };
  };
  const withDocument = (entry: MenuEntry): MenuEntry =>
    runtime === null
      ? {
          ...entry,
          disabled: true,
          reason: 'Open a document first',
          onSelect: undefined,
        }
      : entry;
  return [
    { id: 'new-document', label: 'New note', shortcut: '⌘N', onSelect: () => void createNewDocument() },
    gate({ id: 'new-chapter', label: 'New chapter', shortcut: '⇧⌘N', onSelect: () => void createChapter() }),
    withDocument({ id: 'save', label: 'Save', shortcut: '⌘S', onSelect: () => void saveActive() }),
    withDocument({
      id: 'export-pdf',
      label: 'Export PDF…',
      shortcut: '⇧⌘E',
      onSelect: exportActiveDocument,
    }),
    { id: 'close-tab', label: 'Close tab', shortcut: '⌘W', onSelect: () => void closeActiveTab() },
    { id: 'toggle-sidebar', label: 'Toggle sidebar', shortcut: '⌘\\', onSelect: toggleSidebar },
    withDocument({ id: 'zoom-in', label: 'Zoom in', shortcut: '⌘+', onSelect: () => adjustActiveLayoutZoom(0.1) }),
    withDocument({ id: 'zoom-out', label: 'Zoom out', shortcut: '⌘−', onSelect: () => adjustActiveLayoutZoom(-0.1) }),
    withDocument({ id: 'zoom-reset', label: 'Actual size', shortcut: '⌘0', onSelect: resetActiveLayoutZoom }),
    withDocument({ id: 'fit-width', label: 'Fit width', shortcut: '⇧⌘0', onSelect: () => fitActiveLayout('fit-width') }),
    withDocument({ id: 'continuous-layout', label: 'Switch to Continuous', shortcut: '⌘2', onSelect: () => setActiveDocumentLayout('continuous') }),
    withDocument({ id: 'page-layout', label: 'Switch to Page', shortcut: '⌘3', onSelect: () => setActiveDocumentLayout('page') }),
    withDocument({
      id: 'toggle-interaction-mode',
      label: activeInteractionMode() === 'edit' ? 'Switch to Read mode' : 'Switch to Edit mode',
      shortcut: '⌘E',
      onSelect: toggleActiveInteractionMode,
    }),
    withDocument({ id: 'focus-branch', label: 'Focus branch', shortcut: '⇧⌘F', onSelect: toggleFocusBranch }),
    withDocument({
      id: 'rename-document',
      label: 'Rename document…',
      onSelect: () => shell().openDialog({ kind: 'rename-document' }),
    }),
    withDocument({
      id: 'reveal',
      label: 'Reveal document in Finder',
      onSelect: revealActive,
    }),
    gate({
      id: 'add-block',
      label: 'Add top-level block',
      onSelect: () => {
        if (runtime === null) return;
        addTopLevelContextual(runtime);
      },
    }),
    gate({
      id: 'add-child',
      label: 'Add child block',
      shortcut: '⌃⏎',
      onSelect: () => {
        if (runtime === null || selected === null) return;
        report(runtime.addChild(selected));
      },
    }),
    gate({
      id: 'add-sibling',
      label: 'Add sibling block',
      shortcut: '⌥⏎',
      onSelect: () => {
        if (runtime === null || selected === null) return;
        report(runtime.addSibling(selected));
      },
    }),
    gate({
      id: 'link-reference',
      label: 'Link as reference…',
      shortcut: '⌘⇧L',
      onSelect: () => {
        if (selected === null) return;
        shell().openDialog({ kind: 'link-reference', blockId: selected });
      },
    }),
    withDocument({
      id: 'anchor-health',
      label: 'Anchor health…',
      onSelect: () => shell().openDialog({ kind: 'anchor-health' }),
    }),
    gate({ id: 'block-text', label: 'Block type: Text', onSelect: () => applyBlockType(null) }),
    gate({ id: 'block-h1', label: 'Block type: Heading 1', onSelect: () => applyBlockType(1) }),
    gate({ id: 'block-h2', label: 'Block type: Heading 2', onSelect: () => applyBlockType(2) }),
    gate({ id: 'block-h3', label: 'Block type: Heading 3', onSelect: () => applyBlockType(3) }),
    gate({
      id: 'undo',
      label: 'Undo',
      shortcut: '⌘Z',
      onSelect: undoActive,
    }),
    gate({
      id: 'redo',
      label: 'Redo',
      shortcut: '⇧⌘Z',
      onSelect: redoActive,
    }),
    {
      id: 'settings',
      label: 'Settings…',
      shortcut: '⌘,',
      onSelect: () => shell().openDialog({ kind: 'settings' }),
    },
    gate({
      id: 'insert-table',
      label: 'Insert table',
      onSelect: () => {
        runtime?.editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      },
    }),
    gate({
      id: 'insert-image',
      label: 'Insert image…',
      onSelect: () => {
        if (runtime === null) return;
        if (selected === null) {
          toast.error('Select a block before inserting an image.');
          return;
        }
        void insertImageFromDialog(runtime, selected);
      },
    }),
    gate({
      id: 'insert-math',
      label: 'Insert math…',
      onSelect: () => shell().openDialog({ kind: 'math', mathKind: 'inline', latex: '', pos: null }),
    }),
    gate({
      id: 'insert-code',
      label: 'Toggle code block',
      onSelect: () => runtime?.editor?.chain().focus().toggleCodeBlock().run(),
    }),
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
    case 'export-pdf':
      exportActiveDocument();
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
    case 'settings-shortcuts':
      shell().openDialog({ kind: 'settings', page: 'editor' });
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
      adjustActiveLayoutZoom(0.1);
      break;
    case 'zoom-out':
      adjustActiveLayoutZoom(-0.1);
      break;
    case 'zoom-reset':
      resetActiveLayoutZoom();
      break;
    case 'fit-width':
      fitActiveLayout('fit-width');
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
  return { words: countWords(runtime.document), blocks: blockCount(runtime.document) };
}
