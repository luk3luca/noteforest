/**
 * Document health in the sidebar (S2, S2.1).
 *
 * The sidebar is the report: the audit's rows grouped in expandable sections,
 * one row per issue, and a 560 px repair modal in front. Confirm closes the
 * modal and the repaired row leaves this list; there is no second list to keep
 * in sync and no "next" step.
 *
 * S2.1: the four sections always render (`0` included) and only the search
 * filters them; a row is two lines (quote, then state · block · branches); the
 * manual re-check is the 28 px button next to the search and shows a check for
 * about two seconds, so the footer text button is gone.
 *
 * The list is a `tree`: section headers are expandable nodes, rows are leaves.
 * Up/Down/Home/End move, Left/Right collapse/expand, Enter opens the row's
 * modal. Open sections live in the shell session store; the selected row
 * survives closing the modal.
 */

import { Check, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRegistry, useRuntime } from '../state/registry';
import { useShell } from '../state/shell';
import {
  documentHealthInfoText,
  documentHealthSummaryText,
  visibleDocumentHealthGroups,
  type DocumentHealthSectionId,
} from '../lib/document-health-sections';
import {
  documentHealthBranchCountText,
  documentHealthStateText,
} from '../lib/document-health-actions';
import {
  filterDocumentHealthRows,
  type DocumentHealthRow,
} from '../lib/document-health';
import { useDocumentHealthReport } from './useDocumentHealth';

/** How long the refresh button keeps its check after a manual re-check. */
const CHECKED_FEEDBACK_MS = 2000;

function rowLabel(row: DocumentHealthRow): string {
  if (row.quote.length > 0) return row.quote;
  return documentHealthStateText(row.category);
}

export function HealthSection(): JSX.Element {
  const activePath = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activePath);
  useRegistry();
  const openSections = useShell((state) => state.healthOpenSections);
  const toggleHealthSection = useShell((state) => state.toggleHealthSection);
  const selectedRowId = useShell((state) => state.healthSelectedRowId);
  const setSelectedRowId = useShell((state) => state.setHealthSelectedRowId);
  const openDialog = useShell((state) => state.openDialog);
  const [query, setQuery] = useState('');
  const [checkToken, setCheckToken] = useState(0);
  const [checked, setChecked] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const report = useDocumentHealthReport(runtime, checkToken);

  // The check reads as feedback, not as a state: it returns by itself.
  useEffect(() => {
    if (!checked) return undefined;
    const timer = window.setTimeout(() => setChecked(false), CHECKED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [checked]);

  const searching = query.trim().length > 0;
  const visibleRows = useMemo(
    () => (report === null ? [] : filterDocumentHealthRows(report.rows, 'all', query)),
    [report, query],
  );
  const groups = useMemo(
    () => visibleDocumentHealthGroups(visibleRows, searching),
    [visibleRows, searching],
  );
  const selectedVisible =
    selectedRowId !== null && visibleRows.some((row) => row.id === selectedRowId);
  const defaultKey =
    selectedVisible && selectedRowId !== null
      ? selectedRowId
      : groups[0] === undefined
        ? null
        : `section:${groups[0].definition.id}`;
  const activeKey = focusKey ?? defaultKey;

  const moveFocus = (delta: number | 'first' | 'last'): void => {
    const container = document.querySelector<HTMLElement>('[data-health-tree="true"]');
    if (container === null) return;
    const nodes = [
      ...container.querySelectorAll<HTMLElement>('[data-health-node="true"]'),
    ];
    if (nodes.length === 0) return;
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    const index =
      delta === 'first'
        ? 0
        : delta === 'last'
          ? nodes.length - 1
          : Math.max(0, Math.min(nodes.length - 1, current + delta));
    const target = nodes[index];
    if (target === undefined) return;
    setFocusKey(target.dataset['healthKey'] ?? null);
    target.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const active = document.activeElement;
    const isSection = active instanceof HTMLElement && active.dataset['healthSectionToggle'] === 'true';
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(-1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      moveFocus('first');
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      moveFocus('last');
      return;
    }
    if (!isSection) return;
    const section = active.dataset['healthSection'] as
      | DocumentHealthSectionId
      | undefined;
    if (section === undefined) return;
    if (event.key === 'ArrowRight' && !openSections.includes(section)) {
      event.preventDefault();
      toggleHealthSection(section);
      return;
    }
    if (event.key === 'ArrowLeft' && openSections.includes(section)) {
      event.preventDefault();
      toggleHealthSection(section);
    }
  };

  const openRow = (row: DocumentHealthRow): void => {
    setSelectedRowId(row.id);
    setFocusKey(row.id);
    openDialog({ kind: 'health-issue', rowId: row.id });
  };

  const checkAgain = (): void => {
    setCheckToken((value) => value + 1);
    setChecked(true);
  };

  if (runtime === null || report === null) {
    return (
      <section className="nf-sidebar-section nf-health-section" aria-label="Health">
        <div className="nf-health-head">
          <span className="nf-health-title">Health</span>
        </div>
        <p className="nf-empty-line" data-health-no-document="true">
          Open a document to check its anchors.
        </p>
      </section>
    );
  }

  return (
    <section className="nf-sidebar-section nf-health-section" aria-label="Health">
      <div className="nf-health-head">
        <span className="nf-health-title">Health</span>
        {report.counts.all === 0 ? null : (
          <span
            className="nf-health-summary"
            data-health-summary="true"
            data-health-count-all={report.counts.all}
            data-health-count-needs-repair={report.counts.needsRepair}
            data-health-count-broken={report.counts.broken}
            data-health-count-ambiguous={report.counts.ambiguous}
            data-health-count-idle={report.counts.idle}
            data-health-count-orphans={report.counts.orphans}
            data-health-count-structure={report.counts.structure}
            data-health-count-hidden={report.counts.hidden}
          >
            {documentHealthSummaryText(report.counts)}
          </span>
        )}
      </div>
      <div className="nf-health-search-row">
        <div className="nf-health-search nf-library-search">
          <Search size={13} strokeWidth={1.5} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search issues"
            aria-label="Search issues"
            data-health-search="true"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button
          type="button"
          className="nf-health-refresh"
          data-health-refresh="true"
          data-checked={checked ? 'true' : undefined}
          aria-label="Check again"
          title="Check again"
          onClick={checkAgain}
        >
          {checked ? (
            <Check size={13} strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <RefreshCw size={13} strokeWidth={1.6} aria-hidden="true" />
          )}
        </button>
        <span
          className="nf-sr-only"
          role="status"
          aria-live="polite"
          data-health-checked-status="true"
        >
          {checked ? 'Checked' : ''}
        </span>
      </div>

      {report.counts.all === 0 ? (
        <div className="nf-health-empty" data-health-empty="true">
          <p>No issues found</p>
          <p className="nf-health-empty-info" data-health-empty-info="true">
            {documentHealthInfoText(report.info)}
          </p>
        </div>
      ) : groups.length === 0 ? (
        <p className="nf-empty-line" data-health-empty-search="true">
          No issues match this search.
        </p>
      ) : (
        <div
          className="nf-health-tree"
          role="tree"
          aria-label="Document health issues"
          data-health-tree="true"
          onKeyDown={onKeyDown}
        >
          {groups.map((group) => {
            const id = group.definition.id;
            const open = searching || openSections.includes(id);
            const key = `section:${id}`;
            return (
              <div key={id} className="nf-health-group" data-health-section={id}>
                {searching ? (
                  <div
                    role="treeitem"
                    aria-level={1}
                    aria-expanded="true"
                    className="nf-health-section-row"
                    data-health-section-label={id}
                  >
                    <ChevronRight
                      size={12}
                      strokeWidth={1.5}
                      className="nf-chevron-open"
                      aria-hidden="true"
                    />
                    <span className="nf-health-section-name">{group.definition.label}</span>
                    <span className="nf-health-section-count" data-health-section-count={group.rows.length}>
                      {group.rows.length}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    role="treeitem"
                    aria-level={1}
                    aria-expanded={open}
                    className="nf-health-section-row"
                    data-health-section-toggle="true"
                    data-health-section={id}
                    data-health-node="true"
                    data-health-key={key}
                    aria-label={`${group.definition.label}, ${group.rows.length} ${
                      group.rows.length === 1 ? 'issue' : 'issues'
                    }`}
                    tabIndex={activeKey === key ? 0 : -1}
                    onFocus={() => setFocusKey(key)}
                    onClick={() => toggleHealthSection(id)}
                  >
                    <ChevronRight
                      size={12}
                      strokeWidth={1.5}
                      className={open ? 'nf-chevron-open' : ''}
                      aria-hidden="true"
                    />
                    <span className="nf-health-section-name">{group.definition.label}</span>
                    <span className="nf-health-section-count" data-health-section-count={group.rows.length}>
                      {group.rows.length}
                    </span>
                  </button>
                )}
                {open ? (
                  <div role="group" className="nf-health-rows">
                    {group.rows.length === 0 ? (
                      <p className="nf-health-group-empty" data-health-group-empty={id}>
                        No issues in this group
                      </p>
                    ) : null}
                    {group.rows.map((row) => {
                      const selected = selectedRowId === row.id;
                      const anchorRow =
                        row.anchorId !== undefined && row.category !== 'orphan-reference';
                      const state = documentHealthStateText(row.category);
                      return (
                        <div
                          key={row.id}
                          className="nf-health-row"
                          data-health-row={row.id}
                          data-health-state={row.category}
                          data-health-severity={row.severity}
                          data-health-kind={row.kind ?? 'structure'}
                          data-health-info={row.needsRepair ? undefined : 'true'}
                          {...(anchorRow ? { 'data-health-anchor': row.anchorId } : {})}
                        >
                          <button
                            type="button"
                            role="treeitem"
                            aria-level={2}
                            aria-selected={selected}
                            className="nf-health-row-button"
                            data-health-row-button="true"
                            data-health-node="true"
                            data-health-key={row.id}
                            data-selected={selected}
                            tabIndex={activeKey === row.id ? 0 : -1}
                            title={`${state} · ${row.blockTitle}`}
                            onFocus={() => setFocusKey(row.id)}
                            onClick={() => openRow(row)}
                          >
                            <span className="nf-health-row-quote">“{rowLabel(row)}”</span>
                            <span className="nf-health-row-meta">
                              <span className="nf-health-row-state">{state}</span>
                              <span className="nf-health-row-separator" aria-hidden="true">
                                ·
                              </span>
                              <span className="nf-health-row-block">{row.blockTitle}</span>
                              {row.branchCount > 0 ? (
                                <span
                                  className="nf-health-row-count"
                                  data-health-branch-count={row.branchCount}
                                >
                                  {documentHealthBranchCountText(row.branchCount)}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
