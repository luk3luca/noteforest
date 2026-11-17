/** Application actions shared by the shell, menus, palette, and editor. */

import { toast } from 'sonner';
import { errorToast } from './lib/toast-details';
import type {
  LibraryActionSuccess,
  MarkdownFileView,
  MenuCommand,
  OpenDocumentResult,
  RecoveryDocumentView,
  TrashPreflight,
} from '../../shared/api';
import { isMarkdownPath } from '../../shared/markdown';
import { markdownEntry, useMarkdownFiles } from './state/markdown';
import { markdownHistory } from './markdown/markdown-editor-registry';
import {
  cancelMarkdownAutosave,
  saveMarkdownNow,
} from './markdown/markdown-save';
import type { ApplyOutcome, DocumentRuntime } from './state/runtime';
import {
  allRuntimes,
  getRuntime,
  registerRuntime,
  removeRuntime,
} from './state/registry';
import {
  flushPendingSettingsEdits,
  flushSettingsWrites,
  pageOverrideFor,
  useSettingsStore,
} from './state/settings';
import { isPathInside } from './lib/paths';
import {
  useShell,
  findSurfaceActive,
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
} from './lib/tree';
import {
  anchoredChildBranches,
  planBlockMerge,
  planBlockSplit,
  primaryParentBranch,
  subtreeBlockIds,
} from '@noteforest/core';
import type { Branch, Document } from '@noteforest/core';
import { setEditorChapterFocus } from './editor/editor-ui';
import { chapterInsertIndex } from './lib/chapters';
import { chooseHistoryRoute, type HistoryAction } from './lib/history-routing';
import { clampPageNumber } from './page/model';
import { pageStatusFor, stepPageZoom } from './page/page-status';
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
  pageSettingsAuthoringEnabled,
  READ_MODE_SUFFIX,
  READ_MODE_TITLE,
  READ_MODE_TOAST,
} from './lib/editability';
import { commitPageEdit } from './page/page-edit-state';
import { printPageModelSnapshot } from './page/print-model-registry';
import {
  continuousRowLeaderIds,
  manualBreakMenuState,
  MANUAL_BREAK_LABEL,
  pageRowLeaderIds,
  withManualBreakIds,
} from './lib/manual-breaks';
import { extractBlockBodies } from './state/editor-projection';
import { withBody } from './lib/adapter';
import type { FindResult } from './lib/find';
import { exportActiveDocument } from './export/export-flow';
import { isDraftKey } from '../../shared/drafts';
import { indentTarget, outdentTarget } from './lib/indent';
import { reorderTarget } from './lib/reorder';
import { shortcutHint } from './lib/shortcuts';
import { documentHealthReport } from './shell/useDocumentHealth';
import {
  documentHealthSection,
  firstRepairHealthRowId,
  type DocumentHealthSectionId,
} from './lib/document-health-sections';
import {
  captureTextTarget,
  classifyEditorContextTarget,
  ensureCellSelection,
  tableMenuEntries,
  textMenuEntries,
} from './lib/editor-context-menu';
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

/**
 * The one entry point for every Document health affordance (S2).
 *
 * Health is a sidebar section, not a sheet: the status chip, the palette and the
 * block lost-anchor chip all land there. When the caller knows an issue (a
 * specific anchor, or the status chip's first repair row) the row is selected
 * and its 520 px repair modal opens; otherwise the section is revealed with
 * `Anchors to fix` expanded. Read mode is not gated here: the list is a
 * read-only audit and the modal disables its mutations.
 */
export function openDocumentHealth(
  options: {
    anchorId?: string;
    section?: DocumentHealthSectionId;
    openFirstRepair?: boolean;
  } = {},
): void {
  const state = shell();
  state.setSidebarTab('health');
  state.setSidebarCollapsed(false);
  const runtime = activeRuntime();
  if (runtime === null) {
    if (options.section !== undefined) state.setHealthSectionOpen(options.section, true);
    else state.setHealthSectionOpen('anchors', true);
    return;
  }
  const report = documentHealthReport(runtime);
  let rowId: string | null = null;
  if (options.anchorId !== undefined) {
    rowId = `anchor:${options.anchorId}`;
    if (!report.rows.some((row) => row.id === rowId)) rowId = null;
  } else if (options.openFirstRepair === true) {
    rowId = firstRepairHealthRowId(report.rows);
  }
  if (options.section !== undefined) state.setHealthSectionOpen(options.section, true);
  if (rowId !== null) {
    const row = report.rows.find((candidate) => candidate.id === rowId);
    if (row !== undefined) state.setHealthSectionOpen(documentHealthSection(row.category).id, true);
    state.setHealthSelectedRowId(rowId);
    state.openDialog({ kind: 'health-issue', rowId });
    return;
  }
  if (options.section === undefined) state.setHealthSectionOpen('anchors', true);
}

export function activeTab(): TabInfo | undefined {
  const state = shell();
  return state.tabs.find((tab) => tab.packagePath === state.activeTab);
}

export function report(outcome: ApplyOutcome | Promise<ApplyOutcome | void> | void): void {
  if (outcome === undefined) return;
  if (outcome instanceof Promise) {
    void outcome.then((value) => {
      if (value === undefined || value === null) return;
      if (!value.ok) {
        errorToast(value.message ?? 'That command isn’t available right now.', value.details);
        return;
      }
      if (value.notice !== undefined) toast.info(value.notice);
    });
    return;
  }
  if (!outcome.ok) {
    errorToast(outcome.message ?? 'That command isn’t available right now.', outcome.details);
    return;
  }
  if (outcome.notice !== undefined) toast.info(outcome.notice);
}

export async function openPath(packagePath: string): Promise<boolean> {
  if (isMarkdownPath(packagePath)) return openMarkdownPath(packagePath);
  const existing = getRuntime(packagePath);
  if (existing !== null) {
    await syncActiveLibraryForPath(packagePath);
    shell().setActiveTab(packagePath);
    return true;
  }
  const result = await window.noteforest.openDocument(packagePath);
  if (isOpenFailure(result)) {
    errorToast(result.message, result.details);
    return false;
  }
  await syncActiveLibraryForPath(packagePath);
  if (isRecoveryResult(result)) {
    shell().openTab({
      packagePath: result.packagePath,
      tabKey: result.packagePath,
      title: result.title,
      recovery: {
        status: result.status,
        reason: result.reason,
        ...(result.reasonDetails === undefined
          ? {}
          : { reasonDetails: result.reasonDetails }),
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
    // A copy keeps the document id, so the path keeps the editor key unique
    // for two open copies (F3). A draft keys by the document id so its
    // materialization never remounts the editor.
    tabKey: `${result.document.id}:${packagePath}`,
    title: result.document.title,
    ...(result.status === 'read-only' ? { readOnlyReason: result.readOnlyReason } : {}),
  });
  if (result.status === 'read-only') {
    toast.error('This note opened read-only. Your file was not changed.');
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

/* ------------------------------------------------------ Markdown guest files */

/** True when the active tab is a Markdown guest file (never a package). */
export function activeTabIsMarkdown(): boolean {
  const path = shell().activeTab;
  return path !== null && isMarkdownPath(path);
}

function adoptMarkdownFile(file: MarkdownFileView): void {
  useMarkdownFiles.getState().openFile(file);
  shell().openTab({
    packagePath: file.path,
    tabKey: file.path,
    title: file.title,
    kind: 'markdown',
    ...(file.readOnly ? { readOnlyReason: file.readOnlyReason } : {}),
  });
  useShell.getState().setDocumentViewState(file.path, {
    layout: 'continuous',
    interactionMode: file.readOnly ? 'read' : 'edit',
  });
}

/** Open a `.md` path from the library, a session restore, or Reopen Tab. */
export async function openMarkdownPath(path: string): Promise<boolean> {
  const existing = markdownEntry(path);
  if (existing !== null) {
    shell().setActiveTab(path);
    return true;
  }
  const result = await window.noteforest.readMarkdownFile(path);
  if (!result.ok) {
    if (result.canceled !== true) {
      errorToast(result.message ?? 'Couldn’t open the file.', result.details);
    }
    return false;
  }
  adoptMarkdownFile(result.file);
  return true;
}

/** File → Open Markdown…: one native picker, then the same guest tab. */
export async function openMarkdownDialog(): Promise<void> {
  const result = await window.noteforest.openMarkdownFile();
  if (!result.ok) {
    if (result.canceled !== true) {
      errorToast(result.message ?? 'Couldn’t open the file.', result.details);
    }
    return;
  }
  adoptMarkdownFile(result.file);
  await syncActiveLibraryForPath(result.file.path);
}

/**
 * `+` creates an in-memory draft bound to the active library. Nothing is
 * written, locked, or added to the library list/recents until the first real
 * mutation materializes it. The global New note is root-bound; a folder's
 * "New note here" passes the target folder and the package appears inside it.
 */
export async function createNewDocument(targetFolderPath?: string): Promise<void> {
  const result = await window.noteforest.createDraft(
    targetFolderPath === undefined ? undefined : { targetFolderPath },
  );
  if (!result.ok) {
    errorToast(result.message, result.details);
    return;
  }
  const { snapshot } = result.draft;
  registerRuntime(snapshot, undefined, undefined);
  shell().openTab({
    packagePath: snapshot.packagePath,
    tabKey: snapshot.document.id,
    title: snapshot.document.title,
  });
}

/** Retry a failed draft materialization (library reconnected, lock freed). */
export async function retryDraftMaterialization(runtime: DocumentRuntime): Promise<boolean> {
  const result = await runtime.ensureMaterialized();
  if (!result.ok) {
    errorToast(result.message, result.details);
    return false;
  }
  return true;
}

/** Choose another library for a draft whose creation library is missing. */
export async function chooseLibraryForDraft(runtime: DocumentRuntime): Promise<void> {
  if (!runtime.isDraft) return;
  const result = await window.noteforest.chooseDraftLibrary(runtime.packagePath);
  if (!result.ok) {
    if (result.canceled !== true) errorToast(result.message, result.details);
    return;
  }
  shell().setLibrary(result.library);
  await retryDraftMaterialization(runtime);
}

/* ------------------------------------------------------------- libraries */

async function applyLibraryResult(result: LibraryActionSuccess): Promise<void> {
  useShell.getState().setLibrary(result.library);
  for (const mapping of result.reconciledTabs ?? []) {
    const state = useShell.getState();
    if (!state.tabs.some((tab) => tab.packagePath === mapping.from)) continue;
    state.closeTab(mapping.from);
    await openPath(mapping.to);
  }
}

/**
 * Flush every open document and pending settings write before a library switch.
 * A failed flush blocks the switch with the real error (LD-03 keeps tabs open).
 */
async function flushBeforeLibrarySwitch(): Promise<boolean> {
  for (const runtime of allRuntimes()) {
    if (!(await commitPageEdit(runtime.packagePath))) {
      toast.error('Page Edit wasn’t saved, so the library didn’t change.');
      return false;
    }
  }
  await flushPendingSettingsEdits();
  const settings = await flushSettingsWrites();
  if (!settings.ok) {
    errorToast(settings.message, settings.details);
    return false;
  }
  for (const runtime of allRuntimes()) {
    await runtime.flush();
    if (runtime.saveState === 'error') {
      toast.error(runtime.saveError ?? 'The note wasn’t saved, so the library didn’t change.');
      return false;
    }
  }
  return true;
}

/**
 * LD-03: activating a tab from another known library makes that library
 * active. Switching from the Library menu never retargets open tabs.
 */
export async function syncActiveLibraryForPath(packagePath: string): Promise<void> {
  // A draft has no library path of its own; it keeps its creation binding until
  // materialization (LD-10).
  if (isDraftKey(packagePath)) return;
  const state = useShell.getState();
  const library = state.library;
  if (library === null) return;
  if (library.libraryPath.length > 0 && isPathInside(library.libraryPath, packagePath)) {
    // Materialization adds a package the last scan did not see; activation of a
    // known row is a no-op.
    if (!library.documents.some((document) => document.packagePath === packagePath)) {
      const refreshed = await window.noteforest.refreshLibrary();
      if (refreshed.ok) await applyLibraryResult(refreshed);
    }
    return;
  }
  const target = library.libraries.find((entry) => isPathInside(entry.path, packagePath));
  if (target === undefined || target.active) return;
  const result = await window.noteforest.switchLibrary(target.path);
  if (!result.ok) {
    errorToast(result.message, result.details);
    return;
  }
  await applyLibraryResult(result);
}

export async function openLibrary(): Promise<void> {
  if (!(await flushBeforeLibrarySwitch())) return;
  const result = await window.noteforest.openLibrary();
  if (!result.ok) {
    if (result.canceled !== true) errorToast(result.message, result.details);
    return;
  }
  await applyLibraryResult(result);
}

export async function chooseLibraryParent(): Promise<string | null> {
  const choice = await window.noteforest.chooseLibraryParent();
  if (choice.canceled) return null;
  return choice.path ?? null;
}

export async function createLibrary(name: string, parentPath: string): Promise<boolean> {
  if (!(await flushBeforeLibrarySwitch())) return false;
  const result = await window.noteforest.createLibrary({ name, parentPath });
  if (!result.ok) {
    errorToast(result.message, result.details);
    return false;
  }
  await applyLibraryResult(result);
  return true;
}

export async function switchLibrary(libraryPath: string): Promise<void> {
  if (!(await flushBeforeLibrarySwitch())) return;
  const result = await window.noteforest.switchLibrary(libraryPath);
  if (!result.ok) {
    errorToast(result.message, result.details);
    return;
  }
  await applyLibraryResult(result);
}

export async function removeRecentLibrary(libraryPath: string): Promise<void> {
  if (!(await flushBeforeLibrarySwitch())) return;
  const result = await window.noteforest.removeRecentLibrary(libraryPath);
  if (!result.ok) {
    errorToast(result.message, result.details);
    return;
  }
  await applyLibraryResult(result);
}

export async function locateLibrary(missingPath: string): Promise<void> {
  if (!(await flushBeforeLibrarySwitch())) return;
  const result = await window.noteforest.locateLibrary(missingPath);
  if (!result.ok) {
    if (result.canceled !== true) errorToast(result.message, result.details);
    return;
  }
  await applyLibraryResult(result);
}

export async function refreshLibrary(): Promise<void> {
  const result = await window.noteforest.refreshLibrary();
  if (!result.ok) {
    errorToast(result.message, result.details);
    return;
  }
  await applyLibraryResult(result);
}

export async function revealLibraryPath(libraryPath?: string): Promise<void> {
  const result = await window.noteforest.revealLibrary(libraryPath);
  if (!result.ok) errorToast(result.message ?? 'Couldn’t reveal the library.', result.details);
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
    errorToast(created.message ?? 'Couldn’t create a chapter.', created.details);
    return created;
  }
  const chapterId = created.chapterId;
  if (chapterId === undefined) {
    toast.error('The chapter wasn’t created.');
    return { ok: false, message: 'The chapter wasn’t created.' };
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
  // A rename is a real mutation: a draft materializes first so the title change
  // and the package are saved together.
  if (runtime.isDraft) {
    const prepared = await runtime.ensureMaterialized();
    if (!prepared.ok) {
      toast.error(prepared.message);
      return;
    }
  }
  const outcome = await runtime.applyStructural({ type: 'document.rename', title: clean });
  if (!outcome.ok) {
    errorToast(outcome.message ?? 'Couldn’t rename the document.', outcome.details);
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
  if (activeTabIsMarkdown()) {
    const path = shell().activeTab;
    if (path === null) return;
    cancelMarkdownAutosave(path);
    const outcome = await saveMarkdownNow(path, { manual: true });
    if (outcome.status === 'failed') toast.error(outcome.message);
    else if (outcome.status === 'blocked') toast.info(outcome.message);
    else if (outcome.status === 'missing') {
      toast.error('This file is no longer on disk. Nothing was written.');
    }
    return;
  }
  const runtime = activeRuntime();
  if (runtime === null) return;
  if (!(await commitPageEdit(runtime.packagePath))) {
    toast.error('Page Edit wasn’t saved.');
    return;
  }
  await runtime.saveNow();
  if (runtime.saveState === 'error') {
    toast.error(runtime.saveError ?? 'The note wasn’t saved.');
  }
}

export async function closeTab(
  packagePath: string,
  options: { force?: boolean; save?: boolean } = {},
): Promise<void> {
  // A Markdown guest file lives only in the renderer. A dirty tab uses the
  // same Save / Don't Save / Cancel prompt as a note; Save writes atomically
  // first and keeps the tab open when it conflicts.
  if (isMarkdownPath(packagePath)) {
    const entry = markdownEntry(packagePath);
    const dirty = entry !== null && entry.dirty;
    if (dirty && options.force !== true) {
      // The dialog owns the decision: do not autosave behind it. Otherwise
      // "Don't Save" could race a debounce that already wrote the file.
      cancelMarkdownAutosave(packagePath);
      shell().openDialog({ kind: 'markdown-close', path: packagePath });
      return;
    }
    if (dirty && options.save === true) {
      cancelMarkdownAutosave(packagePath);
      const outcome = await saveMarkdownNow(packagePath, { manual: true });
      if (outcome.status === 'conflict') {
        shell().openDialog({ kind: 'markdown-conflict', path: packagePath });
        return;
      }
      if (outcome.status !== 'saved' && outcome.status !== 'clean') {
        toast.error(
          outcome.status === 'blocked'
            ? outcome.message
            : outcome.status === 'missing'
              ? 'This file is no longer on disk. Nothing was written.'
              : outcome.message,
        );
        return;
      }
    }
    cancelMarkdownAutosave(packagePath);
    useMarkdownFiles.getState().closeFile(packagePath);
    const tab = shell().tabs.find((item) => item.packagePath === packagePath);
    if (tab !== undefined) shell().pushClosed(tab);
    shell().closeTab(packagePath);
    return;
  }
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
      toast.error('Page Edit wasn’t saved, so the tab stayed open.');
      return;
    }
    if (options.save !== false) {
      await runtime.flush();
      if (runtime.saveState === 'error') {
        toast.error(runtime.saveError ?? 'The note wasn’t saved, so the tab stayed open.');
        return;
      }
    }
    // A draft key is discarded in the main process; a materialized document
    // path releases its store and lock as usual.
    await window.noteforest.closeDocument(runtime.packagePath, { save: false });
    removeRuntime(runtime.packagePath);
  }
  // A draft is never a reopenable closed tab: it has no package on disk until
  // it materializes, and a discarded draft must not be reopened.
  if (tab !== undefined && !isDraftKey(tab.packagePath)) shell().pushClosed(tab);
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
    toast.error('That note is no longer available.');
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
  if (activeTabIsMarkdown()) return;
  if (shell().activeTab === null) return;
  window.dispatchEvent(new CustomEvent('nf:fit-width'));
}

/**
 * Adjust the zoom of the active layout: Continuous `zoom` or Page `pageZoom`.
 * Page never touches the hidden Continuous zoom and vice versa.
 */
export function adjustActiveLayoutZoom(delta: number): void {
  if (activeTabIsMarkdown()) return;
  if (activeDocumentLayout() === 'page') {
    adjustActivePageZoom(delta);
    return;
  }
  adjustActiveZoom(delta);
}

/** 100% for the active layout (Page: manual zoom, no fit). */
export function resetActiveLayoutZoom(): void {
  if (activeTabIsMarkdown()) return;
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
  if (activeTabIsMarkdown()) return;
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
  if (state.activeTab !== null && isMarkdownPath(state.activeTab)) return 'continuous';
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
  // A Markdown guest file is Continuous only; there is no Page/PDF surface.
  if (isMarkdownPath(path)) return;
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

/**
 * The page the toolbar currently names: the store's page, which the Page
 * surface keeps equal to the page under the centre of the viewport.
 */
function activePagePosition(path: string): { page: number; pageCount: number; percent: number } {
  const view = shell().viewByDoc[path];
  const status = pageStatusFor(path);
  const pageCount = status?.pageCount ?? 0;
  const page = clampPageNumber(view?.currentPage ?? 1, pageCount);
  const percent = status?.percent ?? Math.round((view?.pageZoom ?? 1) * 100);
  return { page, pageCount, percent };
}

/**
 * Move the surface to one page start. The indicator jump, `⌘↑`/`⌘↓`, the
 * `Breaks` list, find and Health all go through the same view-state write; the
 * Page surface scrolls to the page, it never re-paginates. An open Page Edit
 * overlay commits first, and a rejected commit keeps the overlay and the
 * scroll position instead of dropping the text.
 */
export function goToActivePage(pageNumber: number): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  const path = runtime.packagePath;
  const target = Math.max(1, Math.round(pageNumber));
  void commitPageEdit(path).then((committed) => {
    if (!committed || getRuntime(path) !== runtime) return;
    shell().setDocumentPage(path, target);
  });
}

/** `⌘↑` / `⌘↓`: the previous or next page start. */
export function stepActivePage(delta: number): void {
  const path = shell().activeTab;
  if (path === null) return;
  const { page, pageCount } = activePagePosition(path);
  if (pageCount <= 0) return;
  const target = page + (delta < 0 ? -1 : 1);
  if (target < 1 || target > pageCount) return;
  goToActivePage(target);
}

/**
 * The zoom stepper in Page. 100 % is fit width; a step from a fit mode starts
 * from the percentage the user actually sees (the Page surface publishes it),
 * then owns the manual value.
 */
export function adjustActivePageZoom(delta: number): void {
  const state = shell();
  const path = state.activeTab;
  if (path === null) return;
  const { percent } = activePagePosition(path);
  state.setDocumentPageFit(path, 'none');
  state.setDocumentPageZoom(path, stepPageZoom(percent, delta * 100));
}

/** Reset Page to the rest state: fit width at 100 %. */
export function resetActivePageZoom(): void {
  const state = shell();
  const path = state.activeTab;
  if (path === null) return;
  state.setDocumentPageZoom(path, 1);
  state.setDocumentPageFit(path, 'width');
}

/**
 * Find bar (`⌘F`, docs/design/find-bar.md).
 *
 * `⌘F` opens the one bar over the current note; Escape closes it and puts the
 * block/anchor selection back where it was, with focus returned to the surface.
 * Navigation is view state only: no document command, no history entry.
 */
let findRestorePoint: {
  /** The note the bar was opened on: a tab switch never restores across notes. */
  packagePath: string;
  blockId: string | null;
  anchor: { blockId: string; anchorId: string; branchId: string } | null;
} | null = null;

/** Narrow the stored anchor selection to the fields restore needs. */
function findAnchorSnapshot(runtime: DocumentRuntime): {
  blockId: string;
  anchorId: string;
  branchId: string;
} | null {
  const anchor = runtime.selectedAnchor;
  if (anchor === null) return null;
  return { blockId: anchor.blockId, anchorId: anchor.anchorId, branchId: anchor.branchId };
}

/**
 * `⌘F`: open the bar and focus its query. With no note open (library, no tab)
 * or a Markdown guest file it does nothing at all.
 */
export function openFind(): void {
  if (activeTabIsMarkdown()) return;
  const runtime = activeRuntime();
  if (runtime === null) return;
  const state = shell();
  if (!state.findOpen) {
    findRestorePoint = {
      packagePath: runtime.packagePath,
      blockId: runtime.selectedBlockId,
      anchor: findAnchorSnapshot(runtime),
    };
  }
  state.openFind();
}

function focusFindSurface(runtime: DocumentRuntime, layout: DocumentLayout): void {
  if (layout === 'page') {
    document
      .querySelector<HTMLElement>('.nf-editor[data-active="true"] .nf-page-view')
      ?.focus({ preventScroll: true });
    return;
  }
  runtime.editor?.view.focus();
}

/**
 * Escape/close: clear the highlight, restore the selection saved when the bar
 * opened (not the last hit) and return focus to the editor or the page.
 */
export function closeFind(): void {
  const state = shell();
  if (!state.findOpen) return;
  const runtime = activeRuntime();
  const restore = findRestorePoint;
  findRestorePoint = null;
  state.closeFind();
  if (runtime === null) return;
  const restoreHere =
    restore !== null &&
    restore.packagePath === runtime.packagePath &&
    (restore.blockId === null || runtime.document.blocks[restore.blockId] !== undefined);
  if (restoreHere && restore !== null) {
    runtime.selectBlock(restore.blockId);
    if (restore.anchor !== null) {
      runtime.selectAnchor(restore.anchor.blockId, restore.anchor.anchorId, restore.anchor.branchId);
    }
  }
  const layout = shell().viewByDoc[runtime.packagePath]?.layout ?? 'continuous';
  focusFindSurface(runtime, layout);
}

export function findNext(): void {
  shell().nextFind();
}

export function findPrevious(): void {
  shell().previousFind();
}

/**
 * Move the view to one result. Page navigation and the block ring belong to
 * `PageView`, which owns the derived page model; Continuous reveals the block,
 * selects it and scrolls the card into view without stealing the bar's focus.
 */
export function navigateToFindResult(runtime: DocumentRuntime, result: FindResult): void {
  if (result.blockId !== null) runtime.selectBlock(result.blockId);
  const layout = shell().viewByDoc[runtime.packagePath]?.layout ?? 'continuous';
  if (layout === 'page') return;
  const target =
    result.blockId ??
    runtime.document.chapters
      .find((chapter) => chapter.id === result.chapterId)
      ?.topLevelBlockIds[0] ??
    null;
  if (target === null) return;
  if (runtime.document.blocks[target] === undefined) return;
  runtime.expandAncestors(target);
  requestAnimationFrame(() => {
    const scope = document.querySelector('.nf-editor[data-active="true"]');
    const card = scope?.querySelector<HTMLElement>(
      `[data-block-card="${CSS.escape(target)}"]`,
    );
    card?.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
}

/**
 * The document a find query runs over: the editor buffer's bodies merged into
 * the canonical blocks. Typed text reaches the search immediately instead of
 * waiting for the idle content commit; the search itself stays a pure function.
 */
export function findSearchDocument(runtime: DocumentRuntime): Document {
  const editor = runtime.editor;
  if (editor === null) return runtime.document;
  const bodies = extractBlockBodies(editor.state.doc);
  if (bodies.size === 0) return runtime.document;
  const blocks = { ...runtime.document.blocks };
  let changed = false;
  for (const [blockId, body] of bodies) {
    const block = blocks[blockId];
    if (block === undefined) continue;
    blocks[blockId] = { ...block, content: withBody(block.content, body.content) };
    changed = true;
  }
  return changed ? { ...runtime.document, blocks } : runtime.document;
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
  if (activeTabIsMarkdown()) return;
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
  const path = shell().activeTab;
  if (path !== null && isMarkdownPath(path)) {
    void window.noteforest.revealMarkdownFile(path).then((result) => {
      if (!result.ok) errorToast(result.message ?? 'Couldn’t reveal the file.', result.details);
    });
    return;
  }
  const runtime = activeRuntime();
  if (runtime === null) return;
  void revealDocumentPath(runtime.packagePath);
}

export async function revealDocumentPath(packagePath: string): Promise<void> {
  const result = await window.noteforest.revealDocument(packagePath);
  if (!result.ok) errorToast(result.message ?? 'Couldn’t reveal the note.', result.details);
}

/* --------------------------------------------------------- Move to Trash */

/**
 * Open the confirmation for one library row. A live lock or an outside-library
 * path is reported directly and no destructive action is offered; a missing
 * package gets the cleanup-only variant instead.
 */
export async function requestTrashDocument(packagePath: string): Promise<void> {
  if (isDraftKey(packagePath)) {
    toast.info('This note is still a draft. Close its tab to discard it; nothing has been written.');
    return;
  }
  const preflight = await window.noteforest.trashPreflight(packagePath);
  if (!preflight.canTrash && (preflight.status !== 'missing' || preflight.liveLock)) {
    toast.error(preflight.reason ?? 'This document cannot be moved to the Trash.');
    return;
  }
  shell().openDialog({ kind: 'trash-document', packagePath, preflight });
}

/** Confirmed Move to Trash: flush first, then the main-process OS Trash move. */
export async function confirmTrashDocument(preflight: TrashPreflight): Promise<void> {
  const packagePath = preflight.packagePath;
  // A plain folder and a `.md` guest file have no package runtime of their own;
  // every open tab underneath is saved and closed before the OS move.
  if (preflight.kind === 'folder' || preflight.kind === 'markdown') {
    const contained = (shell().library?.documents ?? []).filter((document) =>
      isPathInside(packagePath, document.packagePath),
    );
    if (preflight.kind === 'folder') {
      const closed = await closeTabsForVaultChange(packagePath);
      if (closed === null) return;
      const result = await window.noteforest.trashDocument(packagePath);
      if (!result.ok) {
        errorToast(result.message, result.details);
        await reopenMovedTabs(closed, []);
        return;
      }
      shell().setLibrary(result.library);
      for (const document of contained) {
        useSettingsStore
          .getState()
          .forgetDocumentSettings(
            document.documentId,
            document.packagePath,
            sharedDocumentIdPaths(document.documentId, document.packagePath),
          );
      }
    } else {
      const result = await window.noteforest.trashDocument(packagePath);
      if (!result.ok) {
        errorToast(result.message, result.details);
        return;
      }
      shell().setLibrary(result.library);
      cancelMarkdownAutosave(packagePath);
      useMarkdownFiles.getState().closeFile(packagePath);
      shell().closeTab(packagePath);
    }
    toast.success(`Moved “${preflight.title}” to the Trash`);
    return;
  }
  const runtime = getRuntime(packagePath);
  if (runtime !== null) {
    // An open Page Edit is not in the runtime until it commits.
    if (!(await commitPageEdit(packagePath))) {
      toast.error('Could not commit the Page Edit block before moving the note to the Trash.');
      return;
    }
    await runtime.flush();
    if (runtime.saveState === 'error') {
      toast.error(runtime.saveError ?? 'Could not save before moving the note to the Trash.');
      return;
    }
  }
  const result = await window.noteforest.trashDocument(packagePath);
  if (!result.ok) {
    errorToast(result.message, result.details);
    return;
  }
  shell().setLibrary(result.library);
  useSettingsStore
    .getState()
    .forgetDocumentSettings(
      preflight.documentId,
      packagePath,
      sharedDocumentIdPaths(preflight.documentId, packagePath),
    );
  if (runtime !== null) removeRuntime(packagePath);
  shell().closeTab(packagePath);
  toast.success(`Moved “${preflight.title}” to the Trash`);
}

/**
 * Other known packages and session tabs that carry one document id. A copy
 * keeps the same id, so the renderer cleanup must not remove the copy's
 * override either (F3).
 */
function sharedDocumentIdPaths(
  documentId: string | null,
  packagePath: string,
): string[] {
  if (documentId === null) return [];
  const state = shell();
  const paths = new Set<string>();
  for (const document of state.library?.documents ?? []) {
    if (document.documentId === documentId && document.packagePath !== packagePath) {
      paths.add(document.packagePath);
    }
  }
  for (const tab of state.tabs) {
    if (tab.packagePath === packagePath) continue;
    if (getRuntime(tab.packagePath)?.document.id === documentId) paths.add(tab.packagePath);
  }
  return [...paths];
}

/** Missing package: cleanup-only, never deletes anything. */
export async function confirmRemoveMissingDocument(preflight: TrashPreflight): Promise<void> {
  const result = await window.noteforest.removeMissingDocument(
    preflight.packagePath,
    preflight.documentId,
  );
  if (!result.ok) {
    errorToast(result.message, result.details);
    return;
  }
  shell().setLibrary(result.library);
  useSettingsStore
    .getState()
    .forgetDocumentSettings(
      preflight.documentId,
      preflight.packagePath,
      sharedDocumentIdPaths(preflight.documentId, preflight.packagePath),
    );
  if (getRuntime(preflight.packagePath) !== null) removeRuntime(preflight.packagePath);
  shell().closeTab(preflight.packagePath);
  toast.success(`Removed “${preflight.title}” from recents`);
}

/* ------------------------------------------------- vault entries (phase 3) */

/**
 * Library organization (folder create/rename/move/trash, note/Markdown move,
 * New note here) is app-level, exactly like New note and New library: it stays
 * available while a note is open in Read mode. Read mode gates document
 * **content** only (blocks, branches, anchors, table/formula edits).
 *
 * The renderer-side gate is the real one: there must be an open, present
 * library. A live lock and an unsaved/failed flush are refused by the
 * operation itself (`closeTabsForVaultChange` and the main-process guards), so
 * they are never turned into a disabled button that hides the reason.
 */
export function libraryMutationsEnabled(): boolean {
  const library = shell().library;
  return library !== null && library.libraryPath.length > 0 && !library.missing;
}

function vaultMutationBlocked(): boolean {
  if (libraryMutationsEnabled()) return false;
  toast.info('Open a library before creating or changing files.');
  return true;
}

interface ClosedVaultTab {
  path: string;
  kind: 'note' | 'markdown';
  active: boolean;
}

/**
 * Flush and close every open note/guest tab at or under one path before a
 * vault move or trash. Returns the closed tabs (to reopen when the operation is
 * refused) or null when a save refused the change.
 */
async function closeTabsForVaultChange(targetPath: string): Promise<ClosedVaultTab[] | null> {
  const affected = shell().tabs.filter((tab) => isPathInside(targetPath, tab.packagePath));
  if (affected.length > 0) {
    await flushPendingSettingsEdits();
    const settings = await flushSettingsWrites();
    if (!settings.ok) {
      errorToast(settings.message, settings.details);
      return null;
    }
  }
  const closed: ClosedVaultTab[] = [];
  const activeBefore = shell().activeTab;
  for (const tab of affected) {
    const path = tab.packagePath;
    if (isMarkdownPath(path)) {
      cancelMarkdownAutosave(path);
      const entry = markdownEntry(path);
      if (entry !== null && entry.dirty) {
        const outcome = await saveMarkdownNow(path, { manual: true });
        if (outcome.status !== 'saved' && outcome.status !== 'clean') {
          toast.error(
            outcome.status === 'conflict'
              ? 'This Markdown file changed outside NoteForest. Resolve it before moving the file.'
              : outcome.status === 'missing'
                ? 'This file is no longer on disk. Nothing was written.'
                : outcome.message,
          );
          return null;
        }
      }
      useMarkdownFiles.getState().closeFile(path);
      shell().closeTab(path);
      closed.push({ path, kind: 'markdown', active: activeBefore === path });
      continue;
    }
    const runtime = getRuntime(path);
    if (runtime !== null) {
      // An open Page Edit is not in the runtime until it commits.
      if (!(await commitPageEdit(path))) {
        toast.error('Could not commit the Page Edit block before moving.');
        return null;
      }
      await runtime.flush();
      if (runtime.saveState === 'error') {
        toast.error(runtime.saveError ?? 'Could not save before moving.');
        return null;
      }
      await window.noteforest.closeDocument(path, { save: false });
      removeRuntime(path);
    }
    shell().closeTab(path);
    closed.push({ path, kind: 'note', active: activeBefore === path });
  }
  return closed;
}

/** Reopen the tabs a refused/finished vault change closed, at their new paths. */
async function reopenMovedTabs(
  closed: readonly ClosedVaultTab[],
  moves: ReadonlyArray<{ from: string; to: string }>,
): Promise<void> {
  const mapping = new Map(moves.map((move) => [move.from, move.to]));
  let active: string | null = null;
  for (const tab of closed) {
    const target = mapping.get(tab.path) ?? (moves.length === 0 ? tab.path : null);
    if (target === null) continue;
    if (tab.kind === 'markdown') await openMarkdownPath(target);
    else await openPath(target);
    if (tab.active) active = target;
  }
  if (active !== null) shell().setActiveTab(active);
}

export async function revealVaultPath(targetPath: string): Promise<void> {
  const result = await window.noteforest.revealVaultEntry(targetPath);
  if (!result.ok) errorToast(result.message ?? 'Couldn’t reveal this item.', result.details);
}

export async function createVaultFolder(parentPath: string, name: string): Promise<boolean> {
  if (vaultMutationBlocked()) return false;
  const result = await window.noteforest.createVaultFolder({ parentPath, name });
  if (!result.ok) {
    errorToast(result.message, result.details);
    return false;
  }
  shell().setLibrary(result.library);
  return true;
}

export async function renameVaultFolder(folderPath: string, name: string): Promise<boolean> {
  if (vaultMutationBlocked()) return false;
  const closed = await closeTabsForVaultChange(folderPath);
  if (closed === null) return false;
  const result = await window.noteforest.renameVaultFolder(folderPath, name);
  if (!result.ok) {
    errorToast(result.message, result.details);
    await reopenMovedTabs(closed, []);
    return false;
  }
  shell().setLibrary(result.library);
  await reopenMovedTabs(closed, result.moves);
  return true;
}

export async function moveVaultEntryTo(
  sourcePath: string,
  targetFolderPath: string,
): Promise<boolean> {
  if (vaultMutationBlocked()) return false;
  const closed = await closeTabsForVaultChange(sourcePath);
  if (closed === null) return false;
  const result = await window.noteforest.moveVaultEntry({ sourcePath, targetFolderPath });
  if (!result.ok) {
    errorToast(result.message, result.details);
    await reopenMovedTabs(closed, []);
    return false;
  }
  shell().setLibrary(result.library);
  await reopenMovedTabs(closed, result.moves);
  return true;
}

export function openNewFolderDialog(parentPath: string): void {
  if (vaultMutationBlocked()) return;
  shell().openDialog({ kind: 'new-folder', parentPath });
}

export function openRenameFolderDialog(folderPath: string, name: string): void {
  if (vaultMutationBlocked()) return;
  shell().openDialog({ kind: 'rename-folder', path: folderPath, name });
}

export function openMoveVaultEntryDialog(entry: {
  path: string;
  name: string;
  entryKind: 'folder' | 'note' | 'markdown';
}): void {
  if (vaultMutationBlocked()) return;
  shell().openDialog({
    kind: 'move-vault-entry',
    path: entry.path,
    name: entry.name,
    entryKind: entry.entryKind,
  });
}

/**
 * Folder row context menu (phase 3). Library organization is app-level: the
 * entries stay available in Read mode (design §6). The order is create first,
 * then rename/move, then Reveal, then the destructive action.
 */
export function openVaultFolderMenu(
  folderPath: string,
  anchor: { x: number; y: number },
): void {
  const enabled = libraryMutationsEnabled();
  shell().openContextMenu(anchor.x, anchor.y, [
    {
      id: 'vault-new-note',
      label: 'New note here',
      disabled: !enabled,
      ...(enabled ? { onSelect: () => void createNewDocument(folderPath) } : {}),
    },
    { id: 'sep-vault-new-note', label: '', separator: true },
    {
      id: 'vault-new-folder',
      label: 'New folder…',
      disabled: !enabled,
      ...(enabled
        ? { onSelect: () => openNewFolderDialog(folderPath) }
        : {}),
    },
    {
      id: 'vault-rename-folder',
      label: 'Rename folder…',
      disabled: !enabled,
      ...(enabled
        ? {
            onSelect: () =>
              openRenameFolderDialog(folderPath, folderPath.split('/').at(-1) ?? ''),
          }
        : {}),
    },
    {
      id: 'vault-move-folder',
      label: 'Move to folder…',
      disabled: !enabled,
      ...(enabled
        ? {
            onSelect: () =>
              openMoveVaultEntryDialog({
                path: folderPath,
                name: folderPath.split('/').at(-1) ?? '',
                entryKind: 'folder',
              }),
          }
        : {}),
    },
    { id: 'sep-vault', label: '', separator: true },
    {
      id: 'vault-reveal',
      label: 'Reveal in Finder',
      onSelect: () => void revealVaultPath(folderPath),
    },
    {
      id: 'vault-trash-folder',
      label: 'Move to Trash…',
      danger: true,
      disabled: !enabled,
      ...(enabled
        ? { onSelect: () => void requestTrashDocument(folderPath) }
        : {}),
    },
  ]);
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
  const path = shell().activeTab;
  if (path !== null && isMarkdownPath(path)) {
    markdownHistory(path, 'undo');
    return;
  }
  const runtime = activeRuntime();
  if (runtime === null) return;
  if (blockedByReadMode(runtime)) return;
  runHistory(runtime, 'undo');
}

export function redoActive(): void {
  const path = shell().activeTab;
  if (path !== null && isMarkdownPath(path)) {
    markdownHistory(path, 'redo');
    return;
  }
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
    // Page settings, not document content: the entry states its own Read gate
    // and a " — Read mode" rewrite here would duplicate the reason.
    entry.id === 'manual-break' ||
    entry.id === 'text-copy' ||
    entry.id === 'text-select-all' ||
    entry.id.startsWith('anchor-select-') ||
    entry.id.startsWith('anchor-cycle-') ||
    entry.id.startsWith('reference-open-') ||
    entry.id.startsWith('reference-back-')
  );
}

/**
 * Disable every mutating context-menu entry in Read mode and say why. The
 * whitelist is intentionally narrow: an unknown/new entry is treated as
 * mutating until it is proven navigation. Copy/Select All are text actions,
 * not document mutations, so Read keeps them usable.
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

/**
 * Manual breaks are **page settings**, not document content (`docs/design/
 * manual-breaks.md` §4): the per-document override lives outside the document
 * and is not an undo entry. `pageSettingsAuthoringEnabled` is the one gate: the
 * same rule in both layouts, disabled in Read and read-only documents.
 */
function manualBreakAuthoringEnabled(runtime: DocumentRuntime): boolean {
  return pageSettingsAuthoringEnabled(runtime, shell().viewByDoc[runtime.packagePath]);
}

/**
 * The row-leader rule for the current layout (`docs/design/manual-breaks.md`
 * §3). Page is exact from the mounted page model. Continuous has no page model
 * by design (R2a), so it uses the measured right/below placement the renderer
 * already owns; a callout is never offered there because Page can place it in
 * the parent's right lane (mode A, F11).
 */
function isManualBreakRowLeader(runtime: DocumentRuntime, blockId: string): boolean {
  const document = runtime.document;
  const layout = shell().viewByDoc[runtime.packagePath]?.layout ?? 'continuous';
  if (layout === 'page') {
    const snapshot = printPageModelSnapshot(runtime.packagePath);
    if (snapshot !== null && snapshot.layout.revision === document.revision) {
      return pageRowLeaderIds(snapshot.layout).has(blockId);
    }
  }
  const topLevelIds = new Set<string>();
  for (const chapter of document.chapters) {
    for (const id of chapter.topLevelBlockIds) topLevelIds.add(id);
  }
  const calloutIds = new Set<string>();
  for (const id of Object.keys(document.blocks)) {
    if (incomingBranch(document, id)?.source.anchorId !== undefined) calloutIds.add(id);
  }
  return continuousRowLeaderIds({
    topLevelIds,
    calloutIds,
    belowIds: runtime.childPlacementBelowIds,
  }).has(blockId);
}

/** The one `Start on a new page` entry, with its four states. */
function manualBreakEntry(runtime: DocumentRuntime, blockId: string): MenuEntry {
  const stored = useSettingsStore
    .getState()
    .resolvedPageSettings(runtime.packagePath, runtime.document.id).manualBreakBeforeBlockIds;
  const state = manualBreakMenuState({
    blockId,
    document: runtime.document,
    rowLeader: isManualBreakRowLeader(runtime, blockId),
    stored,
  });
  const readOnly = !manualBreakAuthoringEnabled(runtime);
  const disabled = readOnly || state.disabled;
  const reason = readOnly ? READ_MODE_TITLE : state.reason;
  return {
    id: 'manual-break',
    label: MANUAL_BREAK_LABEL,
    checked: state.checked,
    ...(disabled ? { disabled: true } : {}),
    ...(reason === null ? {} : { description: reason }),
    ...(disabled ? {} : { onSelect: () => setManualBreak(blockId, !state.checked) }),
  };
}

/**
 * Write the per-document `manualBreakBeforeBlockIds` override (deduped and
 * normalized by the settings store). The global default stays `[]` by contract.
 * The Page Edit overlay is committed first, exactly like every other Page
 * settings write, so the toggle never paginates an uncommitted buffer.
 */
export function setManualBreak(blockId: string, enabled: boolean): void {
  const runtime = activeRuntime();
  if (runtime === null || !manualBreakAuthoringEnabled(runtime)) return;
  const path = runtime.packagePath;
  const documentId = runtime.document.id;
  void commitPageEdit(path).then((committed) => {
    if (!committed) return;
    // The document may have closed while the commit awaited: never retarget the
    // write to another active document (UI Sentinel F2 identity rule).
    if (getRuntime(path) !== runtime) return;
    if (runtime.document.blocks[blockId] === undefined) return;
    const state = useSettingsStore.getState();
    const current = state.resolvedPageSettings(path, documentId).manualBreakBeforeBlockIds;
    const next = enabled
      ? [...new Set([...current, blockId])]
      : current.filter((id) => id !== blockId);
    if (next.length === current.length && next.every((id, index) => id === current[index])) {
      return;
    }
    state.setPageSettingsOverride(
      path,
      withManualBreakIds(pageOverrideFor(state, path, documentId), next),
      documentId,
    );
  });
}

/**
 * Reveal one stored break: Page turns to the page that holds the block,
 * Continuous reveals the block through the same navigation find uses.
 */
export function navigateToManualBreak(blockId: string, pageNumber: number | null): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  if (runtime.document.blocks[blockId] === undefined) return;
  runtime.selectBlock(blockId);
  const layout = shell().viewByDoc[runtime.packagePath]?.layout ?? 'continuous';
  if (layout === 'page') {
    if (pageNumber === null) return;
    const path = runtime.packagePath;
    void commitPageEdit(path).then((committed) => {
      if (!committed || getRuntime(path) !== runtime) return;
      shell().setDocumentPage(path, pageNumber);
    });
    return;
  }
  runtime.expandAncestors(blockId);
  requestAnimationFrame(() => {
    const scope = document.querySelector('.nf-editor[data-active="true"]');
    const card = scope?.querySelector<HTMLElement>(
      `[data-block-card="${CSS.escape(blockId)}"]`,
    );
    card?.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
}

/**
 * The Page card menu. Shell-level block authoring is Continuous-only by design
 * (`editingEnabledFor`), so the card menu carries the one page-settings item
 * instead of a block menu whose every other row would be disabled.
 */
export function openPageCardMenu(blockId: string, anchor: { x: number; y: number }): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  if (runtime.document.blocks[blockId] === undefined) return;
  shell().openContextMenu(anchor.x, anchor.y, [manualBreakEntry(runtime, blockId)]);
}

export function openBlockMenu(
  blockId: string,
  anchor: { x: number; y: number },
  options: { target?: Element | null } = {},
): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  const block = runtime.document.blocks[blockId];
  if (block === undefined) return;
  const editingEnabled = editingEnabledFor(runtime, shell().viewByDoc[runtime.packagePath]);
  const surface =
    options.target === undefined || options.target === null
      ? 'card'
      : classifyEditorContextTarget(options.target);
  const children = directChildIds(runtime.document, blockId);
  const branch = incomingBranch(runtime.document, blockId);
  const indent = indentTarget(runtime.document, blockId);
  const outdent = outdentTarget(runtime.document, blockId);
  // Reorder is port-scoped: an anchored callout moves among its anchor's
  // children, a direct child among the parent's direct children. A cross-port
  // neighbour is not a reorder target, so the entry states why instead of
  // reporting a silent success (F1).
  const moveUp = reorderTarget(runtime.document, blockId, -1);
  const moveDown = reorderTarget(runtime.document, blockId, 1);
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
      label: 'Edit block',
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
      id: 'insert-table',
      label: 'Insert table…',
      disabled: !runtime.editable,
      ...(runtime.editable
        ? {
            onSelect: () => {
              runtime.focusBlock(blockId);
              shell().openDialog({ kind: 'table-size' });
            },
          }
        : {}),
    },
    {
      id: 'add-child',
      label: 'Add child block',
      shortcut: shortcutHint('add-child'),
      onSelect: () => report(runtime.addChild(blockId)),
    },
    {
      id: 'add-sibling',
      label: 'Add sibling block',
      shortcut: shortcutHint('add-sibling'),
      onSelect: () => report(runtime.addSibling(blockId)),
    },
    { id: 'sep-structure', label: '', separator: true },
    {
      id: 'split-at-caret',
      label: 'Split at caret',
      ...(splitCheck.ok ? {} : { description: 'Place the caret in a text block.' }),
      disabled: !splitCheck.ok,
      ...(splitCheck.ok
        ? { onSelect: () => report(runtime.splitAtCaret(blockId)) }
        : {}),
    },
    {
      id: 'merge-previous',
      label: 'Merge with previous',
      ...(mergeCheck.ok
        ? {}
        : { description: 'The previous block must be in the same chapter.' }),
      disabled: !mergeCheck.ok,
      ...(mergeCheck.ok
        ? { onSelect: () => report(runtime.mergeBlock(blockId)) }
        : {}),
    },
    {
      id: 'link-reference',
      label: 'Link as reference…',
      shortcut: shortcutHint('link-reference'),
      onSelect: () => shell().openDialog({ kind: 'link-reference', blockId }),
    },
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
    { id: 'sep-position', label: '', separator: true },
    {
      id: 'move',
      label: 'Move to…',
      onSelect: () => shell().openDialog({ kind: 'move', blockId }),
    },
    {
      id: 'move-up',
      label: 'Move up',
      description: moveUp.ok ? undefined : moveUp.reason,
      shortcut: shortcutHint('block-move-up'),
      disabled: !moveUp.ok,
      ...(moveUp.ok ? { onSelect: () => report(runtime.reorderSibling(blockId, -1)) } : {}),
    },
    {
      id: 'move-down',
      label: 'Move down',
      description: moveDown.ok ? undefined : moveDown.reason,
      shortcut: shortcutHint('block-move-down'),
      disabled: !moveDown.ok,
      ...(moveDown.ok ? { onSelect: () => report(runtime.reorderSibling(blockId, 1)) } : {}),
    },
    {
      id: 'indent',
      label: 'Indent',
      description: indent.ok ? undefined : indent.reason,
      shortcut: shortcutHint('indent'),
      disabled: !indent.ok,
      ...(indent.ok ? { onSelect: () => report(runtime.indent(blockId)) } : {}),
    },
    {
      id: 'outdent',
      label: 'Outdent',
      description: outdent.ok ? undefined : outdent.reason,
      shortcut: shortcutHint('outdent'),
      disabled: !outdent.ok,
      ...(outdent.ok ? { onSelect: () => report(runtime.outdent(blockId)) } : {}),
    },
    ...(children.length > 0
      ? [
          {
            id: 'collapse',
            label: collapsed ? 'Expand branch' : 'Collapse branch',
            shortcut: shortcutHint('collapse'),
            onSelect: () => report(runtime.toggleCollapse(blockId)),
          },
        ]
      : []),
    ...(anchorEntries.length === 0 && referenceEntries.length === 0
      ? []
      : [
          { id: 'sep-anchors', label: '', separator: true },
          ...anchorEntries,
          ...(anchorEntries.length > 0 && referenceEntries.length > 0
            ? [{ id: 'sep-references', label: '', separator: true }]
            : []),
          ...referenceEntries,
        ]),
    { id: 'sep-manual-break', label: '', separator: true },
    manualBreakEntry(runtime, blockId),
    { id: 'sep-delete', label: '', separator: true },
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
      composeContextEntries({
        surface,
        target: options.target ?? null,
        anchor,
        editingEnabled,
        editor: runtime.editor,
        blockEntries: entries,
      }),
      editingEnabled,
    ),
  );
}

/**
 * One menu component, target-aware groups. Prose gets the text group plus the
 * complete block menu; a card gets the block menu; a cell gets text + table
 * commands; code and formula inputs get text only; Read text gets Copy/Select
 * All only.
 */
function composeContextEntries(input: {
  surface: ReturnType<typeof classifyEditorContextTarget>;
  target: Element | null;
  anchor: { x: number; y: number };
  editingEnabled: boolean;
  editor: DocumentRuntime['editor'];
  blockEntries: MenuEntry[];
}): MenuEntry[] {
  const snapshot = input.target === null ? null : captureTextTarget(input.target);
  const text =
    snapshot === null ? [] : textMenuEntries(snapshot, { readOnly: !input.editingEnabled });
  if (
    input.surface === 'formula-source' ||
    input.surface === 'code-language' ||
    input.surface === 'code'
  ) {
    return text;
  }
  if (input.surface === 'cell') {
    if (!input.editingEnabled) return text;
    const cellPosition = ensureCellSelection(
      input.editor,
      input.target,
      input.anchor.x,
      input.anchor.y,
    );
    return [
      ...text,
      { id: 'sep-table', label: '', separator: true },
      ...tableMenuEntries({ editor: input.editor, cellPosition }),
    ];
  }
  if (input.surface === 'prose') {
    if (!input.editingEnabled) return text;
    return [
      ...text,
      { id: 'sep-text', label: '', separator: true },
      ...input.blockEntries,
    ];
  }
  return input.blockEntries;
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
  if (tab.kind === 'markdown') {
    shell().openContextMenu(anchor.x, anchor.y, [
      {
        id: 'activate',
        label: 'Open',
        onSelect: () => shell().setActiveTab(packagePath),
      },
      {
        id: 'reveal',
        label: 'Reveal in Finder',
        onSelect: () => {
          void window.noteforest.revealMarkdownFile(packagePath).then((result) => {
            if (!result.ok) errorToast(result.message ?? 'Couldn’t reveal the file.', result.details);
          });
        },
      },
      { id: 'sep-markdown-tab', label: '', separator: true },
      {
        id: 'close',
        label: 'Close tab',
        shortcut: shortcutHint('close-tab'),
        onSelect: () => void closeTab(packagePath),
      },
    ]);
    return;
  }
  const draft = isDraftKey(packagePath);
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
      label: draft ? 'Reveal in Finder — not saved yet' : 'Reveal in Finder',
      disabled: draft,
      ...(draft ? {} : { onSelect: () => void revealDocumentPath(packagePath) }),
    },
    { id: 'sep', label: '', separator: true },
    {
      id: 'close',
      label: draft ? 'Discard draft' : 'Close tab',
      shortcut: shortcutHint('close-tab'),
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
  if (entry?.kind === 'markdown') {
    const tab = shell().tabs.find((item) => item.packagePath === packagePath);
    const vaultEnabled = libraryMutationsEnabled();
    shell().openContextMenu(anchor.x, anchor.y, [
      {
        id: 'open',
        label: 'Open',
        onSelect: () => void openMarkdownPath(packagePath),
      },
      {
        id: 'reveal',
        label: 'Reveal in Finder',
        onSelect: () => {
          void window.noteforest.revealMarkdownFile(packagePath).then((result) => {
            if (!result.ok) errorToast(result.message ?? 'Couldn’t reveal the file.', result.details);
          });
        },
      },
      {
        id: 'move',
        label: 'Move to folder…',
        disabled: !vaultEnabled,
        ...(vaultEnabled
          ? {
              onSelect: () =>
                openMoveVaultEntryDialog({
                  path: packagePath,
                  name: packagePath.split('/').at(-1) ?? '',
                  entryKind: 'markdown',
                }),
            }
          : {}),
      },
      ...(tab === undefined
        ? []
        : [
            { id: 'sep-markdown', label: '', separator: true },
            {
              id: 'close',
              label: 'Close tab',
              shortcut: shortcutHint('close-tab'),
              onSelect: () => void closeTab(packagePath),
            },
          ]),
    ]);
    return;
  }
  const editable = entry === undefined || entry.status === 'ok';
  const missing = entry?.status === 'missing';
  const runtime = getRuntime(packagePath);
  const renameEnabled = editable && (runtime === null || runtime.editable);
  const vaultEnabled = libraryMutationsEnabled();
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
            label: renameEnabled
              ? 'Rename document…'
              : 'Rename document… (read-only)',
            disabled: !renameEnabled,
            ...(renameEnabled
              ? {
                  onSelect: () => {
                    void openPath(packagePath).then((opened) => {
                      if (!opened) return;
                      const current = getRuntime(packagePath);
                      if (current === null || !current.editable) {
                        toast.error('This note is open read-only.');
                        return;
                      }
                      shell().openDialog({ kind: 'rename-document' });
                    });
                  },
                }
              : {}),
          },
        ]
      : []),
    ...(missing
      ? []
      : [
          {
            id: 'move',
            label: 'Move to folder…',
            disabled: !vaultEnabled,
            ...(vaultEnabled
              ? {
                  onSelect: () =>
                    openMoveVaultEntryDialog({
                      path: packagePath,
                      name: entry?.title ?? (packagePath.split('/').at(-1) ?? ''),
                      entryKind: 'note',
                    }),
                }
              : {}),
          },
        ]),
    { id: 'sep-document', label: '', separator: true },
    ...(missing
      ? [
          {
            id: 'remove-missing',
            label: 'Remove from recents',
            onSelect: () => void requestTrashDocument(packagePath),
          },
        ]
      : [
          {
            id: 'trash',
            label: 'Move to Trash…',
            danger: true,
            onSelect: () => void requestTrashDocument(packagePath),
          },
        ]),
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
  if (activeTabIsMarkdown()) {
    const mode = activeInteractionMode();
    return [
      {
        id: 'open-markdown',
        label: 'Open Markdown…',
        shortcut: shortcutHint('open-markdown'),
        onSelect: () => void openMarkdownDialog(),
      },
      {
        id: 'toggle-interaction-mode',
        label: mode === 'edit' ? 'Switch to Read mode' : 'Switch to Edit mode',
        shortcut: shortcutHint('toggle-mode'),
        onSelect: toggleActiveInteractionMode,
      },
      { id: 'reveal', label: 'Reveal Markdown file in Finder', onSelect: revealActive },
      { id: 'close-tab', label: 'Close tab', shortcut: shortcutHint('close-tab'), onSelect: () => void closeActiveTab() },
      { id: 'toggle-sidebar', label: 'Toggle sidebar', shortcut: shortcutHint('toggle-sidebar'), onSelect: toggleSidebar },
      {
        id: 'settings',
        label: 'Settings…',
        shortcut: shortcutHint('settings'),
        onSelect: () => shell().openDialog({ kind: 'settings' }),
      },
    ];
  }
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
  const indentCheck =
    runtime === null || selected === null
      ? { ok: false as const, reason: 'Select a block first.' }
      : indentTarget(runtime.document, selected);
  const outdentCheck =
    runtime === null || selected === null
      ? { ok: false as const, reason: 'Select a block first.' }
      : outdentTarget(runtime.document, selected);
  return [
    { id: 'new-document', label: 'New note', shortcut: shortcutHint('new-note'), onSelect: () => void createNewDocument() },
    {
      id: 'open-markdown',
      label: 'Open Markdown…',
      shortcut: shortcutHint('open-markdown'),
      onSelect: () => void openMarkdownDialog(),
    },
    gate({ id: 'new-chapter', label: 'New chapter', shortcut: shortcutHint('new-chapter'), onSelect: () => void createChapter() }),
    withDocument({ id: 'save', label: 'Save', shortcut: shortcutHint('save'), onSelect: () => void saveActive() }),
    withDocument({
      id: 'export-pdf',
      label: 'Export PDF…',
      shortcut: shortcutHint('export-pdf'),
      onSelect: exportActiveDocument,
    }),
    { id: 'close-tab', label: 'Close tab', shortcut: shortcutHint('close-tab'), onSelect: () => void closeActiveTab() },
    { id: 'toggle-sidebar', label: 'Toggle sidebar', shortcut: shortcutHint('toggle-sidebar'), onSelect: toggleSidebar },
    withDocument({ id: 'zoom-in', label: 'Zoom in', shortcut: shortcutHint('zoom-in'), onSelect: () => adjustActiveLayoutZoom(0.1) }),
    withDocument({ id: 'zoom-out', label: 'Zoom out', shortcut: shortcutHint('zoom-out'), onSelect: () => adjustActiveLayoutZoom(-0.1) }),
    withDocument({ id: 'zoom-reset', label: 'Reset zoom', shortcut: shortcutHint('reset-zoom'), onSelect: resetActiveLayoutZoom }),
    withDocument({ id: 'fit-width', label: 'Fit width', shortcut: shortcutHint('fit-width'), onSelect: () => fitActiveLayout('fit-width') }),
    withDocument({ id: 'fit-page', label: 'Fit page', shortcut: shortcutHint('fit-page'), onSelect: () => fitActiveLayout('fit-page') }),
    withDocument({ id: 'continuous-layout', label: 'Switch to Continuous', shortcut: shortcutHint('continuous-layout'), onSelect: () => setActiveDocumentLayout('continuous') }),
    withDocument({ id: 'page-layout', label: 'Switch to Page', shortcut: shortcutHint('page-layout'), onSelect: () => setActiveDocumentLayout('page') }),
    withDocument({
      id: 'toggle-interaction-mode',
      label: activeInteractionMode() === 'edit' ? 'Switch to Read mode' : 'Switch to Edit mode',
      shortcut: shortcutHint('toggle-mode'),
      onSelect: toggleActiveInteractionMode,
    }),
    withDocument({ id: 'focus-branch', label: 'Focus branch', shortcut: shortcutHint('focus-branch'), onSelect: toggleFocusBranch }),
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
      shortcut: shortcutHint('add-child'),
      onSelect: () => {
        if (runtime === null || selected === null) return;
        report(runtime.addChild(selected));
      },
    }),
    gate({
      id: 'add-sibling',
      label: 'Add sibling block',
      shortcut: shortcutHint('add-sibling'),
      onSelect: () => {
        if (runtime === null || selected === null) return;
        report(runtime.addSibling(selected));
      },
    }),
    gate({
      id: 'link-reference',
      label: 'Link as reference…',
      shortcut: shortcutHint('link-reference'),
      onSelect: () => {
        if (selected === null) return;
        shell().openDialog({ kind: 'link-reference', blockId: selected });
      },
    }),
    gate({
      id: 'indent-block',
      label: 'Indent block',
      shortcut: shortcutHint('indent'),
      disabled: indentCheck.ok !== true,
      ...(indentCheck.ok ? {} : { reason: indentCheck.reason }),
      ...(indentCheck.ok && selected !== null
        ? { onSelect: () => report(runtime?.indent(selected)) }
        : {}),
    }),
    gate({
      id: 'outdent-block',
      label: 'Outdent block',
      shortcut: shortcutHint('outdent'),
      disabled: outdentCheck.ok !== true,
      ...(outdentCheck.ok ? {} : { reason: outdentCheck.reason }),
      ...(outdentCheck.ok && selected !== null
        ? { onSelect: () => report(runtime?.outdent(selected)) }
        : {}),
    }),
    {
      id: 'anchor-health',
      label: 'Document health',
      onSelect: () => openDocumentHealth(),
    },
    gate({ id: 'block-text', label: 'Block type: Text', onSelect: () => applyBlockType(null) }),
    gate({ id: 'block-h1', label: 'Block type: Heading 1', onSelect: () => applyBlockType(1) }),
    gate({ id: 'block-h2', label: 'Block type: Heading 2', onSelect: () => applyBlockType(2) }),
    gate({ id: 'block-h3', label: 'Block type: Heading 3', onSelect: () => applyBlockType(3) }),
    gate({
      id: 'undo',
      label: 'Undo',
      shortcut: shortcutHint('undo'),
      onSelect: undoActive,
    }),
    gate({
      id: 'redo',
      label: 'Redo',
      shortcut: shortcutHint('redo'),
      onSelect: redoActive,
    }),
    {
      id: 'settings',
      label: 'Settings…',
      shortcut: shortcutHint('settings'),
      onSelect: () => shell().openDialog({ kind: 'settings' }),
    },
    gate({
      id: 'insert-table',
      label: 'Insert table',
      onSelect: () => shell().openDialog({ kind: 'table-size' }),
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
    case 'open-markdown':
      void openMarkdownDialog();
      break;
    case 'save':
      void saveActive();
      break;
    case 'export-pdf':
      if (activeTabIsMarkdown()) {
        toast.info('Markdown files have no Page or PDF export.');
        break;
      }
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
    case 'fit-page':
      fitActiveLayout('fit-page');
      break;
    case 'focus-branch':
      toggleFocusBranch();
      break;
    case 'find-open':
      // The renderer owns the find (Edit → Find… is `registerAccelerator:
      // false`). With no note open or a Markdown guest file this is a no-op,
      // exactly like `⌘F`.
      openFind();
      break;
    case 'find-next':
      // Both find presentations own the current hit; with neither showing
      // there is no search to move through, exactly like `⌘G`.
      if (findSurfaceActive(shell())) findNext();
      break;
    case 'find-previous':
      if (findSurfaceActive(shell())) findPrevious();
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
