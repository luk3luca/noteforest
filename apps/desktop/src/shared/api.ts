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
import type { MarkdownFileFingerprint } from './markdown.js';
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

/**
 * Library row kind. `note` is a NoteForest package; `markdown` is a guest
 * `.md` file at the library root. The field is additive: an older row is a
 * note. A Markdown row has no document id, revision, blocks, or chapters.
 */
export type LibraryDocumentKind = 'note' | 'markdown';

export interface DocumentSummary {
  packagePath: string;
  title: string;
  kind?: LibraryDocumentKind;
  status: LibraryDocumentStatus;
  /** Short human reason for a non-ok status; absent for ok rows. */
  reason?: string;
  /**
   * Raw reason a non-ok row carries, for the row's tooltip only. The visible
   * line is `reason`: a core sentence never reaches a list row verbatim
   * (`docs/design/dialogs.md` §3).
   */
  reasonDetails?: string;
  documentId: string | null;
  revision: number | null;
  updatedAt: string;
  /** Always 0 for a Markdown row; the UI never shows a fake note count. */
  blockCount: number;
  /** Always 0 for a Markdown row; the UI never shows a fake note count. */
  chapterCount: number;
}

/**
 * One row of the recursive Library tree (phase 3). The tree is additive: the
 * flat `documents` list keeps every note and Markdown row for reconciliation,
 * counts, and the existing row menus.
 *
 * - `folder`: a directory without `document.json`; it may be empty.
 * - `note`: a note package, including a damaged/missing one.
 * - `markdown`: a `.md` guest file. It has no document id and no block or
 *   chapter count.
 */
export type LibraryTreeNodeKind = 'folder' | 'note' | 'markdown';

export interface LibraryFolderNode {
  kind: 'folder';
  /** Absolute folder path. */
  path: string;
  /** Display name (the folder basename). */
  name: string;
  /** Root-relative path for stable keys and expansion state. */
  relativePath: string;
  children: LibraryTreeNode[];
  /** The OS refused to list this folder; it stays visible as a folder. */
  warning?: string;
}

export interface LibraryDocumentNode {
  kind: 'note' | 'markdown';
  /** Absolute package folder path, or the `.md` file path. */
  path: string;
  name: string;
  relativePath: string;
  summary: DocumentSummary;
}

export type LibraryTreeNode = LibraryFolderNode | LibraryDocumentNode;

/**
 * One opened Markdown guest file. The renderer parses `markdown` with the flat
 * schema; there is no document id, lock, revision, or Page/PDF surface.
 */
export interface MarkdownFileView {
  /** Canonical absolute path; the session/tab key. */
  path: string;
  /** File basename, for example `notes.md`. */
  title: string;
  /** UTF-8 source. In-memory guest content; never a NoteForest document. */
  markdown: string;
  /**
   * Conflict baseline; `null` when the file was not read (above the display
   * cap) and saving is therefore refused.
   */
  base: MarkdownFileFingerprint | null;
  /**
   * The file is above the editable cap and opens read-only. Nothing is
   * written back until the file shrinks below the cap outside this app.
   */
  readOnly: boolean;
  /** Human reason for `readOnly`; shown as a banner. */
  readOnlyReason?: string;
  /** Above the display cap: the body is not read (`markdown` is empty). */
  tooLarge?: boolean;
  /** Present when the file was restored but could not be read. */
  error?: string;
}

/** One dirty Markdown tab reported to the close/quit flow. */
export interface MarkdownPendingFile {
  path: string;
  title: string;
}

export type MarkdownSaveFailureCode =
  | 'conflict'
  | 'missing'
  | 'read-only'
  | 'permission'
  | 'disk-full'
  | 'unknown';

/**
 * One atomic save of a guest file. `base` is the fingerprint the renderer
 * believes is on disk; the main process re-stats and refuses to overwrite a
 * file that changed outside the app unless `overwriteExternal` is explicit.
 */
export interface MarkdownSaveInput {
  path: string;
  markdown: string;
  base: MarkdownFileFingerprint | null;
  overwriteExternal?: boolean;
}

export interface MarkdownSaveSuccess {
  ok: true;
  /** Fingerprint after the save (unchanged fingerprint for a no-op save). */
  base: MarkdownFileFingerprint;
  /** True when the bytes already matched, so the file was not rewritten. */
  unchanged: boolean;
}

export interface MarkdownSaveFailure {
  ok: false;
  code: MarkdownSaveFailureCode;
  /** Short outcome, safe for a toast or a banner line. */
  message: string;
  /** Technical line, shown only in Details (dialogs.md §3.5). */
  details?: string;
  /** Current on-disk fingerprint when it could be read (conflict detail). */
  base?: MarkdownFileFingerprint | null;
}

export type MarkdownSaveResult = MarkdownSaveSuccess | MarkdownSaveFailure;

/** Result of the main-process “save every dirty guest file” request. */
export interface MarkdownFlushResult {
  ok: boolean;
  /** One `title: reason` line per file that could not be saved. */
  failures: string[];
}

export interface MarkdownOpenSuccess {
  ok: true;
  file: MarkdownFileView;
}

export type MarkdownOpenResult =
  | MarkdownOpenSuccess
  | { ok: false; canceled?: boolean; message?: string; details?: string };

export interface MarkdownImageResolution {
  ok: boolean;
  /** Confined `noteforest-md://` URL; absent on failure. */
  url?: string;
  /** Placeholder reason for a remote, unsafe, or missing image. */
  reason?: string;
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
  /** Short reason the package cannot open; never the raw core sentence. */
  reason: string;
  /** The raw reason, shown only under `Details` on the recovery surface. */
  reasonDetails?: string;
  /** Validation issues, when the parser produced them. */
  details: string[];
  warnings: string[];
}

export interface RecentLibraryView {
  path: string;
  name: string;
  /** Parent path, only when two recents share a basename (LD-09). */
  parentPath?: string;
  lastOpenedAt: string;
  missing: boolean;
  active: boolean;
}

export interface LibraryView {
  /** Active library root; an empty string means no library is open. */
  libraryPath: string;
  libraryName: string;
  appSupportPath: string;
  documents: DocumentSummary[];
  /** Recursive folders/notes/Markdown files; the Library sidebar renders this. */
  tree: LibraryTreeNode[];
  recent: RecentDocumentView[];
  /** Recent libraries (global, max 8, newest first). */
  libraries: RecentLibraryView[];
  /** The active library folder is missing; it is never recreated. */
  missing: boolean;
  warnings: string[];
}

export interface LibraryActionSuccess {
  ok: true;
  library: LibraryView;
  /**
   * Session tabs whose missing path was matched by document id during a
   * library open/locate. The renderer reopens them at the new path.
   */
  reconciledTabs?: Array<{ from: string; to: string; documentId: string }>;
}

export interface LibraryActionFailure {
  ok: false;
  canceled?: boolean;
  /** Short outcome, safe for a dialog or toast line. */
  message: string;
  /** Technical line (a path or an OS error), shown only in Details. */
  details?: string;
}

export type LibraryActionResult = LibraryActionSuccess | LibraryActionFailure;

export interface LibraryParentChoice {
  canceled: boolean;
  path?: string;
  message?: string;
}

export interface CreateLibraryInput {
  name: string;
  parentPath: string;
}

/* ------------------------------------------------------------ vault entries */

/** One folder/note/Markdown node in the library tree. */
export type VaultEntryKind = 'folder' | 'note' | 'markdown';

export type VaultFailureCode =
  | 'not-found'
  | 'library-root'
  | 'outside-library'
  | 'exists'
  | 'invalid-name'
  | 'invalid-target'
  | 'locked'
  | 'unsaved'
  | 'unknown';

/** One path change performed by a move; the renderer remaps open tabs. */
export interface VaultMoveView {
  from: string;
  to: string;
  kind: VaultEntryKind;
  documentId: string | null;
}

export interface VaultActionSuccess {
  ok: true;
  library: LibraryView;
  /** Empty for a no-op move; a folder move reports one entry per descendant. */
  moves: VaultMoveView[];
}

export interface VaultActionFailure {
  ok: false;
  code: VaultFailureCode;
  /** Short outcome, safe for a dialog or toast line. */
  message: string;
  /** Technical line (a path or an OS error), shown only in Details. */
  details?: string;
}

export type VaultActionResult = VaultActionSuccess | VaultActionFailure;

export interface CreateVaultFolderInput {
  /** Library root or an existing folder inside it. */
  parentPath: string;
  name: string;
}

export interface MoveVaultEntryInput {
  /** A folder, note package, or `.md` file inside the library. */
  sourcePath: string;
  /** Destination folder: the library root or a folder inside it. */
  targetFolderPath: string;
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

export type SettingsSaveResult =
  | { ok: true }
  | { ok: false; message: string; details?: string };

export interface DocumentSettingsSaveInput {
  /** Canonical document id; null keeps a path-only entry. */
  documentId: string | null;
  packagePath: string;
  /** `null` clears the entry. */
  page: PageSettingsOverride | null;
}

export type DocumentSettingsSaveResult = SettingsSaveResult;

/**
 * One restorable `document-settings.json` backup. The path is opaque to the
 * renderer: the main process chooses the newest valid file, backs up the
 * current map first, and re-validates it before replacing anything.
 */
export interface DocumentSettingsBackupView {
  path: string;
  createdAt: string;
}

/**
 * Explicit document-map recovery (S3-13/S3-3). `entries` is the map the
 * renderer store must now use; `backup` is the newest valid backup after the
 * action, so the Data page can offer Restore without another round trip.
 */
export interface DocumentSettingsRecoverySuccess {
  ok: true;
  entries: DocumentSettingsEntry[];
  /** Copy of the file that was replaced; absent when there was no file. */
  backupPath?: string;
  backup: DocumentSettingsBackupView | null;
}

export interface DocumentSettingsRecoveryFailure {
  ok: false;
  /** Short outcome, safe for the Settings line. */
  message: string;
  /** Technical line (an OS error or a path), shown only in Details. */
  details?: string;
}

export type DocumentSettingsRecoveryResult =
  | DocumentSettingsRecoverySuccess
  | DocumentSettingsRecoveryFailure;

export interface SessionTabState {
  packagePath: string;
  /** Canonical document id, used to reconcile a moved package by id. */
  documentId?: string | null;
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

/**
 * Expanded-sidebar surface. The footer Settings entry is outside all of them.
 * `search` is the find browsing view (phase 6 follow-up); it replaces the
 * Outline while active and remembers the section it came from.
 */
export type SidebarTab = 'library' | 'outline' | 'health' | 'search' | 'breaks';

export interface SessionState {
  tabs: SessionTabState[];
  activeTab: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  collapsedTopics: Record<string, string[]>;
  /** Persisted Library/Outline/Health/Search section; legacy sessions open Library. */
  sidebarTab: SidebarTab;
  /**
   * Expanded Library tree folders, as root-relative paths. Additive: a legacy
   * session opens every folder collapsed. A folder that no longer exists is
   * ignored by the tree.
   */
  expandedLibraryFolders?: string[];
  /**
   * Active library root. `undefined` means a legacy session that never had the
   * field; `null` means the user removed the last library. The two are
   * deliberately distinct so a removed library is not recreated on launch.
   */
  activeLibrary?: string | null;
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
  /** Newest valid map backup, when Restore backup can be offered. */
  documentSettingsBackup: DocumentSettingsBackupView | null;
  openDocuments: OpenDocumentSnapshot[];
  /** Session tabs that are Markdown guest files, re-read from their paths. */
  markdownFiles: MarkdownFileView[];
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
  /** Short outcome, safe for a toast line. */
  message: string;
  /** Technical line (an OS error or a path), shown only in Details. */
  details?: string;
}

export type CreateDocumentResult = CreateDocumentSuccess | CreateDocumentFailure;

/**
 * Optional draft placement. Omitted (`undefined`) or without
 * `targetFolderPath` the draft materializes at the active library root.
 */
export interface CreateDraftInput {
  /**
   * One existing folder inside the active library: the package materializes
   * there instead of the library root. A note package, an asset folder, a
   * Markdown file, a path outside the library, or a missing folder is refused.
   */
  targetFolderPath?: string;
}

/**
 * A draft created in the main process: an in-memory document with a stable
 * `draftId`, a bound library, and no package folder, lock, or recent entry.
 * The renderer mounts `snapshot` under the opaque `draft:<id>` key.
 */
export interface DraftView {
  draftId: string;
  /** Library active at creation; switching libraries never retargets it. */
  libraryPath: string;
  /** Target folder inside the library, or null for the library root. */
  targetFolderPath: string | null;
  /** Snapshot mounted by the renderer; `packagePath` is the draft key. */
  snapshot: OpenDocumentSnapshot;
}

export type CreateDraftResult =
  | { ok: true; draft: DraftView }
  | { ok: false; message: string; details?: string };

export type MaterializeDraftCode = 'library-missing' | 'locked' | 'not-found' | 'unknown';

/**
 * Result of writing a draft's first package. On success the renderer swaps the
 * document key/path without remounting the editor; the document id is unchanged.
 */
export type MaterializeDraftResult =
  | { ok: true; packagePath: string; library: LibraryView }
  | { ok: false; code: MaterializeDraftCode; message: string; details?: string };

export type DraftLibraryResult =
  | { ok: true; libraryPath: string; library: LibraryView }
  | { ok: false; canceled?: boolean; message: string; details?: string };

export type TrashDocumentStatus = 'ok' | 'missing' | 'newer-schema' | 'unreadable';

/**
 * Destructive-action preflight. The confirmation dialog is the explicit
 * authorization; this only reports what the dialog must warn about.
 */
export interface TrashPreflight {
  packagePath: string;
  title: string;
  status: TrashDocumentStatus;
  documentId: string | null;
  /** Another live session holds the writer lock (never broken here). */
  liveLock: boolean;
  lock: LockInfoView | null;
  /** The package is open in this window. */
  open: boolean;
  /** Move to Trash is allowed after confirmation. */
  canTrash: boolean;
  /** Why trashing is refused, when `canTrash` is false. */
  reason?: string;
  /** What the target is: a note package, a plain folder, or a `.md` file. */
  kind?: VaultEntryKind;
  /** Contained entries for a folder target (recursive counts). */
  contained?: { notes: number; folders: number; markdown: number };
}

export type TrashFailureCode =
  | 'not-found'
  | 'library-root'
  | 'locked'
  | 'unsaved'
  | 'trash-failed'
  | 'unknown';

export type TrashDocumentResult =
  | { ok: true; library: LibraryView }
  | { ok: false; code: TrashFailureCode; message: string; details?: string };

export type RemoveMissingDocumentResult =
  | { ok: true; library: LibraryView }
  | { ok: false; message: string; details?: string };

export interface OpenDocumentFailure {
  ok: false;
  /** Short outcome, safe for a toast line. */
  message: string;
  /** Technical line (an OS error or a path), shown only in Details. */
  details?: string;
  packagePath: string;
}

export type OpenDocumentResult = OpenDocumentSnapshot | RecoveryDocumentView | OpenDocumentFailure;

/** Explicit stale-lock takeover: the only path that removes a stale lock. */
export type TakeOverLockResult =
  | { ok: true; snapshot: OpenDocumentSnapshot }
  | {
      ok: false;
      /** Short outcome, safe for the status panel line. */
      message: string;
      /** Technical line (an OS error or a path), shown only in Details. */
      details?: string;
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
  /**
   * The package path when a command against a draft materialized it. The
   * renderer adopts this path without remounting the editor.
   */
  packagePath?: string;
  /** Short outcome, safe for a toast line. */
  message?: string;
  /** Technical line (an OS error or a path), shown only in Details. */
  details?: string;
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
  /** Present when a draft save materialized the package. */
  packagePath?: string;
}

export interface SaveFailure {
  ok: false;
  changed: false;
  revision: number;
  code: SaveFailureCode;
  /** Original `CoreErrorCode`, kept for diagnostics and support. */
  coreCode?: string;
  error: string;
  /**
   * Technical line for `Details` (dialogs.md §3). The damaged-package path puts
   * the `core` parse sentence here so the short recovery line stays in `error`.
   */
  details?: string;
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
  /** Technical line (an OS error or a path), shown only in Details. */
  details?: string;
}

export type SaveCopyResult = SaveCopySuccess | SaveCopyFailure;

export interface ReloadDocumentSuccess {
  ok: true;
  snapshot: OpenDocumentSnapshot;
}

export interface ReloadDocumentFailure {
  ok: false;
  /** Short outcome, safe for a toast line. */
  message: string;
  /** Technical line (an OS error or a path), shown only in Details. */
  details?: string;
}

export type ReloadDocumentResult = ReloadDocumentSuccess | ReloadDocumentFailure;

export interface RevealResult {
  ok: boolean;
  message?: string;
  /** Technical line (an OS error or a path), shown only in Details. */
  details?: string;
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
  /** Short outcome, safe for the dialog line. */
  message: string;
  /** The raw OS error, shown only in Details (D17). */
  details?: string;
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
  /** The raw OS error, shown only in Details when the dialog has one. */
  details?: string;
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
  /**
   * Dirty Markdown guest files at close/quit. They live only in the renderer,
   * so the main process cannot save them itself; the Save/Don't Save/Cancel
   * dialog asks the renderer through `onRequestMarkdownSave`.
   */
  pendingMarkdown?: MarkdownPendingFile[];
}

export type MenuCommand =
  | 'new-document'
  | 'open-document'
  | 'open-markdown'
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

/** Native editing commands used by the editor's custom context menu. */
export type TextEditCommand = 'cut' | 'copy' | 'paste';

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
  /** Technical line (an OS error or a path), shown only in Details. */
  details?: string;
}

export type ImportImageResult = ImportImageSuccess | ImportImageFailure;

/**
 * Asset ids named by this note's retained backups (DR1b).
 *
 * Backups hold `document.json` only, so the unused-image plan keeps an id that
 * any backup still names; restoring that snapshot must never resurrect a record
 * whose bytes were reclaimed.
 */
export interface BackupAssetIdsSuccess {
  ok: true;
  assetIds: string[];
}

export interface BackupAssetIdsFailure {
  ok: false;
  message: string;
  /** Technical line (an OS error or a path), shown only in Details. */
  details?: string;
}

export type BackupAssetIdsResult = BackupAssetIdsSuccess | BackupAssetIdsFailure;

export type TrashUnusedImageFailureCode =
  | 'not-open'
  | 'not-found'
  | 'asset-in-use'
  | 'outside-assets'
  | 'read-only'
  | 'trash-failed';

/**
 * Move one unused image file to the OS Trash, before its record is removed.
 *
 * `trashed: false` means the file was already missing (nothing to move); the
 * caller may still remove the unreferenced record. A failure leaves the file
 * and the record exactly as they were.
 */
export type TrashUnusedImageResult =
  | { ok: true; trashed: boolean }
  | {
      ok: false;
      code: TrashUnusedImageFailureCode;
      message: string;
      /** Technical line (an OS error or a path), shown only in Details. */
      details?: string;
    };

export interface NoteForestApi {
  bootstrap(): Promise<BootstrapResult>;
  /**
   * Cut/Copy/Paste for the renderer-owned editor context menu. The main
   * process runs the native edit command on the focused webContents so rich
   * text and undo keep the platform behavior (and reading the OS clipboard
   * never becomes a renderer permission prompt).
   */
  editTextCommand(command: TextEditCommand): Promise<void>;
  /** Scan the active library, or one explicit root during validation. */
  scanLibrary(root?: string): Promise<LibraryView>;
  createDocument(input: { title?: string }): Promise<CreateDocumentResult>;
  /**
   * Create an in-memory draft bound to the active library. No package folder,
   * lock, or recent entry exists until the first real mutation materializes it.
   * A `targetFolderPath` places that first package inside one library folder;
   * without it the package goes to the library root.
   */
  createDraft(input?: CreateDraftInput): Promise<CreateDraftResult>;
  /** Materialize one draft (idempotent) and return its new package path. */
  materializeDraft(packageKey: string): Promise<MaterializeDraftResult>;
  /** Rebind a draft whose creation library is missing to a chosen library. */
  chooseDraftLibrary(packageKey: string): Promise<DraftLibraryResult>;
  /** Native directory picker; validates, scans, activates, and records recent. */
  openLibrary(): Promise<LibraryActionResult>;
  /** Native parent picker for the New Library modal. */
  chooseLibraryParent(): Promise<LibraryParentChoice>;
  /** Create `<parent>/<name>`, then validate and activate it. */
  createLibrary(input: CreateLibraryInput): Promise<LibraryActionResult>;
  /** Activate a known recent (including a missing one, which shows its state). */
  switchLibrary(libraryPath: string): Promise<LibraryActionResult>;
  /** Recents only: never deletes files. Removing the active library falls back. */
  removeRecentLibrary(libraryPath: string): Promise<LibraryActionResult>;
  /** Native picker; replaces a missing library path and reconciles by document id. */
  locateLibrary(missingPath: string): Promise<LibraryActionResult>;
  /**
   * Force a fresh scan after external changes and reconcile moved packages by
   * document id, so open tabs follow their new paths.
   */
  refreshLibrary(): Promise<LibraryActionResult>;
  /** Reveal a folder, note package, or `.md` file inside the library. */
  revealVaultEntry(targetPath: string): Promise<RevealResult>;
  /** Create one folder inside a library folder (or the root). */
  createVaultFolder(input: CreateVaultFolderInput): Promise<VaultActionResult>;
  /** Rename one library folder in place; descendants are untouched. */
  renameVaultFolder(folderPath: string, name: string): Promise<VaultActionResult>;
  /**
   * Move a folder, note package, or `.md` file into another library folder.
   * The renderer flushes and closes the affected tabs first.
   */
  moveVaultEntry(input: MoveVaultEntryInput): Promise<VaultActionResult>;
  openDocument(packagePath: string): Promise<OpenDocumentResult>;
  /**
   * Native picker for a Markdown guest file, then one read. It never creates a
   * document, lock, or recent package entry.
   */
  openMarkdownFile(): Promise<MarkdownOpenResult>;
  /** Read one known Markdown path (library row, session restore, reopen). */
  readMarkdownFile(path: string): Promise<MarkdownOpenResult>;
  /**
   * Atomically save one Markdown guest file (tmp → rename) with one previous
   * copy in app support. A changed base is a conflict unless `overwriteExternal`
   * is explicit.
   */
  saveMarkdownFile(input: MarkdownSaveInput): Promise<MarkdownSaveResult>;
  /**
   * Resolve a Markdown image relative to its file through the confined
   * `noteforest-md:` protocol. Remote/absolute/traversal sources are refused.
   */
  resolveMarkdownImage(path: string, source: string): Promise<MarkdownImageResolution>;
  /** Reveal the Markdown file itself in the OS file manager. */
  revealMarkdownFile(path: string): Promise<RevealResult>;
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
  /** Read-only preflight for Move to Trash (title/status/lock/open). */
  trashPreflight(packagePath: string): Promise<TrashPreflight>;
  /**
   * Move one package to the OS Trash after the explicit confirmation. The
   * library root itself can never be trashed, and a live lock is refused.
   */
  trashDocument(packagePath: string): Promise<TrashDocumentResult>;
  /** Cleanup only: forget a missing package (recent/settings/session). Never deletes. */
  removeMissingDocument(
    packagePath: string,
    documentId?: string | null,
  ): Promise<RemoveMissingDocumentResult>;
  /** Reveal one known library root (defaults to the active library). */
  revealLibrary(libraryPath?: string): Promise<RevealResult>;
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
  /**
   * Explicit map reset: back up the current `document-settings.json`, then
   * atomically replace it with an empty map. The only path allowed to recover a
   * corrupt/unreadable map; ordinary saves stay refused until it succeeds.
   */
  resetDocumentSettings(): Promise<DocumentSettingsRecoveryResult>;
  /**
   * Restore the newest valid map backup. The current file is backed up first
   * and the backup is validated; an invalid backup never replaces the map.
   */
  restoreDocumentSettingsBackup(): Promise<DocumentSettingsRecoveryResult>;
  setWindowState(state: WindowState): Promise<void>;
  onMenu(handler: (command: MenuCommand) => void): () => void;
  onRequestFlush(handler: () => Promise<FlushResult>): () => void;
  /**
   * Answer a main-process “save dirty guest files” request during the
   * Save/Don't Save/Cancel close flow. Resolve only after every atomic write.
   */
  onRequestMarkdownSave(handler: () => Promise<MarkdownFlushResult>): () => void;
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
  /**
   * Asset ids named by this note's valid backups. Read-only scan of the
   * app-support backup folder; the renderer never reads a backup itself.
   */
  backupAssetIds(packagePath: string): Promise<BackupAssetIdsResult>;
  /**
   * Move one unused image file to the OS Trash (never an unlink) before the
   * renderer removes its record. Re-checks the reference guard and confines the
   * path to the package's `assets/` directory.
   */
  trashUnusedImage(
    packagePath: string,
    assetId: string,
  ): Promise<TrashUnusedImageResult>;
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
