import { describe, expect, it } from 'vitest';
import {
  chooseHistoryRoute,
  type HistoryRouteInput,
} from '../src/renderer/src/lib/history-routing';

function route(overrides: Partial<HistoryRouteInput> = {}): HistoryRouteInput {
  return {
    action: 'undo',
    lastOperation: null,
    textAvailable: false,
    structuralAvailable: false,
    editorFocused: true,
    ...overrides,
  };
}

describe('undo/redo routing', () => {
  it('prefers text when the last operation was text', () => {
    expect(
      chooseHistoryRoute(
        route({ lastOperation: 'text', textAvailable: true, structuralAvailable: true }),
      ),
    ).toEqual({ kind: 'text', fallback: false });
  });

  it('prefers structural when the last operation was structural', () => {
    expect(
      chooseHistoryRoute(
        route({ lastOperation: 'structural', textAvailable: true, structuralAvailable: true }),
      ),
    ).toEqual({ kind: 'structural', fallback: false });
  });

  it('falls back to the structural stack when the preferred text stack is empty', () => {
    expect(
      chooseHistoryRoute(
        route({ lastOperation: 'text', textAvailable: false, structuralAvailable: true }),
      ),
    ).toEqual({ kind: 'structural', fallback: true });
  });

  it('falls back to the text stack when the preferred structural stack is empty', () => {
    expect(
      chooseHistoryRoute(
        route({ lastOperation: 'structural', textAvailable: true, structuralAvailable: false }),
      ),
    ).toEqual({ kind: 'text', fallback: true });
  });

  it('routes to neither stack when both are empty', () => {
    expect(
      chooseHistoryRoute(
        route({ lastOperation: 'text', textAvailable: false, structuralAvailable: false }),
      ),
    ).toEqual({ kind: null, fallback: false });
    expect(
      chooseHistoryRoute(
        route({ lastOperation: 'structural', textAvailable: false, structuralAvailable: false }),
      ),
    ).toEqual({ kind: null, fallback: false });
  });

  it('falls back at most once per command (no loop between stacks)', () => {
    const decisions = [
      chooseHistoryRoute(route({ lastOperation: 'text', structuralAvailable: true })),
      chooseHistoryRoute(route({ lastOperation: 'structural', textAvailable: true })),
      chooseHistoryRoute(route({ lastOperation: 'text' })),
    ];
    expect(decisions.map((decision) => decision.fallback)).toEqual([true, true, false]);
    expect(decisions.map((decision) => decision.kind)).toEqual(['structural', 'text', null]);
  });

  it('uses focus only when there is no previous operation', () => {
    expect(
      chooseHistoryRoute(
        route({ lastOperation: null, textAvailable: true, structuralAvailable: true, editorFocused: true }),
      ),
    ).toEqual({ kind: 'text', fallback: false });
    expect(
      chooseHistoryRoute(
        route({
          lastOperation: null,
          textAvailable: true,
          structuralAvailable: true,
          editorFocused: false,
        }),
      ),
    ).toEqual({ kind: 'structural', fallback: false });
  });

  it('applies the same preference to redo', () => {
    expect(
      chooseHistoryRoute(
        route({ action: 'redo', lastOperation: 'text', textAvailable: true, structuralAvailable: true }),
      ),
    ).toEqual({ kind: 'text', fallback: false });
    expect(
      chooseHistoryRoute(
        route({
          action: 'redo',
          lastOperation: 'text',
          textAvailable: false,
          structuralAvailable: true,
        }),
      ),
    ).toEqual({ kind: 'structural', fallback: true });
  });
});
