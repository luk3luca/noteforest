import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// Plain ES module shared with tests/ui/run.mjs (no side effects).
import {
  FILES,
  formatSuiteResult,
  formatTimeoutReason,
  GROUPS,
} from '../../../tests/ui/suites.mjs';

const uiDirectory = resolve(import.meta.dirname, '../../../tests/ui');

async function suiteFilesOnDisk(): Promise<string[]> {
  const entries = await readdir(uiDirectory);
  return entries.filter((name) => name.endsWith('.test.mjs')).sort();
}

async function suiteSource(name: string): Promise<string> {
  return readFile(resolve(uiDirectory, name), 'utf8');
}

/**
 * UI Sentinel F7: the runner list is data with a meta-test, so a new suite can
 * never be added/removed while silently never running. F4: evidence directories
 * are per suite, so a parallel run cannot delete or overwrite another suite's
 * screenshots.
 */
describe('UI suite list', () => {
  it('equals tests/ui/*.test.mjs exactly', async () => {
    const onDisk = await suiteFilesOnDisk();
    expect([...FILES].sort()).toEqual(onDisk);
  });

  it('lists no duplicates and has no group entry outside the list', () => {
    expect(new Set(FILES).size).toBe(FILES.length);
    expect(GROUPS.all).toEqual(FILES);
    for (const [group, files] of Object.entries(GROUPS)) {
      for (const file of files) {
        expect(FILES, `${group} references a listed suite`).toContain(file);
      }
    }
  });

  it('keeps one evidence directory per suite and no cross-suite delete', async () => {
    const owners = {
      'ui-batch-a.test.mjs': 'ui-batch-a',
      'm4e1-settings-platform.test.mjs': 'm4e1-settings',
      'm4d1-page-density.test.mjs': 'm4d1-page-density',
      'm4d2-export-ui.test.mjs': 'm4d2-export-ui',
      'ui-editor-shortcuts.test.mjs': 'ui-editor-shortcuts',
    } as const;
    const directories = Object.values(owners);
    expect(new Set(directories).size).toBe(directories.length);
    for (const [file, directory] of Object.entries(owners)) {
      const source = await suiteSource(file);
      expect(source, `${file} writes ${directory}`).toContain(`'${directory}'`);
    }
    // Only the Batch A suite may name the shared Batch A evidence directory.
    for (const file of await suiteFilesOnDisk()) {
      if (file === 'ui-batch-a.test.mjs') continue;
      const source = await suiteSource(file);
      expect(source, `${file} never touches another suite's evidence`).not.toContain(
        "'ui-batch-a'",
      );
    }
  });

  it('keeps the runner importing the shared list and drops the unused runner env', async () => {
    const runner = await readFile(resolve(uiDirectory, 'run.mjs'), 'utf8');
    expect(runner).toContain("from './suites.mjs'");
    expect(runner).not.toContain('NOTEFOREST_UI_RUNNER');
  });

  it('reports an explicit timeout reason instead of only the kill signal', () => {
    expect(formatTimeoutReason(600_000)).toBe('timed out after 600 s');
    expect(formatTimeoutReason(800)).toBe('timed out after 0.8 s');
    expect(
      formatSuiteResult({
        file: 'm2-view.test.mjs',
        code: 1,
        signal: 'SIGKILL',
        timedOut: true,
        timeoutMs: 800,
        durationMs: 812,
      }),
    ).toBe('FAIL m2-view.test.mjs (0.8s, timed out after 0.8 s)');
  });

  it('prints pass and failure lines with the real reason', () => {
    expect(
      formatSuiteResult({
        file: 'm2-view.test.mjs',
        code: 0,
        timedOut: false,
        timeoutMs: 600_000,
        durationMs: 1234,
      }),
    ).toBe('PASS m2-view.test.mjs (1.2s)');
    expect(
      formatSuiteResult({
        file: 'm2-view.test.mjs',
        code: 1,
        timedOut: false,
        timeoutMs: 600_000,
        durationMs: 2000,
      }),
    ).toBe('FAIL m2-view.test.mjs (2.0s, exit 1)');
    expect(
      formatSuiteResult({
        file: 'm2-view.test.mjs',
        code: 1,
        signal: 'SIGKILL',
        timedOut: false,
        timeoutMs: 600_000,
        durationMs: 2000,
      }),
    ).toBe('FAIL m2-view.test.mjs (2.0s, signal SIGKILL)');
  });
});
