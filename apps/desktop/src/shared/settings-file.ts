/**
 * Versioned `settings.json` document (S2-5).
 *
 * The file is the durable global personal settings store. It has an explicit
 * schema version and a pure migration chain; the in-memory `AppSettings` type
 * never carries the file version.
 *
 * Unknown-field policy: every key the app does not understand is preserved on
 * write, including unknown keys nested inside `page`, `page.setup`, and
 * `page.theme`. A newer app can therefore add fields without an older app
 * silently deleting them, and a downgraded build keeps its own values.
 *
 * v1 -> v2: `continuous` is removed. Its only field was `zoom`, which was dead
 * and duplicated the per-document `DocumentViewState.zoom` (S2-6). The rest of
 * the page settings are preserved.
 *
 * v2 -> v3: the global `appearance` namespace (theme, accent, uiScale, uiFont,
 * codeFont). A missing block normalizes to the product defaults; unknown
 * top-level, page, and appearance keys survive a write. The migration is pure:
 * it never writes during a read.
 */

import {
  normalizeAppSettings,
  type AppSettings,
  type PageSettingsOverride,
} from '@noteforest/layout';

export const SETTINGS_SCHEMA_VERSION = 3;

export interface MigratedSettingsDocument {
  settings: AppSettings;
  /** Version written in the file; 0 when the file had no page settings. */
  storedVersion: number;
  /** Version this app understands from now on (never lowered on write). */
  version: number;
  /** True when a v0/v1 file was migrated while reading. */
  migrated: boolean;
  /** Parsed object without the removed legacy `continuous` block. */
  raw: Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numericVersion(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

/**
 * Detect the stored schema version.
 *
 * A file without `settingsVersion` is v1 when it has a `page` or `continuous`
 * block, and v0 when it is empty/unrelated. Anything else is treated as v1 so
 * the defaults still load; the next write stamps the current version.
 */
export function settingsDocumentVersion(raw: Record<string, unknown>): number {
  const version = numericVersion(raw['settingsVersion']);
  if (version !== null) return version;
  return raw['page'] !== undefined || raw['continuous'] !== undefined ? 1 : 0;
}

/**
 * Pure migration chain. v1 drops the dead `continuous` block; v2 gains the
 * `appearance` namespace (defaults when absent). Future versions append a case
 * here.
 */
export function migrateSettingsDocument(input: unknown): MigratedSettingsDocument {
  const raw = isRecord(input) ? input : {};
  const storedVersion = settingsDocumentVersion(raw);
  const version = Math.max(storedVersion, SETTINGS_SCHEMA_VERSION);
  let migrated = false;
  let candidate: Record<string, unknown> = { ...raw };
  if (storedVersion < 2) {
    const { continuous: _legacyContinuous, ...rest } = candidate;
    candidate = rest;
    migrated = true;
  }
  if (storedVersion < SETTINGS_SCHEMA_VERSION) migrated = true;
  return {
    settings: normalizeAppSettings({
      page: candidate['page'] as PageSettingsOverride | null | undefined,
      appearance: candidate['appearance'],
    }),
    storedVersion,
    version,
    migrated,
    raw: candidate,
  };
}

/**
 * Merge the normalized app settings onto the previous file object.
 *
 * This is the "no blind full replace" boundary for the file: known paths are
 * overwritten with normalized values, unknown paths and keys survive. The
 * version is never lowered, so a v3 file written by a newer build stays v3.
 */
export function settingsDocumentForWrite(
  previousRaw: unknown,
  settings: AppSettings,
): Record<string, unknown> {  const base = isRecord(previousRaw) ? structuredClone(previousRaw) : {};
  const storedVersion = numericVersion(base['settingsVersion']);
  const version =
    storedVersion !== null && storedVersion > SETTINGS_SCHEMA_VERSION
      ? storedVersion
      : SETTINGS_SCHEMA_VERSION;
  // The v1 -> v2 migration removes the dead Continuous zoom block. A file from
  // a newer schema keeps every unknown key, including a future `continuous`.
  if (storedVersion === null || storedVersion < 2) delete base['continuous'];
  const rawPage = isRecord(base['page']) ? base['page'] : {};
  const rawSetup = isRecord(rawPage['setup']) ? rawPage['setup'] : {};
  const rawMargins = isRecord(rawSetup['margins']) ? rawSetup['margins'] : {};
  const rawTheme = isRecord(rawPage['theme']) ? rawPage['theme'] : {};
  const rawChrome = isRecord(rawPage['chrome']) ? rawPage['chrome'] : {};
  const rawAppearance = isRecord(base['appearance']) ? base['appearance'] : {};
  base['settingsVersion'] = version;
  // R3 appearance is global and additive: known fields are normalized, an
  // unknown future appearance key written by a newer build is preserved.
  base['appearance'] = {
    ...rawAppearance,
    theme: settings.appearance.theme,
    accent: settings.appearance.accent,
    uiScale: settings.appearance.uiScale,
    uiFont: settings.appearance.uiFont,
    codeFont: settings.appearance.codeFont,
  };
  base['page'] = {
    ...rawPage,
    setup: {
      ...rawSetup,
      size: settings.page.setup.size,
      orientation: settings.page.setup.orientation,
      margins: { ...rawMargins, ...settings.page.setup.margins },
    },
    theme: { ...rawTheme, ...settings.page.theme },
    // R2 chrome is additive: a file without it loads the defaults, and an
    // unknown future chrome key written by a newer build is preserved.
    chrome: { ...rawChrome, ...settings.page.chrome },
    manualBreakBeforeBlockIds: [...settings.page.manualBreakBeforeBlockIds],
  };
  return base;
}
