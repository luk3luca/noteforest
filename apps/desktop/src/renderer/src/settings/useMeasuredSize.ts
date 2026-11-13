/**
 * Small measured-element hook for the Settings preview rail.
 *
 * The rail size is CSS-driven (clamp width, flex height), so a preview that
 * must never clip cannot hard-code its scale. This hook reports the element's
 * content box and re-measures on resize; callers derive a uniform scale from
 * the value. No polling and no fixed delays.
 *
 * It uses a callback ref, so a preview that swaps between conditional states
 * (sample → document → empty) re-attaches the observer to the new element
 * instead of keeping a stale null node.
 */

import { useLayoutEffect, useState } from 'react';

export interface MeasuredSize {
  width: number;
  height: number;
}

const EMPTY: MeasuredSize = { width: 0, height: 0 };

function sameSize(left: MeasuredSize, right: MeasuredSize): boolean {
  return (
    Math.abs(left.width - right.width) <= 0.5 &&
    Math.abs(left.height - right.height) <= 0.5
  );
}

export function useMeasuredElement(): {
  ref: (node: HTMLElement | null) => void;
  size: MeasuredSize;
} {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<MeasuredSize>(EMPTY);

  useLayoutEffect(() => {
    if (node === null) {
      setSize(EMPTY);
      return undefined;
    }
    const update = (): void => {
      // getBoundingClientRect keeps the sub-pixel height the scale depends on;
      // clientHeight rounds to an integer and can overflow by up to 0.5 px.
      const rect = node.getBoundingClientRect();
      const next = { width: rect.width, height: rect.height };
      setSize((previous) => (sameSize(previous, next) ? previous : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [node]);

  return { ref: setNode, size };
}
