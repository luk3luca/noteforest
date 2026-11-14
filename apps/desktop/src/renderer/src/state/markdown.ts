/**
 * Markdown guest-file store.
 *
 * A `.md` tab is not a `DocumentRuntime`: no canonical document, lock,
 * revision, save coordinator, Page settings, anchors, or branches. M1 keeps the
 * parsed content and the dirty flag in memory; M2 will attach atomic save and
 * conflict checks to this same explicit dirty state.
 */

import { create } from 'zustand';
import type { MarkdownFileView } from '../../../shared/api';
import {
  parseMarkdown,
  type MarkdownDocumentJson,
} from '../markdown/markdown-parse';

export interface MarkdownFileEntry {
  path: string;
  title: string;
  /** Original UTF-8 source at open; never written back in M1. */
  markdown: string;
  /** Parsed flat content used to mount the editor. */
  content: MarkdownDocumentJson;
  /** True after a real editor document change; the tab dot/status use it. */
  dirty: boolean;
  /** Non-null when the session restored a path that could not be read. */
  error: string | null;
}

interface MarkdownFilesState {
  files: Record<string, MarkdownFileEntry>;
  openFile: (file: MarkdownFileView) => void;
  closeFile: (path: string) => void;
  setDirty: (path: string, dirty: boolean) => void;
}

export const useMarkdownFiles = create<MarkdownFilesState>((set) => ({
  files: {},
  openFile: (file) =>
    set((state) => {
      // Re-opening an already open file never discards in-memory edits.
      if (state.files[file.path] !== undefined) return state;
      const entry: MarkdownFileEntry = {
        path: file.path,
        title: file.title,
        markdown: file.markdown,
        content: parseMarkdown(file.markdown),
        dirty: false,
        error: file.error ?? null,
      };
      return { files: { ...state.files, [file.path]: entry } };
    }),
  closeFile: (path) =>
    set((state) => {
      if (state.files[path] === undefined) return state;
      const files = { ...state.files };
      delete files[path];
      return { files };
    }),
  setDirty: (path, dirty) =>
    set((state) => {
      const entry = state.files[path];
      if (entry === undefined || entry.dirty === dirty) return state;
      return { files: { ...state.files, [path]: { ...entry, dirty } } };
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
