/**
 * Page surface status for the shell toolbars (PG1).
 *
 * The page count and the fit-relative zoom live in `PageView`'s derived model,
 * which is measured against the real viewport. The Toolbar (page indicator,
 * zoom stepper) is a sibling of the canvas, not a child, so the surface
 * publishes the two values it owns through this one small external store.
 *
 * View state stays in the shell store: this module carries derived numbers
 * only. Nothing here is persisted, written to `document.json`, or read by the
 * print compositor and the PDF.
 */

import { PAGE_ZOOM_MAX, PAGE_ZOOM_MIN } from './scroll';

export interface PageStatus {
  packagePath: string;
  /** Derived page count of the current measured run. */
  pageCount: number;
  /** Fit-relative zoom percentage (100 = fit width). */
  percent: number;
  ready: boolean;
  updating: boolean;
}

const statuses = new Map<string, PageStatus>();
const listeners = new Set<() => void>();

function sameStatus(left: PageStatus | undefined, right: PageStatus): boolean {
  return (
    left !== undefined &&
    left.pageCount === right.pageCount &&
    left.percent === right.percent &&
    left.ready === right.ready &&
    left.updating === right.updating
  );
}

export function publishPageStatus(next: PageStatus): void {
  if (sameStatus(statuses.get(next.packagePath), next)) return;
  statuses.set(next.packagePath, next);
  for (const listener of listeners) listener();
}

export function clearPageStatus(packagePath: string): void {
  if (!statuses.delete(packagePath)) return;
  for (const listener of listeners) listener();
}

export function pageStatusFor(packagePath: string | null | undefined): PageStatus | null {
  if (packagePath === null || packagePath === undefined) return null;
  return statuses.get(packagePath) ?? null;
}

export function subscribePageStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Manual page zoom step clamp, shared by the stepper and the command paths. */
export function stepPageZoom(percent: number, deltaPercent: number): number {
  const next = (percent + deltaPercent) / 100;
  return Math.round(Math.min(PAGE_ZOOM_MAX, Math.max(PAGE_ZOOM_MIN, next)) * 100) / 100;
}
