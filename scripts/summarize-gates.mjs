#!/usr/bin/env node
/**
 * Spike-only: produces a compact, reviewable gate summary from the full
 * artifacts gate run. Not part of the M2/M3 gate.
 * Usage: node scripts/summarize-gates.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'artifacts/spike-01/gates.json');
const target = resolve(root, 'docs/spikes/artifacts/spike-01-gates.json');

const full = JSON.parse(await readFile(source, 'utf8'));

function fixtureSummary(fixture) {
  const state = fixture.state;
  return {
    state: state
      ? {
          fixtureFile: state.fixtureFile,
          documentId: state.documentId,
          title: state.title,
          blockCount: state.blockCount,
          pageCount: state.pageCount,
          chapterCount: state.chapterCount,
          metrics: state.metrics,
          defects: (state.defects ?? []).map((defect) => ({
            code: defect.code,
            severity: defect.severity,
            blockId: defect.blockId,
            pageNumber: defect.pageNumber,
            blocksExport: defect.blocksExport,
            message: defect.message,
          })),
        }
      : undefined,
    export: fixture.export,
    pdf: fixture.pdf
      ? Object.fromEntries(Object.entries(fixture.pdf).filter(([key]) => key !== 'text'))
      : undefined,
    stability: fixture.stability,
    referenceProbe: fixture.referenceProbe,
    scroll: fixture.scroll,
    determinism: fixture.determinism,
    tables: fixture.tables,
    geometryHash: fixture.geometryHash,
  };
}

const summary = {
  generatedAt: full.generatedAt,
  versions: full.versions,
  gates: full.gates,
  summary: full.summary,
  memory: full.memory,
  forcedFailure: full.forcedFailure,
  fixtures: Object.fromEntries(
    Object.entries(full.fixtures).map(([file, fixture]) => [file, fixtureSummary(fixture)]),
  ),
};

await mkdir(resolve(root, 'docs/spikes/artifacts'), { recursive: true });
await writeFile(target, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Wrote ${target}`);
