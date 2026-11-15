import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, root } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addTopLevelBlock } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3c3b2-ui');
const screenshotDir = artifactsPath('m3c3b2');
const forestFixture = resolve(root, 'fixtures/assets/forest.png');
const chartFixture = resolve(root, 'fixtures/assets/chart.png');
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

async function addImageBlock(blockId) {
  await addTopLevelBlock(ui, blockId, {
    type: 'doc',
    children: [{ type: 'paragraph' }],
  });
  await ui.openBlockMenuFromGutter(blockId);
  await ui.chooseMenuItem('Insert image…');
  await page.waitForSelector(`[data-block-card="${blockId}"] [data-image-node]`, {
    timeout: 10000,
  });
  await page.waitForFunction(
    (id) => {
      const image = document.querySelector(
        `.nf-editor[data-active="true"] [data-block-card="${id}"] .nf-image-el`,
      );
      return image !== null && image.complete && image.naturalWidth > 0;
    },
    blockId,
    { timeout: 10000 },
  );
  await h.waitSaved();
}

function imageBlock(structure, blockId) {
  const node = structure.blocks[blockId]?.content?.children?.find(
    (child) => child.type === 'image',
  );
  assert.ok(node, `block ${blockId} contains an image`);
  return node;
}

function imageAnchors(structure, blockId) {
  return Object.values(structure.anchors).filter(
    (anchor) => anchor.blockId === blockId && anchor.kind === 'image',
  );
}

async function startAuthoring(blockId, label) {
  await ui.openBlockMenuFromGutter(blockId);
  await ui.chooseMenuItem(label);
  await page.waitForSelector(
    `[data-block-card="${blockId}"] [data-image-draw-layer]`,
    { timeout: 10000 },
  );
}

async function frameBox(blockId) {
  const frame = page.locator(`[data-block-card="${blockId}"] .nf-image-frame`);
  await frame.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.waitForFunction(
    (id) => {
      const element = document.querySelector(
        `.nf-editor[data-active="true"] [data-block-card="${id}"] .nf-image-frame`,
      );
      if (element === null) return false;
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    },
    blockId,
    { timeout: 10000 },
  );
  const box = await frame.boundingBox();
  assert.ok(box !== null, 'image frame is measurable');
  return box;
}

async function dragOnImage(blockId, from, to, { alt = false, steps = 6 } = {}) {
  const box = await frameBox(blockId);
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.move(box.x + box.width * from.x, box.y + box.height * from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to.x, box.y + box.height * to.y, { steps });
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
}

async function clickImage(blockId, at) {
  const box = await frameBox(blockId);
  await page.mouse.click(box.x + box.width * at.x, box.y + box.height * at.y);
}

async function commitPending(blockId, kind) {
  const button = page.locator(
    `[data-block-card="${blockId}"] [data-image-authoring-action="branch"][data-image-authoring-kind="${kind}"]`,
  );
  await button.waitFor({ state: 'visible', timeout: 10000 });
  await button.click();
}

async function waitForImageAnchorCount(blockId, count) {
  await page.waitForFunction(
    ({ blockId: id, expected }) => {
      const structure = window.__noteforestTest.structure();
      const anchors = Object.values(structure.anchors).filter(
        (anchor) => anchor.blockId === id && anchor.kind === 'image',
      );
      return anchors.length === expected;
    },
    { blockId, expected: count },
    { timeout: 10000 },
  );
}

async function regionRatio(blockId, anchorId) {
  return page.evaluate(
    ({ blockId: id, anchorId: expected }) => {
      const card = document.querySelector(
        `.nf-editor[data-active="true"] [data-block-card="${id}"]`,
      );
      const image = card?.querySelector('.nf-image-el');
      const region = card?.querySelector(`[data-image-region-anchor="${expected}"]`);
      if (image === null || image === undefined || region === null || region === undefined) {
        return null;
      }
      const imageRect = image.getBoundingClientRect();
      const regionRect = region.getBoundingClientRect();
      return {
        x: (regionRect.left - imageRect.left) / imageRect.width,
        y: (regionRect.top - imageRect.top) / imageRect.height,
        width: regionRect.width / imageRect.width,
        height: regionRect.height / imageRect.height,
      };
    },
    { blockId, anchorId },
  );
}

describe('NoteForest M3c3b2 image region and point anchors', () => {
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

  it('creates regions and a point, keeps markers/callouts through resize and reload, undo/redo exactly', async () => {
    const env = ui.isolated('image-anchors');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    await mockImagePicker(forestFixture);
    const blockId = 'm3c3b2-region';
    await addImageBlock(blockId);
    const village = await ui.structure();
    const assetId = imageBlock(village, blockId).attrs.assetId;

    // Region 1: the block menu opens authoring; the drag only becomes a draft.
    await startAuthoring(blockId, 'Add image region…');
    await dragOnImage(blockId, { x: 0.14, y: 0.2 }, { x: 0.46, y: 0.56 });
    await page.waitForSelector(`[data-block-card="${blockId}"] [data-image-pending="region"]`);
    const pendingBranch = page.locator(
      `[data-block-card="${blockId}"] [data-image-authoring-action="branch"]`,
    );
    assert.equal(
      await pendingBranch.evaluate((element) => element === document.activeElement),
      true,
      'Branch from region is the default focused action',
    );
    const beforeBranch = await ui.structure();
    assert.equal(imageAnchors(beforeBranch, blockId).length, 0, 'a draft creates no anchor');
    await commitPending(blockId, 'region');
    await waitForImageAnchorCount(blockId, 1);
    await ui.waitForCallouts(blockId, 1);

    const first = await ui.structure();
    const firstAnchor = imageAnchors(first, blockId)[0];
    assert.ok(firstAnchor, 'the first region is canonical');
    assert.equal(firstAnchor.kind, 'image');
    assert.equal(firstAnchor.selector.kind, 'image');
    assert.equal(firstAnchor.selector.assetId, assetId);
    assert.equal(firstAnchor.selector.point, false);
    assert.deepEqual(firstAnchor.selector.crop, { x: 0, y: 0, width: 1, height: 1 });
    assert.ok(firstAnchor.selector.rect.width > 0.2);
    assert.ok(firstAnchor.selector.rect.height > 0.2);
    assert.equal(firstAnchor.selector.label, 'forest');
    assert.deepEqual(imageBlock(first, blockId).attrs.anchorIds, [firstAnchor.id]);
    const firstBranch = Object.values(first.branches).find(
      (branch) => branch.source.anchorId === firstAnchor.id,
    );
    assert.ok(firstBranch, 'the region has a primary branch');
    assert.ok(first.blocks[firstBranch.targetBlockId], 'the branch target exists');

    const marker = page.locator(`[data-image-region-marker="${firstAnchor.id}"]`);
    await marker.waitFor({ state: 'visible' });
    assert.equal(await marker.innerText(), '1');
    assert.match(
      await marker.getAttribute('aria-label'),
      /Image region 1: “forest”, 1 branch/,
    );
    const chip = page.locator(`[data-block-card="${firstBranch.targetBlockId}"] [data-anchor-quote]`);
    const chipText = await chip.innerText();
    assert.match(chipText, /forest/);
    assert.match(chipText, /region/);

    // Keyboard focus on the marker selects its branch.
    await marker.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (anchorId) => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
        return runtime?.selectedAnchor?.anchorId === anchorId;
      },
      firstAnchor.id,
      { timeout: 10000 },
    );

    // Region 2 on the same image.
    await startAuthoring(blockId, 'Add image region…');
    await dragOnImage(blockId, { x: 0.55, y: 0.16 }, { x: 0.82, y: 0.38 });
    await commitPending(blockId, 'region');
    await waitForImageAnchorCount(blockId, 2);
    await ui.waitForCallouts(blockId, 2);
    const second = await ui.structure();
    const secondAnchor = imageAnchors(second, blockId).find(
      (anchor) => anchor.id !== firstAnchor.id,
    );
    assert.ok(secondAnchor);
    assert.deepEqual(
      imageBlock(second, blockId).attrs.anchorIds,
      [firstAnchor.id, secondAnchor.id].sort(),
      'anchorIds stays sorted',
    );
    assert.equal(await page.locator('[data-image-region-marker]').count(), 2);
    assert.match(
      await page.locator(`[data-image-region-marker="${secondAnchor.id}"]`).innerText(),
      /^2$/,
    );

    await h.screenshot(resolve(screenshotDir, 'region-markers-callouts-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Point via Alt-drag while the region authoring surface is active.
    await startAuthoring(blockId, 'Add image region…');
    await dragOnImage(blockId, { x: 0.35, y: 0.72 }, { x: 0.37, y: 0.74 }, { alt: true });
    await commitPending(blockId, 'point');
    await waitForImageAnchorCount(blockId, 3);
    await ui.waitForCallouts(blockId, 3);
    const withPoint = await ui.structure();
    const pointAnchor = imageAnchors(withPoint, blockId).find(
      (anchor) => anchor.selector.point === true,
    );
    assert.ok(pointAnchor, 'the Alt-drag created a point anchor');
    assert.equal(pointAnchor.selector.rect.width, 0);
    assert.equal(pointAnchor.selector.rect.height, 0);
    assert.equal(pointAnchor.selector.point, true);
    const pointMarker = page.locator(`[data-image-region-marker="${pointAnchor.id}"]`);
    assert.equal(await pointMarker.getAttribute('data-image-anchor-kind'), 'point');
    assert.equal(await pointMarker.innerText(), '3');
    const pointBranch = Object.values(withPoint.branches).find(
      (branch) => branch.source.anchorId === pointAnchor.id,
    );
    assert.ok(pointBranch);
    assert.match(
      await page.locator(`[data-block-card="${pointBranch.targetBlockId}"] [data-anchor-quote]`).innerText(),
      /point/,
    );
    // Image chips keep the ▧ glyph, label and region/point, squared.
    const pointChip = page.locator(
      `[data-block-card="${pointBranch.targetBlockId}"] .nf-callout-quote`,
    );
    assert.equal(await pointChip.getAttribute('data-anchor-kind'), 'image');
    assert.match(await pointChip.innerText(), /▧/);
    assert.equal(await pointChip.evaluate((el) => getComputedStyle(el).borderRadius), '3px');

    // Undo removes exactly the point branch, target, anchor, binding, and marker.
    const beforeUndo = await ui.structure();
    await page.keyboard.press('Meta+z');
    await waitForImageAnchorCount(blockId, 2);
    const undone = await ui.structure();
    assert.equal(undone.anchors[pointAnchor.id], undefined);
    assert.equal(undone.branches[pointBranch.id], undefined);
    assert.equal(undone.blocks[pointBranch.targetBlockId], undefined);
    assert.deepEqual(
      imageBlock(undone, blockId).attrs.anchorIds,
      [firstAnchor.id, secondAnchor.id].sort(),
    );
    await page.keyboard.press('Meta+Shift+z');
    await waitForImageAnchorCount(blockId, 3);
    const redone = await ui.structure();
    assert.deepEqual(
      Object.keys(redone.anchors).sort(),
      Object.keys(beforeUndo.anchors).sort(),
    );
    assert.equal(redone.anchors[pointAnchor.id]?.selector.point, true);

    // Display resize: the same normalized rect projects onto the smaller image.
    const originalRatio = await regionRatio(blockId, firstAnchor.id);
    assert.ok(originalRatio !== null);
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(
        Math.abs(originalRatio[key] - firstAnchor.selector.rect[key]) < 0.01,
        `${key} matches at 1440`,
      );
    }
    // Shell C is edge-to-edge: the responsive canvas padding no longer changes
    // the element width, so the window step proves the surface survives a
    // narrow resize; the zoom step below is the real image display resize.
    await h.setWindowSize(960, 800);
    await page.waitForFunction(() => window.innerWidth <= 961, undefined, {
      timeout: 10000,
    });
    await page.waitForFunction(
      (id) =>
        document.querySelector(
          `.nf-editor[data-active="true"] [data-block-card="${id}"] [data-image-node]`,
        ) !== null,
      blockId,
      { timeout: 10000 },
    );
    assert.equal(await page.locator('[data-image-region-marker]').count(), 3);
    const resizedRatio = await regionRatio(blockId, firstAnchor.id);
    assert.ok(resizedRatio !== null);
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(
        Math.abs(resizedRatio[key] - firstAnchor.selector.rect[key]) < 0.01,
        `${key} survives display resize (${resizedRatio[key]} vs ${firstAnchor.selector.rect[key]})`,
      );
    }
    assert.equal(await page.locator('[data-image-region-marker]').count(), 3);
    await h.screenshot(resolve(screenshotDir, 'point-anchor-960x800.png'));

    // A zoom change is another display resize; the normalized region still
    // projects to the same rectangle, and no canonical value changes.
    const widthAt960 = await page
      .locator(`[data-block-card="${blockId}"] .nf-image-el`)
      .evaluate((element) => element.getBoundingClientRect().width);
    await page.keyboard.press('Meta+-');
    await page.keyboard.press('Meta+-');
    await page.waitForFunction(
      ({ id, previous }) => {
        const image = document.querySelector(
          `.nf-editor[data-active="true"] [data-block-card="${id}"] .nf-image-el`,
        );
        return image !== null && image.getBoundingClientRect().width < previous - 10;
      },
      { id: blockId, previous: widthAt960 },
      { timeout: 10000 },
    );
    const zoomedRatio = await regionRatio(blockId, firstAnchor.id);
    assert.ok(zoomedRatio !== null);
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(
        Math.abs(zoomedRatio[key] - firstAnchor.selector.rect[key]) < 0.012,
        `${key} survives zoom resize`,
      );
    }
    await page.keyboard.press('Meta+0');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"] .nf-canvas')
          ?.getAttribute('data-zoom') === '100',
      undefined,
      { timeout: 10000 },
    );

    // Save/reload preserves anchors, markers, callouts, and sorted bindings.
    await h.waitSaved();
    await h.quit();
    await launch(env);
    await page.waitForSelector(`[data-block-card="${blockId}"] [data-image-node]`, {
      timeout: 20000,
    });
    await page.waitForFunction(
      (id) => {
        const image = document.querySelector(
          `.nf-editor[data-active="true"] [data-block-card="${id}"] .nf-image-el`,
        );
        return image !== null && image.complete && image.naturalWidth > 0;
      },
      blockId,
      { timeout: 10000 },
    );
    await waitForImageAnchorCount(blockId, 3);
    await ui.waitForCallouts(blockId, 3);
    assert.equal(await page.locator('[data-image-region-marker]').count(), 3);
    assert.equal(
      await page.locator(`[data-image-region-marker="${firstAnchor.id}"]`).count(),
      1,
    );
    const reloaded = await ui.structure();
    assert.deepEqual(
      imageBlock(reloaded, blockId).attrs.anchorIds,
      [firstAnchor.id, secondAnchor.id, pointAnchor.id].sort(),
    );
  });

  it('cancels a region without touching the document or revision', async () => {
    const env = ui.isolated('image-anchor-cancel');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    await mockImagePicker(forestFixture);
    const blockId = 'm3c3b2-cancel';
    await addImageBlock(blockId);
    const before = await ui.structure();
    const beforeState = await h.state();
    const beforeRuntime = beforeState.runtimes.find(
      (runtime) => runtime.packagePath === beforeState.activeTab,
    );

    await startAuthoring(blockId, 'Add image region…');
    await dragOnImage(blockId, { x: 0.2, y: 0.2 }, { x: 0.6, y: 0.6 });
    await page.waitForSelector(`[data-block-card="${blockId}"] [data-image-pending="region"]`);
    await page.keyboard.press('Escape');
    await page.waitForSelector(`[data-block-card="${blockId}"] [data-image-draw-layer]`, {
      state: 'detached',
    });
    assert.deepEqual(await ui.structure(), before, 'Escape created no anchor, branch, or target');

    // The explicit Cancel button follows the same no-mutation path.
    await startAuthoring(blockId, 'Add image region…');
    await dragOnImage(blockId, { x: 0.2, y: 0.2 }, { x: 0.6, y: 0.6 });
    await page.waitForSelector(`[data-block-card="${blockId}"] [data-image-pending="region"]`);
    await page.locator(`[data-block-card="${blockId}"] [data-image-authoring-action="cancel"]`).click();
    await page.waitForSelector(`[data-block-card="${blockId}"] [data-image-draw-layer]`, {
      state: 'detached',
    });

    assert.deepEqual(await ui.structure(), before, 'cancel created no anchor, branch, or target');
    const afterState = await h.state();
    const afterRuntime = afterState.runtimes.find(
      (runtime) => runtime.packagePath === afterState.activeTab,
    );
    assert.equal(afterRuntime.revision, beforeRuntime.revision, 'cancel did not bump the revision');
    assert.equal(await page.locator('[data-image-region-marker]').count(), 0);
  });

  it('breaks image anchors on asset replacement without deleting branches, targets, or alt, and refuses a referenced asset removal', async () => {
    const env = ui.isolated('image-anchor-broken');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    await mockImagePicker(forestFixture);
    const blockId = 'm3c3b2-broken';
    await addImageBlock(blockId);

    await beginRegion(blockId);
    await dragOnImage(blockId, { x: 0.12, y: 0.18 }, { x: 0.44, y: 0.48 });
    await commitPending(blockId, 'region');
    await waitForImageAnchorCount(blockId, 1);
    await ui.waitForCallouts(blockId, 1);
    const healthy = await ui.structure();
    const oldAnchor = imageAnchors(healthy, blockId)[0];
    const oldBranch = Object.values(healthy.branches).find(
      (branch) => branch.source.anchorId === oldAnchor.id,
    );
    assert.ok(oldBranch);
    const oldTargetId = oldBranch.targetBlockId;
    const oldAlt = imageBlock(healthy, blockId).attrs.alt;
    const oldAssetId = imageBlock(healthy, blockId).attrs.assetId;
    assert.ok(oldAlt.length > 0);

    // Replace the bytes: old anchor breaks as asset-changed.
    await mockImagePicker(chartFixture);
    await ui.openBlockMenuFromGutter(blockId);
    await ui.chooseMenuItem('Replace image…');
    await page.waitForFunction(
      ({ id, previous }) => {
        const structure = window.__noteforestTest.structure();
        const image = structure.blocks[id]?.content?.children?.find(
          (child) => child.type === 'image',
        );
        return image !== undefined && image.attrs.assetId !== previous;
      },
      { id: blockId, previous: oldAssetId },
      { timeout: 10000 },
    );
    await h.waitSaved();
    const replaced = await ui.structure();
    const chartAssetId = imageBlock(replaced, blockId).attrs.assetId;
    assert.notEqual(chartAssetId, oldAssetId);
    assert.equal(imageBlock(replaced, blockId).attrs.alt, oldAlt, 'alt text survives replacement');
    assert.equal(replaced.anchors[oldAnchor.id]?.selector.assetId, oldAssetId);
    assert.equal(replaced.branches[oldBranch.id]?.targetBlockId, oldTargetId);
    assert.equal(replaced.blocks[oldTargetId] !== undefined, true);
    await ui.waitForHealthChip(1, 0);

    await ui.openHealthFromChip();
    await page.waitForSelector(
      `[data-health-dialog="true"][data-health-row="anchor:${oldAnchor.id}"]`,
    );
    assert.equal(
      await page
        .locator('[data-health-dialog="true"] [data-health-reason="asset-changed"]')
        .count(),
      1,
    );
    assert.equal(await page.locator('[data-health-action="relink"]').count(), 0);
    assert.equal(await page.locator('[data-health-image-repair-note="true"]').count(), 1);
    assert.equal(await page.locator('[data-health-action="keep"]').count(), 0);
    // The image variant has no primary: both branch actions live behind `…`.
    assert.equal(await page.locator('[data-health-action="attach"]').count(), 0);
    assert.equal(await page.locator('[data-health-action="delete-anchor"]').count(), 0);
    await page.locator('[data-health-dialog="true"] [data-health-menu="true"]').click();
    await page.waitForSelector('[data-health-menu-list="true"]');
    assert.deepEqual(
      await page
        .locator('[data-health-menu-list="true"] [role="menuitem"]')
        .evaluateAll((items) => items.map((item) => item.getAttribute('data-menu-entry'))),
      ['health-action-attach', 'health-action-delete-anchor'],
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-health-menu-list="true"]', { state: 'detached' });
    await h.screenshot(resolve(screenshotDir, 'image-anchor-asset-changed-health-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await page.locator('[data-health-dialog="true"] [data-health-close="true"]').last().click();

    // A fresh point on the replaced image proves a second anchor shares the new
    // asset. Deleting the asset record while any image node or image anchor still
    // names it is refused: no silent placeholder, no broken anchor, no data loss.
    await startAuthoring(blockId, 'Add image point…');
    await clickImage(blockId, { x: 0.5, y: 0.5 });
    await commitPending(blockId, 'point');
    await waitForImageAnchorCount(blockId, 2);
    await ui.waitForCallouts(blockId, 2);
    const withPoint = await ui.structure();
    const pointAnchor = imageAnchors(withPoint, blockId).find(
      (anchor) => anchor.id !== oldAnchor.id,
    );
    assert.ok(pointAnchor);
    const pointBranch = Object.values(withPoint.branches).find(
      (branch) => branch.source.anchorId === pointAnchor.id,
    );
    assert.ok(pointBranch);
    const pointTargetId = pointBranch.targetBlockId;
    await h.waitSaved();
    const beforeState = await h.state();
    const beforeRevision = beforeState.runtimes.find(
      (runtime) => runtime.packagePath === beforeState.activeTab,
    )?.revision;

    const refused = await page.evaluate(
      (assetId) => window.__noteforestTest.applyStructural({ type: 'asset.remove', assetId }),
      chartAssetId,
    );
    assert.equal(refused.ok, false);
    assert.match(refused.message, /still referenced by/);
    assert.match(refused.message, /image node/);
    assert.match(refused.message, /image anchor/);
    const afterRefusal = await ui.structure();
    const afterState = await h.state();
    const afterRevision = afterState.runtimes.find(
      (runtime) => runtime.packagePath === afterState.activeTab,
    )?.revision;
    assert.equal(afterRevision, beforeRevision, 'a refused removal does not bump the revision');
    assert.equal(imageBlock(afterRefusal, blockId).attrs.assetId, chartAssetId);
    assert.equal(afterRefusal.anchors[oldAnchor.id]?.selector.assetId, oldAssetId);
    assert.equal(afterRefusal.anchors[pointAnchor.id]?.selector.assetId, chartAssetId);
    assert.equal(afterRefusal.branches[oldBranch.id]?.targetBlockId, oldTargetId);
    assert.equal(afterRefusal.branches[pointBranch.id]?.targetBlockId, pointTargetId);
    assert.equal(
      await page.evaluate((assetId) => window.__noteforestTest.assets()[assetId] !== undefined, chartAssetId),
      true,
      'the asset record is still present',
    );
    assert.equal(
      await page.locator(`[data-block-card="${blockId}"] .nf-image-el`).count(),
      1,
      'the image still renders',
    );

    // Save/reload keeps both anchors, both branches, the replaced asset, and alt.
    await h.waitSaved();
    await h.quit();
    await launch(env);
    await page.waitForSelector(`[data-block-card="${blockId}"] [data-image-node]`, {
      timeout: 20000,
    });
    await h.waitSaved();
    const reloaded = await ui.structure();
    assert.equal(reloaded.anchors[oldAnchor.id]?.selector.assetId, oldAssetId);
    assert.equal(reloaded.anchors[pointAnchor.id]?.selector.assetId, chartAssetId);
    assert.equal(reloaded.branches[oldBranch.id]?.targetBlockId, oldTargetId);
    assert.equal(reloaded.branches[pointBranch.id]?.targetBlockId, pointTargetId);
    assert.equal(imageBlock(reloaded, blockId).attrs.alt, oldAlt);

    await h.setWindowSize(960, 800);
    await page.locator(`[data-block-card="${blockId}"]`).evaluate((element) => {
      element.scrollIntoView({ block: 'center' });
    });
    await h.waitLayout();
    await h.screenshot(resolve(screenshotDir, 'image-anchor-refused-removal-960x800.png'));
  });
});

/** Local shorthand so the broken-state test reads like the authoring flow. */
async function beginRegion(blockId) {
  await startAuthoring(blockId, 'Add image region…');
}
