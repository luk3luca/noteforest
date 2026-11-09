import { describe, expect, it } from 'vitest';
import {
  DENSITY_STEPS,
  computeDensityMetrics,
  densityFixtures,
  densityInvariantFailures,
  formatDensityTable,
  loadDensityDocument,
  type DensityFixture,
  type DensityLabRow,
} from './density-lab.js';

describe('M4d1 Page density lab', () => {
  it('records page count, whitespace, and readability at every slider step', () => {
    const rows: DensityLabRow[] = [];
    for (const fixture of densityFixtures()) {
      const document = loadDensityDocument(fixture);
      if (document === null) continue;
      for (const density of DENSITY_STEPS) {
        const { row } = computeDensityMetrics(fixture, document, density);
        rows.push(row);
      }
    }
    console.log(`\n${formatDensityTable(rows)}`);
    expect(rows.length).toBeGreaterThanOrEqual(DENSITY_STEPS.length);
    expect(densityInvariantFailures(rows[0] as DensityLabRow)).toEqual([]);
    for (const row of rows) {
      expect(densityInvariantFailures(row), `${row.label} ${row.densityPercent}%`).toEqual([]);
      expect(row.pages).toBeGreaterThan(0);
      expect(row.whitespaceRatio).toBeGreaterThanOrEqual(0);
      expect(row.whitespaceRatio).toBeLessThanOrEqual(1);
    }
  });

  it('keeps density monotonic in pages and deterministic per fixture', () => {
    for (const fixture of densityFixtures()) {
      const document = loadDensityDocument(fixture as DensityFixture);
      if (document === null) continue;
      const pagesByDensity = DENSITY_STEPS.map(
        (density) => computeDensityMetrics(fixture, document, density).row.pages,
      );
      // 80% never needs more pages than 120%; intermediate steps may tie.
      expect(
        pagesByDensity[0],
        `${fixture}: 80% ${pagesByDensity[0]} <= 120% ${pagesByDensity[pagesByDensity.length - 1]}`,
      ).toBeLessThanOrEqual(pagesByDensity[pagesByDensity.length - 1] as number);
      const first = computeDensityMetrics(fixture, document, 0.9);
      const second = computeDensityMetrics(fixture, document, 0.9);
      expect(second.row).toEqual(first.row);
      expect(second.pages.map((page) => page.pageNumber)).toEqual(
        first.pages.map((page) => page.pageNumber),
      );
    }
  });

  it('keeps Page setup and margins identical across the slider', () => {
    const document = loadDensityDocument('scale-300');
    expect(document).not.toBeNull();
    if (document === null) return;
    const low = computeDensityMetrics('scale-300', document, 0.8);
    const high = computeDensityMetrics('scale-300', document, 1.2);
    expect(low.layout.geometry).toEqual(high.layout.geometry);
    expect(low.settings.setup).toEqual(high.settings.setup);
    expect(low.layout.pageSetup).toEqual(high.layout.pageSetup);
  });
});
