import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_REASONS,
  appCommandIds,
  availabilityFor,
  type AppCommandId,
  type CommandContext,
} from '../src/shared/commands';

/**
 * The availability matrix (`docs/batch/plan.md` §3.3), written out once.
 *
 * Columns: N no document · NE note Continuous Edit · NR note Continuous Read ·
 * PE note Page Edit · PR note Page Read · G guest file.
 * `E` = enabled, `D(KEY)` = disabled with that reason, `H` = hidden.
 */
const MATRIX: Record<AppCommandId, readonly [string, string, string, string, string, string]> = {
  'new-document': ['E', 'E', 'E', 'E', 'E', 'E'],
  'open-document': ['E', 'E', 'E', 'E', 'E', 'E'],
  'open-markdown': ['E', 'E', 'E', 'E', 'E', 'E'],
  save: ['D(NO_DOCUMENT)', 'E', 'E', 'E', 'E', 'E'],
  'close-tab': ['E', 'E', 'E', 'E', 'E', 'E'],
  'close-window': ['E', 'E', 'E', 'E', 'E', 'E'],
  'reopen-tab': ['E', 'E', 'E', 'E', 'E', 'E'],
  'new-chapter': ['D(NO_DOCUMENT)', 'E', 'D(READ_MODE)', 'D(READ_MODE)', 'D(READ_MODE)', 'H'],
  'add-block': ['D(NO_DOCUMENT)', 'E', 'D(READ_MODE)', 'D(READ_MODE)', 'D(READ_MODE)', 'H'],
  'export-pdf': ['D(EXPORT_NO_NOTE)', 'E', 'E', 'E', 'E', 'D(GUEST_EXPORT)'],
  'rename-document': ['D(NO_DOCUMENT)', 'E', 'E', 'E', 'E', 'H'],
  reveal: ['D(NO_DOCUMENT)', 'E', 'E', 'E', 'E', 'E'],
  undo: ['D(NO_DOCUMENT)', 'E', 'D(READ_MODE)', 'D(READ_MODE)', 'D(READ_MODE)', 'E'],
  redo: ['D(NO_DOCUMENT)', 'E', 'D(READ_MODE)', 'D(READ_MODE)', 'D(READ_MODE)', 'E'],
  'find-open': ['H', 'E', 'E', 'E', 'E', 'H'],
  'find-next': ['H', 'H', 'H', 'H', 'H', 'H'],
  'find-previous': ['H', 'H', 'H', 'H', 'H', 'H'],
  'link-reference': ['D(NO_DOCUMENT)', 'E', 'D(READ_MODE)', 'D(READ_MODE)', 'D(READ_MODE)', 'H'],
  'command-palette': ['E', 'E', 'E', 'E', 'E', 'E'],
  'toggle-sidebar': ['E', 'E', 'E', 'E', 'E', 'E'],
  'zoom-in': ['D(NO_DOCUMENT)', 'E', 'E', 'E', 'E', 'H'],
  'zoom-out': ['D(NO_DOCUMENT)', 'E', 'E', 'E', 'E', 'H'],
  'zoom-reset': ['D(NO_DOCUMENT)', 'E', 'E', 'E', 'E', 'H'],
  'fit-width': ['D(NO_DOCUMENT)', 'E', 'E', 'E', 'E', 'H'],
  'fit-page': ['D(NO_DOCUMENT)', 'E', 'E', 'E', 'E', 'H'],
  'focus-branch': ['D(NO_DOCUMENT)', 'E', 'E', 'E', 'E', 'H'],
  'continuous-layout': ['D(NO_DOCUMENT)', 'E', 'E', 'E', 'E', 'H'],
  'page-layout': ['D(NO_DOCUMENT)', 'E', 'E', 'E', 'E', 'H'],
  'toggle-interaction-mode': ['E', 'E', 'E', 'E', 'E', 'E'],
  'anchor-health': ['E', 'E', 'E', 'E', 'E', 'H'],
  'tab-next': ['E', 'E', 'E', 'E', 'E', 'E'],
  'tab-previous': ['E', 'E', 'E', 'E', 'E', 'E'],
  'tab-next-bracket': ['E', 'E', 'E', 'E', 'E', 'E'],
  'tab-previous-bracket': ['E', 'E', 'E', 'E', 'E', 'E'],
  'close-find': ['H', 'H', 'H', 'H', 'H', 'H'],
  'page-previous': ['H', 'H', 'H', 'E', 'E', 'H'],
  'page-next': ['H', 'H', 'H', 'E', 'E', 'H'],
  settings: ['E', 'E', 'E', 'E', 'E', 'E'],
  'settings-shortcuts': ['E', 'E', 'E', 'E', 'E', 'E'],
  flush: ['E', 'E', 'E', 'E', 'E', 'E'],
};

function contextFor(
  document: CommandContext['document'],
  layout: CommandContext['layout'],
  mode: CommandContext['mode'],
): CommandContext {
  return {
    document,
    layout,
    mode,
    canAuthor: document === 'note' && layout === 'continuous' && mode === 'edit',
    hasSelection: true,
    findBarOpen: false,
    findActive: false,
    tabCount: 2,
  };
}

const CONTEXTS: Record<string, CommandContext> = {
  N: contextFor('none', 'continuous', 'edit'),
  NE: contextFor('note', 'continuous', 'edit'),
  NR: contextFor('note', 'continuous', 'read'),
  PE: contextFor('note', 'page', 'edit'),
  PR: contextFor('note', 'page', 'read'),
  G: contextFor('guest', 'continuous', 'edit'),
};

function expectedCell(cell: string): { kind: string; reason?: string } {
  if (cell === 'E') return { kind: 'enabled' };
  if (cell === 'H') return { kind: 'hidden' };
  const key = /^D\((.*)\)$/.exec(cell)?.[1] as keyof typeof COMMAND_REASONS | undefined;
  if (key === undefined) throw new Error(`bad matrix cell ${cell}`);
  return { kind: 'disabled', reason: COMMAND_REASONS[key] };
}

describe('the availability matrix', () => {
  it('covers every command', () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...appCommandIds()].sort());
  });

  it('yields the stated decision for all 40 commands × six contexts', () => {
    const columns = Object.keys(CONTEXTS) as Array<keyof typeof CONTEXTS>;
    const mismatches: string[] = [];
    for (const id of appCommandIds()) {
      const cells = MATRIX[id];
      columns.forEach((column, index) => {
        const actual = availabilityFor(id, CONTEXTS[column]!);
        const expected = expectedCell(cells[index]!);
        const same =
          actual.kind === expected.kind &&
          (actual.kind !== 'disabled' || actual.reason === expected.reason);
        if (!same) {
          mismatches.push(`${id} ${column}: ${JSON.stringify(actual)} != ${cells[index]}`);
        }
      });
    }
    expect(mismatches).toEqual([]);
  });

  it('reports a missing selection only on link-reference', () => {
    const context = { ...CONTEXTS.NE!, hasSelection: false };
    expect(availabilityFor('link-reference', context)).toEqual({
      kind: 'disabled',
      reason: COMMAND_REASONS.NO_SELECTION,
    });
    // Authoring is checked before the selection, as the fixed order says.
    expect(
      availabilityFor('link-reference', { ...context, canAuthor: false }),
    ).toEqual({ kind: 'disabled', reason: COMMAND_REASONS.READ_MODE });
  });

  it('steps the find only when a find surface is active', () => {
    const inactive = CONTEXTS.NE!;
    expect(availabilityFor('find-next', inactive)).toEqual({ kind: 'hidden' });
    const active = { ...inactive, findActive: true };
    expect(availabilityFor('find-next', active)).toEqual({ kind: 'enabled' });
    expect(availabilityFor('find-previous', active)).toEqual({ kind: 'enabled' });
    // The bar being open alone is not enough: Esc and the find step differ.
    expect(availabilityFor('close-find', { ...inactive, findBarOpen: true })).toEqual({
      kind: 'enabled',
    });
    expect(availabilityFor('close-find', { ...inactive, findActive: true })).toEqual({
      kind: 'hidden',
    });
  });

  it('hides the tab cycle with fewer than two tabs', () => {
    for (const id of [
      'tab-next',
      'tab-previous',
      'tab-next-bracket',
      'tab-previous-bracket',
    ] as const) {
      expect(availabilityFor(id, { ...CONTEXTS.NE!, tabCount: 1 })).toEqual({ kind: 'hidden' });
      expect(availabilityFor(id, { ...CONTEXTS.NE!, tabCount: 0 })).toEqual({ kind: 'hidden' });
    }
  });

  it('keeps the shipped read-only sentence for a locked note (D3, known issue)', () => {
    // Continuous Edit on a read-only note: canAuthor is false, so the Read
    // sentence is the shipped defect recorded in the report.
    const locked = { ...CONTEXTS.NE!, canAuthor: false };
    expect(availabilityFor('undo', locked)).toEqual({
      kind: 'disabled',
      reason: COMMAND_REASONS.READ_MODE,
    });
  });

  it('treats a recovery or missing tab as no document', () => {
    // `document: 'none'` already covers "no runtime" (recovery/missing).
    expect(availabilityFor('save', CONTEXTS.N!)).toEqual({
      kind: 'disabled',
      reason: COMMAND_REASONS.NO_DOCUMENT,
    });
    expect(availabilityFor('export-pdf', CONTEXTS.N!)).toEqual({
      kind: 'disabled',
      reason: COMMAND_REASONS.EXPORT_NO_NOTE,
    });
    expect(availabilityFor('new-document', CONTEXTS.N!)).toEqual({ kind: 'enabled' });
  });

  it('keeps the five reason sentences and no sixth', () => {
    expect(COMMAND_REASONS).toEqual({
      NO_DOCUMENT: 'Open a document first',
      READ_MODE: 'Read mode — switch to Continuous Edit to run this command',
      GUEST_EXPORT: 'Markdown files have no Page or PDF export.',
      NO_SELECTION: 'Select a block first.',
      EXPORT_NO_NOTE: 'Open a note before exporting a PDF.',
    });
  });

  it('keeps every reason literal out of the adapters', async () => {
    // The five sentences live in the manifest (and its copy test); the menu,
    // the palette, the key router, the dispatcher, the context builder, the
    // runner map and the block list read them, never respell them.
    const directory = resolve(import.meta.dirname, '../src/renderer/src/commands');
    const files = (await readdir(directory)).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBe(6);
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(resolve(directory, file), 'utf8');
      for (const [key, reason] of Object.entries(COMMAND_REASONS)) {
        if (source.includes(reason)) violations.push(`${file}: ${key}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
