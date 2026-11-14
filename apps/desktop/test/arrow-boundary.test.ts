import { describe, expect, it } from 'vitest';
import { arrowBoundaryAction, type ArrowBoundaryContext } from '../src/renderer/src/lib/arrow-boundary';

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
  });

  it('keeps the native path for a text or node selection', () => {
    expect(
      arrowBoundaryAction(context({ selectionEmpty: false, key: 'ArrowDown', atBlockEnd: true })),
    ).toBe('native');
    expect(
      arrowBoundaryAction(context({ selectionEmpty: false, key: 'ArrowUp', atBlockStart: true })),
    ).toBe('native');
  });

  it('only ever returns stay or native', () => {
    const outcomes = new Set<string>();
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const) {
      for (const selectionEmpty of [true, false]) {
        for (const atomic of [true, false]) {
          for (const atBlockStart of [true, false]) {
            for (const atBlockEnd of [true, false]) {
              outcomes.add(
                arrowBoundaryAction({
                  key,
                  selectionEmpty,
                  atomic,
                  atBlockStart,
                  atBlockEnd,
                }),
              );
            }
          }
        }
      }
    }
    expect([...outcomes].sort()).toEqual(['native', 'stay']);
  });
});
