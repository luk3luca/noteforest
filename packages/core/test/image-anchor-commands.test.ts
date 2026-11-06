import { describe, expect, it } from 'vitest';
import { validateAnchorSelector } from '../src/anchors.js';
import type { DocumentCommand } from '../src/commands.js';
import { resolveAnchor } from '../src/anchors.js';
import type { AnchorRect } from '../src/anchors.js';
import type { ContentNode } from '../src/types.js';
import {
  deterministicContext,
  newDocument,
  run,
  tryRun,
} from './helpers.js';
import {
  expectDocumentValid as expectValid,
  normalizedDocument as stable,
  redoOf,
  undoOf,
} from './command-invariants.js';

const ASSET_ID = 'a'.repeat(64);
const CROP: AnchorRect = { x: 0, y: 0, width: 1, height: 1 };

function imageContent(assetId = ASSET_ID): ContentNode {
  return {
    type: 'doc',
    children: [{ type: 'image', attrs: { assetId, alt: 'Eigenvector diagram' } }],
  };
}

function imageDocument() {
  const context = deterministicContext();
  let document = newDocument(context);
  document = run(
    document,
    {
      type: 'asset.add',
      asset: {
        id: ASSET_ID,
        path: `assets/${ASSET_ID}`,
        mime: 'image/png',
        width: 640,
        height: 360,
        originalName: 'forest.png',
      },
    },
    context,
  ).document;
  const created = run(
    document,
    {
      type: 'block.create',
      blockId: 'image-block',
      content: imageContent(),
      placement: { kind: 'top-level', chapterId: document.chapters[0]?.id ?? '' },
    },
    context,
  );
  return { context, document: created.document, blockId: 'image-block' };
}

function createImageBranch(
  document: Parameters<typeof run>[0],
  context: ReturnType<typeof deterministicContext>,
  blockId: string,
  anchorId: string,
  rect: AnchorRect,
  point: boolean,
) {
  const command: DocumentCommand = {
    type: 'branch.createFromSelection',
    blockId,
    anchorId,
    kind: 'image',
    selector: {
      kind: 'image',
      assetId: ASSET_ID,
      rect,
      crop: CROP,
      point,
      label: 'Eigenvector diagram',
    },
    binding: {
      kind: 'image',
      nodePath: [0],
      assetId: ASSET_ID,
      rect,
      crop: CROP,
      point,
    },
    target: { kind: 'new' },
    role: 'primary',
  };
  return run(document, command, context);
}

describe('image region branch creation', () => {
  it('creates the anchor, sorted binding, branch, and new target in one undoable command', () => {
    const { context, document, blockId } = imageDocument();
    const before = structuredClone(document);
    const region = { x: 0.1, y: 0.2, width: 0.25, height: 0.3 };
    const created = createImageBranch(document, context, blockId, 'image-region-1', region, false);
    const anchorId = created.created.anchorIds[0];
    const targetId = created.created.blockIds[0];
    expect(anchorId).toBe('image-region-1');
    expect(created.created.branchIds).toHaveLength(1);
    expect(created.document.anchors['image-region-1']).toMatchObject({
      id: 'image-region-1',
      blockId,
      kind: 'image',
      selector: {
        kind: 'image',
        assetId: ASSET_ID,
        rect: region,
        crop: CROP,
        point: false,
        label: 'Eigenvector diagram',
      },
      quote: 'Eigenvector diagram',
    });
    const image = created.document.blocks[blockId]?.content.children?.[0];
    expect(image?.attrs?.['anchorIds']).toEqual(['image-region-1']);
    expect(targetId).toBeDefined();
    expect(created.document.blocks[targetId ?? '']).toBeDefined();
    const branch = Object.values(created.document.branches).find(
      (candidate) => candidate.source.anchorId === 'image-region-1',
    );
    expect(branch?.targetBlockId).toBe(targetId);
    expect(resolveAnchor(created.document, 'image-region-1')).toMatchObject({
      state: 'resolved',
      reason: 'exact-binding',
      resolved: { range: { kind: 'image', rect: region, point: false } },
    });
    expectValid(created.document);

    const undone = undoOf(created);
    expect(undone.document.anchors['image-region-1']).toBeUndefined();
    expect(undone.document.blocks[targetId ?? '']).toBeUndefined();
    expect(undone.document.branches[branch?.id ?? '']).toBeUndefined();
    expect(stable(undone.document)).toEqual(stable(before));

    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(created.document));
    expect(redone.document.anchors['image-region-1']).toEqual(
      created.document.anchors['image-region-1'],
    );
  });

  it('keeps several regions and a point on one image with sorted anchorIds', () => {
    const { context, document, blockId } = imageDocument();
    const first = createImageBranch(
      document,
      context,
      blockId,
      'image-region-2',
      { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      false,
    );
    const second = createImageBranch(
      first.document,
      context,
      blockId,
      'image-point-1',
      { x: 0.6, y: 0.6, width: 0, height: 0 },
      true,
    );
    const image = second.document.blocks[blockId]?.content.children?.[0];
    expect(image?.attrs?.['anchorIds']).toEqual(['image-point-1', 'image-region-2']);
    expect(resolveAnchor(second.document, 'image-point-1')).toMatchObject({
      state: 'resolved',
      resolved: { range: { point: true, rect: { width: 0, height: 0 } } },
    });
    expect(Object.values(second.document.branches)).toHaveLength(2);
    expectValid(second.document);
  });

  it('rejects an invalid point/region selector before any mutation', () => {
    const { context, document, blockId } = imageDocument();
    const before = structuredClone(document);
    const badPoint = tryRun(
      document,
      {
        type: 'branch.createFromSelection',
        blockId,
        kind: 'image',
        selector: {
          kind: 'image',
          assetId: ASSET_ID,
          rect: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 },
          crop: CROP,
          point: true,
        },
        binding: {
          kind: 'image',
          nodePath: [0],
          assetId: ASSET_ID,
          rect: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 },
          point: true,
        },
        target: { kind: 'new' },
      },
      context,
    );
    expect(badPoint.ok).toBe(false);
    if (!badPoint.ok) expect(badPoint.code).toBe('invalid-content');
    expect(stable(document)).toEqual(stable(before));

    expect(
      validateAnchorSelector({
        kind: 'image',
        assetId: ASSET_ID,
        rect: { x: 0.9, y: 0, width: 0.2, height: 0.2 },
        point: false,
      }).issues.length,
    ).toBeGreaterThan(0);
  });
});
