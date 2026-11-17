import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMenuTemplate } from '../src/main/menu-template';
import {
  SHORTCUTS,
  ariaKeyshortcuts,
  display,
  matches,
  shortcutHint,
  shortcutIds,
  shortcutsForList,
  tiptapKeys,
  type Chord,
  type KeyEventLike,
} from '../src/renderer/src/lib/shortcuts';

const root = resolve(import.meta.dirname, '..');
const RENDERER_SRC = resolve(root, 'src/renderer/src');

/** A keyboard event that fires exactly one chord, as the handler would see it. */
function eventFor(chord: Chord): KeyEventLike {
  const code = chord.code ?? (/^[0-9]$/.test(chord.key) ? `Digit${chord.key}` : undefined);
  return {
    key: chord.key,
    ...(code === undefined ? {} : { code }),
    metaKey: chord.mod === true && chord.ctrl !== true,
    ctrlKey: chord.ctrl === true,
    shiftKey: chord.shift === true,
    altKey: chord.alt === true,
  };
}

function chordLabel(chord: Chord): string {
  return `${chord.key}${chord.code === undefined ? '' : `/${chord.code}`} mod=${
    chord.mod === true
  } ctrl=${chord.ctrl === true} shift=${chord.shift === true} alt=${chord.alt === true}`;
}

describe('shortcut catalogue', () => {
  it('has unique ids', () => {
    const ids = shortcutIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('matches every chord itself', () => {
    for (const shortcut of SHORTCUTS) {
      for (const chord of shortcut.chords) {
        expect(matches(eventFor(chord), shortcut.id), `${shortcut.id}: ${chordLabel(chord)}`).toBe(
          true,
        );
      }
    }
  });

  it('rejects the near misses a handler must not answer', () => {
    for (const shortcut of SHORTCUTS) {
      for (const chord of shortcut.chords) {
        const event = eventFor(chord);
        // A stray Shift is a different chord. `⌘+` is exempt: the plus *is* the
        // shifted character on most layouts, so its shift state is not a
        // modifier (the shipped ⌘= / ⌘+ both zoom in). A verb that declares the
        // shifted key as its second chord (`⇧Esc` closes the find) is exempt
        // for the same reason: the flip is a declared binding, not a stray one.
        if (chord.key !== '+' && shortcut.chords.length === 1) {
          expect(
            matches({ ...event, shiftKey: !event.shiftKey }, shortcut.id),
            `${shortcut.id} must not match a flipped Shift`,
          ).toBe(false);
        }
        // Dropping the primary modifier must never match a modified chord.
        if (chord.mod === true || chord.ctrl === true || chord.alt === true) {
          expect(
            matches({ ...event, metaKey: false, ctrlKey: false, altKey: false }, shortcut.id),
            `${shortcut.id} must not match without its modifiers`,
          ).toBe(false);
        }
        // An explicit `ctrl` narrows the chord: swapping Command and Control
        // must not match (`⌃E` stays a caret key, `⌃↑` stays word navigation).
        if (chord.ctrl !== undefined) {
          expect(
            matches({ ...event, metaKey: !event.metaKey, ctrlKey: !event.ctrlKey }, shortcut.id),
            `${shortcut.id} must not match a swapped Command/Control`,
          ).toBe(false);
        }
      }
    }
  });

  it('accepts the shifted plus as the same physical key', () => {
    const plus = { key: '+', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false };
    const equals = { key: '=', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false };
    expect(matches(plus, 'zoom-in')).toBe(true);
    expect(matches(equals, 'zoom-in')).toBe(true);
    expect(matches({ ...equals, shiftKey: true }, 'zoom-in')).toBe(true);
    expect(matches(equals, 'zoom-out')).toBe(false);
  });

  it('matches the shifted brackets by physical key on a US layout (P2)', () => {
    // `⇧]` types `}` on a US layout: only `KeyboardEvent.code` identifies it.
    const next = {
      key: '}',
      code: 'BracketRight',
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
    };
    expect(matches(next, 'tab-next-bracket')).toBe(true);
    expect(
      matches(
        { key: '{', code: 'BracketLeft', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false },
        'tab-previous-bracket',
      ),
    ).toBe(true);
    // The same physical key without Shift is not the chord.
    expect(matches({ ...next, key: ']', shiftKey: false }, 'tab-next-bracket')).toBe(false);
    // Neither is the same character produced by another key.
    expect(matches({ ...next, code: 'NumpadAdd' }, 'tab-next-bracket')).toBe(false);
    // The display still comes from the chord's own key.
    expect(shortcutHint('tab-next-bracket')).toBe('⇧⌘]');
    expect(shortcutHint('tab-previous-bracket')).toBe('⇧⌘[');
    // Both stay off the Settings list: the tab row already names the pair.
    expect(SHORTCUTS.find((shortcut) => shortcut.id === 'tab-next-bracket')?.list).toBe(false);
    expect(SHORTCUTS.find((shortcut) => shortcut.id === 'tab-previous-bracket')?.list).toBe(false);
  });

  it('binds Export PDF to ⌘P and leaves ⇧⌘E unbound (P2)', () => {
    const press = (key: string, extra: Partial<KeyEventLike> = {}): KeyEventLike => ({
      key,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...extra,
    });
    expect(matches(press('p'), 'export-pdf')).toBe(true);
    expect(matches(press('p', { shiftKey: true }), 'export-pdf')).toBe(false);
    // The old key is not an alias: one verb, one key.
    expect(matches(press('e', { shiftKey: true }), 'export-pdf')).toBe(false);
    expect(shortcutHint('export-pdf')).toBe('⌘P');
    expect(SHORTCUTS.find((shortcut) => shortcut.id === 'export-pdf')?.menu).toBe('CmdOrCtrl+P');
  });

  it('closes the find with Esc and ⇧Esc, and advertises neither (P2)', () => {
    const escape = { key: 'Escape', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    expect(matches(escape, 'close-find')).toBe(true);
    expect(matches({ ...escape, shiftKey: true }, 'close-find')).toBe(true);
    // The second chord is on the find-close entry only: no other Escape grows
    // a Shift variant.
    for (const shortcut of SHORTCUTS) {
      if (shortcut.id === 'close-find') continue;
      for (const chord of shortcut.chords) {
        if (chord.key !== 'Escape') continue;
        expect(chord.shift === true, `${shortcut.id} must not take ⇧Esc`).toBe(false);
      }
    }
    expect(SHORTCUTS.find((shortcut) => shortcut.id === 'close-find')?.list).toBe(false);
  });

  it('mirrors the Find menu items and their renderer-owned accelerators', () => {
    const sent: string[] = [];
    const template = buildMenuTemplate({
      isMac: true,
      send: (command) => sent.push(command),
      getWindow: () => null,
    });
    const edit = (template.find((entry) => entry.label === 'Edit')?.submenu ??
      []) as Array<{
      id?: string;
      label?: string;
      accelerator?: string;
      registerAccelerator?: boolean;
      click?: () => void;
    }>;
    const find = ['menu-find', 'menu-find-next', 'menu-find-previous'].map((id) =>
      edit.find((entry) => entry.id === id),
    );
    expect(find.map((entry) => entry?.label)).toEqual(['Find…', 'Find Next', 'Find Previous']);
    expect(find.map((entry) => entry?.accelerator)).toEqual([
      'CmdOrCtrl+F',
      'CmdOrCtrl+G',
      'CmdOrCtrl+Shift+G',
    ]);
    // The renderer owns the keys, exactly like the palette and undo/redo.
    expect(find.map((entry) => entry.registerAccelerator)).toEqual([false, false, false]);
    for (const entry of find) entry?.click?.();
    expect(sent).toEqual(['find-open', 'find-next', 'find-previous']);
    // The items sit after Undo/Redo and before the clipboard roles.
    const ids = edit.map((entry) => entry.id ?? entry.label ?? 'role');
    expect(ids.indexOf('menu-find')).toBeGreaterThan(ids.indexOf('menu-redo'));
    const cutAt = edit.findIndex((entry) => (entry as { role?: string }).role === 'cut');
    expect(ids.indexOf('menu-find-previous')).toBeLessThan(cutAt);
    // Export keeps one accelerator, now ⌘P.
    const file = (template.find((entry) => entry.label === 'File')?.submenu ?? []) as Array<{
      id?: string;
      accelerator?: string;
      registerAccelerator?: boolean;
    }>;
    const exportItem = file.find((entry) => entry.id === 'menu-export-pdf');
    expect(exportItem?.accelerator).toBe('CmdOrCtrl+P');
    expect(exportItem?.registerAccelerator).toBeUndefined();
  });

  it('never repeats a chord inside a scope', () => {
    const seen = new Map<string, string>();
    for (const shortcut of SHORTCUTS) {
      for (const chord of shortcut.chords) {
        const signature = [
          shortcut.scope,
          chord.key.toLowerCase(),
          chord.code ?? '',
          chord.mod === true,
          chord.ctrl === undefined ? 'any' : chord.ctrl,
          chord.shift === true,
          chord.alt === true,
        ].join('|');
        const owner = seen.get(signature);
        expect(owner, `${shortcut.id} repeats ${chordLabel(chord)} in scope ${shortcut.scope}`).toBe(
          undefined,
        );
        seen.set(signature, shortcut.id);
      }
    }
  });

  it('displays one stable Apple-order chord', () => {
    expect(display({ key: 'z', mod: true, shift: true })).toBe('⇧⌘Z');
    expect(display({ key: 'ArrowUp', alt: true })).toBe('⌥↑');
    expect(display({ key: 'Enter', ctrl: true })).toBe('⌃⏎');
    expect(display({ key: 'Tab', ctrl: true, shift: true })).toBe('⌃⇧⇥');
    expect(display({ key: 'Tab', ctrl: true, glyph: 'Tab' })).toBe('⌃Tab');
    expect(display({ key: '-' , mod: true })).toBe('⌘−');
    expect(display({ key: '0', mod: true, shift: true })).toBe('⇧⌘0');
    for (const shortcut of SHORTCUTS) {
      for (const chord of shortcut.chords) {
        const text = display(chord);
        expect(text.includes('⌘⇧'), `${shortcut.id} must not display the old order`).toBe(false);
        // Every modifier glyph is ordered ⌃⌥⇧⌘.
        const order = ['⌃', '⌥', '⇧', '⌘'].map((glyph) => text.indexOf(glyph)).filter((at) => at >= 0);
        expect(order).toEqual([...order].sort((left, right) => left - right));
      }
    }
  });

  it('keeps the native menu accelerators equal to the catalogue', () => {
    const template = buildMenuTemplate({
      isMac: true,
      send: () => undefined,
      getWindow: () => null,
    });
    const accelerators: string[] = [];
    const collect = (items: readonly unknown[]): void => {
      for (const item of items as Array<{ accelerator?: string; submenu?: unknown[] }>) {
        if (typeof item.accelerator === 'string') accelerators.push(item.accelerator);
        if (Array.isArray(item.submenu)) collect(item.submenu);
      }
    };
    collect(template);
    const catalogue = SHORTCUTS.flatMap((shortcut) => (shortcut.menu === undefined ? [] : [shortcut.menu]));
    expect(new Set(catalogue).size, 'no two shortcuts own one accelerator').toBe(catalogue.length);
    expect([...accelerators].sort()).toEqual([...catalogue].sort());

    // Fit page is menu-only: present, and with no accelerator at all.
    const view = template.find((entry) => entry.label === 'View');
    const labels = (view?.submenu ?? []) as Array<{ label?: string; accelerator?: string }>;
    const fitPage = labels.find((entry) => entry.label === 'Fit page');
    expect(fitPage, 'View → Fit page exists').toBeDefined();
    expect(fitPage?.accelerator).toBeUndefined();
  });

  it('round-trips the TipTap spellings of every editor entry', () => {
    const MODIFIERS = ['Mod', 'Ctrl', 'Alt', 'Shift'];
    let checked = 0;
    for (const shortcut of SHORTCUTS) {
      if (shortcut.scope !== 'editor') continue;
      const keys = tiptapKeys(shortcut.id);
      expect(keys.length).toBe(shortcut.chords.length);
      shortcut.chords.forEach((chord, index) => {
        const parts = (keys[index] ?? '').split('-');
        const name = parts.at(-1) ?? '';
        const modifiers = parts.slice(0, -1);
        expect(name.toLowerCase()).toBe(chord.key.toLowerCase());
        expect(modifiers.every((part) => MODIFIERS.includes(part))).toBe(true);
        expect(modifiers.includes('Mod')).toBe(chord.mod === true);
        expect(modifiers.includes('Ctrl')).toBe(chord.ctrl === true);
        expect(modifiers.includes('Alt')).toBe(chord.alt === true);
        expect(modifiers.includes('Shift')).toBe(chord.shift === true);
        checked += 1;
      });
    }
    expect(checked).toBeGreaterThan(10);
    expect(tiptapKeys('branch-from-selection')).toEqual(['Mod-Shift-Enter']);
    expect(tiptapKeys('highlight')).toEqual(['Mod-Shift-h']);
    expect(tiptapKeys('indent')).toEqual(['Tab']);
    expect(tiptapKeys('delete-block')).toEqual(['Mod-Backspace']);
  });

  it('renders the curated list from the same entries', () => {
    const groups = shortcutsForList();
    expect(groups.map((group) => group.group)).toEqual(['Shell', 'View', 'Editor', 'Page']);
    expect(groups.map((group) => group.rows.length)).toEqual([14, 4, 12, 4]);
    const rows = groups.flatMap((group) => group.rows);
    const ids = new Set(shortcutIds());
    const rowIds = new Set(SHORTCUTS.map((shortcut) => shortcut.row ?? shortcut.id));
    for (const row of rows) {
      // A row is a real binding: either one shortcut or the shared row of several.
      expect(ids.has(row.id) || rowIds.has(row.id), `${row.id} is a real binding`).toBe(true);
    }
    // Every displayed key comes from the catalogue, never from a literal.
    for (const group of groups) {
      for (const row of group.rows) {
        const members = SHORTCUTS.filter(
          (shortcut) =>
            shortcut.group === group.group &&
            shortcut.list !== false &&
            (shortcut.row ?? shortcut.id) === row.id,
        );
        expect(members.length).toBeGreaterThan(0);
        expect(row.keys).toBe(
          members.map((member) => member.chords.map(display).join(' / ')).join(' / '),
        );
      }
    }
    // A `list: false` binding is never advertised.
    const listed = new Set(rows.map((row) => row.id));
    for (const shortcut of SHORTCUTS) {
      if (shortcut.list === false) {
        expect(listed.has(shortcut.row ?? shortcut.id)).toBe(false);
      }
    }
    expect(rows.map((row) => row.label)).toEqual([
      'New note',
      'New chapter',
      'Open note…',
      'Save',
      'Export PDF…',
      'Close tab',
      'Reopen closed tab',
      'Next / previous tab',
      'Command palette',
      'Find in note',
      'Next / previous match',
      'Settings',
      'Toggle sidebar',
      'Undo / Redo',
      'Continuous / Page',
      'Edit / Read',
      'Zoom in / out',
      'Reset zoom',
      'Add child',
      'Add sibling',
      'Branch from selection',
      'Indent / outdent',
      'Delete block',
      'Collapse / expand',
      'Focus branch',
      'Link',
      'Link as reference',
      'Highlight',
      'Previous / next block',
      'Move block',
      'Previous / next page',
      'Open / edit the selected block',
      'Clear selection',
      'Commit Page Edit',
    ]);
    // The removed keys stay out of the list.
    const text = rows.map((row) => `${row.label} ${row.keys}`).join('\n');
    expect(text).not.toContain('⇧1');
    expect(text).not.toContain('⇧2');
    expect(text).not.toContain('Actual size');
    expect(rows.find((row) => row.id === 'page-step')?.keys).toBe('⌘↑ / ⌘↓');
    expect(rows.find((row) => row.id === 'reset-zoom')?.keys).toBe('⌘0');
  });

  it('answers a palette hint or nothing at all', () => {
    expect(shortcutHint('save')).toBe('⌘S');
    expect(shortcutHint('redo')).toBe('⇧⌘Z');
    expect(shortcutHint('page-commit-escape')).toBe('Esc');
    expect(shortcutHint('page-commit-shortcut')).toBe('⌘⏎');
    expect(ariaKeyshortcuts(['page-commit-escape', 'page-commit-shortcut'])).toBe(
      'Escape Meta+Enter',
    );
    expect(shortcutHint('focus-branch')).toBe('⇧⌘F');
    expect(shortcutHint('fit-page')).toBeUndefined();
    expect(shortcutHint('branch-from-selection')).toBe('⇧⌘⏎');
  });

  it('keeps the two Page Edit commit ids on one Settings row (VF S3-1)', () => {
    const escape = SHORTCUTS.find((shortcut) => shortcut.id === 'page-commit-escape');
    const commit = SHORTCUTS.find((shortcut) => shortcut.id === 'page-commit-shortcut');
    expect(escape?.chords).toEqual([{ key: 'Escape' }]);
    expect(commit?.chords).toEqual([{ key: 'Enter', mod: true }]);
    expect(escape?.row).toBe('page-commit');
    expect(commit?.row).toBe('page-commit');
    expect(escape?.scope).toBe('editor');
    expect(commit?.scope).toBe('editor');
    const page = shortcutsForList().find((group) => group.group === 'Page');
    expect(page?.rows.find((row) => row.id === 'page-commit')).toMatchObject({
      label: 'Commit Page Edit',
      keys: 'Esc / ⌘⏎',
    });
  });

  it('fails loudly on an unknown id', () => {
    expect(() => matches({ ...eventFor({ key: 's', mod: true }) }, 'not-a-shortcut')).toThrow(
      /Unknown shortcut id/,
    );
  });
});

/** Every renderer source file, so the glyph guard cannot miss one. */
async function rendererSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await rendererSources(path)));
    else if (/\.(ts|tsx|css)$/.test(entry.name)) files.push(path);
  }
  return files;
}

describe('keyboard source guard', () => {
  it('keeps the Apple glyph order in every renderer file', async () => {
    const files = await rendererSources(RENDERER_SRC);
    expect(files.length).toBeGreaterThan(50);
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (source.includes('⌘⇧')) violations.push(file.slice(RENDERER_SRC.length + 1));
    }
    expect(violations).toEqual([]);
  });
});
