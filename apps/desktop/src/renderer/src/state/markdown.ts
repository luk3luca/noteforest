/**
 * Markdown guest-file store.
 *
 * A `.md` tab is not a `DocumentRuntime`: no canonical document, lock,
 * revision, save coordinator, Page settings, anchors, or branches. The store
 * owns the parsed content, the explicit dirty state, the conflict fingerprint
 * recorded on open/after each save, and the M2 save/conflict/missing flags.
 */

import { create } from 'zustand';
import type { MarkdownFileView, MarkdownPendingFile } from '../../../shared/api';
import type { MarkdownFileFingerprint } from '../../../shared/markdown';
import {
  parseMarkdown,
  type MarkdownDocumentJson,
} from '../markdown/markdown-parse';

export interface MarkdownFileEntry {
  path: string;
  title: string;
  /** Last source that was read or written; never a NoteForest document. */
  markdown: string;
  /** Parsed flat content used to mount the editor. */
  content: MarkdownDocumentJson;
  /** True after a real editor document change not yet written. */
  dirty: boolean;
  /** Non-null when the session restored a path that could not be read. */
  error: string | null;
  /** Conflict baseline recorded on open and after every successful save. */
  base: MarkdownFileFingerprint | null;
  /** Above the editable cap; the surface is read-only with a banner. */
  readOnly: boolean;
  /** Human reason for `readOnly` or `tooLarge`. */
  readOnlyReason: string | null;
  /** Above the display cap: the body was not read. */
  tooLarge: boolean;
  /** The file was deleted/moved outside the app; it is never recreated. */
  missing: boolean;
  /** An atomic save is in flight. */
  saving: boolean;
  /** Last save failure message; cleared by the next success. */
  saveError: string | null;
  /** An external change blocked the last save (Reload/Overwrite/Cancel). */
  conflict: boolean;
  /** Time of the last successful save, for the status line. */
  lastSavedAt: number | null;
}

interface MarkdownFilesState {
  files: Record<string, MarkdownFileEntry>;
  openFile: (file: MarkdownFileView) => void;
  closeFile: (path: string) => void;
  setDirty: (path: string, dirty: boolean) => void;
  setSaving: (path: string) => void;
  markSaved: (path: string, base: MarkdownFileFingerprint, markdown?: string) => void;
  markSaveError: (path: string, message: string) => void;
  markConflict: (path: string) => void;
  clearConflict: (path: string) => void;
  markMissing: (path: string) => void;
  /** Reload from disk: replace content, base, and every file-state flag. */
  replaceFromDisk: (file: MarkdownFileView) => void;
}

function entryFromView(file: MarkdownFileView): MarkdownFileEntry {
  return {
    path: file.path,
    title: file.title,
    markdown: file.markdown,
    content: parseMarkdown(file.markdown),
    dirty: false,
    error: file.error ?? null,
    base: file.base,
    readOnly: file.readOnly === true,
    readOnlyReason: file.readOnlyReason ?? null,
    tooLarge: file.tooLarge === true,
    missing: false,
    saving: false,
    saveError: null,
    conflict: false,
    lastSavedAt: null,
  };
}

function update(
  state: MarkdownFilesState,
  path: string,
  change: (entry: MarkdownFileEntry) => MarkdownFileEntry,
): Pick<MarkdownFilesState, 'files'> {
  const entry = state.files[path];
  if (entry === undefined) return state;
  const next = change(entry);
  if (next === entry) return state;
  return { files: { ...state.files, [path]: next } };
}

export const useMarkdownFiles = create<MarkdownFilesState>((set) => ({
  files: {},
  openFile: (file) =>
    set((state) => {
      // Re-opening an already open file never discards in-memory edits.
      if (state.files[file.path] !== undefined) return state;
      return { files: { ...state.files, [file.path]: entryFromView(file) } };
    }),
  closeFile: (path) =>
    set((state) => {
      if (state.files[path] === undefined) return state;
      const files = { ...state.files };
      delete files[path];
      return { files };
    }),
  setDirty: (path, dirty) =>
    set((state) =>
      update(state, path, (entry) =>
        entry.dirty === dirty ? entry : { ...entry, dirty },
      ),
    ),
  setSaving: (path) =>
    set((state) =>
      update(state, path, (entry) =>
        entry.saving ? entry : { ...entry, saving: true, saveError: null },
      ),
    ),
  markSaved: (path, base, markdown) =>
    set((state) =>
      update(state, path, (entry) => ({
        ...entry,
        ...(markdown === undefined ? {} : { markdown }),
        base,
        dirty: false,
        saving: false,
        saveError: null,
        conflict: false,
        missing: false,
        lastSavedAt: Date.now(),
      })),
    ),
  markSaveError: (path, message) =>
    set((state) =>
      update(state, path, (entry) => ({
        ...entry,
        saving: false,
        saveError: message,
      })),
    ),
  markConflict: (path) =>
    set((state) =>
      update(state, path, (entry) => ({
        ...entry,
        saving: false,
        conflict: true,
        saveError: null,
      })),
    ),
  clearConflict: (path) =>
    set((state) =>
      update(state, path, (entry) =>
        entry.conflict ? { ...entry, conflict: false } : entry,
      ),
    ),
  markMissing: (path) =>
    set((state) =>
      update(state, path, (entry) =>
        entry.missing ? entry : { ...entry, missing: true, saving: false },
      ),
    ),
  replaceFromDisk: (file) =>
    set((state) => {
      if (state.files[file.path] === undefined) return state;
      const next = entryFromView(file);
      // Keep the tab/session state that is not file data.
      const previous = state.files[file.path];
      return {
        files: {
          ...state.files,
          [file.path]: {
            ...next,
            title: previous?.title ?? next.title,
            lastSavedAt: previous?.lastSavedAt ?? null,
          },
        },
      };
    }),
}));

export function markdownEntry(path: string | null | undefined): MarkdownFileEntry | null {
  if (path === null || path === undefined) return null;
  return useMarkdownFiles.getState().files[path] ?? null;
}

/** Reactive selector for one Markdown path. */
export function useMarkdownEntry(
  path: string | null | undefined,
): MarkdownFileEntry | null {
  return useMarkdownFiles((state) =>
    path === null || path === undefined ? null : state.files[path] ?? null,
  );
}

/** Reactive dirty flag for the tab strip and window title. */
export function useAnyMarkdownDirty(): boolean {
  return useMarkdownFiles((state) =>
    Object.values(state.files).some((entry) => entry.dirty),
  );
}

/** Dirty guest files at close/quit; the renderer saves them for the dialog. */
export function dirtyMarkdownFiles(): MarkdownPendingFile[] {
  return Object.values(useMarkdownFiles.getState().files)
    .filter((entry) => entry.dirty)
    .map((entry) => ({ path: entry.path, title: entry.title }));
}
