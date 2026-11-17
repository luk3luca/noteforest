import { describe, expect, it } from 'vitest';
import type { Anchor, ContentNode, Document } from '@noteforest/core';
import {
  formatImageBytes,
  unusedImageViews,
  unusedImagesActionLabel,
  unusedImagesMovedMessage,
  unusedImagesMoreLine,
  unusedImagesPartialMessage,
  unusedImagesSummaryLine,
  unusedImagesTotalBytes,
} from '../src/renderer/src/lib/unused-images';
import { cleanUnusedImages, type UnusedCleanupPorts } from '../src/renderer/src/lib/unused-images-cleanup';

/**
 * DR1b: the `Unused images` plan, its row text, and the cleanup order.
 *
 * `planAssetGc` is core and tested there; these tests pin what the section
 * lists and — the dangerous half — what the cleanup pass touches: a backup
 * reference, a stale list, the OS Trash before the record, and the abort.
 */

const USED_NODE_ID = 'a'.repeat(64);
const USED_ANCHOR_ID = 'b'.repeat(64);
const FREE_ONE_ID = 'c'.repeat(64);
const FREE_TWO_ID = 'd'.repeat(64);
const BACKUP_ONLY_ID = 'e'.repeat(64);

function imageNode(assetId: string): ContentNode {
  return { type: 'image', attrs: { assetId, alt: 'diagram' } };
}

function paragraph(text: string): ContentNode {
  return { type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] };
}

function asset(id: string, extra: { originalName?: string; bytes?: number } = {}) {
  return {
    id,
    path: `assets/${id}`,
    mime: 'image/png',
    bytes: extra.bytes ?? 2048,
    ...(extra.originalName === undefined ? {} : { originalName: extra.originalName }),
  };
}

function anchor(id: string, blockId: string, assetId: string): Anchor {
  return {
    id,
    blockId,
    kind: 'image',
    selector: { kind: 'image', assetId, x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    quote: 'region',
  };
}

/** One block with a live image node, one image anchor, and three spare records. */
function documentFixture(): Document {
  return {
    schemaVersion: 2,
    id: 'unused-images',
    title: 'Unused images fixture',
    createdAt: '2026-11-17T10:00:00.000Z',
    updatedAt: '2026-11-17T10:00:00.000Z',
    revision: 1,
    chapters: [{ id: 'c1', title: 'Main', topLevelBlockIds: ['text', 'branch'] }],
    blocks: {
      text: { id: 'text', content: paragraph('Lives here') },
      branch: { id: 'branch', content: { type: 'doc', children: [imageNode(USED_NODE_ID)] } },
    },
    anchors: { 'anchor-1': anchor('anchor-1', 'branch', USED_ANCHOR_ID) },
    branches: {},
    assets: {
      [USED_NODE_ID]: asset(USED_NODE_ID, { originalName: 'kept-by-node.png' }),
      [USED_ANCHOR_ID]: asset(USED_ANCHOR_ID, { originalName: 'kept-by-anchor.png' }),
      [FREE_ONE_ID]: asset(FREE_ONE_ID, { originalName: 'free-one.png', bytes: 1024 }),
      [FREE_TWO_ID]: asset(FREE_TWO_ID, { bytes: 3 * 1024 * 1024 }),
      [BACKUP_ONLY_ID]: asset(BACKUP_ONLY_ID, { originalName: 'only-in-backup.png' }),
    },
    annotations: [],
  };
}

function viewIds(document: Document, retained: string[] = []): string[] {
  return unusedImageViews(document, retained).map((item) => item.id);
}

describe('unused image rows', () => {
  it('lists only records that no image node, no image anchor, and no backup names', () => {
    const document = documentFixture();
    // Rows are name-ordered, so the nameless record sorts by its path basename.
    expect(viewIds(document)).toEqual([FREE_TWO_ID, FREE_ONE_ID, BACKUP_ONLY_ID]);
    // A retained backup id is never listed, even though the live document is
    // silent about it: restoring that backup must keep working.
    expect(viewIds(document, [BACKUP_ONLY_ID])).toEqual([FREE_TWO_ID, FREE_ONE_ID]);
    expect(viewIds(document, Object.keys(document.assets))).toEqual([]);
  });

  it('names a record by originalName, or by the recorded path basename', () => {
    const rows = unusedImageViews(documentFixture(), [BACKUP_ONLY_ID]);
    expect(rows.map((row) => row.name)).toEqual([FREE_TWO_ID, 'free-one.png']);
    expect(rows.map((row) => row.id)).toEqual([FREE_TWO_ID, FREE_ONE_ID]);
  });

  it('carries the size and the MIME on the second line', () => {
    const rows = unusedImageViews(documentFixture(), [BACKUP_ONLY_ID]);
    expect(rows[1]).toMatchObject({ mime: 'image/png', bytes: 1024, size: '1.0 kB' });
    expect(rows[0]).toMatchObject({ mime: 'image/png', bytes: 3145728, size: '3.0 MB' });
    expect(unusedImagesTotalBytes(rows)).toBe(1024 + 3145728);
  });

  it('formats a size with one unit and no false precision', () => {
    expect(formatImageBytes(0)).toBe('0 B');
    expect(formatImageBytes(512)).toBe('512 B');
    expect(formatImageBytes(1024)).toBe('1.0 kB');
    expect(formatImageBytes(20 * 1024)).toBe('20 kB');
    expect(formatImageBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatImageBytes(12 * 1024 * 1024)).toBe('12 MB');
  });

  it('says the count once, in the section action and in the outcome', () => {
    expect(unusedImagesActionLabel(1)).toBe('Clean up 1 unused image…');
    expect(unusedImagesActionLabel(3)).toBe('Clean up 3 unused images…');
    expect(unusedImagesSummaryLine(3, 4 * 1024 * 1024)).toBe('3 images · 4.0 MB');
    expect(unusedImagesSummaryLine(1, 900)).toBe('1 image · 900 B');
    expect(unusedImagesMovedMessage(1)).toBe('Moved 1 image to the Trash.');
    expect(unusedImagesMovedMessage(2)).toBe('Moved 2 images to the Trash.');
    expect(unusedImagesPartialMessage(0, 3)).toBe('');
    expect(unusedImagesPartialMessage(2, 3)).toBe(
      'Moved 2 of 3 unused images to the Trash. The rest stay in the note.',
    );
    expect(unusedImagesMoreLine(0)).toBe('');
    expect(unusedImagesMoreLine(4)).toBe('and 4 more');
  });
});

interface PortLog {
  calls: string[];
  trash: string[];
  removed: string[];
}

function ports(
  document: () => Document,
  options: {
    retained?: string[];
    trashFails?: string;
    recordFails?: string;
    scanFails?: boolean;
  } = {},
): { ports: UnusedCleanupPorts; log: PortLog } {
  const log: PortLog = { calls: [], trash: [], removed: [] };
  return {
    log,
    ports: {
      backupAssetIds: async () => {
        log.calls.push('scan');
        if (options.scanFails === true) {
          return { ok: false, message: 'The backups couldn’t be checked.', details: 'ENOENT' };
        }
        return { ok: true, assetIds: options.retained ?? [] };
      },
      document,
      trash: async (assetId) => {
        log.calls.push(`trash:${assetId}`);
        if (options.trashFails === assetId) {
          return { ok: false, message: 'The image couldn’t be moved to the Trash.', details: '/x' };
        }
        log.trash.push(assetId);
        return { ok: true, trashed: true };
      },
      removeRecord: async (assetId) => {
        log.calls.push(`remove:${assetId}`);
        if (options.recordFails === assetId) {
          return { ok: false, message: 'This image is still in use.' };
        }
        log.removed.push(assetId);
        return { ok: true };
      },
    },
  };
}

describe('unused image cleanup pass', () => {
  it('trashes the bytes before it removes each record, one asset at a time', async () => {
    const document = documentFixture();
    const { ports: cleanupPorts, log } = ports(() => document);
    const result = await cleanUnusedImages([FREE_ONE_ID, FREE_TWO_ID], cleanupPorts);

    expect(result).toMatchObject({ ok: true, moved: [FREE_ONE_ID, FREE_TWO_ID], skipped: [] });
    expect(result.message).toBe('Moved 2 images to the Trash.');
    expect(log.calls).toEqual([
      'scan',
      `trash:${FREE_ONE_ID}`,
      `remove:${FREE_ONE_ID}`,
      `trash:${FREE_TWO_ID}`,
      `remove:${FREE_TWO_ID}`,
    ]);
  });

  it('never touches an asset that a backup retains, even when it was requested', async () => {
    const document = documentFixture();
    const { ports: cleanupPorts, log } = ports(() => document, { retained: [BACKUP_ONLY_ID] });
    const result = await cleanUnusedImages([BACKUP_ONLY_ID, FREE_ONE_ID], cleanupPorts);

    expect(result.ok).toBe(true);
    expect(result.moved).toEqual([FREE_ONE_ID]);
    expect(result.skipped).toEqual([BACKUP_ONLY_ID]);
    expect(log.trash).toEqual([FREE_ONE_ID]);
    expect(log.removed).toEqual([FREE_ONE_ID]);
  });

  it('says nothing was removed when every requested asset is still in use', async () => {
    const document = documentFixture();
    const { ports: cleanupPorts, log } = ports(() => document, { retained: [BACKUP_ONLY_ID] });
    const result = await cleanUnusedImages([BACKUP_ONLY_ID], cleanupPorts);

    expect(result).toMatchObject({
      ok: true,
      moved: [],
      skipped: [BACKUP_ONLY_ID],
      message: 'Nothing was removed. These images are in use again.',
    });
    expect(log.trash).toEqual([]);
  });

  it('re-plans at action time, so a record that became referenced is skipped', async () => {
    const base = documentFixture();
    let document = base;
    const { ports: cleanupPorts, log } = ports(() => document);
    const remove = cleanupPorts.removeRecord;
    cleanupPorts.removeRecord = async (assetId) => {
      const result = await remove(assetId);
      // A later edit adds an image node that names the next candidate; the
      // list the dialog showed is now stale for it.
      const block = document.blocks['text'];
      if (block !== undefined) {
        document = {
          ...document,
          blocks: {
            ...document.blocks,
            text: { ...block, content: { type: 'doc', children: [imageNode(FREE_TWO_ID)] } },
          },
        };
      }
      return result;
    };

    const result = await cleanUnusedImages([FREE_ONE_ID, FREE_TWO_ID], cleanupPorts);

    expect(result.ok).toBe(true);
    expect(result.moved).toEqual([FREE_ONE_ID]);
    expect(result.skipped).toEqual([FREE_TWO_ID]);
    expect(log.trash).toEqual([FREE_ONE_ID]);
    expect(log.removed).toEqual([FREE_ONE_ID]);
  });

  it('aborts on the first trash failure and reports what it handled', async () => {
    const document = documentFixture();
    const { ports: cleanupPorts, log } = ports(() => document, {
      trashFails: FREE_TWO_ID,
    });
    const result = await cleanUnusedImages(
      [FREE_ONE_ID, FREE_TWO_ID, BACKUP_ONLY_ID],
      cleanupPorts,
    );

    expect(result.ok).toBe(false);
    expect(result.moved).toEqual([FREE_ONE_ID]);
    expect(result.failed).toMatchObject({ assetId: FREE_TWO_ID, details: '/x' });
    expect(result.message).toBe(
      'Moved 1 of 3 unused images to the Trash. The rest stay in the note.',
    );
    // Nothing after the failure ran, and the failed asset's record is intact.
    expect(log.calls).toEqual([
      'scan',
      `trash:${FREE_ONE_ID}`,
      `remove:${FREE_ONE_ID}`,
      `trash:${FREE_TWO_ID}`,
    ]);
  });

  it('leaves the missing-asset state when the record write fails after the move', async () => {
    const document = documentFixture();
    const { ports: cleanupPorts, log } = ports(() => document, {
      recordFails: FREE_ONE_ID,
    });
    const result = await cleanUnusedImages([FREE_ONE_ID, FREE_TWO_ID], cleanupPorts);

    expect(result.ok).toBe(false);
    expect(result.moved).toEqual([]);
    expect(result.failed?.message).toBe('This image is still in use.');
    expect(result.message).toBe('This image is still in use.');
    // The bytes moved but the record was never removed; the next asset was not
    // attempted.
    expect(log.trash).toEqual([FREE_ONE_ID]);
    expect(log.removed).toEqual([]);
    expect(log.calls).toEqual(['scan', `trash:${FREE_ONE_ID}`, `remove:${FREE_ONE_ID}`]);
  });

  it('does nothing when the backup scan fails', async () => {
    const document = documentFixture();
    const { ports: cleanupPorts, log } = ports(() => document, { scanFails: true });
    const result = await cleanUnusedImages([FREE_ONE_ID], cleanupPorts);

    expect(result.ok).toBe(false);
    expect(result.message).toBe('The backups couldn’t be checked.');
    expect(result.details).toBe('ENOENT');
    expect(log.trash).toEqual([]);
  });
});
