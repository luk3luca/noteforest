import {
  Dialog,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  PAGE_DENSITY_MAX,
  PAGE_DENSITY_MIN,
  PAGE_DENSITY_STEP,
} from '@noteforest/layout';
import { useShell } from '../state/shell';
import {
  useSettingsStore,
} from '../state/settings';
import { useRuntime } from '../state/registry';
import { openLibrary, removeRecentLibrary, revealLibraryPath } from '../actions';
import { shortcutsForList, type ShortcutListGroup } from '../lib/shortcuts';
import { Details } from './Details';
import { SETTINGS_SCHEMA_VERSION } from '../../../shared/settings-file';
import { usePageSettingsController } from '../settings/usePageSettingsController';
import { useContinuousSettingsController } from '../settings/useContinuousSettingsController';
import { ContinuousSettingsPage } from '../settings/ContinuousSettings';
import { ContinuousSettingsPreview } from '../settings/ContinuousSettingsPreview';
import { PageSettingsPreview } from '../settings/PageSettingsPreview';
import { AppearanceSettingsPage } from '../settings/AppearanceSettings';
import { AppearanceSettingsPreview } from '../settings/AppearanceSettingsPreview';
import { ExportSettingsPage } from '../settings/ExportSettings';
import {
  AdvancedTypographyFields,
  PageLayoutSection,
} from '../settings/PageAdvancedSettings';
import {
  CHROME_SOURCES,
  formatMm,
  hasMarginOverride,
  hasSetupOverride,
  hasThemeOverride,
  MARGIN_KEYS,
  parseMm,
  type MarginKey,
} from '../settings/page-setup';
import type { SettingsPageId } from '../settings/settings-pages';

interface NavItem {
  id: SettingsPageId;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Batch A Settings IA. Appearance, Export defaults, and the document-settings
 * map recovery are deliberately absent: a page is shown only when it has a real
 * control or real information. No disabled "coming soon" rows exist.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'App',
    items: [
      { id: 'general', label: 'General' },
      { id: 'appearance', label: 'Appearance' },
      { id: 'continuous', label: 'Continuous' },
    ],
  },
  {
    label: 'Document',
    items: [{ id: 'page', label: 'Page' }],
  },
  {
    label: 'Workflow',
    items: [
      { id: 'editor', label: 'Editor' },
      { id: 'export', label: 'Export' },
    ],
  },
  {
    label: 'Data',
    items: [{ id: 'data', label: 'Data & About' }],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

const MARGIN_LABELS: Record<MarginKey, string> = {
  top: 'Top',
  right: 'Right',
  bottom: 'Bottom',
  left: 'Left',
};

const PRESET_LABELS = {
  compact: 'Compact',
  comfortable: 'Comfortable',
  custom: 'Custom',
} as const;

const CHROME_SOURCE_LABELS = {
  none: 'None',
  document: 'Document title',
  chapter: 'Chapter title',
} as const;

const MARGIN_RANGE = {
  min: 0,
  max: 100,
  step: 1,
};

const SHORTCUT_GROUPS = shortcutsForList();

/**
 * Case-insensitive filter over the catalogue's rows. Matches the row label, the
 * displayed keys and the scope note; groups with no match disappear.
 */
function filterShortcuts(query: string): ShortcutListGroup[] {
  const normalized = query.trim().toLowerCase();
  return SHORTCUT_GROUPS.map((group) => ({
    group: group.group,
    rows: group.rows.filter(
      (row) =>
        normalized.length === 0 ||
        row.label.toLowerCase().includes(normalized) ||
        row.keys.toLowerCase().includes(normalized) ||
        (row.note ?? '').toLowerCase().includes(normalized),
    ),
  })).filter((group) => group.rows.length > 0);
}

function statusLabel(state: 'ok' | 'defaults' | 'corrupt' | 'unreadable' | 'newer'): string {
  switch (state) {
    case 'ok':
      return 'OK';
    case 'defaults':
      return 'Defaults (no file yet)';
    case 'corrupt':
      return 'Can’t read — using defaults';
    case 'unreadable':
      return 'Can’t read — using defaults';
    case 'newer':
      return 'From a newer version';
    default:
      return state;
  }
}

/**
 * Settings shell with instant save (Batch A).
 *
 * There is no draft/Apply/Cancel model: every real change writes immediately
 * (sliders are debounced) and the footer reflects the actual write. Scope is a
 * layer selector only; switching it never writes. A Page value equal to the
 * global value removes the per-document override instead of storing a no-op.
 */
export function SettingsDialog({
  onClose,
  initialPage = 'general',
}: {
  onClose: () => void;
  /**
   * Page to open on. ⌘, and the palette land on General; the Help → Keyboard
   * shortcuts command targets Editor, and the Page toolbar can target Page.
   */
  initialPage?: SettingsPageId;
}): JSX.Element {
  const packagePath = useShell((state) => state.activeTab);
  const library = useShell((state) => state.library);
  const { runtime } = useRuntime(packagePath);
  const documentAvailable = packagePath !== null && runtime !== null;
  const documentId = runtime?.document.id ?? null;

  const settingsStatus = useSettingsStore((state) => state.settingsStatus);
  const documentSettingsStatus = useSettingsStore(
    (state) => state.documentSettingsStatus,
  );
  const documentSettingsBackup = useSettingsStore(
    (state) => state.documentSettingsBackup,
  );
  const dismissedWarnings = useSettingsStore((state) => state.dismissedWarnings);
  const saveState = useSettingsStore((state) => state.saveState);
  const pageSettings = usePageSettingsController(
    packagePath,
    documentId,
    documentAvailable,
  );
  const continuousSettings = useContinuousSettingsController();

  const [page, setPage] = useState<SettingsPageId>(initialPage);
  const [shortcutQuery, setShortcutQuery] = useState('');
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [globalResetError, setGlobalResetError] = useState<string | null>(null);
  const [documentRecoveryConfirm, setDocumentRecoveryConfirm] = useState<
    'reset' | 'restore' | null
  >(null);
  const [documentRecoveryBusy, setDocumentRecoveryBusy] = useState(false);
  const [documentRecoveryError, setDocumentRecoveryError] = useState<string | null>(
    null,
  );

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Capture the real trigger before the modal focus scope moves focus. React
  // Aria restores focus for its own dismiss paths; the shell closes Settings by
  // removing the surface, so restore explicitly on unmount too.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  if (
    returnFocusRef.current === null &&
    typeof document !== 'undefined' &&
    document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
  ) {
    returnFocusRef.current = document.activeElement;
  }
  useEffect(
    () => () => {
      const target = returnFocusRef.current;
      if (target === null) return;
      // Run after React Aria's modal focus scope restores.
      requestAnimationFrame(() => {
        // Do not steal focus from a surface that opened while Settings closed
        // (for example Settings -> Export PDF…).
        if (document.querySelector('[role="dialog"]') !== null) return;
        if (target.isConnected) target.focus({ preventScroll: true });
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void window.noteforest
      .getSystemInfo()
      .then((info) => {
        if (!cancelled) setAppVersion(info.appVersion);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const pageScope = pageSettings.scope;
  const marginValidation = pageSettings.marginValidation;
  const marginErrorId = 'page-margin-error';
  const setupOverridden =
    pageScope === 'document' && hasSetupOverride(pageSettings.override);
  const marginGroupOverridden =
    pageScope === 'document' && hasMarginOverride(pageSettings.override);
  const themeOverridden =
    pageScope === 'document' && hasThemeOverride(pageSettings.override);
  const chromeOverridden = pageSettings.hasChromeOverrides;

  const errorMessage =
    continuousSettings.error ??
    pageSettings.commitError ??
    (saveState.status === 'error' ? saveState.message ?? 'Unknown error.' : null);
  const status =
    errorMessage !== null
      ? 'error'
      : pageSettings.invalid
        ? 'invalid'
        : pageSettings.saving || continuousSettings.saving || saveState.status === 'saving'
          ? 'saving'
          : 'saved';
  const statusText =
    status === 'saved'
      ? 'Saved'
      : status === 'saving'
        ? 'Saving…'
        : status === 'invalid'
          ? 'Not saved — check the highlighted values'
          : 'Couldn’t save —';

  const activePage = NAV_ITEMS.some((item) => item.id === page) ? page : 'page';
  const pageIndex = NAV_ITEMS.findIndex((item) => item.id === activePage);
  const shortcutGroups = filterShortcuts(shortcutQuery);

  const onNavKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    event.preventDefault();
    let nextIndex = pageIndex;
    if (event.key === 'ArrowDown') nextIndex = (pageIndex + 1) % NAV_ITEMS.length;
    else if (event.key === 'ArrowUp') nextIndex = (pageIndex - 1 + NAV_ITEMS.length) % NAV_ITEMS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = NAV_ITEMS.length - 1;
    const next = NAV_ITEMS[nextIndex];
    if (next === undefined) return;
    setPage(next.id);
    requestAnimationFrame(() => {
      document.getElementById(`nf-settings-nav-${next.id}`)?.focus();
    });
  };

  /** Persist a debounced edit before closing, then close. */
  const requestClose = (): void => {
    void pageSettings.flushPending();
    void continuousSettings.flushPending();
    onCloseRef.current();
  };

  const retrySettings = (): void => {
    if (continuousSettings.error !== null) continuousSettings.retry();
    else pageSettings.retry();
  };

  const densityRange = {
    min: PAGE_DENSITY_MIN * 100,
    max: PAGE_DENSITY_MAX * 100,
    step: Math.round(PAGE_DENSITY_STEP * 100),
  };

  const statusWarning =
    settingsStatus.state === 'corrupt' ||
    settingsStatus.state === 'unreadable' ||
    settingsStatus.state === 'newer';
  const documentStatusWarning =
    documentSettingsStatus.state === 'corrupt' ||
    documentSettingsStatus.state === 'unreadable';
  const globalRecoveryAvailable =
    settingsStatus.state === 'corrupt' || settingsStatus.state === 'unreadable';
  const documentRecoveryAvailable =
    documentSettingsStatus.state === 'corrupt' ||
    documentSettingsStatus.state === 'unreadable';

  const runGlobalReset = async (): Promise<void> => {
    setGlobalResetError(null);
    const result = await useSettingsStore.getState().resetSettingsToDefaults();
    if (!result.ok) setGlobalResetError(result.message);
  };

  const runDocumentRecovery = async (kind: 'reset' | 'restore'): Promise<void> => {
    setDocumentRecoveryBusy(true);
    setDocumentRecoveryError(null);
    try {
      const store = useSettingsStore.getState();
      const result =
        kind === 'reset'
          ? await store.resetDocumentSettings()
          : await store.restoreDocumentSettingsBackup();
      if (!result.ok) {
        setDocumentRecoveryError(result.message);
        return;
      }
      setDocumentRecoveryConfirm(null);
    } finally {
      setDocumentRecoveryBusy(false);
    }
  };

  const stepMargin = (key: MarginKey, delta: number): void => {
    const current = parseMm(pageSettings.marginDrafts[key]) ?? pageSettings.layerSetup.margins[key];
    const next = Math.min(
      MARGIN_RANGE.max,
      Math.max(MARGIN_RANGE.min, Math.round((current + delta) * 100) / 100),
    );
    pageSettings.setMargin(key, formatMm(next));
  };

  const stepAllSides = (delta: number): void => {
    const current =
      parseMm(pageSettings.allSidesValue) ?? pageSettings.layerSetup.margins.top;
    const next = Math.min(
      MARGIN_RANGE.max,
      Math.max(MARGIN_RANGE.min, Math.round((current + delta) * 100) / 100),
    );
    pageSettings.setAllSides(formatMm(next));
  };

  const globalPage = (
    <>
      <p className="nf-settings-help" data-page-lens-help="true">
        Page, Page Edit, the preview, and PDF share these settings.
      </p>

      <div
        className="nf-settings-scope"
        data-page-scope="true"
        data-settings-scope="true"
        role="group"
        aria-label="Page settings scope"
      >
        <span className="nf-settings-row-label">Apply to</span>
        <div className="nf-segmented">
          <button
            type="button"
            className="nf-segmented-item"
            data-page-scope-option="global"
            aria-pressed={pageScope === 'global'}
            onClick={() => pageSettings.setScope('global')}
          >
            Global default
          </button>
          <button
            type="button"
            className="nf-segmented-item"
            data-page-scope-option="document"
            aria-pressed={pageScope === 'document'}
            disabled={!documentAvailable}
            title={
              documentAvailable
                ? undefined
                : 'Open a note to override Page settings.'
            }
            onClick={() => pageSettings.setScope('document')}
          >
            This document
          </button>
        </div>
      </div>

      <section className="nf-settings-section" data-page-setup-section="true">
        <div className="nf-settings-section-head">
          <h4 className="nf-settings-section-title">Page setup</h4>
          <div className="nf-settings-section-actions">
            {pageScope === 'document' && setupOverridden ? (
              <button
                type="button"
                className="nf-button nf-button-quiet"
                data-page-setup-use-global="true"
                onClick={() => pageSettings.useGlobalSetup()}
              >
                Use global
              </button>
            ) : null}
            {pageScope === 'global' ? (
              <button
                type="button"
                className="nf-button nf-button-quiet"
                data-page-setup-reset="true"
                onClick={() => pageSettings.resetSetup()}
              >
                Reset to default
              </button>
            ) : null}
          </div>
        </div>

        <div className="nf-settings-row">
          <span className="nf-settings-row-label">
            Page size
            {pageSettings.isSizeOverridden ? (
              <span
                className="nf-override-dot"
                data-page-size-override="true"
                title="This document overrides the global page size"
                aria-label="Overridden for this document"
              />
            ) : null}
          </span>
          <div className="nf-settings-control">
            <div className="nf-segmented">
              {(['A4', 'A5', 'Letter'] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  className="nf-segmented-item"
                  data-page-size-option={size}
                  aria-pressed={pageSettings.size === size}
                  onClick={() => pageSettings.setSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
            {pageScope === 'document' && pageSettings.isSizeOverridden ? (
              <button
                type="button"
                className="nf-button nf-button-quiet"
                data-page-size-use-global="true"
                onClick={() => pageSettings.useGlobalSize()}
              >
                Use global
              </button>
            ) : null}
          </div>
        </div>

        <div className="nf-settings-row">
          <span className="nf-settings-row-label">
            Orientation
            {pageSettings.isOrientationOverridden ? (
              <span
                className="nf-override-dot"
                data-page-orientation-override="true"
                title="This document overrides the global orientation"
                aria-label="Overridden for this document"
              />
            ) : null}
          </span>
          <div className="nf-settings-control">
            <div className="nf-segmented">
              {(['portrait', 'landscape'] as const).map((orientation) => (
                <button
                  key={orientation}
                  type="button"
                  className="nf-segmented-item"
                  data-page-orientation-option={orientation}
                  aria-pressed={pageSettings.orientation === orientation}
                  onClick={() => pageSettings.setOrientation(orientation)}
                >
                  {orientation === 'portrait' ? 'Portrait' : 'Landscape'}
                </button>
              ))}
            </div>
            {pageScope === 'document' && pageSettings.isOrientationOverridden ? (
              <button
                type="button"
                className="nf-button nf-button-quiet"
                data-page-orientation-use-global="true"
                onClick={() => pageSettings.useGlobalOrientation()}
              >
                Use global
              </button>
            ) : null}
          </div>
        </div>

        <div className="nf-margin-block" data-page-margins="true">
          <div className="nf-margin-head">
            <span className="nf-settings-row-label">
              Margins
              {marginGroupOverridden ? (
                <span
                  className="nf-override-dot"
                  data-page-margins-override="true"
                  title="This document overrides at least one margin"
                  aria-label="Overridden for this document"
                />
              ) : null}
            </span>
            <div className="nf-settings-control nf-margin-all-control">
              <label className="nf-margin-all-label" htmlFor="page-margin-all">
                All sides
              </label>
              <div className="nf-margin-input-row">
                <input
                  id="page-margin-all"
                  className="nf-input nf-margin-input"
                  type="text"
                  inputMode="decimal"
                  value={pageSettings.allSidesValue}
                  placeholder="Mixed"
                  aria-label="All sides margin in millimetres"
                  aria-invalid={marginValidation.groupError !== null ? true : undefined}
                  aria-describedby={
                    marginValidation.groupError !== null ? marginErrorId : undefined
                  }
                  data-page-margin-all="true"
                  onChange={(event) => pageSettings.setAllSides(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    stepAllSides((event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 5 : 1));
                  }}
                />
                <span className="nf-margin-unit">mm</span>
              </div>
              {marginGroupOverridden ? (
                <button
                  type="button"
                  className="nf-button nf-button-quiet"
                  data-page-margins-use-global="true"
                  onClick={() => pageSettings.useGlobalMargins()}
                >
                  Use global margins
                </button>
              ) : null}
            </div>
          </div>

          <div className="nf-margin-grid">
            {MARGIN_KEYS.map((key) => {
              const fieldError = marginValidation.fieldErrors[key];
              const describedBy =
                [
                  fieldError === undefined ? null : `page-margin-${key}-error`,
                  marginValidation.groupError === null ? null : marginErrorId,
                ]
                  .filter((value): value is string => value !== null)
                  .join(' ') || undefined;
              return (
                <div className="nf-margin-field" key={key}>
                  <label className="nf-margin-label" htmlFor={`page-margin-${key}`}>
                    {MARGIN_LABELS[key]}
                    {pageSettings.isMarginOverridden(key) ? (
                      <span
                        className="nf-override-dot"
                        data-page-margin-override={key}
                        title={`This document overrides the ${MARGIN_LABELS[
                          key
                        ].toLowerCase()} margin`}
                        aria-label="Overridden for this document"
                      />
                    ) : null}
                  </label>
                  <div className="nf-margin-input-row">
                    <input
                      id={`page-margin-${key}`}
                      className="nf-input nf-margin-input"
                      type="text"
                      inputMode="decimal"
                      value={pageSettings.marginDrafts[key]}
                      aria-label={`${MARGIN_LABELS[key]} margin in millimetres`}
                      aria-invalid={fieldError === undefined ? undefined : true}
                      aria-describedby={describedBy}
                      data-page-margin={key}
                      onChange={(event) => pageSettings.setMargin(key, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                        event.preventDefault();
                        stepMargin(
                          key,
                          (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 5 : 1),
                        );
                      }}
                    />
                    <span className="nf-margin-unit">mm</span>
                    {pageScope === 'document' && pageSettings.isMarginOverridden(key) ? (
                      <button
                        type="button"
                        className="nf-icon-button nf-margin-use-global"
                        data-page-margin-use-global={key}
                        title={`Use the global ${MARGIN_LABELS[key].toLowerCase()} margin`}
                        aria-label={`Use global for the ${MARGIN_LABELS[
                          key
                        ].toLowerCase()} margin`}
                        onClick={() => pageSettings.useGlobalMargin(key)}
                      >
                        ↺
                      </button>
                    ) : null}
                  </div>
                  {fieldError === undefined ? null : (
                    <span
                      id={`page-margin-${key}-error`}
                      className="nf-margin-field-error"
                      data-page-margin-field-error={key}
                    >
                      {fieldError}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {marginValidation.groupError === null ? null : (
            <p
              id={marginErrorId}
              className="nf-settings-inline-error"
              role="alert"
              data-page-margin-error="true"
            >
              {marginValidation.groupError}
            </p>
          )}
          <p className="nf-settings-help" data-page-margins-help="true">
            Up to 100 mm per side. The content needs at least 20 mm.
          </p>
        </div>

        {pageSettings.setupError === null ? null : (
          <p
            className="nf-settings-inline-error"
            role="alert"
            data-page-setup-error="true"
          >
            {pageSettings.setupError}
          </p>
        )}
      </section>

      <section className="nf-settings-section" data-page-chrome-section="true">
        <div className="nf-settings-section-head">
          <h4 className="nf-settings-section-title">Chrome</h4>
          <div className="nf-settings-section-actions">
            {pageScope === 'document' && chromeOverridden ? (
              <button
                type="button"
                className="nf-button nf-button-quiet"
                data-page-chrome-use-global="true"
                onClick={() => pageSettings.useGlobalChrome()}
              >
                Use global
              </button>
            ) : null}
            {pageScope === 'global' ? (
              <button
                type="button"
                className="nf-button nf-button-quiet"
                data-page-chrome-reset="true"
                onClick={() => pageSettings.resetChrome()}
              >
                Reset to default
              </button>
            ) : null}
          </div>
        </div>

        {(['header', 'footer'] as const).map((field) => (
          <div className="nf-settings-row" key={field}>
            <span className="nf-settings-row-label">
              {field === 'header' ? 'Header' : 'Footer'}
              {pageSettings.isChromeOverridden(field) ? (
                <span
                  className="nf-override-dot"
                  data-page-chrome-override={field}
                  title={`This document overrides the global ${
                    field === 'header' ? 'header' : 'footer'
                  } source`}
                  aria-label="Overridden for this document"
                />
              ) : null}
            </span>
            <div className="nf-settings-control">
              <div className="nf-segmented">
                {CHROME_SOURCES.map((source) => (
                  <button
                    key={source}
                    type="button"
                    className="nf-segmented-item"
                    data-page-chrome-option={`${field}-${source}`}
                    aria-pressed={pageSettings.layerChrome[field] === source}
                    onClick={() => pageSettings.setChromeSource(field, source)}
                  >
                    {CHROME_SOURCE_LABELS[source]}
                  </button>
                ))}
              </div>
              {pageScope === 'document' && pageSettings.isChromeOverridden(field) ? (
                <button
                  type="button"
                  className="nf-button nf-button-quiet"
                  data-page-chrome-use-global={field}
                  onClick={() => pageSettings.useGlobalChromeField(field)}
                >
                  Use global
                </button>
              ) : null}
            </div>
          </div>
        ))}

        <div className="nf-settings-row">
          <label className="nf-settings-row-label" htmlFor="page-chrome-page-number">
            Page number
            {pageSettings.isChromeOverridden('pageNumber') ? (
              <span
                className="nf-override-dot"
                data-page-chrome-override="pageNumber"
                title="This document overrides the global page-number setting"
                aria-label="Overridden for this document"
              />
            ) : null}
          </label>
          <div className="nf-settings-control">
            <label className="nf-settings-check">
              <input
                id="page-chrome-page-number"
                type="checkbox"
                checked={pageSettings.layerChrome.pageNumber}
                data-page-chrome-page-number="true"
                onChange={(event) => pageSettings.setChromePageNumber(event.target.checked)}
              />
              <span>Show “Page N of M” at the bottom center</span>
            </label>
            {pageScope === 'document' &&
            pageSettings.isChromeOverridden('pageNumber') ? (
              <button
                type="button"
                className="nf-button nf-button-quiet"
                data-page-chrome-use-global="pageNumber"
                onClick={() => pageSettings.useGlobalChromeField('pageNumber')}
              >
                Use global
              </button>
            ) : null}
          </div>
        </div>

        <p className="nf-settings-help" data-page-chrome-help="true">
          The header and footer use the note and chapter titles. The page number stays
          centered.
        </p>
      </section>

      <section className="nf-settings-section" data-page-typography-section="true">
        <div className="nf-settings-section-head">
          <h4 className="nf-settings-section-title">Typography</h4>
          <div className="nf-settings-section-actions">
            {pageScope === 'document' && themeOverridden ? (
              <button
                type="button"
                className="nf-button nf-button-quiet"
                data-page-theme-use-global="true"
                onClick={() => pageSettings.useGlobalTheme()}
              >
                Use global
              </button>
            ) : null}
            {pageScope === 'global' ? (
              <button
                type="button"
                className="nf-button nf-button-quiet"
                data-page-theme-reset="true"
                onClick={() => pageSettings.resetTheme()}
              >
                Reset to default
              </button>
            ) : null}
          </div>
        </div>

        <div className="nf-settings-row">
          <span className="nf-settings-row-label">
            Preset
            {pageSettings.isPresetOverridden ? (
              <span
                className="nf-override-dot"
                data-page-preset-override="true"
                title="This document overrides the global preset"
                aria-label="Overridden for this document"
              />
            ) : null}
          </span>
          <div className="nf-settings-control">
            <div className="nf-segmented">
              {(['compact', 'comfortable', 'custom'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="nf-segmented-item"
                  data-page-preset-option={preset}
                  aria-pressed={pageSettings.preset === preset}
                  onClick={() => pageSettings.requestPreset(preset)}
                >
                  {PRESET_LABELS[preset]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {pageSettings.presetWarning === null ? null : (
          <div
            className="nf-settings-warning"
            role="alert"
            data-page-preset-warning="true"
          >
            <p>
              Switch to {PRESET_LABELS[pageSettings.presetWarning]} and replace the custom
              values in this layer?
            </p>
            <div className="nf-dialog-inline-actions">
              <button
                type="button"
                className="nf-button"
                data-page-preset-confirm="true"
                onClick={() => pageSettings.confirmPresetSwitch()}
              >
                Switch and replace
              </button>
              <button
                type="button"
                className="nf-button nf-button-quiet"
                data-page-preset-cancel="true"
                onClick={() => pageSettings.cancelPresetSwitch()}
              >
                Keep custom values
              </button>
            </div>
          </div>
        )}

        <div
          className="nf-settings-row"
          data-page-density-section="true"
          data-override={pageSettings.isDensityOverridden ? 'true' : 'false'}
        >
          <label className="nf-settings-row-label" htmlFor="page-density-slider">
            Page density
            {pageSettings.isDensityOverridden ? (
              <span
                className="nf-override-dot"
                data-page-density-override="true"
                title="This document overrides the global density"
                aria-label="Overridden for this document"
              />
            ) : null}
          </label>
          <div className="nf-settings-control nf-density-row">
            <input
              id="page-density-slider"
              type="range"
              className="nf-range"
              min={densityRange.min}
              max={densityRange.max}
              step={densityRange.step}
              value={pageSettings.densityPercent}
              aria-label="Page density"
              aria-valuetext={`${pageSettings.densityPercent}%`}
              data-page-density-slider="true"
              onChange={(event) => pageSettings.queueDensity(Number(event.target.value))}
            />
            <span className="nf-density-value" data-page-density-value="true">
              {pageSettings.densityPercent}%
            </span>
            {pageScope === 'document' ? (
              <button
                type="button"
                className="nf-button nf-button-quiet"
                data-page-density-use-global="true"
                disabled={!documentAvailable || !pageSettings.isDensityOverridden}
                onClick={() => pageSettings.useGlobalDensity()}
              >
                Use global
              </button>
            ) : (
              <button
                type="button"
                className="nf-button nf-button-quiet"
                data-page-density-reset="true"
                disabled={pageSettings.densityPercent === 100}
                onClick={() => pageSettings.queueDensity(100)}
              >
                Reset
              </button>
            )}
          </div>
        </div>
        <p className="nf-settings-help" data-page-density-note="true">
          {pageScope === 'document'
            ? `This note uses ${pageSettings.densityPercent}% for Page and PDF.`
            : 'Density for notes without their own setting.'}
        </p>
        <p className="nf-settings-help" data-page-density-tail="true">
          60–70% is densest; 80% and up keeps larger type.
        </p>
        <AdvancedTypographyFields controller={pageSettings} />
      </section>

      <PageLayoutSection controller={pageSettings} />
    </>
  );

  return (
    <ModalOverlay
      className="nf-overlay"
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <Modal className="nf-settings-modal" data-settings-dialog="true">
        <Dialog className="nf-settings" aria-label="Settings">
          <header className="nf-settings-head">
            <h2 className="nf-settings-heading">Settings</h2>
            <button
              type="button"
              className="nf-icon-button"
              aria-label="Close"
              title="Close (Esc)"
              onClick={requestClose}
            >
              <X size={13} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </header>
          <div className="nf-settings-body">
            <nav
              className="nf-settings-nav"
              aria-label="Settings pages"
              onKeyDown={onNavKeyDown}
            >
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="nf-settings-nav-group">
                  <span className="nf-settings-nav-label">{group.label}</span>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      id={`nf-settings-nav-${item.id}`}
                      type="button"
                      className="nf-settings-nav-item"
                      data-settings-nav={item.id}
                      aria-current={activePage === item.id ? 'page' : undefined}
                      onClick={() => setPage(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <section className="nf-settings-pane" aria-label={NAV_ITEMS[pageIndex]?.label ?? 'Settings'}>
              {statusWarning && !dismissedWarnings.global ? (
                <div
                  className="nf-settings-warning"
                  role="alert"
                  data-settings-warning={settingsStatus.state}
                >
                  <p>
                    {settingsStatus.state === 'newer'
                      ? 'These settings come from a newer NoteForest. They are used as they are.'
                      : 'These settings couldn’t be read. The defaults are in use.'}
                  </p>
                  {settingsStatus.message === undefined ? null : (
                    <Details value={settingsStatus.message} />
                  )}
                  {settingsStatus.backupPath === undefined ? null : (
                    <p className="nf-settings-help">
                      A copy of the damaged file is kept at <code>{settingsStatus.backupPath}</code>.
                    </p>
                  )}
                  <div className="nf-dialog-inline-actions">
                    {globalRecoveryAvailable ? (
                      <button
                        type="button"
                        className="nf-button"
                        data-settings-reset="true"
                        onClick={() => void runGlobalReset()}
                      >
                        Reset settings
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="nf-button"
                      data-settings-dismiss-warning="true"
                      onClick={() => useSettingsStore.getState().dismissSettingsWarning('global')}
                    >
                      Dismiss
                    </button>
                  </div>
                  {globalResetError === null ? null : (
                    <p
                      className="nf-settings-help"
                      role="alert"
                      data-settings-recovery-error="true"
                    >
                      {globalResetError}
                    </p>
                  )}
                </div>
              ) : null}
              {documentStatusWarning && !dismissedWarnings.document ? (
                <div
                  className="nf-settings-warning"
                  role="alert"
                  data-document-settings-warning={documentSettingsStatus.state}
                >
                  <p>
                    Note settings couldn’t be read. The defaults are in use until you reset or
                    restore them.
                  </p>
                  {documentSettingsStatus.message === undefined ? null : (
                    <Details value={documentSettingsStatus.message} />
                  )}
                  <div className="nf-dialog-inline-actions">
                    {documentRecoveryAvailable ? (
                      <button
                        type="button"
                        className="nf-button"
                        data-document-settings-reset-banner="true"
                        onClick={() => setPage('data')}
                      >
                        Recover in Data &amp; About
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="nf-button"
                      data-document-settings-dismiss-warning="true"
                      onClick={() =>
                        useSettingsStore.getState().dismissSettingsWarning('document')
                      }
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}
              {activePage === 'general' ? (
                <>
                  <h3 className="nf-settings-page-title">General</h3>
                  <section className="nf-settings-section">
                    <h4 className="nf-settings-section-title">Saving</h4>
                    <p className="nf-settings-help">Saves automatically. ⌘S saves now.</p>
                  </section>
                  <section className="nf-settings-section">
                    <h4 className="nf-settings-section-title">Shortcuts</h4>
                    <div className="nf-settings-row">
                      <span className="nf-settings-row-label">Keyboard shortcuts</span>
                      <button
                        type="button"
                        className="nf-button"
                        data-settings-open-shortcuts="true"
                        onClick={() => setPage('editor')}
                      >
                        Open shortcut list
                      </button>
                    </div>
                  </section>
                  <section className="nf-settings-section">
                    <h4 className="nf-settings-section-title">About</h4>
                    <p className="nf-settings-help" data-settings-version="true">
                      NoteForest {appVersion ?? '…'}
                    </p>
                  </section>
                </>
              ) : null}

              {activePage === 'appearance' ? <AppearanceSettingsPage /> : null}

              {activePage === 'page' ? (
                <>
                  <h3 className="nf-settings-page-title">Page</h3>
                  <p className="nf-settings-page-description">
                    Page settings for this note and the app default.
                  </p>
                  {globalPage}
                </>
              ) : null}

              {activePage === 'continuous' ? (
                <ContinuousSettingsPage controller={continuousSettings} />
              ) : null}

              {activePage === 'editor' ? (
                <>
                  <h3 className="nf-settings-page-title">Editor</h3>
                  <section className="nf-settings-section" data-shortcuts-section="true">
                    <h4 className="nf-settings-section-title">Keyboard shortcuts</h4>
                    <div className="nf-shortcut-search">
                      <input
                        className="nf-input"
                        type="text"
                        value={shortcutQuery}
                        placeholder="Search by name or shortcut"
                        aria-label="Search keyboard shortcuts"
                        data-shortcut-search="true"
                        autoFocus={initialPage === 'editor'}
                        onChange={(event) => setShortcutQuery(event.target.value)}
                        onKeyDown={(event) => {
                          // Escape clears the query first. Only an empty field
                          // lets the modal overlay close Settings.
                          if (event.key !== 'Escape' || shortcutQuery.length === 0) return;
                          event.preventDefault();
                          event.stopPropagation();
                          setShortcutQuery('');
                        }}
                      />
                      {shortcutQuery.length === 0 ? null : (
                        <button
                          type="button"
                          className="nf-button nf-button-quiet"
                          data-shortcut-clear="true"
                          onClick={() => setShortcutQuery('')}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {shortcutGroups.length === 0 ? (
                      <p className="nf-shortcut-empty" data-shortcuts-empty="true">
                        No shortcuts match “{shortcutQuery.trim()}”.{' '}
                        <button
                          type="button"
                          className="nf-button nf-button-quiet"
                          data-shortcuts-empty-clear="true"
                          onClick={() => setShortcutQuery('')}
                        >
                          Clear search
                        </button>
                      </p>
                    ) : (
                      shortcutGroups.map((group) => (
                        <div
                          key={group.group}
                          className="nf-shortcut-group"
                          data-shortcut-group={group.group}
                        >
                          <h5 className="nf-shortcut-group-title">{group.group}</h5>
                          <dl className="nf-shortcut-list">
                            {group.rows.map((row) => (
                              <div
                                key={`${group.group}-${row.id}`}
                                className="nf-shortcut-row"
                                data-shortcut-row="true"
                                data-shortcut-id={row.id}
                              >
                                <dt>{row.label}</dt>
                                <dd>
                                  <kbd>{row.keys}</kbd>
                                  {row.note === undefined ? null : (
                                    <span className="nf-shortcut-note">{row.note}</span>
                                  )}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ))
                    )}
                    <p className="nf-settings-help" data-shortcuts-help="true">
                      Shortcuts are fixed.
                    </p>
                  </section>
                  <section className="nf-settings-section">
                    <h4 className="nf-settings-section-title">Saving</h4>
                    <p className="nf-settings-help">Saves automatically. ⌘S saves now.</p>
                  </section>
                </>
              ) : null}

              {activePage === 'export' ? <ExportSettingsPage /> : null}

              {activePage === 'data' ? (
                <>
                  <h3 className="nf-settings-page-title">Data &amp; About</h3>
                  <section className="nf-settings-section">
                    <h4 className="nf-settings-section-title">Paths</h4>
                    <dl className="nf-settings-list">
                      <div>
                        <dt>Library</dt>
                        <dd data-settings-library-path="true">{library?.libraryPath ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>App data</dt>
                        <dd data-settings-app-data-path="true">{library?.appSupportPath ?? '—'}</dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      className="nf-button"
                      data-settings-reveal-library="true"
                      onClick={() => void revealLibraryPath()}
                    >
                      Reveal library in Finder
                    </button>
                    <button
                      type="button"
                      className="nf-button"
                      data-settings-reveal-app-data="true"
                      onClick={() => void window.noteforest.revealAppSupport()}
                    >
                      Reveal app data in Finder
                    </button>
                  </section>
                  <section className="nf-settings-section">
                    <h4 className="nf-settings-section-title">Libraries</h4>
                    <p className="nf-settings-help">
                      One library per window. Removing one from the list never deletes files.
                    </p>
                    <div className="nf-library-settings-list" data-settings-library-list="true">
                      {(library?.libraries ?? []).length === 0 ? (
                        <p className="nf-settings-help" data-settings-library-empty="true">
                          No recent libraries.
                        </p>
                      ) : (
                        (library?.libraries ?? []).map((recent) => (
                          <div
                            key={recent.path}
                            className="nf-library-settings-row"
                            data-settings-library-row={recent.path}
                            data-active={recent.active}
                          >
                            <span className="nf-library-settings-copy">
                              <span className="nf-library-settings-name">
                                {recent.name}
                                {recent.active ? ' — active' : ''}
                              </span>
                              <span className="nf-library-settings-path" title={recent.path}>
                                {recent.path}
                              </span>
                              {recent.missing ? (
                                <span className="nf-library-settings-missing">Not found</span>
                              ) : null}
                            </span>
                            <button
                              type="button"
                              className="nf-text-button"
                              data-settings-library-reveal={recent.path}
                              onClick={() => void revealLibraryPath(recent.path)}
                            >
                              Reveal
                            </button>
                            <button
                              type="button"
                              className="nf-text-button"
                              data-settings-library-remove={recent.path}
                              disabled={recent.active}
                              title={
                                recent.active
                                  ? 'Switch to another library before removing this one'
                                  : 'Remove from recents'
                              }
                              onClick={() => void removeRecentLibrary(recent.path)}
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <button
                      type="button"
                      className="nf-button"
                      data-settings-library-open="true"
                      onClick={() => void openLibrary()}
                    >
                      Open library…
                    </button>
                  </section>
                  <section className="nf-settings-section">
                    <h4 className="nf-settings-section-title">Settings file</h4>
                    <dl className="nf-settings-list">
                      <div>
                        <dt>Status</dt>
                        <dd data-settings-file-status={settingsStatus.state}>
                          {statusLabel(settingsStatus.state)}
                        </dd>
                      </div>
                      <div>
                        <dt>Schema version</dt>
                        <dd data-settings-schema-version="true">
                          {settingsStatus.state === 'newer'
                            ? settingsStatus.version ?? SETTINGS_SCHEMA_VERSION
                            : SETTINGS_SCHEMA_VERSION}
                        </dd>
                      </div>
                    </dl>
                    {settingsStatus.message === undefined ? null : (
                      <div data-settings-file-message="true">
                        <Details value={settingsStatus.message} />
                      </div>
                    )}
                    {settingsStatus.backupPath === undefined ? null : (
                      <p className="nf-settings-help" data-settings-backup-path="true">
                        A copy of the damaged file is kept at{' '}
                        <code>{settingsStatus.backupPath}</code>.
                      </p>
                    )}
                    {settingsStatus.migrated === true ? (
                      <p className="nf-settings-help" data-settings-migrated="true">
                        Settings were upgraded. Your values are kept.
                      </p>
                    ) : null}
                    {globalRecoveryAvailable ? (
                      <>
                        <p className="nf-settings-help">
                          Reset replaces these settings with the defaults. The note is not
                          changed.
                        </p>
                        <button
                          type="button"
                          className="nf-button"
                          data-settings-reset-file="true"
                          onClick={() => void runGlobalReset()}
                        >
                          Reset settings
                        </button>
                      </>
                    ) : null}
                    {globalResetError === null ? null : (
                      <p
                        className="nf-settings-help"
                        role="alert"
                        data-settings-file-recovery-error="true"
                      >
                        {globalResetError}
                      </p>
                    )}
                  </section>
                  <section className="nf-settings-section" data-document-settings-section="true">
                    <h4 className="nf-settings-section-title">Document settings</h4>
                    <dl className="nf-settings-list">
                      <div>
                        <dt>Status</dt>
                        <dd data-document-settings-file-status={documentSettingsStatus.state}>
                          {statusLabel(documentSettingsStatus.state)}
                        </dd>
                      </div>
                    </dl>
                    <p className="nf-settings-help">
                      Page overrides are stored per document. Resetting them never changes the
                      note.
                    </p>
                    {documentSettingsStatus.message === undefined ? null : (
                      <div data-document-settings-message="true">
                        <Details value={documentSettingsStatus.message} />
                      </div>
                    )}
                    {documentSettingsStatus.backupPath === undefined ? null : (
                      <p
                        className="nf-settings-help"
                        data-document-settings-corrupt-backup-path="true"
                      >
                        A copy of the damaged file is kept at{' '}
                        <code>{documentSettingsStatus.backupPath}</code>.
                      </p>
                    )}
                    {documentSettingsBackup === null ? null : (
                      <p
                        className="nf-settings-help"
                        data-document-settings-backup-path="true"
                      >
                        Newest valid backup:{' '}
                        <code>{documentSettingsBackup.path}</code>
                      </p>
                    )}
                    <div className="nf-dialog-inline-actions">
                      {documentRecoveryAvailable ? (
                        <button
                          type="button"
                          className="nf-button"
                          data-document-settings-reset="true"
                          disabled={documentRecoveryBusy}
                          onClick={() => {
                            setDocumentRecoveryError(null);
                            setDocumentRecoveryConfirm('reset');
                          }}
                        >
                          Reset overrides
                        </button>
                      ) : null}
                      {documentSettingsBackup === null ? null : (
                        <button
                          type="button"
                          className="nf-button"
                          data-document-settings-restore="true"
                          disabled={documentRecoveryBusy}
                          onClick={() => {
                            setDocumentRecoveryError(null);
                            setDocumentRecoveryConfirm('restore');
                          }}
                        >
                          Restore backup
                        </button>
                      )}
                    </div>
                    {documentRecoveryConfirm === null ? null : (
                      <div
                        className="nf-settings-warning"
                        role="group"
                        aria-label={
                          documentRecoveryConfirm === 'reset'
                            ? 'Confirm reset overrides'
                            : 'Confirm restore backup'
                        }
                        data-document-settings-confirm-panel={documentRecoveryConfirm}
                      >
                        <p>
                          {documentRecoveryConfirm === 'reset'
                            ? 'This removes every Page override. The note is not changed.'
                            : 'Restore the newest backup? The current file is saved as a backup first.'}
                        </p>
                        <div className="nf-dialog-inline-actions">
                          <button
                            type="button"
                            className="nf-button nf-button-primary"
                            data-document-settings-confirm={documentRecoveryConfirm}
                            disabled={documentRecoveryBusy}
                            onClick={() =>
                              void runDocumentRecovery(documentRecoveryConfirm)
                            }
                          >
                            {documentRecoveryConfirm === 'reset'
                              ? 'Reset overrides'
                              : 'Restore backup'}
                          </button>
                          <button
                            type="button"
                            className="nf-button"
                            data-document-settings-cancel="true"
                            disabled={documentRecoveryBusy}
                            onClick={() => setDocumentRecoveryConfirm(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {documentRecoveryError === null ? null : (
                      <p
                        className="nf-settings-help"
                        role="alert"
                        data-document-settings-recovery-error="true"
                      >
                        {documentRecoveryError}
                      </p>
                    )}
                  </section>
                  <section className="nf-settings-section">
                    <h4 className="nf-settings-section-title">About</h4>
                    <dl className="nf-settings-list">
                      <div>
                        <dt>Version</dt>
                        <dd data-settings-version="true">{appVersion ?? '…'}</dd>
                      </div>
                    </dl>
                  </section>
                </>
              ) : null}
            </section>
            {activePage === 'page' ? (
              <PageSettingsPreview
                runtime={runtime}
                settings={pageSettings.previewSettings}
                invalid={pageSettings.previewInvalid}
                scopeLabel={
                  pageScope === 'document' ? 'This document' : 'Global default'
                }
              />
            ) : null}
            {activePage === 'continuous' ? (
              <ContinuousSettingsPreview settings={continuousSettings.settings} />
            ) : null}
            {activePage === 'appearance' ? <AppearanceSettingsPreview /> : null}
          </div>
          <footer className="nf-settings-foot">
            <span
              className={`nf-settings-status nf-settings-status-${status}`}
              role="status"
              aria-live="polite"
              data-settings-status={status}
            >
              {statusText}
            </span>
            {errorMessage === null ? null : (
              <>
                <span className="nf-settings-error" role="alert" data-settings-save-error="true">
                  {errorMessage}
                </span>
                <button
                  type="button"
                  className="nf-button"
                  data-settings-retry="true"
                  onClick={retrySettings}
                >
                  Retry
                </button>
              </>
            )}
            <span className="nf-settings-foot-spacer" />
            <button
              type="button"
              className="nf-button nf-button-primary"
              data-settings-done="true"
              onClick={requestClose}
            >
              Done
            </button>
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
