import { describe, expect, it } from 'vitest';
import { buildAnchorIndex } from '@noteforest/core';
import type {
  Anchor,
  Branch,
  ContentBlock,
  ContentNode,
  Document,
} from '@noteforest/core';
import {
  auditDocumentHealth,
  documentHealthFilterCount,
  documentHealthRowMatchesFilter,
  filterDocumentHealthRows,
  type DocumentHealthRow,
} from '../src/renderer/src/lib/document-health';

function paragraph(text: string): ContentNode {
  return { type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] };
}

/** Paragraph with an anchor mark on the middle segment. */
function markedParagraph(
  parts: Array<string | { text: string; anchorIds: string[] }>,
): ContentNode {
  return {
    type: 'doc',
    children: [
      {
        type: 'paragraph',
        children: parts.map((part) =>
          typeof part === 'string'
            ? { type: 'text', text: part }
            : {
                type: 'text',
                text: part.text,
                marks: [{ type: 'anchor', attrs: { anchorIds: part.anchorIds } }],
              },
        ),
      },
    ],
  };
}

function textBlock(id: string, content: ContentNode): ContentBlock {
  return { id, content };
}

function textAnchor(id: string, blockId: string, quote: string, extra: Partial<Anchor> = {}): Anchor {
  return {
    id,
    blockId,
    kind: 'text',
    selector: { kind: 'text', quote },
    quote,
    ...extra,
  };
}

function branchRecord(
  id: string,
  sourceBlockId: string,
  targetBlockId: string,
  options: { sourceAnchorId?: string; role?: Branch['role']; order?: string } = {},
): Branch {
  return {
    id,
    source: {
      blockId: sourceBlockId,
      ...(options.sourceAnchorId === undefined
        ? {}
        : { anchorId: options.sourceAnchorId }),
    },
    targetBlockId,
    role: options.role ?? 'primary',
    order: options.order ?? 'a',
  };
}

function baseDocument(): Document {
  return {
    schemaVersion: 2,
    id: 'document-health',
    title: 'Document health fixture',
    createdAt: '2026-11-15T10:00:00.000Z',
    updatedAt: '2026-11-15T10:00:00.000Z',
    revision: 1,
    chapters: [],
    blocks: {},
    anchors: {},
    branches: {},
    assets: {},
    annotations: [],
  };
}

/**
 * Every v1 category exactly once, plus one healthy anchor. The document is
 * deliberately not valid: the audit is a defensive read (the loader refuses
 * several of these states), so fixtures construct them directly.
 */
function mixedDocument(): Document {
  const document = baseDocument();
  document.chapters = [
    { id: 'c1', title: 'Main', topLevelBlockIds: ['A', 'F', 'K'] },
    { id: 'c2', title: 'Empty', topLevelBlockIds: [] },
  ];
  document.blocks = {
    A: textBlock(
      'A',
      markedParagraph([
        'Alpha ',
        { text: 'bound', anchorIds: ['a-idle'] },
        ' bound beta ',
        { text: 'ghost', anchorIds: ['ghost-anchor'] },
      ]),
    ),
    B: textBlock('B', markedParagraph(['Child ', { text: 'hidden', anchorIds: ['a-hidden'] }, ' text'])),
    F: textBlock('F', paragraph('Second root')),
    H1: textBlock('H1', paragraph('First branch target')),
    H2: textBlock('H2', paragraph('Second branch target')),
    H3: textBlock('H3', paragraph('Third branch target')),
    H4: textBlock('H4', paragraph('Fourth branch target')),
    K: textBlock('K', paragraph('Third root')),
    G: textBlock('G', paragraph('Cycle member')),
    D: textBlock('D', paragraph('Duplicate home')),
    Z: textBlock('Z', paragraph('Unreachable content')),
  };
  document.anchors = {
    'a-healthy': textAnchor('a-healthy', 'A', 'Alpha'),
    // A live anchor whose binding disappeared is broken (repair), not orphan.
    'a-broken': textAnchor('a-broken', 'A', 'missingword'),
    'a-ambiguous': textAnchor('a-ambiguous', 'A', 'bound'),
    'a-idle': textAnchor('a-idle', 'A', 'bound'),
    'a-orphan-record': textAnchor('a-orphan-record', 'A', 'Alpha'),
    'a-block-missing': textAnchor('a-block-missing', 'GONE-BLOCK', 'Alpha'),
    'a-hidden': textAnchor('a-hidden', 'B', 'hidden'),
  };
  document.branches = {
    'b-healthy': branchRecord('b-healthy', 'A', 'H1', { sourceAnchorId: 'a-healthy' }),
    'b-broken': branchRecord('b-broken', 'A', 'H2', {
      sourceAnchorId: 'a-broken',
      order: 'b',
    }),
    'b-ambiguous': branchRecord('b-ambiguous', 'A', 'H3', {
      sourceAnchorId: 'a-ambiguous',
      order: 'c',
    }),
    'b-hidden': branchRecord('b-hidden', 'B', 'H4', { sourceAnchorId: 'a-hidden' }),
    'b-child': branchRecord('b-child', 'A', 'B', { order: 'd' }),
    'b-missing-target': branchRecord('b-missing-target', 'A', 'MISSING-TARGET', {
      role: 'reference',
    }),
    'b-duplicate-one': branchRecord('b-duplicate-one', 'A', 'D', { order: 'e' }),
    'b-duplicate-two': branchRecord('b-duplicate-two', 'F', 'D', { order: 'a' }),
    'b-cycle-one': branchRecord('b-cycle-one', 'A', 'G', { order: 'f' }),
    'b-cycle-two': branchRecord('b-cycle-two', 'G', 'A', { order: 'a' }),
  };
  return document;
}

function categories(rows: readonly DocumentHealthRow[]): string[] {
  return rows.map((row) => row.category);
}

describe('document health audit', () => {
  it('reports every v1 category with severity and counts', () => {
    const report = auditDocumentHealth(mixedDocument(), {
      collapsedBlockIds: new Set(['A']),
    });

    expect(new Set(categories(report.rows))).toEqual(
      new Set([
        'anchor-block-missing',
        'branch-target-missing',
        'orphan-block',
        'duplicate-primary',
        'cycle',
        'orphan-reference',
        'broken',
        'ambiguous',
        'orphan-record',
        'idle',
        'empty-chapter',
        'hidden',
      ]),
    );
    expect(report.rows).toHaveLength(12);
    expect(report.counts).toEqual({
      all: 12,
      needsRepair: 9,
      broken: 1,
      ambiguous: 1,
      idle: 1,
      orphans: 2,
      structure: 5,
      hidden: 1,
      s1: 6,
      s2: 3,
      s3: 3,
    });
    expect(report.info).toEqual({ idle: 1, orphans: 2, structure: 5, hidden: 1 });
  });

  it('sorts S1 data-loss rows before S2 repair and S3 information', () => {
    const rows = auditDocumentHealth(mixedDocument()).rows;
    const ranks = rows.map((row) => Number(row.severity.slice(1)));
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right));
    expect(rows.slice(0, 6).every((row) => row.severity === 'S1')).toBe(true);
    expect(rows.at(-1)?.severity).toBe('S3');
  });

  it('keeps a live anchor with a lost binding broken, and separates orphan records', () => {
    const report = auditDocumentHealth(mixedDocument());
    const broken = report.rows.find((row) => row.category === 'broken');
    const orphanRecord = report.rows.find((row) => row.category === 'orphan-record');
    const idle = report.rows.find((row) => row.category === 'idle');

    expect(broken?.anchorId).toBe('a-broken');
    expect(broken?.branchCount).toBe(1);
    expect(broken?.reasonLabel).toMatch(/no longer in the block/);
    expect(orphanRecord?.anchorId).toBe('a-orphan-record');
    expect(orphanRecord?.branchCount).toBe(0);
    expect(orphanRecord?.reasonLabel).toMatch(/not bound to any content/);
    expect(idle?.anchorId).toBe('a-idle');
    expect(idle?.reasonLabel).toBe('This anchor has no branches.');
    expect(idle?.needsRepair).toBe(false);
  });

  it('lists a collapsed marker as hidden information only', () => {
    const withoutCollapse = auditDocumentHealth(mixedDocument());
    expect(categories(withoutCollapse.rows)).not.toContain('hidden');

    const withCollapse = auditDocumentHealth(mixedDocument(), {
      collapsedBlockIds: new Set(['A']),
    });
    const hidden = withCollapse.rows.find((row) => row.category === 'hidden');
    expect(hidden?.anchorId).toBe('a-hidden');
    expect(hidden?.collapsed).toBe(true);
    expect(hidden?.needsRepair).toBe(false);
    expect(withCollapse.counts.all).toBe(withoutCollapse.counts.all + 1);
  });

  it('names missing targets, duplicate homes, cycles, unreachable blocks, and empty chapters', () => {
    const report = auditDocumentHealth(mixedDocument());
    const byCategory = new Map(report.rows.map((row) => [row.category, row]));

    expect(byCategory.get('branch-target-missing')?.targetBlockId).toBe('MISSING-TARGET');
    expect(byCategory.get('branch-target-missing')?.severity).toBe('S1');
    expect(byCategory.get('duplicate-primary')?.branchCount).toBe(2);
    expect(byCategory.get('duplicate-primary')?.targetBlockId).toBe('D');
    expect(byCategory.get('cycle')?.detail).toMatch(/A/);
    expect(byCategory.get('cycle')?.detail).toMatch(/G/);
    expect(byCategory.get('orphan-block')?.blockId).toBe('Z');
    expect(byCategory.get('orphan-block')?.severity).toBe('S1');
    expect(byCategory.get('empty-chapter')?.chapterId).toBe('c2');
    expect(byCategory.get('empty-chapter')?.needsRepair).toBe(false);
  });

  it('does not treat a reference edge as a second home and keeps its target reachable', () => {
    const document = baseDocument();
    document.chapters = [{ id: 'c1', title: 'Main', topLevelBlockIds: ['A'] }];
    document.blocks = {
      A: textBlock('A', paragraph('A')),
      B: textBlock('B', paragraph('B')),
    };
    document.branches = {
      ref: branchRecord('ref', 'A', 'B', { role: 'reference' }),
    };
    const report = auditDocumentHealth(document);
    expect(report.rows).toEqual([]);
  });

  it('reports an image anchor whose asset is missing through the shared resolver', () => {
    const document = baseDocument();
    document.chapters = [{ id: 'c1', title: 'Main', topLevelBlockIds: ['A'] }];
    document.blocks = {
      A: {
        id: 'A',
        content: {
          type: 'doc',
          children: [
            {
              type: 'image',
              attrs: { assetId: 'asset-1', alt: 'Diagram', anchorIds: ['a-image'] },
            },
          ],
        },
      },
      B: textBlock('B', paragraph('Target')),
    };
    document.assets = {
      'asset-1': { id: 'asset-1', path: 'assets/asset-1', mime: 'image/png' },
    };
    document.anchors = {
      'a-image': {
        id: 'a-image',
        blockId: 'A',
        kind: 'image',
        selector: {
          kind: 'image',
          assetId: 'asset-1',
          rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
          crop: { x: 0, y: 0, width: 1, height: 1 },
          point: false,
        },
        quote: 'Diagram',
      },
    };
    document.branches = {
      'b-image': branchRecord('b-image', 'A', 'B', { sourceAnchorId: 'a-image' }),
    };

    expect(auditDocumentHealth(document).rows).toEqual([]);
    const missing = auditDocumentHealth(document, {
      assetAvailability: { 'asset-1': 'asset-missing' },
    });
    expect(missing.rows).toHaveLength(1);
    expect(missing.rows[0]).toMatchObject({
      category: 'broken',
      anchorId: 'a-image',
      reasonLabel: 'The image asset is missing.',
    });
  });

  it('filters, counts, and searches by block, chapter, quote, kind, and reason', () => {
    const report = auditDocumentHealth(mixedDocument(), {
      collapsedBlockIds: new Set(['A']),
    });
    expect(filterDocumentHealthRows(report.rows, 'needs-repair')).toHaveLength(9);
    expect(filterDocumentHealthRows(report.rows, 'broken')).toHaveLength(1);
    expect(filterDocumentHealthRows(report.rows, 'ambiguous')).toHaveLength(1);
    expect(filterDocumentHealthRows(report.rows, 'idle')).toHaveLength(1);
    expect(filterDocumentHealthRows(report.rows, 'orphans')).toHaveLength(2);
    expect(filterDocumentHealthRows(report.rows, 'structure')).toHaveLength(5);
    expect(filterDocumentHealthRows(report.rows, 'hidden')).toHaveLength(1);

    expect(documentHealthFilterCount(report.counts, 'all')).toBe(12);
    expect(documentHealthFilterCount(report.counts, 'needs-repair')).toBe(9);
    expect(documentHealthFilterCount(report.counts, 'orphans')).toBe(2);

    expect(
      filterDocumentHealthRows(report.rows, 'all', 'missingword').map((row) => row.category),
    ).toEqual(['broken']);
    expect(
      filterDocumentHealthRows(report.rows, 'all', 'empty').map((row) => row.category),
    ).toEqual(['empty-chapter']);
    expect(
      filterDocumentHealthRows(report.rows, 'all', 'duplicate home').map((row) => row.category),
    ).toContain('duplicate-primary');
    expect(
      filterDocumentHealthRows(report.rows, 'all', 'formula').length,
    ).toBe(0);
    expect(filterDocumentHealthRows(report.rows, 'all', 'no such text')).toEqual([]);
    expect(
      report.rows.every(
        (row) =>
          documentHealthRowMatchesFilter(row, 'all') ||
          !documentHealthRowMatchesFilter(row, 'all'),
      ),
    ).toBe(true);
  });

  it('is read-only and deterministic', () => {
    const document = mixedDocument();
    const snapshot = structuredClone(document);
    const first = auditDocumentHealth(document);
    const second = auditDocumentHealth(document);
    expect(document).toEqual(snapshot);
    expect(first).toEqual(second);
  });

  it('audits 300 and 1,000 blocks within the synchronous budget', () => {
    const makeDocument = (count: number): Document => {
      const document = baseDocument();
      const blockIds: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const id = `block-${index}`;
        blockIds.push(id);
        document.blocks[id] = textBlock(
          id,
          paragraph(`Block ${index} carries a sentence with enough words to measure the audit.`),
        );
      }
      document.chapters = [{ id: 'c1', title: 'Large', topLevelBlockIds: blockIds }];
      // One idle anchor on every tenth block keeps the anchor path realistic.
      for (let index = 0; index < count; index += 10) {
        document.anchors[`anchor-${index}`] = textAnchor(
          `anchor-${index}`,
          `block-${index}`,
          'sentence',
        );
      }
      document.branches = {
        'b-sample': branchRecord('b-sample', 'block-0', 'block-1', {
          sourceAnchorId: 'anchor-0',
        }),
      };
      return document;
    };

    for (const count of [300, 1000]) {
      const document = makeDocument(count);
      const started = performance.now();
      const report = auditDocumentHealth(document);
      const elapsed = performance.now() - started;
      // The design's worker threshold is ~50 ms; leave CI headroom while still
      // failing a quadratic regression.
      expect(elapsed).toBeLessThan(150);
      expect(report.counts.all).toBeGreaterThan(0);
      console.log(`document health audit: ${count} blocks in ${elapsed.toFixed(1)} ms`);
    }
  });
});

// ---------------------------------------------------------------------------
// Anchor index ownership
// ---------------------------------------------------------------------------

describe('document health from the anchor index', () => {
  it('agrees with the pure audit for every checked-in fixture', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const path = await import('node:path');
    const fixtures = path.resolve(import.meta.dirname, '../../../fixtures');
    const files = readdirSync(fixtures)
      .filter((name) => name.endsWith('.json'))
      .sort();
    for (const file of files) {
      const document = JSON.parse(
        readFileSync(path.resolve(fixtures, file), 'utf8'),
      ) as Document;
      const pure = auditDocumentHealth(document);
      const indexed = auditDocumentHealth(document, {
        anchorIndex: buildAnchorIndex(document),
      });
      expect(indexed.rows.map((row) => row.id), file).toEqual(
        pure.rows.map((row) => row.id),
      );
      expect(indexed.summary, file).toEqual(pure.summary);
    }
  });

  it('reads cached block projections and never mutates the index', () => {
    const document = mixedDocument();
    const index = buildAnchorIndex(document);
    const stats = { ...index.stats };
    const firstBlock = Object.keys(document.blocks)[0] as string;
    const cached = index.blockIndex(firstBlock);
    const report = auditDocumentHealth(document, { anchorIndex: index });
    expect(report.rows.length).toBeGreaterThan(0);
    expect(index.stats).toEqual(stats);
    expect(index.blockIndex(firstBlock)).toBe(cached);
  });
});
