/**
 * Continuous scroll position per document key.
 *
 * Navigation state only: never persisted in the document, and moved with the
 * tab key when a draft materializes so the editor keeps its exact position.
 */

const scrollPositions = new Map<string, number>();

export function recordScroll(packagePath: string, scrollTop: number): void {
  scrollPositions.set(packagePath, Math.max(0, Math.round(scrollTop)));
}

export function getScroll(packagePath: string): number {
  return scrollPositions.get(packagePath) ?? 0;
}

/** Carry one position from a draft key to its materialized package path. */
export function rekeyScroll(from: string, to: string): void {
  const value = scrollPositions.get(from);
  if (value === undefined) return;
  scrollPositions.delete(from);
  if (!scrollPositions.has(to)) scrollPositions.set(to, value);
}
