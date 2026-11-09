/**
 * Renderer-side asset URL resolution shared by Page Read and PDF export.
 *
 * The canonical document indexes content-addressed assets; the session
 * availability map records files observed missing or changed. Failed assets
 * never get a display URL, so every surface renders the same placeholder
 * instead of a broken image. There is no filesystem path in the renderer.
 */

import type { AssetAvailabilityState } from '@noteforest/core';
import type { DocumentRuntime } from '../state/runtime';
import { assetUrlFor } from '../lib/asset-url';

export interface AssetSource {
  document: { assets: Record<string, unknown> };
  assetAvailability: Readonly<Record<string, AssetAvailabilityState>>;
}

/** Display URLs for assets that are not known failed. */
export function assetUrlsForRuntime(source: AssetSource): Record<string, string> {
  const urls: Record<string, string> = {};
  const availability = source.assetAvailability;
  for (const assetId of Object.keys(source.document.assets)) {
    const state = availability[assetId];
    if (state === undefined || state === 'available') {
      urls[assetId] = assetUrlFor(assetId);
    }
  }
  return urls;
}

/** Asset ids observed missing or changed in this open session. */
export function failedAssetIdsForRuntime(source: AssetSource): string[] {
  return Object.entries(source.assetAvailability)
    .filter(([, state]) => state !== 'available')
    .map(([assetId]) => assetId)
    .sort();
}
