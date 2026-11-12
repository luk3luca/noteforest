/**
 * Page model hook.
 *
 * Recomputes the derived pages from the canonical document revision. Work is
 * debounced (typing and structural commands run in bursts), every stale run is
 * aborted, and the measurement host is disposed in the same task that created
 * it. A failed measurement never touches the continuous editor: the page
 * layout owns the error surface and the continuous editor remains mounted and
 * editable underneath.
 *
 * The hook is owned by `PageView` and mounted only while the Page layout is
 * active: Continuous has no pages and must not measure or paginate. It keys
 * completed work by `(document.revision, reloadToken, settingsFingerprint)`, so
 * a selection, a collapse toggle (view state), or a tab switch never re-measures
 * an unchanged revision. Collapse in particular must not change the page model:
 * Page/PDF always show the full document.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  CodeFontId,
  ContinuousLayout,
  DerivedPage,
  LayoutDefect,
  NoteDocument,
  PageSettings,
} from '@noteforest/layout';
import type { DocumentRuntime } from '../state/runtime';
import { useSettingsStore } from '../state/settings';
import { toLayoutDocument } from './adapter';
import { assetUrlsForRuntime } from './asset-urls';
import { createDomPageMeasurement } from './measurement';
import { computePageModel, pageSettingsFingerprint, type PageModelData } from './model';

const DEBOUNCE_MS = 150;

export interface PageModelState {
  /** Layout-shaped document of the completed run (null before the first run). */
  document: NoteDocument | null;
  pages: DerivedPage[];
  layout: ContinuousLayout | null;
  ready: boolean;
  updating: boolean;
  error: string | null;
  defects: LayoutDefect[];
  manualBreakWarnings: LayoutDefect[];
  settingsFingerprint: string | null;
  measurementCalls: number;
  /** Successful model runs since the editor mounted (diagnostics only). */
  runs: number;
  /** Wall time of the last prepare + layout + paginate run (diagnostics only). */
  lastRunMs: number | null;
  /** Synchronous layout + paginate part of the last run (diagnostics only). */
  lastComputeMs: number | null;
  failedAssetIds: ReadonlySet<string>;
  assetUrls: Readonly<Record<string, string>>;
  reload: () => void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function usePageModel(
  runtime: DocumentRuntime,
  active: boolean,
  settings: PageSettings,
): PageModelState {
  // Subscribe to the runtime so content and save-state notifications re-render
  // this hook. The snapshot value itself is not needed: the canonical revision
  // below is the recomputation key.
  useSyncExternalStore(
    runtime.subscribe,
    () => runtime.version,
    () => 0,
  );
  // Content changes advance the canonical revision. View-only notifications
  // (selection, focus, collapse, save-state chrome) bump `version` but not the
  // revision: they must not trigger a full measurement pass.
  const revision = runtime.document.revision;
  const [model, setModel] = useState<PageModelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [failedAssetIds, setFailedAssetIds] = useState<ReadonlySet<string>>(new Set());
  const [assetUrls, setAssetUrls] = useState<Readonly<Record<string, string>>>({});
  const [reloadToken, setReloadToken] = useState(0);
  const [runs, setRuns] = useState(0);
  const [lastRunMs, setLastRunMs] = useState<number | null>(null);
  const [lastComputeMs, setLastComputeMs] = useState<number | null>(null);
  const hasRun = useRef(false);
  const completedKey = useRef<string | null>(null);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  // The code font is the one appearance value that changes page metrics; it
  // joins the measured-run identity so the pages re-measure when it changes.
  const codeFont: CodeFontId = useSettingsStore(
    (state) => state.app.appearance.codeFont,
  );
  const settingsFingerprint = pageSettingsFingerprint(settings, codeFont);

  useEffect(() => {
    if (!active) return undefined;
    const key = `${revision}:${reloadToken}:${settingsFingerprint}`;
    if (completedKey.current === key) return undefined;
    const controller = new AbortController();
    const delay = hasRun.current ? DEBOUNCE_MS : 0;
    const timer = setTimeout(() => {
      void (async () => {
        const startedAt = performance.now();
        setUpdating(true);
        try {
          const source = runtime.document;
          const noteDocument = toLayoutDocument(source);
          const urls = assetUrlsForRuntime(runtime);
          const measurement = createDomPageMeasurement(noteDocument, urls, settings);
          try {
            await measurement.prepare(Object.values(noteDocument.blocks), controller.signal);
            if (controller.signal.aborted) return;
            const computeStartedAt = performance.now();
            const computed = computePageModel(noteDocument, measurement, settings, codeFont);
            const computeMs = performance.now() - computeStartedAt;
            if (controller.signal.aborted) return;
            setModel(computed);
            setFailedAssetIds(new Set(measurement.failedAssetIds));
            setAssetUrls(urls);
            setError(null);
            completedKey.current = key;
            hasRun.current = true;
            setRuns((value) => value + 1);
            setLastComputeMs(computeMs);
            setLastRunMs(performance.now() - startedAt);
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
    // `version` intentionally stays out of the dependency list: it is the
    // store subscription that re-renders this hook, while the canonical
    // revision decides whether the model must be recomputed. Settings changes
    // are explicit: the resolved fingerprint joins the key and dependencies so
    // the same document re-paginates under the new page lens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, revision, reloadToken, runtime, settings, settingsFingerprint, codeFont]);

  return {
    document: model?.document ?? null,
    pages: model?.pages ?? [],
    layout: model?.layout ?? null,
    ready: model !== null,
    updating,
    error,
    defects: model?.defects ?? [],
    manualBreakWarnings: model?.manualBreakWarnings ?? [],
    settingsFingerprint: model?.settingsFingerprint ?? null,
    measurementCalls: model?.measurementCalls ?? 0,
    runs,
    lastRunMs,
    lastComputeMs,
    failedAssetIds,
    assetUrls,
    reload,
  };
}
