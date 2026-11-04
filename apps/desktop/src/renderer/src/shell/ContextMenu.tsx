import { Menu, MenuItem, Separator } from 'react-aria-components';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from '../state/shell';

export function ContextMenu(): JSX.Element | null {
  const menu = useShell((state) => state.contextMenu);
  const close = useShell((state) => state.closeContextMenu);
  const ref = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);

  // Capture before descendants mount and move focus into the menu. A passive
  // effect runs after the menu's own auto-focus and would record the first
  // item instead of the control that opened the menu.
  if (menu !== null && !openRef.current) {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  openRef.current = menu !== null;

  useEffect(() => {
    if (menu === null) return undefined;
    const previousFocus = previousFocusRef.current;
    const focusableItems = (): HTMLElement[] => [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? []),
    ];
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusableItems();
      if (items.length === 0) return;
      // Trap Tab in both directions, including when focus starts outside the
      // menu (for example after a click on a non-focusable row).
      event.preventDefault();
      event.stopPropagation();
      const active = document.activeElement;
      const current = active instanceof HTMLElement ? items.indexOf(active) : -1;
      const next =
        current < 0
          ? event.shiftKey
            ? items.length - 1
            : 0
          : (current + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    };
    window.addEventListener('keydown', onKeyDown, true);
    // React Aria renders the collection through a portal in a later commit, so
    // wait until every action exists before focusing the first one. Focusing a
    // partially rendered menu could land on an arbitrary item.
    const expected = menu.items.filter(
      (entry) => entry.separator !== true && entry.disabled !== true,
    ).length;
    let frame = 0;
    let attempts = 0;
    const focusFirst = (): void => {
      const items = focusableItems();
      if (expected === 0) return;
      if (items.length >= expected && items[0] !== undefined) {
        items[0].focus();
        return;
      }
      attempts += 1;
      if (attempts < 20) frame = requestAnimationFrame(focusFirst);
    };
    focusFirst();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown, true);
      if (previousFocus === null || !previousFocus.isConnected) return;
      // Restore only when the close did not hand focus to a dialog or palette;
      // those surfaces own their own initial focus.
      requestAnimationFrame(() => {
        const state = useShell.getState();
        if (state.contextMenu !== null || state.dialog !== null || state.paletteOpen) return;
        const active = document.activeElement;
        const insideMenu =
          active instanceof HTMLElement && active.closest('.nf-menu') !== null;
        const onBody = active === null || active === document.body;
        // A menu action may deliberately focus a block or another surface.
        // Only bring focus back when the menu still owns it (or it fell to the
        // page body when the focused item unmounted).
        if (!insideMenu && !onBody) return;
        previousFocus.focus();
      });
    };
  }, [menu, close]);

  if (menu === null) return null;
  const width = 224;
  const height = menu.items.length * 28 + 12;
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - height - 8));

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
