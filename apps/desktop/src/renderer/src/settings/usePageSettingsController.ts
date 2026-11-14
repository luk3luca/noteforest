/**
 * Page settings controller (Batch B).
 *
 * Owns the Page settings draft without introducing a second settings model:
 * every valid change writes through the existing global store or the durable
 * per-document map. Scope is a layer selector; switching it never writes.
 *
 * The draft exists only for the things instant-save still debounces and
 * validates: the four margin fields, the density slider, and the advanced
 * typography/layout number fields plus the first-class max card width. Raw text
 * is kept until every related field is valid, so an invalid value can show an
 * inline error and block the write instead of being silently reset.
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
  PageChrome,
  PageChromeSource,
  PageSettings,
  PageSettingsOverride,
  PageSetup,
  PageSize,
  PageTheme,
  PageThemePreset,
} from '@noteforest/layout';
import {
  DEFAULT_PAGE_CHROME,
  DEFAULT_PAGE_SETTINGS,
  mergePageSettings,
  PAGE_DENSITY_MAX,
  PAGE_DENSITY_MIN,
  PAGE_DENSITY_STEP,
} from '@noteforest/layout';
import { commitPageEdit } from '../page/page-edit-state';
import { getRuntime } from '../state/registry';
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
  chromeFieldOverridden,
  hasChromeOverride,
  marginDraftFrom,
  marginOverridden,
  parseMm,
  sameMm,
  validateMargins,
  withChromeField,
  withMargins,
  withSetupField,
  withoutChrome,
  withoutChromeField,
  withoutMargin,
  withoutMargins,
  withoutSetupField,
  withoutSetup,
  withoutTheme,
  type ChromeKey,
  type MarginDraft,
  type MarginKey,
  type MarginValidation,
} from './page-setup';
import {
  ADVANCED_LAYOUT_KEYS,
  ADVANCED_TYPOGRAPHY_KEYS,
  customThemeOverride,
  EDITABLE_THEME_KEYS,
  hasThemeFieldOverride,
  isThemeFieldOverridden,
  pageThemeDraftFrom,
  presetSwitchReplacesAdvancedValues,
  samePageThemeNumber,
  validatePageThemeDrafts,
  withThemeField,
  withoutThemeField,
  withoutThemeFields,
  type EditableThemeKey,
  type PageThemeDraft,
  type PageThemeDraftValidation,
} from './page-advanced';
import { commitThenWritePageSettings } from './page-settings-write';
import {
  capturePageSettingsTarget,
  pageSettingsTargetIsGone,
  runImmediatePageSettingsWrite,
  PAGE_SETTINGS_TARGET_CLOSED_MESSAGE,
  type PageSettingsWriteTarget,
} from './page-settings-target';

export type PageSettingsScope = 'global' | 'document';

const DENSITY_DEBOUNCE_MS = 240;
const MARGIN_DEBOUNCE_MS = 300;
const THEME_DEBOUNCE_MS = 300;

interface DensityPending {
  kind: 'density';
  percent: number;
  target: PageSettingsWriteTarget;
}

interface MarginsPending {
  kind: 'margins';
  margins: MarginsMm;
  target: PageSettingsWriteTarget;
}

/**
 * A Page theme write. `patch` holds the changed editable fields; `custom` is
 * true when at least one advanced typography/layout field changed, which
 * freezes the resolved layer into the Custom marker. `maxCardWidth` is
 * first-class and writes as a normal partial field.
 */
interface ThemePending {
  kind: 'theme';
  patch: Partial<Record<EditableThemeKey, number>>;
  custom: boolean;
  target: PageSettingsWriteTarget;
}

type PendingWrite = DensityPending | MarginsPending | ThemePending;

/** One immediate write: the action plus the identity captured at its start. */
interface ImmediateWrite {
  apply: (target: PageSettingsWriteTarget) => void;
  target: PageSettingsWriteTarget;
}

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
  layerChrome: PageChrome;

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

  setChromeSource: (field: 'header' | 'footer', source: PageChromeSource) => void;
  setChromePageNumber: (enabled: boolean) => void;
  isChromeOverridden: (key: ChromeKey) => boolean;
  hasChromeOverrides: boolean;
  useGlobalChrome: () => void;
  useGlobalChromeField: (key: ChromeKey) => void;
  resetChrome: () => void;

  preset: PageThemePreset;
  densityPercent: number;
  setPreset: (preset: PageThemePreset) => void;
  /** Preset click that asks before replacing custom advanced values (Q-11). */
  requestPreset: (preset: PageThemePreset) => void;
  presetWarning: PageThemePreset | null;
  confirmPresetSwitch: () => void;
  cancelPresetSwitch: () => void;
  queueDensity: (percent: number) => void;
  useGlobalTheme: () => void;
  useGlobalDensity: () => void;
  resetTheme: () => void;
  isPresetOverridden: boolean;
  isDensityOverridden: boolean;

  themeDrafts: PageThemeDraft;
  themeValidation: PageThemeDraftValidation;
  setThemeField: (key: EditableThemeKey, text: string) => void;
  isThemeFieldOverridden: (key: EditableThemeKey) => boolean;
  useGlobalThemeField: (key: EditableThemeKey) => void;
  hasAdvancedTypographyOverrides: boolean;
  hasAdvancedLayoutOverrides: boolean;
  useGlobalAdvancedTypography: () => void;
  useGlobalAdvancedLayout: () => void;

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
  const layerChrome = resolved.chrome;

  const [marginDrafts, setMarginDrafts] = useState<MarginDraft>(() =>
    marginDraftFrom(resolved.setup.margins),
  );
  const [allSidesDraft, setAllSidesDraft] = useState<string | null>(null);
  const [densityPercent, setDensityPercent] = useState(() =>
    pageDensityPercent(resolved.theme.density),
  );
  const [themeDrafts, setThemeDrafts] = useState<PageThemeDraft>(() =>
    pageThemeDraftFrom(resolved.theme),
  );
  const [presetWarning, setPresetWarning] = useState<PageThemePreset | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const densityPending = useRef<DensityPending | null>(null);
  const marginsPending = useRef<MarginsPending | null>(null);
  const themePending = useRef<ThemePending | null>(null);
  const densityTimer = useRef<number | null>(null);
  const marginsTimer = useRef<number | null>(null);
  const themeTimer = useRef<number | null>(null);
  const lastAttempt = useRef<PendingWrite | null>(null);
  const lastImmediate = useRef<ImmediateWrite | null>(null);
  /** True after a write was skipped because its document closed (F2). */
  const targetLost = useRef(false);
  const packagePathRef = useRef(packagePath);
  const documentIdRef = useRef(documentId);
  const scopeRef = useRef(scope);
  packagePathRef.current = packagePath;
  documentIdRef.current = documentId;
  scopeRef.current = scope;

  /** Identity of the document/layer the next edit starts on (F2). */
  const captureTarget = useCallback(
    (): PageSettingsWriteTarget =>
      capturePageSettingsTarget(scopeRef.current, packagePathRef.current, documentIdRef.current),
    [],
  );
  const targetIsGone = useCallback(
    (target: PageSettingsWriteTarget): boolean =>
      pageSettingsTargetIsGone(target, (path) => getRuntime(path) !== null),
    [],
  );

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
      setThemeDrafts(pageThemeDraftFrom(next.theme));
      setPresetWarning(null);
    },
    [],
  );

  /**
   * Theme-only resync after an immediate theme action.
   *
   * A user can type into another advanced field before the write flush
   * resolves, so the raw drafts must follow the new layer synchronously in the
   * apply callback; otherwise an old value looks like a fresh edit and gets
   * frozen back into the Custom baseline.
   */
  const syncThemeDraftsFromStore = useCallback((nextScope: PageSettingsScope) => {
    const state = useSettingsStore.getState();
    const next = layerSettings(
      state.app,
      nextScope,
      pageOverrideFor(state, packagePathRef.current, documentIdRef.current),
    );
    setThemeDrafts(pageThemeDraftFrom(next.theme));
    setPresetWarning(null);
  }, []);

  /** Setup-only resync: never clobber theme drafts from a newer edit. */
  const syncSetupDraftsFromStore = useCallback((nextScope: PageSettingsScope) => {
    const state = useSettingsStore.getState();
    const next = layerSettings(
      state.app,
      nextScope,
      pageOverrideFor(state, packagePathRef.current, documentIdRef.current),
    );
    setMarginDrafts(marginDraftFrom(next.setup.margins));
    setAllSidesDraft(null);
  }, []);

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

  const themeValidation = useMemo(
    () =>
      validatePageThemeDrafts(themeDrafts, {
        childTrunkInset: layerTheme.childTrunkInset,
      }),
    [themeDrafts, layerTheme.childTrunkInset],
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

  const clearThemeTimer = (): void => {
    if (themeTimer.current !== null) {
      window.clearTimeout(themeTimer.current);
      themeTimer.current = null;
    }
  };

  /**
   * Apply one pending Page settings edit to the store layer captured at its
   * start (F2). Returns false when that target document is gone; the caller
   * then reports a visible "not saved" state instead of `saved`.
   *
   * The path/id never come from the live refs: a tab switch, a document close,
   * or a Settings remount cannot retarget the write.
   */
  const writePending = useCallback((pending: PendingWrite): boolean => {
    const state = useSettingsStore.getState();
    const { scope: layer, packagePath: path, documentId: id } = pending.target;
    if (layer === 'document' && (path === null || getRuntime(path) === null)) return false;

    if (pending.kind === 'density') {
      if (layer === 'document' && path !== null) {
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
      return true;
    }

    if (pending.kind === 'theme') {
      const globalTheme = state.app.page.theme;
      if (pending.custom) {
        // Freeze the current resolved layer (all hidden values included) so the
        // Custom marker keeps exactly what the user saw, then apply the edits.
        const layerTheme = layerSettings(
          state.app,
          layer,
          layer === 'document' && path !== null ? pageOverrideFor(state, path, id) : undefined,
        ).theme;
        const fullTheme: PageTheme = {
          ...layerTheme,
          ...pending.patch,
          preset: 'custom',
        };
        if (layer === 'document' && path !== null) {
          state.setPageSettingsOverride(
            path,
            customThemeOverride(pageOverrideFor(state, path, id), fullTheme, globalTheme),
            id,
          );
        } else {
          state.updateAppSettings({ page: { theme: fullTheme } });
        }
        return true;
      }
      const value = pending.patch.maxCardWidth;
      if (value === undefined) return true;
      if (layer === 'document' && path !== null) {
        state.setPageSettingsOverride(
          path,
          withThemeField(pageOverrideFor(state, path, id), 'maxCardWidth', value, globalTheme),
          id,
        );
      } else {
        state.updateAppSettings({ page: { theme: { maxCardWidth: value } } });
      }
      return true;
    }

    if (layer === 'document' && path !== null) {
      const current = pageOverrideFor(state, path, id);
      state.setPageSettingsOverride(
        path,
        withMargins(current, pending.margins, state.app.page.setup) ?? null,
        id,
      );
      return true;
    }
    state.updateAppSettings({
      page: { setup: { margins: { ...pending.margins } } },
    });
    return true;
  }, []);

  const applyPending = useCallback(
    async (pending: PendingWrite): Promise<boolean> => {
      setSaving(true);
      setCommitError(null);
      let target = pending.target;
      if (targetIsGone(target)) {
        // The document closed after the edit started. Never write (the path is
        // stale) and never report saved; the footer shows the reason.
        lastAttempt.current = null;
        targetLost.current = true;
        setCommitError(PAGE_SETTINGS_TARGET_CLOSED_MESSAGE);
        setSaving(false);
        return false;
      }
      // A per-document change is a real mutation: a draft materializes first,
      // and the write is retargeted to the new package path. The document id
      // stays the same, so the override is never lost.
      if (target.scope === 'document' && target.packagePath !== null) {
        const runtime = getRuntime(target.packagePath);
        if (runtime !== null && runtime.isDraft) {
          const prepared = await runtime.ensureMaterialized();
          if (!prepared.ok) {
            lastAttempt.current = null;
            setCommitError(prepared.message);
            setSaving(false);
            return false;
          }
          target = { ...target, packagePath: runtime.packagePath };
          pending = { ...pending, target };
          // The tab rekeys on the next render; point the draft sync helpers at
          // the package immediately.
          packagePathRef.current = target.packagePath;
        }
      }
      lastAttempt.current = pending;
      const outcome = await commitThenWritePageSettings({
        packagePath: target.packagePath,
        targetGone: () => targetIsGone(target),
        commit: commitPageEdit,
        apply: () => writePending(pending),
        flush: flushSettingsWrites,
      });
      if (outcome === 'target-gone') {
        lastAttempt.current = null;
        targetLost.current = true;
        setCommitError(PAGE_SETTINGS_TARGET_CLOSED_MESSAGE);
        setSaving(false);
        return false;
      }
      if (outcome === 'commit-error') {
        setCommitError('Page Edit could not be committed. Retry after fixing the block.');
        setSaving(false);
        return false;
      }
      if (outcome === 'saved') lastAttempt.current = null;
      setSaving(false);
      return outcome === 'saved';
    },
    [targetIsGone, writePending],
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

  const takeTheme = (): ThemePending | null => {
    clearThemeTimer();
    const pending = themePending.current;
    themePending.current = null;
    return pending;
  };

  const flushPending = useCallback(async (): Promise<boolean> => {
    const density = takeDensity();
    const theme = takeTheme();
    const margins = takeMargins();
    let ok = true;
    if (density !== null) ok = (await applyPending(density)) && ok;
    if (theme !== null) ok = (await applyPending(theme)) && ok;
    if (margins !== null) ok = (await applyPending(margins)) && ok;
    return ok;
  }, [applyPending]);

  const flushRef = useRef<() => Promise<boolean>>(flushPending);
  flushRef.current = flushPending;
  useEffect(() => {
    return registerPendingSettingsFlush(async () => {
      await flushRef.current();
    });
  }, []);

  const scheduleDensity = (percent: number): void => {
    const pending: DensityPending = {
      kind: 'density',
      percent,
      target: captureTarget(),
    };
    densityPending.current = pending;
    targetLost.current = false;
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
    const pending: MarginsPending = {
      kind: 'margins',
      margins,
      target: captureTarget(),
    };
    marginsPending.current = pending;
    targetLost.current = false;
    setSaving(true);
    setCommitError(null);
    clearMarginsTimer();
    marginsTimer.current = window.setTimeout(() => {
      marginsTimer.current = null;
      const next = takeMargins();
      if (next !== null) void applyPending(next);
    }, MARGIN_DEBOUNCE_MS);
  };

  const scheduleTheme = (
    patch: Partial<Record<EditableThemeKey, number>>,
    custom: boolean,
  ): void => {
    const pending: ThemePending = {
      kind: 'theme',
      patch,
      custom,
      target: captureTarget(),
    };
    themePending.current = pending;
    targetLost.current = false;
    setSaving(true);
    setCommitError(null);
    clearThemeTimer();
    themeTimer.current = window.setTimeout(() => {
      themeTimer.current = null;
      const next = takeTheme();
      if (next !== null) void applyPending(next);
    }, THEME_DEBOUNCE_MS);
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

  /**
   * One immediate write, bound to the target captured when it starts. `retry`
   * replays the exact same target; a document that closed in between is
   * reported instead of retargeted.
   */
  const executeImmediate = async (request: ImmediateWrite): Promise<boolean> => {
    setSaving(true);
    setCommitError(null);
    let immediate = request;
    let { target } = immediate;
    const { apply } = immediate;
    if (targetIsGone(target)) {
      lastImmediate.current = null;
      targetLost.current = true;
      setCommitError(PAGE_SETTINGS_TARGET_CLOSED_MESSAGE);
      setSaving(false);
      return false;
    }
    // Every immediate document-scoped write (size, orientation, chrome,
    // preset, reset, use-global) is a real mutation too: materialize a draft
    // first and retarget the write to the package path, exactly like
    // `applyPending`. No override may stay keyed `draft:<id>` (F4).
    if (target.scope === 'document' && target.packagePath !== null) {
      const runtime = getRuntime(target.packagePath);
      if (runtime !== null && runtime.isDraft) {
        const prepared = await runtime.ensureMaterialized();
        if (!prepared.ok) {
          lastImmediate.current = null;
          setCommitError(prepared.message);
          setSaving(false);
          return false;
        }
        target = { ...target, packagePath: runtime.packagePath };
        immediate = { ...immediate, target };
        // The tab rekeys on the next render; point the draft sync helpers at
        // the package immediately.
        packagePathRef.current = target.packagePath;
      }
    }
    lastImmediate.current = immediate;
    const outcome = await commitThenWritePageSettings({
      packagePath: target.packagePath,
      targetGone: () => targetIsGone(target),
      commit: commitPageEdit,
      apply: () => apply(target),
      flush: flushSettingsWrites,
    });
    if (outcome === 'target-gone') {
      lastImmediate.current = null;
      targetLost.current = true;
      setCommitError(PAGE_SETTINGS_TARGET_CLOSED_MESSAGE);
      setSaving(false);
      return false;
    }
    if (outcome === 'commit-error') {
      setCommitError('Page Edit could not be committed. Retry after fixing the block.');
      setSaving(false);
      return false;
    }
    if (outcome === 'saved') lastImmediate.current = null;
    setSaving(false);
    return outcome === 'saved';
  };

  /**
   * One immediate write path: capture the target, flush pending edits, commit
   * Page Edit, write. The capture happens before the flush (F2): the flush can
   * await a Page Edit commit and settings IPC, and a tab/layer change in that
   * window must not retarget the write.
   */
  const runImmediate = (
    apply: (target: PageSettingsWriteTarget) => void,
  ): Promise<boolean> => {
    targetLost.current = false;
    return runImmediatePageSettingsWrite({
      captureTarget,
      flushPending,
      execute: (target) => executeImmediate({ apply, target }),
    });
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
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      const id = target.documentId;
      if (target.scope === 'document' && path !== null) {
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
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      const id = target.documentId;
      if (target.scope === 'document' && path !== null) {
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

  /**
   * Edit one advanced/first-class theme field.
   *
   * The raw text stays visible even when invalid. A valid change writes after a
   * short debounce; every advanced typography/layout edit marks the layer
   * Custom while preserving the current resolved values. `maxCardWidth` is
   * first-class and writes as a normal partial field.
   */
  const setThemeField = (key: EditableThemeKey, text: string): void => {
    const nextDrafts: PageThemeDraft = { ...themeDrafts, [key]: text };
    setThemeDrafts(nextDrafts);
    const check = validatePageThemeDrafts(nextDrafts, {
      childTrunkInset: layerTheme.childTrunkInset,
    });
    if (!check.valid || check.values === null) {
      // An invalid draft blocks its write; the user's text stays visible.
      clearThemeTimer();
      themePending.current = null;
      setSaving(false);
      return;
    }
    const patch: Partial<Record<EditableThemeKey, number>> = {};
    for (const field of EDITABLE_THEME_KEYS) {
      if (!samePageThemeNumber(check.values[field], layerTheme[field])) {
        patch[field] = check.values[field];
      }
    }
    if (Object.keys(patch).length === 0) {
      clearThemeTimer();
      themePending.current = null;
      setSaving(false);
      return;
    }
    const custom =
      ADVANCED_TYPOGRAPHY_KEYS.some((field) => patch[field] !== undefined) ||
      ADVANCED_LAYOUT_KEYS.some((field) => patch[field] !== undefined);
    scheduleTheme(patch, custom);
  };

  const useGlobalSetup = (): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      if (path === null) return;
      state.setPageSettingsOverride(
        path,
        withoutSetup(pageOverrideFor(state, path, target.documentId)) ?? null,
        target.documentId,
      );
      syncSetupDraftsFromStore('document');
    });
  };

  const useGlobalSize = (): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      if (path === null) return;
      state.setPageSettingsOverride(
        path,
        withoutSetupField(pageOverrideFor(state, path, target.documentId), 'size') ?? null,
        target.documentId,
      );
    });
  };

  const useGlobalOrientation = (): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      if (path === null) return;
      state.setPageSettingsOverride(
        path,
        withoutSetupField(
          pageOverrideFor(state, path, target.documentId),
          'orientation',
        ) ?? null,
        target.documentId,
      );
    });
  };

  const useGlobalMargin = (key: MarginKey): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      if (path === null) return;
      state.setPageSettingsOverride(
        path,
        withoutMargin(pageOverrideFor(state, path, target.documentId), key) ?? null,
        target.documentId,
      );
      syncSetupDraftsFromStore('document');
    });
  };

  const useGlobalMargins = (): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      if (path === null) return;
      state.setPageSettingsOverride(
        path,
        withoutMargins(pageOverrideFor(state, path, target.documentId)) ?? null,
        target.documentId,
      );
      syncSetupDraftsFromStore('document');
    });
  };

  const resetSetup = (): void => {
    if (scopeRef.current !== 'global') return;
    void runImmediate(() => {
      useSettingsStore.getState().updateAppSettings({
        page: { setup: DEFAULT_PAGE_SETTINGS.setup },
      });
      syncSetupDraftsFromStore('global');
    });
  };

  /**
   * One chrome field (R2). Chrome is a discrete, instantly-saved control: it
   * uses the same captured-target immediate path as size/orientation so a
   * document/tab change can never retarget the write. A document value equal to
   * the global value removes the override instead of storing a no-op.
   */
  const setChromeSource = (field: 'header' | 'footer', source: PageChromeSource): void => {
    if (source === layerChrome[field]) return;
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      const id = target.documentId;
      if (target.scope === 'document' && path !== null) {
        state.setPageSettingsOverride(
          path,
          withChromeField(
            pageOverrideFor(state, path, id),
            field,
            source,
            state.app.page.chrome,
          ) ?? null,
          id,
        );
        return;
      }
      const patch: Partial<PageChrome> = {};
      (patch as Record<string, unknown>)[field] = source;
      state.updateAppSettings({ page: { chrome: patch } });
    });
  };

  const setChromePageNumber = (enabled: boolean): void => {
    if (enabled === layerChrome.pageNumber) return;
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      const id = target.documentId;
      if (target.scope === 'document' && path !== null) {
        state.setPageSettingsOverride(
          path,
          withChromeField(
            pageOverrideFor(state, path, id),
            'pageNumber',
            enabled,
            state.app.page.chrome,
          ) ?? null,
          id,
        );
        return;
      }
      state.updateAppSettings({ page: { chrome: { pageNumber: enabled } } });
    });
  };

  const useGlobalChrome = (): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      if (path === null) return;
      state.setPageSettingsOverride(
        path,
        withoutChrome(pageOverrideFor(state, path, target.documentId)) ?? null,
        target.documentId,
      );
    });
  };

  const useGlobalChromeField = (key: ChromeKey): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      if (path === null) return;
      state.setPageSettingsOverride(
        path,
        withoutChromeField(pageOverrideFor(state, path, target.documentId), key) ?? null,
        target.documentId,
      );
    });
  };

  const resetChrome = (): void => {
    if (scopeRef.current !== 'global') return;
    void runImmediate(() => {
      useSettingsStore.getState().updateAppSettings({
        page: { chrome: DEFAULT_PAGE_CHROME },
      });
    });
  };

  const useGlobalTheme = (): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      if (path === null) return;
      state.setPageSettingsOverride(
        path,
        withoutTheme(pageOverrideFor(state, path, target.documentId)) ?? null,
        target.documentId,
      );
      syncThemeDraftsFromStore('document');
    });
  };

  const useGlobalDensity = (): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      if (path === null) return;
      const current = pageOverrideFor(state, path, target.documentId);
      state.setPageSettingsOverride(
        path,
        withoutPageDensityOverride(current) ?? null,
        target.documentId,
      );
    });
  };

  const useGlobalThemeField = (key: EditableThemeKey): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      if (path === null) return;
      state.setPageSettingsOverride(
        path,
        withoutThemeField(pageOverrideFor(state, path, target.documentId), key) ?? null,
        target.documentId,
      );
      syncThemeDraftsFromStore('document');
    });
  };

  const useGlobalAdvanced = (keys: readonly EditableThemeKey[]): void => {
    if (scopeRef.current !== 'document' || packagePath === null) return;
    void runImmediate((target) => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      if (path === null) return;
      state.setPageSettingsOverride(
        path,
        withoutThemeFields(pageOverrideFor(state, path, target.documentId), keys) ?? null,
        target.documentId,
      );
      syncThemeDraftsFromStore('document');
    });
  };

  const resetTheme = (): void => {
    if (scopeRef.current !== 'global') return;
    void runImmediate(() => {
      useSettingsStore.getState().updateAppSettings({
        page: { theme: DEFAULT_PAGE_SETTINGS.theme },
      });
      syncThemeDraftsFromStore('global');
    });
  };

  const setPreset = (preset: PageThemePreset): void => {
    if (
      preset === layerTheme.preset &&
      (scopeRef.current === 'global' || override?.theme?.preset === undefined)
    ) {
      return;
    }
    const applyPreset = (target: PageSettingsWriteTarget): void => {
      const state = useSettingsStore.getState();
      const path = target.packagePath;
      const id = target.documentId;
      const current = pageOverrideFor(state, path, id);
      const currentDensity = state.app.page.theme.density;
      if (target.scope === 'document' && path !== null) {
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
    };
    void runImmediate((target) => {
      applyPreset(target);
      syncThemeDraftsFromStore(target.scope);
    });
  };

  const requestPreset = (preset: PageThemePreset): void => {
    if (
      preset === layerTheme.preset &&
      (scopeRef.current === 'global' || override?.theme?.preset === undefined)
    ) {
      setPresetWarning(null);
      return;
    }
    // Custom freezes the current values; it never replaces them. A compact or
    // comfortable switch would drop explicit advanced values, so ask first.
    if (
      preset !== 'custom' &&
      presetSwitchReplacesAdvancedValues(scopeRef.current, layerTheme, override)
    ) {
      setPresetWarning(preset);
      return;
    }
    setPresetWarning(null);
    setPreset(preset);
  };

  const confirmPresetSwitch = (): void => {
    const next = presetWarning;
    setPresetWarning(null);
    if (next !== null) setPreset(next);
  };

  const cancelPresetSwitch = (): void => {
    setPresetWarning(null);
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
    if (targetLost.current) {
      // The target is still gone: Retry cannot resurrect it, and claiming
      // "saved" here would hide a write that never happened.
      setCommitError(PAGE_SETTINGS_TARGET_CLOSED_MESSAGE);
      return;
    }
    setCommitError(null);
    const attempt = lastAttempt.current;
    if (attempt !== null) {
      void applyPending(attempt);
      return;
    }
    const immediate = lastImmediate.current;
    if (immediate !== null) {
      void executeImmediate(immediate);
      return;
    }
    useSettingsStore.getState().retrySettingsWrite();
    void flushSettingsWrites();
  };

  const previewSettings = useMemo<PageSettings>(() => {
    const margins = marginValidation.margins ?? layerSetup.margins;
    const density = pageDensityValue(densityPercent);
    // Fields are all-or-nothing: a single invalid draft pauses the draft
    // preview instead of showing a half-applied theme the app would not write.
    const theme =
      themeValidation.values === null
        ? layerTheme
        : { ...layerTheme, ...themeValidation.values };
    return {
      ...resolved,
      setup: { ...layerSetup, margins: { ...margins } },
      theme: { ...theme, density },
    };
  }, [
    resolved,
    layerSetup,
    layerTheme,
    marginValidation.margins,
    themeValidation.values,
    densityPercent,
  ]);

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
    layerChrome,
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
    setChromeSource,
    setChromePageNumber,
    isChromeOverridden: (key) => scope === 'document' && chromeFieldOverridden(override, key),
    hasChromeOverrides: scope === 'document' && hasChromeOverride(override),
    useGlobalChrome,
    useGlobalChromeField,
    resetChrome,
    preset: layerTheme.preset,
    densityPercent,
    setPreset,
    requestPreset,
    presetWarning,
    confirmPresetSwitch,
    cancelPresetSwitch,
    queueDensity,
    useGlobalTheme,
    useGlobalDensity,
    resetTheme,
    isPresetOverridden: scope === 'document' && override?.theme?.preset !== undefined,
    isDensityOverridden:
      scope === 'document' && override?.theme?.density !== undefined,
    themeDrafts,
    themeValidation,
    setThemeField,
    isThemeFieldOverridden: (key) =>
      scope === 'document' && isThemeFieldOverridden(override, key),
    useGlobalThemeField,
    hasAdvancedTypographyOverrides:
      scope === 'document' &&
      hasThemeFieldOverride(override, ADVANCED_TYPOGRAPHY_KEYS),
    hasAdvancedLayoutOverrides:
      scope === 'document' && hasThemeFieldOverride(override, ADVANCED_LAYOUT_KEYS),
    useGlobalAdvancedTypography: () => useGlobalAdvanced(ADVANCED_TYPOGRAPHY_KEYS),
    useGlobalAdvancedLayout: () => useGlobalAdvanced(ADVANCED_LAYOUT_KEYS),
    saving,
    invalid: !marginValidation.valid || !themeValidation.valid,
    commitError,
    retry,
    clearError: () => setCommitError(null),
    previewSettings,
    previewInvalid: !marginValidation.valid || !themeValidation.valid,
    flushPending,
  };
}
