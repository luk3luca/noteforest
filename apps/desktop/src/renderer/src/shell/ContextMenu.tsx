import { Menu, MenuItem, Separator } from 'react-aria-components';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from '../state/shell';

export function ContextMenu(): JSX.Element | null {
  const menu = useShell((state) => state.contextMenu);
  const close = useShell((state) => state.closeContextMenu);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (menu === null) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    // Focus the first item for keyboard users.
    requestAnimationFrame(() => {
      const first = ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
      first?.focus();
    });
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [menu, close]);

  if (menu === null) return null;
  const width = 224;
  const height = menu.items.length * 28 + 12;
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - height - 8));
  const item = (entry: (typeof menu.items)[number]) => entry;
  void item;

  return createPortal(
    <div
      className="nf-menu-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        className="nf-menu"
        style={{ left, top, width }}
        role="presentation"
        onContextMenu={(event) => event.preventDefault()}
      >
        <Menu
          aria-label="Context menu"
          className="nf-menu-list"
          onAction={(key) => {
            const entry = menu.items.find((candidate) => candidate.id === String(key));
            close();
            entry?.onSelect?.();
          }}
        >
          {menu.items.map((entry) =>
            entry.separator === true ? (
              <Separator key={entry.id} className="nf-menu-separator" />
            ) : (
              <MenuItem
                key={entry.id}
                id={entry.id}
                textValue={entry.label}
                isDisabled={entry.disabled === true}
                className={({ isFocused, isDisabled }) =>
                  ['nf-menu-item', isFocused ? 'nf-menu-item-focused' : '', isDisabled ? 'nf-menu-item-disabled' : '', entry.danger === true ? 'nf-menu-item-danger' : '']
                    .filter((part) => part.length > 0)
                    .join(' ')
                }
              >
                <span>{entry.label}</span>
                {entry.shortcut === undefined ? null : <kbd className="nf-menu-shortcut">{entry.shortcut}</kbd>}
              </MenuItem>
            ),
          )}
        </Menu>
      </div>
    </div>,
    document.body,
  );
}
