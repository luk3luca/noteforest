import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  longDocument,
  multiPageBlocksDocument,
  pageDocument,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';

/**
 * PG1 — Page as a scroll of pages (PP1: canvas-header pager).
 *
 * The surface is one vertical column of touching pages with a 1 px seam, free
 * scroll, and no paging state. The canvas-header pager names the page under the
 * centre of the viewport, moves with its arrows, and takes a typed page; only
 * the visible window ±2 is mounted over exact-size placeholders. Zoom is
 * fit-relative: 100 % fills the width, 200 % scrolls horizontally, 50 % leaves
 * margins. The page model, the page count, the page chrome and the PDF are
 * outside this batch.
 */

const tempRoot = artifactsPath('page-scroll-ui');
const screenshotDir = artifactsPath('page-scroll');
const polishDir = artifactsPath('page-polish');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(name, overrides = {}) {
  page = await ui.launch(ui.isolated(name), overrides);
  return page;
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

async function waitPageReady(expectedCount = null) {
  await page.waitForFunction(
    (count) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      if (view === null) return false;
      if (view.getAttribute('data-ready') !== 'true') return false;
      if (view.getAttribute('data-updating') === 'true') return false;
      if (count !== null && Number(view.getAttribute('data-page-count')) !== count) return false;
      return true;
    },
    expectedCount,
    { timeout: 30000 },
  );
}

async function showPageRead() {
  const started = Date.now();
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
  await ui.ensureInteractionMode('read');
  return Date.now() - started;
}

async function enterPageEdit() {
  await ui.ensureInteractionMode('edit');
}

/** One page's observable box and slot state. */
async function sheetBox(pageNumber) {
  return page.evaluate((number) => {
    const sheet = document.querySelector(
      `.nf-editor[data-active="true"] .nf-page-sheet[data-page-number="${number}"]`,
    );
    if (sheet === null) return null;
    const scroller = document.querySelector('.nf-editor[data-active="true"] .nf-page-scroll');
    const slot = sheet.closest('.nf-page-slot');
    const rect = sheet.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    return {
      number: Number(sheet.getAttribute('data-page-number')),
      current: sheet.getAttribute('data-page-current') === 'true',
      top: rect.top - scrollerRect.top,
      bottom: rect.bottom - scrollerRect.top,
      left: rect.left - scrollerRect.left,
      width: rect.width,
      height: rect.height,
      slotTop: slot.getBoundingClientRect().top - scrollerRect.top,
      mounted: slot.getAttribute('data-page-slot-mounted') === 'true',
    };
  }, pageNumber);
}

async function surface() {
  return page.evaluate(() => {
    const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
    const scroller = document.querySelector('.nf-editor[data-active="true"] .nf-page-scroll');
    const sheets = [...view.querySelectorAll('.nf-page-sheet')];
    return {
      pageCount: Number(view.getAttribute('data-page-count')),
      current: Number(view.getAttribute('data-current-page')),
      percent: Number(view.getAttribute('data-page-zoom')),
      scale: Number(view.getAttribute('data-page-scale')),
      fit: view.getAttribute('data-page-fit'),
      runs: Number(view.getAttribute('data-model-runs')),
      mounted: Number(view.getAttribute('data-mounted-page-count')),
      sheets: sheets.map((sheet) => Number(sheet.getAttribute('data-page-number'))),
      placeholders: view.querySelectorAll('[data-page-placeholder]').length,
      scrollTop: scroller.scrollTop,
      scrollLeft: scroller.scrollLeft,
      scrollHeight: scroller.scrollHeight,
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      clientHeight: scroller.clientHeight,
      snap: getComputedStyle(scroller).scrollSnapType,
      pager: (() => {
        const root = document.querySelector('.nf-canvas-header [data-page-position]');
        if (root === null) return null;
        const input = root.querySelector('[data-page-position-input]');
        const total = root.querySelector('[data-page-position-total]');
        return {
          value: input?.value ?? '',
          total: total?.textContent ?? '',
          prevDisabled: root.querySelector('[data-page-position-prev]')?.disabled ?? null,
          nextDisabled: root.querySelector('[data-page-position-next]')?.disabled ?? null,
        };
      })(),
      zoomLabel: document.querySelector('[data-zoom-value]')?.textContent ?? '',
    };
  });
}

/** The canvas-header pager as the shell exposes it (PP1). */
async function pagerState() {
  return page.evaluate(() => {
    const root = document.querySelector('.nf-canvas-header [data-page-position]');
    const input = root?.querySelector('[data-page-position-input]');
    return {
      value: input?.value ?? '',
      total: root?.querySelector('[data-page-position-total]')?.textContent ?? '',
      prevDisabled: root?.querySelector('[data-page-position-prev]')?.disabled ?? null,
      nextDisabled: root?.querySelector('[data-page-position-next]')?.disabled ?? null,
      focused: document.activeElement === input,
      selectionStart: input?.selectionStart ?? null,
      selectionEnd: input?.selectionEnd ?? null,
      role: root?.getAttribute('role') ?? null,
      ariaLabel: root?.getAttribute('aria-label') ?? null,
      inputLabel: input?.getAttribute('aria-label') ?? null,
      hasPopup: root?.getAttribute('aria-haspopup') ?? null,
      jumpInputs: document.querySelectorAll('[data-page-jump-input], [data-page-jump-go]').length,
    };
  });
}

/** Wait for the pager field to show one page (a store round trip). */
async function waitPagerValue(expected, { timeout = 10000 } = {}) {
  await page.waitForFunction(
    (value) => {
      const input = document.querySelector('.nf-canvas-header [data-page-position-input]');
      return input !== null && input.value === String(value);
    },
    expected,
    { timeout },
  );
}

async function setScroll({ top, left }) {
  await page.evaluate(
    ({ nextTop, nextLeft }) => {
      const scroller = document.querySelector('.nf-editor[data-active="true"] .nf-page-scroll');
      if (nextTop !== undefined) scroller.scrollTop = nextTop;
      if (nextLeft !== undefined) scroller.scrollLeft = nextLeft;
    },
    { nextTop: top, nextLeft: left },
  );
  // The offset is the precondition of every assertion that follows: wait for
  // the scroller to hold it (or to clamp at the end of the column) instead of
  // assuming the write landed.
  await page.waitForFunction(
    ({ nextTop, nextLeft }) => {
      const scroller = document.querySelector('.nf-editor[data-active="true"] .nf-page-scroll');
      if (scroller === null) return false;
      const topOk =
        nextTop === undefined ||
        Math.abs(scroller.scrollTop - nextTop) <= 1 ||
        scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1;
      const leftOk =
        nextLeft === undefined ||
        Math.abs(scroller.scrollLeft - nextLeft) <= 1 ||
        scroller.scrollLeft >= scroller.scrollWidth - scroller.clientWidth - 1;
      return topOk && leftOk;
    },
    { nextTop: top, nextLeft: left },
    { timeout: 10000 },
  );
  // The scroll handler is synchronous; the frame pair lets the store write and
  // its render land before the test reads the indicator.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function setZoom(clicks, direction, expectedPercent) {
  for (let index = 0; index < clicks; index += 1) {
    await page.locator(`[data-zoom-action="${direction}"]`).click();
  }
  // Every click writes the store and re-renders the surface. Wait for the
  // surface to report the final step instead of a fixed delay: a loaded pool
  // outruns any constant, and the old 80 ms wait was the suite's one fixed
  // frame budget (P2 item 7).
  await page.waitForFunction(
    (percent) =>
      Number(
        document
          .querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-page-zoom'),
      ) === percent,
    expectedPercent,
    { timeout: 10000 },
  );
}

/** Current Page scroll offset, read from the real scroller. */
async function scrollTop() {
  return page.evaluate(
    () => document.querySelector('.nf-editor[data-active="true"] .nf-page-scroll')?.scrollTop ?? 0,
  );
}

/**
 * Wait until the scroller has moved at least `amount` px in `direction`.
 *
 * Chromium animates PageUp/PageDown (and a line step in a loaded renderer)
 * over several frames, so "it moved a little" is not the condition the
 * assertions need: they need the scroll to have *arrived*. A fixed wait after
 * the key press was the old race (P2 item 7).
 */
async function waitScrollBy(before, amount, direction) {
  await page.waitForFunction(
    ({ from, delta, sign }) => {
      const scroller = document.querySelector('.nf-editor[data-active="true"] .nf-page-scroll');
      if (scroller === null) return false;
      return sign > 0 ? scroller.scrollTop >= from + delta : scroller.scrollTop <= from - delta;
    },
    { from: before, delta: amount, sign: direction === 'down' ? 1 : -1 },
    { timeout: 15000 },
  );
}

describe('PG1 Page as a scroll of pages', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(screenshotDir, { recursive: true });
    await mkdir(polishDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('opens at 100 % as one column of touching pages with a 1 px seam and free scroll', async () => {
    await launch('pg1-seam');
    await h.setWindowSize(1440, 900);
    const env = ui.isolated('pg1-seam');
    await openPackage(env, 'Page scroll seam', longDocument());
    const openMs = await showPageRead();
    console.log(`PG1 long document: page ready ${openMs} ms`);

    const state = await surface();
    assert.ok(state.pageCount >= 3, `the long fixture spans pages, got ${state.pageCount}`);
    assert.equal(state.fit, 'width', 'Page opens at fit width');
    assert.equal(state.percent, 100, 'fit width reads 100 %');
    assert.equal(state.zoomLabel, '100%');
    assert.equal(state.snap, 'none', 'there is no scroll snapping');
    assert.equal(state.scrollWidth, state.clientWidth, 'at 100 % the page fits the width');

    const first = await sheetBox(1);
    const second = await sheetBox(2);
    assert.ok(first !== null && second !== null, 'the first pages are mounted');
    assert.equal(first.current, true, 'the indicator page is marked');
    assert.ok(
      Math.abs(first.width - state.clientWidth) <= 1,
      `the paper fills the viewport width (${first.width} vs ${state.clientWidth})`,
    );
    // Pages touch: the next page starts 1 px after the previous paper ends.
    const gap = second.slotTop - first.bottom;
    assert.ok(Math.abs(gap - 1) <= 0.5, `the seam is 1 px (${gap})`);
    assert.ok(second.mounted && first.mounted, 'both columns are real pages');

    const seam = await page.evaluate(() => {
      const slot = document.querySelectorAll(
        '.nf-editor[data-active="true"] .nf-page-slot',
      )[1];
      const style = getComputedStyle(slot, '::before');
      const sheet = document.querySelector(
        '.nf-editor[data-active="true"] .nf-page-sheet',
      );
      const rule = getComputedStyle(document.documentElement).getPropertyValue('--nf-page-rule').trim();
      return {
        height: style.height,
        background: style.backgroundColor,
        shadow: getComputedStyle(sheet).boxShadow,
        rule,
      };
    });
    assert.equal(seam.height, '1px', 'the seam is a 1 px rule');
    assert.notEqual(seam.background, 'rgba(0, 0, 0, 0)', 'the seam paints the page rule colour');
    assert.ok(seam.rule.length > 0, 'the page rule colour is a page-scope value');
    assert.equal(seam.shadow, 'none', 'the paper has no card shadow');

    // Free scroll: stop with half a page above and half below.
    const third = await sheetBox(3);
    await setScroll({ top: third.top - 220 });
    // The centre lands inside page 3: wait for the indicator to name it, then
    // read the whole surface state.
    await ui.waitCurrentPage(3);
    const stopped = await surface();
    const pageTwo = await sheetBox(2);
    const pageThree = await sheetBox(3);
    assert.ok(
      pageTwo !== null && pageThree !== null && pageTwo.bottom > 0 && pageThree.top < stopped.clientHeight,
      'the seam sits inside the viewport (bottom of one page and top of the next)',
    );
    assert.equal(stopped.current, 3, 'the pager names the page under the centre');
    assert.equal(stopped.pager?.value, '3');
    assert.equal(stopped.pager?.total, `/ ${stopped.pageCount}`);
    assert.ok(
      stopped.scrollTop % 1 === 0 && stopped.scrollTop > 0,
      'the stopped offset is a free scroll position, not a page boundary',
    );
    await h.screenshot(join(screenshotDir, 'seam-view-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await h.screenshot(join(screenshotDir, 'indicator-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('keeps the current page when the viewport centre lands exactly on a seam', async () => {
    await launch('pg1-tie');
    await h.setWindowSize(1440, 900);
    const env = ui.isolated('pg1-tie');
    await openPackage(env, 'Page scroll seam tie', longDocument());
    await showPageRead();
    const state = await surface();
    const sheet3 = await sheetBox(3);
    assert.ok(sheet3 !== null);

    // Centre = scrollTop + clientHeight / 2 = page 3's top - 0.5 → inside the
    // 1 px seam row between page 2 and page 3 (the row before the slot).
    const tieTop = sheet3.slotTop - 0.5 - state.clientHeight / 2;
    await ui.gotoPage(2);
    await ui.waitCurrentPage(2);
    await setScroll({ top: tieTop });
    assert.equal((await surface()).current, 2, 'a seam tie keeps the current page');

    await setScroll({ top: tieTop - 2 });
    assert.equal((await surface()).current, 2, 'the page before the seam still owns the centre');

    await setScroll({ top: tieTop + 2 });
    assert.equal(
      (await surface()).current,
      3,
      'one pixel past the seam the next page owns the centre',
    );

    // Same rule coming back: the seam row never flips the indicator twice.
    await setScroll({ top: tieTop });
    assert.equal((await surface()).current, 3, 'the tie keeps page 3 on the way back');
  });

  it('moves to page starts with ⌘↓ / ⌘↑ and the page jump', async () => {
    await launch('pg1-keys');
    await h.setWindowSize(1440, 900);
    const env = ui.isolated('pg1-keys');
    await openPackage(env, 'Page scroll keys', longDocument());
    await showPageRead();
    const state = await surface();
    assert.ok(state.pageCount >= 3);

    await page.locator('.nf-editor[data-active="true"] .nf-page-scroll').focus();
    await page.keyboard.press('Meta+ArrowDown');
    await ui.waitCurrentPage(2);
    const pageTwo = await sheetBox(2);
    assert.ok(pageTwo !== null);
    assert.ok(Math.abs(pageTwo.top) <= 2, `⌘↓ lands on page 2's start (${pageTwo.top})`);

    await page.keyboard.press('Meta+ArrowDown');
    await ui.waitCurrentPage(3);
    const pageThree = await sheetBox(3);
    assert.ok(pageThree !== null && Math.abs(pageThree.top) <= 2);

    await page.keyboard.press('Meta+ArrowUp');
    await ui.waitCurrentPage(2);
    const back = await sheetBox(2);
    assert.ok(back !== null && Math.abs(back.top) <= 2, '⌘↑ lands on the previous page start');

    await ui.gotoPage(1);
    await ui.waitCurrentPage(1);
    const first = await sheetBox(1);
    assert.ok(first !== null);
    assert.ok(
      Math.abs(first.top) <= 2 || (await surface()).scrollTop <= 0.5,
      'page 1 lands at the top of the surface',
    );

    await ui.gotoPage(3);
    await ui.waitCurrentPage(3);
    const jumped = await surface();
    assert.equal(jumped.pager?.value, '3', 'the pager field shows the jumped page');
    assert.equal(jumped.pager?.total, `/ ${jumped.pageCount}`);
    const jumpedSheet = await sheetBox(3);
    assert.ok(jumpedSheet !== null && Math.abs(jumpedSheet.top) <= 2, 'the jump lands on the page start');

    // The pager keeps focus in its field after the jump: the movement keys
    // still work there (a shell channel, with the page field as its one
    // documented text-input exception).
    await page.keyboard.press('Meta+ArrowDown');
    await ui.waitCurrentPage(4);
    const fourth = await sheetBox(4);
    assert.ok(fourth !== null && Math.abs(fourth.top) <= 2, '⌘↓ keeps working after the jump');

    // The scroll region is a keyboard target: PageDown and the arrows scroll
    // the pages natively (free scroll, not a pager).
    await ui.gotoPage(2);
    await page.locator('.nf-editor[data-active="true"] .nf-page-scroll').focus();
    const beforeKey = (await surface()).scrollTop;
    const viewport = (await surface()).clientHeight;
    await page.keyboard.press('PageDown');
    // PageDown moves a viewport; wait for that distance, not for "it moved".
    await waitScrollBy(beforeKey, viewport / 2, 'down');
    const afterKey = await scrollTop();
    assert.ok(afterKey > beforeKey, `PageDown scrolls the pages (${beforeKey} -> ${afterKey})`);
    await page.keyboard.press('ArrowDown');
    await waitScrollBy(afterKey, 1, 'down');
    const arrowKey = await scrollTop();
    assert.ok(arrowKey > afterKey, 'the arrow key keeps scrolling inside the region');
    await page.keyboard.press('PageUp');
    await waitScrollBy(arrowKey, viewport / 2, 'up');
    assert.ok(
      (await scrollTop()) < arrowKey,
      'PageUp scrolls one viewport back; the keys are never paging commands',
    );
  });

  it('pages with the toolbar arrows and a typed page, with no jump dialog', async () => {
    await launch('pp1-pager');
    await h.setWindowSize(1440, 900);
    const env = ui.isolated('pp1-pager');
    await openPackage(env, 'Page pager', longDocument());
    await showPageRead();

    const state = await surface();
    const last = state.pageCount;
    assert.ok(last >= 3, 'the fixture spans several pages');

    // At rest: page 1, the up arrow disabled at the first page, a slash label.
    const rest = await pagerState();
    assert.equal(rest.role, 'group');
    assert.equal(rest.ariaLabel, 'Page position');
    assert.equal(rest.inputLabel, 'Page');
    assert.equal(rest.value, '1');
    assert.equal(rest.total, `/ ${last}`, 'a slash, not “of”');
    assert.equal(rest.prevDisabled, true, 'Previous page is disabled on the first page');
    assert.equal(rest.nextDisabled, false);
    assert.equal(rest.hasPopup, null, 'the pager is not a dialog trigger');
    assert.equal(rest.jumpInputs, 0, 'the page jump dialog is gone');
    assert.equal(state.current, 1);
    await h.screenshot(join(polishDir, 'pager-rest-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Clicking the field selects its content.
    const input = page.locator('.nf-canvas-header [data-page-position-input]');
    await input.click();
    const focused = await pagerState();
    assert.equal(focused.focused, true, 'the field takes focus');
    assert.equal(focused.selectionStart, 0);
    assert.equal(focused.selectionEnd, focused.value.length, 'a click selects the page');
    await h.screenshot(join(polishDir, 'pager-focused-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Digits only: a stray letter never reaches the store.
    await input.fill(`1a${last > 2 ? 2 : ''}`);
    assert.equal(await input.inputValue(), `1${last > 2 ? 2 : ''}`);
    assert.equal((await surface()).current, 1, 'typing alone never moves the surface');

    // Enter jumps to the page start and keeps the value deterministic.
    const entered = last > 2 ? 2 : last;
    await input.fill(String(entered));
    await input.press('Enter');
    await ui.waitCurrentPage(entered);
    await waitPagerValue(entered);
    const enteredSheet = await sheetBox(entered);
    assert.ok(
      enteredSheet !== null && Math.abs(enteredSheet.top) <= 2,
      'Enter lands on the page start',
    );

    // Escape restores the page you were on; it never jumps.
    await input.fill(String(last));
    await input.press('Escape');
    await waitPagerValue(entered);
    assert.equal((await surface()).current, entered, 'Escape leaves the page unchanged');
    assert.equal(await input.inputValue(), String(entered), 'Escape restores the field');

    // An empty value restores instead of jumping to 1.
    await input.fill('');
    await input.press('Enter');
    await waitPagerValue(entered);
    assert.equal((await surface()).current, entered, 'an empty value restores the page');

    // Blur commits like Enter.
    const blurTarget = last > 2 ? 3 : last;
    await input.fill(String(blurTarget));
    await page.locator('[data-zoom-value]').click();
    await ui.waitCurrentPage(blurTarget);
    await waitPagerValue(blurTarget);
    const blurSheet = await sheetBox(blurTarget);
    assert.ok(blurSheet !== null && Math.abs(blurSheet.top) <= 2, 'blur commits the typed page');

    // Out-of-range values clamp; the last page disables Next page.
    await input.fill('999');
    await input.press('Enter');
    await ui.waitCurrentPage(last);
    await waitPagerValue(last);
    const clamped = await pagerState();
    assert.equal(clamped.prevDisabled, false);
    assert.equal(clamped.nextDisabled, true, 'Next page is disabled on the last page');
    await h.screenshot(join(polishDir, 'pager-last-page-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await input.fill('0');
    await input.press('Enter');
    await ui.waitCurrentPage(1);
    await waitPagerValue(1);
    assert.equal(
      (await pagerState()).prevDisabled,
      true,
      'the down-to-up clamp lands on the first page',
    );
    await h.screenshot(join(polishDir, 'pager-first-page-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // The arrows move one page start each, and scrolling writes the number
    // back without a loop (the page model never re-runs).
    const runs = (await surface()).runs;
    await page.locator('[data-page-position-next]').click();
    await ui.waitCurrentPage(2);
    await waitPagerValue(2);
    const second = await sheetBox(2);
    assert.ok(second !== null && Math.abs(second.top) <= 2, 'Next page lands on a page start');

    await page.locator('.nf-editor[data-active="true"] .nf-page-scroll').focus();
    const beforeScroll = await surface();
    const third = await sheetBox(3);
    // Put the viewport centre 30 px inside page 3 (the store keeps the page
    // the centre names, and the field follows that same page).
    await setScroll({
      top: beforeScroll.scrollTop + third.slotTop - beforeScroll.clientHeight / 2 + 30,
    });
    assert.equal((await surface()).current, 3, 'scrolling writes the page under the centre');
    await waitPagerValue(3);
    assert.equal((await surface()).runs, runs, 'no page-model run from the control');

    // A typed page then an arrow applies the value once and steps once, never
    // twice: the blur commit has already asked for page 2, so Next lands on 3.
    await input.fill('2');
    await page.locator('[data-page-position-next]').click();
    await ui.waitCurrentPage(3);
    await waitPagerValue(3);

    await page.locator('[data-page-position-prev]').click();
    await ui.waitCurrentPage(2);
    await waitPagerValue(2);
    const back = await sheetBox(2);
    assert.ok(back !== null && Math.abs(back.top) <= 2, 'Previous page lands on a page start');
  });

  it('keeps 100 % at fit width, 200 % scrolling horizontally, and 50 % with margins', async () => {
    await launch('pg1-zoom');
    await h.setWindowSize(1440, 900);
    const env = ui.isolated('pg1-zoom');
    await openPackage(env, 'Page scroll zoom', longDocument());
    await showPageRead();
    await ui.gotoPage(2);
    await ui.waitCurrentPage(2);

    const rest = await surface();
    assert.equal(rest.percent, 100);
    assert.equal(rest.scrollWidth, rest.clientWidth, '100 % has no horizontal scroll');
    const restSheet = await sheetBox(2);
    assert.ok(restSheet !== null);
    assert.ok(Math.abs(restSheet.width - rest.clientWidth) <= 1);

    // 200 %: the paper is twice the viewport width and scrolls sideways.
    await setZoom(10, 'in', 200);
    const zoomed = await surface();
    assert.equal(zoomed.percent, 200);
    assert.equal(zoomed.zoomLabel, '200%');
    assert.ok(zoomed.scrollWidth > zoomed.clientWidth + 100, 'a horizontal scrollbar appears');
    await setScroll({ left: 200 });
    const scrolled = await surface();
    assert.ok(scrolled.scrollLeft > 0, 'the paper scrolls horizontally');
    assert.equal(scrolled.current, 2, 'horizontal zoom keeps the current page');
    const zoomedSheet = await sheetBox(2);
    assert.ok(zoomedSheet !== null);
    assert.ok(
      Math.abs(zoomedSheet.width - zoomed.clientWidth * 2) <= 3,
      `at 200 % the paper is twice the viewport (${zoomedSheet.width})`,
    );
    await h.screenshot(join(screenshotDir, 'zoom-200-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // 50 %: one column, smaller than the viewport, centered with margins.
    await setZoom(15, 'out', 50);
    const shrunk = await surface();
    assert.equal(shrunk.percent, 50);
    assert.equal(shrunk.zoomLabel, '50%');
    assert.equal(shrunk.scrollWidth, shrunk.clientWidth, '50 % never scrolls sideways');
    const small = await sheetBox(2);
    assert.ok(small !== null);
    const rightMargin = shrunk.clientWidth - small.left - small.width;
    assert.ok(Math.abs(small.width - shrunk.clientWidth / 2) <= 3, 'the paper is half the width');
    assert.ok(small.left > 20 && rightMargin > 20, 'the paper keeps margins on both sides');
    assert.ok(
      Math.abs(small.left - rightMargin) <= 4,
      `the margins are symmetric (${small.left} vs ${rightMargin})`,
    );
    await h.screenshot(join(screenshotDir, 'zoom-50-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // ⌘0 returns to the rest state.
    await page.keyboard.press('Meta+0');
    await page.waitForFunction(
      () =>
        document.querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-page-zoom') === '100',
      undefined,
      { timeout: 5000 },
    );
    const reset = await surface();
    assert.equal(reset.fit, 'width');
    assert.equal(reset.scrollWidth, reset.clientWidth);
    assert.equal(reset.current, 2, 'the rest state stays on the page');

    // No snapping anywhere in the range: an arbitrary offset is kept.
    await setScroll({ top: 700 });
    const free = await surface();
    assert.ok(Math.abs(free.scrollTop - 700) <= 1, `free scroll keeps 700 (${free.scrollTop})`);
  });

  it('mounts only the visible window of a long note and keeps the scrollbar truthful', async () => {
    await launch('pg1-mount');
    await h.setWindowSize(1440, 900);
    const env = ui.isolated('pg1-mount');
    const packagePath = await openPackage(
      env,
      'Page scroll long mount',
      multiPageBlocksDocument(61),
    );
    // One block starts every page: the mount test needs a real 50+ page note,
    // not a compact one, and a manual break is the document's own way to say
    // "start this block on a new page".
    await page.evaluate(
      ({ path }) => {
        const structure = window.__noteforestTest.structure();
        const ids = structure.chapters.flatMap((chapter) => chapter.topLevelBlockIds);
        return window.__noteforestTest.setPageSettingsOverride(path, {
          manualBreakBeforeBlockIds: ids.slice(1),
        });
      },
      { path: packagePath },
    );
    const openMs = await showPageRead();
    const state = await surface();
    assert.ok(state.pageCount >= 50, `the long note derives 50+ pages, got ${state.pageCount}`);
    console.log(`PG1 long mount: ${state.pageCount} pages, page ready ${openMs} ms`);

    assert.ok(state.mounted > 0, 'the visible window is mounted');
    assert.ok(
      state.mounted <= 2 * 2 + 3,
      `only the visible window ±2 is mounted (${state.mounted})`,
    );
    assert.equal(state.sheets.length, state.mounted, 'mounted count matches the sheets in the DOM');
    assert.equal(
      state.placeholders,
      state.pageCount - state.mounted,
      'every other page is a placeholder',
    );

    const first = await sheetBox(1);
    assert.ok(first !== null, 'page 1 is mounted at the start');
    // Truthful scrollbar: the column is pageCount sheets plus pageCount-1 seams
    // plus the 14 px top and 8 px bottom stage padding.
    const expectedHeight = first.height * state.pageCount + (state.pageCount - 1) + 22;
    assert.ok(
      Math.abs(state.scrollHeight - expectedHeight) <= 3,
      `the scroll height is the full column (${state.scrollHeight} vs ${expectedHeight})`,
    );

    await setScroll({ top: state.scrollHeight });
    await page.waitForFunction(
      () => {
        const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
        return (
          view !== null &&
          Number(view.getAttribute('data-current-page')) ===
            Number(view.getAttribute('data-page-count'))
        );
      },
      undefined,
      { timeout: 10000 },
    );
    const atEnd = await surface();
    assert.ok(
      Math.abs(atEnd.scrollTop + atEnd.clientHeight - atEnd.scrollHeight) <= 1,
      'the scrollbar reaches the end of the note',
    );
    assert.equal(atEnd.current, atEnd.pageCount, 'the last page is the current page at the end');
    const endSheet = await sheetBox(atEnd.pageCount);
    assert.ok(endSheet !== null && endSheet.mounted, 'the last page is mounted at the end');

    // The middle of the note mounts a window far from both ends.
    await setScroll({ top: Math.round(atEnd.scrollHeight / 2) });
    const middle = await surface();
    assert.ok(middle.current > 2 && middle.current < middle.pageCount - 1);
    assert.ok(!middle.sheets.includes(1), 'page 1 is unmounted mid-note');
    assert.ok(
      !middle.sheets.includes(middle.pageCount),
      'the last page is unmounted mid-note',
    );
    assert.ok(
      middle.sheets.includes(middle.current),
      'the indicator page is always mounted',
    );
    await h.screenshot(join(screenshotDir, 'long-document-mid-scroll-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await setScroll({ top: 0 });
    await ui.waitCurrentPage(1);
    const back = await surface();
    assert.equal(back.current, 1);
    assert.ok(back.sheets.includes(1), 'page 1 remounts at the start');
    assert.ok(back.scrollTop <= 1, 'the start is the start');

    // Scrolling never re-measures the page model.
    assert.equal(back.runs, state.runs, 'no model run while scrolling');
    assert.equal(middle.runs, state.runs, 'no model run mid-scroll');

    // The page model and the count are untouched by the viewport.
    assert.equal((await surface()).pageCount, state.pageCount);
    assert.equal(await ui.pageSheet(1).count(), 1, 'page 1 exists once');
  });

  it('keeps the Page Edit overlay on its page while scrolling and commits after a scroll', async () => {
    await launch('pg1-edit');
    await h.setWindowSize(1440, 900);
    const env = ui.isolated('pg1-edit');
    await openPackage(env, 'Page scroll edit', longDocument());
    await showPageRead();
    await enterPageEdit();

    // Page 2 holds the long branch's continuation: open its first fragment.
    await ui.gotoPage(2);
    await ui.waitCurrentPage(2);
    const fragment = ui
      .currentPageSheet()
      .locator('.nf-page-fragment[data-fragment-block="child"][data-fragment-first="0"]');
    await fragment.waitFor();
    await fragment.dblclick();
    const overlay = page.locator('.nf-editor[data-active="true"] [data-page-edit-overlay="true"]');
    await overlay.waitFor({ timeout: 5000 });
    const runsBefore = (await surface()).runs;
    // Tag the live node: a remount would drop the attribute.
    await overlay.evaluate((element) => {
      element.setAttribute('data-pg1-same-node', 'true');
    });
    const before = await overlay.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left };
    });

    // Scroll within the page: the overlay moves with its page and stays open.
    await setScroll({ top: (await surface()).scrollTop + 120 });
    const scrolled = await surface();
    assert.equal(scrolled.current, 2, 'a small scroll keeps the page and the overlay page');
    assert.equal(
      await overlay.getAttribute('data-pg1-same-node'),
      'true',
      'scrolling never remounts the overlay',
    );
    const afterScroll = await overlay.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left };
    });
    assert.ok(
      Math.abs(afterScroll.top - (before.top - 120)) <= 2,
      'the overlay scrolls with its page, it does not move on its own',
    );
    assert.equal(afterScroll.left, before.left, 'the overlay keeps its lateral position');

    // Scroll further away: the page is still mounted (the overlay pins it) and
    // the overlay is never remounted.
    await setScroll({ top: 0 });
    assert.equal(
      await overlay.getAttribute('data-pg1-same-node'),
      'true',
      'scrolling away from the page keeps the same overlay node',
    );
    assert.equal(await overlay.count(), 1, 'scrolling never commits the overlay');
    assert.equal((await surface()).runs, runsBefore, 'scrolling never re-paginates');

    // Commit while scrolled away: the one structural commit still applies.
    await page.keyboard.press('Meta+Enter');
    await page.waitForSelector('.nf-editor[data-active="true"] [data-page-edit-overlay]', {
      state: 'detached',
      timeout: 15000,
    });
    const content = await page.evaluate(() => {
      const structure = window.__noteforestTest.structure();
      return JSON.stringify(structure.blocks['child']?.content ?? {});
    });
    assert.ok(content.length > 100, 'the committed block content is still there');
  });

  it('rings the found block on the scrolled page and screenshots the page after a manual break', async () => {
    await launch('pg1-find-break');
    await h.setWindowSize(1440, 900);
    const env = ui.isolated('pg1-find-break');
    const packagePath = await openPackage(
      env,
      'Page scroll find',
      pageDocument({
        id: 'page-scroll-find',
        title: 'Page scroll find',
        chapterTitle: 'Find and break',
        blocks: Array.from({ length: 24 }, (_, index) =>
          textBlock(
            `b${index + 1}`,
            `Block ${index + 1}`,
            `A unique sentence number ${index + 1} lives on its own page.`,
          ),
        ),
      }),
    );
    // One block per page: the hit's page is unambiguous and the manual break is
    // visible in its cause (the blank tail above it).
    await page.evaluate(
      ({ path }) => {
        const structure = window.__noteforestTest.structure();
        const ids = structure.chapters.flatMap((chapter) => chapter.topLevelBlockIds);
        return window.__noteforestTest.setPageSettingsOverride(path, {
          manualBreakBeforeBlockIds: ids.slice(1),
        });
      },
      { path: packagePath },
    );
    await showPageRead();
    const before = await surface();
    assert.equal(before.pageCount, 24, 'every block starts its own page');

    // A hit on a later page moves the surface there and rings the one block.
    await page.keyboard.press('Meta+f');
    await page.locator('.nf-find-input').waitFor();
    await page.locator('.nf-find-input').fill('sentence number 18');
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.state();
        return state.findQuery === 'sentence number 18' && state.findResults.length > 0;
      },
      undefined,
      { timeout: 15000 },
    );
    await page.waitForFunction(
      () =>
        Number(
          document
            .querySelector('.nf-editor[data-active="true"] .nf-page-view')
            ?.getAttribute('data-current-page'),
        ) === 18,
      undefined,
      { timeout: 15000 },
    );
    const found = await surface();
    assert.equal(found.current, 18, 'the hit scrolled the page into view');
    const ring = page.locator(
      '.nf-editor[data-active="true"] .nf-page-sheet[data-page-current="true"] [data-find-current="true"]',
    );
    await ring.waitFor({ timeout: 10000 });
    assert.equal(await ring.getAttribute('data-fragment-block'), 'b18');
    // The ring is a page-scoped outline on the block's fragment, where the
    // indicator says the hit is. (The hidden Continuous canvas keeps its own
    // find decoration; the Page surface rings exactly one page fragment.)
    const rings = await page
      .locator('.nf-editor[data-active="true"] .nf-page-sheet [data-find-current="true"]')
      .evaluateAll((elements) =>
        elements.map(
          (element) =>
            `${element.getAttribute('data-fragment-block')}@${element
              .closest('.nf-page-sheet')
              ?.getAttribute('data-page-number')}`,
        ),
      );
    assert.deepEqual(rings, ['b18@18'], 'exactly one fragment is ringed, on the current page');
    const sheet = await sheetBox(18);
    assert.ok(sheet !== null && Math.abs(sheet.top) <= 2, 'the found page starts at the viewport top');
    await page.keyboard.press('Escape');

    // The page after a manual break, with the blank tail of the page above it.
    await ui.gotoPage(2);
    await ui.waitCurrentPage(2);
    await ui.pageSheet(2).locator('[data-fragment-block="b2"]').waitFor();
    await setScroll({ top: Math.max(0, (await surface()).scrollTop - 160) });
    await h.screenshot(join(screenshotDir, 'page-after-manual-break-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });
});
