/**
 * Sidebar Search (`docs/design/find-bar.md` §3).
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
 */

import { Search, X } from 'lucide-react';
import { useEffect, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Chapter, Document } from '@noteforest/core';
import { useRuntime } from '../state/registry';
import { currentFindResult, useShell } from '../state/shell';
import type { DocumentRuntime } from '../state/runtime';
import { findNext, findPrevious, navigateToFindResult } from '../actions';
import type { FindResult } from '../lib/find';
import { snippetParts } from '../lib/find-snippet';
import { blockTitle } from '../lib/tree';
import { isMarkdownPath } from '../../../shared/markdown';

interface SearchRow {
  result: FindResult;
  index: number;
}

interface SearchBlockGroup {
  key: string;
  title: string;
  rows: SearchRow[];
}

interface SearchChapterGroup {
  key: string;
  label: string;
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
 * first-seen order, which is the engine's document order.
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
        blocks: [],
      };
      chapters.set(chapterKey, chapter);
    }
    const blockKey = result.blockId ?? `chapter-title:${chapterKey}`;
    let block = chapter.blocks.find((entry) => entry.key === blockKey);
    if (block === undefined) {
      const owner = result.blockId === null ? undefined : document.blocks[result.blockId];
      block = {
        key: blockKey,
        title: result.blockId === null ? 'Chapter title' : blockTitle(owner),
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

function Snippet({ result, query }: { result: FindResult; query: string }): JSX.Element {
  const parts = snippetParts(result.snippet, query, result.start);
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

export function SearchSection(): JSX.Element {
  const activePath = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activePath);
  const query = useShell((state) => state.findQuery);
  const setFindQuery = useShell((state) => state.setFindQuery);
  const results = useShell((state) => state.findResults);
  const truncated = useShell((state) => state.findTruncated);
  const currentIndex = useShell((state) => state.findIndex);
  const current = useShell((state) => currentFindResult(state)?.id ?? null);
  const closeSearchSection = useShell((state) => state.closeSearchSection);

  const markdown = activePath !== null && isMarkdownPath(activePath);
  const searchable = runtime !== null;
  const trimmed = query.trim();
  const groups = useMemo(
    () => (runtime === null ? [] : groupResults(runtime.document, results)),
    [runtime?.document, results],
  );

  // The current occurrence can move from the toolbar cluster: keep the filled
  // row in view without touching focus.
  useEffect(() => {
    if (current === null) return;
    const row = document.querySelector<HTMLElement>(
      '[data-sidebar-panel="search"] [data-search-current="true"]',
    );
    row?.scrollIntoView({ block: 'nearest' });
  }, [current]);

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

  const countLabel =
    results.length === 0
      ? '0'
      : `${currentIndex + 1} of ${results.length}${truncated ? '+' : ''}`;

  return (
    <section className="nf-sidebar-section nf-search-section" aria-label="Search">
      <div className="nf-search-head">
        <span className="nf-search-title">Search</span>
        <span
          className="nf-search-count"
          aria-live="polite"
          data-search-count={results.length}
          data-search-truncated={truncated ? 'true' : undefined}
        >
          {countLabel}
        </span>
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
          aria-activedescendant={
            currentIndex < 0 || results.length === 0 ? undefined : `nf-search-row-${currentIndex}`
          }
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
          {trimmed.length > 0 && results.length === 0 ? (
            <p className="nf-empty-line" data-search-empty="true">
              No results
            </p>
          ) : null}
          {trimmed.length === 0 && results.length === 0 ? (
            <p className="nf-empty-line" data-search-idle="true">
              Type to search this note.
            </p>
          ) : null}
          <div
            className="nf-search-results"
            id="nf-search-results"
            role="listbox"
            aria-label="Search results"
            data-search-results="true"
          >
            {groups.map((chapter) => (
              <div
                key={chapter.key}
                className="nf-search-group"
                role="group"
                aria-label={chapter.label}
                data-search-chapter={chapter.key}
              >
                <div className="nf-search-group-label" data-search-group-label="true">
                  {chapter.label}
                </div>
                {chapter.blocks.map((block) => (
                  <div key={block.key} className="nf-search-block" data-search-block={block.key}>
                    <div
                      className="nf-search-block-title"
                      data-search-block-title="true"
                      title={block.title}
                    >
                      {block.title}
                    </div>
                    {block.rows.map((row) => (
                      <button
                        key={row.result.id}
                        type="button"
                        role="option"
                        id={`nf-search-row-${row.index}`}
                        className="nf-search-row"
                        aria-selected={row.result.id === current}
                        tabIndex={-1}
                        data-search-row={row.index}
                        data-search-current={row.result.id === current ? 'true' : undefined}
                        data-search-kind={row.result.kind}
                        data-search-field={row.result.field}
                        title={row.result.snippet}
                        onClick={() => {
                          if (runtime !== null) jumpTo(runtime, row.result, row.index);
                        }}
                      >
                        <Snippet result={row.result} query={query} />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))}
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
