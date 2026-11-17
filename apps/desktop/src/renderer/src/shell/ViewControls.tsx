import { AlignLeft, BookOpen, FileText, Minus, Pencil, Plus } from 'lucide-react';
import { useShell } from '../state/shell';
import { useRuntime } from '../state/registry';
import {
  adjustActiveLayoutZoom,
  fitActiveLayout,
  goToContinuous,
  setActiveDocumentLayout,
  setActiveInteractionMode,
} from '../actions';
import { resolveActiveZoom, zoomCommandsForLayout } from '../lib/view-zoom';
import { shortcutHint } from '../lib/shortcuts';
import { usePageStatus } from '../page/use-page-status';

/**
 * Icon-only layout/mode segmented controls (shell C).
 *
 * They live in the fixed canvas header, not in the Toolbar. Every control has a
 * tooltip and an accessible label; the words are deliberately gone so the
 * canvas content starts at the panel edge. The handlers are the same registry
 * actions used by the menu, palette, and keyboard.
 */
export function ViewControls(): JSX.Element {
  const activeTab = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activeTab);
  const view = useShell((state) =>
    state.activeTab === null ? undefined : state.viewByDoc[state.activeTab],
  );
  const layout = view?.layout ?? 'continuous';
  const mode = view?.interactionMode ?? (layout === 'page' ? 'read' : 'edit');
  const disabled = runtime === null;
  const disabledReason = disabled ? 'Open a note to change the view' : undefined;

  return (
    <div
      className="nf-view-controls"
      role="toolbar"
      aria-label="View controls"
      data-view-controls="true"
      data-view-controls-compact="true"
      title={disabledReason}
    >
      <div className="nf-view-group" role="group" aria-label="Layout">
        <button
          type="button"
          className="nf-view-segment"
          data-view-layout="continuous"
          aria-pressed={layout === 'continuous'}
          aria-label="Continuous layout"
          title={disabledReason ?? `Continuous layout (${shortcutHint('continuous-layout')})`}
          disabled={disabled}
          onClick={() => goToContinuous()}
        >
          <AlignLeft size={13} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-view-segment"
          data-view-layout="page"
          aria-pressed={layout === 'page'}
          aria-label="Page layout"
          title={disabledReason ?? `Page layout (${shortcutHint('page-layout')})`}
          disabled={disabled}
          onClick={() => setActiveDocumentLayout('page')}
        >
          <FileText size={13} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      <div className="nf-view-group" role="group" aria-label="Interaction mode">
        <button
          type="button"
          className="nf-view-segment"
          data-view-interaction="edit"
          aria-pressed={mode === 'edit'}
          aria-label={layout === 'page' ? 'Page Edit mode' : 'Edit mode'}
          title={
            disabledReason ??
            (layout === 'page'
              ? `Page Edit mode (${shortcutHint('toggle-mode')})`
              : `Edit mode (${shortcutHint('toggle-mode')})`)
          }
          disabled={disabled}
          onClick={() => setActiveInteractionMode('edit')}
        >
          <Pencil size={13} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-view-segment"
          data-view-interaction="read"
          aria-pressed={mode === 'read'}
          aria-label={layout === 'page' ? 'Page Read mode' : 'Read mode'}
          title={
            disabledReason ??
            (layout === 'page'
              ? `Page Read — exact preview (${shortcutHint('toggle-mode')})`
              : `Read mode (${shortcutHint('toggle-mode')})`)
          }
          disabled={disabled}
          onClick={() => setActiveInteractionMode('read')}
        >
          <BookOpen size={13} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * Layout-aware zoom stepper for the canvas header: minus, the percentage
 * (click resets to actual size), and plus. The former Actual/Fit width/Fit page
 * dropdown is removed; the keyboard/menu/palette still expose the same
 * layout-aware commands.
 */
export function ZoomControls(): JSX.Element {
  const activeTab = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activeTab);
  const view = useShell((state) =>
    state.activeTab === null ? undefined : state.viewByDoc[state.activeTab],
  );
  const resolved = resolveActiveZoom(view);
  const { layout, pageFit } = resolved;
  // Page publishes the percentage the paper actually shows: 100 % is fit width
  // and `fit page` is whatever the viewport allows. Continuous keeps its own
  // stored zoom.
  const status = usePageStatus(activeTab);
  const zoom =
    layout === 'page' && status !== null ? status.percent / 100 : resolved.zoom;
  const disabled = runtime === null;
  const zoomCommands = zoomCommandsForLayout(layout);

  return (
    <div
      className="nf-view-group nf-zoom-group"
      role="group"
      aria-label="Zoom"
      data-zoom-target={layout}
      data-zoom-commands={zoomCommands.join(' ')}
      data-page-fit={layout === 'page' ? pageFit : undefined}
      title={disabled ? 'Open a note to change the view' : undefined}
    >
      <button
        type="button"
        className="nf-zoom-button"
        data-zoom-action="out"
        aria-label="Zoom out"
        title={`Zoom out (${shortcutHint('zoom-out')})`}
        disabled={disabled}
        onClick={() => adjustActiveLayoutZoom(-0.1)}
      >
        <Minus size={12} strokeWidth={1.7} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="nf-zoom-value"
        data-zoom-value="true"
        aria-label={`Current zoom ${Math.round(zoom * 100)} percent. Reset to 100 percent`}
        title={`Reset zoom (${shortcutHint('reset-zoom')})`}
        disabled={disabled}
        onClick={() => fitActiveLayout('actual')}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="nf-zoom-button"
        data-zoom-action="in"
        aria-label="Zoom in"
        title={`Zoom in (${shortcutHint('zoom-in')})`}
        disabled={disabled}
        onClick={() => adjustActiveLayoutZoom(0.1)}
      >
        <Plus size={12} strokeWidth={1.7} aria-hidden="true" />
      </button>
    </div>
  );
}
