import { AlignLeft, BookOpen, ChevronDown, FileText, Minus, Pencil, Plus } from 'lucide-react';
import type { MenuEntry } from '../state/shell';
import { useShell } from '../state/shell';
import { useRuntime } from '../state/registry';
import {
  adjustActiveLayoutZoom,
  fitActiveLayout,
  setActiveDocumentLayout,
  setActiveInteractionMode,
} from '../actions';
import { resolveActiveZoom, zoomCommandsForLayout, type ZoomCommand } from '../lib/view-zoom';

const ZOOM_COMMANDS: Readonly<Record<ZoomCommand, { label: string }>> = {
  actual: { label: 'Actual size' },
  'fit-page': { label: 'Fit page' },
  'fit-width': { label: 'Fit width' },
};

/**
 * Toolbar view controls (layout, mode, layout-aware zoom).
 *
 * One visible home for layout/mode/zoom (ADR-0007 surfaces). The zoom target is
 * resolved from the active layout, so Page zoom/fit never touches the hidden
 * Continuous zoom and Continuous controls never touch Page state.
 */
export function ViewControls(): JSX.Element {
  const activeTab = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activeTab);
  const view = useShell((state) =>
    state.activeTab === null ? undefined : state.viewByDoc[state.activeTab],
  );
  const openContextMenu = useShell((state) => state.openContextMenu);
  const { layout, zoom, pageFit } = resolveActiveZoom(view);
  const mode = view?.interactionMode ?? 'edit';
  const disabled = runtime === null;
  const zoomCommands = zoomCommandsForLayout(layout);

  const openZoomMenu = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const shortcut: Record<ZoomCommand, string> = {
      actual: '⌘0',
      'fit-page': '⇧1',
      'fit-width': layout === 'page' ? '⇧2' : '⇧⌘0',
    };
    const entries: MenuEntry[] = zoomCommands.map((command) => ({
      id: `zoom-${command}`,
      label: ZOOM_COMMANDS[command].label,
      shortcut: shortcut[command],
      onSelect: () => fitActiveLayout(command),
    }));
    openContextMenu(rect.right, rect.bottom + 4, entries);
  };

  return (
    <div
      className="nf-view-controls"
      role="toolbar"
      aria-label="View controls"
      data-view-controls="true"
      title={disabled ? 'Open a document to change the view' : undefined}
    >
      <div className="nf-view-group" role="group" aria-label="Layout">
        <button
          type="button"
          className="nf-view-segment"
          data-view-layout="continuous"
          aria-pressed={layout === 'continuous'}
          title="Continuous layout (⌘2)"
          disabled={disabled}
          onClick={() => setActiveDocumentLayout('continuous')}
        >
          <AlignLeft size={13} strokeWidth={1.5} aria-hidden="true" />
          <span className="nf-view-label">Continuous</span>
        </button>
        <button
          type="button"
          className="nf-view-segment"
          data-view-layout="page"
          aria-pressed={layout === 'page'}
          title="Page layout (⌘3)"
          disabled={disabled}
          onClick={() => setActiveDocumentLayout('page')}
        >
          <FileText size={13} strokeWidth={1.5} aria-hidden="true" />
          <span className="nf-view-label">Page</span>
        </button>
      </div>
      <div className="nf-view-group" role="group" aria-label="Interaction mode">
        <button
          type="button"
          className="nf-view-segment"
          data-view-interaction="edit"
          aria-pressed={mode === 'edit'}
          title={layout === 'page' ? 'Page Edit mode (⌘E)' : 'Edit mode (⌘E)'}
          disabled={disabled}
          onClick={() => setActiveInteractionMode('edit')}
        >
          <Pencil size={13} strokeWidth={1.5} aria-hidden="true" />
          <span className="nf-view-label">Edit</span>
        </button>
        <button
          type="button"
          className="nf-view-segment"
          data-view-interaction="read"
          aria-pressed={mode === 'read'}
          title={layout === 'page' ? 'Page Read — exact preview (⌘E)' : 'Read mode (⌘E)'}
          disabled={disabled}
          onClick={() => setActiveInteractionMode('read')}
        >
          <BookOpen size={13} strokeWidth={1.5} aria-hidden="true" />
          <span className="nf-view-label">Read</span>
        </button>
      </div>
      <div
        className="nf-view-group nf-zoom-group"
        role="group"
        aria-label="Zoom"
        data-zoom-target={layout}
        data-zoom-commands={zoomCommands.join(' ')}
        data-page-fit={layout === 'page' ? pageFit : undefined}
      >
        <button
          type="button"
          className="nf-zoom-button"
          data-zoom-action="out"
          aria-label="Zoom out"
          title="Zoom out (⌘−)"
          disabled={disabled}
          onClick={() => adjustActiveLayoutZoom(-0.1)}
        >
          <Minus size={12} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-zoom-value"
          data-zoom-value="true"
          aria-label={`Current zoom ${Math.round(zoom * 100)} percent. Reset to actual size`}
          title="Reset zoom to actual size (⌘0)"
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
          title="Zoom in (⌘+)"
          disabled={disabled}
          onClick={() => adjustActiveLayoutZoom(0.1)}
        >
          <Plus size={12} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-zoom-button nf-zoom-menu-button"
          data-zoom-menu="true"
          aria-label="Zoom options"
          aria-haspopup="menu"
          title="Zoom options"
          disabled={disabled}
          onClick={openZoomMenu}
        >
          <ChevronDown size={12} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
