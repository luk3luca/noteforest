/**
 * Test-only bridge exposed as `window.__noteforestTest`.
 *
 * UI suites drive the app through this object: state, structural commands,
 * personal settings, the export surface, the print test host and performance
 * probes. `App` installs it in an effect and deletes it on unmount; the shape is
 * the one `global.d.ts` declares, so suites keep calling the same bridge.
 */

import { toast } from 'sonner';
import type { MenuCommand } from '../../shared/api';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { buildPrintModel } from '@noteforest/pdf';
import { useShell } from './state/shell';
import { useMarkdownFiles } from './state/markdown';
import { markdownEditor } from './markdown/markdown-editor-registry';
import { allRuntimes, registerRuntime } from './state/registry';
import { closeTab, openPath, saveActive } from './actions';
import { runAppCommand } from './commands/run';
import { commandContext } from './commands/context';
import { commandById } from '../../shared/commands';
import { activeOverlayOwner } from './shell/overlay-owner';
import { buildSession } from './state/session';
import { flushSettingsWrites, useSettingsStore } from './state/settings';
import { shortcutsForList } from '../../shared/shortcuts';
import { exportFlowHistory, useExportUi } from './export/export-flow';
import { printPageModelSnapshot } from './page/print-model-registry';
import { clearPrintTestSurface, mountPrintTestSurface } from './print/test-surface';
import { perfSnapshot, summarize } from './lib/perf';
import { openDetailsDialog, withDetailsOptions } from './lib/toast-details';

export type FlushTestMode = 'normal' | 'error' | 'hang';

/** Test-only override, reachable through `window.__noteforestTest`. */
let flushTestMode: FlushTestMode = 'normal';

/** The forced flush behavior the quit path must honor right now. */
export function currentFlushMode(): FlushTestMode {
  return flushTestMode;
}

/** The object `App` assigns to `window.__noteforestTest` for its lifetime. */
export function createTestSurface(): NonNullable<Window['__noteforestTest']> {
  return {
    state: () => {
      const state = useShell.getState();
      return {
        ready: state.ready,
        tabs: state.tabs.map((tab) => ({
          packagePath: tab.packagePath,
          tabKey: tab.tabKey ?? tab.packagePath,
          title: tab.title,
          kind: tab.kind ?? 'note',
          missing: tab.missing === true,
          recovery: tab.recovery === undefined ? null : tab.recovery.status,
          recoveryReason: tab.recovery?.reason ?? null,
        })),
        activeTab: state.activeTab,
        paletteOpen: state.paletteOpen,
        dialog: state.dialog,
        sidebarCollapsed: state.sidebarCollapsed,
        sidebarWidth: state.sidebarWidth,
        sidebarTab: state.sidebarTab,
        healthSelectedRowId: state.healthSelectedRowId,
        healthOpenSections: [...state.healthOpenSections],
        findOpen: state.findOpen,
        findQuery: state.findQuery,
        findIndex: state.findIndex,
        findTotal: state.findTotal,
        findTruncated: state.findTruncated,
        findResults: state.findResults.map((result) => ({
          id: result.id,
          kind: result.kind,
          field: result.field,
          blockId: result.blockId,
          chapterId: result.chapterId,
          anchorId: result.anchorId ?? null,
          branchId: result.branchId ?? null,
          start: result.start,
          end: result.end,
          snippetStart: result.snippetStart,
          occurrence: result.occurrence,
          snippet: result.snippet,
        })),
        markdownFiles: Object.values(useMarkdownFiles.getState().files).map((file) => ({
          path: file.path,
          title: file.title,
          dirty: file.dirty,
          error: file.error,
          readOnly: file.readOnly,
          readOnlyReason: file.readOnlyReason,
          tooLarge: file.tooLarge,
          missing: file.missing,
          saving: file.saving,
          saveError: file.saveError,
          conflict: file.conflict,
          base: file.base,
          lastSavedAt: file.lastSavedAt,
        })),
        library:
          state.library === null
            ? null
            : {
                path: state.library.libraryPath,
                name: state.library.libraryName,
                missing: state.library.missing,
                libraries: state.library.libraries,
                recent: state.library.recent.map((item) => ({
                  documentId: item.documentId,
                  title: item.title,
                  packagePath: item.packagePath,
                  missing: item.missing === true,
                })),
                documents: state.library.documents.map((document) => ({
                  packagePath: document.packagePath,
                  title: document.title,
                  status: document.status,
                  documentId: document.documentId,
                })),
                tree: state.library.tree,
              },
        expandedLibraryFolders: state.expandedLibraryFolders,
        runtimes: allRuntimes().map((item) => ({
          packagePath: item.packagePath,
          documentId: item.document.id,
          draftId: item.draftId,
          draftError: item.draftError,
          title: item.document.title,
          blocks: Object.keys(item.document.blocks).length,
          blockIds: Object.keys(item.document.blocks),
          branches: Object.keys(item.document.branches).length,
          branchIds: Object.keys(item.document.branches),
          assets: Object.keys(item.document.assets).length,
          assetAvailability: item.assetAvailability,
          status: item.status,
          readOnlyReason: item.readOnlyReason ?? null,
          lock: item.lock ?? null,
          saveState: item.saveState,
          saveError: item.saveError,
          saveFailure: item.saveFailure,
          dirty: item.dirty,
          selectedBlockId: item.selectedBlockId,
          selectedAnchor: item.selectedAnchor,
          lastHistoryOperation: item.lastHistoryOperation,
          canUndoText: item.canUndoText,
          canRedoText: item.canRedoText,
          canUndoStructural: item.canUndoStructural,
          canRedoStructural: item.canRedoStructural,
          collapsed: [...item.collapsed],
          revision: item.document.revision,
          orientation: useSettingsStore
            .getState()
            .resolvedPageSettings(item.packagePath, item.document.id).setup.orientation,
          chapters: item.document.chapters.length,
          chapterList: item.document.chapters.map((chapter) => ({
            id: chapter.id,
            title: chapter.title ?? null,
            blocks: chapter.topLevelBlockIds.length,
            blockIds: [...chapter.topLevelBlockIds],
          })),
        })),
      };
    },
    openPath: async (packagePath: string) => openPath(packagePath),
    /** Test-only: activate a tab without the global shortcut path (F2). */
    activateTab: (packagePath: string) => useShell.getState().setActiveTab(packagePath),
    /** Test-only: close one tab without the gated shell command (F1/F2). */
    closePath: async (packagePath: string) =>
      closeTab(packagePath, { force: true, save: false }),
    /** Test-only: dispatch a MenuCommand through the native-menu path. */
    dispatchMenuCommand: (command: MenuCommand) => runAppCommand(command, 'menu'),
    /** Test-only: the manifest decision for one command in the current context. */
    commandState: (id) => {
      const command = commandById(id);
      if (command === undefined) return null;
      return structuredClone(command.availability(commandContext()));
    },
    /** Test-only: the curated shortcut rows the Settings list renders. */
    shortcuts: () => structuredClone(shortcutsForList()),
    /** Test-only: which surface currently owns the global command channel. */
    overlayOwner: () => activeOverlayOwner(),
    viewState: () => structuredClone(useShell.getState().viewByDoc),
    /**
     * Test-only visual probe for the tokenized toast. It calls the same
     * public toast helpers the product uses; it adds no toast API.
     */
    showToast: (type, title, description, details) => {
      // The same public helpers the product uses, plus the product
      // `Details` action so a test can drive the toast → D25 path.
      const base = description === undefined ? undefined : { description };
      const options = withDetailsOptions(details, base);
      if (type === 'success') toast.success(title, options);
      else if (type === 'info') toast.info(title, options);
      else if (type === 'warning') toast.warning(title, options);
      else toast.error(title, options);
    },
    /** Test-only: open D25 without a toast. */
    openDetails: (value: string) => {
      openDetailsDialog(value);
    },
    applyStructural: async (command) => {
      const state = useShell.getState();
      const runtime = allRuntimes().find(
        (item) => item.packagePath === state.activeTab,
      );
      if (runtime === undefined) return { ok: false, message: 'No active document.' };
      return runtime.applyStructural(command);
    },
    anchorStates: () => {
      const state = useShell.getState();
      const runtime = allRuntimes().find(
        (item) => item.packagePath === state.activeTab,
      );
      if (runtime === undefined) return null;
      return runtime.anchorIndex.all().map((resolution) => ({
        anchorId: resolution.anchorId,
        blockId: resolution.blockId,
        state: resolution.state,
        reason: resolution.reason,
        range: resolution.resolved?.range ?? null,
      }));
    },
    structure: () => {
      const state = useShell.getState();
      const runtime = allRuntimes().find(
        (item) => item.packagePath === state.activeTab,
      );
      if (runtime === undefined) return null;
      const document = runtime.document;
      return structuredClone({
        blocks: document.blocks,
        branches: document.branches,
        chapters: document.chapters,
        anchors: document.anchors,
        // Personal page setting, never canonical document data.
        manualBreakBeforeBlockIds: useSettingsStore
          .getState()
          .resolvedPageSettings(runtime.packagePath, runtime.document.id)
          .manualBreakBeforeBlockIds,
      });
    },
    assets: () => {
      const state = useShell.getState();
      const runtime = allRuntimes().find(
        (item) => item.packagePath === state.activeTab,
      );
      return structuredClone(runtime?.document.assets ?? {});
    },
    assetAvailability: () => {
      const state = useShell.getState();
      const runtime = allRuntimes().find(
        (item) => item.packagePath === state.activeTab,
      );
      return structuredClone(runtime?.assetAvailability ?? {});
    },
    caretLocation: () => {
      const state = useShell.getState();
      const runtime = allRuntimes().find(
        (item) => item.packagePath === state.activeTab,
      );
      return runtime?.caretLocation() ?? null;
    },
    flushSession: () => window.noteforest.saveSession(buildSession()),
    /** Test-only: the same save action without the gated command surface. */
    saveNow: () => saveActive(),
    /**
     * Test-only: set a real ProseMirror selection in one Markdown guest
     * editor so the platform copy path (⌘C) carries rich nodes.
     */
    markdownSelect: (path, kind) => {
      const editor = markdownEditor(path);
      if (editor === null) return null;
      let match: { from: number; to: number; text: string } | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (match !== null) return false;
        if (node.type.name !== kind) return true;
        if (kind === 'paragraph') {
          const text = node.textBetween(0, node.content.size, '\n', '\n');
          if (!text.includes('A paragraph with')) return true;
          match = { from: pos + 1, to: pos + node.content.size, text };
          return false;
        }
        match = { from: pos, to: pos + node.nodeSize, text: node.textContent.slice(0, 80) };
        return false;
      });
      if (match === null) return null;
      const selected = match as { from: number; to: number; text: string };
      const transaction = editor.state.tr;
      transaction.setSelection(
        kind === 'paragraph'
          ? TextSelection.create(transaction.doc, selected.from, selected.to)
          : NodeSelection.create(transaction.doc, selected.from),
      );
      editor.view.dispatch(transaction);
      editor.view.focus();
      return selected;
    },
    settings: () => {
      const store = useSettingsStore.getState();
      return structuredClone({
        app: store.app,
        pageOverrides: store.pageOverrides,
        documentSettings: store.documentSettings,
        settingsStatus: store.settingsStatus,
        documentSettingsStatus: store.documentSettingsStatus,
        documentSettingsBackup: store.documentSettingsBackup,
        dismissedWarnings: store.dismissedWarnings,
        saveState: store.saveState,
      });
    },
    setSettings: async (input) => {
      useSettingsStore.getState().setAppSettings(input);
      await flushSettingsWrites();
      return structuredClone(useSettingsStore.getState().app);
    },
    setPageSettingsOverride: async (packagePath, override) => {
      const runtime = allRuntimes().find(
        (item) => item.packagePath === packagePath,
      );
      useSettingsStore
        .getState()
        .setPageSettingsOverride(packagePath, override, runtime?.document.id ?? null);
      await flushSettingsWrites();
      return structuredClone(
        useSettingsStore
          .getState()
          .resolvedPageSettings(packagePath, runtime?.document.id ?? null),
      );
    },
    resolvedPageSettings: (packagePath) => {
      const runtime = allRuntimes().find(
        (item) => item.packagePath === packagePath,
      );
      return structuredClone(
        useSettingsStore
          .getState()
          .resolvedPageSettings(packagePath, runtime?.document.id ?? null),
      );
    },
    flushSettings: () => flushSettingsWrites(),
    setFlushMode: (mode: FlushTestMode) => {
      flushTestMode = mode;
    },
    exportState: () => {
      const state = useExportUi.getState();
      return structuredClone({
        status: state.status,
        packagePath: state.packagePath,
        jobId: state.jobId,
        outputPath: state.outputPath,
        documentTitle: state.documentTitle,
        folder: state.folder,
        baseName: state.baseName,
        layout: state.layout,
        pageSetup: state.pageSetup,
        density: state.density,
        overwrite: state.overwrite,
        cancelPrompt: state.cancelPrompt,
        progress: state.progress,
        phase: state.phase,
        pageCount: state.pageCount,
        pageWidthMm: state.pageWidthMm,
        pageHeightMm: state.pageHeightMm,
        cancelling: state.cancelling,
        error: state.error,
        warnings: state.warnings,
      });
    },
    exportHistory: () => structuredClone(exportFlowHistory()),
    renderPrint: () => {
      const state = useShell.getState();
      const runtime = allRuntimes().find((item) => item.packagePath === state.activeTab);
      if (runtime === undefined) return { ok: false, message: 'No active document.' };
      const snapshot = printPageModelSnapshot(runtime.packagePath);
      if (snapshot === null) {
        return { ok: false, message: 'The Page model is not ready.' };
      }
      const model = buildPrintModel(
        snapshot.document,
        snapshot.layout,
        {
          pages: snapshot.pages,
          pageCount: snapshot.pages.length,
          defects: snapshot.defects,
          manualBreakWarnings: snapshot.manualBreakWarnings,
        },
        {
          settings: snapshot.settings,
          pageModelFingerprint: snapshot.settingsFingerprint,
          // The visible Page model measured with the current appearance code
          // font; the print model must agree or fail the identity check.
          codeFont: useSettingsStore.getState().app.appearance.codeFont,
          failedAssetIds: [...snapshot.failedAssetIds],
          assetUrls: snapshot.assetUrls,
        },
      );
      mountPrintTestSurface(model, model.assetUrls);
      return {
        ok: true,
        pageCount: model.pageCount,
        fingerprint: model.fingerprint,
        settingsFingerprint: snapshot.settingsFingerprint,
        pageWidthMm: model.geometry.pageWidthMm,
        pageHeightMm: model.geometry.pageHeightMm,
        contentWidthPx: model.geometry.contentWidthPx,
        contentHeightPx: model.geometry.contentHeightPx,
      };
    },
    clearPrint: () => {
      clearPrintTestSurface();
      return true;
    },
    pageModelPages: () => {
      const state = useShell.getState();
      const runtime = allRuntimes().find((item) => item.packagePath === state.activeTab);
      if (runtime === undefined) return null;
      const snapshot = printPageModelSnapshot(runtime.packagePath);
      if (snapshot === null) return null;
      return snapshot.pages.map((page) => ({
        pageNumber: page.pageNumber,
        blockIds: page.fragments.map((fragment) => fragment.blockId),
        continuationIn: page.continuationIn.length,
        continuationOut: page.continuationOut.length,
        overflow: page.overflow,
      }));
    },
    editorCheck: () => {
      return allRuntimes().map((item) => {
        try {
          item.editor?.state.doc.check();
          return { packagePath: item.packagePath, ok: true };
        } catch (error) {
          return {
            packagePath: item.packagePath,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });
    },
    editorJson: () => allRuntimes().map((item) => ({ packagePath: item.packagePath, json: item.editor?.getJSON() ?? null })),
    benchmarkReflow: (count = 8) => {
      const runtime = allRuntimes()[0];
      if (runtime === undefined) return [];
      runtime.benchmarkFullReflow(count);
      return perfSnapshot().reflow;
    },
    perf: () => {
      const snapshot = perfSnapshot();
      return {
        measure: summarize(snapshot.measure),
        edge: summarize(snapshot.edge),
        reflow: summarize(snapshot.reflow),
        mount: summarize(snapshot.mount),
        raw: snapshot,
      };
    },
    seed: async (kind) => {
      const result = await window.noteforest.debugSeed(kind);
      registerRuntime(result.snapshot, undefined, undefined);
      const state = useShell.getState();
      state.setLibrary(result.library);
      state.openTab({
        packagePath: result.snapshot.packagePath,
        tabKey: `${result.snapshot.document.id}:${result.snapshot.packagePath}`,
        title: result.snapshot.document.title,
      });
      return result.snapshot.packagePath;
    },
  };
}
