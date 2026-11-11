import {
  Dialog,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import { useEffect, useRef, useState } from 'react';
import {
  pageDimensionsMm,
  PAGE_DENSITY_MAX,
  PAGE_DENSITY_MIN,
  PAGE_DENSITY_STEP,
} from '@noteforest/layout';
import { useShell } from '../state/shell';
import {
  flushPendingSettingsEdits,
  useSettingsStore,
} from '../state/settings';
import { useRuntime } from '../state/registry';
import { exportActiveDocument } from '../export/export-flow';
import { SETTINGS_SCHEMA_VERSION } from '../../../shared/settings-file';
import { usePageSettingsController } from '../settings/usePageSettingsController';
import { PageSettingsPreview } from '../settings/PageSettingsPreview';
import {
  AdvancedTypographyFields,
  PageLayoutSection,
} from '../settings/PageAdvancedSettings';
import {
  formatMm,
  hasMarginOverride,
  hasSetupOverride,
  hasThemeOverride,
  MARGIN_KEYS,
  parseMm,
  type MarginKey,
} from '../settings/page-setup';

type SettingsPage =
  | 'general'
  | 'page'
  | 'continuous'
  | 'editor'
  | 'export'
  | 'data';

interface NavItem {
  id: SettingsPage;
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
    items: [{ id: 'general', label: 'General' }],
  },
  {
    label: 'Document',
    items: [
      { id: 'page', label: 'Page' },
      { id: 'continuous', label: 'Continuous' },
    ],
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

const MARGIN_RANGE = {
  min: 0,
  max: 100,
  step: 1,
};

const SHORTCUTS: { group: string; rows: [string, string][] }[] = [
  {
    group: 'Shell',
    rows: [
      ['New note', '⌘N'],
      ['New chapter', '⇧⌘N'],
      ['Save', '⌘S'],
      ['Export PDF…', '⇧⌘E'],
      ['Command palette', '⌘K'],
      ['Settings', '⌘,'],
      ['Toggle sidebar', '⌘\\'],
      ['Continuous / Page', '⌘2 / ⌘3'],
      ['Edit / Read', '⌘E'],
      ['Undo / Redo', '⌘Z / ⇧⌘Z'],
    ],
  },
  {
    group: 'Editor',
    rows: [
      ['Add child', '⌃⏎'],
      ['Add sibling', '⌥⏎'],
      ['Branch from selection', '⌘⇧Enter'],
      ['Delete block', '⌘⌫'],
      ['Collapse branch', '⌘.'],
      ['Focus branch', '⇧⌘F'],
      ['Link', '⌘⇧K'],
      ['Link as reference', '⌘⇧L'],
      ['Focus previous / next block', '⌘↑ / ⌘↓'],
      ['Reorder sibling', '⌥↑ / ⌥↓'],
    ],
  },
  {
    group: 'Page',
    rows: [
      ['Previous / next page', 'PageUp / PageDown'],
      ['Fit page / Fit width', '⇧1 / ⇧2'],
      ['Actual size', '⌘0'],
      ['Commit Page Edit', 'Esc / ⌘⏎'],
    ],
  },
];

function statusLabel(state: 'ok' | 'defaults' | 'corrupt' | 'unreadable' | 'newer'): string {
  switch (state) {
    case 'ok':
      return 'OK';
    case 'defaults':
      return 'Defaults (no file yet)';
    case 'corrupt':
      return 'Corrupt — using defaults';
    case 'unreadable':
      return 'Unreadable — using defaults';
    case 'newer':
      return 'Newer schema (read-only warning)';
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
export function SettingsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const packagePath = useShell((state) => state.activeTab);
  const library = useShell((state) => state.library);
  const { runtime } = useRuntime(packagePath);
  const documentAvailable = packagePath !== null && runtime !== null;
  const documentId = runtime?.document.id ?? null;

  const settingsStatus = useSettingsStore((state) => state.settingsStatus);
  const documentSettingsStatus = useSettingsStore(
    (state) => state.documentSettingsStatus,
  );
  const saveState = useSettingsStore((state) => state.saveState);
  const pageSettings = usePageSettingsController(
    packagePath,
    documentId,
    documentAvailable,
  );

  const [page, setPage] = useState<SettingsPage>('page');
  const [appVersion, setAppVersion] = useState<string | null>(null);

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

  const errorMessage =
    pageSettings.commitError ??
    (saveState.status === 'error' ? saveState.message ?? 'Unknown error.' : null);
  const status =
    errorMessage !== null
      ? 'error'
      : pageSettings.invalid
        ? 'invalid'
        : pageSettings.saving || saveState.status === 'saving'
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
    onCloseRef.current();
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

  const pageContentArea = ((): string => {
    // Content size comes from the same pure geometry the model uses.
    const margins = marginValidation.margins ?? pageSettings.layerSetup.margins;
    const { widthMm, heightMm } = pageDimensionsMm(
      pageSettings.size,
      pageSettings.orientation,
    );
    return `${Math.max(0, widthMm - margins.left - margins.right).toFixed(1)} × ${Math.max(
      0,
      heightMm - margins.top - margins.bottom,
    ).toFixed(1)} mm content`;
  })();

  const globalPage = (
    <>
      <p className="nf-settings-help" data-page-lens-help="true">
        Page Read, Page Edit, the Page preview, and PDF use one resolved Page lens. Setup is a
        personal setting; it never changes the note content.
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
            aria-describedby={documentAvailable ? undefined : 'page-scope-document-reason'}
            title={
              documentAvailable
                ? undefined
                : 'Open a document to override Page settings.'
            }
            onClick={() => pageSettings.setScope('document')}
          >
            This document
          </button>
        </div>
      </div>
      {documentAvailable ? null : (
        <p
          id="page-scope-document-reason"
          className="nf-settings-help"
          data-page-document-reason="true"
        >
          Open a document to override Page settings. Global defaults apply to every document
          without an override.
        </p>
      )}

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
            0–100 mm per side. The content area must keep at least 20 mm on each axis.
            {marginValidation.margins === null ? '' : ` ${pageContentArea}.`}
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
              Switching to {PRESET_LABELS[pageSettings.presetWarning]} replaces the custom
              typography and layout values in this layer. Custom is the option that keeps the
              current values.
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
            ? `Page Read, Page Edit, and PDF use ${pageSettings.densityPercent}% for this document${
                pageSettings.isDensityOverridden ? ' (document override)' : ''
              }.`
            : `Global Page density is ${pageSettings.densityPercent}%. A document with its own density override keeps that value.`}{' '}
          60–70% is the densest range; 80% and above keeps larger type.
        </p>
        <p className="nf-settings-help" data-page-density-topology-note="true">
          Density can move a callout between the right lane and below; the tree order stays fixed.
        </p>
        <AdvancedTypographyFields controller={pageSettings} />
        <p className="nf-settings-help" data-page-advanced-hidden="true">
          Page font, page chrome, manual breaks, and engine values (packing, callout modes, trunk
          insets, lane gate) are not available in Settings.
        </p>
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
              aria-label="Close Settings"
              onClick={requestClose}
            >
              ×
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
              {statusWarning ? (
                <div
                  className="nf-settings-warning"
                  role="alert"
                  data-settings-warning={settingsStatus.state}
                >
                  <p>
                    {settingsStatus.state === 'newer'
                      ? `settings.json was written by a newer NoteForest version (schema ${
                          settingsStatus.version ?? '?'
                        }). Unknown fields are preserved.`
                      : 'settings.json could not be read. NoteForest is using the product defaults.'}
                  </p>
                  {settingsStatus.message === undefined ? null : (
                    <p className="nf-settings-help">{settingsStatus.message}</p>
                  )}
                  {settingsStatus.backupPath === undefined ? null : (
                    <p className="nf-settings-help">
                      A copy of the damaged file is kept at <code>{settingsStatus.backupPath}</code>.
                    </p>
                  )}
                  <div className="nf-dialog-inline-actions">
                    {settingsStatus.state === 'corrupt' ? (
                      <button
                        type="button"
                        className="nf-button"
                        data-settings-reset="true"
                        onClick={() => useSettingsStore.getState().resetSettingsToDefaults()}
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
                </div>
              ) : null}
              {documentStatusWarning ? (
                <div
                  className="nf-settings-warning"
                  role="alert"
                  data-document-settings-warning={documentSettingsStatus.state}
                >
                  <p>
                    Per-document settings could not be read. Open documents use the global
                    defaults.
                  </p>
                  {documentSettingsStatus.message === undefined ? null : (
                    <p className="nf-settings-help">{documentSettingsStatus.message}</p>
                  )}
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
              ) : null}
              {activePage === 'general' ? (
                <>
                  <h3 className="nf-settings-page-title">General</h3>
                  <section className="nf-settings-section">
                    <h4 className="nf-settings-section-title">Saving</h4>
                    <p className="nf-settings-help">
                      Autosave runs after 800 ms. ⌘S flushes immediately and commits an open Page
                      Edit block first.
                    </p>
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
                    <p className="nf-settings-help">A searchable list lives on the Editor page.</p>
                  </section>
                  <section className="nf-settings-section">
                    <h4 className="nf-settings-section-title">About</h4>
                    <p className="nf-settings-help" data-settings-version="true">
                      NoteForest {appVersion ?? '…'}
                    </p>
                  </section>
                </>
              ) : null}

              {activePage === 'page' ? (
                <>
                  <h3 className="nf-settings-page-title">Page</h3>
                  <p className="nf-settings-page-description">
                    The Page lens for this document and the app-wide default.
                  </p>
                  {globalPage}
                </>
              ) : null}

              {activePage === 'continuous' ? (
                <ContinuousSettings />
              ) : null}

              {activePage === 'editor' ? (
                <>
                  <h3 className="nf-settings-page-title">Editor</h3>
                  <section className="nf-settings-section">
                    <h4 className="nf-settings-section-title">Keyboard shortcuts</h4>
                    {SHORTCUTS.map((group) => (
                      <div key={group.group} className="nf-shortcut-group" data-shortcut-group={group.group}>
                        <h5 className="nf-shortcut-group-title">{group.group}</h5>
                        <dl className="nf-shortcut-list">
                          {group.rows.map(([label, shortcut]) => (
                            <div key={`${group.group}-${label}`} className="nf-shortcut-row">
                              <dt>{label}</dt>
                              <dd>
                                <kbd>{shortcut}</kbd>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </section>
                  <section className="nf-settings-section">
                    <h4 className="nf-settings-section-title">Saving</h4>
                    <p className="nf-settings-help">Autosave after 800 ms; ⌘S flushes immediately.</p>
                  </section>
                </>
              ) : null}

              {activePage === 'export' ? (
                <>
                  <h3 className="nf-settings-page-title">Export</h3>
                  <section className="nf-settings-section">
                    <h4 className="nf-settings-section-title">Current behavior</h4>
                    <p className="nf-settings-help">
                      The Export sheet chooses a folder, a file name, and the replacement decision
                      for each export. The PDF is always the Page layout with the resolved page
                      settings.
                    </p>
                    <p className="nf-settings-help">
                      Export defaults (folder, file name pattern, metadata, tagged PDF, page range)
                      do not exist yet and are not shown as placeholder controls.
                    </p>
                    <button
                      type="button"
                      className="nf-button nf-button-primary"
                      data-settings-export-now="true"
                      onClick={() => {
                        // Flush every debounced Page edit first so the export
                        // sheet reads the same resolved Page settings.
                        void flushPendingSettingsEdits().then(() => {
                          onCloseRef.current();
                          exportActiveDocument();
                        });
                      }}
                    >
                      Export PDF…
                    </button>
                  </section>
                </>
              ) : null}

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
                      onClick={() => void window.noteforest.revealLibrary()}
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
                    {settingsStatus.migrated === true ? (
                      <p className="nf-settings-help" data-settings-migrated="true">
                        Settings were upgraded to the current format. Existing values were kept.
                      </p>
                    ) : null}
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
                  onClick={() => pageSettings.retry()}
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

/**
 * Continuous is per-document view state, not a settings namespace. The page
 * therefore edits `DocumentViewState.zoom` directly and has no global default.
 */
function ContinuousSettings(): JSX.Element {
  const packagePath = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(packagePath);
  const zoom = useShell((state) =>
    packagePath === null ? undefined : state.viewByDoc[packagePath]?.zoom,
  );
  const available = runtime !== null && packagePath !== null;
  const percent = Math.round((zoom ?? 1) * 100);

  return (
    <>
      <h3 className="nf-settings-page-title">Continuous</h3>
      <p className="nf-settings-page-description">
        These controls apply to this document. There are no global Continuous settings.
      </p>
      {available ? null : (
        <p className="nf-settings-help" data-continuous-no-document="true">
          Open a document to change Continuous view.
        </p>
      )}
      <section className="nf-settings-section" data-continuous-zoom-section="true">
        <h4 className="nf-settings-section-title">Zoom</h4>
        <div className="nf-settings-row">
          <label className="nf-settings-row-label" htmlFor="continuous-zoom-slider">
            Continuous zoom
          </label>
          <div className="nf-settings-control nf-density-row">
            <input
              id="continuous-zoom-slider"
              type="range"
              className="nf-range"
              min={50}
              max={200}
              step={5}
              value={percent}
              disabled={!available}
              aria-label="Continuous zoom"
              aria-valuetext={`${percent}%`}
              data-continuous-zoom-slider="true"
              onChange={(event) => {
                if (packagePath === null) return;
                useShell.getState().setDocumentZoom(packagePath, Number(event.target.value) / 100);
              }}
            />
            <span className="nf-density-value" data-continuous-zoom-value="true">
              {percent}%
            </span>
            <button
              type="button"
              className="nf-button nf-button-quiet"
              data-continuous-zoom-actual="true"
              disabled={!available}
              onClick={() => {
                if (packagePath !== null) useShell.getState().setDocumentZoom(packagePath, 1);
              }}
            >
              Actual size
            </button>
          </div>
        </div>
        <p className="nf-settings-help">
          View state only: zoom is saved per document in the session, not in settings.json. Fit
          width stays in the View menu, palette, and ⇧⌘0.
        </p>
      </section>
      <section className="nf-settings-section">
        <h4 className="nf-settings-section-title">Read-only documents</h4>
        <p className="nf-settings-help">
          Zoom and page navigation are personal view state and stay available for a read-only
          document. The note content remains read-only.
        </p>
      </section>
    </>
  );
}
