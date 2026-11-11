/**
 * IPC contract between the Electron main process and the renderer.
 *
 * The renderer is a normal browser context. It never touches the filesystem
 * directly: documents are opened and mutated through `@noteforest/core/node`
 * in the main process, and only typed snapshots/cross the bridge.
 */

import type { Asset, AssetAvailability, CreatedIds, Document, DocumentCommand } from '@noteforest/core';
import type {
  AppSettings,
  PageSettingsOverride,
} from '@noteforest/layout';
import type { DocumentSettingsEntry } from './document-settings.js';
import type { DocumentLayout, InteractionMode, PageFit } from './view-state';
import type {
  ChooseExportFolderResult,
  ExportDefaults,
  ExportJobView,
  ExportPathStatus,
  ExportPdfInput,
  ExportPdfStartResult,
  ExportSnapshotReply,
  ExportSnapshotRequest,
} from './export.js';

export type {
  ChooseExportFolderResult,
  ExportDefaults,
  ExportFailureCode,
  ExportJobErrorView,
  ExportJobPhase,
  ExportJobStatus,
  ExportJobView,
  ExportPathStatus,
  ExportPdfInput,
  ExportPdfStartResult,
  ExportSnapshot,
  ExportSnapshotReply,
  ExportSnapshotRequest,
  ExportWarning,
  PrintBuildResult,
  PrintPdfOptions,
  PrintRunDefect,
  PrintRunMetrics,
  PrintRunSummary,
} from './export.js';

export type {
  DocumentIdentity,
  DocumentSettingsEntry,
  DocumentSettingsFile,
} from './document-settings.js';

export type OpenStatus = 'editable' | 'read-only';

/**
 * Library-visible state of one package. `ok` is a normal document;
 * `unreadable` covers corrupt JSON and validation failures; `newer-schema`
 * means a newer app version wrote it; `missing` means the package folder has
 * no `document.json`. Damaged packages stay in the library with a reason.
 */
export type LibraryDocumentStatus = 'ok' | 'unreadable' | 'missing' | 'newer-schema';

export type RecoveryStatus = Exclude<LibraryDocumentStatus, 'ok'>;

export interface DocumentSummary {
  packagePath: string;
  title: string;
  status: LibraryDocumentStatus;
  /** Human reason for a non-ok status; absent for ok rows. */
  reason?: string;
  documentId: string | null;
  revision: number | null;
  updatedAt: string;
  blockCount: number;
  chapterCount: number;
}

export interface RecentDocumentView {
  documentId: string;
  title: string;
  packagePath: string;
  lastOpenedAt: string;
  missing?: boolean;
}

export interface OpenDocumentSnapshot {
  packagePath: string;
  document: Document;
  status: OpenStatus;
  readOnlyReason?: string;
  /** Existing lock metadata for a `stale-lock` or `locked` read-only open. */
  lock?: LockInfoView;
  /**
   * Session asset availability. Absent means no asset has been checked; a
   * missing file or hash mismatch is listed as `asset-missing`/`asset-changed`.
   */
  assetAvailability?: AssetAvailability[];
  errors: string[];
  warnings: string[];
}

/** Lock metadata shown before the user explicitly takes over a stale lock. */
export interface LockInfoView {
  pid: number | null;
  host: string | null;
  sessionId: string | null;
  acquiredAt: string | null;
  heartbeatAt: string | null;
  /** The lock file exists but is unreadable/corrupt. */
  corrupt: boolean;
}

/**
 * Read-only package inspection result. It is returned instead of a document
 * snapshot for corrupt, missing, and newer-schema packages so the renderer can
 * open a recovery tab without ever constructing an editable runtime.
 */
export interface RecoveryDocumentView {
  recovery: true;
  packagePath: string;
  title: string;
  status: RecoveryStatus;
  /** Primary parse/validation/missing reason. */
  reason: string;
  /** Validation issues, when the parser produced them. */
  details: string[];
  warnings: string[];
}

export interface LibraryView {
  libraryPath: string;
  appSupportPath: string;
  documents: DocumentSummary[];
  recent: RecentDocumentView[];
  warnings: string[];
}

/**
 * State of one settings file after a read. `defaults` means the file is simply
 * absent; `corrupt`/`unreadable` are user-visible warnings and never silently
 * overwrite the stored file on read.
 */
export type SettingsFileState = 'ok' | 'defaults' | 'corrupt' | 'unreadable' | 'newer';

export interface SettingsFileStatus {
  state: SettingsFileState;
  /** Human reason for a non-ok state. */
  message?: string;
  /** Preserved `.corrupt-<timestamp>` copy for a corrupt file. */
  backupPath?: string;
  /** Stored schema version for a newer-than-this-app file. */
  version?: number;
  /** True when a legacy file was migrated on read. */
  migrated?: boolean;
}

export type SettingsSaveResult = { ok: true } | { ok: false; message: string };

export interface DocumentSettingsSaveInput {
  /** Canonical document id; null keeps a path-only entry. */
  documentId: string | null;
  packagePath: string;
  /** `null` clears the entry. */
  page: PageSettingsOverride | null;
}

export type DocumentSettingsSaveResult = SettingsSaveResult;

export interface SessionTabState {
  packagePath: string;
  scrollTop: number;
  selectedBlockId: string | null;
  collapsed?: string[];
  /** ADR-0007 view state; absent on legacy sessions and normalized on read. */
  layout?: DocumentLayout;
  interactionMode?: InteractionMode;
  currentPage?: number;
  pageZoom?: number;
  pageFit?: PageFit;
  /**
   * Continuous surface zoom. This is the only continuous zoom source (S2-6);
   * the global settings file has no zoom.
   */
  zoom?: number;
}

export interface SessionState {
  tabs: SessionTabState[];
  activeTab: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  collapsedTopics: Record<string, string[]>;
}

export interface BootstrapResult {
  library: LibraryView;
  session: SessionState;
  /** Personal app settings resolved from `settings.json`. */
  settings: AppSettings;
  /** Read status of the global settings file (corrupt/migrated/newer). */
  settingsStatus: SettingsFileStatus;
  /** Durable per-document overrides (S2-2), outside the session. */
  documentSettings: DocumentSettingsEntry[];
  /** Read status of `document-settings.json`. */
  documentSettingsStatus: SettingsFileStatus;
  openDocuments: OpenDocumentSnapshot[];
  /** Session tabs whose package is damaged, missing, or newer than this app. */
  recoveries: RecoveryDocumentView[];
  appVersion: string;
  platform: string;
}

export interface CreateDocumentSuccess {
  ok: true;
  snapshot: OpenDocumentSnapshot;
  library: LibraryView;
}

export interface CreateDocumentFailure {
  ok: false;
  message: string;
}

export type CreateDocumentResult = CreateDocumentSuccess | CreateDocumentFailure;

export interface OpenDocumentFailure {
  ok: false;
  message: string;
  packagePath: string;
}

export type OpenDocumentResult = OpenDocumentSnapshot | RecoveryDocumentView | OpenDocumentFailure;

/** Explicit stale-lock takeover: the only path that removes a stale lock. */
export type TakeOverLockResult =
  | { ok: true; snapshot: OpenDocumentSnapshot }
  | {
      ok: false;
      message: string;
      code?: 'not-stale' | 'locked' | 'read-only' | 'not-found' | 'unknown';
    };

export interface ApplyResult {
  ok: boolean;
  document?: Document;
  revision?: number;
  created?: CreatedIds;
  inverse?: DocumentCommand | null;
  /** Availability for affected assets; only present when a command touched one. */
  assetAvailability?: AssetAvailability[];
  message?: string;
  code?: string;
}

/**
 * Why a save failed. The main process maps the core store's typed
 * `CoreError` onto this closed set; it is never collapsed into one
 * generic "save failed" code.
 */
export type SaveFailureCode =
  | 'read-only'
  | 'permission'
  | 'disk-full'
  | 'external-modification'
  | 'lock-lost'
  | 'backup-failed'
  | 'invalid-document'
  | 'not-found'
  | 'unknown';

export interface SaveSuccess {
  ok: true;
  changed: boolean;
  revision: number;
}

export interface SaveFailure {
  ok: false;
  changed: false;
  revision: number;
  code: SaveFailureCode;
  /** Original `CoreErrorCode`, kept for diagnostics and support. */
  coreCode?: string;
  error: string;
}

export type SaveResult = SaveSuccess | SaveFailure;

/**
 * Optional save request flags. `overwriteExternal` is only sent by the
 * explicit external-modification confirmation; a normal save must omit it.
 */
export interface SaveRequestOptions {
  overwriteExternal?: boolean;
}

export interface SaveCopySuccess {
  ok: true;
  /** New package directory chosen in the native dialog. */
  packagePath: string;
  /** Present when the copy lives inside the library and was opened. */
  snapshot?: OpenDocumentSnapshot;
  library: LibraryView;
}

export interface SaveCopyFailure {
  ok: false;
  canceled?: boolean;
  message?: string;
}

export type SaveCopyResult = SaveCopySuccess | SaveCopyFailure;

export interface ReloadDocumentSuccess {
  ok: true;
  snapshot: OpenDocumentSnapshot;
}

export interface ReloadDocumentFailure {
  ok: false;
  message: string;
}

export type ReloadDocumentResult = ReloadDocumentSuccess | ReloadDocumentFailure;

export interface RevealResult {
  ok: boolean;
  message?: string;
}

export type BackupKind = 'autosave' | 'daily' | 'pre-migration' | 'manual';

/**
 * One rotating backup shown on the save-failure surface. `sourcePath` is an
 * opaque backup file path; the renderer never reads it, and the main process
 * re-validates it against the document's current backup listing before use.
 */
export interface BackupCandidateView {
  sourcePath: string;
  kind: BackupKind;
  createdAt: string;
  revision: number;
  blockCount: number;
  title: string;
  bytes: number;
  valid: boolean;
  /** Why the backup cannot be restored; present only when `valid` is false. */
  error?: string;
}

export interface ListBackupsSuccess {
  ok: true;
  /** Newest first, valid and invalid candidates included. */
  backups: BackupCandidateView[];
}

export interface ListBackupsFailure {
  ok: false;
  message: string;
}

export type ListBackupsResult = ListBackupsSuccess | ListBackupsFailure;

export type RestoreBackupFailureCode =
  | 'no-backup'
  | 'invalid-source'
  | 'outside-library'
  | 'invalid-destination'
  | 'same-package'
  | 'exists'
  | 'not-writable'
  | 'restore-failed'
  | 'unknown';

export interface RestoreBackupSuccess {
  ok: true;
  /** New package directory chosen in the native dialog. */
  packagePath: string;
  /** Present when the restored copy was opened (it always lives in the library). */
  snapshot?: OpenDocumentSnapshot;
  library: LibraryView;
}

export interface RestoreBackupFailure {
  ok: false;
  canceled?: boolean;
  code?: RestoreBackupFailureCode;
  message?: string;
}

export type RestoreBackupResult = RestoreBackupSuccess | RestoreBackupFailure;

export interface WindowState {
  dirty: boolean;
  title: string;
  representedPath: string | null;
}

/**
 * Result of asking the renderer to commit pending content before close/quit.
 *
 * `timeout` is generated by the main process when the renderer does not answer
 * in time; it is never success. `error` carries a user-facing reason and must
 * keep the window open.
 */
export type FlushStatus = 'ok' | 'error' | 'timeout';

export interface FlushResult {
  status: FlushStatus;
  error?: string;
}

export type MenuCommand =
  | 'new-document'
  | 'open-document'
  | 'save'
  | 'close-tab'
  | 'close-window'
  | 'reopen-tab'
  | 'toggle-sidebar'
  | 'command-palette'
  | 'settings'
  | 'settings-shortcuts'
  | 'new-chapter'
  | 'add-block'
  | 'flush'
  | 'export-pdf'
  | 'undo'
  | 'redo'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'fit-width'
  | 'focus-branch';

export interface SeedResult {
  snapshot: OpenDocumentSnapshot;
  library: LibraryView;
}

/** Input for a paste/drop import. Bytes are copied into the package assets. */
export interface ImportImageBytesInput {
  bytes: Uint8Array;
  mime: string;
  originalName?: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface ImportImageSuccess {
  ok: true;
  /** Canonical `document.assets[id]` record to add with `asset.add`. */
  asset: Asset;
}

export interface ImportImageFailure {
  ok: false;
  canceled?: boolean;
  message: string;
}

export type ImportImageResult = ImportImageSuccess | ImportImageFailure;

export interface NoteForestApi {
  bootstrap(): Promise<BootstrapResult>;
  scanLibrary(): Promise<LibraryView>;
  createDocument(input: { title?: string }): Promise<CreateDocumentResult>;
  openDocument(packagePath: string): Promise<OpenDocumentResult>;
  /** Explicitly remove a stale lock and reopen writable; never automatic. */
  takeOverLock(packagePath: string): Promise<TakeOverLockResult>;
  apply(packagePath: string, command: DocumentCommand): Promise<ApplyResult>;
  save(packagePath: string, options?: SaveRequestOptions): Promise<SaveResult>;
  saveCopy(packagePath: string): Promise<SaveCopyResult>;
  listBackups(packagePath: string): Promise<ListBackupsResult>;
  restoreBackup(packagePath: string, sourcePath: string): Promise<RestoreBackupResult>;
  /** Restore the newest valid backup to a unique new package; never overwrites. */
  restoreNewestBackup(packagePath: string): Promise<RestoreBackupResult>;
  reloadDocument(packagePath: string): Promise<ReloadDocumentResult>;
  closeDocument(packagePath: string, options: { save: boolean }): Promise<void>;
  revealDocument(packagePath: string): Promise<RevealResult>;
  revealLibrary(): Promise<void>;
  /** Reveal the app-support/settings folder in the OS file manager. */
  revealAppSupport(): Promise<void>;
  saveSession(state: SessionState): Promise<void>;
  /**
   * Persist personal app settings. The main process serializes the write,
   * merges known fields over the stored file (unknown fields survive), and
   * resolves only after the atomic write succeeds. An implicit write is refused
   * while `settings.json` exists but cannot be read or parsed.
   */
  saveSettings(settings: AppSettings): Promise<SettingsSaveResult>;
  /**
   * Explicit reset: atomically replace `settings.json` with the product
   * defaults, including over a corrupt/unreadable file. The damaged backup is
   * kept. This is the only path allowed to replace a corrupt file.
   */
  resetSettings(): Promise<SettingsSaveResult>;
  /** Upsert/clear one durable per-document override. */
  saveDocumentSettings(input: DocumentSettingsSaveInput): Promise<DocumentSettingsSaveResult>;
  setWindowState(state: WindowState): Promise<void>;
  onMenu(handler: (command: MenuCommand) => void): () => void;
  onRequestFlush(handler: () => Promise<FlushResult>): () => void;
  debugSeed(kind: 'demo' | 'performance' | 'performance-1000'): Promise<SeedResult>;
  /** Native image picker; the chosen file is copied into the package assets. */
  importImage(packagePath: string): Promise<ImportImageResult>;
  /** Paste/drop import; bytes are copied into the package assets. */
  importImageBytes(
    packagePath: string,
    input: ImportImageBytesInput,
  ): Promise<ImportImageResult>;
  /**
   * Cross-document clipboard: copy verified image bytes from one package into
   * the destination package. Returns the canonical record to add with
   * `asset.add`; never keeps a reference that resolves only in the source.
   */
  copyImageAsset(
    sourcePackagePath: string,
    targetPackagePath: string,
    assetId: string,
  ): Promise<ImportImageResult>;
  getSystemInfo(): Promise<{ electron: string; chrome: string; appVersion: string; platform: string }>;
  /**
   * Start a Page PDF export job for an open document. The renderer is asked for
   * a current-document snapshot (including unsaved edits); the measured print
   * model and `printToPDF` run in a hidden window in the main process.
   */
  exportPdf(input: ExportPdfInput): Promise<ExportPdfStartResult>;
  /** Poll one export job; `null` when the id is unknown. */
  getExportJob(jobId: string): Promise<ExportJobView | null>;
  /** Request cancellation; true when a running job accepted it. */
  cancelExport(jobId: string): Promise<boolean>;
  /** Session default export folder; the sheet composes the filename. */
  getExportDefaults(): Promise<ExportDefaults>;
  /**
   * Native folder picker for the export destination (directories only). This
   * is the only native surface in the export flow; there is no save dialog.
   */
  chooseExportFolder(input?: { defaultPath?: string | null }): Promise<ChooseExportFolderResult>;
  /** Whether an absolute `.pdf` path already exists (in-sheet overwrite gate). */
  exportPathExists(outputPath: string): Promise<ExportPathStatus>;
  /** Reveal a produced PDF in the OS file manager (non-destructive). */
  revealExport(outputPath: string): Promise<RevealResult>;
  /** Open a produced PDF in the default OS application. */
  openExport(outputPath: string): Promise<RevealResult>;
  /**
   * Answer a main-process snapshot request for an export job. The handler must
   * resolve with the current in-memory document/settings/asset URLs.
   */
  onExportSnapshotRequest(
    handler: (request: ExportSnapshotRequest) => Promise<ExportSnapshotReply>,
  ): () => void;
}
