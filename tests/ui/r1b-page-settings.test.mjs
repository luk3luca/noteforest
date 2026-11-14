import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  multiPageBlocksDocument,
  pageDocument,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';

const tempRoot = artifactsPath('r1b-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const A4_LANDSCAPE = { width: 297, height: 210 };
const A5_LANDSCAPE = { width: 210, height: 148 };
const LETTER_PORTRAIT = { width: 215.9, height: 279.4 };
const PX_PER_MM = 96 / 25.4;

async function launch(name) {
  page = await ui.launch(ui.isolated(name));
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

function activePageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

function activeSheet() {
  return activePageView().locator('.nf-page-sheet').first();
}

async function modelRuns() {
  return Number(await activePageView().getAttribute('data-model-runs'));
}

async function waitPageReady(options = {}) {
  const { expectedCount = null, bodySize = null, pageWidth = null, minRuns = null } = options;
  await page.waitForFunction(
    ({ count, size, width, runs }) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      if (view === null) return false;
      if (view.getAttribute('data-ready') !== 'true') return false;
      if (view.getAttribute('data-updating') === 'true') return false;
      if (count !== null && Number(view.getAttribute('data-page-count')) !== count) return false;
      if (runs !== null && Number(view.getAttribute('data-model-runs')) < runs) return false;
      if (size !== null) {
        const value = getComputedStyle(view).getPropertyValue('--nf-page-body-size').trim();
        if (value !== size) return false;
      }
      if (width !== null) {
        const sheet = view.querySelector('.nf-page-sheet');
        if (
          sheet === null ||
          Math.abs(Number(sheet.getAttribute('data-page-width-px')) - width) >= 0.1
        ) {
          return false;
        }
      }
      return true;
    },
    { count: expectedCount, size: bodySize, width: pageWidth, runs: minRuns },
    { timeout: 30000 },
  );
}

async function showPageRead() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
  await ui.ensureInteractionMode('read');
}

async function pageCount() {
  return Number(await activePageView().getAttribute('data-page-count'));
}

async function pageSize() {
  const sheet = activeSheet();
  return {
    width: Number(await sheet.getAttribute('data-page-width-px')),
    height: Number(await sheet.getAttribute('data-page-height-px')),
  };
}

async function settings() {
  return page.evaluate(() => window.__noteforestTest.settings());
}

async function setSettings(settingsValue) {
  return page.evaluate(
    (value) => window.__noteforestTest.setSettings(value),
    settingsValue,
  );
}

async function setPageSettingsOverride(packagePath, override) {
  return page.evaluate(
    ({ path, value }) => window.__noteforestTest.setPageSettingsOverride(path, value),
    { path: packagePath, value: override },
  );
}

function closeTo(actual, expected, tolerance = 0.05) {
  return Math.abs(actual - expected) < tolerance;
}

describe('R1b personal page settings and page theme', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('renders Page Read with the compact default and re-paginates on a global theme change', async () => {
    const env = ui.isolated('r1b-compact');
    await launch('r1b-compact');
    await ui.seedDemo();
    const packagePath = (await h.state()).activeTab;

    const initial = await settings();
    assert.equal(initial.app.page.theme.preset, 'compact');
    assert.equal(initial.app.page.setup.size, 'A4');
    assert.equal(initial.app.page.setup.orientation, 'landscape');

    await showPageRead();
    const bodySize = await activePageView().evaluate((element) =>
      getComputedStyle(element).getPropertyValue('--nf-page-body-size').trim(),
    );
    assert.equal(bodySize, '9pt', 'the compact theme variable reaches the page view');
    const paragraphSize = await activePageView()
      .locator('.nf-block-content .nf-p')
      .first()
      .evaluate((element) => getComputedStyle(element).fontSize);
    assert.equal(paragraphSize, '12px', '9 pt at 96 dpi');
    const compactPages = await pageCount();
    assert.ok(compactPages >= 1);

    const comfortableStart = await modelRuns();
    await setSettings({
      page: { theme: { preset: 'comfortable' } },
      continuous: { zoom: 1 },
    });
    await waitPageReady({ bodySize: '10.5pt', minRuns: comfortableStart + 1 });
    const comfortableSize = await activePageView()
      .locator('.nf-block-content .nf-p')
      .first()
      .evaluate((element) => getComputedStyle(element).fontSize);
    assert.equal(comfortableSize, '14px', '10.5 pt at 96 dpi');
    assert.ok(
      (await pageCount()) >= compactPages,
      'the comfortable preset never paginates denser than compact',
    );

    const persisted = JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'settings.json'), 'utf8'),
    );
    assert.equal(persisted.page.theme.preset, 'comfortable');

    // Returning to compact re-paginates the same document again.
    const compactStart = await modelRuns();
    await setSettings({
      page: { theme: { preset: 'compact' } },
      continuous: { zoom: 1 },
    });
    await waitPageReady({ bodySize: '9pt', minRuns: compactStart + 1 });
    assert.equal(
      await activePageView()
        .locator('.nf-block-content .nf-p')
        .first()
        .evaluate((element) => getComputedStyle(element).fontSize),
      '12px',
    );
    assert.equal((await settings()).app.page.theme.preset, 'compact');
    assert.equal(packagePath, (await h.state()).activeTab);
  });

  it('uses a per-document A5 override for geometry, re-pagination, Page Edit, and session', async () => {
    const env = ui.isolated('r1b-a5');
    await launch('r1b-a5');
    const packagePath = await openPackage(
      env,
      'Multi-page blocks',
      multiPageBlocksDocument(36),
    );
    await showPageRead();

    const compactA4Pages = await pageCount();
    const a4 = await pageSize();
    assert.ok(closeTo(a4.width, A4_LANDSCAPE.width * PX_PER_MM, 0.1));
    assert.ok(closeTo(a4.height, A4_LANDSCAPE.height * PX_PER_MM, 0.1));

    const a5Start = await modelRuns();
    const resolved = await setPageSettingsOverride(packagePath, {
      setup: { size: 'A5', orientation: 'landscape' },
    });
    assert.equal(resolved.setup.size, 'A5');
    assert.equal(resolved.setup.orientation, 'landscape');
    await waitPageReady({
      pageWidth: A5_LANDSCAPE.width * PX_PER_MM,
      minRuns: a5Start + 1,
    });

    const a5 = await pageSize();
    assert.ok(closeTo(a5.width, A5_LANDSCAPE.width * PX_PER_MM, 0.1), 'A5 width');
    assert.ok(closeTo(a5.height, A5_LANDSCAPE.height * PX_PER_MM, 0.1), 'A5 height');
    const a5Pages = await pageCount();
    assert.ok(
      a5Pages > compactA4Pages,
      `A5 portrait needs more pages: A4 ${compactA4Pages}, A5 ${a5Pages}`,
    );

    // The override is personal and per-document: global settings stay A4.
    const stored = await settings();
    assert.equal(stored.app.page.setup.size, 'A4');
    assert.equal(stored.app.page.setup.orientation, 'landscape');
    assert.deepEqual(stored.pageOverrides[packagePath], {
      setup: { size: 'A5', orientation: 'landscape' },
    });

    // S2-2: the override is durable outside the session, keyed by the
    // canonical document id, so closing the tab or quitting cannot lose it.
    const documentId = JSON.parse(
      await readFile(join(packagePath, 'document.json'), 'utf8'),
    ).id;
    const documentSettings = JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'document-settings.json'), 'utf8'),
    );
    assert.deepEqual(
      documentSettings.entries.find((entry) => entry.documentId === documentId)?.page,
      { setup: { size: 'A5', orientation: 'landscape' } },
    );
    await page.evaluate(() => window.__noteforestTest.flushSession());
    const session = JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'shell-session.json'), 'utf8'),
    );
    const tab = session.tabs.find((item) => item.packagePath === packagePath);
    assert.equal(tab.pageSettingsOverride, undefined);

    // Page Edit overlay follows the resolved A5 geometry and compact theme.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-interaction-mode') === 'edit',
      undefined,
      { timeout: 5000 },
    );
    const fragment = activePageView().locator('.nf-page-fragment').first();
    await fragment.waitFor();
    const fragmentStyle = await fragment.evaluate((element) => ({
      left: Number.parseFloat(element.style.left),
      top: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
    }));
    await fragment.dblclick();
    const overlay = page.locator('.nf-editor[data-active="true"] [data-page-edit-overlay]');
    await overlay.waitFor({ timeout: 5000 });
    const overlayGeometry = await overlay.evaluate((element) => ({
      left: Number.parseFloat(element.style.left),
      top: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
      maxHeight: Number.parseFloat(element.style.maxHeight),
      bodySize: getComputedStyle(element).getPropertyValue('--nf-page-body-size').trim(),
    }));
    const sheet = activeSheet();
    const marginLeft = Number(await sheet.getAttribute('data-margin-left'));
    const marginTop = Number(await sheet.getAttribute('data-margin-top'));
    const sheetHeight = Number(await sheet.getAttribute('data-page-height-px'));
    const marginBottom = Number(await sheet.getAttribute('data-margin-bottom'));
    assert.ok(closeTo(overlayGeometry.left, marginLeft + fragmentStyle.left, 0.05));
    assert.ok(closeTo(overlayGeometry.top, marginTop + fragmentStyle.top, 0.05));
    assert.ok(closeTo(overlayGeometry.width, fragmentStyle.width, 0.05));
    assert.ok(closeTo(overlayGeometry.maxHeight, sheetHeight - marginTop - marginBottom, 0.1));
    assert.equal(overlayGeometry.bodySize, '9pt', 'Page Edit inherits the compact theme');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-page-edit-overlay]', { state: 'detached', timeout: 10000 });
    assert.deepEqual((await ui.structure()).manualBreakBeforeBlockIds, []);
  });

  it('supports Letter geometry and reports the resolved orientation in the bridge', async () => {
    await launch('r1b-letter');
    await ui.seedDemo();
    await showPageRead();

    const letterStart = await modelRuns();
    await setSettings({
      page: {
        setup: { size: 'Letter', orientation: 'portrait' },
        theme: { preset: 'compact' },
      },
      continuous: { zoom: 1 },
    });
    await waitPageReady({
      pageWidth: LETTER_PORTRAIT.width * PX_PER_MM,
      minRuns: letterStart + 1,
    });
    const letter = await pageSize();
    assert.ok(closeTo(letter.width, LETTER_PORTRAIT.width * PX_PER_MM, 0.1), 'Letter width');
    assert.ok(closeTo(letter.height, LETTER_PORTRAIT.height * PX_PER_MM, 0.1), 'Letter height');
    assert.equal((await h.state()).runtimes[0].orientation, 'portrait');
    assert.equal((await activeSheet().getAttribute('data-margin-left')) === null, false);
  });

  it('adds a personal manual break as a derived page without touching document.json', async () => {
    const env = ui.isolated('r1b-manual-break');
    await launch('r1b-manual-break');
    const document = pageDocument({
      id: 'two-blocks',
      title: 'Two blocks',
      chapterTitle: 'Breaks',
      blocks: [
        textBlock('b1', 'First block', 'First short block.'),
        textBlock('b2', 'Second block', 'Second short block.'),
      ],
    });
    const packagePath = await openPackage(env, 'Two blocks', document);
    await showPageRead();
    assert.equal(await pageCount(), 1);

    await setPageSettingsOverride(packagePath, {
      manualBreakBeforeBlockIds: ['b2'],
    });
    await waitPageReady({ expectedCount: 2 });
    assert.equal(await pageCount(), 2);
    assert.deepEqual((await ui.structure()).manualBreakBeforeBlockIds, ['b2']);

    const onDisk = JSON.parse(
      await readFile(join(packagePath, 'document.json'), 'utf8'),
    );
    assert.equal(onDisk.manualBreakBeforeBlockIds, undefined);
    assert.equal(onDisk.pageSetup, undefined);
  });
});
