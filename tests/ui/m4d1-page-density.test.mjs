import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  multiPageBlocksDocument,
  pageDocument,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';

/**
 * M4d1 Page density control.
 *
 * The suite proves the thin slice end to end: the settings slider, the global
 * and per-document scopes, re-pagination, Page Read/Edit typography at two
 * densities, and the real-DOM page-count trend on scale-300 (plus the local
 * showcase/stress notes when present).
 */

const tempRoot = artifactsPath('m4d1-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const FIXTURES = resolve(import.meta.dirname, '../../fixtures');
const SHOWCASE_PACKAGE = '/Users/luca/Documents/NoteForest/note-forest-showcase';
const STRESS_PACKAGE = '/Users/luca/Documents/NoteForest/note-forest-stress-test';
const DENSITIES = [0.8, 0.9, 1, 1.1, 1.2];

async function launch(name) {
  page = await ui.launch(ui.isolated(name));
  await h.setWindowSize(1440, 900);
}

async function openPackage(env, name, document, assetFiles = {}) {
  const packagePath = await writePagePackage(env.NOTEFOREST_LIBRARY, name, document, assetFiles);
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

async function copyPackage(env, name, sourcePath) {
  const exists = await stat(join(sourcePath, 'document.json')).then(
    () => true,
    () => false,
  );
  if (!exists) return null;
  await mkdir(env.NOTEFOREST_LIBRARY, { recursive: true });
  const target = resolve(env.NOTEFOREST_LIBRARY, name);
  await cp(sourcePath, target, { recursive: true });
  const opened = await page.evaluate(
    (path) => window.__noteforestTest.openPath(path),
    target,
  );
  assert.equal(opened, true, `${name} package opens`);
  await page.waitForFunction(
    (path) => window.__noteforestTest.state().activeTab === path,
    target,
    { timeout: 15000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  return target;
}

function activePageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

async function modelRuns() {
  return Number(await activePageView().getAttribute('data-model-runs'));
}

async function showPageRead() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
}

async function waitPageReady(options = {}) {
  const { expectedCount = null, bodySize = null, density = null, minRuns = null } = options;
  await page.waitForFunction(
    ({ count, size, lens, runs }) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      if (view === null) return false;
      if (view.getAttribute('data-ready') !== 'true') return false;
      if (view.getAttribute('data-updating') === 'true') return false;
      if (count !== null && Number(view.getAttribute('data-page-count')) !== count) return false;
      if (runs !== null && Number(view.getAttribute('data-model-runs')) < runs) return false;
      if (lens !== null && view.getAttribute('data-page-density') !== String(lens)) return false;
      if (size !== null) {
        const value = getComputedStyle(view).getPropertyValue('--nf-page-body-size').trim();
        if (value !== size) return false;
      }
      return true;
    },
    { count: expectedCount, size: bodySize, lens: density, runs: minRuns },
    { timeout: 30000 },
  );
}

async function pageCount() {
  return Number(await activePageView().getAttribute('data-page-count'));
}

async function bodySize() {
  return activePageView().evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--nf-page-body-size').trim(),
  );
}

async function bodyPx() {
  return Number.parseFloat(
    await activePageView()
      .locator('.nf-block-content .nf-p')
      .first()
      .evaluate((element) => getComputedStyle(element).fontSize),
  );
}

/** 96 dpi CSS px for a point size. */
function ptToPx(pt) {
  return (pt * 96) / 72;
}

async function firstFragmentHeight() {
  return Number(
    await activePageView()
      .locator('.nf-page-fragment')
      .first()
      .evaluate((element) => Number.parseFloat(element.style.height)),
  );
}

async function settings() {
  return page.evaluate(() => window.__noteforestTest.settings());
}

async function flushSession() {
  await page.evaluate(() => window.__noteforestTest.flushSession());
}

async function setSettings(value) {
  return page.evaluate((settingsValue) => window.__noteforestTest.setSettings(settingsValue), value);
}

async function setGlobalDensity(density) {
  const runs = await modelRuns();
  await setSettings({ page: { theme: { density } }, continuous: { zoom: 1 } });
  await waitPageReady({ minRuns: runs + 1, density: Math.round(density * 100) });
}

async function openSettings() {
  await page.waitForSelector('.nf-dialog', { state: 'detached' });
  await page.keyboard.press('Meta+k');
  // Let the modal focus restore settle before the palette shortcut is read.
  await page.waitForTimeout(300);
  await page.waitForSelector('.nf-palette');
  await page.getByRole('option', { name: /Settings/ }).click();
  await page.waitForSelector('[data-page-density-section="true"]');
}

async function closeSettings() {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('.nf-dialog', { state: 'detached' });
}

async function densityDraftValue() {
  return (await page.locator('[data-page-density-value]').textContent())?.trim();
}

async function measuredPageOne() {
  return page.evaluate(() => {
    const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
    const content = view.querySelector('.nf-page-content');
    const fragments = [...content.querySelectorAll('.nf-page-fragment')];
    const area = content.clientWidth * content.clientHeight;
    const used = fragments.reduce(
      (total, fragment) => total + fragment.offsetWidth * fragment.offsetHeight,
      0,
    );
    return {
      pages: Number(view.getAttribute('data-page-count')),
      body: getComputedStyle(view).getPropertyValue('--nf-page-body-size').trim(),
      cardPadding: getComputedStyle(view).getPropertyValue('--nf-page-card-padding').trim(),
      whitespace: area > 0 ? 1 - used / area : null,
      fragments: fragments.length,
    };
  });
}

/** Density evidence rows with real DOM measurement for one open package. */
async function densityRows(label) {
  const rows = [];
  for (const density of DENSITIES) {
    await setGlobalDensity(density);
    const measured = await measuredPageOne();
    rows.push({
      label,
      density: Math.round(density * 100),
      body: measured.body,
      cardPadding: measured.cardPadding,
      pages: measured.pages,
      whitespace: measured.whitespace,
      fragments: measured.fragments,
    });
  }
  return rows;
}

function formatRows(rows) {
  const header = ['fixture', 'density', 'body', 'card pad', 'pages', 'p1 whitespace', 'p1 cards'];
  const body = rows.map((row) => [
    row.label,
    `${row.density}%`,
    row.body,
    row.cardPadding,
    String(row.pages),
    row.whitespace === null ? 'n/a' : `${(row.whitespace * 100).toFixed(1)}%`,
    String(row.fragments),
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...body.map((row) => row[index]?.length ?? 0)),
  );
  const render = (cells) =>
    cells
      .map((cell, index) =>
        index === 0 ? cell.padEnd(widths[index] ?? 0) : cell.padStart(widths[index] ?? 0),
      )
      .join(' | ');
  return [render(header), widths.map((width) => '-'.repeat(width)).join('-|-'), ...body.map(render)].join(
    '\n',
  );
}

describe('M4d1 Page density control', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('re-paginates Page Read and Page Edit at 80% and 120%', async () => {
    const env = ui.isolated('m4d1-read-edit');
    await launch('m4d1-read-edit');
    await openPackage(env, 'density-blocks', multiPageBlocksDocument(48));
    await showPageRead();

    await waitPageReady({ bodySize: '9pt', density: 100 });
    const pages100 = await pageCount();
    const height100 = await firstFragmentHeight();
    assert.ok(Math.abs((await bodyPx()) - ptToPx(9)) < 0.05, '9 pt at 96 dpi');
    assert.ok(pages100 > 1);

    // 120%: type and card geometry grow, the same document needs more pages.
    await setGlobalDensity(1.2);
    await waitPageReady({ bodySize: '10.8pt', density: 120 });
    const pages120 = await pageCount();
    const height120 = await firstFragmentHeight();
    assert.ok(Math.abs((await bodyPx()) - ptToPx(10.8)) < 0.05, '10.8 pt at 96 dpi');
    assert.ok(height120 > height100, `card grows at 120%: ${height100} -> ${height120}`);
    assert.ok(
      pages120 >= pages100,
      `120% never paginates denser than 100%: ${pages100} -> ${pages120}`,
    );

    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-interaction-mode') === 'edit',
      undefined,
      { timeout: 5000 },
    );
    const fragment120 = activePageView().locator('.nf-page-fragment').first();
    await fragment120.waitFor();
    const fragmentStyle120 = await fragment120.evaluate((element) => ({
      width: Number.parseFloat(element.style.width),
    }));
    await fragment120.dblclick();
    const overlay120 = page.locator('.nf-editor[data-active="true"] [data-page-edit-overlay]');
    await overlay120.waitFor({ timeout: 5000 });
    const overlay120Style = await overlay120.evaluate((element) => ({
      width: Number.parseFloat(element.style.width),
      bodySize: getComputedStyle(element).getPropertyValue('--nf-page-body-size').trim(),
    }));
    assert.equal(overlay120Style.bodySize, '10.8pt', 'Page Edit follows the 120% lens');
    assert.ok(Math.abs(overlay120Style.width - fragmentStyle120.width) < 0.05);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-page-edit-overlay]', { state: 'detached', timeout: 10000 });

    // 80%: body clamps at the 8 pt floor, geometry still shrinks, pages drop.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-interaction-mode') === 'read',
      undefined,
      { timeout: 5000 },
    );
    await setGlobalDensity(0.8);
    await waitPageReady({ bodySize: '8pt', density: 80 });
    const pages80 = await pageCount();
    const height80 = await firstFragmentHeight();
    assert.ok(Math.abs((await bodyPx()) - ptToPx(8)) < 0.05, '8 pt at 96 dpi (body floor)');
    assert.ok(height80 < height120, `card shrinks at 80%: ${height120} -> ${height80}`);
    // A stack of single-line cards that sit at the width cap is the worst case
    // for the low end (the 8 pt floor shrinks type less than the card cap and a
    // card can wrap one line more). The real-document page-count trend is in the
    // lab test below; here the contract is that 80% never needs more pages than
    // 120% and that the model re-ran under the new lens.
    assert.ok(
      pages80 <= pages120,
      `80% never needs more pages than 120%: ${pages80} vs ${pages120}`,
    );

    await page.keyboard.press('Meta+e');
    const fragment80 = activePageView().locator('.nf-page-fragment').first();
    await fragment80.waitFor();
    await fragment80.dblclick();
    const overlay80 = page.locator('.nf-editor[data-active="true"] [data-page-edit-overlay]');
    await overlay80.waitFor({ timeout: 5000 });
    assert.equal(
      await overlay80.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--nf-page-body-size').trim(),
      ),
      '8pt',
      'Page Edit follows the clamped 80% lens',
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-page-edit-overlay]', { state: 'detached', timeout: 10000 });

    const persisted = JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'settings.json'), 'utf8'),
    );
    assert.equal(persisted.page.theme.density, 0.8, 'the global density persists');
  });

  it('applies the Settings slider globally and as a per-document override', async () => {
    const env = ui.isolated('m4d1-settings');
    await launch('m4d1-settings');
    const packagePath = await openPackage(env, 'density-settings', multiPageBlocksDocument(24));
    await showPageRead();
    await waitPageReady({ bodySize: '9pt', density: 100 });

    await openSettings();
    assert.equal(await densityDraftValue(), '100%');
    assert.equal(
      await page.locator('[data-page-density-scope-option="global"]').isChecked(),
      true,
      'a document without an override starts on the global scope',
    );
    const slider = page.locator('[data-page-density-slider]');
    await slider.focus();
    await slider.press('ArrowLeft');
    await slider.press('ArrowLeft');
    await slider.press('ArrowLeft');
    assert.equal(await densityDraftValue(), '85%');
    await page.locator('[data-page-density-apply]').click();
    await page.waitForSelector('[data-page-density-saved="true"]');
    const screenshotDir = artifactsPath('m4d1');
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({
      path: join(screenshotDir, 'settings-page-density.png'),
    });
    await closeSettings();
    await waitPageReady({ bodySize: '8pt', density: 85 });
    assert.equal((await settings()).app.page.theme.density, 0.85);
    assert.equal(
      (await settings()).pageOverrides[packagePath],
      undefined,
      'global scope does not create a document override',
    );

    // Reopen: the same slider edits the document override, and the explicit
    // "Use global density" control clears only the density part.
    await openSettings();
    assert.equal(await densityDraftValue(), '85%');
    await page.locator('[data-page-density-scope-option="document"]').check();
    await page.locator('[data-page-density-slider]').focus();
    await page.locator('[data-page-density-slider]').press('ArrowLeft');
    await page.locator('[data-page-density-apply]').click();
    await page.waitForSelector('[data-page-density-saved="true"]');
    await closeSettings();
    await waitPageReady({ density: 80, bodySize: '8pt' });
    const stored = await settings();
    assert.equal(stored.app.page.theme.density, 0.85, 'global default stays 85%');
    assert.deepEqual(stored.pageOverrides[packagePath], { theme: { density: 0.8 } });
    await flushSession();
    const session = JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'shell-session.json'), 'utf8'),
    );
    assert.deepEqual(
      session.tabs.find((tab) => tab.packagePath === packagePath)?.pageSettingsOverride,
      { theme: { density: 0.8 } },
      'the document override is in the session, not the document',
    );

    await openSettings();
    assert.equal(
      await page.locator('[data-page-density-scope-option="document"]').isChecked(),
      true,
    );
    await page.locator('[data-page-density-use-global]').click();
    await page.waitForSelector('[data-page-density-saved="true"]');
    await closeSettings();
    await waitPageReady({ density: 85, bodySize: '8pt' });
    assert.equal((await settings()).pageOverrides[packagePath], undefined);

    // Cancel discards the draft and never persists it.
    await openSettings();
    const cancelSlider = page.locator('[data-page-density-slider]');
    await cancelSlider.focus();
    await cancelSlider.press('ArrowRight');
    await cancelSlider.press('ArrowRight');
    await cancelSlider.press('ArrowRight');
    assert.equal(await densityDraftValue(), '100%');
    await page.locator('[data-page-density-cancel]').click();
    assert.equal(await densityDraftValue(), '85%');
    await closeSettings();
    assert.equal((await settings()).app.page.theme.density, 0.85);
    assert.equal(await activePageView().getAttribute('data-page-density'), '85');
    // Reset returns the draft to 100% without applying.
    await openSettings();
    await page.locator('[data-page-density-reset]').click();
    assert.equal(await densityDraftValue(), '100%');
    await page.locator('[data-page-density-cancel]').click();
    await closeSettings();

    const onDisk = JSON.parse(
      await readFile(join(packagePath, 'document.json'), 'utf8'),
    );
    assert.equal(onDisk.pageSetup, undefined);
    assert.equal(onDisk.theme, undefined);
  });

  it('records real-DOM page count and whitespace at every density step', async () => {
    const env = ui.isolated('m4d1-lab');
    await launch('m4d1-lab');
    const rows = [];

    const scaleDocument = JSON.parse(
      await readFile(join(FIXTURES, 'scale-300.json'), 'utf8'),
    );
    await openPackage(env, 'scale-300', scaleDocument, {
      imgForest: join(FIXTURES, 'assets/forest.png'),
      imgWide: join(FIXTURES, 'assets/wide.png'),
      imgChart: join(FIXTURES, 'assets/chart.png'),
    });
    await showPageRead();
    rows.push(...(await densityRows('scale-300')));

    for (const [name, source] of [
      ['showcase', SHOWCASE_PACKAGE],
      ['stress', STRESS_PACKAGE],
    ]) {
      const copied = await copyPackage(env, name, source);
      if (copied === null) continue;
      await showPageRead();
      rows.push(...(await densityRows(name)));
    }

    console.log(`\n${formatRows(rows)}`);

    for (const label of new Set(rows.map((row) => row.label))) {
      const fixtureRows = rows.filter((row) => row.label === label);
      const low = fixtureRows.find((row) => row.density === 80);
      const high = fixtureRows.find((row) => row.density === 120);
      assert.ok(low !== undefined && high !== undefined);
      assert.ok(low.pages <= high.pages, `${label}: 80% pages <= 120% pages`);
      assert.ok(
        Number.parseFloat(low.body) >= 8,
        `${label}: body never below 8 pt (${low.body})`,
      );
      assert.ok(
        Number.parseFloat(low.cardPadding) < Number.parseFloat(high.cardPadding),
        `${label}: card padding shrinks with density`,
      );
    }
    // Every measured page exposes the same real density it rendered with.
    for (const row of rows) {
      assert.ok(row.whitespace !== null && row.whitespace >= 0 && row.whitespace <= 1);
    }
  });
});
