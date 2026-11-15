import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, root } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addTopLevelBlock } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3c3b3-ui');
const screenshotDir = artifactsPath('m3c3b3');
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
  await page.waitForSelector(`[data-block-card="${blockId}"] [data-image-draw-layer]`, {
    timeout: 10000,
  });
}

async function frameBox(blockId) {
  const frame = page.locator(`[data-block-card="${blockId}"] .nf-image-frame`);
  await frame.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const box = await frame.boundingBox();
  assert.ok(box !== null, 'image frame is measurable');
  return box;
}

async function dragOnImage(blockId, from, to) {
  const box = await frameBox(blockId);
  await page.mouse.move(box.x + box.width * from.x, box.y + box.height * from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to.x, box.y + box.height * to.y, { steps: 6 });
  await page.mouse.up();
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

/**
 * S4-2: a missing/changed asset has no draw layer, so both menu surfaces must
 * disable Add region/point and name the reason. The block menu and the
 * placeholder's own inline menu share the same gate.
 */
async function assertImageAuthoringDisabled(blockId, reason, screenshotName) {
  const assertMenu = async () => {
    const region = page.getByRole('menuitem', { name: /Add image region…/ });
    const point = page.getByRole('menuitem', { name: /Add image point…/ });
    assert.equal(await region.getAttribute('aria-disabled'), 'true', 'region action disabled');
    assert.equal(await point.getAttribute('aria-disabled'), 'true', 'point action disabled');
    assert.match((await region.textContent()) ?? '', reason);
    assert.match((await point.textContent()) ?? '', reason);
    // Repair actions stay available where they are safe.
    assert.equal(
      await page
        .getByRole('menuitem', { name: /Replace image…/ })
        .getAttribute('aria-disabled'),
      null,
      'replace stays enabled for a broken image',
    );
    assert.equal(
      await page
        .getByRole('menuitem', { name: /Edit image alt text…/ })
        .getAttribute('aria-disabled'),
      null,
      'alt editing stays enabled for a broken image',
    );
    // A synthetic activation on a disabled entry must not start authoring and
    // must not close the menu (React Aria ignores the disabled item).
    await region.dispatchEvent('click');
    assert.equal(await page.locator('.nf-menu').count(), 1, 'the disabled entry is inert');
    await page.keyboard.press('Escape');
    await page.locator('.nf-menu').waitFor({ state: 'detached' });
  };

  await ui.openBlockMenuFromGutter(blockId);
  await assertMenu();

  const inlineMenu = page.locator(
    `[data-block-card="${blockId}"] [data-image-action="menu"]`,
  );
  assert.equal(await inlineMenu.count(), 1, 'the broken image keeps an inline actions menu');
  await inlineMenu.click();
  await assertMenu();
  assert.equal(
    await page.locator(`[data-block-card="${blockId}"] [data-image-draw-layer]`).count(),
    0,
    'no authoring surface started',
  );

  // Screenshot evidence for the inline menu while it is open.
  await inlineMenu.click();
  await page.locator('.nf-menu').waitFor();
  await h.screenshot(resolve(screenshotDir, screenshotName), {
    width: 1440,
    height: 900,
  });
  await page.keyboard.press('Escape');
  await page.locator('.nf-menu').waitFor({ state: 'detached' });
}

/** Insert the picker image and author one region branch. */
async function insertImageWithRegion(blockId) {
  await mockImagePicker(forestFixture);
  await addImageBlock(blockId);
  const structure = await ui.structure();
  const assetId = imageBlock(structure, blockId).attrs.assetId;

  await startAuthoring(blockId, 'Add image region…');
  await dragOnImage(blockId, { x: 0.14, y: 0.18 }, { x: 0.48, y: 0.54 });
  await page.waitForSelector(`[data-block-card="${blockId}"] [data-image-pending="region"]`);
  await commitPending(blockId, 'region');
  await waitForImageAnchorCount(blockId, 1);
  await ui.waitForCallouts(blockId, 1);
  await h.waitSaved();

  const withAnchor = await ui.structure();
  const anchor = imageAnchors(withAnchor, blockId)[0];
  assert.ok(anchor);
  const branch = Object.values(withAnchor.branches).find(
    (candidate) => candidate.source.anchorId === anchor.id,
  );
  assert.ok(branch);
  const image = imageBlock(withAnchor, blockId);
  return {
    assetId,
    anchor,
    branch,
    node: image,
    targetBlockId: branch.targetBlockId,
  };
}

/** The package path of the active document. */
async function activePackagePath() {
  const state = await h.state();
  assert.ok(state.activeTab);
  return state.activeTab;
}

describe('NoteForest M3c3b3 image integrity and legacy sources', () => {
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

  it('treats a missing asset file as asset-missing with placeholder, health warning, and kept branch/target/alt', async () => {
    const env = ui.isolated('image-file-missing');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    const blockId = 'm3c3b3-missing-file';
    const { assetId, anchor, branch, node, targetBlockId } = await insertImageWithRegion(blockId);
    const packagePath = await activePackagePath();
    const assetPath = resolve(packagePath, 'assets', assetId);
    assert.match(assetId, /^[0-9a-f]{64}$/);
    await h.waitSaved();

    await h.quit();
    await unlink(assetPath);
    await launch(env);
    await page.waitForSelector(
      `[data-block-card="${blockId}"] [data-image-missing="true"]`,
      { timeout: 20000 },
    );

    const placeholder = page.locator(
      `[data-block-card="${blockId}"] [data-image-missing="true"]`,
    );
    assert.equal(await placeholder.getAttribute('data-image-integrity'), 'asset-missing');
    assert.match(await placeholder.innerText(), /Image not found/);
    assert.match(await placeholder.innerText(), new RegExp(node.attrs.alt));
    assert.equal(
      await page.locator(`[data-block-card="${blockId}"] .nf-image-el`).count(),
      0,
      'no <img> is rendered for a missing file',
    );
    assert.deepEqual(await page.evaluate(() => window.__noteforestTest.assetAvailability()), {
      [assetId]: 'asset-missing',
    });

    // S4-2: both menu surfaces disable region/point authoring with the reason.
    await assertImageAuthoringDisabled(
      blockId,
      /image file missing/,
      'image-file-missing-actions-1440x900.png',
    );

    await ui.waitForHealthChip(1, 0);
    await ui.openHealthFromChip();
    await page.waitForSelector(
      `[data-health-dialog="true"][data-health-row="anchor:${anchor.id}"]`,
    );
    assert.equal(
      await page
        .locator('[data-health-dialog="true"] [data-health-reason="asset-missing"]')
        .count(),
      1,
    );
    await h.screenshot(resolve(screenshotDir, 'image-file-missing-health-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await page.locator('[data-health-dialog="true"] [data-health-close="true"]').last().click();

    // The branch, target, alt, anchor selector, and asset record all survive.
    const after = await ui.structure();
    assert.equal(after.anchors[anchor.id]?.selector.assetId, assetId);
    assert.equal(after.branches[branch.id]?.targetBlockId, targetBlockId);
    assert.ok(after.blocks[targetBlockId], 'the branch target still exists');
    const afterImage = imageBlock(after, blockId);
    assert.equal(afterImage.attrs.assetId, assetId);
    assert.equal(afterImage.attrs.alt, node.attrs.alt);
    const assets = await page.evaluate(() => window.__noteforestTest.assets());
    assert.ok(assets[assetId], 'the canonical asset record is kept');

    // The editor warning path mirrors the health sheet.
    const warning = page.locator(`[data-anchor-warning="${anchor.id}"]`);
    await warning.waitFor({ state: 'visible' });
    assert.match(await warning.innerText(), /Lost anchor/);
    await page
      .locator(`[data-block-card="${blockId}"]`)
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await h.screenshot(resolve(screenshotDir, 'image-file-missing-placeholder-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('treats a SHA-256 mismatch as asset-changed, serves no bytes, and does not use stale dimensions', async () => {
    const env = ui.isolated('image-hash-changed');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    const blockId = 'm3c3b3-hash-changed';
    const { assetId, anchor, branch, node, targetBlockId } = await insertImageWithRegion(blockId);
    const packagePath = await activePackagePath();
    const assetPath = resolve(packagePath, 'assets', assetId);
    await h.waitSaved();

    await h.quit();
    // Same content-addressed filename, different PNG bytes.
    await writeFile(assetPath, await readFile(chartFixture));
    await launch(env);
    await page.waitForSelector(
      `[data-block-card="${blockId}"] [data-image-missing="true"]`,
      { timeout: 20000 },
    );

    const placeholder = page.locator(
      `[data-block-card="${blockId}"] [data-image-missing="true"]`,
    );
    assert.equal(await placeholder.getAttribute('data-image-integrity'), 'asset-changed');
    assert.match(await placeholder.innerText(), /Image asset changed/);
    assert.match(await placeholder.innerText(), new RegExp(node.attrs.alt));
    assert.equal(
      await page.locator(`[data-block-card="${blockId}"] .nf-image-el`).count(),
      0,
      'the changed bytes are never rendered as the image',
    );
    assert.deepEqual(await page.evaluate(() => window.__noteforestTest.assetAvailability()), {
      [assetId]: 'asset-changed',
    });

    // S4-2: both menu surfaces disable region/point authoring with the reason.
    await assertImageAuthoringDisabled(
      blockId,
      /image asset changed/,
      'image-hash-changed-actions-1440x900.png',
    );

    // The protocol must return an error instead of the changed bytes. A bare
    // `<img>` probe is allowed by the page CSP even when projection refuses to
    // render the image. The probe's expected 404 console entry is removed from
    // the renderer-error list; any other error still fails the suite.
    const errorsBeforeProbe = h.pageErrors.length;
    const probe = await page.evaluate(
      (id) =>
        new Promise((resolveProbe) => {
          const image = new Image();
          const timer = setTimeout(() => resolveProbe({ loaded: false, timeout: true }), 3000);
          image.onload = () => {
            clearTimeout(timer);
            resolveProbe({ loaded: true, width: image.naturalWidth });
          };
          image.onerror = () => {
            clearTimeout(timer);
            resolveProbe({ loaded: false });
          };
          image.src = `noteforest-asset://asset/${id}`;
        }),
      assetId,
    );
    h.pageErrors.splice(errorsBeforeProbe);
    assert.equal(probe.loaded, false, 'the protocol did not serve the changed bytes');

    await ui.waitForHealthChip(1, 0);
    await ui.openHealthFromChip();
    await page.waitForSelector(
      `[data-health-dialog="true"][data-health-row="anchor:${anchor.id}"]`,
    );
    assert.equal(
      await page
        .locator('[data-health-dialog="true"] [data-health-reason="asset-changed"]')
        .count(),
      1,
    );
    await h.screenshot(resolve(screenshotDir, 'image-hash-changed-health-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await page.locator('[data-health-dialog="true"] [data-health-close="true"]').last().click();

    const after = await ui.structure();
    assert.equal(after.anchors[anchor.id]?.selector.assetId, assetId);
    assert.equal(after.branches[branch.id]?.targetBlockId, targetBlockId);
    assert.ok(after.blocks[targetBlockId], 'the branch target still exists');
    assert.equal(imageBlock(after, blockId).attrs.alt, node.attrs.alt);
    // Canonical dimensions remain metadata; the placeholder rendered no `<img>`,
    // so the stale 640×360 was never used for display.
    assert.equal(imageBlock(after, blockId).attrs.width, node.attrs.width);
    assert.equal(
      await page.locator(`[data-block-card="${blockId}"] .nf-image-el`).count(),
      0,
    );
    await page
      .locator(`[data-block-card="${blockId}"]`)
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await h.screenshot(resolve(screenshotDir, 'image-hash-changed-placeholder-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('drops a legacy src-only image to the labeled placeholder and never passes file:/data:/remote paths to img', async () => {
    const env = ui.isolated('image-legacy-src');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    const blockId = 'm3c3b3-legacy';
    const localPath = resolve(root, 'fixtures/assets/forest.png');
    await addTopLevelBlock(ui, blockId, {
      type: 'doc',
      children: [
        {
          type: 'image',
          attrs: { src: `file://${localPath}`, alt: 'Legacy local forest' },
        },
        {
          type: 'image',
          attrs: { src: 'data:image/png;base64,AAAA', alt: 'Legacy data image' },
        },
        {
          type: 'image',
          attrs: { src: 'https://example.com/remote.png', alt: 'Legacy remote image' },
        },
      ],
    });
    await page.waitForSelector(
      `[data-block-card="${blockId}"] [data-image-missing="true"]`,
      { timeout: 10000 },
    );

    const placeholders = page.locator(`[data-block-card="${blockId}"] [data-image-missing="true"]`);
    assert.equal(await placeholders.count(), 3);
    for (const index of [0, 1, 2]) {
      assert.equal(
        await placeholders.nth(index).getAttribute('data-image-integrity'),
        'unsupported',
      );
      assert.match(await placeholders.nth(index).innerText(), /Unsupported image source/);
    }
    const text = await page.locator(`[data-block-card="${blockId}"]`).innerText();
    assert.match(text, /Legacy local forest/);
    assert.match(text, /Legacy data image/);
    assert.match(text, /Legacy remote image/);

    const imageSources = await page.evaluate(() =>
      [...document.querySelectorAll('img')].map((image) => image.getAttribute('src') ?? ''),
    );
    assert.equal(
      imageSources.filter((src) => /^(file:|data:|https?:)/i.test(src)).length,
      0,
      'no file/data/remote source reaches an <img>',
    );
    assert.equal(
      await page
        .locator(`[data-block-card="${blockId}"] img`)
        .count(),
      0,
      'the unsupported images render no <img> element',
    );

    await h.waitSaved();
    await page
      .locator(`[data-block-card="${blockId}"]`)
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await h.screenshot(resolve(screenshotDir, 'legacy-src-placeholder-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('keeps only the accent border and marker on a selected image region outline', async () => {
    const env = ui.isolated('image-region-outline');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    const blockId = 'm3c3b3-region-outline';
    const { anchor } = await insertImageWithRegion(blockId);

    const marker = page.locator(`[data-image-region-marker="${anchor.id}"]`);
    await marker.waitFor({ state: 'visible' });
    await marker.click();
    await page.waitForFunction(
      (anchorId) =>
        document.querySelector(
          `[data-image-region-anchor="${anchorId}"][data-anchor-selected="true"]`,
        ) !== null,
      anchor.id,
      { timeout: 10000 },
    );
    // The outline uses a 120 ms border-color transition. Under the full suite
    // the selected attribute can land before the transition finishes, so wait
    // for the computed accent border instead of racing the animation frame.
    await page.waitForFunction(
      (anchorId) => {
        const element = document.querySelector(
          `[data-image-region-outline="${anchorId}"]`,
        );
        return (
          element !== null &&
          getComputedStyle(element).borderTopColor !== 'rgba(0, 0, 0, 0)'
        );
      },
      anchor.id,
      { timeout: 10000 },
    );

    const style = await page
      .locator(`[data-image-region-outline="${anchor.id}"]`)
      .evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          backgroundColor: computed.backgroundColor,
          borderTopColor: computed.borderTopColor,
          borderTopWidth: computed.borderTopWidth,
        };
      });
    assert.equal(style.backgroundColor, 'rgba(0, 0, 0, 0)', 'no gray fill over the image');
    assert.notEqual(style.borderTopColor, 'rgba(0, 0, 0, 0)', 'the accent border is visible');
    assert.equal(style.borderTopWidth, '1.5px');
    assert.equal(
      await page.locator(`[data-image-region-marker="${anchor.id}"]`).count(),
      1,
      'the numbered marker remains',
    );

    await page
      .locator(`[data-block-card="${blockId}"]`)
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await h.screenshot(resolve(screenshotDir, 'image-region-selected-outline-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });
});
