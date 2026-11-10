/**
 * Ordering guard for every Page write that can re-paginate.
 *
 * The Page Edit overlay owns an unsaved ProseMirror buffer. Any geometry,
 * density, preset, reset, or "Use global" write must commit that block first;
 * a rejected commit must block the settings write entirely. The commit and
 * flush functions are injected so this ordering is unit-testable without a
 * renderer or a document.
 */

export type PageSettingsWriteOutcome = 'saved' | 'commit-error' | 'write-error';

export interface PageSettingsWriteInput {
  /** Open document that may own a Page Edit overlay; null when none is open. */
  packagePath: string | null;
  commit: (packagePath: string) => Promise<boolean>;
  apply: () => void;
  flush: () => Promise<{ ok: boolean; message?: string }>;
}

export async function commitThenWritePageSettings(
  input: PageSettingsWriteInput,
): Promise<PageSettingsWriteOutcome> {
  if (input.packagePath !== null) {
    const committed = await input.commit(input.packagePath);
    if (!committed) return 'commit-error';
  }
  input.apply();
  const result = await input.flush();
  return result.ok ? 'saved' : 'write-error';
}
