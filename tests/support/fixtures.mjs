import assert from 'node:assert/strict';

/**
 * Document, anchor and branch factories shared by UI flows.
 *
 * Pure content builders (`textDoc`, `formulaDoc`, `codeDoc`) are plain data.
 * The `add*` builders apply one structural command through a UI session and
 * wait for its visible result; they return nothing so a caller keeps its own
 * assertions explicit.
 */

export function textDoc(text) {
  return {
    type: 'doc',
    children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
  };
}

export function formulaDoc(latex) {
  return {
    type: 'doc',
    children: [{ type: 'paragraph', children: [{ type: 'inlineMath', attrs: { latex } }] }],
  };
}

export function codeDoc(text) {
  return {
    type: 'doc',
    children: [
      {
        type: 'codeBlock',
        attrs: { language: 'ts' },
        children: [{ type: 'text', text }],
      },
    ],
  };
}

/** Create a top-level block in the document's first chapter. */
export async function addTopLevelBlock(ui, blockId, content) {
  const chapterId = (await ui.structure()).chapters[0].id;
  await ui.applyCommand({
    type: 'block.create',
    blockId,
    content,
    placement: { kind: 'top-level', chapterId },
  });
  await ui.page.waitForSelector(
    `.nf-editor[data-active="true"] [data-block-card="${blockId}"]`,
  );
}

export async function addAnchor(ui, { anchorId, blockId, kind, selector, binding }) {
  await ui.applyCommand({
    type: 'anchor.create',
    anchorId,
    blockId,
    kind,
    selector,
    binding,
  });
}

export async function addBranch(
  ui,
  { branchId, sourceBlockId, sourceAnchorId, targetBlockId, role = 'primary' },
) {
  await ui.applyCommand({
    type: 'branch.create',
    ...(branchId === undefined ? {} : { branchId }),
    sourceBlockId,
    sourceAnchorId,
    targetBlockId,
    role,
  });
}

/**
 * The M3b2c callout stack over the demo document: one parent with two anchored
 * callouts and two direct children (one short, one deliberately wide).
 */
export async function calloutStackFixture(ui) {
  await ui.seedDemo();

  const parentCard = ui.harness
    .activeEditor()
    .locator('[data-block-card]', { hasText: 'Take the symmetric matrix below' })
    .first();
  const parentId = await parentCard.getAttribute('data-block-card');
  assert.equal(typeof parentId, 'string');

  const { blockId: firstCallout } = await ui.createAnchoredChild(parentId, 'symmetric');
  await ui.waitForCallouts(parentId, 1);
  const { blockId: secondCallout } = await ui.createAnchoredChild(parentId, 'eigenvalues');
  await ui.waitForCallouts(parentId, 2);

  const shortDirect = 'm3b2c-short-direct';
  const longDirect = 'm3b2c-long-direct';
  await ui.createDirectChild(parentId, shortDirect, 'R');
  await ui.createDirectChild(
    parentId,
    longDirect,
    'A deliberately long wrapped direct child whose card needs the full right column width.',
  );
  await ui.harness.waitLayout({ blocks: 11, arrows: 7 });

  const canonical = await ui.structure();
  assert.equal(
    Object.values(canonical.branches).filter(
      (branch) => branch.source.blockId === parentId && branch.source.anchorId !== undefined,
    ).length,
    2,
    'the canonical document keeps two anchored primary branches',
  );
  assert.equal(
    Object.values(canonical.branches).filter(
      (branch) => branch.source.blockId === parentId && branch.source.anchorId === undefined,
    ).length,
    2,
    'the direct children stay normal primary branches',
  );
  return { parentId, parentCard, firstCallout, secondCallout, shortDirect, longDirect };
}
