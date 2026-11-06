import { describe, expect, it } from 'vitest';
import { resolvePackageAssetPath } from '../src/main/library.js';

const PACKAGE = '/library/note';
const ASSETS = '/library/note/assets';

describe('package asset path resolution', () => {
  it('accepts relative paths inside the package assets directory', () => {
    expect(resolvePackageAssetPath(PACKAGE, ASSETS, 'assets/forest.png')).toBe(
      '/library/note/assets/forest.png',
    );
    expect(resolvePackageAssetPath(PACKAGE, ASSETS, 'assets/2026/forest.png')).toBe(
      '/library/note/assets/2026/forest.png',
    );
  });

  it('rejects absolute, traversal, remote, and non-assets paths', () => {
    for (const candidate of [
      '/etc/passwd',
      '../outside.png',
      'assets/../../outside.png',
      'documents/forest.png',
      'https://example.com/forest.png',
      'assets',
      '',
      42,
      null,
    ]) {
      expect(resolvePackageAssetPath(PACKAGE, ASSETS, candidate)).toBeNull();
    }
  });
});
