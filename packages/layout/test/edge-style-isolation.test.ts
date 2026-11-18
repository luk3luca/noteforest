import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildPageEdgeModel,
  CONTINUOUS_EDGE_STYLE,
  createEstimatedMeasurement,
  DEFAULT_PAGE_SETTINGS,
  EDGE_STYLE,
  layoutDocument,
  PAGE_EDGE_GEOMETRY,
  PAGE_EDGE_STYLE,
  pageLayoutOptions,
  paginate,
  routePageEdge,
  type ContentBlock,
  type NoteDocument,
  type PageEdgeModel,
} from '../src/index.js';

import { anchorViewFor } from './helpers.js';
/**
 * Commit 0 isolation guard.
 *
 * `CONTINUOUS_EDGE_STYLE`, `PAGE_EDGE_STYLE`, and the shared/base `EDGE_STYLE`
 * are separate objects. This suite proves the split with three independent
 * checks:
 *
 * 1. object ownership: the three objects are distinct and complete;
 * 2. behaviour: mutating the Continuous values leaves Page routing and the
 *    Page edge model byte-identical (a leak would change stems, lanes, or
 *    trunk insets);
 * 3. source ownership: no Page/print module reads the Continuous style, and no
 *    Continuous module reads the Page style.
 */

const ROOT_TEXT =
  'A root with one anchored callout and two direct children in one right group.';
const QUOTE = 'anchored callout';
const BOUNDS = { width: 1000, height: 700 };

function paragraph(text: string) {
  return { type: 'paragraph', children: [{ type: 'text', text }] };
}

function textBlock(id: string, text: string): ContentBlock {
  return { id, label: id, content: { type: 'doc', children: [paragraph(text)] } };
}

function fixtureDocument(): NoteDocument {
  const start = ROOT_TEXT.indexOf(QUOTE);
  return {
    schemaVersion: 2,
    id: 'edge-style-isolation',
    title: 'Edge style isolation',
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
    revision: 0,
    blocks: {
      root: {
        id: 'root',
        label: 'Root',
        content: {
          type: 'doc',
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', text: ROOT_TEXT.slice(0, start) },
                {
                  type: 'text',
                  text: QUOTE,
                  marks: [{ type: 'anchor', attrs: { anchorId: 'anchor-1' } }],
                },
                { type: 'text', text: ROOT_TEXT.slice(start + QUOTE.length) },
              ],
            },
          ],
        },
      },
      child1: textBlock('child1', 'First direct child.'),
      child2: textBlock('child2', 'Second direct child.'),
      callout: textBlock('callout', 'An anchored callout below the root.'),
    },
    anchors: {
      'anchor-1': {
        id: 'anchor-1',
        blockId: 'root',
        kind: 'text',
        selector: { kind: 'text', quote: QUOTE },
        quote: QUOTE,
      },
    },
    branches: {
      'branch-callout': {
        id: 'branch-callout',
        source: { blockId: 'root', anchorId: 'anchor-1' },
        targetBlockId: 'callout',
        role: 'primary',
        order: 'a',
      },
      'branch-child-1': {
        id: 'branch-child-1',
        source: { blockId: 'root' },
        targetBlockId: 'child1',
        role: 'primary',
        order: 'b',
      },
      'branch-child-2': {
        id: 'branch-child-2',
        source: { blockId: 'root' },
        targetBlockId: 'child2',
        role: 'primary',
        order: 'c',
      },
    },
    chapters: [{ id: 'chapter-1', title: 'Chapter 1', topLevelBlockIds: ['root'] }],
    assets: {},
  };
}

function pageModel(): PageEdgeModel {
  const document = fixtureDocument();
  const measurement = createEstimatedMeasurement(document);
  const layout = layoutDocument(
    document,
    measurement,
    pageLayoutOptions(DEFAULT_PAGE_SETTINGS.theme),
    DEFAULT_PAGE_SETTINGS.setup,
      anchorViewFor(document),
  );
  const pages = paginate(layout, document);
  return buildPageEdgeModel(layout, pages.pages);
}

/** Deterministic text form of every route and trunk a Page/PDF renders. */
function serialize(model: PageEdgeModel): string {
  return JSON.stringify({
    edges: model.edges.map((pageEdges) =>
      pageEdges.map((edge) => ({
        branchId: edge.branchId,
        role: edge.role,
        direction: edge.direction,
        targetPage: edge.targetPage,
        route: edge.route,
        trunkId: edge.trunk?.id ?? null,
        trunkX: edge.trunk?.x ?? null,
        segment: edge.trunkSegment,
      })),
    ),
    trunks: model.trunks.map((views) =>
      views.map(({ trunk, segment }) => ({
        id: trunk.id,
        x: trunk.x,
        port: trunk.port,
        segments: trunk.segments,
        page: segment.pageNumber,
      })),
    ),
  });
}

describe('edge style ownership', () => {
  it('keeps one shared base and two complete surface styles', () => {
    expect(PAGE_EDGE_STYLE).not.toBe(CONTINUOUS_EDGE_STYLE);
    expect(PAGE_EDGE_STYLE).not.toBe(EDGE_STYLE);
    expect(CONTINUOUS_EDGE_STYLE).not.toBe(EDGE_STYLE);
    expect(Object.isFrozen(PAGE_EDGE_STYLE)).toBe(true);
    expect(Object.isFrozen(EDGE_STYLE)).toBe(true);

    const sharedKeys = Object.keys(CONTINUOUS_EDGE_STYLE).sort();
    expect(Object.keys(PAGE_EDGE_STYLE).sort()).toEqual(
      [...sharedKeys, 'pageClearance', 'pageLaneStep', 'pageTurnPenalty'].sort(),
    );
    expect(Object.keys(EDGE_STYLE).sort()).toEqual(Object.keys(PAGE_EDGE_STYLE).sort());

    // The current values are the frozen M2/M3 edge contract on both surfaces,
    // except the stem: the Page corridor owns a 14 px stem and Continuous keeps
    // its 12 px canvas stem.
    for (const key of sharedKeys) {
      if (key === 'stemMin') continue;
      expect(
        PAGE_EDGE_STYLE[key as keyof typeof PAGE_EDGE_STYLE],
        `PAGE_EDGE_STYLE.${key}`,
      ).toBe(CONTINUOUS_EDGE_STYLE[key as keyof typeof CONTINUOUS_EDGE_STYLE]);
    }
    expect(PAGE_EDGE_STYLE.gap).toBe(2);
    expect(PAGE_EDGE_STYLE.radius).toBe(2);
    expect(PAGE_EDGE_STYLE.stemMin).toBe(PAGE_EDGE_GEOMETRY.stem);
    expect(CONTINUOUS_EDGE_STYLE.stemMin).toBe(12);
    expect(PAGE_EDGE_STYLE.trunkInset).toBe(12);
    expect(PAGE_EDGE_STYLE.trunkGap).toBe(0);
    expect(PAGE_EDGE_STYLE.arrowLength).toBe(6);
    expect(PAGE_EDGE_STYLE.arrowHalfWidth).toBe(3);
    expect(PAGE_EDGE_STYLE.edgeWidth).toBe(1.25);
    expect(PAGE_EDGE_STYLE.edgeWidthActive).toBe(1.75);
    expect(PAGE_EDGE_STYLE.edgeWidthMuted).toBe(1);
    expect(PAGE_EDGE_STYLE.pageClearance).toBe(3);
    expect(PAGE_EDGE_STYLE.pageLaneStep).toBe(4);
    expect(PAGE_EDGE_STYLE.pageTurnPenalty).toBe(60);
  });

  it('does not change Page routing when the Continuous values change', () => {
    const routeInput = {
      from: { x: 140, y: 40 },
      to: { x: 300, y: 50 },
      sourceRect: { x: 0, y: 0, width: 140, height: 80 },
      targetRect: { x: 300, y: 0, width: 150, height: 100 },
      obstacles: [],
      bounds: BOUNDS,
    };
    const baselineRoute = routePageEdge(routeInput);
    const baselineModel = serialize(pageModel());
    // A route in the fixture really uses the Page stem: reading the poisoned
    // values below would move the lane or shorten the stem.
    expect(baselineRoute.stem).toBe(PAGE_EDGE_STYLE.stemMin);

    const original = { ...CONTINUOUS_EDGE_STYLE };
    try {
      Object.assign(CONTINUOUS_EDGE_STYLE, {
        gap: 11,
        radius: 9,
        stemMin: 40,
        laneMin: 21,
        laneMax: 64,
        trunkInset: 33,
        trunkGap: 7,
        arrowLength: 18,
        arrowHalfWidth: 9,
        edgeWidth: 5,
        edgeWidthActive: 6,
        edgeWidthMuted: 4,
        minGap: 12,
        referenceArrowLength: 19,
        referenceArrowSpread: 0.9,
      });
      expect(CONTINUOUS_EDGE_STYLE.stemMin).toBe(40);
      expect(routePageEdge(routeInput)).toEqual(baselineRoute);
      expect(serialize(pageModel())).toBe(baselineModel);
    } finally {
      Object.assign(CONTINUOUS_EDGE_STYLE, original);
    }
    // The surfaces no longer share a stem: Continuous stays 12 px, Page uses
    // the 14 px corridor stem, and poisoning one never reaches the other.
    expect(CONTINUOUS_EDGE_STYLE.stemMin).toBe(12);
    expect(PAGE_EDGE_STYLE.stemMin).toBe(14);
  });

  it('keeps Page and Continuous modules on their own style objects', () => {
    const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
    // Page modules that produce geometry read the Page style directly.
    const pageGeometryModules: Array<[string, string]> = [
      ['layout.ts', '../src/layout.ts'],
      ['page-routing.ts', '../src/page-routing.ts'],
      ['page-edges.ts', '../src/page-edges.ts'],
      ['page-settings.ts', '../src/page-settings.ts'],
      ['PageEdges.tsx', '../../../apps/desktop/src/renderer/src/page/PageEdges.tsx'],
    ];
    // The Page advanced UI no longer owns geometry, so it reads no edge style.
    const noEdgeStyleModules: Array<[string, string]> = [
      ['page-advanced.ts', '../../../apps/desktop/src/renderer/src/settings/page-advanced.ts'],
    ];
    // Print delegates its paths to PageEdges, so it must not carry a style at all.
    const printModules: Array<[string, string]> = [
      ['PrintDocument.tsx', '../../../apps/desktop/src/renderer/src/print/PrintDocument.tsx'],
      ['printModel.ts', '../../pdf/src/printModel.ts'],
    ];
    for (const [name, path] of [...pageGeometryModules, ...printModules, ...noEdgeStyleModules]) {
      const source = read(path);
      expect(source, `${name} must not read the Continuous style`).not.toContain(
        'CONTINUOUS_EDGE_STYLE',
      );
      expect(source, `${name} must not read the shared base`).not.toMatch(
        /\bEDGE_STYLE\b(?!\.)/,
      );
      expect(source, `${name} must not resolve Continuous settings`).not.toMatch(
        /\bcontinuous(CssVariables|EdgeStyle)\b/,
      );
    }
    for (const [name, path] of pageGeometryModules) {
      expect(read(path), `${name} must read PAGE_EDGE_STYLE`).toContain('PAGE_EDGE_STYLE');
    }
    expect(read('../../../apps/desktop/src/renderer/src/print/PrintDocument.tsx')).toContain(
      '<PageEdges',
    );
    const continuousModules: Array<[string, string]> = [
      ['design-tokens.ts', '../../../apps/desktop/src/renderer/src/lib/design-tokens.ts'],
      ['edge-routing.ts', '../../../apps/desktop/src/renderer/src/lib/edge-routing.ts'],
      ['reference-routing.ts', '../../../apps/desktop/src/renderer/src/lib/reference-routing.ts'],
      ['continuous-settings.ts', '../src/continuous-settings.ts'],
    ];
    for (const [name, path] of continuousModules) {
      const source = read(path);
      expect(source, `${name} must read CONTINUOUS_EDGE_STYLE`).toContain(
        'CONTINUOUS_EDGE_STYLE',
      );
      expect(source, `${name} must not read the Page style`).not.toContain('PAGE_EDGE_STYLE');
    }
  });
});
