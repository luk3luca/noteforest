import { FileDown, Redo2, Undo2 } from 'lucide-react';
import { useShell } from '../state/shell';
import { useRuntime } from '../state/registry';
import { editingEnabledFor, READ_MODE_TITLE } from '../lib/editability';
import { redoActive, undoActive } from '../actions';
import { exportActiveDocument } from '../export/export-flow';
import { FindBar } from './FindBar';
import { ViewControls } from './ViewControls';

export interface CanvasPageControls {
  /** The page model is re-measuring; the page indicator stays truthful. */
  updating: boolean;
}

/**
 * Shell C header: the fixed 34 px strip inside the canvas panel.
 *
 * It is a sibling of the scroll container, never a child, so the canvas can
 * scroll while the controls stay put. Undo/redo are on the left; Page adds
 * Export after a divider; the find cluster sits in the empty centre (it shrinks
 * its input before the layout/mode controls); the icon-only layout/mode
 * segments sit on the right. The Toolbar keeps only tabs, `+`, overflow, the
 * page indicator next to the zoom, and palette.
 */
export function CanvasHeader({
  page,
}: {
  page?: CanvasPageControls;
}): JSX.Element {
  const activeTab = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activeTab);
  const editingEnabled = useShell((state) =>
    runtime === null ? false : editingEnabledFor(runtime, state.viewByDoc[runtime.packagePath]),
  );
  const canUndo =
    runtime !== null && editingEnabled && (runtime.canUndoText || runtime.canUndoStructural);
  const canRedo =
    runtime !== null && editingEnabled && (runtime.canRedoText || runtime.canRedoStructural);
  const undoTitle = !editingEnabled
    ? `Undo — ${READ_MODE_TITLE}`
    : canUndo
      ? 'Undo (⌘Z)'
      : 'Nothing to undo';
  const redoTitle = !editingEnabled
    ? `Redo — ${READ_MODE_TITLE}`
    : canRedo
      ? 'Redo (⇧⌘Z)'
      : 'Nothing to redo';

  return (
    <div className="nf-canvas-header" data-canvas-header="true">
      <div className="nf-header-group" role="group" aria-label="History">
        <button
          type="button"
          className="nf-header-button"
          data-header-undo="true"
          aria-label="Undo"
          title={undoTitle}
          disabled={!canUndo}
          onClick={() => undoActive()}
        >
          <Undo2 size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-header-button"
          data-header-redo="true"
          aria-label="Redo"
          title={redoTitle}
          disabled={!canRedo}
          onClick={() => redoActive()}
        >
          <Redo2 size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      {page === undefined ? null : (
        <>
          <span className="nf-header-divider" aria-hidden="true" />
          <div className="nf-header-group" role="group" aria-label="Page controls">
            {page.updating ? (
              <span key="page-updating" className="nf-page-status">
                Updating…
              </span>
            ) : null}
            <button
              key="page-export"
              type="button"
              className="nf-header-export"
              data-page-export="true"
              title="Export to PDF (⇧⌘E)"
              aria-keyshortcuts="Shift+Meta+E"
              onClick={(event) => exportActiveDocument(event.currentTarget)}
            >
              <FileDown size={13} strokeWidth={1.6} aria-hidden="true" />
              Export PDF
            </button>
          </div>
        </>
      )}
      <div className="nf-header-spacer" />
      <FindBar />
      <div className="nf-header-spacer" />
      <ViewControls />
    </div>
  );
}
