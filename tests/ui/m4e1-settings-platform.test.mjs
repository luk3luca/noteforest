import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath, waitUntil } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { multiPageBlocksDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * M4e1 settings platform on the Batch A shell.
 *
 * S2-1: Settings opens with zero documents; global controls work and the
 * per-document scope is disabled with a reason. S2-2: a per-document override
 * survives close -> quit -> reopen and lives in document-settings.json, not the
 * session. S2-5: a corrupt settings.json is backed up and warned in the UI; a
 * failed write is visible instead of a false "saved". S2-6: Continuous zoom is
 * only the per-document view state.
 *
 * Batch A replaces the draft/Apply model with instant save: every real change
 * writes (sliders debounced), the footer reports Saving/Saved/error, and a
 * scope switch never writes or creates an override.
 */

const tempRoot = artifactsPath('m4e1-ui');
const screenshotDir = artifactsPath('m4e1-settings');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(name, env) {
  page = await ui.launch({ ...(env ?? ui.isolated(name)), NOTEFOREST_E2E_HIDDEN: '1' });
  await h.setWindowSize(1440, 900);
}

async function openPackage(env, name, document) {
  const packagePath = await writePagePackage(env.NOTEFOREST_LIBRARY, name, document);
  const opened = await page.evaluate(
    (path) => window.__noteforestTest.openPath(path),
    packagePath,
  );
  assert.equal(opened, true, 'fixture package opens');
  await page.waitForFunction(
    (path) => window.__noteforestTest.state().activeTab === path,
    packagePath,
    { timeout: 10000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  return packagePath;
}

async function showPageRead() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await page.waitForFunction(
    () => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return (
        view !== null &&
        view.getAttribute('data-ready') === 'true' &&
        view.getAttribute('data-updating') !== 'true'
      );
    },
    undefined,
    { timeout: 30000 },
  );
}

async function openSettingsWithShortcut() {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  await page.keyboard.press('Meta+,');
  await page.waitForSelector('[data-settings-dialog="true"]');
  assert.equal(await page.locator('.nf-settings-heading').innerText(), 'Settings');
  // ⌘, opens General; the density lens lives on the Page page.
  assert.equal(
    await page.locator('[data-settings-nav="general"]').getAttribute('aria-current'),
    'page',
    '⌘, lands on General',
  );
  await page.locator('[data-settings-nav="page"]').click();
  await page.waitForSelector('[data-page-density-section="true"]');
}

async function openSettingsFromPalette() {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('.nf-palette');
  await page.getByRole('option', { name: /Settings/ }).click();
  await page.waitForSelector('[data-settings-dialog="true"]');
  await page.locator('[data-settings-nav="page"]').click();
  await page.waitForSelector('[data-page-density-section="true"]');
}

async function closeSettings() {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
}

async function densityDraftValue() {
  return (await page.locator('[data-page-density-value]').textContent())?.trim();
}

async function waitSavedGlobal(percent) {
  await page.waitForFunction(
    (expected) =>
      Math.round(window.__noteforestTest.settings().app.page.theme.density * 100) === expected &&
      window.__noteforestTest.settings().saveState.status === 'saved',
    percent,
    { timeout: 15000 },
  );
}

async function waitSavedOverride(packagePath, percent) {
  await page.waitForFunction(
    ({ path, expected }) => {
      const state = window.__noteforestTest.settings();
      const density = state.pageOverrides[path]?.theme?.density;
      return Math.round(density * 100) === expected && state.saveState.status === 'saved';
    },
    { path: packagePath, expected: percent },
    { timeout: 15000 },
  );
}

async function settingsOnDisk(env) {
  return JSON.parse(
    await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'settings.json'), 'utf8'),
  );
}

async function documentSettingsOnDisk(env) {
  return JSON.parse(
    await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'document-settings.json'), 'utf8'),
  );
}

async function sessionOnDisk(env) {
  return JSON.parse(
    await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'shell-session.json'), 'utf8'),
  );
}

function activePageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

async function pageDensity() {
  return Number(await activePageView().getAttribute('data-page-density'));
}

async function viewZoom(packagePath) {
  return page.evaluate(
    (path) => window.__noteforestTest.viewState()[path]?.zoom ?? null,
    packagePath,
  );
}

async function appSettings() {
  return page.evaluate(() => window.__noteforestTest.settings());
}

describe('M4e1 settings platform', () => {
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

  it('opens Settings with zero documents and keeps global controls usable (S2-1)', async () => {
    const env = ui.isolated('m4e1-no-document');
    await launch('m4e1-no-document', env);
    assert.deepEqual((await h.state()).tabs, [], 'the session starts with no documents');

    await openSettingsWithShortcut();
    const documentScope = page.locator('[data-page-scope-option="document"]');
    assert.equal(await documentScope.isDisabled(), true, 'document scope is disabled');
    assert.equal(
      await page.locator('[data-page-document-reason="true"]').isVisible(),
      true,
      'the disabled document scope explains why',
    );
    assert.equal(
      await page.locator('[data-page-density-slider]').isEnabled(),
      true,
      'the global density control is usable',
    );

    // Instant save: the slider writes the global default with no Apply button.
    const slider = page.locator('[data-page-density-slider]');
    await slider.focus();
    await slider.press('ArrowLeft');
    await slider.press('ArrowLeft');
    await slider.press('ArrowLeft');
    assert.equal(await densityDraftValue(), '85%');
    assert.equal(await page.locator('[data-page-density-apply]').count(), 0);
    assert.equal(await page.locator('[data-page-density-cancel]').count(), 0);
    await waitSavedGlobal(85);
    assert.equal(
      await page.locator('[data-settings-status]').getAttribute('data-settings-status'),
      'saved',
    );
    await page.screenshot({ path: join(screenshotDir, 'settings-no-document.png') });
    await closeSettings();
    const stored = await settingsOnDisk(env);
    assert.equal(stored.page.theme.density, 0.85, 'the global default was written');
    assert.equal(stored.settingsVersion, 5);

    // The palette path reaches the same app-level Settings surface.
    await openSettingsFromPalette();
    assert.equal(await densityDraftValue(), '85%');
    await closeSettings();

    // A document opened later inherits the global default.
    const packagePath = await openPackage(env, 'settings-inherit', multiPageBlocksDocument(12));
    await showPageRead();
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-page-density') === '85',
      undefined,
      { timeout: 30000 },
    );
    assert.equal(await pageDensity(), 85, 'a new document uses the global default');
    assert.equal(packagePath, (await h.state()).activeTab);
  });

  it('keeps a per-document override across close, quit, and reopen (S2-2)', async () => {
    const env = ui.isolated('m4e1-override');
    await launch('m4e1-override', env);
    const packagePath = await openPackage(env, 'settings-override', multiPageBlocksDocument(24));
    await showPageRead();
    assert.equal(await pageDensity(), 100);

    // S2-6: Continuous zoom still works, per document, and no settings zoom
    // control exists alongside it.
    await page.keyboard.press('Meta+2');
    await page.keyboard.press('Meta+=');
    assert.equal(await viewZoom(packagePath), 1.1, 'Continuous zoom changed for this document');
    const continuousSettings = (await appSettings()).app.continuous;
    assert.equal(continuousSettings.zoom, undefined, 'no global zoom setting');
    assert.equal(continuousSettings.viewState, undefined, 'no global view state');
    await showPageRead();

    await openSettingsWithShortcut();
    // Switching scope alone is not a write and creates no override.
    await page.locator('[data-page-scope-option="document"]').click();
    assert.equal(
      (await appSettings()).pageOverrides[packagePath],
      undefined,
      'scope switch creates no override',
    );
    const slider = page.locator('[data-page-density-slider]');
    await slider.focus();
    await slider.press('ArrowLeft');
    await slider.press('ArrowLeft');
    await slider.press('ArrowLeft');
    await slider.press('ArrowLeft');
    assert.equal(await densityDraftValue(), '80%');
    await waitSavedOverride(packagePath, 80);
    assert.equal(
      await page.locator('[data-page-density-override]').count(),
      1,
      'the override dot appears in document scope',
    );
    await closeSettings();
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-page-density') === '80',
      undefined,
      { timeout: 30000 },
    );
    assert.equal(
      (await appSettings()).app.page.theme.density,
      1,
      'the global default is unchanged',
    );

    const documentId = JSON.parse(
      await readFile(join(packagePath, 'document.json'), 'utf8'),
    ).id;
    const durable = await documentSettingsOnDisk(env);
    assert.deepEqual(
      durable.entries.find((entry) => entry.documentId === documentId)?.page,
      { theme: { density: 0.8 } },
    );
    await page.evaluate(() => window.__noteforestTest.flushSession());
    assert.equal(
      (await sessionOnDisk(env)).tabs.find((tab) => tab.packagePath === packagePath)
        ?.pageSettingsOverride,
      undefined,
      'the override is not in the session',
    );

    // Close the tab, quit, relaunch with the same app-support, reopen.
    await page.keyboard.press('Meta+w');
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs.length === 0,
      undefined,
      { timeout: 10000 },
    );
    await h.quit();

    await launch('m4e1-override', env);
    assert.deepEqual((await h.state()).tabs, [], 'the reopened app starts with no tabs');
    // Open the exact original package (not a freshly written fixture).
    const reopened = await page.evaluate(
      (path) => window.__noteforestTest.openPath(path),
      packagePath,
    );
    assert.equal(reopened, true, 'the original package reopens');
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      packagePath,
      { timeout: 10000 },
    );
    await showPageRead();
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-page-density') === '80',
      undefined,
      { timeout: 30000 },
    );
    assert.equal(await pageDensity(), 80, 'the per-document override survived restart');
    const restored = await appSettings();
    assert.equal(restored.pageOverrides[packagePath]?.theme?.density, 0.8);
    assert.deepEqual(
      restored.documentSettings.find((entry) => entry.documentId === documentId)?.page,
      { theme: { density: 0.8 } },
    );
  });

  it('backs up a corrupt settings.json and warns in Settings', async () => {
    const env = ui.isolated('m4e1-corrupt');
    await mkdir(env.NOTEFOREST_APP_SUPPORT, { recursive: true });
    await writeFile(
      join(env.NOTEFOREST_APP_SUPPORT, 'settings.json'),
      '{not json',
      'utf8',
    );
    await launch('m4e1-corrupt', env);
    await openSettingsWithShortcut();
    await page.waitForSelector('[data-settings-warning="corrupt"]');
    const warning = await page.locator('[data-settings-warning="corrupt"]').innerText();
    assert.match(warning, /could not be read/i);
    const entries = await import('node:fs/promises').then((fs) =>
      fs.readdir(env.NOTEFOREST_APP_SUPPORT),
    );
    const backup = entries.find((name) => /^settings\.corrupt-.*\.json$/.test(name));
    assert.ok(backup, `a corrupt backup exists: ${entries.join(', ')}`);
    assert.equal(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, backup), 'utf8'),
      '{not json',
    );
    // The damaged file was not replaced by the read.
    assert.equal(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'settings.json'), 'utf8'),
      '{not json',
    );

    // UI Sentinel F3: an ordinary change must not overwrite the corrupt file.
    // The write is refused, the footer never claims success, and the warning and
    // backup stay exactly as they were.
    const slider = page.locator('[data-page-density-slider]');
    await slider.focus();
    await slider.press('ArrowLeft');
    await page.waitForSelector('[data-settings-save-error="true"]', { timeout: 15000 });
    assert.equal(
      await page.locator('[data-settings-status]').getAttribute('data-settings-status'),
      'error',
      'a refused write is never reported as saved',
    );
    assert.match(
      await page.locator('[data-settings-save-error="true"]').innerText(),
      /corrupt/i,
      'the refusal explains that the file is corrupt',
    );
    assert.equal(
      await page.locator('[data-settings-warning="corrupt"]').isVisible(),
      true,
      'the corrupt warning stays visible',
    );
    assert.equal(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'settings.json'), 'utf8'),
      '{not json',
      'the ordinary change left the corrupt bytes untouched',
    );
    assert.equal(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, backup), 'utf8'),
      '{not json',
      'the corrupt backup is untouched',
    );

    // The explicit Reset is the only path that replaces the file.
    await page.locator('[data-settings-reset="true"]').click();
    await page.waitForSelector('[data-settings-warning="corrupt"]', { state: 'detached' });
    await page.waitForFunction(
      () => window.__noteforestTest.settings().saveState.status === 'saved',
      undefined,
      { timeout: 15000 },
    );
    assert.equal(
      await page.locator('[data-settings-status]').getAttribute('data-settings-status'),
      'saved',
      'the successful reset reports saved',
    );
    const resetBytes = await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'settings.json'), 'utf8');
    const resetFile = JSON.parse(resetBytes);
    assert.equal(resetFile.settingsVersion, 5, 'the reset writes a valid current file');
    assert.equal(resetFile.page.theme.density, 1, 'the reset restores the product defaults');
    assert.equal(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, backup), 'utf8'),
      '{not json',
      'a successful reset keeps the corrupt evidence',
    );

    // Once the file is valid again, ordinary changes save.
    await slider.focus();
    await slider.press('ArrowLeft');
    await waitUntil(async () => {
      try {
        const stored = JSON.parse(
          await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'settings.json'), 'utf8'),
        );
        return stored.page?.theme?.density === 0.95;
      } catch {
        return false;
      }
    }, 'the post-reset change is written', 15000);
    assert.equal(await page.locator('[data-settings-warning="corrupt"]').count(), 0);
    await closeSettings();
  });

  it('shows a failed settings write instead of a false saved state', async () => {
    const env = ui.isolated('m4e1-write-failure');
    await launch('m4e1-write-failure', env);
    await openSettingsWithShortcut();
    const slider = page.locator('[data-page-density-slider]');
    await slider.focus();

    // Make the app-support directory read-only so the atomic temp file cannot
    // be created before the debounced write starts. The UI must not claim
    // success.
    const before = (await stat(env.NOTEFOREST_APP_SUPPORT)).mode & 0o777;
    await chmod(env.NOTEFOREST_APP_SUPPORT, 0o500);
    try {
      await slider.press('ArrowLeft');
      await page.waitForSelector('[data-settings-save-error="true"]', { timeout: 15000 });
      assert.equal(
        await page.locator('[data-page-density-saved="true"]').count(),
        0,
        'no success note after a failed write',
      );
      assert.equal(
        await page.locator('[data-settings-status]').getAttribute('data-settings-status'),
        'error',
      );
    } finally {
      await chmod(env.NOTEFOREST_APP_SUPPORT, before);
    }

    // Retry succeeds once the directory is writable again.
    await page.locator('[data-settings-retry="true"]').click();
    await waitSavedGlobal(95);
    assert.equal(
      await page.locator('[data-settings-save-error="true"]').count(),
      0,
      'the error clears after the retry',
    );
    await closeSettings();
    const stored = await settingsOnDisk(env);
    assert.equal(stored.page.theme.density, 0.95);
  });
});
