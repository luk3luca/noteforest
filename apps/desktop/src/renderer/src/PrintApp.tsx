import { useEffect, useMemo, useState } from 'react';
import { buildPrintModel } from '@noteforest/pdf';
import type { PrintPayload } from '../../shared/api';
import { buildSegments, type RenderSegment } from './content/segments';
import { PrintPages } from './views/PrintPages';

export function PrintApp() {
  const [payload, setPayload] = useState<PrintPayload | null>(null);

  useEffect(() => {
    const off = window.noteforest.onPrintPayload((next) => setPayload(next));
    void window.noteforest.printHello();
    return off;
  }, []);

  useEffect(() => {
    if (!payload) return;
    document.body.classList.add('print-mode');
    return () => {
      document.body.classList.remove('print-mode');
    };
  }, [payload]);

  const model = useMemo(() => {
    if (!payload) return null;
    return buildPrintModel(payload.document, payload.layout, payload.pages);
  }, [payload]);

  const segmentsByBlock = useMemo(() => {
    if (!payload) return {};
    const result: Record<string, RenderSegment[]> = {};
    for (const [blockId, block] of Object.entries(payload.document.blocks)) {
      const placed = payload.layout.blockById[blockId];
      if (!placed) continue;
      result[blockId] = buildSegments(block, {
        document: payload.document,
        assets: payload.assets,
        tableColumns: placed.measurement.tableColumns,
      });
    }
    return result;
  }, [payload]);

  useEffect(() => {
    if (!payload || !model) return;
    let cancelled = false;
    void (async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((image) => image.decode().catch(() => undefined)),
      );
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!cancelled) await window.noteforest.printReady(payload.exportId);
    })();
    return () => {
      cancelled = true;
    };
  }, [payload, model]);

  if (!payload || !model) {
    return <div className="loading-screen">Preparing print compositor…</div>;
  }

  return (
    <>
      <style>{`@page { size: ${(model.geometry.pageWidthMm * 72) / 25.4}pt ${(model.geometry.pageHeightMm * 72) / 25.4}pt; margin: 0; }`}</style>
      <PrintPages
        model={model}
        document={payload.document}
        layout={payload.layout}
        segmentsByBlock={segmentsByBlock}
        mode="print"
      />
    </>
  );
}
