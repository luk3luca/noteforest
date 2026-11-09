/**
 * Personal app settings store (ADR-0008).
 *
 * Global defaults live in `settings.json`; per-document overrides live in the
 * session tab state. This store is the single renderer resolution path:
 *
 *   PageSettings(doc) = mergePageSettings(appSettings.page, pageOverride)
 *   ContinuousSettings(doc) = mergeContinuousSettings(appSettings.continuous,
 *                                                    continuousOverride)
 *
 * Page Read, Page Edit, measurement, and the shared page model all consume the
 * same resolved object, so a settings change re-renders and re-measures instead
 * of leaving a second default path behind. Settings never enter `document.json`.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import type {
  AppSettings,
  ContinuousSettings,
  ContinuousSettingsOverride,
  PageSettings,
  PageSettingsOverride,
} from '@noteforest/layout';
import {
  DEFAULT_APP_SETTINGS,
  mergeContinuousSettings,
  mergePageSettings,
  normalizeAppSettings,
  normalizeContinuousSettingsOverride,
  normalizePageDensity,
  normalizePageSettingsOverride,
} from '@noteforest/layout';
import type { SessionTabState } from '../../../shared/api';

export interface SettingsSnapshot {
  app: AppSettings;
  pageOverrides: Record<string, PageSettingsOverride>;
  continuousOverrides: Record<string, ContinuousSettingsOverride>;
}

interface SettingsState extends SettingsSnapshot {
  /**
   * Load bootstrap settings and session overrides. Called once before the shell
   * becomes ready; later changes go through the setters so they persist.
   */
  initialize: (settings: unknown, tabs: readonly SessionTabState[]) => void;
  /** Normalize, store, and persist the global settings (fire-and-forget IPC). */
  setAppSettings: (settings: unknown) => AppSettings;
  /** Store a per-document page override; `null` clears it. */
  setPageSettingsOverride: (
    packagePath: string,
    override: unknown,
  ) => PageSettingsOverride | undefined;
  /** Store a per-document continuous override; `null` clears it. */
  setContinuousSettingsOverride: (
    packagePath: string,
    override: unknown,
  ) => ContinuousSettingsOverride | undefined;
  resolvedPageSettings: (packagePath: string | null | undefined) => PageSettings;
  resolvedContinuousSettings: (
    packagePath: string | null | undefined,
  ) => ContinuousSettings;
}

function overridesFromTabs(tabs: readonly SessionTabState[]): {
  pageOverrides: Record<string, PageSettingsOverride>;
  continuousOverrides: Record<string, ContinuousSettingsOverride>;
} {
  const pageOverrides: Record<string, PageSettingsOverride> = {};
  const continuousOverrides: Record<string, ContinuousSettingsOverride> = {};
  for (const tab of tabs) {
    const page = normalizePageSettingsOverride(tab.pageSettingsOverride);
    if (page !== undefined) pageOverrides[tab.packagePath] = page;
    const continuous = normalizeContinuousSettingsOverride(tab.continuousSettingsOverride);
    if (continuous !== undefined) continuousOverrides[tab.packagePath] = continuous;
  }
  return { pageOverrides, continuousOverrides };
}

/**
 * Persist global settings through the preload bridge. Unit tests import this
 * store in a plain Node environment with no `window`; the guard keeps the pure
 * resolution behavior testable without a browser.
 */
function persistAppSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  const bridge = window.noteforest;
  if (bridge === undefined || typeof bridge.saveSettings !== 'function') return;
  void bridge.saveSettings(settings).catch(() => undefined);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  app: DEFAULT_APP_SETTINGS,
  pageOverrides: {},
  continuousOverrides: {},

  initialize: (settings, tabs) => {
    const { pageOverrides, continuousOverrides } = overridesFromTabs(tabs);
    set({
      app: normalizeAppSettings(
        settings as Parameters<typeof normalizeAppSettings>[0],
      ),
      pageOverrides,
      continuousOverrides,
    });
  },

  setAppSettings: (settings) => {
    const normalized = normalizeAppSettings(
      settings as Parameters<typeof normalizeAppSettings>[0],
    );
    set({ app: normalized });
    persistAppSettings(normalized);
    return normalized;
  },

  setPageSettingsOverride: (packagePath, override) => {
    const normalized = normalizePageSettingsOverride(override);
    set((state) => {
      const pageOverrides = { ...state.pageOverrides };
      if (normalized === undefined) delete pageOverrides[packagePath];
      else pageOverrides[packagePath] = normalized;
      return { pageOverrides };
    });
    return normalized;
  },

  setContinuousSettingsOverride: (packagePath, override) => {
    const normalized = normalizeContinuousSettingsOverride(override);
    set((state) => {
      const continuousOverrides = { ...state.continuousOverrides };
      if (normalized === undefined) delete continuousOverrides[packagePath];
      else continuousOverrides[packagePath] = normalized;
      return { continuousOverrides };
    });
    return normalized;
  },

  resolvedPageSettings: (packagePath) => {
    const state = get();
    const override =
      packagePath === null || packagePath === undefined
        ? undefined
        : state.pageOverrides[packagePath];
    return mergePageSettings(state.app.page, override);
  },

  resolvedContinuousSettings: (packagePath) => {
    const state = get();
    const override =
      packagePath === null || packagePath === undefined
        ? undefined
        : state.continuousOverrides[packagePath];
    return mergeContinuousSettings(state.app.continuous, override);
  },
}));

/** Resolved page settings for one document; memoized on the global/override refs. */
export function usePageSettings(packagePath: string | null | undefined): PageSettings {
  const globalPage = useSettingsStore((state) => state.app.page);
  const override = useSettingsStore((state) =>
    packagePath === null || packagePath === undefined
      ? undefined
      : state.pageOverrides[packagePath],
  );
  return useMemo(() => mergePageSettings(globalPage, override), [globalPage, override]);
}

/** Resolved continuous settings for one document. */
export function useContinuousSettings(
  packagePath: string | null | undefined,
): ContinuousSettings {
  const globalContinuous = useSettingsStore((state) => state.app.continuous);
  const override = useSettingsStore((state) =>
    packagePath === null || packagePath === undefined
      ? undefined
      : state.continuousOverrides[packagePath],
  );
  return useMemo(
    () => mergeContinuousSettings(globalContinuous, override),
    [globalContinuous, override],
  );
}

/** Slider percent (integer 80–120) of a density value. */
export function pageDensityPercent(density: number): number {
  return Math.round(normalizePageDensity(density) * 100);
}

/** Density multiplier from a slider percent value (80–120). */
export function pageDensityValue(percent: number): number {
  return normalizePageDensity(percent / 100);
}

/**
 * Keep only the density part of the draft: an explicit per-document density
 * override, preserving every other page override field.
 */
export function withPageDensityOverride(
  override: PageSettingsOverride | undefined,
  density: number,
): PageSettingsOverride {
  return {
    ...(override ?? {}),
    theme: { ...(override?.theme ?? {}), density: normalizePageDensity(density) },
  };
}

/**
 * Drop the density part of a per-document override. Other overrides survive;
 * an empty result means "use the global settings again".
 */
export function withoutPageDensityOverride(
  override: PageSettingsOverride | undefined,
): PageSettingsOverride | undefined {
  if (override?.theme?.density === undefined) return override;
  const { density: _density, ...theme } = override.theme;
  const next: PageSettingsOverride = { ...override };
  if (Object.keys(theme).length === 0) delete next.theme;
  else next.theme = theme;
  return Object.keys(next).length === 0 ? undefined : next;
}

/** Test-only reset: restores defaults without persisting. */
export function resetSettingsForTests(): void {
  useSettingsStore.setState({
    app: DEFAULT_APP_SETTINGS,
    pageOverrides: {},
    continuousOverrides: {},
  });
}
