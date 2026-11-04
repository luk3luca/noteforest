import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import {
  artifactsPath,
  createHarness,
  waitUntil,
} from '../support/harness.mjs';

/**
 * Backup restore and destination-refusal coverage moved out of the critical
 * editor suite so the M2 gate stays under its 60 s budget. The assertions are
 * unchanged; these flows still run in `npm run test:recovery` and `verify`.
 */

const tempRoot = artifactsPath('m2f-backup-restore-tmp');
const h = createHarness({ tempRoot });
let page;

function isolated(name) {
  return {
    NOTEFOREST_LIBRARY: resolve(tempRoot, `${name}-library`),
    NOTEFOREST_APP_SUPPORT: resolve(tempRoot, `${name}-support`),
  };
}

async function launch(overrides = {}) {
  await h.launch(overrides);
  page = h.page;
}

async function waitActiveTab(packagePath) {
  await page.waitForFunction(
    (expected) => window.__noteforestTest.state().activeTab === expected,
    packagePath,
    { timeout: 10000 },
  );
}

/** Make the package folder read-only so the atomic save fails with EACCES. */
async function setPackageWritable(packagePath, writable) {
  await chmod(packagePath, writable ? 0o755 : 0o555);
}

async function waitSaveFailure(code) {
  await page.waitForFunction(
    (expected) => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      return (
        runtime?.saveState === 'error' &&
        (expected === undefined || runtime.saveFailure?.code === expected)
      );
    },
    code,
    { timeout: 10000 },
  );
}

/**
 * Replace the native restore destination picker. `null` simulates Cancel; any
 * other value is returned as the chosen package folder.
 */
async function mockRestoreDialog(filePath) {
  await h.app.evaluate(({ dialog }, target) => {
    globalThis.__nfRestoreDialogs = [];
    dialog.showSaveDialog = async (_window, options) => {
      globalThis.__nfRestoreDialogs.push(options);
      if (target === null) return { canceled: true, filePath: undefined };
      return { canceled: false, filePath: target };
    };
  }, filePath ?? null);
}

function backupsDirFor(packagePath, supportDir) {
  const digest = createHash('sha256').update(resolve(packagePath)).digest('hex').slice(0, 32);
  return resolve(supportDir, 'backups', digest);
}

async function typeSavedEdit(value) {
  await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(value);
  await h.waitSaved();
}

async function waitRestoreDialog() {
  const dialog = page.getByRole('dialog', { name: 'Restore backup' });
  await dialog.waitFor({ timeout: 10000 });
  return dialog;
}

async function waitRestoreRows(dialog) {
  await dialog.locator('[data-restore-backup="true"]').waitFor({ timeout: 10000 });
  await dialog.locator('[data-backup-row]').first().waitFor({ timeout: 10000 });
}

async function waitRestoreError(dialog, pattern) {
  await dialog
    .locator('[data-restore-error="true"]')
    .filter({ hasText: pattern })
    .waitFor({ timeout: 10000 });
}

async function readDiskDocument(packagePath) {
  return JSON.parse(await readFile(resolve(packagePath, 'document.json'), 'utf8'));
}

function activeSaveBanner() {
  return page.locator('.nf-editor[data-active="true"] [data-save-failure="true"]');
}

/**
 * Best-effort teardown for backup-restore tests: close any restore modal,
 * retry a pending save failure, and wait until every runtime is saved. The E2E
 * dialog guard prevents a blocked quit, but a failed assertion must still not
 * leave the document dirty for the next test.
 */
async function recoverBackupFailure() {
  const dialog = page.getByRole('dialog', { name: 'Restore backup' });
  if ((await dialog.count()) > 0) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await dialog.waitFor({ state: 'detached' }).catch(() => undefined);
  }
  if ((await page.locator('[data-save-failure="true"]').count()) > 0) {
    await page.locator('[data-save-action="retry"]').click().catch(() => undefined);
  }
  await h.waitSaved().catch(() => undefined);
}

describe('M2f backup restore and destination refusal', () => {
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

  it('lists valid backups newest first and restores one as a new copy', async () => {
    const env = isolated('backup-restore');
    await launch(env);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const documentPath = resolve(packagePath, 'document.json');
    const assetsPath = resolve(packagePath, 'assets', 'diagram.bin');
    const assetBytes = 'restored asset bytes';
    await mkdir(resolve(packagePath, 'assets'), { recursive: true });
    await writeFile(assetsPath, assetBytes);

    await typeSavedEdit(' First saved edit');
    await typeSavedEdit(' Second saved edit');
    await typeSavedEdit(' Third saved edit');

    const backupsDir = backupsDirFor(packagePath, env.NOTEFOREST_APP_SUPPORT);
    await mkdir(backupsDir, { recursive: true });
    const autosaves = (await readdir(backupsDir))
      .filter((name) => name.startsWith('autosave-') && name.endsWith('.json'))
      .sort();
    const newestAutosave = autosaves.at(-1);
    assert.ok(newestAutosave, 'normal saves created at least one autosave backup');
    const manualDocument = JSON.parse(
      await readFile(resolve(backupsDir, newestAutosave), 'utf8'),
    );
    manualDocument.revision = 99;
    manualDocument.title = 'Manual snapshot';
    manualDocument.updatedAt = '2099-01-01T00:00:00.000Z';
    const manualPath = resolve(
      backupsDir,
      'manual-20990101T000000000Z-r0000000099.json',
    );
    await writeFile(manualPath, JSON.stringify(manualDocument, null, 2));
    const invalidPath = resolve(
      backupsDir,
      'autosave-20990101T000000001Z-r0000000100.json',
    );
    await writeFile(invalidPath, '{ "schemaVersion": 1,');

    const originalBytes = await readFile(documentPath);
    await setPackageWritable(packagePath, false);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Blocked by permissions');
      await waitSaveFailure('permission');

      await activeSaveBanner().locator('[data-save-action="restore-backup"]').click();
      const dialog = await waitRestoreDialog();
      await waitRestoreRows(dialog);

      const rows = await dialog.locator('[data-backup-row]').evaluateAll((nodes) =>
        nodes.map((node) => ({ ...node.dataset })),
      );
      assert.ok(rows.length >= 4, 'invalid, manual, and normal backups are listed');
      assert.equal(rows[0]?.backupValid, 'false', 'the newest invalid backup is disabled');
      assert.equal(rows[0]?.backupSource, invalidPath);
      const invalidRow = dialog.locator('label[data-backup-valid="false"]');
      assert.equal(await invalidRow.count(), 1);
      assert.match(await invalidRow.innerText(), /unusable/i);
      assert.equal(
        await invalidRow.locator('input[data-backup-select]').isDisabled(),
        true,
        'invalid backups cannot be selected',
      );

      const valid = rows.filter((row) => row.backupValid === 'true');
      for (let index = 1; index < valid.length; index += 1) {
        assert.ok(
          (valid[index - 1].backupCreated ?? '') >= (valid[index].backupCreated ?? ''),
          'valid backups are newest first',
        );
      }
      const manualRow = valid.find((row) => row.backupSource === manualPath);
      assert.ok(manualRow, 'the manual backup is listed');
      assert.equal(manualRow.backupKind, 'manual');
      assert.equal(manualRow.backupCreated, '2099-01-01T00:00:00.000Z');
      assert.equal(manualRow.backupRevision, '99');
      assert.equal(manualRow.backupBlocks, String(Object.keys(manualDocument.blocks).length));
      assert.equal(manualRow.backupTitle, 'Manual snapshot');
      assert.equal(
        await dialog.locator('input[data-backup-select]:checked').evaluate(
          (element) => element.closest('label')?.getAttribute('data-backup-source') ?? null,
        ),
        manualPath,
        'the newest valid backup is preselected',
      );

      const destination = resolve(env.NOTEFOREST_LIBRARY, 'restored copy');
      await mockRestoreDialog(destination);
      await dialog.getByRole('button', { name: 'Restore copy…' }).click();

      await page.waitForFunction(
        (expected) => {
          const current = window.__noteforestTest.state();
          return current.tabs.length === 2 && current.activeTab === expected;
        },
        destination,
        { timeout: 10000 },
      );

      const restored = await readDiskDocument(destination);
      assert.deepEqual(restored, manualDocument, 'the restored copy is the selected backup');
      assert.equal(restored.revision, 99);
      assert.equal(restored.title, 'Manual snapshot');
      assert.equal(
        Object.keys(restored.blocks).length,
        Object.keys(manualDocument.blocks).length,
      );
      assert.equal(await readFile(resolve(destination, 'assets', 'diagram.bin'), 'utf8'), assetBytes);
      assert.equal(
        (await readFile(documentPath)).equals(originalBytes),
        true,
        'the original document is untouched',
      );

      const dialogs = await h.app.evaluate(() => globalThis.__nfRestoreDialogs ?? []);
      assert.equal(dialogs.length, 1);
      assert.equal(dialogs[0].buttonLabel, 'Restore copy');
      const folder = basename(packagePath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(
        dialogs[0].defaultPath,
        new RegExp(`${folder} restored \\d{4}-\\d{2}-\\d{2} \\d{2}-\\d{2}-\\d{2}$`),
      );
      assert.ok(
        resolve(dialogs[0].defaultPath).startsWith(resolve(env.NOTEFOREST_LIBRARY)),
        'the default destination is inside the library',
      );

      const originalRuntime = (await h.state()).runtimes.find(
        (runtime) => runtime.packagePath === packagePath,
      );
      assert.equal(
        originalRuntime?.saveFailure?.code,
        'permission',
        'restoring a copy does not clear the original failure',
      );

      await setPackageWritable(packagePath, true);
      await page.evaluate((path) => window.__noteforestTest.openPath(path), packagePath);
      await waitActiveTab(packagePath);
      if ((await activeSaveBanner().count()) > 0) {
        await activeSaveBanner().locator('[data-save-action="retry"]').click();
      }
      await h.waitSaved();
    } finally {
      await setPackageWritable(packagePath, true);
      await page
        .evaluate((path) => window.__noteforestTest.openPath(path), packagePath)
        .catch(() => undefined);
      await recoverBackupFailure();
    }
  });

  it('shows an empty state when there are no valid backups', async () => {
    const env = isolated('backup-empty');
    await launch(env);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const backupsDir = backupsDirFor(packagePath, env.NOTEFOREST_APP_SUPPORT);
    await setPackageWritable(packagePath, false);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Cannot save without backups');
      await waitSaveFailure('permission');

      // A failed save writes its safety backup before the atomic write fails;
      // remove it so this test starts from a document with no backups at all.
      await rm(backupsDir, { recursive: true, force: true });

      await activeSaveBanner().locator('[data-save-action="restore-backup"]').click();
      let dialog = await waitRestoreDialog();
      await dialog.locator('[data-backup-empty="true"]').waitFor({ timeout: 10000 });
      assert.match(await dialog.innerText(), /No usable backups/);
      assert.equal(
        await dialog.getByRole('button', { name: /Restore copy/ }).count(),
        0,
        'no restore button in the empty state',
      );
      assert.equal(await dialog.locator('[data-restore-backup="true"]').count(), 0);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.equal((await h.state()).tabs.length, 1, 'cancel does not open a copy');

      await mkdir(backupsDir, { recursive: true });
      await writeFile(
        resolve(backupsDir, 'autosave-20990101T000000000Z-r0000000001.json'),
        '{ "schemaVersion": 1,',
      );

      await activeSaveBanner().locator('[data-save-action="restore-backup"]').click();
      dialog = await waitRestoreDialog();
      await dialog.locator('[data-backup-empty="true"]').waitFor({ timeout: 10000 });
      assert.match(await dialog.innerText(), /No usable backups/);
      assert.equal(
        await dialog.getByRole('button', { name: /Restore copy/ }).count(),
        0,
        'invalid backups never enable restore',
      );
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await dialog.waitFor({ state: 'detached' });
    } finally {
      await setPackageWritable(packagePath, true);
      await recoverBackupFailure();
    }
  });

  it('refuses existing, outside-library, and read-only restore destinations', async () => {
    const env = isolated('backup-refuse');
    await launch(env);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const documentPath = resolve(packagePath, 'document.json');
    await typeSavedEdit(' First saved edit');
    await typeSavedEdit(' Second saved edit');
    const originalBytes = await readFile(documentPath);

    const occupied = resolve(env.NOTEFOREST_LIBRARY, 'occupied');
    await mkdir(occupied, { recursive: true });
    await copyFile(documentPath, resolve(occupied, 'document.json'));
    const occupiedBytes = await readFile(resolve(occupied, 'document.json'));

    await setPackageWritable(packagePath, false);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Blocked by permissions');
      await waitSaveFailure('permission');

      await activeSaveBanner().locator('[data-save-action="restore-backup"]').click();
      const dialog = await waitRestoreDialog();
      await waitRestoreRows(dialog);

      await mockRestoreDialog(occupied);
      await dialog.getByRole('button', { name: 'Restore copy…' }).click();
      await waitRestoreError(dialog, /already exists/i);
      assert.equal((await h.state()).tabs.length, 1, 'overwrite refusal opens no copy');
      assert.equal(
        (await readFile(resolve(occupied, 'document.json'))).equals(occupiedBytes),
        true,
        'the occupied package is not overwritten',
      );

      const outside = resolve(tempRoot, 'outside-restore');
      await mockRestoreDialog(outside);
      await dialog.getByRole('button', { name: 'Restore copy…' }).click();
      await waitRestoreError(dialog, /inside the NoteForest library/i);
      assert.equal((await h.state()).tabs.length, 1);
      await assert.rejects(readFile(resolve(outside, 'document.json')));

      if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
        const readOnly = resolve(env.NOTEFOREST_LIBRARY, 'readonly-target');
        await mkdir(readOnly, { recursive: true });
        await chmod(readOnly, 0o555);
        try {
          await mockRestoreDialog(readOnly);
          await dialog.getByRole('button', { name: 'Restore copy…' }).click();
          await waitRestoreError(dialog, /not writable/i);
          assert.equal((await h.state()).tabs.length, 1);
          await assert.rejects(readFile(resolve(readOnly, 'document.json')));
        } finally {
          await chmod(readOnly, 0o755);
        }
      }

      await mockRestoreDialog(null);
      await dialog.getByRole('button', { name: 'Restore copy…' }).click();
      await waitUntil(
        async () =>
          (await h.app.evaluate(() => globalThis.__nfRestoreDialogs?.length ?? 0)) === 1,
        'restore destination dialog',
      );
      await page.waitForFunction(
        () => {
          const buttons = [...document.querySelectorAll('.nf-dialog button')];
          const restore = buttons.find((button) =>
            button.textContent?.includes('Restore copy'),
          );
          return restore !== undefined && !restore.hasAttribute('disabled');
        },
        undefined,
        { timeout: 10000 },
      );
      assert.equal(await dialog.count(), 1, 'native Cancel keeps the modal open');
      assert.equal((await h.state()).tabs.length, 1);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await dialog.waitFor({ state: 'detached' });

      assert.equal(
        (await readFile(documentPath)).equals(originalBytes),
        true,
        'no restore attempt writes the original document',
      );

      await setPackageWritable(packagePath, true);
      await activeSaveBanner().locator('[data-save-action="retry"]').click();
      await h.waitSaved();
    } finally {
      await setPackageWritable(packagePath, true);
      await recoverBackupFailure();
    }
  });
});
