import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { artifactsPath, killTestAppsUnder, root } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { imageBlock, pageDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * DR1b: `Unused images` in Health, and the OS-Trash cleanup.
 *
 * The plan is core (`planAssetGc`): a record no image node, no image anchor, and
 * no retained backup names may be cleaned up. The section exists only while the
 * plan is non-empty; its rows are the shared result card; `Clean up N unused
 * images…` opens the confirm, and `Remove` moves each file to the OS Trash
 * before the record is removed. Read mode lists but does not allow the action.
 *
 * The scan reads this note's backups in app support, so the fixtures write a
 * real backup file naming one asset. A backup keeps an id, never the bytes.
 */

const tempRoot = artifactsPath('unused-images-temp');
const screenshotDir = artifactsPath('data-recovery');
const forestFixture = resolve(root, 'fixtures/assets/forest.png');
const chartFixture = resolve(root, 'fixtures/assets/chart.png');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(env) {
  page = await ui.launch({ ...env, NOTEFOREST_E2E_HIDDEN: '0' });
  await h.setWindowSize(1440, 900);
}

async function fileHash(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function assetRecord(id, originalName, bytes) {
  return { id, path: `assets/${id}`, mime: 'image/png', bytes, originalName };
}

async function writeBackupNaming(env, packagePath, ids) {
  const directory = join(
    env.NOTEFOREST_APP_SUPPORT,
    'backups',
    createHash('sha256').update(resolve(packagePath)).digest('hex').slice(0, 32),
  );
  await mkdir(directory, { recursive: true });
  const backup = pageDocument({ id: 'unused-images-note', title: 'Unused images', blocks: [] });
  backup.assets = Object.fromEntries(
    ids.map((id) => [id, assetRecord(id, 'only-in-backup.png', 12)]),
  );
  await writeFile(
    join(directory, 'manual-20261117T100000000Z-r0000000000.json'),
    JSON.stringify(backup, null, 2),
    'utf8',
  );
}

/**
 * One note: a live image, a spare record with bytes and no reference, and a
 * record that only a backup names. Nothing saves before the section is read, so
 * the autosave rotation has no say in the plan.
 */
async function writeFixtures(env) {
  const usedId = await fileHash(forestFixture);
  const spareId = await fileHash(chartFixture);
  const backupOnlyId = 'f'.repeat(64);
  const document = pageDocument({
    id: 'unused-images-note',
    title: 'Unused images',
    blocks: [
      imageBlock('image-block', 'Diagram', usedId, 'A diagram'),
      {
        id: 'text-block',
        label: 'Text',
        content: {
          type: 'doc',
          children: [
            { type: 'paragraph', children: [{ type: 'text', text: 'A note about eigenvalues.' }] },
          ],
        },
      },
    ],
  });
  document.assets = {
    [usedId]: assetRecord(usedId, 'forest.png', (await stat(forestFixture)).size),
    [spareId]: assetRecord(spareId, 'spare-chart.png', (await stat(chartFixture)).size),
    [backupOnlyId]: assetRecord(backupOnlyId, 'only-in-backup.png', 12),
  };
  const packagePath = await writePagePackage(env.NOTEFOREST_LIBRARY, 'Unused images', document, {
    [usedId]: forestFixture,
    [spareId]: chartFixture,
  });
  await writeBackupNaming(env, packagePath, [backupOnlyId]);
  return { packagePath, usedId, spareId, backupOnlyId };
}

async function openNote(packagePath) {
  const opened = await page.evaluate(
    (path) => window.__noteforestTest.openPath(path),
    packagePath,
  );
  assert.equal(opened, true, 'the fixture note opens');
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  await h.waitSaved();
}

async function showHealthWithUnused() {
  await ui.showHealth();
  // The backup scan is async: wait for its answer before reading the plan.
  await page.waitForSelector('[data-health-unused-ready="true"]', { timeout: 15000 });
  await page.waitForSelector('[data-health-unused="true"]', { timeout: 15000 });
}

async function activeAssets() {
  return page.evaluate(() => window.__noteforestTest.assets());
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('unused images on Health', () => {
  before(async () => {
    killTestAppsUnder(tempRoot);
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await h.quit();
    } finally {
      killTestAppsUnder(tempRoot);
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  after(async () => {
    killTestAppsUnder(tempRoot);
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('lists only unreferenced images and moves the bytes to the Trash', { timeout: 180000 }, async () => {
    const env = ui.isolated('cleanup');
    const ids = await writeFixtures(env);
    await launch(env);
    await openNote(ids.packagePath);
    await showHealthWithUnused();

    // The section states the count; the four audit sections keep their `0`.
    const section = page.locator('[data-health-unused="true"]');
    assert.equal(await section.getAttribute('data-health-unused-count'), '1');
    assert.equal(
      (await page.locator('[data-health-unused-count-label="true"]').innerText()).trim(),
      '1',
    );
    for (const id of ['anchors', 'unused', 'structure', 'hidden']) {
      assert.equal(
        (
          await page
            .locator(`[data-health-section="${id}"] [data-health-section-count]`)
            .innerText()
        ).trim(),
        '0',
        `${id} keeps its always-visible zero`,
      );
    }
    // No all-clear while there is something to clean up.
    assert.equal(await page.locator('[data-health-empty="true"]').count(), 0);

    // The spare record is the only row: a used image and a backup-only asset
    // are never listed.
    assert.equal(await page.locator(`[data-health-unused-image="${ids.spareId}"]`).count(), 1);
    assert.equal(await page.locator(`[data-health-unused-image="${ids.usedId}"]`).count(), 0);
    assert.equal(
      await page.locator(`[data-health-unused-image="${ids.backupOnlyId}"]`).count(),
      0,
      'a backup keeps the asset out of the list',
    );
    const row = page.locator(`[data-health-unused-image="${ids.spareId}"]`);
    assert.match(await row.innerText(), /spare-chart\.png/);
    assert.match(await row.innerText(), /image\/png/);
    await page.screenshot({ path: join(screenshotDir, 'unused-images-section.png') });

    // The confirm states the count and the total size; Cancel has focus.
    await page.locator('[data-health-unused-action="true"]').click();
    await page.waitForSelector('[data-unused-images-summary="true"]');
    const summary = (await page.locator('[data-unused-images-summary="true"]').innerText()).trim();
    assert.match(summary, /^1 image · /);
    assert.equal(await page.locator(`[data-unused-images-item="${ids.spareId}"]`).count(), 1);
    assert.equal(await page.locator(`[data-unused-images-item="${ids.backupOnlyId}"]`).count(), 0);
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-dialog-secondary') === 'true',
      undefined,
      { timeout: 5000 },
    );
    await page.screenshot({ path: join(screenshotDir, 'unused-images-confirm.png') });

    await page.locator('[data-unused-images-confirm="true"]').click();
    await page.waitForSelector('[data-unused-images-confirm="true"]', { state: 'detached' });
    await page.waitForSelector('[data-health-unused="true"]', { state: 'detached', timeout: 15000 });
    await h.waitSaved();

    // The record is gone, the bytes are out of the package, and nothing else
    // moved: the used image and the backup-only record are untouched.
    const assets = await activeAssets();
    assert.equal(assets[ids.spareId], undefined);
    assert.notEqual(assets[ids.usedId], undefined);
    assert.notEqual(assets[ids.backupOnlyId], undefined);
    assert.equal(await exists(join(ids.packagePath, 'assets', ids.spareId)), false);
    assert.equal(await exists(join(ids.packagePath, 'assets', ids.usedId)), true);
    await page.screenshot({ path: join(screenshotDir, 'unused-images-cleanup.png') });

    // The removal persisted: reopening the note still has no section.
    await page.evaluate(
      (path) => window.__noteforestTest.closePath(path),
      ids.packagePath,
    );
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs.length === 0,
      undefined,
      { timeout: 10000 },
    );
    await openNote(ids.packagePath);
    await ui.showHealth();
    await page.waitForSelector('[data-health-empty="true"]');
    assert.equal(await page.locator('[data-health-unused="true"]').count(), 0);
  });

  it('keeps an image-anchored asset out of the list', { timeout: 120000 }, async () => {
    const env = ui.isolated('anchor');
    const ids = await writeFixtures(env);
    // The same note with a region anchor on the spare image.
    const document = JSON.parse(
      await readFile(join(ids.packagePath, 'document.json'), 'utf8'),
    );
    document.anchors = {
      'image-anchor': {
        id: 'image-anchor',
        blockId: 'image-block',
        kind: 'image',
        selector: {
          kind: 'image',
          assetId: ids.spareId,
          rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
          point: false,
        },
        quote: 'region',
      },
    };
    await writeFile(
      join(ids.packagePath, 'document.json'),
      JSON.stringify(document, null, 2),
      'utf8',
    );

    await launch(env);
    await openNote(ids.packagePath);
    await ui.showHealth();
    await page.waitForSelector('[data-health-unused-ready="true"]', { timeout: 15000 });
    await page.waitForSelector('[data-health-section="anchors"] [data-health-section-count]');
    // The anchor is an idle audit row, so the all-clear is not the point here:
    // the plan is empty because the asset is anchored and the other one is in
    // a backup.
    assert.equal(await page.locator('[data-health-unused="true"]').count(), 0);
  });

  it('lists in Read mode and disables the cleanup', { timeout: 120000 }, async () => {
    const env = ui.isolated('read');
    const ids = await writeFixtures(env);
    await launch(env);
    await openNote(ids.packagePath);
    await ui.ensureInteractionMode('read');
    await showHealthWithUnused();

    assert.equal(
      await page.locator(`[data-health-unused-image="${ids.spareId}"]`).count(),
      1,
      'Read mode still lists the images',
    );
    assert.equal(
      await page.locator('[data-health-unused-action="true"]').isDisabled(),
      true,
    );
    await page.screenshot({ path: join(screenshotDir, 'unused-images-read.png') });
  });
});
