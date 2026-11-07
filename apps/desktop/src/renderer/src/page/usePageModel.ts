/**
 * Page model hook.
 *
 * Recomputes the derived pages from the runtime's canonical revision. Work is
 * debounced (typing and structural commands run in bursts), every stale run is
 * aborted, and the measurement host is disposed in the same task that created
 * it. A failed measurement never touches the continuous editor: the page
 * layout owns the error surface and the continuous editor remains mounted and
 * editable underneath.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  ContinuousLayout,
  DerivedPage,
  LayoutDefect,
} from '@noteforest/layout';
import type { DocumentRuntime } from '../state/runtime';
import { assetUrlFor } from '../lib/asset-url';
import { toLayoutDocument } from './adapter';
import { createDomPageMeasurement } from './measurement';
import { computePageModel, type PageModelData } from './model';

const DEBOUNCE_MS = 150;

export interface PageModelState {
  pages: DerivedPage[];
  layout: ContinuousLayout | null;
  ready: boolean;
  updating: boolean;
  error: string | null;
  defects: LayoutDefect[];
  measurementCalls: number;
  failedAssetIds: ReadonlySet<string>;
  assetUrls: Readonly<Record<string, string>>;
  reload: () => void;
}

function assetUrlsFor(runtime: DocumentRuntime): Record<string, string> {
  const urls: Record<string, string> = {};
  const availability = runtime.assetAvailability;
  for (const assetId of Object.keys(runtime.document.assets)) {
    const state = availability[assetId];
    if (state === undefined || state === 'available') {
      urls[assetId] = assetUrlFor(assetId);
    }
  }
  return urls;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function usePageModel(runtime: DocumentRuntime, active: boolean): PageModelState {
  const version = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.version,
    () => 0,
  );
  const [model, setModel] = useState<PageModelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [failedAssetIds, setFailedAssetIds] = useState<ReadonlySet<string>>(new Set());
  const [assetUrls, setAssetUrls] = useState<Readonly<Record<string, string>>>({});
  const [reloadToken, setReloadToken] = useState(0);
  const hasRun = useRef(false);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    const delay = hasRun.current ? DEBOUNCE_MS : 0;
    const timer = setTimeout(() => {
      void (async () => {
        setUpdating(true);
        try {
          const source = runtime.document;
          const noteDocument = toLayoutDocument(source);
          const urls = assetUrlsFor(runtime);
          const measurement = createDomPageMeasurement(noteDocument, urls);
          try {
            await measurement.prepare(Object.values(noteDocument.blocks), controller.signal);
            if (controller.signal.aborted) return;
            const computed = computePageModel(noteDocument, measurement);
            if (controller.signal.aborted) return;
            setModel(computed);
            setFailedAssetIds(new Set(measurement.failedAssetIds));
            setAssetUrls(urls);
            setError(null);
            hasRun.current = true;
          } finally {
            measurement.dispose();
          }
        } catch (failure) {
          if (controller.signal.aborted || isAbortError(failure)) return;
          setError(messageOf(failure));
        } finally {
          if (!controller.signal.aborted) setUpdating(false);
        }
      })();
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, version, reloadToken, runtime]);

  return {
    pages: model?.pages ?? [],
    layout: model?.layout ?? null,
    ready: model !== null,
    updating,
    error,
    defects: model?.defects ?? [],
    measurementCalls: model?.measurementCalls ?? 0,
    failedAssetIds,
    assetUrls,
    reload,
  };
}
