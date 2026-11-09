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
import { PAGE_BODY_PT_FLOOR, PAGE_MIN_CONTENT_WIDTH_FLOOR } from '../src/index.js';

describe('M4e2 Page density lab', () => {
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
    expect(DENSITY_STEPS[0]).toBe(0.6);
    expect(DENSITY_STEPS[DENSITY_STEPS.length - 1]).toBe(1.2);
    expect(rows.length).toBeGreaterThanOrEqual(DENSITY_STEPS.length);
    expect(densityInvariantFailures(rows[0] as DensityLabRow)).toEqual([]);
    for (const row of rows) {
      expect(densityInvariantFailures(row), `${row.label} ${row.densityPercent}%`).toEqual([]);
      expect(row.pages).toBeGreaterThan(0);
      expect(row.whitespaceRatio).toBeGreaterThanOrEqual(0);
      expect(row.whitespaceRatio).toBeLessThanOrEqual(1);
    }
    // The 60% row is the readability floor; 80% keeps the M4d1 8 pt evidence.
    for (const label of new Set(rows.map((row) => row.label))) {
      const fixtureRows = rows.filter((row) => row.label === label);
      const low = fixtureRows.find((row) => row.densityPercent === 60);
      const dense = fixtureRows.find((row) => row.densityPercent === 80);
      expect(low?.bodyPt).toBe(PAGE_BODY_PT_FLOOR);
      expect(low?.maxCardWidth).toBe(252);
      expect(low?.minContentWidth).toBe(PAGE_MIN_CONTENT_WIDTH_FLOOR);
      expect(dense?.bodyPt).toBe(8);
      expect(dense?.maxCardWidth).toBe(336);
    }
  });

  it('keeps effective type and boxes strictly monotone across the slider', () => {
    for (const fixture of densityFixtures()) {
      const document = loadDensityDocument(fixture as DensityFixture);
      if (document === null) continue;
      const rows = DENSITY_STEPS.map(
        (density) => computeDensityMetrics(fixture, document, density).row,
      );
      for (let index = 1; index < rows.length; index += 1) {
        const lower = rows[index - 1]!;
        const higher = rows[index]!;
        expect(lower.bodyPt, `${fixture} ${lower.densityPercent}% body`).toBeLessThan(
          higher.bodyPt,
        );
        expect(lower.heading1Pt).toBeLessThan(higher.heading1Pt);
        expect(lower.cardPadding).toBeLessThan(higher.cardPadding);
        expect(lower.segmentGap).toBeLessThan(higher.segmentGap);
        expect(lower.maxCardWidth).toBeLessThan(higher.maxCardWidth);
      }
      // 60% is the most compact end and never needs more pages than 120%.
      expect(
        rows[0]!.pages,
        `${fixture}: 60% ${rows[0]!.pages} <= 120% ${rows[rows.length - 1]!.pages}`,
      ).toBeLessThanOrEqual(rows[rows.length - 1]!.pages);
    }
  });

  it('keeps the lab deterministic per fixture and step', () => {
    for (const fixture of densityFixtures()) {
      const document = loadDensityDocument(fixture as DensityFixture);
      if (document === null) continue;
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
    const low = computeDensityMetrics('scale-300', document, 0.6);
    const high = computeDensityMetrics('scale-300', document, 1.2);
    expect(low.layout.geometry).toEqual(high.layout.geometry);
    expect(low.settings.setup).toEqual(high.settings.setup);
    expect(low.layout.pageSetup).toEqual(high.layout.pageSetup);
  });
});
