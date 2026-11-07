import { describe, expect, it } from 'vitest';
import { paginate, pageHasBlockingDefect } from '../src/index.js';
import { assertSegmentsAtomic } from './helpers.js';
import {
  LAB_FIXTURES,
  LAB_POLICIES,
  blockSignature,
  computeLabMetrics,
  formatBranchTree,
  formatMetricsTable,
  layoutInvariantFailures,
  loadLabDocument,
  type LabMetrics,
} from './layout-lab.js';

function allLabFixtures(): string[] {
  const fixtures: string[] = [...LAB_FIXTURES];
  if (loadLabDocument('showcase')) fixtures.push('showcase');
  return fixtures;
}

function policyRows(): LabMetrics[] {
  const rows: LabMetrics[] = [];
  for (const fixture of allLabFixtures()) {
    const document = loadLabDocument(fixture as (typeof LAB_FIXTURES)[number]);
    if (!document) continue;
    const oracle = computeLabMetrics(fixture, document, 'right-first-per-child').metrics;
    for (const policy of LAB_POLICIES) {
      const { metrics } = computeLabMetrics(fixture, document, policy);
      metrics.pageDelta = metrics.pages - oracle.pages;
      rows.push(metrics);
    }
  }
  return rows;
}

describe('group-wrap layout lab', () => {
  it('compares the three policies on scale-300, deep-chain, wide-fan, and the showcase', () => {
    const rows = policyRows();
    console.log(`\n${formatMetricsTable(rows)}`);
    expect(rows.length).toBeGreaterThanOrEqual(LAB_FIXTURES.length * LAB_POLICIES.length);

    for (const fixture of LAB_FIXTURES) {
      const document = loadLabDocument(fixture);
      if (!document) continue;
      for (const policy of LAB_POLICIES) {
        const first = computeLabMetrics(fixture, document, policy);
        const second = computeLabMetrics(fixture, document, policy);
        expect(blockSignature(second.layout), `${fixture}/${policy} deterministic`).toEqual(
          blockSignature(first.layout),
        );
        expect(layoutInvariantFailures(first.layout), `${fixture}/${policy} invariants`).toEqual([]);
      }
    }
  });

  it('keeps scale-300 paginating with zero blocking defects and atomic segments', () => {
    const document = loadLabDocument('scale-300.json');
    expect(document).not.toBeNull();
    if (!document) return;
    for (const policy of LAB_POLICIES) {
      const { layout, metrics } = computeLabMetrics('scale-300.json', document, policy);
      const pages = paginate(layout, document);
      expect(metrics.blocks).toBe(300);
      expect(layout.defects, `${policy} layout defects`).toEqual([]);
      expect(pages.pageCount).toBeGreaterThan(0);
      expect(pageHasBlockingDefect(pages), `${policy} blocking defects`).toBe(false);
      expect(assertSegmentsAtomic(pages, layout), `${policy} segments`).toEqual([]);
    }
  });

  it('validates the 2/3/4-step maxWrapIndent cap', () => {
    const rows: LabMetrics[] = [];
    for (const fixture of allLabFixtures()) {
      const document = loadLabDocument(fixture as (typeof LAB_FIXTURES)[number]);
      if (!document) continue;
      for (const maxWrapIndent of [36, 54, 72]) {
        const { metrics } = computeLabMetrics(fixture, document, {
          policy: 'group-left-origin',
          wrapIndent: 18,
          maxWrapIndent,
        });
        metrics.label = `${fixture} cap=${maxWrapIndent}`;
        rows.push(metrics);
      }
    }
    console.log(`\n${formatMetricsTable(rows)}`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('records wrapIndent sensitivity at a three-step cap', () => {
    const rows: LabMetrics[] = [];
    for (const fixture of allLabFixtures()) {
      const document = loadLabDocument(fixture as (typeof LAB_FIXTURES)[number]);
      if (!document) continue;
      for (const wrapIndent of [12, 18, 24]) {
        const { metrics } = computeLabMetrics(fixture, document, {
          policy: 'group-left-origin',
          wrapIndent,
          maxWrapIndent: 3 * wrapIndent,
        });
        metrics.label = `${fixture} indent=${wrapIndent}`;
        rows.push(metrics);
      }
    }
    console.log(`\n${formatMetricsTable(rows)}`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('shows a deep branch and a wide fan for each policy', () => {
    for (const fixture of ['deep-chain.json', 'wide-fan.json'] as const) {
      const document = loadLabDocument(fixture);
      if (!document) continue;
      for (const policy of LAB_POLICIES) {
        const { layout } = computeLabMetrics(fixture, document, policy);
        const tree = formatBranchTree(
          layout,
          fixture === 'deep-chain.json' ? 'f4-b1' : 'f3-parent',
        );
        console.log(`\n${fixture} / ${policy}`);
        console.log(tree.join('\n'));
        expect(tree.length, `${fixture}/${policy} branch tree`).toBeGreaterThan(0);
      }
    }
  });
});
