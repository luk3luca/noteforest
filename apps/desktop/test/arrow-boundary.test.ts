import { describe, expect, it } from 'vitest';
import {
  arrowBoundaryAction,
  visualLineBands,
  visualLineBoundary,
  type ArrowBoundaryContext,
} from '../src/renderer/src/lib/arrow-boundary';

function context(overrides: Partial<ArrowBoundaryContext> = {}): ArrowBoundaryContext {
  return {
    key: 'ArrowDown',
    selectionEmpty: true,
    atomic: false,
    atBlockStart: false,
    atBlockEnd: false,
    ...overrides,
  };
}

describe('plain arrows stay inside the block', () => {
  it('consumes the outward key at the matching boundary', () => {
    expect(arrowBoundaryAction(context({ key: 'ArrowUp', atBlockStart: true }))).toBe('stay');
    expect(arrowBoundaryAction(context({ key: 'ArrowLeft', atBlockStart: true }))).toBe('stay');
    expect(arrowBoundaryAction(context({ key: 'ArrowDown', atBlockEnd: true }))).toBe('stay');
    expect(arrowBoundaryAction(context({ key: 'ArrowRight', atBlockEnd: true }))).toBe('stay');
  });

  it('never consumes the inward key or a key at the other boundary', () => {
    expect(arrowBoundaryAction(context({ key: 'ArrowDown', atBlockStart: true }))).toBe('native');
    expect(arrowBoundaryAction(context({ key: 'ArrowUp', atBlockEnd: true }))).toBe('native');
    expect(arrowBoundaryAction(context({ key: 'ArrowRight', atBlockStart: true }))).toBe('native');
    expect(arrowBoundaryAction(context({ key: 'ArrowLeft', atBlockEnd: true }))).toBe('native');
  });

  it('keeps the native path inside code blocks and tables', () => {
    expect(
      arrowBoundaryAction(context({ atomic: true, key: 'ArrowDown', atBlockEnd: true })),
    ).toBe('native');
    expect(
      arrowBoundaryAction(context({ atomic: true, key: 'ArrowUp', atBlockStart: true })),
    ).toBe('native');
    expect(
      arrowBoundaryAction(context({ atomic: true, key: 'ArrowLeft', atBlockStart: true })),
    ).toBe('native');
    expect(
      arrowBoundaryAction(context({ atomic: true, key: 'ArrowRight', atBlockEnd: true })),
    ).toBe('native');
  });

  it('keeps the native path for a text selection', () => {
    expect(
      arrowBoundaryAction(context({ selectionEmpty: false, key: 'ArrowDown', atBlockEnd: true })),
    ).toBe('native');
    expect(
      arrowBoundaryAction(context({ selectionEmpty: false, key: 'ArrowUp', atBlockStart: true })),
    ).toBe('native');
  });

  it('treats a selected atom at the block end as the boundary, never a move', () => {
    // The editor keymap reads the boundary from the selected node's end and
    // passes it as `atBlockEnd`; the atom is consumed, never replaced by its
    // source text or turned into a block move.
    expect(arrowBoundaryAction(context({ key: 'ArrowRight', atBlockEnd: true }))).toBe('stay');
    expect(arrowBoundaryAction(context({ key: 'ArrowDown', atBlockEnd: true }))).toBe('stay');
    expect(arrowBoundaryAction(context({ key: 'ArrowRight', atBlockEnd: false }))).toBe('native');
  });

  it('only ever returns stay or native', () => {
    const outcomes = new Set<string>();
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const) {
      for (const selectionEmpty of [true, false]) {
        for (const atomic of [true, false]) {
          for (const atBlockStart of [true, false]) {
            for (const atBlockEnd of [true, false]) {
              for (const atFirstLine of [true, false, undefined]) {
                for (const atLastLine of [true, false, undefined]) {
                  outcomes.add(
                    arrowBoundaryAction({
                      key,
                      selectionEmpty,
                      atomic,
                      atBlockStart,
                      atBlockEnd,
                      atFirstLine,
                      atLastLine,
                    }),
                  );
                }
              }
            }
          }
        }
      }
    }
    expect([...outcomes].sort()).toEqual(['native', 'stay']);
  });
});

describe('the vertical guard follows the visual line', () => {
  it('consumes a mid-line caret on the first or last line', () => {
    // A caret mid-word is not at the paragraph start/end offset, but it is
    // still on the boundary line: the key must stay.
    expect(
      arrowBoundaryAction(context({ key: 'ArrowUp', atFirstLine: true, atBlockStart: false })),
    ).toBe('stay');
    expect(
      arrowBoundaryAction(context({ key: 'ArrowDown', atLastLine: true, atBlockEnd: false })),
    ).toBe('stay');
  });

  it('keeps the native path between the first and last line', () => {
    expect(
      arrowBoundaryAction(
        context({ key: 'ArrowUp', atFirstLine: false, atBlockStart: false }),
      ),
    ).toBe('native');
    expect(
      arrowBoundaryAction(context({ key: 'ArrowDown', atLastLine: false, atBlockEnd: false })),
    ).toBe('native');
  });

  it('falls back to the offset boundary when the geometry is unavailable', () => {
    expect(arrowBoundaryAction(context({ key: 'ArrowUp', atBlockStart: true }))).toBe('stay');
    expect(arrowBoundaryAction(context({ key: 'ArrowDown', atBlockEnd: true }))).toBe('stay');
  });

  it('never lets the line geometry widen the horizontal guard', () => {
    expect(
      arrowBoundaryAction(
        context({ key: 'ArrowLeft', atBlockStart: false, atFirstLine: true }),
      ),
    ).toBe('native');
    expect(
      arrowBoundaryAction(context({ key: 'ArrowRight', atBlockEnd: false, atLastLine: true })),
    ).toBe('native');
  });
});

describe('visual line bands', () => {
  const bands = visualLineBands([
    { top: 100, bottom: 124 },
    { top: 100, bottom: 124 },
    { top: 124, bottom: 148 },
    { top: 148, bottom: 172 },
  ]);

  it('merges fragments of one line and keeps separate lines apart', () => {
    expect(bands).toEqual([
      { top: 100, bottom: 124 },
      { top: 124, bottom: 148 },
      { top: 148, bottom: 172 },
    ]);
  });

  it('reports a mid-line caret on the first or last line', () => {
    expect(visualLineBoundary({ top: 102, bottom: 120 }, bands)).toEqual({
      atFirstLine: true,
      atLastLine: false,
    });
    expect(visualLineBoundary({ top: 152, bottom: 170 }, bands)).toEqual({
      atFirstLine: false,
      atLastLine: true,
    });
  });

  it('reports neither boundary on a middle line', () => {
    expect(visualLineBoundary({ top: 128, bottom: 146 }, bands)).toEqual({
      atFirstLine: false,
      atLastLine: false,
    });
  });

  it('reports both boundaries for a single-line block', () => {
    const single = visualLineBands([{ top: 100, bottom: 124 }]);
    expect(visualLineBoundary({ top: 104, bottom: 122 }, single)).toEqual({
      atFirstLine: true,
      atLastLine: true,
    });
  });

  it('reports neither boundary when the caret is outside every line', () => {
    expect(visualLineBoundary({ top: 300, bottom: 320 }, bands)).toEqual({
      atFirstLine: false,
      atLastLine: false,
    });
  });

  it('ignores empty and inverted rects', () => {
    expect(
      visualLineBands([
        { top: 100, bottom: 100 },
        { top: 100, bottom: 124 },
      ]),
    ).toEqual([{ top: 100, bottom: 124 }]);
  });
});
