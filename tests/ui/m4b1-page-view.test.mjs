import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, pngSize, root } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { textDoc } from '../support/fixtures.mjs';
import {
  emptyDocument,
  imageBlock,
  missingImageDocument,
  multiChapterDocument,
  pageDocument,
  portraitLongDocument,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';

const tempRoot = artifactsPath('m4b1-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

async function openPackage(env, name, document, assetFiles = {}) {
  const packagePath = await writePagePackage(
    env.NOTEFOREST_LIBRARY,
    name,
    document,
    assetFiles,
  );
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
  await page.waitForSelector('.nf-editor[data-active="true"]');
  return packagePath;
}

async function viewState(packagePath) {
  const views = await page.evaluate(() => window.__noteforestTest.viewState());
  return views[packagePath] ?? {};
}

function activePageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

function activeSheet() {
  return activePageView().locator('.nf-page-sheet').first();
}

async function waitPageReady(expectedCount) {
  await page.waitForFunction(
    (count) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      if (view === null) return false;
      if (view.getAttribute('data-ready') !== 'true') return false;
      if (view.getAttribute('data-updating') === 'true') return false;
      if (count !== null && Number(view.getAttribute('data-page-count')) !== count) return false;
      return true;
    },
    expectedCount ?? null,
    { timeout: 20000 },
  );
}

async function showPageView() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
}

async function currentPageNumber() {
  return activePageView().evaluate((element) =>
    Number(element.getAttribute('data-current-page') ?? '1'),
  );
}

async function selectedBlockId() {
  const state = await h.state();
  const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
  return runtime?.selectedBlockId ?? null;
}

describe('M4b1 page view core', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('shows the paginated A4 preview, preserves reader state, and updates live', async () => {
    await launch(ui.isolated('m4b1-page'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    const packagePath = (await h.state()).activeTab;

    // Reader selection + scroll are the state the switch must preserve.
    const card = h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Eigenvalues' })
      .first();
    await card.locator('.nf-block-prose').first().click();
    const selectedBefore = await selectedBlockId();
    assert.equal(typeof selectedBefore, 'string', 'a block is selected in the reader');
    const scrollBefore = await page
      .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
      .evaluate((element) => {
        element.scrollTop = 120;
        return element.scrollTop;
      });
    // Let the scroll event reach the session recorder before the surface hides.
    await page.waitForTimeout(80);

    await showPageView();
    assert.equal((await viewState(packagePath)).mode, 'page');
    assert.equal(await page.locator('.nf-reader-surface').evaluate((element) => getComputedStyle(element).display), 'none');
    assert.equal(await selectedBlockId(), selectedBefore, 'selection survives the switch');
    await page.locator('[data-view-mode="page"]').waitFor();
    assert.equal(
      await page.locator('[data-view-mode="page"]').getAttribute('aria-pressed'),
      'true',
    );

    const sheet = activeSheet();
    assert.equal(await activePageView().getAttribute('role'), 'region');
    assert.equal(await sheet.getAttribute('role'), 'document');
    const sheetWidth = Number(await sheet.getAttribute('data-page-width-px'));
    const sheetHeight = Number(await sheet.getAttribute('data-page-height-px'));
    assert.ok(Math.abs(sheetWidth - 1122.52) < 0.05, 'A4 landscape width');
    assert.ok(Math.abs(sheetHeight - 793.7) < 0.05, 'A4 landscape height');
    assert.ok(
      Math.abs(Number(await sheet.getAttribute('data-margin-left')) - 75.59) < 0.05,
      '20 mm left margin in layout px',
    );
    const pageCount = Number(
      await activePageView().getAttribute('data-page-count'),
    );
    assert.ok(pageCount >= 1, 'the paginator derives at least one page');
    assert.ok(
      Number(await activePageView().getAttribute('data-measurement-calls')) > 0,
      'the layout pass measured real DOM',
    );
    assert.ok((await activePageView().locator('.nf-page-fragment').count()) > 0, 'the page has fragments');
    assert.match(await sheet.innerText(), /Eigenvalues/);

    // Read-only: no contenteditable surface in the page view.
    assert.equal(await activePageView().locator('[contenteditable="true"]').count(), 0);

    // Clicking a fragment selects it and reveals the reader bridge.
    const firstFragment = activePageView().locator('.nf-page-fragment').first();
    const fragmentBlockId = await firstFragment.getAttribute('data-fragment-block');
    await firstFragment.click();
    assert.equal(await selectedBlockId(), fragmentBlockId);
    assert.equal(
      await activePageView().locator('[data-page-open-reader]').isDisabled(),
      false,
      'Open in reader is enabled after selecting a block',
    );

    // Live model update while page view is visible (no manual refresh).
    await ui.applyCommand({
      type: 'block.editContent',
      blockId: fragmentBlockId,
      content: textDoc('Live page update from the shared model.'),
    });
    await page.waitForFunction(
      () => document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.textContent?.includes('Live page update'),
      undefined,
      { timeout: 20000 },
    );

    // Zoom/fit are navigation only: the sheet geometry attributes stay A4.
    await activePageView().locator('[data-page-fit="width"]').click();
    await page.waitForFunction(
      () => document.querySelector('.nf-editor[data-active="true"] [data-page-fit="width"]')?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );
    await activePageView().locator('[data-page-fit="actual"]').click();
    await page.waitForFunction(
      () => document.querySelector('.nf-editor[data-active="true"] [data-page-zoom-value]')?.textContent?.trim() === '100%',
      undefined,
      { timeout: 5000 },
    );
    await activePageView().locator('[data-page-zoom="in"]').click();
    await page.waitForFunction(
      () => Number(document.querySelector('.nf-editor[data-active="true"] [data-page-zoom-value]')?.textContent?.replace('%', '')) > 100,
      undefined,
      { timeout: 5000 },
    );
    assert.ok(
      Math.abs(Number(await sheet.getAttribute('data-page-width-px')) - 1122.52) < 0.05,
      'fit/zoom never changes the A4 geometry',
    );
    await page.keyboard.press('Shift+1');
    await page.waitForFunction(
      () => document.querySelector('.nf-editor[data-active="true"] [data-page-fit="page"]')?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );

    // Back to the reader: page view is gone, selection and scroll survive.
    await page.keyboard.press('Meta+2');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', { state: 'detached' });
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.mode === 'reader',
      packagePath,
      { timeout: 5000 },
    );
    assert.equal(await selectedBlockId(), fragmentBlockId, 'selection survives the return');
    await page.waitForTimeout(120);
    const scrollAfter = await page
      .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
      .evaluate((element) => element.scrollTop);
    assert.ok(Math.abs(scrollAfter - scrollBefore) <= 1, 'reader scroll survives the return');
    await page.waitForFunction(
      () => document.activeElement?.closest('.nf-prosemirror') !== null,
      undefined,
      { timeout: 5000 },
    );

    // The explicit page -> reader bridge selects and focuses the same block.
    await showPageView();
    const target = activePageView().locator('.nf-page-fragment').first();
    const targetId = await target.getAttribute('data-fragment-block');
    await target.click();
    await activePageView().locator('[data-page-open-reader]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.mode === 'reader',
      packagePath,
      { timeout: 5000 },
    );
    assert.equal(await selectedBlockId(), targetId, 'Open in reader keeps the block');
  });

  it('navigates a multi-page portrait document and shows continuation markers', async () => {
    await launch(ui.isolated('m4b1-portrait'));
    await h.setWindowSize(1440, 900);
    const env = ui.isolated('m4b1-portrait');
    await openPackage(env, 'Portrait long study', portraitLongDocument());
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card="parent"]');
    await showPageView();

    const pageCount = Number(
      await activePageView().getAttribute('data-page-count'),
    );
    assert.ok(pageCount > 1, `portrait fixture has multiple pages, got ${pageCount}`);
    const sheet = activeSheet();
    assert.ok(
      Math.abs(Number(await sheet.getAttribute('data-page-width-px')) - 793.7) < 0.05,
      'A4 portrait width',
    );
    assert.ok(
      Math.abs(Number(await sheet.getAttribute('data-page-height-px')) - 1122.52) < 0.05,
      'A4 portrait height',
    );
    assert.equal(await currentPageNumber(), 1);

    await activePageView().locator('[data-page-continues-on]').waitFor();
    assert.match(await activePageView().locator('[data-page-continues-list]').innerText(), /continues on page 2/);

    await activePageView().locator('[data-page-nav="next"]').click();
    await page.waitForFunction(
      () => Number(document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-current-page')) === 2,
      undefined,
      { timeout: 5000 },
    );
    await activePageView().locator('[data-page-continued-from]').waitFor();
    assert.match(
      await activePageView().locator('[data-page-ghost-list]').innerText(),
      /continued from page 1/,
    );

    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForFunction(
      () => Number(document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-current-page')) >= 3,
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForFunction(
      () => Number(document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-current-page')) === 2,
      undefined,
      { timeout: 5000 },
    );
    assert.equal(
      await activePageView().locator('[data-page-nav="prev"]').isDisabled(),
      false,
      'previous page is available after the first page',
    );

    // Deleting the long continuation while page 2 is current must clamp the
    // current page to the new page count, not leave a blank page 2.
    await ui.applyCommand({
      type: 'block.delete',
      blockId: 'child',
      children: 'promote',
    });
    await page.waitForFunction(
      () => {
        const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
        return (
          view?.getAttribute('data-updating') === 'false' &&
          Number(view.getAttribute('data-page-count')) === 1 &&
          Number(view.getAttribute('data-current-page')) === 1
        );
      },
      undefined,
      { timeout: 20000 },
    );
    assert.match(await activeSheet().innerText(), /Page 1 of 1/);
  });

  it('starts each chapter on its own page and numbers them in reading order', async () => {
    await launch(ui.isolated('m4b1-chapters'));
    await h.setWindowSize(1440, 900);
    const env = ui.isolated('m4b1-chapters');
    await openPackage(env, 'Two chapters', multiChapterDocument());
    await showPageView();
    assert.equal(
      Number(await activePageView().getAttribute('data-page-count')),
      2,
      'each chapter starts a new page',
    );
    const first = activeSheet();
    assert.equal(await first.getAttribute('data-chapter-id'), 'chapter-1');
    assert.match(await first.innerText(), /Chapter 1/);
    assert.match(await first.innerText(), /First chapter body/);
    assert.doesNotMatch(await first.innerText(), /Second chapter body/);
    assert.equal(await first.locator('[data-fragment-block="chapter-2-block"]').count(), 0);

    await activePageView().locator('[data-page-nav="next"]').click();
    await page.waitForFunction(
      () => Number(document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-current-page')) === 2,
      undefined,
      { timeout: 5000 },
    );
    const second = activeSheet();
    assert.equal(await second.getAttribute('data-chapter-id'), 'chapter-2');
    assert.match(await second.innerText(), /Chapter 2/);
    assert.match(await second.innerText(), /Page 2 of 2/);
    assert.match(await second.innerText(), /Second chapter body/);
    assert.doesNotMatch(await second.innerText(), /First chapter body/);
  });

  it('renders a labeled missing-image placeholder and a real empty page', async () => {
    await launch(ui.isolated('m4b1-page-states'));
    await h.setWindowSize(1440, 900);
    const env = ui.isolated('m4b1-page-states');
    await openPackage(env, 'Missing image page', missingImageDocument());
    await showPageView();
    await activePageView().locator('[data-missing-asset="missing-asset-id"]').waitFor();
    assert.match(
      await activePageView().locator('[data-missing-asset="missing-asset-id"]').innerText(),
      /Missing image: Lost diagram/,
    );

    await openPackage(env, 'Empty page fixture', emptyDocument());
    // The runtime gives a brand-new empty chapter its first block. Delete that
    // single block to reach the real "nothing to paginate" state.
    const emptyStructure = await ui.structure();
    const onlyBlock = Object.keys(emptyStructure.blocks)[0];
    assert.equal(typeof onlyBlock, 'string', 'the empty fixture starts with one editable block');
    await ui.applyCommand({
      type: 'block.delete',
      blockId: onlyBlock,
      children: 'promote',
      allowEmptyChapter: true,
    });
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
        return runtime?.blocks === 0;
      },
      undefined,
      { timeout: 10000 },
    );
    await showPageView();
    await activePageView().locator('[data-page-empty="true"]').waitFor();
    assert.match(
      await activePageView().locator('[data-page-empty="true"]').innerText(),
      /Nothing to paginate yet/,
    );
    const sheet = activeSheet();
    assert.equal(await sheet.getAttribute('data-page-number'), '1');
    assert.equal(await sheet.getAttribute('data-page-count'), '1');
    assert.ok(Number(await sheet.getAttribute('data-page-height-px')) > 0);
  });

  it('shows a clear page error and keeps the reader usable when measurement fails', async () => {
    await launch(ui.isolated('m4b1-page-error'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    await page.evaluate(() => {
      Object.defineProperty(document.fonts, 'ready', {
        configurable: true,
        get: () => Promise.reject(new Error('Forced page measurement failure')),
      });
    });
    await page.keyboard.press('Meta+3');
    await activePageView().locator('[data-page-error="true"]').waitFor();
    assert.match(await activePageView().innerText(), /Forced page measurement failure/);
    assert.match(
      await activePageView().locator('.nf-page-banner-error').innerText(),
      /Page view error/,
    );

    await page.keyboard.press('Meta+2');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', {
      state: 'detached',
    });
    await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Reader still works.');
    await h.waitEditorText('Reader still works.');
  });

  it('loads a present image through the package asset protocol', async () => {
    await launch(ui.isolated('m4b1-page-image'));
    await h.setWindowSize(1440, 900);
    const env = ui.isolated('m4b1-page-image');
    const source = resolve(root, 'fixtures/assets/forest.png');
    const bytes = await readFile(source);
    const assetId = createHash('sha256').update(bytes).digest('hex');
    const size = await pngSize(source);
    const document = pageDocument({
      id: 'present-image-page',
      title: 'Present image page',
      orientation: 'landscape',
      chapterTitle: 'Images',
      blocks: [
        textBlock('intro', 'Intro', 'This page embeds a verified package asset.'),
        imageBlock('image', 'Forest diagram', assetId, 'Forest', size),
      ],
    });
    document.assets[assetId] = {
      id: assetId,
      path: `assets/${assetId}`,
      mime: 'image/png',
      width: size.width,
      height: size.height,
      alt: 'Forest',
    };
    await openPackage(env, 'Present image page', document, { [assetId]: source });
    await showPageView();
    const image = activePageView().locator(`img[data-asset-id="${assetId}"]`);
    await image.waitFor();
    const loaded = await image.evaluate((element) => ({
      width: element.naturalWidth,
      height: element.naturalHeight,
      src: element.getAttribute('src') ?? '',
    }));
    assert.ok(loaded.width > 0, 'the image decoded');
    assert.ok(loaded.height > 0, 'the image has intrinsic height');
    assert.match(loaded.src, /^noteforest-asset:\/\/asset\//);
    assert.equal(
      await activePageView().locator('[data-missing-asset]').count(),
      0,
      'a present asset never renders the placeholder',
    );
  });
});
