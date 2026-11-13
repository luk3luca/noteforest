import { describe, expect, it } from 'vitest';
import { backspaceAction, type BackspaceContext } from '../src/renderer/src/lib/backspace';

function context(overrides: Partial<BackspaceContext> = {}): BackspaceContext {
  return {
    selectionEmpty: true,
    atomic: false,
    atBlockStart: true,
    ...overrides,
  };
}

describe('plain Backspace stays inside the block', () => {
  it('stays at the start of an empty block', () => {
    expect(backspaceAction(context())).toBe('stay');
  });

  it('stays at the start of a non-empty block', () => {
    expect(backspaceAction(context({ atBlockStart: true }))).toBe('stay');
  });

  it('keeps the native behavior when the caret is not at the block start', () => {
    expect(backspaceAction(context({ atBlockStart: false }))).toBe('native');
  });

  it('keeps the native behavior in tables, code, lists and blockquotes', () => {
    expect(backspaceAction(context({ atomic: true }))).toBe('native');
    expect(backspaceAction(context({ atomic: true, atBlockStart: false }))).toBe('native');
  });

  it('keeps the native behavior for a text or node selection', () => {
    expect(backspaceAction(context({ selectionEmpty: false }))).toBe('native');
  });

  it('never returns a structural outcome for any input', () => {
    const outcomes = new Set<string>();
    for (const selectionEmpty of [true, false]) {
      for (const atomic of [true, false]) {
        for (const atBlockStart of [true, false]) {
          outcomes.add(backspaceAction({ selectionEmpty, atomic, atBlockStart }));
        }
      }
    }
    expect([...outcomes].sort()).toEqual(['native', 'stay']);
  });
});
