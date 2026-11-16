/**
 * Sidebar Search (`docs/design/find-bar.md` §3, `docs/design/sidebar.md` §3–§6).
 *
 * The browsing presentation of the one find surface: the same query, result
 * set and current occurrence as the toolbar cluster, rendered as the blocks
 * where the word appears. Results follow the document reading order and group
 * by chapter, then block; every row is one **occurrence** with a two-line
 * snippet around the match, so a block with three matches shows three rows.
 *
 * The engine owns what matches and where (`lib/find.ts`); this view only splits
 * the engine's snippet at the match (`lib/find-snippet.ts`). Clicking a row
 * makes it current, and the shared controller moves the note or the page there.
 *
 * The section replaces the Outline while active and returns to the section it
 * came from when closed (`closeSearchSection`).
 *
 * S1: chapters collapse like the Health groups (left chevron, same 28 px row,
 * count kept while closed) and the results are a `tree`: the chapter is a
 * level-1 `treeitem` with `aria-expanded`, an occurrence is a level-2
 * `treeitem`. The input stays the combobox that owns the focus and moves
 * `aria-activedescendant` between occurrences. The collapse state is
 * component-local: the section unmounts when the tab changes, a new query
 * reopens everything, and nothing is persisted.
 */

import { ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Chapter, Document } from '@noteforest/core';
import { useRuntime } from '../state/registry';
import { currentFindResult, useShell } from '../state/shell';
import type { DocumentRuntime } from '../state/runtime';
import { findNext, findPrevious, navigateToFindResult } from '../actions';
import { normalizeFindQuery, type FindResult } from '../lib/find';
import { snippetParts } from '../lib/find-snippet';
import { isMarkdownPath } from '../../../shared/markdown';

interface SearchRow {
  result: FindResult;
  index: number;
}

interface SearchBlockGroup {
  key: string;
  /** A real block label, or `Chapter title` for a chapter hit; null otherwise. */
  title: string | null;
  rows: SearchRow[];
}

interface SearchChapterGroup {
  key: string;
  label: string;
  /** Occurrences shown under this chapter rule. */
  count: number;
  blocks: SearchBlockGroup[];
}

/** The chapter's own heading, prefixed with its position in the note. */
function chapterLabel(chapter: Chapter | undefined, index: number): string {
  const position = index < 0 ? null : index + 1;
  const title = chapter?.title ?? '';
  if (title.length === 0) {
    return position === null ? 'Document' : `Chapter ${position}`;
  }
  return position === null ? title : `Chapter ${position} · ${title}`;
}

/**
 * Reading-order results grouped by chapter, then by block. Groups are built in
 * first-seen order, which is the engine's document order. Only a **real** block
 * label becomes a heading: the first content line is never promoted to a title
 * (F3), so an unlabelled block shows its occurrence cards directly under the
 * chapter rule.
 */
function groupResults(document: Document, results: readonly FindResult[]): SearchChapterGroup[] {
  const chapters = new Map<string, SearchChapterGroup>();
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result === undefined) continue;
    const chapterKey = result.chapterId ?? 'document';
    let chapter = chapters.get(chapterKey);
    if (chapter === undefined) {
      const position = document.chapters.findIndex((entry) => entry.id === result.chapterId);
      chapter = {
        key: chapterKey,
        label: chapterLabel(document.chapters[position], position),
        count: 0,
        blocks: [],
      };
      chapters.set(chapterKey, chapter);
    }
    chapter.count += 1;
    const blockKey = result.blockId ?? `chapter-title:${chapterKey}`;
    let block = chapter.blocks.find((entry) => entry.key === blockKey);
    if (block === undefined) {
      const owner = result.blockId === null ? undefined : document.blocks[result.blockId];
      const label =
        typeof owner?.label === 'string' && owner.label.trim().length > 0
          ? owner.label
          : null;
      block = {
        key: blockKey,
        title: result.blockId === null ? 'Chapter title' : label,
        rows: [],
      };
      chapter.blocks.push(block);
    }
    block.rows.push({ result, index });
  }
  return [...chapters.values()];
}

function snippetMono(result: FindResult): boolean {
  return result.field === 'code' || result.field === 'formula';
}

function Snippet({
  result,
  query,
  wholeWord,
}: {
  result: FindResult;
  query: string;
  wholeWord: boolean;
}): JSX.Element {
  const parts = snippetParts(result.snippet, query, result.start, wholeWord);
  return (
    <span
      className={
        snippetMono(result) ? 'nf-search-snippet nf-search-snippet-mono' : 'nf-search-snippet'
      }
    >
      {parts.lead ? <span className="nf-search-ell">…</span> : null}
      {parts.before}
      {parts.match.length === 0 ? null : <b className="nf-search-match">{parts.match}</b>}
      {parts.after}
      {parts.trail ? <span className="nf-search-ell">…</span> : null}
    </span>
  );
}

function jumpTo(runtime: DocumentRuntime, result: FindResult, index: number): void {
  const state = useShell.getState();
  if (state.findIndex === index) {
    // Clicking the current row again still reveals it (the controller only
    // navigates when the current occurrence changes).
    navigateToFindResult(runtime, result);
    return;
  }
  state.setFindIndex(index);
}

/** The chapter key an occurrence belongs to; the document group when it has none. */
function chapterKeyOf(result: FindResult | undefined): string | null {
  if (result === undefined) return null;
  return result.chapterId ?? 'document';
}

export function SearchSection(): JSX.Element {
  const activePath = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activePath);
  const query = useShell((state) => state.findQuery);
  const setFindQuery = useShell((state) => state.setFindQuery);
  const wholeWord = useShell((state) => state.findWholeWord);
  const setFindWholeWord = useShell((state) => state.setFindWholeWord);
  const results = useShell((state) => state.findResults);
  const truncated = useShell((state) => state.findTruncated);
  const currentIndex = useShell((state) => state.findIndex);
  const current = useShell((state) => currentFindResult(state)?.id ?? null);
  const closeSearchSection = useShell((state) => state.closeSearchSection);

  // Chapter collapse is per-session and component-local (design §6): the
  // section unmounts when the tab changes, so nothing is stored or persisted.
  const [closedChapters, setClosedChapters] = useState<ReadonlySet<string>>(() => new Set());

  const markdown = activePath !== null && isMarkdownPath(activePath);
  const searchable = runtime !== null;
  const normalized = normalizeFindQuery(query);
  const groups = useMemo(
    () => (runtime === null ? [] : groupResults(runtime.document, results)),
    [runtime?.document, results],
  );

  // A query change reopens every chapter: results are transient.
  const lastQuery = useRef(query);
  useEffect(() => {
    if (lastQuery.current === query) return;
    lastQuery.current = query;
    setClosedChapters((previous) => (previous.size === 0 ? previous : new Set()));
  }, [query]);

  // Navigating into a closed chapter opens it (the toolbar's ↵/arrows, ⌘G, or a
  // row click), the same rule as the Continuous editor expanding a block.
  const currentChapter = chapterKeyOf(results[currentIndex]);
  useEffect(() => {
    if (currentChapter === null) return;
    setClosedChapters((previous) => {
      if (!previous.has(currentChapter)) return previous;
      const next = new Set(previous);
      next.delete(currentChapter);
      return next;
    });
  }, [currentChapter]);

  // The current occurrence can move from the toolbar cluster: keep the filled
  // row in view without touching focus.
  useEffect(() => {
    if (current === null) return;
    const row = document.querySelector<HTMLElement>(
      '[data-sidebar-panel="search"] [data-search-current="true"]',
    );
    row?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const toggleChapter = (key: string): void => {
    setClosedChapters((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        closeSearchSection();
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

  // Zero already says `No results`; the empty-state line below would repeat it.
  const countLabel =
    results.length === 0
      ? 'No results'
      : `${currentIndex + 1} of ${results.length}${truncated ? '+' : ''}`;

  // A closed chapter unmounts its rows, so the pointer must not name a row that
  // is not in the DOM: the input keeps the query, the toggle reopens the group
  // and the current occurrence becomes the active descendant again.
  const currentHidden = currentChapter !== null && closedChapters.has(currentChapter);
  const activeDescendant =
    currentIndex < 0 || results.length === 0 || currentHidden
      ? undefined
      : `nf-search-row-${currentIndex}`;

  return (
    <section className="nf-sidebar-section nf-search-section" aria-label="Search">
      <div className="nf-section-head nf-search-head">
        <span className="nf-section-title nf-search-title">Search</span>
        <span
          className="nf-section-count nf-search-count"
          aria-live="polite"
          data-search-count={results.length}
          data-search-truncated={truncated ? 'true' : undefined}
        >
          {countLabel}
        </span>
        <button
          type="button"
          className="nf-whole-word"
          aria-label="Match whole words"
          aria-pressed={wholeWord}
          title="Match whole words"
          data-search-whole-word="true"
          onClick={() => setFindWholeWord(!wholeWord)}
        >
          ab
        </button>
        <button
          type="button"
          className="nf-icon-button"
          data-search-close="true"
          aria-label="Close search"
          title="Close search (Esc)"
          onClick={() => closeSearchSection()}
        >
          <X size={13} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
      <div className="nf-search-field">
        <Search size={13} strokeWidth={1.5} aria-hidden="true" />
        <input
          data-search-input="true"
          type="text"
          value={query}
          placeholder="Search this note"
          aria-label="Search this note"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={searchable}
          aria-controls="nf-search-results"
          aria-activedescendant={activeDescendant}
          autoComplete="off"
          spellCheck={false}
          disabled={!searchable}
          onChange={(event) => setFindQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      {!searchable ? (
        <p className="nf-empty-line" data-search-no-document="true">
          {markdown ? 'Search is available in notes.' : 'Open a note to search.'}
        </p>
      ) : (
        <>
          {normalized.length === 0 && results.length === 0 ? (
            <p className="nf-empty-line" data-search-idle="true">
              Type to search this note.
            </p>
          ) : null}
          <div
            className="nf-search-results"
            id="nf-search-results"
            role="tree"
            aria-label="Search results"
            data-search-results="true"
          >
            {groups.map((chapter) => {
              const open = !closedChapters.has(chapter.key);
              return (
                <div
                  key={chapter.key}
                  className="nf-sidebar-group nf-search-group"
                  role="none"
                  data-search-chapter={chapter.key}
                  data-search-chapter-open={open ? 'true' : 'false'}
                >
                  <button
                    type="button"
                    role="treeitem"
                    aria-level={1}
                    aria-expanded={open}
                    className="nf-search-group-row"
                    data-search-chapter-toggle={chapter.key}
                    title={open ? `Collapse ${chapter.label}` : `Expand ${chapter.label}`}
                    onClick={() => toggleChapter(chapter.key)}
                  >
                    <span className="nf-search-group-chevron" aria-hidden="true">
                      <ChevronRight
                        size={12}
                        strokeWidth={1.5}
                        className={open ? 'nf-chevron-open' : ''}
                      />
                    </span>
                    <span className="nf-search-group-label" data-search-group-label="true">
                      {chapter.label}
                    </span>
                    <span
                      className="nf-search-chapter-count"
                      data-search-chapter-count={chapter.count}
                    >
                      {chapter.count}
                    </span>
                  </button>
                  {open ? (
                    <div role="group">
                      {chapter.blocks.map((block) => (
                        <div
                          key={block.key}
                          className="nf-search-block"
                          data-search-block={block.key}
                          {...(block.title === null
                            ? {}
                            : { role: 'group', 'aria-label': block.title })}
                        >
                          {block.title === null ? null : (
                            <div className="nf-search-block-title" data-search-block-title="true">
                              {block.title}
                            </div>
                          )}
                          {block.rows.map((row) => (
                            <button
                              key={row.result.id}
                              type="button"
                              role="treeitem"
                              aria-level={2}
                              id={`nf-search-row-${row.index}`}
                              className="nf-result-row nf-search-row"
                              aria-selected={row.result.id === current}
                              tabIndex={-1}
                              data-search-row={row.index}
                              data-search-current={row.result.id === current ? 'true' : undefined}
                              data-current={row.result.id === current ? 'true' : undefined}
                              data-search-kind={row.result.kind}
                              data-search-field={row.result.field}
                              title={row.result.snippet}
                              onClick={() => {
                                if (runtime !== null) jumpTo(runtime, row.result, row.index);
                              }}
                            >
                              <Snippet result={row.result} query={query} wholeWord={wholeWord} />
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {truncated ? (
            <p className="nf-empty-line" data-search-truncated-note="true">
              Refine the search
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
