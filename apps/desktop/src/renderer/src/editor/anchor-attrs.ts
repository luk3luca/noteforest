/**
 * Shared atomic-anchor attribute (ADR-0005 §1).
 *
 * Formula and code nodes carry an additive `attrs.anchorIds` array. The DOM
 * marker is `data-anchor-ids`; the M2 single `data-anchor-id` is still read.
 */

import { normalizeAnchorIds } from '@noteforest/core';

export function anchorIdsFromElement(element: HTMLElement): string[] {
  const raw = element.getAttribute('data-anchor-ids') ?? element.getAttribute('data-anchor-id') ?? '';
  return normalizeAnchorIds(raw.split(',').map((value) => value.trim()));
}

export function anchorIdsAttribute(): Record<string, unknown> {
  return {
    default: [],
    parseHTML: (element: HTMLElement) => anchorIdsFromElement(element),
    renderHTML: (attributes: Record<string, unknown>) => {
      const ids = normalizeAnchorIds(
        Array.isArray(attributes['anchorIds']) ? (attributes['anchorIds'] as string[]) : [],
      );
      return ids.length === 0 ? {} : { 'data-anchor-ids': ids.join(',') };
    },
  };
}
