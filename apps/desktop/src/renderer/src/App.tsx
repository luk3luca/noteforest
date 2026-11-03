import { useCallback, useEffect, useState } from 'react';
import type { ExportResult, FixtureSummary, LoadedFixture } from '../../shared/api';
import { PrintPages } from './views/PrintPages';
import { ReaderView } from './views/ReaderView';
import {
  prepareAssets,
  prepareFonts,
  runLayoutPipeline,
  type LayoutRun,
} from './state/layoutPipeline';
import {
  pageViewGeometryFromDom,
  runReferenceProbe,
  runStabilityProbe,
  stateFromRun,
  type ViewMode,
} from './testApi';

interface ExportState {
  status: 'exporting' | 'success' | 'error';
  message: string;
  path?: string;
  durationMs?: number;
}

function queryView(): ViewMode {
  return new URLSearchParams(window.location.search).get('view') === 'page' ? 'page' : 'reader';
}

function fixtureFileName(summaries: FixtureSummary[]): string | null {
  const requested = new URLSearchParams(window.location.search).get('fixture');
  if (requested) {
    const byFile = summaries.find((summary) => summary.file === requested);
    if (byFile) return byFile.file;
    const byId = summaries.find((summary) => summary.id === requested);
    if (byId) return byId.file;
  }
  return summaries.find((summary) => summary.file === 'golden-eigenvalues.json')?.file ?? summaries[0]?.file ?? null;
}

export function App() {
  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [fixture, setFixture] = useState<LoadedFixture | null>(null);
  const [run, setRun] = useState<LayoutRun | null>(null);
  const [view, setView] = useState<ViewMode>(queryView);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportState, setExportState] = useState<ExportState | null>(null);

  const loadFile = useCallback(async (file: string): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    setExportState(null);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await prepareFonts();
      const loaded = await window.noteforest.loadFixture(file);
      await prepareAssets(loaded.assets);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const pipeline = runLayoutPipeline(file, loaded.document, loaded.assets);
      setFixture(loaded);
      setRun(pipeline);
      setLoading(false);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const summaries = await window.noteforest.listFixtures();
        if (cancelled) return;
        setFixtures(summaries);
        const file = fixtureFileName(summaries);
        if (!file) throw new Error('No fixture JSON files were found.');
        await loadFile(file);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFile]);

  const exportPdf = useCallback(async (): Promise<ExportResult> => {
    if (!fixture || !run) return { ok: false, error: 'No fixture is loaded.' };
    const blocking = run.pages.defects.filter((defect) => defect.blocksExport);
    if (blocking.length > 0) {
      const message = `Export blocked by ${blocking.length} blocking defect(s): ${blocking
        .map((defect) => defect.message)
        .join(' ')}`;
      setExportState({ status: 'error', message });
      return { ok: false, error: message, expectedPageCount: run.pages.pageCount };
    }
    setExportState({ status: 'exporting', message: 'Rendering fixed A4 pages and printing…' });
    const result = await window.noteforest.exportPdf({
      document: fixture.document,
      layout: run.layout,
      pages: run.pages,
      pageSetup: fixture.document.pageSetup,
      assets: fixture.assets,
      outputName: `spike-01-${fixture.file.replace(/\.json$/, '')}.pdf`,
    });
    if (result.ok) {
      setExportState({
        status: 'success',
        message: `Exported ${result.pdfPageCount ?? run.pages.pageCount} pages in ${result.durationMs ?? 0} ms.`,
        path: result.path,
        durationMs: result.durationMs,
      });
    } else {
      setExportState({ status: 'error', message: result.error ?? 'Unknown export failure.' });
    }
    return result;
  }, [fixture, run]);

  useEffect(() => {
    if (!fixture || !run) return;
    window.__noteforest = {
      ready: true,
      getState: () =>
        stateFromRun(fixture.file, view, fixture.document, run.layout, run.pages, run.metrics),
      setView: async (next) => {
        setView(next);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      },
      loadFixture: loadFile,
      exportPdf,
      stabilityProbe: async () =>
        runStabilityProbe(fixture.file, fixture.document, fixture.assets),
      referenceProbe: async () =>
        runReferenceProbe(fixture.file, fixture.document, fixture.assets),
      getPageViewGeometry: () => pageViewGeometryFromDom(),
    };
    return () => {
      delete window.__noteforest;
    };
  }, [fixture, run, view, loadFile, exportPdf]);

  if (loadError && !run) {
    return (
      <div className="error-screen">
        <div>
          <h1>NoteForest Spike 1</h1>
          <p>The fixture could not be loaded.</p>
          <pre>{loadError}</pre>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }

  if (!fixture || !run) {
    return (
      <div className="loading-screen">
        <div style={{ display: 'grid', gap: 16, justifyItems: 'center' }}>
          <div className="spinner" aria-hidden="true" />
          <div>Loading fixture and measuring blocks…</div>
        </div>
      </div>
    );
  }

  const defects = run.pages.defects;
  const blocking = defects.filter((defect) => defect.blocksExport);
  const exporting = exportState?.status === 'exporting';

  return (
    <div className="app-shell">
      <header className="toolbar">
        <div className="brand">
          <strong>NoteForest</strong>
          <span>Spike 1 · adaptive layout + paginator + PDF</span>
        </div>
        <select
          aria-label="Fixture"
          value={fixture.file}
          disabled={loading || exporting}
          onChange={(event) => {
            void loadFile(event.target.value);
          }}
        >
          {fixtures.map((summary) => (
            <option key={summary.file} value={summary.file}>
              {summary.file.replace(/\.json$/, '')} · {summary.blockCount} blocks
            </option>
          ))}
        </select>
        <div className="segmented" role="tablist" aria-label="View">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'reader'}
            className={view === 'reader' ? 'active' : ''}
            onClick={() => setView('reader')}
          >
            Reader
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'page'}
            className={view === 'page' ? 'active' : ''}
            onClick={() => setView('page')}
          >
            Page view
          </button>
        </div>
        <div className="toolbar-spacer" />
        <div className="status">
          <span>
            <strong>{run.metrics.blockCount}</strong> blocks
          </span>
          <span>
            <strong>{run.metrics.pageCount}</strong> pages
          </span>
          <span>
            layout <strong>{run.metrics.warmMedianMs.toFixed(1)}</strong> ms warm
          </span>
          <span>
            paginate <strong>{run.metrics.paginateMs.toFixed(1)}</strong> ms
          </span>
          <span className={blocking.length > 0 ? 'bad' : ''}>
            <strong>{defects.length}</strong> defects
          </span>
        </div>
        <button
          type="button"
          className="export-button"
          disabled={exporting || loading || blocking.length > 0}
          onClick={() => {
            void exportPdf();
          }}
          title={blocking.length > 0 ? 'Blocking defects must be resolved first' : 'Export a real-text Page PDF'}
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </header>

      {loading ? <div className="banner">Loading fixture and re-measuring blocks…</div> : null}
      {loadError ? <div className="banner error">{loadError}</div> : null}
      {exportState ? (
        <div
          className={
            exportState.status === 'error'
              ? 'banner error'
              : exportState.status === 'success'
                ? 'banner success'
                : 'banner'
          }
        >
          {exportState.message}
          {exportState.path ? <span title={exportState.path}> · {exportState.path}</span> : null}
        </div>
      ) : null}
      {defects.length > 0 ? (
        <div className="defect-list">
          {defects.slice(0, 12).map((defect, index) => (
            <span
              key={`${defect.code}-${defect.blockId ?? index}`}
              className={defect.blocksExport ? 'defect blocking' : 'defect'}
              title={defect.message}
            >
              {defect.code}
              {defect.blockId ? ` · ${defect.blockId}` : ''}
            </span>
          ))}
          {defects.length > 12 ? <span className="defect">+{defects.length - 12} more</span> : null}
        </div>
      ) : null}

      {view === 'reader' ? (
        <ReaderView
          layout={run.layout}
          document={fixture.document}
          pages={run.pages.pages}
          segmentsByBlock={run.segmentsByBlock}
        />
      ) : (
        <div className="page-scroll">
          <PrintPages
            model={run.printModel}
            document={fixture.document}
            layout={run.layout}
            segmentsByBlock={run.segmentsByBlock}
            mode="screen"
          />
        </div>
      )}
    </div>
  );
}
