import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { columnX, computeColumnWidths } from '../../lib/columns';
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
  host: HTMLElement;
  chapterId: string;
  chapterLeft: number;
  depth: number;
  rect: Rect;
}

interface AppliedVars {
  width: string;
  column: string;
}

function round(value: number): number {
  return Math.round(value * 2) / 2;
}

/** One layout read per chapter/card; no closest() walk per ancestor. */
function readCards(root: HTMLElement): CardReading[] {
  const rootRect = root.getBoundingClientRect();
  const readings: CardReading[] = [];
  for (const chapter of root.querySelectorAll<HTMLElement>('.nf-chapter')) {
    const chapterId = chapter.dataset['chapterId'] ?? '';
    const chapterLeft = round(chapter.getBoundingClientRect().left - rootRect.left);
    for (const element of chapter.querySelectorAll<HTMLElement>('[data-block-card]')) {
      const id = element.dataset['blockCard'];
      if (id === undefined || id.length === 0) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const host = element.closest<HTMLElement>('.nf-block-inner');
      if (host === null) continue;
      const depth = Number(element.dataset['depth'] ?? '0');
      readings.push({
        card: element,
        host,
        chapterId,
        chapterLeft,
        depth: Number.isFinite(depth) ? depth : 0,
        rect: {
          x: round(rect.left - rootRect.left),
          y: round(rect.top - rootRect.top),
          width: round(rect.width),
          height: round(rect.height),
        },
      });
    }
  }
  return readings;
}

function chapterColumns(readings: readonly CardReading[]): Map<string, number[]> {
  const grouped = new Map<string, Array<{ depth: number; width: number }>>();
  for (const reading of readings) {
    const list = grouped.get(reading.chapterId);
    if (list === undefined) grouped.set(reading.chapterId, [{ depth: reading.depth, width: reading.rect.width }]);
    else list.push({ depth: reading.depth, width: reading.rect.width });
  }
  const result = new Map<string, number[]>();
  for (const [chapterId, cards] of grouped) result.set(chapterId, computeColumnWidths(cards));
  return result;
}

/**
 * One ResizeObserver + rAF. Measures card rects in content coordinates so the
 * SVG overlay can live inside the same scrolling content as the cards.
 *
 * Also applies the M2d depth-column variables. The cards stay in normal flow:
 * `--nf-card-w` is the measured card width and `--nf-card-col` is the width of
 * its depth column; the child group offsets itself to the next column without
 * absolute positioning. A card is always the first item of its row, so its
 * post-layout x is exactly `columnX(widths, depth)`; we update that without a
 * second layout read.
 */
export function useBlockRects(
  containerRef: RefObject<HTMLDivElement | null>,
  version: number,
  ready: boolean,
): Map<string, Rect> {
  const [rects, setRects] = useState<Map<string, Rect>>(new Map());
  const frame = useRef<number>(0);
  const applied = useRef<WeakMap<HTMLElement, AppliedVars>>(new WeakMap());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;

    const measure = (): void => {
      const started = performance.now();
      frame.current = 0;
      const root = containerRef.current;
      if (root === null) return;
      const readings = readCards(root);

      const columnsStarted = performance.now();
      const columns = chapterColumns(readings);
      const cache = applied.current;
      for (const reading of readings) {
        const widths = columns.get(reading.chapterId);
        const columnWidth = widths?.[reading.depth] ?? reading.rect.width;
        const next: AppliedVars = {
          width: `${reading.rect.width}px`,
          column: `${columnWidth}px`,
        };
        const previous = cache.get(reading.host);
        if (previous === undefined || previous.width !== next.width) {
          reading.host.style.setProperty('--nf-card-w', next.width);
        }
        if (previous === undefined || previous.column !== next.column) {
          reading.host.style.setProperty('--nf-card-col', next.column);
        }
        cache.set(reading.host, next);
        if (widths !== undefined) {
          // The card is the first item in its row, so its post-layout x is the
          // shared depth-column origin (plus the chapter's content offset).
          reading.rect.x = round(reading.chapterLeft + columnX(widths, reading.depth));
        }
      }
      recordPerf('columns', performance.now() - columnsStarted);

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
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    for (const element of container.querySelectorAll<HTMLElement>('[data-block-card]')) {
      observer.observe(element);
    }
    const mutation = new MutationObserver(schedule);
    mutation.observe(container, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame.current !== 0) cancelAnimationFrame(frame.current);
      observer.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [containerRef, version, ready]);

  return rects;
}

export function useContentReady(ref: RefObject<HTMLDivElement | null>, editorReady: boolean): boolean {
  const [hasContent, setHasContent] = useState(false);
  useEffect(() => {
    if (!editorReady) return;
    const node = ref.current;
    if (node === null) return;
    setHasContent(node.querySelector('[data-block-card]') !== null);
  }, [ref, editorReady]);
  return hasContent;
}
