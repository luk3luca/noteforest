/**
 * Personal app settings store (ADR-0008, S2-2, S2-5, S2-6).
 *
 * Resolution path for one document:
 *
 *   PageSettings(doc) = mergePageSettings(appSettings.page, pageOverride(doc))
 *
 * The global app settings come from `settings.json`. Per-document overrides are
 * durable: they live in `document-settings.json` and are keyed by the canonical
 * document id first, then by package path (see `shared/document-settings.ts`).
 * They are deliberately outside `SessionTabState`, so closing a tab or quitting
 * cannot lose them.
 *
 * Continuous zoom intentionally does not appear here: the only continuous zoom
 * is the per-document `DocumentViewState.zoom` in the shell store (S2-6).
 *
 * Writes are serialized in one queue. The store never reports `saved` before the
 * main process confirms the atomic write, and a failure stays visible for retry.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import type {
  AppSettings,
  AppearanceSettings,
  PageSettings,
  PageSettingsOverride,
} from '@noteforest/layout';
import {
  DEFAULT_APP_SETTINGS,
  mergePageSettings,
  normalizeAppSettings,
  normalizePageDensity,
  normalizePageSettingsOverride,
} from '@noteforest/layout';
import type {
  DocumentSettingsBackupView,
  DocumentSettingsRecoveryResult,
  DocumentSettingsSaveInput,
  SettingsFileStatus,
  SettingsSaveResult,
} from '../../../shared/api';
import {
  adoptDocumentSettingsEntry,
  findDocumentSettingsEntry,
  normalizeDocumentSettingsFile,
  normalizePackagePath,
  upsertDocumentSettingsEntry,
  type DocumentSettingsEntry,
} from '../../../shared/document-settings';

export interface SettingsSaveState {
  status: 'idle' | 'saving' | 'saved' | 'error';
  message?: string;
}

/** Patch shape for `updateAppSettings`: only the fields the caller changed. */
export interface AppSettingsPatch {
  page?: {
    setup?: {
      size?: PageSettings['setup']['size'];
      orientation?: PageSettings['setup']['orientation'];
      margins?: Partial<PageSettings['setup']['margins']>;
    };
    theme?: Partial<PageSettings['theme']>;
    chrome?: Partial<PageSettings['chrome']>;
    manualBreakBeforeBlockIds?: readonly string[];
  };
  /** Global shell appearance; global-only, never per document. */
  appearance?: Partial<AppearanceSettings>;
  /** Global export defaults; global-only, never per document. */
  export?: Partial<AppSettings['export']>;
}

export interface SettingsBootstrap {
  settings: unknown;
  settingsStatus?: SettingsFileStatus;
  documentSettings?: unknown;
  documentSettingsStatus?: SettingsFileStatus;
  documentSettingsBackup?: DocumentSettingsBackupView | null;
}

/**
 * Banner dismissals are session-only. The file status itself is never cleared
 * by Dismiss: Data & About keeps showing the real status and recovery action.
 */
export interface SettingsWarningDismissals {
  global: boolean;
  document: boolean;
}

export interface SettingsSnapshot {
  app: AppSettings;
  /** Durable per-document entries, canonical document id + path fallback. */
  documentSettings: DocumentSettingsEntry[];
  /** Path-keyed view of `documentSettings` (test bridge and legacy callers). */
  pageOverrides: Record<string, PageSettingsOverride>;
  settingsStatus: SettingsFileStatus;
  documentSettingsStatus: SettingsFileStatus;
  documentSettingsBackup: DocumentSettingsBackupView | null;
  dismissedWarnings: SettingsWarningDismissals;
  saveState: SettingsSaveState;
}

interface SettingsState extends SettingsSnapshot {
  /** Load bootstrap settings, statuses, and the durable document map. */
  initialize: (bootstrap: SettingsBootstrap) => void;
  /** Replace the whole global settings object and persist it. */
  setAppSettings: (settings: unknown) => AppSettings;
  /** Merge a partial global settings patch and persist it (never a blind replace). */
  updateAppSettings: (patch: AppSettingsPatch) => AppSettings;
  /** Store a per-document page override; `null` clears it. Persists durably. */
  setPageSettingsOverride: (
    packagePath: string,
    override: unknown,
    documentId?: string | null,
  ) => PageSettingsOverride | undefined;
  /** Re-key an entry when a document opens from a renamed/moved path. */
  adoptDocumentSettings: (packagePath: string, documentId: string | null) => void;
  /** Drop one document's entry locally after Move to Trash cleaned the file. */
  forgetDocumentSettings: (documentId: string | null, packagePath: string) => void;
  resolvedPageSettings: (
    packagePath: string | null | undefined,
    documentId?: string | null,
  ) => PageSettings;
  /**
   * Hide the top warning banner for this session only. The stored read status
   * is untouched, so Data & About keeps the status and the recovery action.
   */
  dismissSettingsWarning: (which: 'global' | 'document') => void;
  /**
   * Explicit reset: replace `settings.json` with the product defaults through
   * the dedicated main-process path. The corrupt warning clears only when the
   * write really succeeded.
   */
  resetSettingsToDefaults: () => Promise<SettingsSaveResult>;
  /**
   * Explicit map reset (S3-13): the main process backs up the current
   * `document-settings.json` and writes an empty map atomically. In-memory
   * entries and overrides clear only after that write succeeds.
   */
  resetDocumentSettings: () => Promise<SettingsSaveResult>;
  /**
   * Restore the newest valid map backup. The main process backs up the current
   * file and validates the backup; an invalid backup leaves everything intact.
   */
  restoreDocumentSettingsBackup: () => Promise<SettingsSaveResult>;
  /** Retry the last failed settings write. */
  retrySettingsWrite: () => void;
}

const OK_STATUS: SettingsFileStatus = { state: 'ok' };
const NO_DISMISSALS: SettingsWarningDismissals = { global: false, document: false };

function statusOrDefault(status: SettingsFileStatus | undefined): SettingsFileStatus {
  return status ?? OK_STATUS;
}

/** Build the path-keyed compatibility view from durable entries. */
export function pageOverridesByPath(
  entries: readonly DocumentSettingsEntry[],
): Record<string, PageSettingsOverride> {
  const map: Record<string, PageSettingsOverride> = {};
  for (const entry of entries) {
    if (entry.page !== undefined) map[entry.packagePath] = entry.page;
  }
  return map;
}

function normalizeEntries(input: unknown): DocumentSettingsEntry[] {
  return normalizeDocumentSettingsFile(input).entries;
}

function normalizePatch(current: AppSettings, patch: AppSettingsPatch): AppSettings {
  const page = patch.page ?? {};
  const setup = page.setup ?? {};
  const margins = setup.margins ?? {};
  // A preset patch replaces the theme baseline (presets are whole typography
  // sets); a density-only patch keeps every other resolved global value. This
  // is what makes "switch to Comfortable" mean the preset, not "Comfortable
  // plus every explicit value the previous theme happened to have".
  const theme =
    page.theme?.preset !== undefined
      ? { ...page.theme }
      : { ...current.page.theme, ...(page.theme ?? {}) };
  // Export is a global folder-only namespace; an explicit `null` resets to the
  // OS Documents folder and must not fall back to the previous custom path.
  const exportFolder =
    patch.export?.folder === undefined ? current.export.folder : patch.export.folder;
  return normalizeAppSettings({
    page: {
      setup: {
        ...current.page.setup,
        ...setup,
        margins: { ...current.page.setup.margins, ...margins },
      },
      theme,
      // Chrome is a per-field patch; a partial change keeps the other sources.
      chrome: { ...current.page.chrome, ...(page.chrome ?? {}) },
      manualBreakBeforeBlockIds:
        page.manualBreakBeforeBlockIds ?? current.page.manualBreakBeforeBlockIds,
    },
    appearance: { ...current.appearance, ...(patch.appearance ?? {}) },
    export: { folder: exportFolder },
  });
}

interface SettingsBridge {
  saveSettings: (settings: AppSettings) => Promise<SettingsSaveResult>;
  saveDocumentSettings: (input: DocumentSettingsSaveInput) => Promise<SettingsSaveResult>;
  resetSettings?: () => Promise<SettingsSaveResult>;
  resetDocumentSettings?: () => Promise<DocumentSettingsRecoveryResult>;
  restoreDocumentSettingsBackup?: () => Promise<DocumentSettingsRecoveryResult>;
}

function bridge(): SettingsBridge | null {
  if (typeof window === 'undefined') return null;
  const api = window.noteforest;
  if (
    api === undefined ||
    typeof api.saveSettings !== 'function' ||
    typeof api.saveDocumentSettings !== 'function'
  ) {
    return null;
  }
  return {
    saveSettings: (settings) => api.saveSettings(settings),
    saveDocumentSettings: (input) => api.saveDocumentSettings(input),
    ...(typeof api.resetSettings === 'function'
      ? { resetSettings: () => api.resetSettings() }
      : {}),
    ...(typeof api.resetDocumentSettings === 'function'
      ? { resetDocumentSettings: () => api.resetDocumentSettings() }
      : {}),
    ...(typeof api.restoreDocumentSettingsBackup === 'function'
      ? { restoreDocumentSettingsBackup: () => api.restoreDocumentSettingsBackup() }
      : {}),
  };
}

type PendingWrite = () => Promise<SettingsSaveResult>;

function errorResult(error: unknown): SettingsSaveResult {
  return {
    ok: false,
    message: error instanceof Error && error.message.length > 0 ? error.message : String(error),
  };
}

let writeQueue: Promise<void> = Promise.resolve();
let writeSequence = 0;
let lastResult: SettingsSaveResult = { ok: true };
let lastFailed: PendingWrite | null = null;
/**
 * A debounced UI edit (currently the Settings density slider) that has not
 * enqueued its write yet. Close/quit calls this before waiting on the queue, so
 * an instant-save value cannot be lost inside the debounce window.
 */
let pendingSettingsFlush: (() => Promise<void>) | null = null;

export function registerPendingSettingsFlush(
  flush: (() => Promise<void>) | null,
): void {
  pendingSettingsFlush = flush;
}

/** Apply any debounced settings edit, then leave its write queued. */
export async function flushPendingSettingsEdits(): Promise<void> {
  const flush = pendingSettingsFlush;
  if (flush !== null) await flush();
}

/**
 * Serialize one write. The newest queued write owns the visible status; an
 * older failure can never overwrite a newer success (and vice versa).
 */
function enqueueWrite(run: PendingWrite): Promise<SettingsSaveResult> {
  const sequence = ++writeSequence;
  useSettingsStore.setState({ saveState: { status: 'saving' } });
  const task = async (): Promise<SettingsSaveResult> => {
    const api = bridge();
    if (api === null) return { ok: true };
    try {
      return await run();
    } catch (error) {
      return errorResult(error);
    }
  };
  const result = writeQueue.then(task, task);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  void result.then((outcome) => {
    lastResult = outcome;
    if (sequence !== writeSequence) return;
    if (outcome.ok) {
      lastFailed = null;
      useSettingsStore.setState({ saveState: { status: 'saved' } });
    } else {
      useSettingsStore.setState({
        saveState: { status: 'error', message: outcome.message },
      });
    }
  });
  return result;
}

function persistAppSettings(settings: AppSettings): Promise<SettingsSaveResult> {
  const write = (): Promise<SettingsSaveResult> => {
    const api = bridge();
    if (api === null) return Promise.resolve({ ok: true });
    return api.saveSettings(settings);
  };
  lastFailed = write;
  return enqueueWrite(write);
}

function persistDocumentSettings(
  input: DocumentSettingsSaveInput,
): Promise<SettingsSaveResult> {
  const write = (): Promise<SettingsSaveResult> => {
    const api = bridge();
    if (api === null) return Promise.resolve({ ok: true });
    return api.saveDocumentSettings(input);
  };
  lastFailed = write;
  return enqueueWrite(write);
}

/** Wait for every queued settings write; returns the newest result. */
export async function flushSettingsWrites(): Promise<SettingsSaveResult> {
  await writeQueue;
  return lastResult;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  app: DEFAULT_APP_SETTINGS,
  documentSettings: [],
  pageOverrides: {},
  settingsStatus: OK_STATUS,
  documentSettingsStatus: OK_STATUS,
  documentSettingsBackup: null,
  dismissedWarnings: { ...NO_DISMISSALS },
  saveState: { status: 'idle' },

  initialize: (bootstrap) => {
    const entries = normalizeEntries(bootstrap.documentSettings);
    set({
      app: normalizeAppSettings(
        bootstrap.settings as Parameters<typeof normalizeAppSettings>[0],
      ),
      documentSettings: entries,
      pageOverrides: pageOverridesByPath(entries),
      settingsStatus: statusOrDefault(bootstrap.settingsStatus),
      documentSettingsStatus: statusOrDefault(bootstrap.documentSettingsStatus),
      documentSettingsBackup: bootstrap.documentSettingsBackup ?? null,
      dismissedWarnings: { ...NO_DISMISSALS },
      saveState: { status: 'idle' },
    });
  },

  setAppSettings: (settings) => {
    const normalized = normalizeAppSettings(
      settings as Parameters<typeof normalizeAppSettings>[0],
    );
    set({ app: normalized });
    void persistAppSettings(normalized);
    return normalized;
  },

  updateAppSettings: (patch) => {
    const normalized = normalizePatch(get().app, patch);
    set({ app: normalized });
    void persistAppSettings(normalized);
    return normalized;
  },

  setPageSettingsOverride: (packagePath, override, documentId) => {
    const normalized = normalizePageSettingsOverride(override);
    const identity = { documentId: documentId ?? null, packagePath };
    const entries = upsertDocumentSettingsEntry(
      get().documentSettings,
      identity,
      normalized,
    );
    set({
      documentSettings: entries,
      pageOverrides: pageOverridesByPath(entries),
    });
    void persistDocumentSettings({
      documentId: documentId ?? null,
      packagePath,
      page: normalized ?? null,
    });
    return normalized;
  },

  adoptDocumentSettings: (packagePath, documentId) => {
    const current = get().documentSettings;
    const adopted = adoptDocumentSettingsEntry(current, { documentId, packagePath });
    if (adopted === current) return;
    set({
      documentSettings: adopted,
      pageOverrides: pageOverridesByPath(adopted),
    });
    const entry = findDocumentSettingsEntry(adopted, { documentId, packagePath });
    if (entry?.page === undefined) return;
    void persistDocumentSettings({
      documentId: entry.documentId,
      packagePath: entry.packagePath,
      page: entry.page,
    });
  },

  forgetDocumentSettings: (documentId, packagePath) => {
    const targetPath = normalizePackagePath(packagePath);
    const next = get().documentSettings.filter(
      (entry) =>
        !(
          (documentId !== null && entry.documentId === documentId) ||
          normalizePackagePath(entry.packagePath) === targetPath
        ),
    );
    if (next.length === get().documentSettings.length) return;
    set({ documentSettings: next, pageOverrides: pageOverridesByPath(next) });
  },

  resolvedPageSettings: (packagePath, documentId) => {
    const state = get();
    if (packagePath === null || packagePath === undefined) {
      return mergePageSettings(state.app.page, undefined);
    }
    const entry = findDocumentSettingsEntry(state.documentSettings, {
      documentId: documentId ?? null,
      packagePath,
    });
    return mergePageSettings(state.app.page, entry?.page);
  },

  dismissSettingsWarning: (which) => {
    // Session-only banner dismissal (S3-2). The file status stays exactly as
    // read so Data & About can still show the message, backup and recovery.
    set((state) => ({
      dismissedWarnings: { ...state.dismissedWarnings, [which]: true },
    }));
  },

  resetSettingsToDefaults: () => {
    const defaults = normalizeAppSettings(DEFAULT_APP_SETTINGS);
    // The in-memory view already showed defaults while the file was corrupt;
    // the file itself is replaced only by this explicit action.
    set({ app: defaults });
    const write = async (): Promise<SettingsSaveResult> => {
      const api = bridge();
      if (api === null) return { ok: true };
      if (api.resetSettings !== undefined) return api.resetSettings();
      // A bridge without the dedicated reset path can only try the ordinary
      // write; a corrupt file makes that fail and the error stays visible.
      return api.saveSettings(defaults);
    };
    lastFailed = write;
    const result = enqueueWrite(write);
    void result.then((outcome) => {
      if (outcome.ok) {
        set((state) => ({
          settingsStatus: OK_STATUS,
          dismissedWarnings: { ...state.dismissedWarnings, global: false },
        }));
      }
    });
    return result;
  },

  resetDocumentSettings: () => {
    const write = async (): Promise<SettingsSaveResult> => {
      const api = bridge();
      if (api === null) return { ok: true };
      if (api.resetDocumentSettings === undefined) {
        return { ok: false, message: 'This build cannot reset document settings.' };
      }
      const result = await api.resetDocumentSettings();
      if (!result.ok) return result;
      // Replace, never merge: a reset means the durable map is empty.
      set((state) => ({
        documentSettings: result.entries,
        pageOverrides: pageOverridesByPath(result.entries),
        documentSettingsStatus: OK_STATUS,
        documentSettingsBackup: result.backup,
        dismissedWarnings: { ...state.dismissedWarnings, document: false },
      }));
      return { ok: true };
    };
    lastFailed = write;
    return enqueueWrite(write);
  },

  restoreDocumentSettingsBackup: () => {
    const write = async (): Promise<SettingsSaveResult> => {
      const api = bridge();
      if (api === null) return { ok: true };
      if (api.restoreDocumentSettingsBackup === undefined) {
        return { ok: false, message: 'This build cannot restore document settings.' };
      }
      const result = await api.restoreDocumentSettingsBackup();
      if (!result.ok) return result;
      set((state) => ({
        documentSettings: result.entries,
        pageOverrides: pageOverridesByPath(result.entries),
        documentSettingsStatus: OK_STATUS,
        documentSettingsBackup: result.backup,
        dismissedWarnings: { ...state.dismissedWarnings, document: false },
      }));
      return { ok: true };
    };
    lastFailed = write;
    return enqueueWrite(write);
  },

  retrySettingsWrite: () => {
    const write = lastFailed;
    if (write === null) return;
    void enqueueWrite(write);
  },
}));

/** Page override for one document, resolved by id first and then by path. */
export function pageOverrideFor(
  state: Pick<SettingsState, 'documentSettings'>,
  packagePath: string | null | undefined,
  documentId?: string | null,
): PageSettingsOverride | undefined {
  if (packagePath === null || packagePath === undefined) return undefined;
  return findDocumentSettingsEntry(state.documentSettings, {
    documentId: documentId ?? null,
    packagePath,
  })?.page;
}

/** Resolved page settings for one document; memoized on the global/override refs. */
export function usePageSettings(
  packagePath: string | null | undefined,
  documentId?: string | null,
): PageSettings {
  const globalPage = useSettingsStore((state) => state.app.page);
  const override = useSettingsStore((state) =>
    pageOverrideFor(state, packagePath, documentId),
  );
  return useMemo(() => mergePageSettings(globalPage, override), [globalPage, override]);
}

/** Slider percent (integer 60–120) of a density value. */
export function pageDensityPercent(density: number): number {
  return Math.round(normalizePageDensity(density) * 100);
}

/** Density multiplier from a slider percent value (60–120). */
export function pageDensityValue(percent: number): number {
  return normalizePageDensity(percent / 100);
}

/**
 * Keep only the density part of the draft: an explicit per-document density
 * override, preserving every other page override field.
 */
export function withPageDensityOverride(
  override: PageSettingsOverride | undefined,
  density: number,
): PageSettingsOverride {
  return {
    ...(override ?? {}),
    theme: { ...(override?.theme ?? {}), density: normalizePageDensity(density) },
  };
}

/**
 * Drop the density part of a per-document override. Other overrides survive;
 * an empty result means "use the global settings again".
 */
export function withoutPageDensityOverride(
  override: PageSettingsOverride | undefined,
): PageSettingsOverride | undefined {
  if (override?.theme?.density === undefined) return override;
  const { density: _density, ...theme } = override.theme;
  const next: PageSettingsOverride = { ...override };
  if (Object.keys(theme).length === 0) delete next.theme;
  else next.theme = theme;
  return Object.keys(next).length === 0 ? undefined : next;
}

/** Test-only reset: restores defaults and clears pending write status. */
export function resetSettingsForTests(): void {
  writeSequence += 1;
  lastFailed = null;
  lastResult = { ok: true };
  useSettingsStore.setState({
    app: DEFAULT_APP_SETTINGS,
    documentSettings: [],
    pageOverrides: {},
    settingsStatus: OK_STATUS,
    documentSettingsStatus: OK_STATUS,
    documentSettingsBackup: null,
    dismissedWarnings: { ...NO_DISMISSALS },
    saveState: { status: 'idle' },
  });
}
