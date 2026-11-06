/**
 * Measured right/below placement for direct primary children (M3b2c).
 *
 * The adapter builds the editor from canonical structure; this hook measures
 * the rendered cards and asks the runtime to move non-fitting direct children
 * into the below stack. The measurement is a view concern: it never touches
 * the canonical document, revision, or undo stack.
 */

import { anchoredChildBranches } from '@noteforest/core';
import { useEffect, useRef, useState } from 'react';
import { directChildBranches } from '../lib/tree';
import { planDirectChildPlacement, type DirectPlacementCandidate } from '../lib/child-placement';
import { calloutLaneWidth, calloutSafeZoneWidth, rectRight, type Rect } from '../lib/geometry';
import type { DocumentRuntime } from '../state/runtime';

interface BelowStackPlacementInput {
  runtime: DocumentRuntime;
  rects: ReadonlyMap<string, Rect>;
  /** Canvas content width in layout pixels (zoom independent). */
  availableWidth: number;
  active: boolean;
}

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

/** Last natural card width measured while the child was in the right group. */
function naturalWidth(
  cache: Map<string, number>,
  child: Rect,
  below: ReadonlySet<string>,
  id: string,
  parent: Rect,
): number {
  const currentlyRight = !below.has(id) && child.x >= rectRight(parent) - 1;
  if (currentlyRight) cache.set(id, child.width);
  return cache.get(id) ?? child.width;
}

export function useBelowStackPlacement({
  runtime,
  rects,
  availableWidth,
  active,
}: BelowStackPlacementInput): ReadonlySet<string> {
  const [applied, setApplied] = useState<ReadonlySet<string>>(new Set());
  const appliedRef = useRef<ReadonlySet<string>>(applied);
  const widthCache = useRef(new Map<string, number>());

  useEffect(() => {
    if (!active || runtime.editor === null || availableWidth <= 0) return;
    const document = runtime.document;
    const next = new Set<string>();
    // Parents that already live in a below stack: anchored callout rows plus
    // direct children already moved below. Their own direct children must also
    // stack below, otherwise the nested right group lands on the enclosing
    // parent's direct-child column (the two red rectangles in the M3g5
    // product-owner report).
    const belowStackParents = new Set<string>(appliedRef.current);
    for (const outerParentId of Object.keys(document.blocks)) {
      for (const branch of anchoredChildBranches(document, outerParentId)) {
        if (document.blocks[branch.targetBlockId] !== undefined) {
          belowStackParents.add(branch.targetBlockId);
        }
      }
    }
    for (const parentId of Object.keys(document.blocks)) {
      const direct = directChildBranches(document, parentId);
      if (direct.length === 0) continue;
      const parent = rects.get(parentId);
      if (parent === undefined) continue;
      // Anchored callouts give their parent a bounded lane. The right group
      // starts after max(parent.right, lane.right), so a narrow parent's
      // 240 px lane is part of the width budget instead of being ignored.
      // Broken targets are skipped by the adapter and do not get a lane.
      const hasCallouts = anchoredChildBranches(document, parentId).some(
        (branch) => document.blocks[branch.targetBlockId] !== undefined,
      );
      // The lane width is rounded when published to CSS; round it here too so
      // the safe-zone wrap decision and the rendered lane never disagree by a
      // sub-pixel and oscillate between measure passes.
      const laneWidth = hasCallouts
        ? Math.round(calloutLaneWidth(parent.width))
        : undefined;
      const candidates: DirectPlacementCandidate[] = [];
      for (const branch of direct) {
        const child = rects.get(branch.targetBlockId);
        if (child === undefined) break;
        candidates.push({
          id: branch.targetBlockId,
          rect: child,
          naturalWidth: naturalWidth(
            widthCache.current,
            child,
            appliedRef.current,
            branch.targetBlockId,
            parent,
          ),
        });
      }
      if (candidates.length !== direct.length) continue;
      const plan = planDirectChildPlacement({
        parent,
        children: candidates,
        availableWidth,
        laneWidth,
        calloutSafeWidth:
          laneWidth === undefined
            ? undefined
            : calloutSafeZoneWidth(parent, laneWidth),
        forceBelow: belowStackParents.has(parentId),
      });
      for (const id of plan.below) next.add(id);
    }
    if (sameIds(next, appliedRef.current)) return;
    appliedRef.current = next;
    setApplied(next);
    runtime.applyChildPlacement(next);
  }, [runtime, rects, availableWidth, active, runtime.version]);

  return applied;
}
