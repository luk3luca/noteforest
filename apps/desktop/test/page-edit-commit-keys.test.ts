import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SHORTCUTS,
  ariaKeyshortcuts,
  matches,
  type KeyEventLike,
} from '../src/renderer/src/lib/shortcuts';
import {
  PAGE_COMMIT_SHORTCUT_IDS,
  pageCommitReason,
} from '../src/renderer/src/page/page-edit-state';

/**
 * VF S3-1 — the Page Edit overlay's commit keys come from the catalogue.
 *
 * B1 made `lib/shortcuts.ts` the only writer of application chords; the Page
 * Edit overlay kept comparing `event.key` by hand, so a rebound catalogue key
 * would change the Settings row and every other surface but not the overlay.
 * `pageCommitReason` is now the overlay's only key decision: it asks the two
 * `page-commit-*` ids and returns the commit reason they mean.
 */

const RENDERER_SRC = resolve(import.meta.dirname, '../src/renderer/src');

/** A keyboard event that fires exactly one chord. */
function eventFor(chord: {
  key: string;
  mod?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}): KeyEventLike {
  return {
    key: chord.key,
    metaKey: chord.mod === true && chord.ctrl !== true,
    ctrlKey: chord.ctrl === true,
    shiftKey: chord.shift === true,
    altKey: chord.alt === true,
  };
}

function plain(key: string, extra: Partial<KeyEventLike> = {}): KeyEventLike {
  return { key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...extra };
}

describe('Page Edit commit keys (VF S3-1)', () => {
  it('derives a reason from every catalogue chord of the two commit ids', () => {
    const reasons = new Map<string, string | null>([
      ['page-commit-escape', 'escape'],
      ['page-commit-shortcut', 'shortcut'],
    ]);
    for (const id of PAGE_COMMIT_SHORTCUT_IDS) {
      const shortcut = SHORTCUTS.find((entry) => entry.id === id);
      expect(shortcut, `${id} exists`).toBeDefined();
      expect(shortcut?.chords.length).toBe(1);
      for (const chord of shortcut?.chords ?? []) {
        expect(pageCommitReason(eventFor(chord)), `${id}: ${chord.key}`).toBe(reasons.get(id));
      }
    }
    expect(PAGE_COMMIT_SHORTCUT_IDS).toEqual([
      'page-commit-escape',
      'page-commit-shortcut',
    ]);
  });

  it('does not answer a near miss', () => {
    // ⇧Esc belongs to the find, not the overlay.
    expect(pageCommitReason(plain('Escape', { shiftKey: true }))).toBeNull();
    // A plain Enter types a paragraph; ⌘Esc is not a commit.
    expect(pageCommitReason(plain('Enter'))).toBeNull();
    expect(pageCommitReason(plain('Escape', { metaKey: true }))).toBeNull();
    // ⌥⏎ adds a sibling in the editor keymap.
    expect(pageCommitReason(plain('Enter', { altKey: true }))).toBeNull();
  });

  it('follows a rebound catalogue chord, because the handler has no second writer', () => {
    const entry = SHORTCUTS.find((shortcut) => shortcut.id === 'page-commit-shortcut');
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const original = entry.chords;
    try {
      entry.chords = [{ key: 'e', ctrl: true }];
      // The old chord no longer commits…
      expect(pageCommitReason(plain('Enter', { metaKey: true }))).toBeNull();
      // …and the new one does, with the same reason.
      expect(matches(plain('e', { ctrlKey: true }), 'page-commit-shortcut')).toBe(true);
      expect(pageCommitReason(plain('e', { ctrlKey: true }))).toBe('shortcut');
      expect(ariaKeyshortcuts(['page-commit-shortcut'])).toBe('Control+E');
    } finally {
      entry.chords = original;
    }
    expect(pageCommitReason(plain('Enter', { metaKey: true }))).toBe('shortcut');
  });

  it('advertises the exact ARIA chord set on the overlay', async () => {
    expect(ariaKeyshortcuts(PAGE_COMMIT_SHORTCUT_IDS)).toBe('Escape Meta+Enter');
    const source = await readFile(resolve(RENDERER_SRC, 'page/PageBlockEditor.tsx'), 'utf8');
    expect(source).toContain('aria-keyshortcuts={ariaKeyshortcuts(PAGE_COMMIT_SHORTCUT_IDS)}');
  });

  it('keeps the overlay free of hand-written chord comparisons', async () => {
    const source = await readFile(resolve(RENDERER_SRC, 'page/PageBlockEditor.tsx'), 'utf8');
    // The whole file, not one handler: `event.key` in any form would be a
    // second chord writer (the guard S3-1 asks for). The visible hint reads the
    // catalogue too, so a rebound key cannot leave stale copy behind.
    expect(source).not.toMatch(/event\.key/);
    expect(source).not.toMatch(/metaKey|ctrlKey|shiftKey|altKey/);
    expect(source).not.toContain("'Escape'");
    expect(source).toContain('const reason = pageCommitReason(event);');
    expect(source).toContain("void commit(reason);");
    expect(source).toContain("shortcutHint(PAGE_COMMIT_SHORTCUT_IDS[0]");
  });
});
