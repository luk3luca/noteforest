import { describe, expect, it } from 'vitest';
import { createDocument, executeCommand, type Document } from '@noteforest/core';
import type { Asset } from '@noteforest/core';
import { DocumentRuntime } from '../src/renderer/src/state/runtime';
import { createInMemoryDocumentGateway } from '../src/renderer/src/state/memory-document-gateway';

/**
 * DR1b: the record half of the unused-image cleanup.
 *
 * The bytes move in the main process first; the record is removed here through
 * the ordinary guarded `asset.remove` command. A record that a live image or
 * image anchor names is refused by that command, which is the second line of
 * defence behind the fresh plan. Cleanup is deliberately not an undo entry: the
 * file is in the Trash, not in the document history.
 */

const USED_ID = 'a'.repeat(64);
const FREE_ID = 'b'.repeat(64);

function asset(id: string): Asset {
  return {
    id,
    path: `assets/${id}`,
    mime: 'image/png',
    bytes: 8,
    originalName: 'diagram.png',
  };
}

function runtimeFixture(options: { withImage: boolean; status?: 'editable' | 'read-only' } = {
  withImage: false,
}): {
  runtime: DocumentRuntime;
  memory: ReturnType<typeof createInMemoryDocumentGateway>;
} {
  let document: Document = createDocument({ title: 'Unused images', chapterId: 'c1' });
  const added = executeCommand(document, {
    type: 'asset.add',
    asset: asset(USED_ID),
  });
  if (!added.ok) throw new Error(added.message);
  document = added.document;
  const free = executeCommand(document, { type: 'asset.add', asset: asset(FREE_ID) });
  if (!free.ok) throw new Error(free.message);
  document = free.document;
  const block = executeCommand(document, {
    type: 'block.create',
    blockId: 'block-1',
    content: {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: options.withImage
            ? [{ type: 'image', attrs: { assetId: USED_ID, alt: 'diagram' } }]
            : [{ type: 'text', text: 'Plain text' }],
        },
      ],
    },
    placement: { kind: 'top-level', chapterId: 'c1' },
  });
  if (!block.ok) throw new Error(block.message);
  document = block.document;

  const memory = createInMemoryDocumentGateway({
    packagePath: '/memory/library/unused-images',
    document,
    ...(options.status === undefined ? {} : { status: options.status }),
  });
  const runtime = new DocumentRuntime(
    {
      packagePath: '/memory/library/unused-images',
      document,
      status: options.status ?? 'editable',
      ...(options.status === 'read-only'
        ? { readOnlyReason: 'Another window has this note open.' }
        : {}),
      errors: [],
      warnings: [],
    },
    [],
    null,
    memory.gateway,
  );
  return { runtime, memory };
}

describe('removeUnusedAsset', () => {
  it('removes an unreferenced record through the guarded command, without undo', async () => {
    const { runtime, memory } = runtimeFixture();
    expect(runtime.document.assets[FREE_ID]).toBeDefined();

    const result = await runtime.removeUnusedAsset(FREE_ID);

    expect(result).toMatchObject({ ok: true, assetId: FREE_ID });
    expect(runtime.document.assets[FREE_ID]).toBeUndefined();
    expect(runtime.document.assets[USED_ID]).toBeDefined();
    // The record removal is cleanup, not an editable step: the bytes are in the
    // Trash, so an inverse `asset.add` would restore a broken record.
    expect(runtime.canUndoStructural).toBe(false);
    expect(memory.calls).toContainEqual({
      method: 'apply',
      packagePath: '/memory/library/unused-images',
      command: { type: 'asset.remove', assetId: FREE_ID },
    });
  });

  it('refuses a record that an image node still names', async () => {
    const { runtime } = runtimeFixture({ withImage: true });
    const removed = await runtime.removeUnusedAsset(USED_ID);
    expect(removed.ok).toBe(false);
    expect(runtime.document.assets[USED_ID]).toBeDefined();
  });

  it('refuses on a read-only open', async () => {
    const { runtime } = runtimeFixture({ withImage: false, status: 'read-only' });
    const removed = await runtime.removeUnusedAsset(FREE_ID);
    expect(removed).toMatchObject({ ok: false, message: 'This note is open read-only.' });
    expect(runtime.document.assets[FREE_ID]).toBeDefined();
  });
});
