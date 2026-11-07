import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, root } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addTopLevelBlock } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3c3b1-ui');
const screenshotDir = artifactsPath('m3c3b1');
const imageFixture = resolve(root, 'fixtures/assets/forest.png');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(overrides = {}) {
  page = await ui.launch({ NOTEFOREST_E2E_HIDDEN: '0', ...overrides });
}

/** Replace the guarded native picker with a deterministic file selection. */
async function mockImagePicker(filePath) {
  await h.app.evaluate(({ dialog }, selectedPath) => {
    globalThis.__nfImagePickerCalls = [];
    dialog.showOpenDialog = async (_window, options) => {
      globalThis.__nfImagePickerCalls.push(options);
      return { canceled: false, filePaths: [selectedPath] };
    };
  }, filePath);
}

async function imageMetrics(blockId) {
  return page.evaluate((id) => {
    const scope = document.querySelector('.nf-editor[data-active="true"]');
    const card = scope?.querySelector(`[data-block-card="${id}"]`);
    const image = card?.querySelector('.nf-image-el');
    const prose = card?.querySelector('.nf-block-prose');
    if (image === null || image === undefined || prose === null || prose === undefined) {
      return null;
    }
    const imageRect = image.getBoundingClientRect();
    const proseRect = prose.getBoundingClientRect();
    return {
      imageWidth: imageRect.width,
      imageHeight: imageRect.height,
      proseWidth: proseRect.width,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      complete: image.complete,
    };
  }, blockId);
}

describe('NoteForest M3c3b1 image pipeline', () => {
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

  it('inserts, renders, persists, and reloads an image; missing assets show a placeholder', async () => {
    const env = ui.isolated('image');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    await mockImagePicker(imageFixture);

    const blockId = 'm3c3b1-image';
    await addTopLevelBlock(ui, blockId, {
      type: 'doc',
      children: [{ type: 'paragraph' }],
    });

    await ui.openBlockMenuFromGutter(blockId);
    await ui.chooseMenuItem('Insert image…');
    await page.waitForSelector(`[data-block-card="${blockId}"] [data-image-node]`, {
      timeout: 10000,
    });
    await h.waitSaved();

    const calls = await h.app.evaluate(() => globalThis.__nfImagePickerCalls ?? []);
    assert.equal(calls.length, 1, 'the native picker was invoked once');
    assert.equal(calls[0].properties.includes('openFile'), true, 'open-file picker');

    const canonical = await ui.structure();
    const assets = await page.evaluate(() => window.__noteforestTest.assets());
    const imageBlock = canonical.blocks[blockId];
    assert.ok(imageBlock, 'image block survives');
    assert.equal(imageBlock.content.children.length, 1, 'an empty block becomes the image');
    const imageNode = imageBlock.content.children[0];
    assert.equal(imageNode.type, 'image');
    assert.match(imageNode.attrs.assetId, /^[0-9a-f]{64}$/);
    assert.equal(imageNode.attrs.alt, 'forest');
    assert.equal(imageNode.attrs.src, undefined, 'canonical node has no display path');

    const asset = assets[imageNode.attrs.assetId];
    assert.ok(asset, 'the asset record is canonical');
    assert.equal(asset.path, `assets/${imageNode.attrs.assetId}`);
    assert.equal(asset.mime, 'image/png');
    assert.equal(asset.originalName, 'forest.png');
    assert.equal(asset.width, 640, 'native-picker import stores intrinsic width');
    assert.equal(asset.height, 360, 'native-picker import stores intrinsic height');
    assert.equal(imageNode.attrs.width, 640);
    assert.equal(imageNode.attrs.height, 360);
    assert.equal(Object.keys(assets).length, 1);

    const packagePath = (await h.state()).activeTab;
    const assetPath = resolve(packagePath, 'assets', imageNode.attrs.assetId);
    const stored = await stat(assetPath);
    assert.equal(stored.size, asset.bytes, 'asset bytes are in the package');
    assert.deepEqual(await readFile(assetPath), await readFile(imageFixture), 'exact bytes copied');
    const onDisk = JSON.parse(await readFile(resolve(packagePath, 'document.json'), 'utf8'));
    assert.equal(
      onDisk.blocks[blockId].content.children[0].attrs.src,
      undefined,
      'the saved document stores no display path',
    );

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
    const metrics = await imageMetrics(blockId);
    assert.ok(metrics !== null);
    assert.ok(
      Math.abs(metrics.imageWidth - metrics.proseWidth) <= 1.5,
      `image fills the block width (${metrics.imageWidth} vs ${metrics.proseWidth})`,
    );
    const renderedAspect = metrics.imageWidth / metrics.imageHeight;
    const intrinsicAspect = metrics.naturalWidth / metrics.naturalHeight;
    assert.ok(
      Math.abs(renderedAspect - intrinsicAspect) < 0.02,
      `intrinsic aspect ratio is preserved (${renderedAspect} vs ${intrinsicAspect})`,
    );

    // Alt text is editable from the block menu and stays canonical.
    await ui.openBlockMenuFromGutter(blockId);
    await ui.chooseMenuItem('Edit image alt text…');
    await page.locator('.nf-dialog').getByRole('textbox', { name: 'Alt text' }).fill(
      'Forest plot of residuals',
    );
    await page.locator('.nf-dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await h.waitSaved();
    const afterAlt = await ui.structure();
    assert.equal(
      afterAlt.blocks[blockId].content.children[0].attrs.alt,
      'Forest plot of residuals',
    );
    assert.equal(afterAlt.blocks[blockId].content.children[0].attrs.src, undefined);

    await page
      .locator(`[data-block-card="${blockId}"]`)
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await h.screenshot(resolve(screenshotDir, 'image-inserted-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // A missing canonical asset is a labeled placeholder, never a crash.
    const missingId = 'f'.repeat(64);
    const missingBlockId = 'm3c3b1-missing';
    await addTopLevelBlock(ui, missingBlockId, {
      type: 'doc',
      children: [
        {
          type: 'image',
          attrs: { assetId: missingId, alt: 'Missing forest plot' },
        },
      ],
    });
    await page.waitForSelector(
      `[data-block-card="${missingBlockId}"] [data-image-missing="true"]`,
      { timeout: 10000 },
    );
    const missingText = await page
      .locator(`[data-block-card="${missingBlockId}"] [data-image-missing="true"]`)
      .innerText();
    assert.match(missingText, /Image not found/);
    assert.match(missingText, /Missing forest plot/);
    const missingAssets = await page.evaluate(() => window.__noteforestTest.assets());
    assert.equal(missingAssets[missingId], undefined);
    await h.waitSaved();
    await h.screenshot(resolve(screenshotDir, 'image-missing-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Full save/reload through the package on disk.
    await h.quit();
    await launch(env);
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]', {
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
    assert.equal(
      await page.locator(`[data-block-card="${blockId}"] [data-image-node]`).count(),
      1,
      'the image is present after reload',
    );
    assert.equal(
      await page
        .locator(`[data-block-card="${missingBlockId}"] [data-image-missing="true"]`)
        .count(),
      1,
      'the missing-asset placeholder is present after reload',
    );
    const reloaded = await ui.structure();
    assert.equal(reloaded.blocks[blockId].content.children[0].attrs.assetId, imageNode.attrs.assetId);
    await h.waitSaved();
    await page
      .locator(`[data-block-card="${blockId}"]`)
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await h.screenshot(resolve(screenshotDir, 'image-reloaded-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('imports a dropped image through the paste/drop path without a native dialog', async () => {
    const env = ui.isolated('image-drop');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();

    const blockId = 'm3c3b1-drop';
    await addTopLevelBlock(ui, blockId, {
      type: 'doc',
      children: [{ type: 'paragraph' }],
    });
    const bytes = Array.from(await readFile(imageFixture));
    const result = await page.evaluate(
      ({ blockId: id, imageBytes }) => {
        const card = document.querySelector(`[data-block-card="${id}"]`);
        if (card === null) throw new Error('drop target block is missing');
        card.scrollIntoView({ block: 'center' });
        const rect = card.getBoundingClientRect();
        const file = new File([new Uint8Array(imageBytes)], 'forest.png', {
          type: 'image/png',
        });
        const data = new DataTransfer();
        data.items.add(file);
        const editor = document.querySelector('.nf-prosemirror');
        if (editor === null) throw new Error('editor is missing');
        const event = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        });
        editor.dispatchEvent(event);
        return { defaultPrevented: event.defaultPrevented };
      },
      { blockId, imageBytes: bytes },
    );
    assert.equal(result.defaultPrevented, true, 'the drop is handled, not left to the browser');
    await page.waitForSelector(`[data-block-card="${blockId}"] [data-image-node]`, {
      timeout: 10000,
    });
    await h.waitSaved();

    const canonical = await ui.structure();
    const children = canonical.blocks[blockId].content.children;
    assert.equal(children.length, 1);
    assert.equal(children[0].type, 'image');
    assert.match(children[0].attrs.assetId, /^[0-9a-f]{64}$/);
    assert.equal(children[0].attrs.width, 640);
    assert.equal(children[0].attrs.height, 360);
    const assets = await page.evaluate(() => window.__noteforestTest.assets());
    assert.equal(Object.keys(assets).length, 1);
    assert.equal(assets[children[0].attrs.assetId].mime, 'image/png');
  });
});
