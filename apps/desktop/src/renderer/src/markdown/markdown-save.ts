/**
 * Markdown guest-file save coordinator (renderer).
 *
 * Autosave is a short debounce off the flat editor's `update`, plus `⌘S`.
 * Serialization uses the same deterministic serializer as the parser, and the
 * main process does the atomic write. A save is only cleared when the exact
 * bytes that were sent are still the editor document; an edit that arrives
 * while the write is in flight schedules another save.
 *
 * Conflict/missing rules:
 * - a changed base is never overwritten; the Reload / Overwrite / Cancel dialog
 *   owns the only destructive choice;
 * - a deleted/moved file marks the tab missing and is never recreated;
 * - a read-only (large) file is never written.
 */

import { toast } from 'sonner';
import type {
  MarkdownFlushResult,
  MarkdownSaveResult,
} from '../../../shared/api';
import { markdownEditor } from './markdown-editor-registry';
import { markdownEntry, useMarkdownFiles } from '../state/markdown';
import { useShell } from '../state/shell';
import { FRONTMATTER_RELOAD_META } from './frontmatter-node';
import type { MarkdownDocumentJson } from './markdown-parse';
import { serializeMarkdown } from './markdown-serialize';

/** Documented autosave debounce; `⌘S` writes immediately. */
export const MARKDOWN_AUTOSAVE_DELAY_MS = 700;

export type MarkdownSaveOutcome =
  | { status: 'saved' }
  | { status: 'clean' }
  | { status: 'conflict' }
  | { status: 'missing' }
  | { status: 'blocked'; message: string }
  | { status: 'failed'; message: string };

interface SaveOptions {
  /** `⌘S` and the close/quit Save choice flush immediately. */
  manual?: boolean;
  /** Explicit Overwrite from the conflict dialog (the only destructive path). */
  overwriteExternal?: boolean;
  /** The close/quit flush reports failures instead of opening a dialog. */
  surfaceConflict?: boolean;
}

const timers = new Map<string, number>();
const conflictPaths = new Set<string>();
const chains = new Map<string, Promise<unknown>>();

function serializeCurrent(path: string): string | null {
  const editor = markdownEditor(path);
  if (editor !== null && !editor.isDestroyed) {
    return serializeMarkdown(editor.getJSON() as MarkdownDocumentJson);
  }
  const entry = markdownEntry(path);
  return entry === null ? null : serializeMarkdown(entry.content);
}

function enqueue<T>(path: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(path) ?? Promise.resolve();
  const next = previous.then(task, task);
  chains.set(
    path,
    next.catch(() => undefined),
  );
  return next;
}

export function cancelMarkdownAutosave(path: string): void {
  const timer = timers.get(path);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timers.delete(path);
  }
}

/** Debounced autosave after a real editor change. */
export function scheduleMarkdownAutosave(path: string): void {
  const entry = markdownEntry(path);
  if (entry === null || entry.readOnly || entry.error !== null) return;
  if (conflictPaths.has(path)) return;
  cancelMarkdownAutosave(path);
  const timer = window.setTimeout(() => {
    timers.delete(path);
    void saveMarkdownNow(path, { surfaceConflict: true });
  }, MARKDOWN_AUTOSAVE_DELAY_MS);
  timers.set(path, timer);
}

/** Open the destructive-choice dialog once per conflict. */
function openConflictDialog(path: string): void {
  const current = useShell.getState().dialog;
  if (current !== null && current.kind === 'markdown-conflict' && current.path === path) {
    return;
  }
  useShell.getState().openDialog({ kind: 'markdown-conflict', path });
}

function markMissing(path: string): void {
  const entry = markdownEntry(path);
  if (entry === null) return;
  useMarkdownFiles.getState().markMissing(path);
  // The tab keeps its content and identity; only the indicator changes. No
  // write is attempted, so the file is never silently recreated.
  useShell.getState().openTab(
    {
      packagePath: path,
      tabKey: path,
      title: entry.title,
      kind: 'markdown',
      missing: true,
    },
    { activate: false },
  );
}

function markPresent(path: string): void {
  const entry = markdownEntry(path);
  if (entry === null) return;
  useShell.getState().openTab(
    {
      packagePath: path,
      tabKey: path,
      title: entry.title,
      kind: 'markdown',
    },
    { activate: false },
  );
}

function failureOutcome(path: string, result: Extract<MarkdownSaveResult, { ok: false }>): MarkdownSaveOutcome {
  if (result.code === 'conflict') {
    conflictPaths.add(path);
    useMarkdownFiles.getState().markConflict(path);
    return { status: 'conflict' };
  }
  if (result.code === 'missing') {
    markMissing(path);
    return { status: 'missing' };
  }
  useMarkdownFiles.getState().markSaveError(path, result.message);
  return { status: 'failed', message: result.message };
}

/**
 * Save one guest file now. Re-entrant calls are serialized per path, so a
 * manual `⌘S` during an autosave cannot interleave two writes.
 */
export function saveMarkdownNow(
  path: string,
  options: SaveOptions = {},
): Promise<MarkdownSaveOutcome> {
  return enqueue(path, async () => {
    const entry = markdownEntry(path);
    if (entry === null) return { status: 'failed', message: 'This Markdown file is not open.' };
    if (entry.error !== null) {
      return { status: 'blocked', message: entry.error };
    }
    if (entry.readOnly) {
      return {
        status: 'blocked',
        message: entry.readOnlyReason ?? 'This Markdown file is open read-only.',
      };
    }
    if (!entry.dirty) {
      // A no-op `⌘S` never touches the file. A pending conflict is still
      // surfaced when the user asks to save.
      if (options.manual === true && entry.conflict) {
        openConflictDialog(path);
        return { status: 'conflict' };
      }
      return { status: 'clean' };
    }
    const markdown = serializeCurrent(path);
    if (markdown === null) {
      return { status: 'failed', message: 'The Markdown editor is not available.' };
    }
    useMarkdownFiles.getState().setSaving(path);
    let result: MarkdownSaveResult;
    try {
      result = await window.noteforest.saveMarkdownFile({
        path,
        markdown,
        base: entry.base,
        ...(options.overwriteExternal === true ? { overwriteExternal: true } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useMarkdownFiles.getState().markSaveError(path, message);
      return { status: 'failed', message };
    }
    if (!result.ok) {
      const outcome = failureOutcome(path, result);
      if (outcome.status === 'conflict' && options.surfaceConflict !== false) {
        openConflictDialog(path);
      }
      if (outcome.status === 'missing' && options.surfaceConflict !== false) {
        toast.error('This Markdown file is no longer on disk. Nothing was written.');
      }
      if (outcome.status === 'failed' && options.surfaceConflict !== false) {
        toast.error(outcome.message);
      }
      return outcome;
    }
    conflictPaths.delete(path);
    useMarkdownFiles.getState().markSaved(path, result.base, markdown);
    markPresent(path);
    // An edit that arrived while the IPC write was in flight is newer than the
    // saved bytes: keep the tab dirty and schedule the next autosave.
    const latest = serializeCurrent(path);
    if (latest !== null && latest !== markdown) {
      useMarkdownFiles.getState().setDirty(path, true);
      scheduleMarkdownAutosave(path);
    }
    return { status: 'saved' };
  });
}

/** Save every dirty guest file for the close/quit Save choice. */
export async function flushMarkdownFiles(): Promise<MarkdownFlushResult> {
  const dirty = Object.values(useMarkdownFiles.getState().files).filter(
    (entry) => entry.dirty,
  );
  const failures: string[] = [];
  for (const entry of dirty) {
    cancelMarkdownAutosave(entry.path);
    const outcome = await saveMarkdownNow(entry.path, {
      manual: true,
      surfaceConflict: false,
    });
    if (outcome.status === 'saved' || outcome.status === 'clean') continue;
    if (outcome.status === 'conflict') {
      failures.push(`${entry.title}: the file changed outside NoteForest`);
      continue;
    }
    if (outcome.status === 'missing') {
      failures.push(`${entry.title}: the file is no longer on disk`);
      continue;
    }
    failures.push(`${entry.title}: ${outcome.message}`);
  }
  return { ok: failures.length === 0, failures };
}

/**
 * Reload from disk after the explicit conflict choice. The local edits are
 * discarded (the dialog says so); the conflict flag and dirty state clear.
 */
export async function reloadMarkdownFromDisk(path: string): Promise<MarkdownSaveOutcome> {
  const result = await window.noteforest.readMarkdownFile(path);
  if (!result.ok) {
    markMissing(path);
    const message = result.message ?? 'Could not reload the Markdown file.';
    useMarkdownFiles.getState().markSaveError(path, message);
    return { status: 'failed', message };
  }
  conflictPaths.delete(path);
  cancelMarkdownAutosave(path);
  useMarkdownFiles.getState().replaceFromDisk(result.file);
  const editor = markdownEditor(path);
  const entry = markdownEntry(path);
  if (editor !== null && !editor.isDestroyed && entry !== null) {
    // The frontmatter guard rejects user edits that remove the prefix; the
    // explicit Reload choice is allowed to replace the whole document.
    const next = editor.schema.nodeFromJSON(entry.content);
    const transaction = editor.state.tr.replaceWith(
      0,
      editor.state.doc.content.size,
      next.content,
    );
    transaction.setMeta(FRONTMATTER_RELOAD_META, true);
    editor.view.dispatch(transaction);
    // The dispatch is a real transaction; it must not leave the tab dirty or
    // schedule an autosave of bytes we just read from disk.
    useMarkdownFiles.getState().setDirty(path, false);
    cancelMarkdownAutosave(path);
  }
  markPresent(path);
  return { status: 'clean' };
}

/** Explicit Overwrite after the external-change dialog. */
export function overwriteMarkdownFile(path: string): Promise<MarkdownSaveOutcome> {
  return saveMarkdownNow(path, {
    manual: true,
    overwriteExternal: true,
    surfaceConflict: false,
  });
}
