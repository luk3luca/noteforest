import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addTopLevelBlock, textDoc } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3h5-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const { isolated, applyCommand, structure, seedDemo, openBlockMenu, chooseMenuItem } = ui;
let page;

const LEAF_ID = 'm3h5-leaf';
const SOURCE_ID = 'm3h5-source';
const REFERENCE_ID = 'm3h5-reference';
const LEAF_TEXT = 'Leaf with external reference';
const SOURCE_TEXT = 'External reference source';

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

async function linkReference(sourceId, targetId) {
  await applyCommand({
    type: 'branch.create',
    branchId: REFERENCE_ID,
    sourceBlockId: sourceId,
    targetBlockId: targetId,
    role: 'reference',
  });
  await page.waitForFunction(
    (id) => {
      const current = window.__noteforestTest.structure();
      return current?.branches?.[id]?.role === 'reference';
    },
    REFERENCE_ID,
    { timeout: 10000 },
  );
}

async function selectBlock(blockId) {
  await page.locator(`.nf-editor[data-active="true"] [data-block-card="${blockId}"]`).click();
  await h.waitSelected(blockId);
}

async function pressDeleteShortcut() {
  await page.keyboard.press('Meta+Backspace');
}

async function waitForDeleteDialog() {
  const dialog = page.getByRole('dialog', { name: 'Delete block' });
  await dialog.waitFor();
  return dialog;
}

/** Record any dialog mount so a fast-path delete can prove none appeared. */
async function recordDialogs() {
  await page.evaluate(() => {
    window.__nfDeleteDialogs = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches('.nf-dialog') || node.querySelector('.nf-dialog') !== null) {
            window.__nfDeleteDialogs.push(node.textContent?.slice(0, 80) ?? 'dialog');
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__nfDeleteObserver = observer;
  });
}

async function recordedDialogs() {
  return page.evaluate(() => window.__nfDeleteDialogs ?? []);
}

describe('NoteForest M3h5 leaf delete disclosure', () => {
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

  it('discloses external references before a keyboard leaf delete, cancels cleanly, and undoes exactly', async () => {
    await launch(isolated('leaf-references'));
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const seeded = await structure();
    const chapterId = seeded.chapters[0].id;
    const chapterTitle = seeded.chapters[0].title ?? 'Untitled chapter';
    await addTopLevelBlock(ui, SOURCE_ID, textDoc(SOURCE_TEXT));
    await addTopLevelBlock(ui, LEAF_ID, textDoc(LEAF_TEXT));
    await h.waitLayout({ blocks: 9, arrows: 3 });
    await linkReference(SOURCE_ID, LEAF_ID);
    await page.locator(`[data-referenced-by-branch="${REFERENCE_ID}"]`).waitFor();

    const beforeDelete = await structure();
    assert.equal(beforeDelete.branches[REFERENCE_ID].role, 'reference');
    assert.equal(beforeDelete.branches[REFERENCE_ID].source.blockId, SOURCE_ID);
    assert.equal(beforeDelete.branches[REFERENCE_ID].targetBlockId, LEAF_ID);

    await selectBlock(LEAF_ID);
    await pressDeleteShortcut();

    const dialog = await waitForDeleteDialog();
    await page.locator('[data-delete-references="true"]').waitFor();
    assert.equal(
      await page.locator('[data-delete-reference]').count(),
      1,
      'the leaf discloses its one external reference',
    );
    const row = page.locator(`[data-delete-reference="${REFERENCE_ID}"]`);
    await row.waitFor();
    assert.equal(await row.getAttribute('data-delete-reference-source'), SOURCE_ID);
    assert.equal(await row.getAttribute('data-delete-reference-target'), LEAF_ID);
    assert.equal(await row.getAttribute('data-delete-reference-chapter'), chapterId);
    assert.equal(await row.getAttribute('data-delete-reference-role'), 'reference');
    const rowText = (await row.textContent()) ?? '';
    assert.ok(rowText.includes(SOURCE_TEXT), 'the reference source is named');
    assert.ok(rowText.includes(chapterTitle), 'the source chapter is named');
    assert.match(rowText, /Reference/);
    assert.ok(rowText.includes(LEAF_TEXT), 'the deleted target is named');
    const sectionText = (await page.locator('[data-delete-references="true"]').textContent()) ?? '';
    assert.match(sectionText, /will be removed/);
    assert.match(sectionText, /The source blocks stay/);
    assert.equal(
      await page.locator('input[name="delete-mode"]').count(),
      0,
      'a leaf shows no descendant choice',
    );
    assert.match((await dialog.textContent()) ?? '', /content are removed/);
    assert.deepEqual(await structure(), beforeDelete, 'opening the disclosure mutates nothing');

    await mkdir(artifactsPath('m3h5'), { recursive: true });
    await h.screenshot(artifactsPath('m3h5', 'leaf-delete-disclosure-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Cancel mutates nothing and keeps the selection, so the same shortcut
    // reopens the disclosure instead of deleting the block.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(await structure(), beforeDelete, 'cancel mutates nothing');
    await h.waitSelected(LEAF_ID);
    assert.equal(
      await page.locator(`.nf-editor[data-active="true"] [data-block-card="${LEAF_ID}"]`).count(),
      1,
    );
    await pressDeleteShortcut();
    await waitForDeleteDialog();
    await page.locator('[data-delete-references="true"]').waitFor();
    assert.deepEqual(await structure(), beforeDelete, 'the reopened disclosure mutates nothing');

    // Confirm uses the existing core delete: the leaf and its incoming
    // reference edge disappear, the source block stays.
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await h.waitCanonicalBlockCount(8);
    const afterDelete = await structure();
    assert.equal(afterDelete.blocks[LEAF_ID], undefined, 'the leaf is deleted');
    assert.equal(afterDelete.branches[REFERENCE_ID], undefined, 'the reference edge is deleted');
    assert.ok(afterDelete.blocks[SOURCE_ID] !== undefined, 'the reference source stays');
    assert.equal(await page.locator(`[data-block-card="${LEAF_ID}"]`).count(), 0);
    assert.equal(await page.locator(`[data-see-also-branch="${REFERENCE_ID}"]`).count(), 0);

    // One undo restores the exact graph, including the reference edge.
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      ({ leafId, branchId }) => {
        const current = window.__noteforestTest.structure();
        return (
          current?.blocks?.[leafId] !== undefined && current?.branches?.[branchId] !== undefined
        );
      },
      { leafId: LEAF_ID, branchId: REFERENCE_ID },
      { timeout: 10000 },
    );
    assert.deepEqual(await structure(), beforeDelete, 'one undo restores the exact graph');
    await page.locator(`[data-referenced-by-branch="${REFERENCE_ID}"]`).waitFor();

    // The leaf block menu path reuses the same disclosure component and rows.
    await openBlockMenu(LEAF_ID);
    await chooseMenuItem(/Delete block/);
    await waitForDeleteDialog();
    await page.locator('[data-delete-references="true"]').waitFor();
    assert.equal(await page.locator('[data-delete-reference]').count(), 1);
    assert.equal(await page.locator(`[data-delete-reference="${REFERENCE_ID}"]`).count(), 1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete block' }).waitFor({ state: 'detached' });
    assert.deepEqual(await structure(), beforeDelete, 'menu cancel mutates nothing');

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });

  it('keeps the fast path for a leaf without external references', async () => {
    await launch(isolated('leaf-fast-path'));
    await h.setWindowSize(1440, 900);
    await seedDemo();

    await addTopLevelBlock(ui, LEAF_ID, textDoc('Plain leaf'));
    await h.waitLayout({ blocks: 8, arrows: 3 });
    const beforeDelete = await structure();
    await recordDialogs();

    await selectBlock(LEAF_ID);
    await pressDeleteShortcut();
    await h.waitCanonicalBlockCount(7);
    await h.waitBlockCount(7);

    assert.deepEqual(await recordedDialogs(), [], 'no delete dialog was mounted');
    assert.equal(
      await page.getByRole('dialog', { name: 'Delete block' }).count(),
      0,
      'the fast path shows no confirmation',
    );
    const afterDelete = await structure();
    assert.equal(afterDelete.blocks[LEAF_ID], undefined, 'the bare leaf is deleted');
    assert.equal(
      Object.keys(afterDelete.branches).length,
      Object.keys(beforeDelete.branches).length,
      'no reference edge existed or changed',
    );

    await mkdir(artifactsPath('m3h5'), { recursive: true });
    await h.screenshot(artifactsPath('m3h5', 'leaf-delete-fast-path-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (leafId) => window.__noteforestTest.structure()?.blocks?.[leafId] !== undefined,
      LEAF_ID,
      { timeout: 10000 },
    );
    assert.deepEqual(await structure(), beforeDelete, 'one undo restores the bare leaf');

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });
});
