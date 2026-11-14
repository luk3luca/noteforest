import { Search, X } from 'lucide-react';
import {
  Autocomplete,
  Button,
  Dialog,
  Input,
  ListBox,
  ListBoxItem,
  Modal,
  ModalOverlay,
  SearchField,
} from 'react-aria-components';
import { useEffect, useMemo } from 'react';
import { useShell } from '../state/shell';
import { useRuntime } from '../state/registry';
import { paletteCommands, openPath } from '../actions';
import { blockTitle, chapterIdOf, flattenBlocks } from '../lib/tree';

interface PaletteItem {
  id: string;
  label: string;
  group: 'Commands' | 'Documents' | 'Blocks';
  hint?: string;
  reason?: string;
  disabled?: boolean;
  action: () => void;
}

/**
 * Command palette (Batch A): Commands / Documents / Blocks, title-only search,
 * an explicit empty state, keyboard navigation, and visible disabled reasons.
 * Read-mode gating comes from `paletteCommands`, which uses the shared
 * editability helper; this component never invents a second whitelist.
 */
export function CommandPalette(): JSX.Element | null {
  const open = useShell((state) => state.paletteOpen);
  const query = useShell((state) => state.paletteQuery);
  const documentsOnly = useShell((state) => state.paletteDocumentsOnly);
  const setPaletteOpen = useShell((state) => state.setPaletteOpen);
  const setPaletteQuery = useShell((state) => state.setPaletteQuery);
  const library = useShell((state) => state.library);
  const activeTab = useShell((state) => state.activeTab);
  // Rebuild command labels/reasons when the layout or mode changes.
  const editabilityKey = useShell((state) => {
    if (state.activeTab === null) return 'none';
    const view = state.viewByDoc[state.activeTab];
    return `${view?.layout ?? 'continuous'}:${view?.interactionMode ?? 'edit'}`;
  });
  const { runtime, seq } = useRuntime(activeTab);

  // One Escape closes the palette even when a search field would consume the
  // key to clear its query. Capture runs before the field's own handler.
  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setPaletteOpen(false);
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [open, setPaletteOpen]);

  const items = useMemo<PaletteItem[]>(() => {
    const result: PaletteItem[] = [];
    const commands = paletteCommands();
    if (!documentsOnly) {
      for (const command of commands) {
        result.push({
          id: `cmd-${command.id}`,
          label: command.label,
          hint: command.shortcut,
          reason: command.reason,
          group: 'Commands',
          disabled: command.disabled === true,
          action: () => command.onSelect?.(),
        });
      }
    }
    for (const document of library?.documents ?? []) {
      result.push({
        id: `doc-${document.packagePath}`,
        label: document.title,
        hint:
          document.kind === 'markdown'
            ? 'Markdown file'
            : `${document.chapterCount} ${
                document.chapterCount === 1 ? 'chapter' : 'chapters'
              }`,
        group: 'Documents',
        action: () => void openPath(document.packagePath),
      });
    }
    if (!documentsOnly && runtime !== null) {
      const chapterTitles = new Map(
        runtime.document.chapters.map((chapter) => [chapter.id, chapter.title]),
      );
      for (const blockId of flattenBlocks(runtime.document)) {
        const block = runtime.document.blocks[blockId];
        const chapterId = chapterIdOf(runtime.document, blockId);
        const chapter = chapterId === null ? undefined : chapterTitles.get(chapterId);
        result.push({
          id: `block-${blockId}`,
          label: blockTitle(block),
          hint: chapter === undefined ? undefined : chapter,
          group: 'Blocks',
          action: () => {
            useShell.getState().setActiveTab(runtime.packagePath);
            runtime.focusBlock(blockId);
            runtime.selectBlock(blockId);
          },
        });
      }
    }
    return result;
  }, [documentsOnly, library, runtime, activeTab, seq, editabilityKey, runtime?.status]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    const matched =
      value.length === 0
        ? items.slice(0, 80)
        : items
            .filter((item) => item.label.toLowerCase().includes(value))
            .slice(0, 80);
    return matched.map((item, index) => ({
      ...item,
      showGroup: index === 0 || matched[index - 1]?.group !== item.group,
    }));
  }, [items, query]);

  if (!open) return null;

  return (
    <ModalOverlay
      className="nf-overlay"
      isOpen={open}
      onOpenChange={(next) => setPaletteOpen(next)}
      isDismissable
    >
      <Modal className="nf-palette-modal">
        <Dialog aria-label="Command palette" className="nf-palette">
          <Autocomplete inputValue={query} onInputChange={setPaletteQuery}>
            <SearchField
              className="nf-palette-search"
              autoFocus
              aria-label="Search or run a command"
            >
              <Search size={15} strokeWidth={1.5} aria-hidden="true" />
              <Input
                className="nf-palette-input"
                placeholder="Search or run a command…"
                autoFocus
              />
              <Button slot="clear" className="nf-icon-button" aria-label="Clear search">
                <X size={13} strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </SearchField>
            <div className="nf-palette-scroller" tabIndex={0}>
              {filtered.length === 0 ? (
                <p className="nf-palette-empty" data-palette-empty="true">
                  No commands or documents match.
                </p>
              ) : (
                <ListBox
                  className="nf-palette-list"
                  items={filtered}
                  aria-label="Results"
                  onAction={(key) => {
                    const item = filtered.find((candidate) => candidate.id === String(key));
                    if (item === undefined || item.disabled === true) return;
                    setPaletteOpen(false);
                    item.action();
                  }}
                >
                  {(item) => (
                    <ListBoxItem
                      id={item.id}
                      textValue={`${item.group} ${item.label} ${item.reason ?? ''} ${item.hint ?? ''}`}
                      className="nf-palette-item"
                      isDisabled={item.disabled === true}
                      data-palette-item={item.id}
                      data-palette-group={item.group}
                      data-palette-disabled={item.disabled === true ? 'true' : undefined}
                      data-palette-reason={item.reason === undefined ? undefined : item.reason}
                    >
                      <span className="nf-palette-group">
                        {item.showGroup ? item.group : ''}
                      </span>
                      <span className="nf-palette-label" title={item.reason ?? item.label}>
                        {item.label}
                      </span>
                      {item.reason === undefined ? null : (
                        <span className="nf-palette-reason" data-palette-reason-label="true">
                          {item.reason}
                        </span>
                      )}
                      {item.hint === undefined ? null : (
                        <kbd className="nf-palette-hint">{item.hint}</kbd>
                      )}
                    </ListBoxItem>
                  )}
                </ListBox>
              )}
            </div>
            <div className="nf-palette-foot">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> move
              </span>
              <span>
                <kbd>↵</kbd> open
              </span>
              <span>
                <kbd>esc</kbd> close
              </span>
            </div>
          </Autocomplete>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
