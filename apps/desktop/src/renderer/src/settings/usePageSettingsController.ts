/**
 * Page settings controller (Batch B).
 *
 * Owns the Page settings draft without introducing a second settings model:
 * every valid change writes through the existing global store or the durable
 * per-document map. Scope is a layer selector; switching it never writes.
 *
 * The draft exists only for the two things instant-save still debounces and
 * validates: the four margin fields and the density slider. Margins are raw
 * text until every field is valid, so an invalid value can show an inline error
 * and block the write instead of being silently reset by the layout fallback.
 *
 * Every write path that can re-paginate goes through
 * `commitThenWritePageSettings`, so an open Page Edit block is committed first
 * and a rejected commit blocks the write.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSettings,
  MarginsMm,
  Orientation,
  PageSettings,
  PageSettingsOverride,
  PageSetup,
  PageSize,
  PageTheme,
  PageThemePreset,
} from '@noteforest/layout';
import {
  DEFAULT_PAGE_SETTINGS,
  mergePageSettings,
  PAGE_DENSITY_MAX,
  PAGE_DENSITY_MIN,
  PAGE_DENSITY_STEP,
} from '@noteforest/layout';
import { commitPageEdit } from '../page/page-edit-state';
import {
  flushSettingsWrites,
  pageDensityPercent,
  pageDensityValue,
  pageOverrideFor,
  registerPendingSettingsFlush,
  useSettingsStore,
  withPageDensityOverride,
  withoutPageDensityOverride,
} from '../state/settings';
import {
  MARGIN_KEYS,
  marginDraftFrom,
  marginOverridden,
  parseMm,
  sameMm,
  validateMargins,
  withMargins,
  withSetupField,
  withoutMargin,
  withoutMargins,
  withoutSetupField,
  withoutSetup,
  withoutTheme,
  type MarginDraft,
  type MarginKey,
  type MarginValidation,
} from './page-setup';
import { commitThenWritePageSettings } from './page-settings-write';

export type PageSettingsScope = 'global' | 'document';

const DENSITY_DEBOUNCE_MS = 240;
const MARGIN_DEBOUNCE_MS = 300;

interface DensityPending {
  kind: 'density';
  percent: number;
  layer: PageSettingsScope;
}

interface MarginsPending {
  kind: 'margins';
  margins: MarginsMm;
  layer: PageSettingsScope;
}

type PendingWrite = DensityPending | MarginsPending;

export interface PageSettingsController {
  scope: PageSettingsScope;
  setScope: (next: PageSettingsScope) => void;
  documentAvailable: boolean;
  documentId: string | null;
  packagePath: string | null;
  app: AppSettings;
  override: PageSettingsOverride | undefined;
  resolved: PageSettings;
  layerSetup: PageSetup;
  layerTheme: PageTheme;

  size: PageSize;
  orientation: Orientation;
  marginDrafts: MarginDraft;
  marginValidation: MarginValidation;
  allSidesValue: string;
  setupError: string | null;
  setSize: (size: PageSize) => void;
  setOrientation: (orientation: Orientation) => void;
  setMargin: (key: MarginKey, text: string) => void;
  setAllSides: (text: string) => void;
  useGlobalSetup: () => void;
  resetSetup: () => void;
  useGlobalSize: () => void;
  useGlobalOrientation: () => void;
  useGlobalMargin: (key: MarginKey) => void;
  useGlobalMargins: () => void;
  isSizeOverridden: boolean;
  isOrientationOverridden: boolean;
  isMarginOverridden: (key: MarginKey) => boolean;

  preset: PageThemePreset;
  densityPercent: number;
  setPreset: (preset: PageThemePreset) => void;
  queueDensity: (percent: number) => void;
  useGlobalTheme: () => void;
  useGlobalDensity: () => void;
  resetTheme: () => void;
  isPresetOverridden: boolean;
  isDensityOverridden: boolean;

  saving: boolean;
  invalid: boolean;
  commitError: string | null;
  retry: () => void;
  clearError: () => void;

  previewSettings: PageSettings;
  previewInvalid: boolean;

  /** Apply both debounced drafts, in order; false means a commit blocked. */
  flushPending: () => Promise<boolean>;
}

function layerSettings(
  app: AppSettings,
  scope: PageSettingsScope,
  override: PageSettingsOverride | undefined,
): PageSettings {
  return mergePageSettings(app.page, scope === 'document' ? override : undefined);
}

/** All-equal draft text for the "All sides" field, or null for mixed values. */
function allSidesDraftOf(drafts: MarginDraft): string | null {
  const first = parseMm(drafts.top);
  if (first === null) return null;
  for (const key of MARGIN_KEYS) {
    const value = parseMm(drafts[key]);
    if (value === null || !sameMm(value, first)) return null;
  }
  return drafts.top;
}

export function usePageSettingsController(
  packagePath: string | null,
  documentId: string | null,
  documentAvailable: boolean,
): PageSettingsController {
  const app = useSettingsStore((state) => state.app);
  const override = useSettingsStore((state) =>
    pageOverrideFor(state, packagePath, documentId),
  );
  const [scope, setScopeState] = useState<PageSettingsScope>(() =>
    documentAvailable && override !== undefined ? 'document' : 'global',
  );

  // A document opening/closing while Settings is mounted cannot leave the
  // scope on a layer that no longer exists. This is not a write.
  useEffect(() => {
    if (!documentAvailable && scope === 'document') setScopeState('global');
  }, [documentAvailable, scope]);

  const resolved = useMemo(
    () => layerSettings(app, scope, override),
    [app, scope, override],
  );
  const layerSetup = resolved.setup;
  const layerTheme = resolved.theme;

  const [marginDrafts, setMarginDrafts] = useState<MarginDraft>(() =>
    marginDraftFrom(resolved.setup.margins),
  );
  const [allSidesDraft, setAllSidesDraft] = useState<string | null>(null);
  const [densityPercent, setDensityPercent] = useState(() =>
    pageDensityPercent(resolved.theme.density),
  );
  const [setupError, setSetupError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const densityPending = useRef<DensityPending | null>(null);
  const marginsPending = useRef<MarginsPending | null>(null);
  const densityTimer = useRef<number | null>(null);
  const marginsTimer = useRef<number | null>(null);
  const lastAttempt = useRef<PendingWrite | null>(null);
  const lastImmediate = useRef<(() => void) | null>(null);
  const packagePathRef = useRef(packagePath);
  const documentIdRef = useRef(documentId);
  const scopeRef = useRef(scope);
  packagePathRef.current = packagePath;
  documentIdRef.current = documentId;
  scopeRef.current = scope;

  const syncDraftsFromStore = useCallback(
    (nextScope: PageSettingsScope) => {
      const state = useSettingsStore.getState();
      const path = packagePathRef.current;
      const id = documentIdRef.current;
      const next = layerSettings(
        state.app,
        nextScope,
        pageOverrideFor(state, path, id),
      );
      setMarginDrafts(marginDraftFrom(next.setup.margins));
      setAllSidesDraft(null);
      setDensityPercent(pageDensityPercent(next.theme.density));
    },
    [],
  );

  // Follow the selected layer when it changes. A debounced write owns its own
  // update after this; the effect deliberately does not fire on every stored
  // value, or a validated keystroke would be overwritten mid-typing.
  const layerKey = `${scope}|${packagePath ?? ''}|${documentId ?? ''}`;
  useEffect(() => {
    syncDraftsFromStore(scope);
    setSetupError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerKey]);

  // The density slider follows the stored layer value (including a preset or
  // external change) but not the raw margin draft.
  useEffect(() => {
    setDensityPercent(pageDensityPercent(layerTheme.density));
  }, [layerTheme.density, scope, packagePath]);

  const marginValidation = useMemo(
    () => validateMargins(marginDrafts, layerSetup.size, layerSetup.orientation),
    [marginDrafts, layerSetup.size, layerSetup.orientation],
  );

  const allSidesValue = allSidesDraft ?? allSidesDraftOf(marginDrafts) ?? '';

  const clearDensityTimer = (): void => {
    if (densityTimer.current !== null) {
      window.clearTimeout(densityTimer.current);
      densityTimer.current = null;
    }
  };

  const clearMarginsTimer = (): void => {
    if (marginsTimer.current !== null) {
      window.clearTimeout(marginsTimer.current);
      marginsTimer.current = null;
    }
  };

  const writePending = useCallback((pending: PendingWrite): void => {
    const state = useSettingsStore.getState();
    const path = packagePathRef.current;
    const id = documentIdRef.current;
    if (pending.layer === 'document' && path === null) return;

    if (pending.kind === 'density') {
      if (pending.layer === 'document' && path !== null) {
        const current = pageOverrideFor(state, path, id);
        const globalPercent = pageDensityPercent(state.app.page.theme.density);
        if (pending.percent === globalPercent) {
          if (current?.theme?.density !== undefined) {
            state.setPageSettingsOverride(
              path,
              withoutPageDensityOverride(current) ?? null,
              id,
            );
          }
        } else {
          state.setPageSettingsOverride(
            path,
            withPageDensityOverride(current, pageDensityValue(pending.percent)),
            id,
          );
        }
      } else {
        state.updateAppSettings({
          page: { theme: { density: pageDensityValue(pending.percent) } },
        });
      }
      return;
    }

    if (pending.layer === 'document' && path !== null) {
      const current = pageOverrideFor(state, path, id);
      state.setPageSettingsOverride(
        path,
        withMargins(current, pending.margins, state.app.page.setup) ?? null,
        id,
      );
      return;
    }
    state.updateAppSettings({
      page: { setup: { margins: { ...pending.margins } } },
    });
  }, []);

  const applyPending = useCallback(
    async (pending: PendingWrite): Promise<boolean> => {
      setSaving(true);
      setCommitError(null);
      lastAttempt.current = pending;
      const path = packagePathRef.current;
      const outcome = await commitThenWritePageSettings({
        packagePath: path,
        commit: commitPageEdit,
        apply: () => writePending(pending),
        flush: flushSettingsWrites,
      });
      if (outcome === 'commit-error') {
        setCommitError('Page Edit could not be committed. Retry after fixing the block.');
        setSaving(false);
        return false;
      }
      if (outcome === 'saved') lastAttempt.current = null;
      setSaving(false);
      return outcome === 'saved';
    },
    [writePending],
  );

  const takeDensity = (): DensityPending | null => {
    clearDensityTimer();
    const pending = densityPending.current;
    densityPending.current = null;
    return pending;
  };

  const takeMargins = (): MarginsPending | null => {
    clearMarginsTimer();
    const pending = marginsPending.current;
    marginsPending.current = null;
    return pending;
  };

  const flushPending = useCallback(async (): Promise<boolean> => {
    const density = takeDensity();
    const margins = takeMargins();
    let ok = true;
    if (density !== null) ok = (await applyPending(density)) && ok;
    if (margins !== null) ok = (await applyPending(margins)) && ok;
    return ok;
  }, [applyPending]);

  const flushRef = useRef<() => Promise<boolean>>(flushPending);
  flushRef.current = flushPending;
  useEffect(() => {
    registerPendingSettingsFlush(async () => {
      await flushRef.current();
    });
    return () => registerPendingSettingsFlush(null);
  }, []);

  const scheduleDensity = (percent: number): void => {
    const layer = scopeRef.current;
    const pending: DensityPending = { kind: 'density', percent, layer };
    densityPending.current = pending;
    setSaving(true);
    setCommitError(null);
    clearDensityTimer();
    densityTimer.current = window.setTimeout(() => {
      densityTimer.current = null;
      const next = takeDensity();
      if (next !== null) void applyPending(next);
    }, DENSITY_DEBOUNCE_MS);
  };

  const scheduleMargins = (margins: MarginsMm): void => {
    const layer = scopeRef.current;
    const pending: MarginsPending = { kind: 'margins', margins, layer };
    marginsPending.current = pending;
    setSaving(true);
    setCommitError(null);
    clearMarginsTimer();
    marginsTimer.current = window.setTimeout(() => {
      marginsTimer.current = null;
      const next = takeMargins();
      if (next !== null) void applyPending(next);
    }, MARGIN_DEBOUNCE_MS);
  };

  const setScope = (next: PageSettingsScope): void => {
    if (next === scope) return;
    if (next === 'document' && !documentAvailable) return;
    // Switching layers never writes by itself. A debounced edit belongs to the
    // layer it was typed on, so it is applied before the layer changes; the
    // next layer is then read from the store, not from a stale draft.
    void (async () => {
      await flushPending();
      syncDraftsFromStore(next);
      setScopeState(next);
    })();
  };

  /** One immediate write path: flush pending edits, commit Page Edit, write. */
  const runImmediate = async (apply: () => void): Promise<boolean> => {
    const flushed = await flushPending();
    if (!flushed) return false;
    setSaving(true);
    setCommitError(null);
    lastImmediate.current = apply;
    const outcome = await commitThenWritePageSettings({
      packagePath: packagePathRef.current,
      commit: commitPageEdit,
      apply,
      flush: flushSettingsWrites,
    });
    if (outcome === 'commit-error') {
      setCommitError('Page Edit could not be committed. Retry after fixing the block.');
      setSaving(false);
      return false;
    }
    if (outcome === 'saved') lastImmediate.current = null;
    setSaving(false);
    return outcome === 'saved';
  };

  const canChangeSetup = (nextSize: PageSize, nextOrientation: Orientation): boolean => {
    // Validate the current draft (the value the user is about to keep) under
    // the new geometry. Never let the layout fallback silently reset margins.
    const check = validateMargins(marginDrafts, nextSize, nextOrientation);
    if (check.valid) {
      setSetupError(null);
      return true;
    }
    const messages = [...new Set(Object.values(check.fieldErrors))];
    setSetupError(
      `${messages[0] ?? 'These margins do not fit.'} Reduce the margins first, then change the page size or orientation.`,
    );
    void flushPending();
    return false;
  };

  const setSize = (size: PageSize): void => {
    if (size === layerSetup.size) return;
    if (!canChangeSetup(size, layerSetup.orientation)) return;
    void runImmediate(() => {
      const state = useSettingsStore.getState();
      const path = packagePathRef.current;
      const id = documentIdRef.current;
      if (scopeRef.current === 'document' && path !== null) {
        state.setPageSettingsOverride(
          path,
          withSetupField(pageOverrideFor(state, path, id), 'size', size, state.app.page.setup) ??
            null,
          id,
        );
      } else {
        state.updateAppSettings({ page: { setup: { size } } });
      }
    });
  };

  const setOrientation = (orientation: Orientation): void => {
    if (orientation === layerSetup.orientation) return;
    if (!canChangeSetup(layerSetup.size, orientation)) return;
    void runImmediate(() => {
      const state = useSettingsStore.getState();
      const path = packagePathRef.current;
      const id = documentIdRef.current;
      if (scopeRef.current === 'document' && path !== null) {
        state.setPageSettingsOverride(
          path,
          withSetupField(
            pageOverrideFor(state, path, id),
            'orientation',
            orientation,
            state.app.page.setup,
          ) ?? null,
          id,
        );
      } else {
        state.updateAppSettings({ page: { setup: { orientation } } });
      }
    });
  };

  const setMargin = (key: MarginKey, text: string): void => {
    const nextDrafts: MarginDraft = { ...marginDrafts, [key]: text };
    setMarginDrafts(nextDrafts);
    setAllSidesDraft(null);
    setSetupError(null);
    const check = validateMargins(nextDrafts, layerSetup.size, layerSetup.orientation);
    if (!check.valid || check.margins === null) {
      // The field is currently invalid: cancel an earlier valid debounce so a
      // value the user can no longer see is never written behind the error.
      clearMarginsTimer();
      marginsPending.current = null;
      setSaving(false);
      return;
    }
    scheduleMargins(check.margins);
  };

  const setAllSides = (text: string): void => {
    const nextDrafts: MarginDraft = {
      top: text,
      right: text,
      bottom: text,
      left: text,
    };
    setMarginDrafts(nextDrafts);
    setAllSidesDraft(text);
    setSetupError(null);
    const check = validateMargins(nextDrafts, layerSetup.size, layerSetup.orientation);
    if (!check.valid || check.margins === null) {
      clearMarginsTimer();
      marginsPending.current = null;
      setSaving(false);
      return;
    }
    scheduleMargins(check.margins);
  };

  const useGlobalSetup = (): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate(() => {
      const state = useSettingsStore.getState();
      state.setPageSettingsOverride(
        packagePath,
        withoutSetup(pageOverrideFor(state, packagePath, documentId)) ?? null,
        documentId,
      );
    }).then((ok) => {
      if (ok) syncDraftsFromStore('document');
    });
  };

  const useGlobalSize = (): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate(() => {
      const state = useSettingsStore.getState();
      state.setPageSettingsOverride(
        packagePath,
        withoutSetupField(pageOverrideFor(state, packagePath, documentId), 'size') ?? null,
        documentId,
      );
    });
  };

  const useGlobalOrientation = (): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate(() => {
      const state = useSettingsStore.getState();
      state.setPageSettingsOverride(
        packagePath,
        withoutSetupField(
          pageOverrideFor(state, packagePath, documentId),
          'orientation',
        ) ?? null,
        documentId,
      );
    });
  };

  const useGlobalMargin = (key: MarginKey): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate(() => {
      const state = useSettingsStore.getState();
      state.setPageSettingsOverride(
        packagePath,
        withoutMargin(pageOverrideFor(state, packagePath, documentId), key) ?? null,
        documentId,
      );
    }).then((ok) => {
      if (ok) syncDraftsFromStore('document');
    });
  };

  const useGlobalMargins = (): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate(() => {
      const state = useSettingsStore.getState();
      state.setPageSettingsOverride(
        packagePath,
        withoutMargins(pageOverrideFor(state, packagePath, documentId)) ?? null,
        documentId,
      );
    }).then((ok) => {
      if (ok) syncDraftsFromStore('document');
    });
  };

  const resetSetup = (): void => {
    if (scopeRef.current !== 'global') return;
    void runImmediate(() => {
      useSettingsStore.getState().updateAppSettings({
        page: { setup: DEFAULT_PAGE_SETTINGS.setup },
      });
    }).then((ok) => {
      if (ok) syncDraftsFromStore('global');
    });
  };

  const useGlobalTheme = (): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate(() => {
      const state = useSettingsStore.getState();
      state.setPageSettingsOverride(
        packagePath,
        withoutTheme(pageOverrideFor(state, packagePath, documentId)) ?? null,
        documentId,
      );
    }).then((ok) => {
      if (ok) syncDraftsFromStore('document');
    });
  };

  const useGlobalDensity = (): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate(() => {
      const state = useSettingsStore.getState();
      const current = pageOverrideFor(state, packagePath, documentId);
      state.setPageSettingsOverride(
        packagePath,
        withoutPageDensityOverride(current) ?? null,
        documentId,
      );
    }).then((ok) => {
      if (ok) syncDraftsFromStore('document');
    });
  };

  const resetTheme = (): void => {
    if (scopeRef.current !== 'global') return;
    void runImmediate(() => {
      useSettingsStore.getState().updateAppSettings({
        page: { theme: DEFAULT_PAGE_SETTINGS.theme },
      });
    }).then((ok) => {
      if (ok) syncDraftsFromStore('global');
    });
  };

  const setPreset = (preset: PageThemePreset): void => {
    if (
      preset === layerTheme.preset &&
      (scopeRef.current === 'global' || override?.theme?.preset === undefined)
    ) {
      return;
    }
    void runImmediate(() => {
      const state = useSettingsStore.getState();
      const path = packagePathRef.current;
      const id = documentIdRef.current;
      const current = pageOverrideFor(state, path, id);
      const currentDensity = state.app.page.theme.density;
      if (scopeRef.current === 'document' && path !== null) {
        const resolvedTheme = mergePageSettings(state.app.page, current).theme;
        if (preset === 'custom') {
          state.setPageSettingsOverride(
            path,
            { ...(current ?? {}), theme: { ...resolvedTheme, preset: 'custom' } },
            id,
          );
          return;
        }
        // A preset switch replaces the typography baseline. Keep an explicit
        // density override, otherwise let the global density apply.
        const theme: Partial<PageTheme> = { preset };
        if (current?.theme?.density !== undefined) {
          theme.density = current.theme.density;
        }
        if (preset === state.app.page.theme.preset) delete theme.preset;
        if (Object.keys(theme).length === 0) {
          const { theme: _theme, ...rest } = current ?? {};
          state.setPageSettingsOverride(
            path,
            Object.keys(rest).length === 0 ? null : rest,
            id,
          );
          return;
        }
        state.setPageSettingsOverride(path, { ...(current ?? {}), theme }, id);
        return;
      }
      if (preset === 'custom') {
        state.updateAppSettings({
          page: { theme: { ...state.app.page.theme, preset: 'custom' } },
        });
        return;
      }
      state.updateAppSettings({ page: { theme: { preset, density: currentDensity } } });
    });
  };

  const queueDensity = (percent: number): void => {
    const step = Math.round(PAGE_DENSITY_STEP * 100);
    const clamped = Math.min(
      PAGE_DENSITY_MAX * 100,
      Math.max(PAGE_DENSITY_MIN * 100, Math.round(percent / step) * step),
    );
    setDensityPercent(clamped);
    scheduleDensity(clamped);
  };

  const retry = (): void => {
    setCommitError(null);
    const attempt = lastAttempt.current;
    if (attempt !== null) {
      void applyPending(attempt);
      return;
    }
    const immediate = lastImmediate.current;
    if (immediate !== null) {
      void runImmediate(immediate);
      return;
    }
    useSettingsStore.getState().retrySettingsWrite();
    void flushSettingsWrites();
  };

  const previewSettings = useMemo<PageSettings>(() => {
    const margins = marginValidation.margins ?? layerSetup.margins;
    const density = pageDensityValue(densityPercent);
    return {
      ...resolved,
      setup: { ...layerSetup, margins: { ...margins } },
      theme: { ...layerTheme, density },
    };
  }, [resolved, layerSetup, layerTheme, marginValidation.margins, densityPercent]);

  return {
    scope,
    setScope,
    documentAvailable,
    documentId,
    packagePath,
    app,
    override,
    resolved,
    layerSetup,
    layerTheme,
    size: layerSetup.size,
    orientation: layerSetup.orientation,
    marginDrafts,
    marginValidation,
    allSidesValue,
    setupError,
    setSize,
    setOrientation,
    setMargin,
    setAllSides,
    useGlobalSetup,
    resetSetup,
    useGlobalSize,
    useGlobalOrientation,
    useGlobalMargin,
    useGlobalMargins,
    isSizeOverridden: scope === 'document' && override?.setup?.size !== undefined,
    isOrientationOverridden:
      scope === 'document' && override?.setup?.orientation !== undefined,
    isMarginOverridden: (key) => scope === 'document' && marginOverridden(override, key),
    preset: layerTheme.preset,
    densityPercent,
    setPreset,
    queueDensity,
    useGlobalTheme,
    useGlobalDensity,
    resetTheme,
    isPresetOverridden: scope === 'document' && override?.theme?.preset !== undefined,
    isDensityOverridden:
      scope === 'document' && override?.theme?.density !== undefined,
    saving,
    invalid: !marginValidation.valid,
    commitError,
    retry,
    clearError: () => setCommitError(null),
    previewSettings,
    previewInvalid: !marginValidation.valid,
    flushPending,
  };
}
