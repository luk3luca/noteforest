import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
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

/**
 * One ResizeObserver + rAF. Measures card rects in content coordinates so the
 * SVG overlay can live inside the same scrolling content as the cards.
 */
export function useBlockRects(
  containerRef: RefObject<HTMLDivElement | null>,
  version: number,
  ready: boolean,
): Map<string, Rect> {
  const [rects, setRects] = useState<Map<string, Rect>>(new Map());
  const frame = useRef<number>(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;

    const measure = (): void => {
      const started = performance.now();
      frame.current = 0;
      const root = containerRef.current;
      if (root === null) return;
      const rootRect = root.getBoundingClientRect();
      const next = new Map<string, Rect>();
      for (const element of root.querySelectorAll<HTMLElement>('[data-block-card]')) {
        const id = element.dataset['blockCard'];
        if (id === undefined || id.length === 0) continue;
        const rect = element.getBoundingClientRect();
        next.set(id, {
          x: Math.round((rect.left - rootRect.left) * 2) / 2,
          y: Math.round((rect.top - rootRect.top) * 2) / 2,
          width: Math.round(rect.width * 2) / 2,
          height: Math.round(rect.height * 2) / 2,
        });
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
