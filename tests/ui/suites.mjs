/**
 * UI suite list and surface groups.
 *
 * Pure data with no side effects: imported by `run.mjs` to schedule the pool and
 * by `apps/desktop/test/ui-suite-list.test.ts` to prove the list equals
 * `tests/ui/*.test.mjs` exactly. A new suite must be added here or the meta-test
 * fails; a removed suite must be removed here too.
 */

export const FILES = [
  'm2-view.test.mjs',
  'm2-shell.test.mjs',
  'backspace-boundary.test.mjs',
  'special-text.test.mjs',
  'v0-shell-frame.test.mjs',
  'ui-dialog-frame.test.mjs',
  'm3-anchor-callout-layout.test.mjs',
  'm3-anchor-callout-stacking.test.mjs',
  'm3-anchor-callout-placement-undo.test.mjs',
  'm3-anchor-outline.test.mjs',
  'm3-formula-anchor.test.mjs',
  'm3-formula-term.test.mjs',
  'm3-formula-term-geometry.test.mjs',
  'm3-code-anchor.test.mjs',
  'm3-reference.test.mjs',
  'm3-repair.test.mjs',
  'm3f1-split-merge.test.mjs',
  'm3h3-live-health.test.mjs',
  'm3h5-leaf-delete.test.mjs',
  'document-health.test.mjs',
  'm3c3b1-image.test.mjs',
  'm3c3b2-image-anchors.test.mjs',
  'm3c3b3-image-integrity.test.mjs',
  'm3c3b4-image-lifecycle.test.mjs',
  'm4b1-page-view.test.mjs',
  'm4b1a2-read-mode-gating.test.mjs',
  'm4b1b1-page-edit-overlay.test.mjs',
  'r1b-page-settings.test.mjs',
  'r2a-page-arrows-cleanup.test.mjs',
  'r2b-page-packing.test.mjs',
  'r2e-page-tree.test.mjs',
  'r2d-page-edge-style.test.mjs',
  'r2f-page-edge-topology.test.mjs',
  'r2g-page-trunk-continuity.test.mjs',
  'r2i-page-subtree-wrap.test.mjs',
  'r2j-page-callout-modes.test.mjs',
  'm4c1-print-compositor.test.mjs',
  'm4c2-pdf-export.test.mjs',
  'm4c3-pdf-gate.test.mjs',
  'm4c3-packaged-export.test.mjs',
  'm4d2-export-ui.test.mjs',
  'm4d1-page-density.test.mjs',
  'm4e1-settings-platform.test.mjs',
  'ui-batch-a.test.mjs',
  'ui-batch-b.test.mjs',
  'ui-settings-advanced.test.mjs',
  'r6-continuous-settings.test.mjs',
  'ui-editor-shortcuts.test.mjs',
  'ui-batch-v.test.mjs',
  'ui-overlay-command-gate.test.mjs',
  'ui-settings-recovery.test.mjs',
  'ui-appearance-v3.test.mjs',
  'ui-document-status.test.mjs',
  'editor-surfaces.test.mjs',
  'library-surface.test.mjs',
  'document-lifecycle.test.mjs',
  'settings-shell-layout.test.mjs',
  'list-fixes.test.mjs',
  'editor-appearance.test.mjs',
  'markdown-file-view.test.mjs',
  'vault-library.test.mjs',
  'find-bar.test.mjs',
];

/**
 * Suites that launch enough Electron apps (six full app lifecycles, real OS
 * Trash) to be unreliable in the parallel pool. They run after the pool with
 * concurrency 1: ~15s, instead of a 600s pool timeout.
 */
export const SERIAL_FILES = new Set([
  'document-lifecycle.test.mjs',
  // Real OS Trash moves plus several app lifecycles: keep it off the pool.
  'vault-library.test.mjs',
]);

function unique(values) {
  return [...new Set(values)];
}

export const GROUPS = {
  shell: [
    'm2-view.test.mjs',
    'm2-shell.test.mjs',
    'backspace-boundary.test.mjs',
    'special-text.test.mjs',
    'v0-shell-frame.test.mjs',
    'ui-dialog-frame.test.mjs',
    'ui-batch-a.test.mjs',
    'ui-batch-v.test.mjs',
    'ui-overlay-command-gate.test.mjs',
    'ui-appearance-v3.test.mjs',
    'ui-document-status.test.mjs',
    'editor-surfaces.test.mjs',
    'library-surface.test.mjs',
    'document-lifecycle.test.mjs',
    'settings-shell-layout.test.mjs',
    'list-fixes.test.mjs',
    'markdown-file-view.test.mjs',
    'vault-library.test.mjs',
    'find-bar.test.mjs',
  ],
  settings: [
    'm4e1-settings-platform.test.mjs',
    'm4d1-page-density.test.mjs',
    'r1b-page-settings.test.mjs',
    'ui-batch-b.test.mjs',
    'ui-settings-advanced.test.mjs',
    'r6-continuous-settings.test.mjs',
    'ui-editor-shortcuts.test.mjs',
    'ui-settings-recovery.test.mjs',
    'ui-overlay-command-gate.test.mjs',
    'ui-appearance-v3.test.mjs',
    'ui-document-status.test.mjs',
    'settings-shell-layout.test.mjs',
  ],
  anchors: [
    'm3-anchor-callout-layout.test.mjs',
    'm3-anchor-callout-stacking.test.mjs',
    'm3-anchor-callout-placement-undo.test.mjs',
    'm3-anchor-outline.test.mjs',
    'm3-formula-anchor.test.mjs',
    'm3-formula-term.test.mjs',
    'm3-formula-term-geometry.test.mjs',
    'm3-code-anchor.test.mjs',
    'm3-reference.test.mjs',
    'm3-repair.test.mjs',
    'm3f1-split-merge.test.mjs',
    'm3h3-live-health.test.mjs',
    'm3h5-leaf-delete.test.mjs',
    'document-health.test.mjs',
  ],
  images: [
    'm3c3b1-image.test.mjs',
    'm3c3b2-image-anchors.test.mjs',
    'm3c3b3-image-integrity.test.mjs',
    'm3c3b4-image-lifecycle.test.mjs',
  ],
  markdown: ['markdown-file-view.test.mjs'],
  page: [
    'm4b1-page-view.test.mjs',
    'm4b1a2-read-mode-gating.test.mjs',
    'm4b1b1-page-edit-overlay.test.mjs',
    'r2a-page-arrows-cleanup.test.mjs',
    'r2b-page-packing.test.mjs',
    'r2e-page-tree.test.mjs',
    'r2d-page-edge-style.test.mjs',
    'r2f-page-edge-topology.test.mjs',
    'r2g-page-trunk-continuity.test.mjs',
    'r2i-page-subtree-wrap.test.mjs',
    'r2j-page-callout-modes.test.mjs',
    'm4c1-print-compositor.test.mjs',
    'm4c2-pdf-export.test.mjs',
    'm4c3-pdf-gate.test.mjs',
    'm4c3-packaged-export.test.mjs',
    'm4d2-export-ui.test.mjs',
    'editor-appearance.test.mjs',
    // The bar spans both surfaces: it floats in Continuous and rings a block
    // on the Page, so the Page group runs it too.
    'find-bar.test.mjs',
  ],
};

GROUPS.all = FILES;
GROUPS.core = unique([...GROUPS.shell, ...GROUPS.settings]);

/**
 * Explicit timeout reason. A killed child reports `signal SIGKILL`, which says
 * nothing about why; the gate should say the suite timed out.
 */
export function formatTimeoutReason(timeoutMs) {
  const seconds = timeoutMs / 1000;
  return `timed out after ${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`;
}

/**
 * One summary line for a suite result. Pure: the runner passes the child's
 * exit code, signal, timeout flag, and duration.
 */
export function formatSuiteResult(result) {
  const seconds = (result.durationMs / 1000).toFixed(1);
  if (result.timedOut === true) {
    return `FAIL ${result.file} (${seconds}s, ${formatTimeoutReason(result.timeoutMs)})`;
  }
  if (result.code === 0) return `PASS ${result.file} (${seconds}s)`;
  const reason =
    result.signal === undefined || result.signal === null
      ? `exit ${result.code}`
      : `signal ${result.signal}`;
  return `FAIL ${result.file} (${seconds}s, ${reason})`;
}
