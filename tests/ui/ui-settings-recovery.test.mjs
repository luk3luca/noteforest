import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { multiPageBlocksDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * Settings data recovery (S3-2, S3-13, S3-3).
 *
 * The top warning banner is only an alert: Dismiss hides it for this session
 * and never clears the read status. Data & About always shows the real status,
 * message, backup path and the explicit recovery action:
 *
 * - global `settings.json`: Reset for `corrupt` and `unreadable`; a failed
 *   reset keeps the warning and surfaces the error; a successful reset writes
 *   defaults and keeps the damaged copy.
 * - `document-settings.json`: Reset map (confirmed inline, backs up the current
 *   file, writes an empty map atomically) and Restore backup (newest valid
 *   backup, current file backed up first, invalid data never replaces the map).
 *
 * Note content is never touched: every assertion about `document.json` compares
 * bytes before/after the recovery action.
 */

const tempRoot = artifactsPath('ui-settings-recovery-ui');
const screenshotDir = artifactsPath('ui-settings-recovery');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(name, env) {
  page = await ui.launch({ ...(env ?? ui.isolated(name)), NOTEFOREST_E2E_HIDDEN: '1' });
  await h.setWindowSize(1440, 900);
}

function appSupport(env, name) {
  return join(env.NOTEFOREST_APP_SUPPORT, name);
}

async function openSettings() {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  await page.keyboard.press('Meta+,');
  await page.waitForSelector('[data-settings-dialog="true"]');
  assert.equal(await page.locator('.nf-settings-heading').innerText(), 'Settings');
}

async function openDataPage() {
  await page.locator('[data-settings-nav="data"]').click();
  await page.waitForSelector('[data-settings-file-status]');
}

async function closeSettings() {
  await page.locator('[data-settings-done="true"]').click();
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
}

async function appSettings() {
  return page.evaluate(() => window.__noteforestTest.settings());
}

async function waitSettingsState(key, state) {
  await page.waitForFunction(
    ({ key: field, state: expected }) =>
      window.__noteforestTest.settings()[field]?.state === expected,
    { key, state },
    { timeout: 15000 },
  );
}

async function fileNames(directory) {
  return readdir(directory);
}

describe('settings data recovery', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('keeps global recovery reachable after Dismiss and resets a corrupt file (S3-2)', async () => {
    const env = ui.isolated('recovery-global-corrupt');
    await mkdir(env.NOTEFOREST_APP_SUPPORT, { recursive: true });
    await writeFile(appSupport(env, 'settings.json'), '{not json', 'utf8');
    await launch('recovery-global-corrupt', env);

    await openSettings();
    await page.waitForSelector('[data-settings-warning="corrupt"]');
    assert.match(
      await page.locator('[data-settings-warning="corrupt"]').innerText(),
      /could not be read/i,
    );

    // Dismiss hides the banner only; the status stays corrupt in the store.
    await page.locator('[data-settings-dismiss-warning="true"]').click();
    await page.waitForSelector('[data-settings-warning="corrupt"]', { state: 'detached' });
    const dismissed = await appSettings();
    assert.equal(dismissed.settingsStatus.state, 'corrupt');
    assert.equal(dismissed.dismissedWarnings.global, true);

    // Data & About always exposes the real state and the recovery action.
    await openDataPage();
    assert.equal(
      await page.locator('[data-settings-file-status]').getAttribute('data-settings-file-status'),
      'corrupt',
    );
    assert.match(
      await page.locator('[data-settings-file-message="true"]').innerText(),
      /JSON|Unexpected|Unexpected token/i,
    );
    assert.match(
      await page.locator('[data-settings-backup-path="true"]').innerText(),
      /settings\.corrupt-/,
    );
    assert.equal(await page.locator('[data-settings-reset-file="true"]').count(), 1);
    await h.screenshot(join(screenshotDir, 'global-corrupt-data-page.png'));

    // Repairing the file while the banner is dismissed must not be the only
    // path: reopening Settings keeps the status and Reset.
    await closeSettings();
    await openSettings();
    assert.equal(await page.locator('[data-settings-warning="corrupt"]').count(), 0);
    await openDataPage();
    assert.equal(
      await page.locator('[data-settings-file-status]').getAttribute('data-settings-file-status'),
      'corrupt',
    );

    const backupsBefore = (await fileNames(env.NOTEFOREST_APP_SUPPORT)).filter((name) =>
      /^settings\.corrupt-.*\.json$/.test(name),
    );
    assert.equal(backupsBefore.length, 1);

    await page.locator('[data-settings-reset-file="true"]').click();
    await waitSettingsState('settingsStatus', 'ok');
    assert.equal(
      await page.locator('[data-settings-file-status]').getAttribute('data-settings-file-status'),
      'ok',
    );
    assert.equal(await page.locator('[data-settings-reset-file="true"]').count(), 0);
    assert.equal((await appSettings()).saveState.status, 'saved');

    const stored = JSON.parse(await readFile(appSupport(env, 'settings.json'), 'utf8'));
    assert.equal(stored.settingsVersion, 4, 'the reset writes a valid current file');
    assert.equal(stored.page.theme.density, 1, 'the reset restores the product defaults');
    assert.equal(
      await readFile(appSupport(env, backupsBefore[0]), 'utf8'),
      '{not json',
      'the successful reset keeps the damaged copy',
    );
  });

  it('offers Reset for an unreadable settings.json and replaces it (S3-2)', async () => {
    const env = ui.isolated('recovery-global-unreadable');
    await mkdir(env.NOTEFOREST_APP_SUPPORT, { recursive: true });
    const settingsPath = appSupport(env, 'settings.json');
    await writeFile(settingsPath, JSON.stringify({ settingsVersion: 2 }), 'utf8');
    await chmod(settingsPath, 0o000);
    await launch('recovery-global-unreadable', env);

    await openSettings();
    await page.waitForSelector('[data-settings-warning="unreadable"]');
    assert.match(
      await page.locator('[data-settings-warning="unreadable"]').innerText(),
      /could not be read/i,
    );
    await openDataPage();
    assert.equal(
      await page.locator('[data-settings-file-status]').getAttribute('data-settings-file-status'),
      'unreadable',
    );
    assert.equal(await page.locator('[data-settings-reset-file="true"]').count(), 1);

    await page.locator('[data-settings-reset-file="true"]').click();
    await waitSettingsState('settingsStatus', 'ok');
    const stored = JSON.parse(await readFile(settingsPath, 'utf8'));
    assert.equal(stored.settingsVersion, 4);
    assert.equal(stored.page.theme.density, 1);
    assert.deepEqual(stored.appearance, {
      theme: 'dark',
      accent: 'blue',
      uiScale: 1,
      uiFont: 'system',
      codeFont: 'jetbrains',
    });
  });

  it('keeps the warning and shows the error when a global reset fails (S3-2)', async () => {
    const env = ui.isolated('recovery-global-failure');
    await mkdir(env.NOTEFOREST_APP_SUPPORT, { recursive: true });
    // A directory at the settings path is unreadable and cannot be replaced by
    // the atomic rename, so the explicit reset must report failure.
    await mkdir(appSupport(env, 'settings.json'));
    await launch('recovery-global-failure', env);

    await openSettings();
    await page.waitForSelector('[data-settings-warning="unreadable"]');
    await openDataPage();
    await page.locator('[data-settings-reset-file="true"]').click();
    await page.waitForSelector('[data-settings-file-recovery-error="true"]', {
      timeout: 15000,
    });
    assert.match(
      await page.locator('[data-settings-file-recovery-error="true"]').innerText(),
      /Could not reset settings/,
    );
    // Not a false success: status, banner, and file are unchanged.
    assert.equal(
      await page.locator('[data-settings-file-status]').getAttribute('data-settings-file-status'),
      'unreadable',
    );
    assert.equal(await page.locator('[data-settings-warning="unreadable"]').count(), 1);
    assert.equal((await stat(appSupport(env, 'settings.json'))).isDirectory(), true);
    assert.equal((await appSettings()).saveState.status, 'error');

    // The warning and action survive: once the cause is gone the same Reset
    // succeeds, so the failure never left a false "saved" state behind.
    await rm(appSupport(env, 'settings.json'), { recursive: true, force: true });
    await page.locator('[data-settings-reset-file="true"]').click();
    await waitSettingsState('settingsStatus', 'ok');
    const stored = JSON.parse(await readFile(appSupport(env, 'settings.json'), 'utf8'));
    assert.equal(stored.settingsVersion, 4);
    assert.equal((await appSettings()).saveState.status, 'saved');
  });

  it('resets a corrupt document map with confirmation and leaves note content intact (S3-13)', async () => {
    const env = ui.isolated('recovery-map-reset');
    await mkdir(env.NOTEFOREST_APP_SUPPORT, { recursive: true });
    const packagePath = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'recovery-map-reset',
      multiPageBlocksDocument(8),
    );
    const noteBefore = await readFile(join(packagePath, 'document.json'), 'utf8');
    const documentId = JSON.parse(noteBefore).id;
    await writeFile(appSupport(env, 'document-settings.json'), '{broken', 'utf8');
    await launch('recovery-map-reset', env);

    const opened = await page.evaluate(
      (path) => window.__noteforestTest.openPath(path),
      packagePath,
    );
    assert.equal(opened, true, 'the fixture package opens');
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      packagePath,
      { timeout: 10000 },
    );
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');

    await openSettings();
    await page.waitForSelector('[data-document-settings-warning="corrupt"]');
    await page.locator('[data-document-settings-dismiss-warning="true"]').click();
    await page.waitForSelector('[data-document-settings-warning="corrupt"]', {
      state: 'detached',
    });
    assert.equal((await appSettings()).documentSettingsStatus.state, 'corrupt');
    assert.equal((await appSettings()).dismissedWarnings.document, true);

    await openDataPage();
    assert.equal(
      await page
        .locator('[data-document-settings-file-status]')
        .getAttribute('data-document-settings-file-status'),
      'corrupt',
    );
    // No valid backup exists, so Restore is not offered; Reset is.
    assert.equal(await page.locator('[data-document-settings-restore="true"]').count(), 0);
    assert.equal(await page.locator('[data-document-settings-reset="true"]').count(), 1);

    // While the map is corrupt an ordinary override is refused on disk.
    await page.evaluate(
      (path) =>
        window.__noteforestTest.setPageSettingsOverride(path, {
          theme: { density: 0.8 },
        }),
      packagePath,
    );
    assert.equal((await appSettings()).saveState.status, 'error');
    assert.equal(
      await readFile(appSupport(env, 'document-settings.json'), 'utf8'),
      '{broken',
      'an ordinary override never overwrites a corrupt map',
    );

    // Reset is never implicit: it needs the in-app confirmation and names scope.
    await page.locator('[data-document-settings-reset="true"]').click();
    await page.waitForSelector('[data-document-settings-confirm-panel="reset"]');
    assert.match(
      await page.locator('[data-document-settings-confirm-panel="reset"]').innerText(),
      /This removes all per-document page overrides\. Note content is not affected\./,
    );
    await h.screenshot(join(screenshotDir, 'document-map-reset-confirm.png'));
    await page.locator('[data-document-settings-confirm="reset"]').click();
    await waitSettingsState('documentSettingsStatus', 'ok');

    const store = await appSettings();
    assert.deepEqual(store.documentSettings, [], 'in-memory entries are cleared');
    assert.deepEqual(store.pageOverrides, {}, 'in-memory overrides are cleared');
    assert.deepEqual(store.dismissedWarnings.document, false);
    assert.equal(store.saveState.status, 'saved');

    const map = JSON.parse(await readFile(appSupport(env, 'document-settings.json'), 'utf8'));
    assert.equal(map.version, 1);
    assert.deepEqual(map.entries, [], 'the on-disk map is empty');
    const names = await fileNames(env.NOTEFOREST_APP_SUPPORT);
    const backup = names.find((name) => /^document-settings\.backup-.*\.json$/.test(name));
    assert.ok(backup, `a backup of the corrupt map exists: ${names.join(', ')}`);
    assert.equal(
      await readFile(appSupport(env, backup), 'utf8'),
      '{broken',
      'the corrupt bytes are preserved',
    );
    const corrupt = names.find((name) => /^document-settings\.corrupt-.*\.json$/.test(name));
    assert.ok(corrupt, 'the read-time corrupt copy is kept too');

    // Note content is untouched.
    assert.equal(await readFile(join(packagePath, 'document.json'), 'utf8'), noteBefore);

    // Saves work again after the explicit reset.
    await page.evaluate(
      (path) =>
        window.__noteforestTest.setPageSettingsOverride(path, {
          theme: { density: 0.8 },
        }),
      packagePath,
    );
    await page.waitForFunction(
      () => window.__noteforestTest.settings().saveState.status === 'saved',
      undefined,
      { timeout: 15000 },
    );
    const saved = JSON.parse(
      await readFile(appSupport(env, 'document-settings.json'), 'utf8'),
    );
    assert.equal(saved.entries.length, 1);
    assert.equal(saved.entries[0].documentId, documentId);
    assert.deepEqual(saved.entries[0].page, { theme: { density: 0.8 } });
  });

  it('restores the newest valid document map backup over a corrupt map (S3-13)', async () => {
    const env = ui.isolated('recovery-map-restore');
    await mkdir(env.NOTEFOREST_APP_SUPPORT, { recursive: true });
    await writeFile(appSupport(env, 'document-settings.json'), '{broken', 'utf8');
    const backupName = 'document-settings.backup-2026-01-01T00-00-00-000Z.json';
    const restoredEntry = {
      documentId: 'restored-doc',
      packagePath: '/restored/doc',
      page: { theme: { density: 0.85 } },
    };
    await writeFile(
      appSupport(env, backupName),
      JSON.stringify({ version: 1, entries: [restoredEntry] }),
      'utf8',
    );
    await launch('recovery-map-restore', env);

    await openSettings();
    await page.waitForSelector('[data-document-settings-warning="corrupt"]');
    await openDataPage();
    assert.equal(
      await page
        .locator('[data-document-settings-file-status]')
        .getAttribute('data-document-settings-file-status'),
      'corrupt',
    );
    // A valid backup exists, so Restore is offered (and points at that file).
    assert.equal(await page.locator('[data-document-settings-restore="true"]').count(), 1);
    assert.match(
      await page.locator('[data-document-settings-backup-path="true"]').innerText(),
      new RegExp(backupName.replaceAll('.', '\\.')),
    );

    await page.locator('[data-document-settings-restore="true"]').click();
    await page.waitForSelector('[data-document-settings-confirm-panel="restore"]');
    await page.locator('[data-document-settings-confirm="restore"]').click();
    await waitSettingsState('documentSettingsStatus', 'ok');

    const store = await appSettings();
    assert.deepEqual(store.documentSettings, [restoredEntry]);
    assert.equal(store.pageOverrides['/restored/doc']?.theme?.density, 0.85);
    assert.equal(store.dismissedWarnings.document, false);

    const map = JSON.parse(await readFile(appSupport(env, 'document-settings.json'), 'utf8'));
    assert.deepEqual(map.entries, [restoredEntry], 'the restored map is on disk');
    const names = await fileNames(env.NOTEFOREST_APP_SUPPORT);
    const backups = names.filter((name) =>
      /^document-settings\.backup-.*\.json$/.test(name),
    );
    assert.ok(backups.length >= 2, `the current map was backed up first: ${names.join(', ')}`);
    const corruptCopies = await Promise.all(
      backups
        .filter((name) => name !== backupName)
        .map((name) => readFile(appSupport(env, name), 'utf8')),
    );
    assert.ok(
      corruptCopies.includes('{broken'),
      'the replaced corrupt bytes are preserved',
    );
  });

  it('resets an unreadable document map and clears the in-memory override (S3-13)', async () => {
    const env = ui.isolated('recovery-map-unreadable');
    await mkdir(env.NOTEFOREST_APP_SUPPORT, { recursive: true });
    const mapPath = appSupport(env, 'document-settings.json');
    await writeFile(
      mapPath,
      JSON.stringify({
        version: 1,
        entries: [
          { documentId: 'doc', packagePath: '/doc', page: { theme: { density: 0.8 } } },
        ],
      }),
      'utf8',
    );
    await chmod(mapPath, 0o000);
    await launch('recovery-map-unreadable', env);

    await openSettings();
    await openDataPage();
    assert.equal(
      await page
        .locator('[data-document-settings-file-status]')
        .getAttribute('data-document-settings-file-status'),
      'unreadable',
    );
    assert.equal(await page.locator('[data-document-settings-reset="true"]').count(), 1);

    await page.locator('[data-document-settings-reset="true"]').click();
    await page.waitForSelector('[data-document-settings-confirm-panel="reset"]');
    await page.locator('[data-document-settings-confirm="reset"]').click();
    await waitSettingsState('documentSettingsStatus', 'ok');
    const map = JSON.parse(await readFile(mapPath, 'utf8'));
    assert.deepEqual(map.entries, []);
    assert.deepEqual((await appSettings()).pageOverrides, {});
  });
});
