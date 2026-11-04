import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Rect } from '../../lib/geometry';
import { recordPerf } from '../../lib/perf';

function sameRects(left: Map<string, Rect>, right: Map<string, Rect>): boolean {
  if (left.size !== right.size) return false;
  for (const [id, rect] of left) {
    const other = right.get(id);
    if (
      other === undefined ||
      Math.abs(other.x - rect.x) > 0.5 ||
      Math.abs(other.y - rect.y) > 0.5 ||
      Math.abs(other.width - rect.width) > 0.5 ||
      Math.abs(other.height - rect.height) > 0.5
    ) {
      return false;
    }
  }
  return true;
}

interface CardReading {
  card: HTMLElement;
  rect: Rect;
}

function round(value: number): number {
  return Math.round(value * 2) / 2;
}

/** One layout read for the whole canvas; hidden cards read 0×0 and are skipped. */
function readCards(root: HTMLElement, scale: number): CardReading[] {
  const rootRect = root.getBoundingClientRect();
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const readings: CardReading[] = [];
  for (const element of root.querySelectorAll<HTMLElement>('[data-block-card]')) {
    const id = element.dataset['blockCard'];
    if (id === undefined || id.length === 0) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    readings.push({
      card: element,
      rect: {
        x: round((rect.left - rootRect.left) / factor),
        y: round((rect.top - rootRect.top) / factor),
        width: round(rect.width / factor),
        height: round(rect.height / factor),
      },
    });
  }
  return readings;
}

/**
 * One ResizeObserver + rAF. Measures card rects in content coordinates so the
 * SVG overlay can live inside the same scrolling content as the cards.
 *
 * Placement is parent-relative, so the measured x is the truth: there is no
 * depth-column correction and no second layout read. Hidden cards (collapsed
 * branches, Focus branch) are display:none and excluded, which also removes
 * their edges.
 */
export function useBlockRects(
  containerRef: RefObject<HTMLDivElement | null>,
  version: number,
  ready: boolean,
  scale = 1,
): Map<string, Rect> {
  const [rects, setRects] = useState<Map<string, Rect>>(new Map());
  const frame = useRef<number>(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    frame.current = 0;

    const observer = new ResizeObserver(() => schedule());
    const mutation = new MutationObserver(() => schedule());
    let settleInner = 0;

    const measure = (): void => {
      const started = performance.now();
      frame.current = 0;
      const root = containerRef.current;
      if (root === null) return;
      const readings = readCards(root, scale);
      for (const reading of readings) observer.observe(reading.card);

      const next = new Map<string, Rect>();
      for (const reading of readings) {
        const id = reading.card.dataset['blockCard'];
        if (id !== undefined) next.set(id, reading.rect);
      }
      setRects((previous) => (sameRects(previous, next) ? previous : next));
      recordPerf('measure', performance.now() - started);
    };

    const schedule = (): void => {
      if (frame.current !== 0) return;
      frame.current = requestAnimationFrame(measure);
    };

    schedule();
    // TipTap renders new React node views one commit after the structural
    // command's React update. A trailing pass catches that late DOM node even
    // when no childList mutation is observed on this frame; one extra measure
    // is cheap and prevents a missing edge after rapid creation.
    const settleFrame = requestAnimationFrame(() => {
      settleInner = requestAnimationFrame(schedule);
    });
    const settleTimer = setTimeout(schedule, 150);
    observer.observe(container);
    for (const element of container.querySelectorAll<HTMLElement>('[data-block-card]')) {
      observer.observe(element);
    }
    mutation.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'data-collapsed'],
    });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame.current !== 0) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
      }
      cancelAnimationFrame(settleFrame);
      if (settleInner !== 0) cancelAnimationFrame(settleInner);
      clearTimeout(settleTimer);
      observer.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [containerRef, version, ready, scale]);

  return rects;
}
