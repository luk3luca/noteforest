import { describe, expect, it } from 'vitest';
import {
  capturePageSettingsTarget,
  pageSettingsTargetIsGone,
  resolveMaterializedPageSettingsTarget,
  runImmediatePageSettingsWrite,
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

/**
 * UI Sentinel F2 correction: an immediate write (size, orientation, preset,
 * Use global, reset) captures its target **before** the pending-edit flush. The
 * flush can await a Page Edit commit and settings IPC; capturing after it would
 * retarget the write when a tab/document change happens in that window.
 */
describe('Immediate Page settings write target', () => {
  it('captures before the flush and executes the captured target unchanged', async () => {
    let current = capturePageSettingsTarget('document', '/lib/doc-b', 'doc-b');
    const executed: PageSettingsWriteTarget[] = [];
    const outcome = await runImmediatePageSettingsWrite({
      captureTarget: () => current,
      flushPending: async () => {
        // The flush switches the Settings view to another document (for
        // example a tab change during the awaited commit/IPC).
        current = capturePageSettingsTarget('document', '/lib/doc-a', 'doc-a');
        return true;
      },
      execute: async (target) => {
        executed.push(target);
        return true;
      },
    });
    expect(outcome).toBe(true);
    expect(executed).toEqual([
      { scope: 'document', packagePath: '/lib/doc-b', documentId: 'doc-b' },
    ]);
    expect(executed[0]?.packagePath).toBe('/lib/doc-b');
  });

  it('does not execute when the flush blocks the write', async () => {
    let executed = false;
    const outcome = await runImmediatePageSettingsWrite({
      captureTarget: () => capturePageSettingsTarget('global', '/lib/doc-b', 'doc-b'),
      flushPending: async () => false,
      execute: async () => {
        executed = true;
        return true;
      },
    });
    expect(outcome).toBe(false);
    expect(executed).toBe(false);
  });

  it('returns the execution outcome', async () => {
    const outcome = await runImmediatePageSettingsWrite({
      captureTarget: () => capturePageSettingsTarget('document', '/lib/doc-b', 'doc-b'),
      flushPending: async () => true,
      execute: async () => false,
    });
    expect(outcome).toBe(false);
  });
});

/**
 * F4 residual (R2): a pending debounced write can materialize the draft during
 * the pre-execute flush. The captured `draft:<id>` key is gone, but the same
 * document is open under its package path with the same canonical id.
 */
describe('Materialized draft target resolution', () => {
  const draft = capturePageSettingsTarget('document', 'draft:doc-a', 'doc-a');

  function lookup(overrides: {
    draftOpen?: boolean;
    byId?: { packagePath: string; isDraft: boolean } | null;
    packagePath?: string;
  } = {}) {
    const packagePath = overrides.packagePath ?? '/library/note';
    return {
      forPath: (path: string) =>
        path === 'draft:doc-a' && overrides.draftOpen === true
          ? { packagePath: 'draft:doc-a', isDraft: true }
          : null,
      forDocumentId: (id: string) =>
        id === 'doc-a'
          ? (overrides.byId === undefined
              ? { packagePath, isDraft: false }
              : overrides.byId)
          : null,
    };
  }

  it('retargets a captured draft to the open package of the same document', () => {
    expect(resolveMaterializedPageSettingsTarget(draft, lookup())).toEqual({
      scope: 'document',
      packagePath: '/library/note',
      documentId: 'doc-a',
    });
  });

  it('leaves the target alone while the draft runtime is still open', () => {
    expect(
      resolveMaterializedPageSettingsTarget(draft, lookup({ draftOpen: true })),
    ).toBeNull();
  });

  it('never retargets a captured package path that closed (F2)', () => {
    const captured = capturePageSettingsTarget('document', '/library/closed', 'doc-a');
    expect(resolveMaterializedPageSettingsTarget(captured, lookup())).toBeNull();
  });

  it('does not guess between ambiguous same-id runtimes or a still-draft runtime', () => {
    expect(
      resolveMaterializedPageSettingsTarget(draft, lookup({ byId: null })),
    ).toBeNull();
    expect(
      resolveMaterializedPageSettingsTarget(
        draft,
        lookup({ byId: { packagePath: '/library/note', isDraft: true } }),
      ),
    ).toBeNull();
  });

  it('never retargets a global target', () => {
    expect(
      resolveMaterializedPageSettingsTarget(
        capturePageSettingsTarget('global', 'draft:doc-a', 'doc-a'),
        lookup(),
      ),
    ).toBeNull();
  });
});
