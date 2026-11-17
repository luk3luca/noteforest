/**
 * Canvas-header find cluster (`⌘F`, docs/design/find-bar.md §2).
 *
 * The VS Code widget minus the case/regex options: query, one shared `ab`
 * whole-word toggle, `1 of 4`, previous/next, close. No case switch, no regex,
 * no options menu, no results panel. Both presentations read and write the same
 * toggle, so a change in either changes both counts.
 * It is one 28 px cluster inside the canvas header, between undo/redo and the
 * layout/mode controls: no card, no shadow, no extra row, nothing overlays the
 * note or the page.
 *
 * The cluster is presentation only. `FindController` owns the debounce, the one
 * linear scan and navigation; `state/shell.ts` owns the query, the result set
 * and the current index, which the sidebar Search view reads as well.
 */

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { FindResult } from '../lib/find';
import { matches, shortcutHint } from '../lib/shortcuts';
import { useShell } from '../state/shell';
import { closeFind, findNext, findPrevious } from '../actions';

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
  const setFindQuery = useShell((state) => state.setFindQuery);
  const wholeWord = useShell((state) => state.findWholeWord);
  const setFindWholeWord = useShell((state) => state.setFindWholeWord);
  const results = useShell((state) => state.findResults);
  const truncated = useShell((state) => state.findTruncated);
  const focusRequest = useShell((state) => state.findFocusRequest);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Open (and every ⌘F while open): focus the shared query and select it, so
  // typing replaces it. The value itself is `findQuery`, shared with the
  // sidebar Search view, so a re-press can never revert freshly typed text.
  useEffect(() => {
    if (!open) return;
    const input = inputRef.current;
    if (input === null) return;
    input.focus();
    input.select();
  }, [open, focusRequest]);

  if (!open) return null;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    // The field's own keys are catalogue entries with `list: false`: they are
    // in the field's tooltips, not in the app-wide list.
    if (matches(event, 'find-field-close')) {
      event.preventDefault();
      event.stopPropagation();
      closeFind();
      return;
    }
    if (matches(event, 'find-field-previous')) {
      event.preventDefault();
      event.stopPropagation();
      findPrevious();
      return;
    }
    if (matches(event, 'find-field-next')) {
      event.preventDefault();
      event.stopPropagation();
      findNext();
      return;
    }
    if (matches(event, 'find-field-down')) {
      event.preventDefault();
      findNext();
      return;
    }
    if (matches(event, 'find-field-up')) {
      event.preventDefault();
      findPrevious();
      return;
    }
    if (matches(event, 'find-field-first')) {
      event.preventDefault();
      useShell.getState().firstFind();
      return;
    }
    if (matches(event, 'find-field-last')) {
      event.preventDefault();
      useShell.getState().lastFind();
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
        value={query}
        placeholder="Find in note"
        aria-label="Find in note"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setFindQuery(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="nf-whole-word"
        aria-label="Match whole words"
        aria-pressed={wholeWord}
        title="Match whole words"
        data-find-whole-word="true"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setFindWholeWord(!wholeWord)}
      >
        ab
      </button>
      <FindCount results={results} truncated={truncated} />
      <button
        type="button"
        className="nf-find-button"
        aria-label="Previous match"
        title={`Previous match (${shortcutHint('find-field-previous')})`}
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
        title={`Next match (${shortcutHint('find-field-next')})`}
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
        title={`Close find (${shortcutHint('find-field-close')})`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => closeFind()}
        data-find-close="true"
      >
        <X size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
