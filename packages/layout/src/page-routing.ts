/**
 * Pure orthogonal router for page-local fragment edges (R2d).
 *
 * The page mapper still owns which blocks are connected and where the semantic
 * ports are. This module only turns a source point and a target fragment into an
 * obstacle-aware orthogonal polyline:
 *
 * - the route leaves the source fragment to the right and enters the target
 *   from the left whenever the page has room for a real stem;
 * - fragment card boxes are obstacles; the route never crosses a card interior
 *   and the final stem is at least `PAGE_EDGE_STYLE.stemMin` where possible;
 * - when the left of a target is outside the content box (a top-level card on
 *   the content left), the router falls back to the target top, then right,
 *   then bottom, with the same arrow/corner primitives;
 * - cardinal directions only: no cubic Bezier. Corners are rounded by
 *   `roundedPath`.
 *
 * The search is a deterministic rectilinear visibility graph over fragment card
 * edges plus source-relative lanes. It is pure: no DOM, React, or measurement.
 */

import {
  PAGE_EDGE_STYLE,
  type EdgeArrowDirection,
  type EdgePoint,
} from './edge-style.js';
import { simplifyPath } from './edge-path.js';

export interface PageRouteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PageRouteEntry = 'left' | 'right' | 'top' | 'bottom';

export interface PageRoute {
  /** Orthogonal polyline, including the anchor start and the arrow tip. */
  points: EdgePoint[];
  /** Final arrow point (on the target card edge). */
  tip: EdgePoint;
  direction: EdgeArrowDirection;
  entry: PageRouteEntry;
  /** Final straight run before the tip, in px. */
  stem: number;
  /** True only when no obstacle-free route was found; the fallback is visible. */
  blocked: boolean;
}

export interface PageRouteInput {
  /** Source point: fragment right edge, or a resolved anchor point. */
  from: EdgePoint;
  /** Semantic target port (normally the target fragment left center). */
  to: EdgePoint;
  /**
   * Source card right edge used when `from` is an anchor inside the card. The
   * x is used; the anchor y is preserved so the first stub is horizontal.
   */
  sourceExit?: EdgePoint | null;
  sourceRect?: PageRouteRect | null;
  targetRect: PageRouteRect;
  /** Every other fragment card on this page. */
  obstacles: readonly PageRouteRect[];
  bounds: { width: number; height: number };
  /**
   * Parallel-edge lane index. Distinct targets from one source share lane 0
   * (the source rail becomes a trunk, as in Continuous); duplicate edges
   * between the same two fragments get separate rails.
   */
  laneIndex?: number;
  /**
   * Semantic source port. `right` is the beside/right-group language; `bottom`
   * is the below-stack/callout language (exit the parent card at the bottom).
   */
  sourceSide?: 'right' | 'bottom';
  /**
   * Lock the semantic entry side. Tree edges pass `left`: the obstacle router
   * may still choose a path, but it may never turn a tree edge into a top/right
   * entry. A shortened stem is allowed only when the page has no room for the
   * full `stemMin`.
   */
  requiredEntry?: PageRouteEntry;
}

const EPSILON = 0.01;
const MARGIN = 1;
const DIRECTIONS: readonly EdgeArrowDirection[] = ['right', 'down', 'left', 'up'];

interface DirectionStep {
  dx: number;
  dy: number;
}

const STEPS: Record<EdgeArrowDirection, DirectionStep> = {
  right: { dx: 1, dy: 0 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  up: { dx: 0, dy: -1 },
};

function rectRight(rect: PageRouteRect): number {
  return rect.x + rect.width;
}

function rectBottom(rect: PageRouteRect): number {
  return rect.y + rect.height;
}

function sameRect(left: PageRouteRect, right: PageRouteRect): boolean {
  return (
    Math.abs(left.x - right.x) < 0.001 &&
    Math.abs(left.y - right.y) < 0.001 &&
    Math.abs(left.width - right.width) < 0.001 &&
    Math.abs(left.height - right.height) < 0.001
  );
}

function inflate(rect: PageRouteRect, by: number): PageRouteRect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + by * 2,
    height: rect.height + by * 2,
  };
}

/** Keep an inflated card inside the page content box so its border stays usable. */
function clampToBounds(
  rect: PageRouteRect,
  bounds: { width: number; height: number },
): PageRouteRect {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(bounds.width, rect.x + rect.width) - x),
    height: Math.max(0, Math.min(bounds.height, rect.y + rect.height) - y),
  };
}

/** Strict interior test: touching a card edge is allowed, entering it is not. */
function insideRect(rect: PageRouteRect, point: EdgePoint): boolean {
  return (
    point.x > rect.x + EPSILON &&
    point.x < rectRight(rect) - EPSILON &&
    point.y > rect.y + EPSILON &&
    point.y < rectBottom(rect) - EPSILON
  );
}

function insideAny(rects: readonly PageRouteRect[], point: EdgePoint): boolean {
  return rects.some((rect) => insideRect(rect, point));
}

/** True when an axis-aligned segment enters any rect's strict interior. */
function segmentHitsRect(
  start: EdgePoint,
  end: EdgePoint,
  rect: PageRouteRect,
): boolean {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const horizontal = Math.abs(start.y - end.y) < 0.001;
  if (horizontal) {
    return (
      top > rect.y + EPSILON &&
      top < rectBottom(rect) - EPSILON &&
      right > rect.x + EPSILON &&
      left < rectRight(rect) - EPSILON
    );
  }
  return (
    left > rect.x + EPSILON &&
    left < rectRight(rect) - EPSILON &&
    bottom > rect.y + EPSILON &&
    top < rectBottom(rect) - EPSILON
  );
}

function segmentFree(
  start: EdgePoint,
  end: EdgePoint,
  obstacles: readonly PageRouteRect[],
): boolean {
  return !obstacles.some((rect) => segmentHitsRect(start, end, rect));
}

function uniqueSorted(values: readonly number[]): number[] {
  const sorted = [...values].sort((left, right) => left - right);
  const result: number[] = [];
  for (const value of sorted) {
    const last = result.at(-1);
    if (last === undefined || value - last > 0.01) result.push(value);
  }
  return result;
}

function coordinateIndex(values: readonly number[], value: number): number {
  let best = -1;
  let distance = Infinity;
  for (const [index, candidate] of values.entries()) {
    const delta = Math.abs(candidate - value);
    if (delta < distance) {
      distance = delta;
      best = index;
    }
  }
  return distance <= 0.1 ? best : -1;
}

interface EntryCandidate {
  entry: PageRouteEntry;
  direction: EdgeArrowDirection;
  approach: EdgePoint;
  tip: EdgePoint;
  stem: number;
}

interface SearchInput {
  start: EdgePoint;
  approach: EdgePoint;
  obstacles: readonly PageRouteRect[];
  bounds: { width: number; height: number };
  /** Allowed first moves from the source port. */
  startDirections?: readonly EdgeArrowDirection[];
}

function buildEntries(
  input: PageRouteInput,
  target: PageRouteRect,
  searchObstacles: readonly PageRouteRect[],
  finalObstacles: readonly PageRouteRect[],
): EntryCandidate[] {
  const targetY = Math.min(
    Math.max(input.to.y, target.y + 0.5),
    rectBottom(target) - 0.5,
  );
  const centerX = target.x + target.width / 2;
  const leftAvailable = target.x - MARGIN;
  const rightAvailable = input.bounds.width - MARGIN - rectRight(target);
  const topAvailable = target.y - MARGIN;
  const bottomAvailable = input.bounds.height - MARGIN - rectBottom(target);
  const sourceBottom =
    input.sourceRect === null || input.sourceRect === undefined
      ? -Infinity
      : rectBottom(input.sourceRect);
  const targetBelow = target.y >= sourceBottom - 0.5;
  const baseOrder: PageRouteEntry[] = targetBelow
    ? ['left', 'top', 'right', 'bottom']
    : ['left', 'right', 'top', 'bottom'];
  const order: PageRouteEntry[] =
    input.requiredEntry === undefined ? baseOrder : [input.requiredEntry];
  const available: Record<PageRouteEntry, number> = {
    left: leftAvailable,
    right: rightAvailable,
    top: topAvailable,
    bottom: bottomAvailable,
  };
  const makeCandidate = (entry: PageRouteEntry, stem: number): EntryCandidate => {
    if (entry === 'left') {
      return {
        entry,
        direction: 'right',
        approach: { x: target.x - stem, y: targetY },
        tip: { x: target.x, y: targetY },
        stem,
      };
    }
    if (entry === 'right') {
      return {
        entry,
        direction: 'left',
        approach: { x: rectRight(target) + stem, y: targetY },
        tip: { x: rectRight(target), y: targetY },
        stem,
      };
    }
    if (entry === 'top') {
      return {
        entry,
        direction: 'down',
        approach: { x: centerX, y: target.y - stem },
        tip: { x: centerX, y: target.y },
        stem,
      };
    }
    return {
      entry,
      direction: 'up',
      approach: { x: centerX, y: rectBottom(target) + stem },
      tip: { x: centerX, y: rectBottom(target) },
      stem,
    };
  };
  const valid = (candidate: EntryCandidate): boolean => {
    if (insideAny(searchObstacles, candidate.approach)) return false;
    if (!segmentFree(candidate.approach, candidate.tip, finalObstacles)) return false;
    // A required entry is the semantic tree contract: it may sit exactly on the
    // content edge when the target card starts at x = 0.
    const lowerBound = input.requiredEntry === undefined ? MARGIN - 0.5 : -0.5;
    return (
      candidate.approach.x >= lowerBound &&
      candidate.approach.x <= input.bounds.width - MARGIN + 0.5 &&
      candidate.approach.y >= lowerBound &&
      candidate.approach.y <= input.bounds.height - MARGIN + 0.5
    );
  };

  // First pass: only sides that can honour the shared minimum stem. A wrapped
  // page row can sit 12 px from the content left; its left-edge stem would be
  // 11 px, so the target top is preferred instead of shortening the stem.
  const candidates: EntryCandidate[] = [];
  for (const entry of order) {
    if (available[entry] < PAGE_EDGE_STYLE.stemMin) continue;
    const candidate = makeCandidate(entry, PAGE_EDGE_STYLE.stemMin);
    if (valid(candidate)) candidates.push(candidate);
  }
  if (candidates.length > 0) return candidates;

  // Fallback: no side has a full stem inside the content box. Keep the same
  // order and shorten only as much as the page forces.
  for (const entry of order) {
    const room = available[entry];
    const full = Math.min(PAGE_EDGE_STYLE.stemMin, room);
    if (full < 1) {
      if (input.requiredEntry === undefined) continue;
      const candidate = makeCandidate(entry, 0);
      if (valid(candidate)) candidates.push(candidate);
      continue;
    }
    const stems = uniqueSorted([
      full,
      Math.max(1, full - 2),
      Math.max(1, Math.floor(full / 2)),
      1,
    ]).sort((left, right) => right - left);
    for (const stem of stems) {
      const candidate = makeCandidate(entry, stem);
      if (valid(candidate)) candidates.push(candidate);
    }
  }
  return candidates;
}

interface HeapEntry {
  cost: number;
  sequence: number;
  state: number;
}

class MinHeap {
  private readonly items: HeapEntry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: HeapEntry): void {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.less(this.items[index] as HeapEntry, this.items[parent] as HeapEntry)) break;
      [this.items[index], this.items[parent]] = [
        this.items[parent] as HeapEntry,
        this.items[index] as HeapEntry,
      ];
      index = parent;
    }
  }

  pop(): HeapEntry | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (first === undefined || last === undefined) return first;
    if (this.items.length === 0) return first;
    this.items[0] = last;
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (
        left < this.items.length &&
        this.less(this.items[left] as HeapEntry, this.items[smallest] as HeapEntry)
      ) {
        smallest = left;
      }
      if (
        right < this.items.length &&
        this.less(this.items[right] as HeapEntry, this.items[smallest] as HeapEntry)
      ) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.items[index], this.items[smallest]] = [
        this.items[smallest] as HeapEntry,
        this.items[index] as HeapEntry,
      ];
      index = smallest;
    }
    return first;
  }

  private less(left: HeapEntry, right: HeapEntry): boolean {
    if (Math.abs(left.cost - right.cost) > 1e-9) return left.cost < right.cost;
    return left.sequence < right.sequence;
  }
}

function searchOrthogonal(input: SearchInput): EdgePoint[] | null {
  const { start, approach, obstacles, bounds } = input;
  const margin = MARGIN;
  const maxX = bounds.width - margin;
  const maxY = bounds.height - margin;
  if (
    start.x < -0.5 ||
    start.y < -0.5 ||
    start.x > bounds.width + 0.5 ||
    start.y > bounds.height + 0.5
  ) {
    return null;
  }
  const xs: number[] = [margin, maxX, start.x, approach.x];
  const ys: number[] = [margin, maxY, start.y, approach.y];
  for (const rect of obstacles) {
    xs.push(rect.x, rectRight(rect));
    ys.push(rect.y, rectBottom(rect));
  }
  // Source-relative rails: the first one is the page equivalent of the
  // Continuous branch lane. Duplicate edges can move one step per parallel
  // edge so they never overdraw exactly.
  for (let index = 0; index < 4; index += 1) {
    xs.push(start.x + index * PAGE_EDGE_STYLE.pageLaneStep);
  }
  const xValues = uniqueSorted(
    xs.filter(
      (value) =>
        value >= 0 &&
        value <= bounds.width &&
        ((value >= margin - 0.01 && value <= maxX + 0.01) ||
          Math.abs(value - start.x) < 0.01 ||
          Math.abs(value - approach.x) < 0.01),
    ),
  );
  const yValues = uniqueSorted(
    ys.filter(
      (value) =>
        value >= 0 &&
        value <= bounds.height &&
        ((value >= margin - 0.01 && value <= maxY + 0.01) ||
          Math.abs(value - start.y) < 0.01 ||
          Math.abs(value - approach.y) < 0.01),
    ),
  );
  const startX = coordinateIndex(xValues, start.x);
  const startY = coordinateIndex(yValues, start.y);
  const endX = coordinateIndex(xValues, approach.x);
  const endY = coordinateIndex(yValues, approach.y);
  if (startX < 0 || startY < 0 || endX < 0 || endY < 0) return null;
  const width = xValues.length;
  const height = yValues.length;
  const nodeCount = width * height;
  const node = (xIndex: number, yIndex: number): number => yIndex * width + xIndex;
  const pointAt = (index: number): EdgePoint => {
    const yIndex = Math.floor(index / width);
    const xIndex = index - yIndex * width;
    return { x: xValues[xIndex] as number, y: yValues[yIndex] as number };
  };
  const startNode = node(startX, startY);
  const endNode = node(endX, endY);
  if (startNode === endNode) return [start, approach];

  const valid = new Uint8Array(nodeCount);
  for (let yIndex = 0; yIndex < height; yIndex += 1) {
    for (let xIndex = 0; xIndex < width; xIndex += 1) {
      const index = node(xIndex, yIndex);
      const point = pointAt(index);
      valid[index] = insideAny(obstacles, point) ? 0 : 1;
    }
  }
  valid[startNode] = 1;
  valid[endNode] = 1;

  const horizontalFree = new Uint8Array(height * Math.max(0, width - 1));
  for (let yIndex = 0; yIndex < height; yIndex += 1) {
    for (let xIndex = 0; xIndex + 1 < width; xIndex += 1) {
      const from = { x: xValues[xIndex] as number, y: yValues[yIndex] as number };
      const to = { x: xValues[xIndex + 1] as number, y: yValues[yIndex] as number };
      horizontalFree[yIndex * (width - 1) + xIndex] = segmentFree(from, to, obstacles) ? 1 : 0;
    }
  }
  const verticalFree = new Uint8Array(Math.max(0, height - 1) * width);
  for (let xIndex = 0; xIndex < width; xIndex += 1) {
    for (let yIndex = 0; yIndex + 1 < height; yIndex += 1) {
      const from = { x: xValues[xIndex] as number, y: yValues[yIndex] as number };
      const to = { x: xValues[xIndex] as number, y: yValues[yIndex + 1] as number };
      verticalFree[yIndex * width + xIndex] = segmentFree(from, to, obstacles) ? 1 : 0;
    }
  }

  const stateCount = nodeCount * 4;
  const best = new Float64Array(stateCount).fill(Infinity);
  const previous = new Int32Array(stateCount).fill(-1);
  const heap = new MinHeap();
  let sequence = 0;
  const push = (nodeIndex: number, directionIndex: number, cost: number, previousState: number): void => {
    const state = nodeIndex * 4 + directionIndex;
    if (cost >= (best[state] as number) - 1e-9) return;
    best[state] = cost;
    previous[state] = previousState;
    heap.push({ cost, sequence, state });
    sequence += 1;
  };

  // The source port leaves through its lane horizontally. From the lane the
  // route may turn vertically; it never turns back into the source card.
  const startDirections = input.startDirections ?? ['right', 'down', 'up'];
  const seeds: Array<[EdgeArrowDirection, number]> = startDirections.map((direction) => [
    direction,
    DIRECTIONS.indexOf(direction),
  ]);
  for (const [direction, directionIndex] of seeds) {
    const step = STEPS[direction];
    const nextX = startX + step.dx;
    const nextY = startY + step.dy;
    if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
    const nextNode = node(nextX, nextY);
    if (valid[nextNode] === 0) continue;
    let free: boolean;
    if (step.dx !== 0) {
      const edgeX = Math.min(startX, nextX);
      free = horizontalFree[startY * (width - 1) + edgeX] === 1;
    } else {
      const edgeY = Math.min(startY, nextY);
      free = verticalFree[edgeY * width + startX] === 1;
    }
    if (!free) continue;
    const from = pointAt(startNode);
    const to = pointAt(nextNode);
    push(nextNode, directionIndex, Math.abs(to.x - from.x) + Math.abs(to.y - from.y), -1);
  }

  let finalState = -1;
  while (heap.size > 0) {
    const entry = heap.pop() as HeapEntry;
    if (entry.cost > (best[entry.state] as number) + 1e-9) continue;
    const state = entry.state;
    const directionIndex = state % 4;
    const nodeIndex = (state - directionIndex) / 4;
    if (nodeIndex === endNode) {
      finalState = state;
      break;
    }
    const yIndex = Math.floor(nodeIndex / width);
    const xIndex = nodeIndex - yIndex * width;
    for (let nextDirection = 0; nextDirection < 4; nextDirection += 1) {
      const direction = DIRECTIONS[nextDirection] as EdgeArrowDirection;
      const step = STEPS[direction];
      const nextX = xIndex + step.dx;
      const nextY = yIndex + step.dy;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
      const nextNode = node(nextX, nextY);
      if (valid[nextNode] === 0) continue;
      let free: boolean;
      if (step.dx !== 0) {
        const edgeX = Math.min(xIndex, nextX);
        free = horizontalFree[yIndex * (width - 1) + edgeX] === 1;
      } else {
        const edgeY = Math.min(yIndex, nextY);
        free = verticalFree[edgeY * width + xIndex] === 1;
      }
      if (!free) continue;
      const from = pointAt(nodeIndex);
      const to = pointAt(nextNode);
      const turn = nextDirection === directionIndex ? 0 : PAGE_EDGE_STYLE.pageTurnPenalty;
      push(
        nextNode,
        nextDirection,
        entry.cost + Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + turn,
        state,
      );
    }
  }

  if (finalState < 0) return null;
  const nodes: number[] = [];
  let state = finalState;
  while (state >= 0) {
    const directionIndex = state % 4;
    const nodeIndex = (state - directionIndex) / 4;
    nodes.push(nodeIndex);
    state = previous[state] as number;
  }
  nodes.reverse();
  const points: EdgePoint[] = [start];
  for (const nodeIndex of nodes) {
    const point = pointAt(nodeIndex);
    const last = points.at(-1);
    if (
      last === undefined ||
      Math.abs(last.x - point.x) > 0.01 ||
      Math.abs(last.y - point.y) > 0.01
    ) {
      points.push(point);
    }
  }
  const last = points.at(-1);
  if (last === undefined || Math.abs(last.x - approach.x) > 0.1 || Math.abs(last.y - approach.y) > 0.1) {
    points.push(approach);
  }
  return simplifyPath(points);
}

function fallbackRoute(
  start: EdgePoint,
  input: PageRouteInput,
  entry: EntryCandidate | null,
): PageRoute {
  const tip =
    entry?.tip ??
    {
      x: input.targetRect.x,
      y: Math.min(
        Math.max(input.to.y, input.targetRect.y + 0.5),
        rectBottom(input.targetRect) - 0.5,
      ),
    };
  const direction = entry?.direction ?? (input.sourceSide === 'bottom' ? 'down' : 'right');
  if (input.requiredEntry === 'left') {
    // Keep the semantic tree entry even when the obstacle search found no
    // candidate: the visible fallback still points into the target's left edge.
    const railX =
      input.sourceSide === 'bottom'
        ? Math.max(0, Math.min(start.x, tip.x - 0.5))
        : Math.max(
            MARGIN,
            Math.min(start.x + PAGE_EDGE_STYLE.laneMin, Math.max(MARGIN, tip.x - 1)),
          );
    const points = simplifyPath([
      start,
      { x: railX, y: start.y },
      { x: railX, y: tip.y },
      tip,
    ]);
    return {
      points,
      tip,
      direction: 'right',
      entry: 'left',
      stem: Math.max(0, tip.x - railX),
      blocked: true,
    };
  }
  if (input.sourceSide === 'bottom') {
    const points = simplifyPath([
      start,
      { x: start.x, y: tip.y },
      { x: tip.x, y: tip.y },
      tip,
    ]);
    return {
      points,
      tip,
      direction,
      entry: entry?.entry ?? 'top',
      stem: entry?.stem ?? 0,
      blocked: true,
    };
  }
  const railX = Math.min(
    Math.max(start.x + PAGE_EDGE_STYLE.laneMin, MARGIN),
    Math.max(MARGIN, input.bounds.width - MARGIN),
  );
  const points = simplifyPath([
    start,
    { x: railX, y: start.y },
    { x: railX, y: tip.y },
    { x: tip.x, y: tip.y },
    tip,
  ]);
  return {
    points,
    tip,
    direction,
    entry: entry?.entry ?? 'left',
    stem: entry?.stem ?? 0,
    blocked: true,
  };
}

/**
 * Route one same-page page edge around the fragment cards on its page.
 *
 * `from` remains the visual start (an anchor point or a fragment right edge).
 * When it is an anchor, `sourceExit` is the source card right edge at the same
 * y; the short hidden stub inside the source card is part of the returned
 * polyline so the renderer and the print model share one geometry.
 */
export function routePageEdge(input: PageRouteInput): PageRoute {
  const from = input.from;
  const target = input.targetRect;
  const sourceSide = input.sourceSide ?? 'right';
  const sourceRight =
    input.sourceRect === null || input.sourceRect === undefined
      ? from.x
      : rectRight(input.sourceRect);
  const sourceBottom =
    input.sourceRect === null || input.sourceRect === undefined
      ? from.y
      : rectBottom(input.sourceRect);
  let exit: EdgePoint;
  if (sourceSide === 'bottom') {
    exit = {
      x: Math.min(Math.max(from.x, MARGIN), Math.max(MARGIN, input.bounds.width - MARGIN)),
      y: sourceBottom,
    };
  } else {
    exit =
      input.sourceExit === null || input.sourceExit === undefined
        ? from
        : {
            x: Math.max(from.x, sourceRight),
            // The anchor stub is horizontal by contract; never let a caller's
            // sourceExit y turn the first segment into a diagonal.
            y: from.y,
          };
  }
  const rawObstacles: PageRouteRect[] = [];
  const others: PageRouteRect[] = [];
  for (const obstacle of input.obstacles) {
    if (input.sourceRect && sameRect(obstacle, input.sourceRect)) continue;
    if (sameRect(obstacle, target)) continue;
    others.push(obstacle);
    rawObstacles.push(obstacle);
  }
  if (input.sourceRect) rawObstacles.push(input.sourceRect);
  rawObstacles.push(target);
  const clearance = PAGE_EDGE_STYLE.pageClearance;
  // Search obstacles keep every card (including source/target) clear by the
  // visual clearance. The source exit stub and the target entry stem are the
  // only segments allowed to cross that clearance; they are checked against
  // the raw card boxes below.
  const searchObstacles = rawObstacles.map((rect) =>
    clampToBounds(inflate(rect, clearance), input.bounds),
  );
  const finalObstacles = [
    ...others.map((rect) => clampToBounds(inflate(rect, clearance), input.bounds)),
    ...(input.sourceRect ? [input.sourceRect] : []),
    target,
  ];
  const searchStart =
    sourceSide === 'bottom'
      ? {
          x: exit.x,
          y: Math.min(
            input.bounds.height - MARGIN,
            Math.max(MARGIN, exit.y + PAGE_EDGE_STYLE.pageClearance + 1),
          ),
        }
      : input.sourceRect
        ? {
            x: Math.min(
              input.bounds.width,
              Math.max(
                exit.x,
                exit.x +
                  Math.max(
                    PAGE_EDGE_STYLE.pageClearance,
                    PAGE_EDGE_STYLE.laneMin + (input.laneIndex ?? 0) * PAGE_EDGE_STYLE.pageLaneStep,
                  ),
              ),
            ),
            y: exit.y,
          }
        : exit;
  const entries = buildEntries(input, target, searchObstacles, finalObstacles);
  if (entries.length === 0) {
    return fallbackRoute(exit, input, null);
  }
  for (const entry of entries) {
    const points = searchOrthogonal({
      start: searchStart,
      approach: entry.approach,
      obstacles: searchObstacles,
      bounds: input.bounds,
      startDirections:
        sourceSide === 'bottom' ? ['down', 'left', 'right'] : undefined,
    });
    if (points === null) continue;
    const routePoints = simplifyPath([from, exit, ...points, entry.tip]);
    return {
      points: routePoints,
      tip: entry.tip,
      direction: entry.direction,
      entry: entry.entry,
      stem: entry.stem,
      blocked: false,
    };
  }
  return fallbackRoute(exit, input, entries[0] ?? null);
}

/** Straight horizontal page-edge indicator; still uses the shared arrow style. */
export function straightPageRoute(
  from: EdgePoint,
  to: EdgePoint,
  direction: EdgeArrowDirection = 'right',
): PageRoute {
  const horizontal = Math.abs(from.y - to.y) < 0.5;
  return {
    points: [from, to],
    tip: to,
    direction: horizontal && to.x < from.x ? 'left' : direction,
    entry: 'left',
    stem: horizontal ? Math.abs(to.x - from.x) : 0,
    blocked: false,
  };
}

/** Midpoint along the polyline, used to place author labels on the route. */
export function pageRouteMidpoint(points: readonly EdgePoint[]): EdgePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0] as EdgePoint;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1] as EdgePoint;
    const current = points[index] as EdgePoint;
    total += Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y);
  }
  const half = total / 2;
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1] as EdgePoint;
    const current = points[index] as EdgePoint;
    const length = Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y);
    if (walked + length >= half) {
      const ratio = length === 0 ? 0 : (half - walked) / length;
      return {
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
      };
    }
    walked += length;
  }
  return points.at(-1) as EdgePoint;
}

/** Test/oracle helper: true when the route enters a fragment card interior. */
export function routeIntersectsRect(route: PageRoute, rect: PageRouteRect): boolean {
  for (let index = 1; index < route.points.length; index += 1) {
    const previous = route.points[index - 1] as EdgePoint;
    const current = route.points[index] as EdgePoint;
    if (segmentHitsRect(previous, current, rect)) return true;
  }
  return false;
}

/** Test/oracle helper: every segment is exactly horizontal or vertical. */
export function isOrthogonalRoute(points: readonly EdgePoint[]): boolean {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1] as EdgePoint;
    const current = points[index] as EdgePoint;
    if (Math.abs(previous.x - current.x) > 0.01 && Math.abs(previous.y - current.y) > 0.01) {
      return false;
    }
  }
  return true;
}
