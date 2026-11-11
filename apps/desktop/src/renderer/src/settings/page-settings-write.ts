/**
 * Ordering guard for every Page write that can re-paginate.
 *
 * The Page Edit overlay owns an unsaved ProseMirror buffer. Any geometry,
 * density, preset, reset, or "Use global" write must commit that block first;
 * a rejected commit must block the settings write entirely. The commit and
 * flush functions are injected so this ordering is unit-testable without a
 * renderer or a document.
 *
 * UI Sentinel F2: the write is bound to a target captured when the edit
 * started. `targetGone` re-checks that identity before the commit and again
 * after it (a document can close while the commit awaits), and `apply` may
 * return `false` when the target disappeared between those checks. A skipped
 * write never flushes and never reports `saved`.
 */

export type PageSettingsWriteOutcome =
  | 'saved'
  | 'commit-error'
  | 'write-error'
  | 'target-gone';

export interface PageSettingsWriteInput {
  /** Open document that may own a Page Edit overlay; null when none is open. */
  packagePath: string | null;
  commit: (packagePath: string) => Promise<boolean>;
  /** Returns false when the captured target is gone and nothing was written. */
  apply: () => void | boolean;
  flush: () => Promise<{ ok: boolean; message?: string }>;
  /** True when the captured write target is no longer writable. */
  targetGone?: () => boolean;
}

export async function commitThenWritePageSettings(
  input: PageSettingsWriteInput,
): Promise<PageSettingsWriteOutcome> {
  if (input.targetGone?.() === true) return 'target-gone';
  if (input.packagePath !== null) {
    const committed = await input.commit(input.packagePath);
    if (!committed) return 'commit-error';
  }
  // The document may have closed while the commit awaited; re-check before the
  // store write so a dropped target is visible as "not saved", not 'saved'.
  if (input.targetGone?.() === true) return 'target-gone';
  if (input.apply() === false) return 'target-gone';
  const result = await input.flush();
  return result.ok ? 'saved' : 'write-error';
}
