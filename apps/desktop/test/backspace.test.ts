import { describe, expect, it } from 'vitest';
import { backspaceAction, type BackspaceContext } from '../src/renderer/src/lib/backspace';

function context(overrides: Partial<BackspaceContext> = {}): BackspaceContext {
  return {
    selectionEmpty: true,
    atomic: false,
    atBlockStart: true,
    empty: true,
    hasPrevious: true,
    ...overrides,
  };
}

describe('plain Backspace is non-destructive', () => {
  it('moves to the previous block instead of deleting an empty block', () => {
    expect(backspaceAction(context())).toBe('previous');
  });

  it('stays put on the first empty block', () => {
    expect(backspaceAction(context({ hasPrevious: false }))).toBe('stay');
  });

  it('never returns a delete outcome for any input', () => {
    const outcomes = new Set<string>();
    for (const selectionEmpty of [true, false]) {
      for (const atomic of [true, false]) {
        for (const atBlockStart of [true, false]) {
          for (const empty of [true, false]) {
            for (const hasPrevious of [true, false]) {
              outcomes.add(
                backspaceAction({ selectionEmpty, atomic, atBlockStart, empty, hasPrevious }),
              );
            }
          }
        }
      }
    }
    expect([...outcomes].sort()).toEqual(['native', 'previous', 'stay']);
  });

  it('keeps the native behavior in tables, code, lists and blockquotes', () => {
    expect(backspaceAction(context({ atomic: true }))).toBe('native');
  });

  it('keeps the native behavior when the caret is not at the block start', () => {
    expect(backspaceAction(context({ atBlockStart: false }))).toBe('native');
  });

  it('keeps the native behavior in a non-empty block', () => {
    expect(backspaceAction(context({ empty: false }))).toBe('native');
  });
});
