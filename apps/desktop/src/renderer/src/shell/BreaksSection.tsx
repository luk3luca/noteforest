/**
 * Sidebar `Breaks` section (`docs/design/manual-breaks.md` §6).
 *
 * A break is a page boundary at a block row's y, not a result: the list is a
 * plain navigation list in the sidebar's one rhythm (28 px header, group-owned
 * rhythm, no card, no reordering). It is the map of the printed result, so it
 * renders every stored hint in **document order** with the page the current
 * pagination gives it.
 *
 * The page model is mounted by this section, not by Continuous: the list needs
 * live page numbers in both layouts, the hidden measurement host is the same one
 * Page Read and the Settings preview use, and nothing here touches a document.
 * Page Read/Edit keeps owning the on-screen pages.
 *
 * A hint that cannot be honoured keeps its row: the paginator's `impossible-hint`
 * message goes in the row title and the line reads `Can’t be honoured here.`.
 * A hint on a block that exists but is no longer a row leader (a density change
 * moved it beside its parent) is kept and warned the same way — the user's
 * intent is never silently dropped.
 */

import { useEffect } from 'react';
import { usePageSettings } from '../state/settings';
import { useRuntime } from '../state/registry';
import { useShell } from '../state/shell';
import type { DocumentRuntime } from '../state/runtime';
import { pageSettingsAuthoringEnabled, READ_MODE_TITLE } from '../lib/editability';
import { blockTitle } from '../lib/tree';
import {
  manualBreakRows,
  pageRowLeaderIds,
  MANUAL_BREAK_BROKEN,
  MANUAL_BREAK_EMPTY,
} from '../lib/manual-breaks';
import { navigateToManualBreak, setManualBreak } from '../actions';
import { usePageModel } from '../page/usePageModel';

function BreaksHeader({ count }: { count: number }): JSX.Element {
  return (
    <div className="nf-section-head nf-breaks-head">
      <span className="nf-section-title">Breaks</span>
      <span className="nf-section-count nf-breaks-count" data-breaks-count={count}>
        {count}
      </span>
    </div>
  );
}

function BreaksList({
  runtime,
  activePath,
}: {
  runtime: DocumentRuntime;
  activePath: string;
}): JSX.Element {
  const settings = usePageSettings(activePath, runtime.document.id);
  // The section is mounted only while its tab is active, so its page model runs
  // exactly while the list is on screen.
  const model = usePageModel(runtime, true, settings);
  const editingEnabled = useShell((state) =>
    pageSettingsAuthoringEnabled(runtime, state.viewByDoc[activePath]),
  );
  const stored = settings.manualBreakBeforeBlockIds;

  // A hint must never outlive its block. The structural commit paths prune, but
  // a document written by an older build (or reloaded after an external edit)
  // can still carry an id this build does not know; recompute from the current
  // document. This is a no-op when the list is clean.
  const missing = stored.some((id) => runtime.document.blocks[id] === undefined);
  useEffect(() => {
    if (!missing) return;
    runtime.pruneManualBreaks();
  }, [runtime, missing, stored]);

  const rows = manualBreakRows({
    document: runtime.document,
    ids: stored,
    pages: model.pages,
    warnings: model.manualBreakWarnings,
    // Before the first completed run every hint is healthy: a 0 ms flash of
    // "Can’t be honoured here." would be a lie, not a warning.
    rowLeaders:
      model.ready && model.layout !== null
        ? pageRowLeaderIds(model.layout)
        : new Set<string>(stored),
    titleOf: (blockId) => blockTitle(runtime.document.blocks[blockId]),
  });

  return (
    <section className="nf-sidebar-section nf-breaks-section" aria-label="Breaks">
      <BreaksHeader count={stored.length} />
      {stored.length === 0 ? (
        <p className="nf-empty-line" data-breaks-empty="true">
          {MANUAL_BREAK_EMPTY}
        </p>
      ) : (
        <div className="nf-breaks-list" data-breaks-list="true">
          {rows.map((row) => {
            const page =
              row.pageNumber === null ? null : `Page ${row.pageNumber} · ${row.title}`;
            return (
              <div
                key={row.blockId}
                className="nf-breaks-item"
                data-break-row={row.blockId}
                {...(row.broken ? { 'data-break-broken': 'true' } : {})}
              >
                <button
                  type="button"
                  className="nf-breaks-open"
                  data-break-open={row.blockId}
                  {...(row.pageNumber === null
                    ? {}
                    : { 'data-break-page': row.pageNumber })}
                  {...(row.message === null ? {} : { title: row.message })}
                  onClick={() => navigateToManualBreak(row.blockId, row.pageNumber)}
                >
                  <span className="nf-breaks-line">{page ?? row.title}</span>
                  {row.broken ? (
                    <span className="nf-breaks-note">{MANUAL_BREAK_BROKEN}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="nf-row-menu nf-breaks-remove"
                  data-break-remove={row.blockId}
                  aria-label={`Remove break before ${row.title}`}
                  title={editingEnabled ? 'Remove break' : READ_MODE_TITLE}
                  disabled={!editingEnabled}
                  onClick={() => setManualBreak(row.blockId, false)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function BreaksSection(): JSX.Element {
  const activePath = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activePath);

  if (runtime === null || activePath === null) {
    return (
      <section className="nf-sidebar-section nf-breaks-section" aria-label="Breaks">
        <BreaksHeader count={0} />
        <p className="nf-empty-line" data-breaks-no-document="true">
          Open a note to see its breaks.
        </p>
      </section>
    );
  }

  return <BreaksList runtime={runtime} activePath={activePath} />;
}
