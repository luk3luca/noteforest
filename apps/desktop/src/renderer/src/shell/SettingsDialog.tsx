import {
  Dialog,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  mergePageSettings,
  PAGE_DENSITY_MAX,
  PAGE_DENSITY_MIN,
  PAGE_DENSITY_STEP,
} from '@noteforest/layout';
import { useShell } from '../state/shell';
import {
  flushSettingsWrites,
  pageDensityPercent,
  pageDensityValue,
  pageOverrideFor,
  useSettingsStore,
  withPageDensityOverride,
  withoutPageDensityOverride,
} from '../state/settings';
import { getRuntime, useRuntime } from '../state/registry';
import { exportActiveDocument } from '../export/export-flow';
import { commitPageEdit } from '../page/page-edit-state';
import { SETTINGS_SCHEMA_VERSION } from '../../../shared/settings-file';
import { READ_MODE_TITLE } from '../lib/editability';

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

type LocalPhase = 'idle' | 'saving' | 'commit-error';

interface DensityAttempt {
  percent: number;
  layer: 'global' | 'document';
}

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

  const app = useSettingsStore((state) => state.app);
  const override = useSettingsStore((state) =>
    pageOverrideFor(state, packagePath, documentId),
  );
  const settingsStatus = useSettingsStore((state) => state.settingsStatus);
  const documentSettingsStatus = useSettingsStore(
    (state) => state.documentSettingsStatus,
  );
  const saveState = useSettingsStore((state) => state.saveState);

  const [page, setPage] = useState<SettingsPage>('page');
  const [phase, setPhase] = useState<LocalPhase>('idle');
  const [commitError, setCommitError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  const globalPercent = pageDensityPercent(app.page.theme.density);
  const documentDensity = override?.theme?.density;
  const documentPercent =
    documentDensity === undefined ? null : pageDensityPercent(documentDensity);
  // Start on the layer that exists: a document override opens in document
  // scope; otherwise the global default is the least surprising layer.
  const [scope, setScope] = useState<'global' | 'document'>(
    documentAvailable && documentPercent !== null ? 'document' : 'global',
  );
  const layerPercent = scope === 'document' ? documentPercent ?? globalPercent : globalPercent;
  const [draftPercent, setDraftPercent] = useState(layerPercent);

  const debounceRef = useRef<number | null>(null);
  const pendingRef = useRef<DensityAttempt | null>(null);
  const lastAttemptRef = useRef<DensityAttempt | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

  // Follow the layer's real value when the scope or the stored value changes.
  // A pending debounce is not cancelled here: it owns its own write.
  useEffect(() => {
    setDraftPercent(scope === 'document' ? documentPercent ?? globalPercent : globalPercent);
  }, [scope, documentPercent, globalPercent, packagePath]);

  const applyDensity = async (attempt: DensityAttempt): Promise<void> => {
    const state = useSettingsStore.getState();
    const currentPath = useShell.getState().activeTab;
    const currentRuntime = currentPath === null ? null : getRuntime(currentPath);
    const currentDocumentId = currentRuntime?.document.id ?? null;
    setPhase('saving');
    setCommitError(null);
    lastAttemptRef.current = attempt;

    if (currentPath !== null) {
      const committed = await commitPageEdit(currentPath);
      if (!committed) {
        setPhase('commit-error');
        setCommitError('Page Edit could not be committed. Retry after fixing the block.');
        return;
      }
    }

    let wrote = false;
    if (
      attempt.layer === 'document' &&
      currentPath !== null &&
      currentRuntime !== null
    ) {
      const currentOverride = pageOverrideFor(state, currentPath, currentDocumentId);
      const global = pageDensityPercent(state.app.page.theme.density);
      if (attempt.percent === global) {
        if (currentOverride?.theme?.density !== undefined) {
          state.setPageSettingsOverride(
            currentPath,
            withoutPageDensityOverride(currentOverride) ?? null,
            currentDocumentId,
          );
          wrote = true;
        }
      } else {
        state.setPageSettingsOverride(
          currentPath,
          withPageDensityOverride(currentOverride, pageDensityValue(attempt.percent)),
          currentDocumentId,
        );
        wrote = true;
      }
    } else {
      state.updateAppSettings({
        page: { theme: { density: pageDensityValue(attempt.percent) } },
      });
      wrote = true;
    }

    if (!wrote) {
      setPhase('idle');
      return;
    }
    const result = await flushSettingsWrites();
    if (!result.ok) {
      setPhase('idle');
      return;
    }
    setPhase('idle');
  };

  const queueDensity = (next: number): void => {
    const attempt: DensityAttempt = { percent: next, layer: scope };
    pendingRef.current = attempt;
    setDraftPercent(next);
    setPhase('saving');
    setCommitError(null);
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null) void applyDensity(pending);
    }, 240);
  };

  const flushPending = (): DensityAttempt | null => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    return pending;
  };

  const switchScope = (next: 'global' | 'document'): void => {
    if (next === scope) return;
    const pending = flushPending();
    if (pending !== null) void applyDensity(pending);
    // Switching layers is never a write by itself. Any pending write keeps
    // owning the footer status until it resolves; an existing error stays
    // visible instead of being silently cleared.
    setScope(next);
  };

  const clearDensityOverride = (): void => {
    if (!documentAvailable || packagePath === null) return;
    const pending = flushPending();
    if (pending !== null) {
      // The pending document value is superseded by "Use global".
      setPhase('idle');
    }
    void (async () => {
      setPhase('saving');
      setCommitError(null);
      const committed = await commitPageEdit(packagePath);
      if (!committed) {
        setPhase('commit-error');
        setCommitError('Page Edit could not be committed. Retry after fixing the block.');
        return;
      }
      useSettingsStore
        .getState()
        .setPageSettingsOverride(
          packagePath,
          withoutPageDensityOverride(override) ?? null,
          documentId,
        );
      const result = await flushSettingsWrites();
      if (!result.ok) {
        setPhase('idle');
        return;
      }
      setScope('document');
      setPhase('idle');
    })();
  };

  const retry = (): void => {
    const attempt = lastAttemptRef.current;
    setCommitError(null);
    if (attempt === null) {
      useSettingsStore.getState().retrySettingsWrite();
      setPhase('idle');
      return;
    }
    void applyDensity(attempt);
  };

  const errorMessage =
    commitError ??
    (saveState.status === 'error' ? saveState.message ?? 'Unknown error.' : null);
  const status = errorMessage !== null ? 'error' : phase === 'saving' || saveState.status === 'saving' ? 'saving' : 'saved';
  const statusText =
    status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Couldn’t save —';

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
    const pending = flushPending();
    if (pending !== null) void applyDensity(pending);
    onCloseRef.current();
  };

  const resolved = useMemo(() => mergePageSettings(app.page, override), [app.page, override]);
  const densityRange = {
    min: PAGE_DENSITY_MIN * 100,
    max: PAGE_DENSITY_MAX * 100,
    step: PAGE_DENSITY_STEP * 100,
  };

  const statusWarning =
    settingsStatus.state === 'corrupt' ||
    settingsStatus.state === 'unreadable' ||
    settingsStatus.state === 'newer';
  const documentStatusWarning =
    documentSettingsStatus.state === 'corrupt' ||
    documentSettingsStatus.state === 'unreadable';

  const globalPage = (
    <section className="nf-settings-section" data-page-density-section="true">
      <h3 className="nf-settings-section-title">Page lens</h3>
      <p className="nf-settings-help">
        Page Read, Page Edit, the Page preview, and the PDF use these values. Page size and margins
        are not part of Batch A.
      </p>
      <div className="nf-settings-scope" data-settings-scope="true" role="group" aria-label="Page settings scope">
        <span className="nf-settings-row-label">Apply to</span>
        <div className="nf-segmented" data-page-density-scope="true">
          <button
            type="button"
            className="nf-segmented-item"
            data-page-density-scope-option="global"
            aria-pressed={scope === 'global'}
            onClick={() => switchScope('global')}
          >
            Global default
          </button>
          <button
            type="button"
            className="nf-segmented-item"
            data-page-density-scope-option="document"
            aria-pressed={scope === 'document'}
            disabled={!documentAvailable}
            title={
              documentAvailable
                ? undefined
                : 'Open a document to override Page settings.'
            }
            onClick={() => switchScope('document')}
          >
            This document
          </button>
        </div>
      </div>
      {documentAvailable ? null : (
        <p className="nf-settings-help" data-page-density-document-reason="true">
          Open a document to override Page settings. Global defaults apply to every document
          without an override.
        </p>
      )}
      <div
        className="nf-settings-row"
        data-override={scope === 'document' && documentPercent !== null ? 'true' : 'false'}
      >
        <label className="nf-settings-row-label" htmlFor="page-density-slider">
          Page density
          {scope === 'document' && documentPercent !== null ? (
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
            value={draftPercent}
            aria-label="Page density"
            aria-valuetext={`${draftPercent}%`}
            data-page-density-slider="true"
            onChange={(event) => queueDensity(Number(event.target.value))}
          />
          <span className="nf-density-value" data-page-density-value="true">
            {draftPercent}%
          </span>
          {scope === 'document' ? (
            <button
              type="button"
              className="nf-button nf-button-quiet"
              data-page-density-use-global="true"
              disabled={!documentAvailable || documentPercent === null}
              onClick={clearDensityOverride}
            >
              Use global
            </button>
          ) : (
            <button
              type="button"
              className="nf-button nf-button-quiet"
              data-page-density-reset="true"
              disabled={globalPercent === 100}
              onClick={() => queueDensity(100)}
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <p className="nf-settings-help" data-page-density-note="true">
        {documentAvailable
          ? `Page Read, Page Edit, and PDF use ${pageDensityPercent(resolved.theme.density)}% for this document${
              documentPercent === null ? '' : ' (document override)'
            }.`
          : `Global Page density is ${globalPercent}%. A document override appears here when a document is open.`}{' '}
        60–70% is the densest range; 80% and above keeps larger type.
      </p>
    </section>
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
                        onClose();
                        exportActiveDocument();
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
                  onClick={retry}
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
          document. {READ_MODE_TITLE}.
        </p>
      </section>
    </>
  );
}
