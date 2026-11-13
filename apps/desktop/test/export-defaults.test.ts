import { describe, expect, it } from 'vitest';
import { resolveExportDefaultFolder } from '../src/shared/export';

/**
 * R4: the global `export.folder` setting is the single source of truth for the
 * Export sheet default. `null` means the OS Documents folder; a custom folder
 * is used verbatim and is never created or replaced here.
 */
describe('export default folder resolution', () => {
  it('uses the OS Documents folder when the setting is null or missing', () => {
    const documents = '/Users/luca/Documents';
    expect(resolveExportDefaultFolder(null, documents)).toBe(documents);
    expect(resolveExportDefaultFolder(undefined, documents)).toBe(documents);
  });

  it('uses the saved custom folder verbatim', () => {
    expect(resolveExportDefaultFolder('/Volumes/Study/Exports', '/Users/luca/Documents')).toBe(
      '/Volumes/Study/Exports',
    );
  });
});
