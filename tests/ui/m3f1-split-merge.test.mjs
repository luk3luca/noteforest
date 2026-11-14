import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addTopLevelBlock } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3f1-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const { isolated, applyCommand, structure, openBlockMenuFromGutter } = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

async function closeMenu() {
  await page.keyboard.press('Escape');
  await page.getByRole('menu').waitFor({ state: 'hidden' });
}

async function focusBlock(blockId) {
  await openBlockMenuFromGutter(blockId);
  await page.getByRole('menuitem', { name: 'Edit block', exact: true }).click();
  await page.getByRole('menu').waitFor({ state: 'hidden' });
  await page.waitForFunction(
    (expected) => window.__noteforestTest.caretLocation()?.blockId === expected,
    blockId,
    { timeout: 10000 },
  );
}

async function moveCaretRight(characters) {
  for (let index = 0; index < characters; index += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.waitForFunction(
    (expected) => window.__noteforestTest.caretLocation()?.offset === expected,
    characters,
    { timeout: 10000 },
  );
}

async function waitForCallout(parentId, quote) {
  await page.waitForSelector(
    `[data-callout-lane="${parentId}"] [data-callout-row="true"] .nf-callout-quote[data-anchor-quote="${quote}"]`,
    { state: 'visible', timeout: 10000 },
  );
}

describe('NoteForest M3f1 split/merge menu', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('splits and merges an anchored block from the menu, moves the callout, and undoes', async () => {
    await launch(isolated('split-merge'));
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();

    const document = await structure();
    const chapterId = document.chapters[0]?.id;
    assert.equal(typeof chapterId, 'string');
    const firstDemoId = document.chapters[0]?.topLevelBlockIds[0];
    assert.equal(typeof firstDemoId, 'string');

    const sourceId = 'm3f1-split-source';
    const targetId = 'm3f1-anchor-target';
    await addTopLevelBlock(ui, sourceId, {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'Alpha anchor omega' }],
        },
      ],
    });
    await addTopLevelBlock(ui, targetId, {
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Anchored target' }] }],
    });

    const anchored = await applyCommand({
      type: 'anchor.create',
      anchorId: 'm3f1-anchor-omega',
      blockId: sourceId,
      kind: 'text',
      selector: { kind: 'text', quote: 'omega', occurrenceHint: 1 },
      binding: {
        kind: 'text',
        ranges: [{ nodePath: [0, 0], start: 13, end: 18 }],
      },
    });
    assert.equal(anchored.ok, true);
    await applyCommand({
      type: 'branch.create',
      sourceBlockId: sourceId,
      sourceAnchorId: 'm3f1-anchor-omega',
      targetBlockId: targetId,
      role: 'primary',
    });
    await waitForCallout(sourceId, 'omega');
    await h.waitCanonicalBlockCount(9);
    await h.waitBlockCount(9);
    // With the caret in a different block, the menu explains why split is
    // unavailable instead of silently doing nothing.
    await focusBlock(firstDemoId);
    await openBlockMenuFromGutter(sourceId);
    const disabledSplit = page.getByRole('menuitem', { name: /^Split at caret/ });
    assert.equal(
      await disabledSplit.getAttribute('aria-disabled'),
      'true',
      'split is disabled when the caret is in another block',
    );
    assert.match(
      (await disabledSplit.textContent()) ?? '',
      /caret is in a different block/,
    );
    await closeMenu();

    // Place the caret after "Alpha " and split from the block menu.
    const beforeSplit = await structure();
    await focusBlock(sourceId);
    await moveCaretRight(6);
    const split = page.getByRole('menuitem', { name: 'Split at caret', exact: true });
    await openBlockMenuFromGutter(sourceId);
    assert.equal(await split.getAttribute('aria-disabled'), null, 'split is enabled at the caret');
    await split.click();
    await h.waitCanonicalBlockCount(10);
    await h.waitBlockCount(10);

    const splitState = await structure();
    const newBlockId = Object.keys(splitState.blocks).find(
      (id) => beforeSplit.blocks[id] === undefined,
    );
    assert.equal(typeof newBlockId, 'string', 'split created a new block');
    assert.equal(splitState.chapters[0]?.topLevelBlockIds.at(-2), sourceId);
    assert.equal(splitState.chapters[0]?.topLevelBlockIds.at(-1), newBlockId);
    assert.equal(splitState.anchors['m3f1-anchor-omega']?.blockId, newBlockId);
    const anchoredBranch = Object.values(splitState.branches).find(
      (branch) => branch.source.anchorId === 'm3f1-anchor-omega',
    );
    assert.equal(anchoredBranch?.source.blockId, newBlockId);
    assert.equal(anchoredBranch?.targetBlockId, targetId);
    assert.equal(anchoredBranch?.role, 'primary');
    await h.waitSelected(newBlockId);
    await waitForCallout(newBlockId, 'omega');
    assert.equal(
      await page.locator(`[data-callout-lane="${sourceId}"]`).count(),
      0,
      'the callout lane left the original block',
    );

    await h.waitLayout({ blocks: 10 });
    await mkdir(artifactsPath('m3f1'), { recursive: true });
    await h.screenshot(artifactsPath('m3f1', 'split-merge-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Merge the new block back into its previous top-level sibling.
    await openBlockMenuFromGutter(newBlockId);
    const merge = page.getByRole('menuitem', { name: 'Merge with previous', exact: true });
    assert.equal(await merge.getAttribute('aria-disabled'), null, 'merge is legal');
    await merge.click();
    await h.waitCanonicalBlockCount(9);
    await h.waitBlockCount(9);
    await page.waitForSelector(`[data-block-card="${newBlockId}"]`, { state: 'detached' });
    const merged = await structure();
    assert.equal(merged.blocks[sourceId] !== undefined, true);
    assert.equal(merged.anchors['m3f1-anchor-omega']?.blockId, sourceId);
    await h.waitSelected(sourceId);
    await waitForCallout(sourceId, 'omega');

    // One undo restores the split state: both blocks and the moved callout.
    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(10);
    await h.waitBlockCount(10);
    const undone = await structure();
    assert.equal(undone.blocks[newBlockId] !== undefined, true);
    assert.equal(undone.anchors['m3f1-anchor-omega']?.blockId, newBlockId);
    await waitForCallout(newBlockId, 'omega');
    await h.waitSaved();
  });
});
