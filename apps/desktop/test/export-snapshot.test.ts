import { describe, expect, it } from 'vitest';
import { buildAnchorIndex, type Document } from '@noteforest/core';
import { normalizePageSettings, pageSettingsFingerprint } from '@noteforest/layout';
import { createExportSnapshot } from '../src/renderer/src/export-snapshot';
import { assetUrlsForRuntime, failedAssetIdsForRuntime } from '../src/renderer/src/page/asset-urls';

/**
 * M4c2 R2: the export snapshot is the current in-memory document (unsaved
 * edits and canonical revision), the resolved personal page lens, and the
 * session asset availability. It never reads the package from disk.
 */

const SETTINGS = normalizePageSettings({
  setup: {
    size: 'A5',
    orientation: 'portrait',
    margins: { top: 12, right: 12, bottom: 12, left: 12 },
  },
});

function document(revision = 9): Document {
  return {
    schemaVersion: 2,
    id: 'doc-unsaved',
    title: 'Unsaved draft',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-09T00:00:00.000Z',
    revision,
    chapters: [{ id: 'chapter-1', title: 'Draft', topLevelBlockIds: ['block-1'] }],
    blocks: {
      'block-1': {
        id: 'block-1',
        label: 'Draft block',
        content: {
          type: 'doc',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', text: 'Typed but not saved yet.' }],
            },
          ],
        },
      },
    },
    anchors: {},
    branches: {},
    assets: {
      'asset-ok': { id: 'asset-ok', path: 'assets/asset-ok' },
      'asset-missing': { id: 'asset-missing', path: 'assets/asset-missing' },
    },
  };
}

describe('createExportSnapshot', () => {
  it('carries the current revision, unsaved content, resolved settings, and assets', () => {
    const snapshot = createExportSnapshot(
      {
        packagePath: '/library/draft',
        document: document(9),
        assetAvailability: { 'asset-missing': 'asset-missing' },
        anchorIndex: buildAnchorIndex(document(9)),
      },
      SETTINGS,
    );
    expect(snapshot.packagePath).toBe('/library/draft');
    expect(snapshot.documentId).toBe('doc-unsaved');
    expect(snapshot.revision).toBe(9);
    expect(snapshot.title).toBe('Unsaved draft');
    expect(snapshot.document.blocks['block-1']!.content.children?.[0]?.children?.[0]?.text).toBe(
      'Typed but not saved yet.',
    );
    expect(snapshot.settings).toEqual(SETTINGS);
    expect(snapshot.settingsFingerprint).toBe(pageSettingsFingerprint(SETTINGS));
    expect(snapshot.assetUrls).toEqual({
      'asset-ok': 'noteforest-asset://asset/asset-ok',
    });
    expect(snapshot.failedAssetIds).toEqual(['asset-missing']);
    expect(snapshot.anchorView).toEqual({
      documentId: 'doc-unsaved',
      revision: 9,
      byBlock: {},
    });
  });

  it('never exposes a URL for a failed asset', () => {
    const source = {
      document: document(),
      assetAvailability: {
        'asset-ok': 'available' as const,
        'asset-missing': 'asset-changed' as const,
      },
    };
    expect(assetUrlsForRuntime(source)).toEqual({
      'asset-ok': 'noteforest-asset://asset/asset-ok',
    });
    expect(failedAssetIdsForRuntime(source)).toEqual(['asset-missing']);
  });
});
