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
  longDocument,
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

  it('shows the paginated A4 preview, preserves continuous-editor state, and updates live', async () => {
    await launch(ui.isolated('m4b1-page'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    const packagePath = (await h.state()).activeTab;

    // Continuous-editor selection + scroll are the state the switch must preserve.
    const card = h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Eigenvalues' })
      .first();
    await card.locator('.nf-block-prose').first().click();
    const selectedBefore = await selectedBlockId();
    assert.equal(typeof selectedBefore, 'string', 'a block is selected in the continuous editor');
    const scrollBefore = await page
      .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
      .evaluate((element) => {
        element.scrollTop = 120;
        return element.scrollTop;
      });
    // Let the scroll event reach the session recorder before the surface hides.
    await page.waitForTimeout(80);

    await showPageView();
    assert.equal((await viewState(packagePath)).layout, 'page');
    assert.equal((await viewState(packagePath)).interactionMode, 'read');
    assert.equal(await page.locator('.nf-continuous-surface').evaluate((element) => getComputedStyle(element).display), 'none');
    assert.equal(await selectedBlockId(), selectedBefore, 'selection survives the switch');
    await page.locator('[data-view-layout="page"]').waitFor();
    assert.equal(
      await page.locator('[data-view-layout="page"]').getAttribute('aria-pressed'),
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
      Math.abs(Number(await sheet.getAttribute('data-margin-left')) - 45.35) < 0.05,
      '12 mm left margin in layout px',
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

    // Clicking a fragment selects it and reveals the continuous-editor bridge.
    const firstFragment = activePageView().locator('.nf-page-fragment').first();
    const fragmentBlockId = await firstFragment.getAttribute('data-fragment-block');
    await firstFragment.click();
    assert.equal(await selectedBlockId(), fragmentBlockId);
    assert.equal(
      await activePageView().locator('[data-page-open-continuous]').isDisabled(),
      false,
      'Open in continuous editor is enabled after selecting a block',
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

    // Back to Continuous Edit: the page layout is gone, selection and scroll survive.
    await page.keyboard.press('Meta+2');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', { state: 'detached' });
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.layout === 'continuous' &&
        window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 5000 },
    );
    assert.equal(await selectedBlockId(), fragmentBlockId, 'selection survives the return');
    await page.waitForTimeout(120);
    const scrollAfter = await page
      .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
      .evaluate((element) => element.scrollTop);
    assert.ok(Math.abs(scrollAfter - scrollBefore) <= 1, 'continuous scroll survives the return');
    await page.waitForFunction(
      () => document.activeElement?.closest('.nf-prosemirror') !== null,
      undefined,
      { timeout: 5000 },
    );

    // The explicit page -> continuous-editor bridge selects and focuses the same block.
    await showPageView();
    const target = activePageView().locator('.nf-page-fragment').first();
    const targetId = await target.getAttribute('data-fragment-block');
    await target.click();
    await activePageView().locator('[data-page-open-continuous]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.layout === 'continuous' &&
        window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 5000 },
    );
    assert.equal(await selectedBlockId(), targetId, 'Open in continuous editor keeps the block');
  });

  it('navigates a multi-page landscape document and shows continuation markers', async () => {
    await launch(ui.isolated('m4b1-long'));
    await h.setWindowSize(1440, 900);
    const env = ui.isolated('m4b1-long');
    await openPackage(env, 'Long study', longDocument());
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card="parent"]');
    await showPageView();

    const pageCount = Number(
      await activePageView().getAttribute('data-page-count'),
    );
    assert.ok(pageCount > 1, `long fixture has multiple pages, got ${pageCount}`);
    const sheet = activeSheet();
    assert.ok(
      Math.abs(Number(await sheet.getAttribute('data-page-width-px')) - 1122.52) < 0.05,
      'A4 landscape width',
    );
    assert.ok(
      Math.abs(Number(await sheet.getAttribute('data-page-height-px')) - 793.7) < 0.05,
      'A4 landscape height',
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

  it('shows a clear page error and keeps the continuous editor usable when measurement fails', async () => {
    await launch(ui.isolated('m4b1-page-error'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    // The page model is shared with Continuous markers (M4b1c), so it has
    // already run for the seeded revision. Wait for that successful pass, then
    // force the next revision to fail and switch to Page.
    await page.waitForFunction(
      () => {
        const layer = document.querySelector('.nf-editor[data-active="true"] .nf-page-markers');
        return (
          layer !== null &&
          layer.getAttribute('data-page-model-ready') === 'true' &&
          layer.getAttribute('data-page-model-updating') === 'false'
        );
      },
      undefined,
      { timeout: 20000 },
    );
    await page.evaluate(() => {
      Object.defineProperty(document.fonts, 'ready', {
        configurable: true,
        get: () => Promise.reject(new Error('Forced page measurement failure')),
      });
    });
    const seeded = await h.state();
    const seededRuntime = seeded.runtimes.find((item) => item.packagePath === seeded.activeTab);
    const firstBlockId = seededRuntime?.blockIds[0];
    assert.equal(typeof firstBlockId, 'string');
    await ui.applyCommand({
      type: 'block.editContent',
      blockId: firstBlockId,
      content: textDoc('This edit triggers the failing measurement pass.'),
    });
    await page.keyboard.press('Meta+3');
    await activePageView().locator('[data-page-error="true"]').waitFor();
    assert.match(await activePageView().innerText(), /Forced page measurement failure/);
    assert.match(
      await activePageView().locator('.nf-page-banner-error').innerText(),
      /Page layout error/,
    );

    await page.keyboard.press('Meta+2');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', {
      state: 'detached',
    });
    await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Continuous editor still works.');
    await h.waitEditorText('Continuous editor still works.');
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
  it('defaults to Continuous Edit and toggles Continuous Read without editing', async () => {
    await launch(ui.isolated('m4b1a-continuous-read'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    const packagePath = (await h.state()).activeTab;

    assert.equal((await viewState(packagePath)).layout, 'continuous');
    assert.equal((await viewState(packagePath)).interactionMode, 'edit');
    assert.equal(
      await page.locator('[data-view-layout="continuous"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.locator('[data-view-interaction="edit"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await page.locator('[data-view-interaction="edit"]').isDisabled(), false);
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').getAttribute('contenteditable'),
      'true',
    );

    const card = h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Eigenvalues' })
      .first();
    await card.locator('.nf-block-prose').first().click();
    await page.keyboard.press('End');
    // Let the native caret scroll settle before recording the scroll position
    // the mode switch must preserve.
    await page.waitForTimeout(250);
    const caretBefore = await page.evaluate(() => window.__noteforestTest.caretLocation());
    assert.equal(typeof caretBefore?.blockId, 'string', 'the caret is in a text block');
    await page
      .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
      .evaluate((element) => {
        element.scrollTop = 90;
      });
    await page.waitForTimeout(80);
    const scrollBefore = await page
      .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
      .evaluate((element) => element.scrollTop);
    const undoBefore = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      return state.runtimes.find((runtime) => runtime.packagePath === state.activeTab)?.canUndoText;
    });

    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'read',
      packagePath,
      { timeout: 5000 },
    );
    await page.waitForTimeout(50);
    assert.equal(
      await page.locator('.nf-editor[data-active="true"]').getAttribute('data-interaction-mode'),
      'read',
    );
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').getAttribute('contenteditable'),
      'false',
      'Continuous Read is not editable',
    );
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').getAttribute('aria-readonly'),
      'true',
    );
    assert.equal(
      await page.locator('[data-view-interaction="read"]').getAttribute('aria-pressed'),
      'true',
    );

    // Selection, caret and scroll survive the mode switch.
    assert.deepEqual(
      await page.evaluate(() => window.__noteforestTest.caretLocation()),
      caretBefore,
      'caret survives entering Continuous Read',
    );
    const scrollRead = await page
      .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
      .evaluate((element) => element.scrollTop);
    assert.ok(Math.abs(scrollRead - scrollBefore) <= 1, 'scroll survives entering Continuous Read');

    // Mutating chrome is gone; the prose and navigation surfaces remain.
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-gutter-handle').count(),
      0,
      'drag/menu gutter is hidden',
    );
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-add-edge').count(),
      0,
      'add child/sibling controls are hidden',
    );
    assert.equal(
      await page
        .locator('.nf-editor[data-active="true"] .nf-chapter-add')
        .first()
        .evaluate((element) => getComputedStyle(element).visibility),
      'hidden',
      'chapter add controls are hidden without collapsing their box',
    );
    assert.equal(
      await page
        .locator('.nf-editor[data-active="true"] .nf-canvas-action')
        .evaluate((element) => getComputedStyle(element).visibility),
      'hidden',
      'canvas add-chapter control is hidden without collapsing its box',
    );
    assert.equal(
      await page.locator('[data-testid="selection-toolbar"]').count(),
      0,
      'the selection toolbar is not rendered in Read',
    );
    assert.ok(
      (await page.locator('.nf-editor[data-active="true"] [data-block-card]').count()) > 0,
      'the continuous document stays mounted',
    );

    // Typing cannot edit and cannot add a text-history entry.
    await page.keyboard.type(' should not appear');
    await page.waitForTimeout(60);
    assert.doesNotMatch(await h.activeEditor().innerText(), /should not appear/);
    const undoRead = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      return state.runtimes.find((runtime) => runtime.packagePath === state.activeTab)?.canUndoText;
    });
    assert.equal(undoRead, undoBefore, 'mode switches create no undo entry');

    // Typing may scroll the browser's caret into view even though it edits
    // nothing; restore the scroll position that the return toggle must keep.
    await page
      .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
      .evaluate((element, top) => {
        element.scrollTop = top;
      }, scrollBefore);
    await page.waitForTimeout(80);
    const scrollBeforeReturn = await page
      .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
      .evaluate((element) => element.scrollTop);

    // ⌘E returns to Edit with the same block, caret, scroll and focus.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 5000 },
    );
    await page.waitForTimeout(50);
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').getAttribute('contenteditable'),
      'true',
    );
    assert.deepEqual(
      await page.evaluate(() => window.__noteforestTest.caretLocation()),
      caretBefore,
      'caret survives returning to Edit',
    );
    const scrollAfter = await page
      .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
      .evaluate((element) => element.scrollTop);
    assert.ok(
      Math.abs(scrollAfter - scrollBeforeReturn) <= 1,
      'scroll survives returning to Edit',
    );
    await page.waitForFunction(
      () => document.activeElement?.closest('.nf-prosemirror') !== null,
      undefined,
      { timeout: 5000 },
    );
    const undoAfter = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      return state.runtimes.find((runtime) => runtime.packagePath === state.activeTab)?.canUndoText;
    });
    assert.equal(undoAfter, undoBefore, 'returning to Edit creates no undo entry');

    // Click selection stays available in Continuous Read: the document is
    // read-only, not inert.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'read',
      packagePath,
      { timeout: 5000 },
    );
    const other = h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Spectrum' })
      .first();
    const otherId = await other.getAttribute('data-block-card');
    await other.locator('.nf-block-prose').first().click();
    await h.waitSelected(otherId);
  });

  it('opens Page in Read, enables explicit Page Edit, and returns to Continuous Edit', async () => {
    await launch(ui.isolated('m4b1a-page-seam'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    const packagePath = (await h.state()).activeTab;

    await page.keyboard.press('Meta+3');
    await page.waitForFunction(
      (path) => {
        const view = window.__noteforestTest.viewState()[path];
        return view?.layout === 'page' && view?.interactionMode === 'read';
      },
      packagePath,
      { timeout: 5000 },
    );
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
    assert.equal(
      await page.locator('[data-view-layout="page"]').getAttribute('aria-pressed'),
      'true',
    );
    const edit = page.locator('[data-view-interaction="edit"]');
    assert.equal(await edit.isDisabled(), false, 'Page Edit is available');
    assert.match((await edit.getAttribute('title')) ?? '', /Page Edit mode/);
    assert.equal(
      await page.locator('[data-view-interaction="read"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-page-view').getAttribute('data-interaction-mode'),
      'read',
    );
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-page-view [contenteditable="true"]').count(),
      0,
      'Page Read has no editable surface',
    );

    // ⌘E enters Page Edit; Page still has no contenteditable until a block
    // overlay is opened, and the page geometry is unchanged.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 5000 },
    );
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-page-view').getAttribute('data-interaction-mode'),
      'edit',
    );
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-page-view [contenteditable="true"]').count(),
      0,
      'Page Edit has no editor until a block is opened',
    );
    assert.equal(
      await page.locator('[data-view-interaction="edit"]').getAttribute('aria-pressed'),
      'true',
    );

    // Continuous restores the default Edit mode.
    await page.keyboard.press('Meta+2');
    await page.waitForFunction(
      (path) => {
        const view = window.__noteforestTest.viewState()[path];
        return view?.layout === 'continuous' && view?.interactionMode === 'edit';
      },
      packagePath,
      { timeout: 5000 },
    );
    assert.equal(await page.locator('[data-view-interaction="edit"]').isDisabled(), false);
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').getAttribute('contenteditable'),
      'true',
    );
  });

  it('restores layout, mode, page, zoom and fit from the session', async () => {
    const env = ui.isolated('m4b1a-session');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Session long', longDocument());
    const packagePath = (await h.state()).activeTab;

    await page.keyboard.press('Meta+=');
    await page.waitForFunction(
      (path) => (window.__noteforestTest.viewState()[path]?.zoom ?? 1) > 1,
      packagePath,
      { timeout: 5000 },
    );
    const zoomBefore = (await viewState(packagePath)).zoom;

    await showPageView();
    await activePageView().locator('[data-page-nav="next"]').click();
    await page.waitForFunction(
      () => Number(document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-current-page')) === 2,
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
      (path) => (window.__noteforestTest.viewState()[path]?.pageZoom ?? 1) > 1,
      packagePath,
      { timeout: 5000 },
    );
    const before = await viewState(packagePath);
    assert.equal(before.layout, 'page');
    assert.equal(before.interactionMode, 'read');
    assert.equal(before.currentPage, 2);
    assert.equal(before.pageFit, 'none');

    await h.flushSession();
    await h.quit();
    await launch(env);
    await page.waitForFunction(
      (path) => {
        const view = window.__noteforestTest.viewState()[path];
        return view?.layout === 'page' && view?.interactionMode === 'read';
      },
      packagePath,
      { timeout: 10000 },
    );
    const after = await viewState(packagePath);
    assert.equal(after.layout, 'page');
    assert.equal(after.interactionMode, 'read');
    assert.equal(after.currentPage, before.currentPage);
    assert.equal(after.pageFit, 'none');
    assert.ok(Math.abs(after.pageZoom - before.pageZoom) < 0.001, 'page zoom is restored');
    assert.ok(Math.abs(after.zoom - zoomBefore) < 0.001, 'continuous zoom is restored');
    await page.waitForFunction(
      () => {
        const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
        return view !== null && view.getAttribute('data-ready') === 'true';
      },
      undefined,
      { timeout: 20000 },
    );
    assert.equal(await currentPageNumber(), 2);
    assert.equal(
      await activePageView().locator('[data-page-fit="page"]').getAttribute('aria-pressed'),
      'false',
      'the restored manual zoom is not replaced by fit page',
    );
    assert.equal(await page.locator('[data-view-interaction="edit"]').isDisabled(), false);
  });

});
