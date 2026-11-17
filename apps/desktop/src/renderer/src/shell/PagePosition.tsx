/**
 * Page position pager in the Toolbar (PP1).
 *
 * `[↑] [↓] [ 3 ] / 61` next to the zoom: the page whose box contains the centre
 * of the viewport, published by the Page surface. Up and down move to the
 * previous/next page start — up and down because the surface scrolls
 * vertically — and the bordered field takes a typed page. The label names the
 * total with a slash, matching the app's page notation; `of` belongs to the find
 * count. There is no jump dialog: the control that says where you are is the
 * control that moves you.
 *
 * The control reads the page under the centre exactly as the old indicator did
 * and writes it through the same `currentPage` path (`goToActivePage`), so an
 * open Page Edit overlay commits first and the surface owns the scroll.
 * `⌘↑`/`⌘↓` remain the keyboard equivalent; `PageUp`/`PageDown` are untouched
 * and keep scrolling one viewport.
 *
 * Only Page has pages, so the cluster is absent in Continuous and in a Markdown
 * guest file.
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useShell } from '../state/shell';
import { usePageStatus } from '../page/use-page-status';
import { clampPageNumber } from '../page/model';
import { goToActivePage } from '../actions';

export function PagePosition(): JSX.Element | null {
  const activeTab = useShell((state) => state.activeTab);
  const layout = useShell((state) =>
    state.activeTab === null
      ? 'continuous'
      : state.viewByDoc[state.activeTab]?.layout ?? 'continuous',
  );
  const storedPage = useShell((state) =>
    state.activeTab === null ? 1 : state.viewByDoc[state.activeTab]?.currentPage ?? 1,
  );
  const status = usePageStatus(activeTab);
  /** The typed value while the field has focus; null mirrors the page. */
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  /**
   * The last page this control asked for, before the surface writes it back.
   * An arrow click blurs the field first, so the commit and the step must not
   * each ask for a page from the store value the jump has not updated yet.
   */
  const requested = useRef<number | null>(null);

  const pageCount = status?.pageCount ?? 0;
  const ready = status?.ready === true && pageCount > 0;
  const page = ready ? clampPageNumber(storedPage, pageCount) : 1;

  // The field mirrors the page under the viewport centre whenever it is not
  // being typed in. While it has focus the typed value owns the field, so a
  // scroll and the control never fight over the caret.
  useEffect(() => {
    if (!focused) setDraft(null);
  }, [focused, page, pageCount]);

  // The store caught up with the jump (or moved elsewhere, e.g. a scroll): the
  // pending request no longer describes where the arrows should step from.
  useEffect(() => {
    if (requested.current !== null && page !== requested.current) requested.current = null;
  }, [page]);

  if (layout !== 'page' || activeTab === null) return null;

  const requestPage = (target: number): void => {
    if (target === (requested.current ?? page)) return;
    requested.current = target;
    goToActivePage(target);
  };

  const step = (delta: number): void => {
    if (!ready) return;
    const base = requested.current ?? page;
    const target = clampPageNumber(base + delta, pageCount);
    if (target === base) return;
    requested.current = target;
    setDraft(null);
    goToActivePage(target);
  };

  /** Jump through the one page action; empty or unparsable restores. */
  const commit = (raw: string): void => {
    if (!ready) return;
    const value = raw.trim();
    if (value.length === 0) {
      setDraft(null);
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setDraft(null);
      return;
    }
    const target = clampPageNumber(parsed, pageCount);
    setDraft(String(target));
    requestPage(target);
  };

  return (
    <div
      className="nf-page-position"
      role="group"
      aria-label="Page position"
      aria-keyshortcuts="Meta+ArrowUp Meta+ArrowDown"
      data-page-position="true"
      data-page-position-ready={ready ? 'true' : 'false'}
      data-page-position-page={ready ? page : undefined}
      data-page-position-count={ready ? pageCount : undefined}
    >
      <button
        type="button"
        className="nf-page-position-arrow"
        data-page-position-prev="true"
        aria-label="Previous page"
        title="Previous page (⌘↑)"
        disabled={!ready || page <= 1}
        onClick={() => step(-1)}
      >
        <ChevronUp size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="nf-page-position-arrow"
        data-page-position-next="true"
        aria-label="Next page"
        title="Next page (⌘↓)"
        disabled={!ready || page >= pageCount}
        onClick={() => step(1)}
      >
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <input
        className="nf-page-position-input"
        data-page-position-input="true"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        maxLength={9}
        aria-label="Page"
        value={ready ? draft ?? String(page) : '–'}
        disabled={!ready}
        onFocus={(event) => {
          setFocused(true);
          event.currentTarget.select();
        }}
        onClick={(event) => event.currentTarget.select()}
        onBlur={(event) => {
          setFocused(false);
          commit(event.currentTarget.value);
        }}
        onChange={(event) => {
          // Digits only: a paste with letters or punctuation keeps the digits.
          setDraft(event.currentTarget.value.replace(/[^0-9]/g, '').slice(0, 9));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(event.currentTarget.value);
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setDraft(null);
            event.currentTarget.select();
          }
        }}
      />
      <span className="nf-page-position-total" data-page-position-total="true">
        {ready ? `/ ${pageCount}` : '/ –'}
      </span>
    </div>
  );
}
