/**
 * Floating find bar (`⌘F`, docs/design/find-bar.md §2).
 *
 * The VS Code widget minus the toggles: query, `1 of 4`, previous/next, close.
 * No case switch, no whole-word, no regex, no options menu, no results panel.
 * It floats over the note at 360 × 40 with a 10 px inset, so the canvas flow and
 * the Page zoom never change, and it is not part of Page or the PDF.
 *
 * The bar owns the debounce and the one linear scan (`findInDocument`); the
 * shell store owns the open state, the result set and the current index so the
 * Continuous decoration and Page navigation read exactly the same hit.
 */

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { findInDocument, type FindResult } from '../lib/find';
import { useRuntime } from '../state/registry';
import { currentFindResult, useShell } from '../state/shell';
import {
  closeFind,
  findNext,
  findPrevious,
  findSearchDocument,
  navigateToFindResult,
} from '../actions';

/** 120–150 ms per the design; long enough to coalesce typing, short enough to feel live. */
export const FIND_DEBOUNCE_MS = 140;

function FindCount({ results, truncated }: { results: FindResult[]; truncated: boolean }): JSX.Element {
  const index = useShell((state) => state.findIndex);
  const label =
    results.length === 0
      ? 'No results'
      : `${index + 1} of ${results.length}${truncated ? '+' : ''}`;
  return (
    <span
      className="nf-find-count"
      aria-live="polite"
      data-find-count={results.length}
      data-find-truncated={truncated ? 'true' : undefined}
    >
      {label}
    </span>
  );
}

export function FindBar(): JSX.Element | null {
  const open = useShell((state) => state.findOpen);
  const query = useShell((state) => state.findQuery);
  const results = useShell((state) => state.findResults);
  const truncated = useShell((state) => state.findTruncated);
  const focusRequest = useShell((state) => state.findFocusRequest);
  const activeTab = useShell((state) => state.activeTab);
  const layout = useShell((state) =>
    state.activeTab === null
      ? 'continuous'
      : state.viewByDoc[state.activeTab]?.layout ?? 'continuous',
  );
  const { runtime } = useRuntime(activeTab);
  // A content commit (structural change or idle text commit) re-runs the scan so
  // the count never describes an older revision.
  const revision = runtime?.document.revision ?? 0;
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wasOpen = useRef(false);

  // Open (and every ⌘F while open): show the session's last query the first
  // time, focus it and select it. A later ⌘F keeps the in-progress draft so a
  // quick re-press cannot revert freshly typed characters.
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!open) return;
    if (opening) setDraft(useShell.getState().findQuery);
    const input = inputRef.current;
    if (input === null) return;
    input.focus();
    input.select();
    // `focusRequest` is the explicit ⌘F-again signal; `query` must not reselect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focusRequest]);

  // Debounce the draft into the store query (one scan per settled query).
  useEffect(() => {
    if (!open || draft === useShell.getState().findQuery) return undefined;
    const timer = window.setTimeout(() => {
      useShell.getState().setFindQuery(draft);
    }, FIND_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, open]);

  // One linear scan per query/revision. No index, no per-keystroke audit.
  useEffect(() => {
    if (!open) return;
    if (query.length === 0) {
      useShell.getState().setFindResults([], 0, false);
      return;
    }
    if (runtime === null) return;
    const report = findInDocument(findSearchDocument(runtime), query);
    useShell.getState().setFindResults(report.results, report.total, report.truncated);
    // `revision` is the document-commit signal; `seq` (selection) must not scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, runtime, revision]);

  const currentId = useShell((state) => currentFindResult(state)?.id ?? null);

  // Move the view to the current hit. Page navigation and the ring live in
  // PageView, which owns the derived page model.
  useEffect(() => {
    if (!open || runtime === null || currentId === null) return;
    const current = currentFindResult(useShell.getState());
    if (current === null) return;
    navigateToFindResult(runtime, current);
  }, [open, runtime, currentId, layout]);

  // A tab switch to a Markdown guest or to no note closes the bar: it searches
  // the open note only.
  useEffect(() => {
    if (!open || runtime !== null) return;
    closeFind();
  }, [open, runtime]);

  if (!open) return null;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        closeFind();
        return;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) findPrevious();
        else findNext();
        return;
      case 'ArrowDown':
        event.preventDefault();
        findNext();
        return;
      case 'ArrowUp':
        event.preventDefault();
        findPrevious();
        return;
      case 'Home':
        event.preventDefault();
        useShell.getState().firstFind();
        return;
      case 'End':
        event.preventDefault();
        useShell.getState().lastFind();
        return;
      default:
        return;
    }
  };

  const empty = results.length === 0;

  return (
    <div
      className="nf-find-bar"
      role="search"
      aria-label="Find in note"
      data-find-bar="true"
    >
      <input
        ref={inputRef}
        className="nf-find-input"
        type="text"
        value={draft}
        placeholder="Find in note"
        aria-label="Find in note"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <FindCount results={results} truncated={truncated} />
      <button
        type="button"
        className="nf-find-button"
        aria-label="Previous match"
        title="Previous match (⇧↵)"
        disabled={empty}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => findPrevious()}
        data-find-previous="true"
      >
        <ChevronUp size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="nf-find-button"
        aria-label="Next match"
        title="Next match (↵)"
        disabled={empty}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => findNext()}
        data-find-next="true"
      >
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="nf-find-button"
        aria-label="Close find"
        title="Close find (Esc)"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => closeFind()}
        data-find-close="true"
      >
        <X size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
