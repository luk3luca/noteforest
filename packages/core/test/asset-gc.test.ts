import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planAssetGc, referencedAssetIds, imageAssetReferences } from '../src/assets.js';
import { BackupManager } from '../src/node/backups.js';
import { backupAssetReferences } from '../src/node/recovery.js';
import { stringifyDocument } from '../src/serialize.js';
import type { ContentNode, Document } from '../src/types.js';
import { deterministicContext, makeTempDir, newDocument, removeDir, run, tryRun } from './helpers.js';

const USED_ID = 'a'.repeat(64);
const FREE_ID = 'b'.repeat(64);
const BACKUP_ONLY_ID = 'c'.repeat(64);

const RECT = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

function asset(id: string, originalName: string) {
  return {
    id,
    path: `assets/${id}`,
    mime: 'image/png',
    bytes: 8,
    width: 640,
    height: 360,
    originalName,
  };
}

function imageContent(...ids: string[]): ContentNode {
  return {
    type: 'doc',
    children: ids.map((id) => ({ type: 'image', attrs: { assetId: id, alt: 'diagram' } })),
  };
}

function documentWithImages(ids: string[]): { context: ReturnType<typeof deterministicContext>; document: Document; blockId: string } {
  const context = deterministicContext();
  let document = newDocument(context);
  document = run(document, { type: 'asset.add', asset: asset(USED_ID, 'used.png') }, context).document;
  document = run(document, { type: 'asset.add', asset: asset(FREE_ID, 'free.png') }, context).document;
  const created = run(
    document,
    {
      type: 'block.create',
      blockId: 'image-block',
      content: imageContent(...ids),
      placement: { kind: 'top-level', chapterId: document.chapters[0]?.id ?? '' },
    },
    context,
  );
  return { context, document: created.document, blockId: 'image-block' };
}

function createImageAnchor(
  document: Document,
  context: ReturnType<typeof deterministicContext>,
  blockId: string,
) {
  return run(
    document,
    {
      type: 'branch.createFromSelection',
      blockId,
      anchorId: 'image-anchor',
      kind: 'image',
      selector: {
        kind: 'image',
        assetId: USED_ID,
        rect: RECT,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        point: false,
        label: 'diagram',
      },
      binding: {
        kind: 'image',
        nodePath: [0],
        assetId: USED_ID,
        rect: RECT,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        point: false,
      },
      target: { kind: 'new' },
      role: 'primary',
    },
    context,
  );
}

describe('asset.remove reference guard', () => {
  it('refuses an asset named by an image node and leaves the document untouched', () => {
    const { context, document } = documentWithImages([USED_ID]);
    const before = structuredClone(document);
    const result = tryRun(document, { type: 'asset.remove', assetId: USED_ID }, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('asset-in-use');
    expect(result.message).toContain(`${USED_ID}`);
    expect(result.message).toContain('1 image node');
    expect(document).toEqual(before);

    const references = imageAssetReferences(document, USED_ID);
    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({
      kind: 'image-node',
      blockId: 'image-block',
      path: [0],
    });
    expect(referencedAssetIds(document)).toEqual(new Set([USED_ID]));
  });

  it('refuses an asset named only by an image anchor selector', () => {
    const { context, document: withImage, blockId } = documentWithImages([USED_ID]);
    const branched = createImageAnchor(withImage, context, blockId);
    // Remove the image node from content: the anchor selector still names the
    // asset, so deleting the record would silently break the anchor.
    const detached = run(
      branched.document,
      {
        type: 'block.editContent',
        blockId,
        content: { type: 'doc', children: [{ type: 'paragraph' }] },
      },
      context,
    );
    const result = tryRun(
      detached.document,
      { type: 'asset.remove', assetId: USED_ID },
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('asset-in-use');
    expect(result.message).toContain('1 image anchor');
    expect(imageAssetReferences(detached.document, USED_ID).map((entry) => entry.kind)).toEqual([
      'image-anchor',
    ]);
  });

  it('removes an unreferenced asset and restores it through the inverse', () => {
    const { context, document } = documentWithImages([USED_ID]);
    const before = structuredClone(document);
    const removed = run(document, { type: 'asset.remove', assetId: FREE_ID }, context);
    expect(removed.document.assets[FREE_ID]).toBeUndefined();
    expect(removed.inverse).toMatchObject({ type: 'asset.add' });

    const restored = run(
      removed.document,
      { type: 'asset.add', asset: asset(FREE_ID, 'free.png') },
      context,
    );
    expect(restored.document.assets[FREE_ID]).toBeDefined();
    expect(restored.document.assets).toEqual(before.assets);
  });
});

describe('asset GC policy', () => {
  it('reclaims only records with no live node or anchor and no retained backup', () => {
    const { document } = documentWithImages([USED_ID]);
    const plan = planAssetGc(document, { retainedAssetIds: [BACKUP_ONLY_ID] });
    expect(plan.reclaimable).toEqual([FREE_ID]);
    expect(plan.retained).toEqual([
      { id: USED_ID, reasons: ['live-image'] },
    ]);

    const withBackup = planAssetGc(document, { retainedAssetIds: [FREE_ID] });
    expect(withBackup.reclaimable).toEqual([]);
    expect(withBackup.retained).toContainEqual({
      id: FREE_ID,
      reasons: ['retained-backup'],
    });
  });

  it('keeps a record named only by an image anchor in the retained set', () => {
    const { context, document: withImage, blockId } = documentWithImages([USED_ID]);
    const branched = createImageAnchor(withImage, context, blockId);
    const detached = run(
      branched.document,
      {
        type: 'block.editContent',
        blockId,
        content: { type: 'doc', children: [{ type: 'paragraph' }] },
      },
      context,
    );
    const plan = planAssetGc(detached.document);
    expect(plan.reclaimable).toEqual([FREE_ID]);
    expect(plan.retained).toContainEqual({
      id: USED_ID,
      reasons: ['live-anchor'],
    });
  });
});

describe('backup references keep GC restore-safe', () => {
  let root = '';

  beforeEach(async () => {
    root = await makeTempDir('noteforest-asset-gc-');
  });

  afterEach(async () => {
    await removeDir(root);
  });

  it('retains asset ids referenced only by a backup and releases them when the backup is gone', async () => {
    const packagePath = path.join(root, 'document');
    const backupsDir = path.join(root, 'backups');
    await fs.mkdir(packagePath, { recursive: true });
    const { document } = documentWithImages([USED_ID]);
    const sourceBlock = document.blocks['image-block'];
    if (sourceBlock === undefined) throw new Error('image block fixture is missing');
    const backupDocument: Document = {
      ...document,
      assets: {
        [USED_ID]: asset(USED_ID, 'used.png'),
        [BACKUP_ONLY_ID]: asset(BACKUP_ONLY_ID, 'old.png'),
      },
      blocks: {
        ...document.blocks,
        'image-block': {
          ...sourceBlock,
          content: imageContent(USED_ID, BACKUP_ONLY_ID),
        },
      },
    };
    const manager = new BackupManager(backupsDir);
    const backup = await manager.create(stringifyDocument(backupDocument), {
      kind: 'manual',
      revision: document.revision,
      now: new Date('2026-11-07T10:00:00.000Z'),
    });

    const references = await backupAssetReferences(packagePath, {
      backupsDir,
      maxBackups: 50,
    });
    expect(references.backupPaths).toEqual([backup.path]);
    expect(references.assetIds).toEqual([USED_ID, BACKUP_ONLY_ID].sort());

    const live = documentWithImages([USED_ID]).document;
    live.assets[BACKUP_ONLY_ID] = asset(BACKUP_ONLY_ID, 'old.png');
    const plan = planAssetGc(live, { retainedAssetIds: references.assetIds });
    expect(plan.reclaimable).toEqual([FREE_ID]);
    expect(plan.retained).toContainEqual({
      id: BACKUP_ONLY_ID,
      reasons: ['retained-backup'],
    });

    await fs.rm(backup.path);
    const afterRotation = await backupAssetReferences(packagePath, { backupsDir });
    expect(afterRotation.assetIds).toEqual([]);
    expect(
      planAssetGc(live, { retainedAssetIds: afterRotation.assetIds }).reclaimable,
    ).toEqual([FREE_ID, BACKUP_ONLY_ID].sort());
  });

  it('ignores invalid backups that could not be restored', async () => {
    const packagePath = path.join(root, 'document');
    const backupsDir = path.join(root, 'backups');
    await fs.mkdir(packagePath, { recursive: true });
    const manager = new BackupManager(backupsDir);
    await manager.create('{ not json', { kind: 'manual', revision: 0 });
    const references = await backupAssetReferences(packagePath, { backupsDir });
    expect(references).toEqual({ assetIds: [], backupPaths: [] });
  });
});
