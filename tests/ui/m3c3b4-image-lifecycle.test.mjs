import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, root } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addTopLevelBlock } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3c3b4-ui');
const screenshotDir = artifactsPath('m3c3b4');
const forestFixture = resolve(root, 'fixtures/assets/forest.png');
const chartFixture = resolve(root, 'fixtures/assets/chart.png');
const wideFixture = resolve(root, 'fixtures/assets/wide.png');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(overrides = {}) {
  page = await ui.launch({ NOTEFOREST_E2E_HIDDEN: '0', ...overrides });
}

async function mockImagePicker(filePath) {
  await h.app.evaluate(({ dialog }, selectedPath) => {
    globalThis.__nfImagePickerCalls = [];
    dialog.showOpenDialog = async (_window, options) => {
      globalThis.__nfImagePickerCalls.push(options);
      return { canceled: false, filePaths: [selectedPath] };
    };
  }, filePath);
}

async function waitForImage(blockId, index = 0) {
  await page.waitForFunction(
    ({ id, position }) => {
      const images = document.querySelectorAll(
        `.nf-editor[data-active="true"] [data-block-card="${id}"] .nf-image-el`,
      );
      const image = images[position];
      return image !== undefined && image.complete && image.naturalWidth > 0;
    },
    { id: blockId, position: index },
    { timeout: 10000 },
  );
}

async function assets() {
  return page.evaluate(() => window.__noteforestTest.assets());
}

function imageNodes(structure, blockId) {
  const nodes = [];
  const walk = (node) => {
    if (node.type === 'image') {
      nodes.push(node);
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(structure.blocks[blockId]?.content ?? { type: 'doc', children: [] });
  return nodes;
}

async function addImageBlock(blockId, fixture) {
  await addTopLevelBlock(ui, blockId, {
    type: 'doc',
    children: [{ type: 'paragraph' }],
  });
  await mockImagePicker(fixture);
  await ui.openBlockMenuFromGutter(blockId);
  await ui.chooseMenuItem('Insert image…');
  await waitForImage(blockId, 0);
  await h.waitSaved();
}

async function appendImage(blockId, fixture, index) {
  await mockImagePicker(fixture);
  await ui.openBlockMenuFromGutter(blockId);
  await ui.chooseMenuItem('Insert image…');
  await waitForImage(blockId, index);
  await h.waitSaved();
}

async function clickImage(blockId, index = 0) {
  const image = page.locator(`[data-block-card="${blockId}"] .nf-image-el`).nth(index);
  await image.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await image.click();
}

async function focusBlock(blockId) {
  const card = page.locator(`[data-block-card="${blockId}"]`);
  await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  // A structural command rebuilds the editor and restores its previous focus;
  // wait for that save/rebuild before moving the caret to this block.
  await h.waitSaved();
  await card.locator('.nf-block-prose').click({ position: { x: 2, y: 8 } });
  await h.waitSelected(blockId);
}

async function createSecondDocument(title) {
  const result = await page.evaluate(async (documentTitle) => {
    const created = await window.noteforest.createDocument({ title: documentTitle });
    if (!created.ok) return created;
    await window.__noteforestTest.openPath(created.snapshot.packagePath);
    return { ok: true, packagePath: created.snapshot.packagePath };
  }, title);
  assert.equal(result.ok, true, result.message ?? 'second document created');
  await page.getByRole('tab', { name: new RegExp(title) }).waitFor({ timeout: 10000 });
  return result.packagePath;
}

async function switchTab(name) {
  await page.getByRole('tab', { name: new RegExp(name) }).click();
  await page.waitForFunction(
    (expected) => window.__noteforestTest.state().tabs.some((tab) => new RegExp(expected).test(tab.title)),
    name,
    { timeout: 10000 },
  );
}

async function writeImageHtmlToClipboard(assetId, alt) {
  await h.app.evaluate(
    async ({ clipboard, ClipboardItem }, payload) => {
      const html = `<img src="noteforest-asset://asset/${payload.assetId}" data-asset-id="${payload.assetId}" alt="${payload.alt}">`;
      if (typeof ClipboardItem === 'function') {
        await clipboard.write([
          new ClipboardItem({
            'text/plain': payload.alt,
            'text/html': html,
          }),
        ]);
        return;
      }
      await clipboard.write({ text: payload.alt, html });
    },
    { assetId, alt },
  );
}

describe('NoteForest M3c3b4 image UX and asset lifecycle', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('targets the selected image in a two-image block from the block menu and the inline image menu', async () => {
    const env = ui.isolated('image-multi-action');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    const blockId = 'm3c3b4-two-images';
    await addImageBlock(blockId, forestFixture);
    await appendImage(blockId, chartFixture, 1);

    const initial = await ui.structure();
    const images = imageNodes(initial, blockId);
    assert.equal(images.length, 2);
    assert.equal(images[0].attrs.alt, 'forest');
    assert.equal(images[1].attrs.alt, 'chart');
    const firstAsset = images[0].attrs.assetId;
    const secondAsset = images[1].attrs.assetId;
    assert.notEqual(firstAsset, secondAsset);

    // The block menu prefixes every image action with the image it targets; it
    // never silently acts on image 1.
    await ui.openBlockMenuFromGutter(blockId);
    const menuText = await page.locator('.nf-menu').innerText();
    assert.match(menuText, /Image 1 \(forest\): Add image region…/);
    assert.match(menuText, /Image 2 \(chart\): Add image region…/);
    assert.match(menuText, /Image 2 \(chart\): Replace image…/);
    assert.match(menuText, /Image 2 \(chart\): Edit image alt text…/);

    // Replace image 2 only; image 1 keeps its asset.
    await mockImagePicker(wideFixture);
    await ui.chooseMenuItem('Image 2 (chart): Replace image…');
    await page.waitForFunction(
      ({ id, previous }) => {
        const structure = window.__noteforestTest.structure();
        const nodes = [];
        const walk = (node) => {
          if (node.type === 'image') {
            nodes.push(node);
            return;
          }
          for (const child of node.children ?? []) walk(child);
        };
        walk(structure.blocks[id]?.content ?? { type: 'doc', children: [] });
        return nodes[1] !== undefined && nodes[1].attrs.assetId !== previous;
      },
      { id: blockId, previous: secondAsset },
      { timeout: 10000 },
    );
    await h.waitSaved();
    const replaced = await ui.structure();
    const afterReplace = imageNodes(replaced, blockId);
    assert.equal(afterReplace[0].attrs.assetId, firstAsset, 'image 1 is untouched');
    assert.notEqual(afterReplace[1].attrs.assetId, secondAsset, 'image 2 was replaced');
    assert.equal(afterReplace[1].attrs.alt, 'chart', 'alt survives replacement');

    // Edit image 1 alt text only.
    await ui.openBlockMenuFromGutter(blockId);
    await ui.chooseMenuItem('Image 1 (forest): Edit image alt text…');
    await page.locator('.nf-dialog').getByRole('textbox', { name: 'Alt text' }).fill(
      'Forest cover',
    );
    await page.locator('.nf-dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await h.waitSaved();
    const afterAlt = imageNodes(await ui.structure(), blockId);
    assert.equal(afterAlt[0].attrs.alt, 'Forest cover');
    assert.equal(afterAlt[1].attrs.alt, 'chart');

    // The inline image surface targets the image it belongs to (path [1]).
    await page
      .locator(`[data-block-card="${blockId}"] [data-image-action="menu"][data-image-action-path="1"]`)
      .click();
    // A healthy, available asset keeps region authoring enabled.
    assert.equal(
      await page
        .getByRole('menuitem', { name: /^Add image region…$/ })
        .getAttribute('aria-disabled'),
      null,
      'region authoring is enabled for an available asset',
    );
    await ui.chooseMenuItem('Edit image alt text…');
    await page.locator('.nf-dialog').getByRole('textbox', { name: 'Alt text' }).fill(
      'Chart 2026',
    );
    await page.locator('.nf-dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await h.waitSaved();
    const afterInlineAlt = imageNodes(await ui.structure(), blockId);
    assert.equal(afterInlineAlt[0].attrs.alt, 'Forest cover');
    assert.equal(afterInlineAlt[1].attrs.alt, 'Chart 2026');

    // The inline Replace action targets the clicked node, not the first image.
    await mockImagePicker(chartFixture);
    await page
      .locator(`[data-block-card="${blockId}"] [data-image-action="menu"][data-image-action-path="1"]`)
      .click();
    await ui.chooseMenuItem('Replace image…');
    await page.waitForFunction(
      ({ id, previous }) => {
        const structure = window.__noteforestTest.structure();
        const nodes = [];
        const walk = (node) => {
          if (node.type === 'image') {
            nodes.push(node);
            return;
          }
          for (const child of node.children ?? []) walk(child);
        };
        walk(structure.blocks[id]?.content ?? { type: 'doc', children: [] });
        return nodes[1] !== undefined && nodes[1].attrs.assetId !== previous;
      },
      { id: blockId, previous: afterInlineAlt[1].attrs.assetId },
      { timeout: 10000 },
    );
    await h.waitSaved();
    const final = imageNodes(await ui.structure(), blockId);
    assert.equal(final[0].attrs.assetId, firstAsset);
    assert.notEqual(final[1].attrs.assetId, afterInlineAlt[1].attrs.assetId);
    assert.notEqual(final[1].attrs.assetId, firstAsset);

    // The reference guard refuses to delete an asset a live image still names.
    const removal = await page.evaluate(async (assetId) => {
      return window.__noteforestTest.applyStructural({ type: 'asset.remove', assetId });
    }, firstAsset);
    assert.equal(removal.ok, false);
    assert.match(removal.message, /still referenced by/);
    await waitForImage(blockId, 0);

    await page
      .locator(`[data-block-card="${blockId}"]`)
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await h.screenshot(resolve(screenshotDir, 'multi-image-actions-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('numbers visible image markers contiguously after an idle anchor is hidden', async () => {
    const env = ui.isolated('image-marker-numbering');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    const blockId = 'm3c3b4-marker-numbering';
    await addImageBlock(blockId, forestFixture);
    const structure = await ui.structure();
    const assetId = imageNodes(structure, blockId)[0].attrs.assetId;
    const rects = [
      { x: 0.08, y: 0.1, width: 0.2, height: 0.22 },
      { x: 0.36, y: 0.12, width: 0.22, height: 0.24 },
      { x: 0.66, y: 0.14, width: 0.2, height: 0.22 },
    ];
    for (const rect of rects) {
      await ui.applyCommand({
        type: 'branch.createFromSelection',
        blockId,
        kind: 'image',
        selector: {
          kind: 'image',
          assetId,
          rect,
          crop: { x: 0, y: 0, width: 1, height: 1 },
          point: false,
          label: 'forest',
        },
        binding: {
          kind: 'image',
          nodePath: [0],
          assetId,
          rect,
          crop: { x: 0, y: 0, width: 1, height: 1 },
          point: false,
        },
        target: { kind: 'new' },
        role: 'primary',
      });
    }
    await page.waitForFunction(
      (id) =>
        document.querySelectorAll(`[data-block-card="${id}"] [data-image-region-marker]`).length === 3,
      blockId,
      { timeout: 10000 },
    );
    const numbers = async () =>
      page
        .locator(`[data-block-card="${blockId}"] [data-image-region-marker]`)
        .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
    assert.deepEqual(await numbers(), ['1', '2', '3']);

    // Delete the branch of the middle anchor: its marker is idle and hidden,
    // and the remaining visible markers renumber 1..2 instead of 1,3.
    const withBranches = await ui.structure();
    const branches = Object.values(withBranches.branches)
      .filter((branch) => branch.source.blockId === blockId && branch.source.anchorId !== undefined)
      .sort((left, right) => left.order.localeCompare(right.order));
    assert.equal(branches.length, 3);
    const middle = branches[1];
    assert.ok(middle);
    await ui.applyCommand({
      type: 'branch.delete',
      branchId: middle.id,
      targetHandling: { kind: 'delete-subtree' },
    });
    await page.waitForFunction(
      (id) =>
        document.querySelectorAll(`[data-block-card="${id}"] [data-image-region-marker]`).length === 2,
      blockId,
      { timeout: 10000 },
    );
    assert.deepEqual(await numbers(), ['1', '2']);
    const afterDelete = await ui.structure();
    assert.equal(afterDelete.anchors[middle.source.anchorId] !== undefined, true);

    await page
      .locator(`[data-block-card="${blockId}"]`)
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await h.screenshot(resolve(screenshotDir, 'marker-numbering-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('pastes images in the same document and copies asset bytes across documents without a dangling id', async () => {
    const env = ui.isolated('image-clipboard');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    const sourceBlock = 'm3c3b4-clipboard-source';
    await addImageBlock(sourceBlock, forestFixture);
    const sourceDocument = (await h.state()).activeTab;
    assert.ok(sourceDocument);
    const sourceAssetId = imageNodes(await ui.structure(), sourceBlock)[0].attrs.assetId;

    // Same-document paste keeps the existing record; no second asset is added.
    await clickImage(sourceBlock, 0);
    await page.keyboard.press('Meta+C');
    const sameTarget = 'm3c3b4-clipboard-same';
    await addTopLevelBlock(ui, sameTarget, {
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Paste here' }] }],
    });
    await focusBlock(sameTarget);
    await page.keyboard.press('Meta+V');
    await page.waitForSelector(`[data-block-card="${sameTarget}"] [data-image-node]`, {
      timeout: 10000,
    });
    await h.waitSaved();
    const sameDocument = await ui.structure();
    assert.equal(imageNodes(sameDocument, sameTarget).length, 1);
    assert.equal(imageNodes(sameDocument, sameTarget)[0].attrs.assetId, sourceAssetId);
    const sameAssets = await assets();
    assert.equal(Object.keys(sameAssets).length, 1, 'same-document paste deduplicates');

    // Cross-document paste copies bytes and records into the destination.
    const targetDocument = await createSecondDocument('Cross paste target');
    const targetBlock = 'm3c3b4-clipboard-target';
    await addTopLevelBlock(ui, targetBlock, {
      type: 'doc',
      children: [{ type: 'paragraph' }],
    });
    assert.equal((await assets())[sourceAssetId], undefined);

    await switchTab('Linear algebra');
    await clickImage(sourceBlock, 0);
    await page.keyboard.press('Meta+C');
    await switchTab('Cross paste target');
    await focusBlock(targetBlock);
    await page.keyboard.press('Meta+V');
    await page.waitForSelector(`[data-block-card="${targetBlock}"] [data-image-node]`, {
      timeout: 10000,
    });
    await waitForImage(targetBlock, 0);
    await h.waitSaved();
    const pasted = await ui.structure();
    const pastedImages = imageNodes(pasted, targetBlock);
    assert.equal(pastedImages.length, 1);
    assert.equal(pastedImages[0].attrs.assetId, sourceAssetId);
    assert.equal(pastedImages[0].attrs.unavailable, undefined);
    const persistedAsset = (await assets())[sourceAssetId];
    assert.ok(persistedAsset, 'the destination document records the copied asset');
    const assetPath = resolve(targetDocument, 'assets', sourceAssetId);
    const stored = await stat(assetPath);
    assert.equal(stored.size, persistedAsset.bytes);
    assert.deepEqual(
      await readFile(assetPath),
      await readFile(forestFixture),
      'the destination package holds the exact bytes',
    );
    const onDisk = JSON.parse(
      await readFile(resolve(targetDocument, 'document.json'), 'utf8'),
    );
    assert.ok(onDisk.assets[sourceAssetId], 'the saved destination document has the record');
    await page
      .locator(`[data-block-card="${targetBlock}"]`)
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await h.screenshot(resolve(screenshotDir, 'cross-document-paste-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Unknown source: a labeled placeholder without any assetId, not a
    // dangling reference to the source package.
    const unknownId = 'f'.repeat(64);
    const fallbackBlock = 'm3c3b4-clipboard-fallback';
    await addTopLevelBlock(ui, fallbackBlock, {
      type: 'doc',
      children: [{ type: 'paragraph' }],
    });
    await writeImageHtmlToClipboard(unknownId, 'Ghost image');
    await focusBlock(fallbackBlock);
    await page.keyboard.press('Meta+V');
    await page.waitForSelector(
      `[data-block-card="${fallbackBlock}"] [data-image-unavailable="cross-document-copy"]`,
      { timeout: 10000 },
    );
    const placeholder = page.locator(
      `[data-block-card="${fallbackBlock}"] [data-image-missing="true"]`,
    );
    assert.match(await placeholder.innerText(), /Image not copied/);
    assert.match(await placeholder.innerText(), /Ghost image/);
    await h.waitSaved();
    const fallback = await ui.structure();
    const fallbackImages = imageNodes(fallback, fallbackBlock);
    assert.equal(fallbackImages.length, 1);
    assert.equal(fallbackImages[0].attrs.assetId, undefined, 'no dangling assetId');
    assert.equal(fallbackImages[0].attrs.unavailable, 'cross-document-copy');
    assert.equal(fallbackImages[0].attrs.alt, 'Ghost image');
    assert.equal((await assets())[unknownId], undefined);
    await h.screenshot(resolve(screenshotDir, 'cross-document-placeholder-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });
});
