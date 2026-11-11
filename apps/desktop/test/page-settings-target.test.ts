import { describe, expect, it } from 'vitest';
import {
  capturePageSettingsTarget,
  pageSettingsTargetIsGone,
  PAGE_SETTINGS_TARGET_CLOSED_MESSAGE,
  type PageSettingsWriteTarget,
} from '../src/renderer/src/settings/page-settings-target';

/**
 * UI Sentinel F2: a Page settings write is bound to the identity captured when
 * the edit starts. These tests pin the identity snapshot and the "target is
 * gone" rule that keeps a closed document from being replaced by whichever tab
 * is active when the debounce resolves.
 */
describe('Page settings write target', () => {
  it('captures the layer and document identity at the moment the edit starts', () => {
    const target = capturePageSettingsTarget('document', '/lib/doc-a', 'doc-a');
    expect(target).toEqual({
      scope: 'document',
      packagePath: '/lib/doc-a',
      documentId: 'doc-a',
    });
  });

  it('keeps the captured identity when the live view later moves to another document', () => {
    const captured = capturePageSettingsTarget('document', '/lib/doc-a', 'doc-a');
    // The Settings view now points at another document; the captured target is
    // a value snapshot and does not follow it.
    const later = capturePageSettingsTarget('document', '/lib/doc-b', 'doc-b');
    expect(captured).toEqual({
      scope: 'document',
      packagePath: '/lib/doc-a',
      documentId: 'doc-a',
    });
    expect(later.packagePath).toBe('/lib/doc-b');
    expect(captured.packagePath).toBe('/lib/doc-a');
  });

  it('treats a document target as gone when no document was open', () => {
    expect(
      pageSettingsTargetIsGone(
        capturePageSettingsTarget('document', null, null),
        () => true,
      ),
    ).toBe(true);
  });

  it('treats a document target as gone when its document is no longer open', () => {
    const target = capturePageSettingsTarget('document', '/lib/doc-b', 'doc-b');
    expect(pageSettingsTargetIsGone(target, (path) => path !== '/lib/doc-b')).toBe(true);
    expect(pageSettingsTargetIsGone(target, () => true)).toBe(false);
  });

  it('never treats a global target as gone', () => {
    const target: PageSettingsWriteTarget = capturePageSettingsTarget('global', null, null);
    expect(pageSettingsTargetIsGone(target, () => false)).toBe(false);
    expect(
      pageSettingsTargetIsGone(capturePageSettingsTarget('global', '/lib/doc-a', 'doc-a'), () => false),
    ).toBe(false);
  });

  it('has a visible message for a skipped write', () => {
    expect(PAGE_SETTINGS_TARGET_CLOSED_MESSAGE).toMatch(/nothing was written/i);
  });
});
