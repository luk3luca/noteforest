/**
 * Pure right/below placement for direct primary children (M3b2c).
 *
 * The editor allows horizontal scroll for a deep chain (D23/spec §7.10), so a
 * lone direct child keeps the M2 chain behaviour and stays right. When a parent
 * has two or more direct children, each child is placed right while its card
 * fits the available row; otherwise it joins the below stack. Callouts are
 * never placed by this helper: the adapter always puts them below.
 */

import { GEOMETRY, rectRight, type Rect } from './geometry';

export interface DirectPlacementCandidate {
  id: string;
  rect: Rect;
  /**
   * Width before a below-stack width cap. While a child is already below, the
   * renderer passes the last width measured in the right group so the decision
   * cannot oscillate with the narrower lane column.
   */
  naturalWidth?: number;
}

export interface ChildPlacementPlan {
  right: string[];
  below: string[];
}

export interface DirectPlacementInput {
  parent: Rect;
  children: readonly DirectPlacementCandidate[];
  /** Right edge of the available row in the same layout coordinates. */
  availableWidth: number;
  gap?: number;
  minChildWidth?: number;
  /** Keep a lone chain child right; the editor scrolls horizontally (D23). */
  keepSingleChildRight?: boolean;
}

export function planDirectChildPlacement(input: DirectPlacementInput): ChildPlacementPlan {
  const children = input.children;
  if (children.length === 0) return { right: [], below: [] };
  if ((input.keepSingleChildRight ?? true) && children.length === 1) {
    return { right: [children[0]?.id ?? ''], below: [] };
  }

  const gap = input.gap ?? GEOMETRY.childGap;
  const minChildWidth = input.minChildWidth ?? GEOMETRY.childMinWidth;
  const available = input.availableWidth - (rectRight(input.parent) + gap);
  const usable = available >= minChildWidth - 0.5;
  const right: string[] = [];
  const below: string[] = [];
  for (const child of children) {
    const width = child.naturalWidth ?? child.rect.width;
    // Preserve branch order inside each group; the below stack is assembled
    // after the callouts by the adapter.
    if (usable && width <= available + 0.5) right.push(child.id);
    else below.push(child.id);
  }
  return { right, below };
}
