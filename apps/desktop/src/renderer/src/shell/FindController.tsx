/**
 * Shared find engine host (docs/design/find-bar.md §1, §4).
 *
 * One linear scan feeds both presentations: the canvas-header cluster (`⌘F`) and the
 * sidebar Search view read the same query, result set and current index from
 * `state/shell.ts`. This component is mounted once by the shell, so typing in
 * either input produces exactly one scan and one navigation, and closing one
 * presentation never empties the other.
 *
 * It owns the debounce, the scan, the "nothing to show" clear, and moving the
 * view to the current hit; the two surfaces own only their chrome.
 */

import { useEffect } from 'react';
import { findInDocument, normalizeFindQuery } from '../lib/find';
import { useRuntime } from '../state/registry';
import { currentFindResult, findSurfaceActive, useShell } from '../state/shell';
import { closeFind, findSearchDocument, navigateToFindResult } from '../actions';

/** 120–150 ms per the design; long enough to coalesce typing, short enough to feel live. */
export const FIND_DEBOUNCE_MS = 140;

export function FindController(): null {
  const activeTab = useShell((state) => state.activeTab);
  const active = useShell(findSurfaceActive);
  const query = useShell((state) => state.findQuery);
  const wholeWord = useShell((state) => state.findWholeWord);
  const currentId = useShell((state) => currentFindResult(state)?.id ?? null);
  const layout = useShell((state) =>
    state.activeTab === null
      ? 'continuous'
      : state.viewByDoc[state.activeTab]?.layout ?? 'continuous',
  );
  const { runtime } = useRuntime(activeTab);
  // A content commit (structural change or idle text commit) re-runs the scan so
  // the count never describes an older revision.
  const revision = runtime?.document.revision ?? 0;

  // A Markdown guest or no note has nothing to search: the cluster closes (v1)
  // and the sidebar view renders its own "no document" copy. The result set is
  // dropped by the scan effect below.
  useEffect(() => {
    if (!active || runtime !== null) return;
    if (useShell.getState().findOpen) closeFind();
  }, [active, runtime]);

  // One linear scan per settled query/revision while either surface shows. No
  // index, no per-keystroke audit; the 100-occurrence cap bounds the DOM. The
  // query is normalized only for matching: the input value is never rewritten.
  useEffect(() => {
    if (!active) return undefined;
    if (normalizeFindQuery(query).length === 0 || runtime === null) {
      useShell.getState().setFindResults([], 0, false);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      const report = findInDocument(findSearchDocument(runtime), query, { wholeWord });
      useShell.getState().setFindResults(report.results, report.total, report.truncated);
    }, FIND_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, query, wholeWord, runtime, revision]);

  // Move the view to the current hit: Continuous reveals/selects the block and
  // Page turns to its page and rings it (`PageView` owns the page model). Both
  // presentations change the same index, so both navigate.
  useEffect(() => {
    if (!active || runtime === null || currentId === null) return;
    const current = currentFindResult(useShell.getState());
    if (current === null) return;
    navigateToFindResult(runtime, current);
  }, [active, runtime, currentId, layout]);

  // No surface shows the results any more: drop them so no decoration or Page
  // ring survives a close. The query is kept for the session.
  useEffect(() => {
    if (active) return;
    const state = useShell.getState();
    if (state.findResults.length === 0 && state.findIndex === -1) return;
    state.setFindResults([], 0, false);
  }, [active]);

  return null;
}
