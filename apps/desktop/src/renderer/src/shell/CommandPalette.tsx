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
import { useMemo } from 'react';
import { useShell } from '../state/shell';
import { useRuntime } from '../state/registry';
import { paletteCommands, openPath } from '../actions';
import { blockTitle, flattenBlocks } from '../lib/tree';

interface PaletteItem {
  id: string;
  label: string;
  group: 'Commands' | 'Documents' | 'Blocks';
  hint?: string;
  action: () => void;
}

export function CommandPalette(): JSX.Element | null {
  const open = useShell((state) => state.paletteOpen);
  const query = useShell((state) => state.paletteQuery);
  const documentsOnly = useShell((state) => state.paletteDocumentsOnly);
  const setPaletteOpen = useShell((state) => state.setPaletteOpen);
  const setPaletteQuery = useShell((state) => state.setPaletteQuery);
  const library = useShell((state) => state.library);
  const activeTab = useShell((state) => state.activeTab);
  const { runtime, seq } = useRuntime(activeTab);

  const items = useMemo<PaletteItem[]>(() => {
    const result: PaletteItem[] = [];
    const commands = paletteCommands();
    if (!documentsOnly) {
      for (const command of commands) {
        result.push({
          id: `cmd-${command.id}`,
          label: command.label,
          hint: command.shortcut,
          group: 'Commands',
          action: () => command.onSelect?.(),
        });
      }
    }
    for (const document of library?.documents ?? []) {
      result.push({
        id: `doc-${document.packagePath}`,
        label: document.title,
        group: 'Documents',
        action: () => void openPath(document.packagePath),
      });
    }
    if (!documentsOnly && runtime !== null) {
      for (const blockId of flattenBlocks(runtime.document)) {
        const block = runtime.document.blocks[blockId];
        result.push({
          id: `block-${blockId}`,
          label: blockTitle(block),
          group: 'Blocks',
          action: () => {
            useShell.getState().setActiveTab(runtime.packagePath);
            runtime.focusBlock(blockId);
            runtime.selectBlock(blockId);
            useShell.getState().setSelectedBlock(runtime.packagePath, blockId);
          },
        });
      }
    }
    return result;
  }, [documentsOnly, library, runtime, activeTab, seq]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    const matched =
      value.length === 0
        ? items.slice(0, 60)
        : items
            .filter(
              (item) =>
                item.label.toLowerCase().includes(value) || item.group.toLowerCase().includes(value),
            )
            .slice(0, 60);
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
            <SearchField className="nf-palette-search" autoFocus aria-label="Search commands">
              <Search size={15} strokeWidth={1.5} aria-hidden="true" />
              <Input
                className="nf-palette-input"
                placeholder="Search documents, blocks, commands…"
                autoFocus
              />
              <Button slot="clear" className="nf-icon-button" aria-label="Clear search">
                <X size={13} strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </SearchField>
            <div className="nf-palette-scroller" tabIndex={0}>
              <ListBox
              className="nf-palette-list"
              items={filtered}
              aria-label="Results"
              onAction={(key) => {
                const item = filtered.find((candidate) => candidate.id === String(key));
                if (item === undefined) return;
                setPaletteOpen(false);
                item.action();
              }}
            >
              {(item) => (
                <ListBoxItem
                  id={item.id}
                  textValue={`${item.group} ${item.label}`}
                  className="nf-palette-item"
                >
                  <span className="nf-palette-group">{item.showGroup ? item.group : ''}</span>
                  <span className="nf-palette-label">{item.label}</span>
                  {item.hint === undefined ? null : <kbd className="nf-palette-hint">{item.hint}</kbd>}
                </ListBoxItem>
              )}
              </ListBox>
            </div>
            <div className="nf-palette-foot">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> navigate
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
