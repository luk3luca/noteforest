import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  pageDocument,
  portraitLongDocument,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';

const tempRoot = artifactsPath('m4b1c-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(env) {
  page = await ui.launch(env);
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

function markerLayer() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-markers');
}

async function waitMarkersReady() {
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
}

async function markerState() {
  return markerLayer().evaluate((element) => ({
    count: Number(element.getAttribute('data-page-marker-count') ?? '-1'),
    starts: Number(element.getAttribute('data-page-marker-starts') ?? '-1'),
    continuations: Number(element.getAttribute('data-page-marker-continuations') ?? '-1'),
    pages: element.getAttribute('data-page-marker-pages') ?? '',
    pageCount: Number(element.getAttribute('data-page-count') ?? '-1'),
    runs: Number(element.getAttribute('data-page-model-runs') ?? '-1'),
    calls: Number(element.getAttribute('data-page-model-calls') ?? '-1'),
    ms: Number(element.getAttribute('data-page-model-ms') ?? 'NaN'),
    computeMs: Number(element.getAttribute('data-page-model-compute-ms') ?? 'NaN'),
  }));
}

function activePageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

async function waitPageReady() {
  await page.waitForFunction(
    () => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return (
        view !== null &&
        view.getAttribute('data-ready') === 'true' &&
        view.getAttribute('data-updating') === 'false'
      );
    },
    undefined,
    { timeout: 20000 },
  );
}

async function showPageView() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
}

async function showContinuous() {
  await page.keyboard.press('Meta+2');
  await markerLayer().waitFor({ state: 'visible' });
  await waitMarkersReady();
}

/**
 * Four pages forced by manual break hints, so every derived page starts at a
 * block boundary. This makes page-start markers deterministic and comparable
 * with Page Read's page count.
 */
function manualBreakDocument() {
  const document = pageDocument({
    id: 'm4b1c-breaks',
    title: 'Continuous markers',
    orientation: 'portrait',
    chapterTitle: 'Derived pages',
    blocks: [
      textBlock('b1', 'One', 'First page body. '.repeat(18)),
      textBlock('b2', 'Two', 'Second page body. '.repeat(18)),
      textBlock('b3', 'Three', 'Third page body. '.repeat(18)),
      textBlock('b4', 'Four', 'Fourth page body. '.repeat(18)),
    ],
  });
  document.manualBreakBeforeBlockIds = ['b2', 'b3', 'b4'];
  return document;
}

describe('M4b1c continuous page-break markers', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('shows one page-start marker per derived page and matches Page Read', async () => {
    const env = ui.isolated('m4b1c-breaks');
    await launch(env);
    await openPackage(env, 'Continuous markers', manualBreakDocument());
    await waitMarkersReady();

    const continuous = await markerState();
    assert.equal(continuous.pageCount, 4, 'four manual-break pages are derived');
    assert.equal(continuous.starts, 4, 'one page-start marker per derived page');
    assert.equal(continuous.continuations, 0);
    assert.equal(continuous.pages, '1,2,3,4', 'markers are numbered in page order');
    assert.equal(continuous.runs, 1, 'the model ran once for the initial revision');

    const starts = markerLayer().locator('[data-page-marker="start"]');
    assert.equal(await starts.count(), 4);
    for (const pageNumber of [1, 2, 3, 4]) {
      const marker = markerLayer().locator(
        `[data-page-marker="start"][data-page-marker-page="${pageNumber}"]`,
      );
      assert.equal(await marker.getAttribute('role'), 'separator');
      assert.equal(await marker.getAttribute('aria-orientation'), 'horizontal');
      const label = await marker.getAttribute('aria-label');
      assert.match(label ?? '', new RegExp(`^Page ${pageNumber} starts here`));
      assert.match(label ?? '', /Page Read and PDF are the exact geometry/);
      assert.equal((await marker.innerText()).trim(), `Page ${pageNumber} starts here`);
    }

    // The marker y is the anchor block's top edge in the shared content
    // coordinate system: it never shifts the block itself.
    for (const blockId of ['b1', 'b2', 'b3', 'b4']) {
      const pageNumber = { b1: '1', b2: '2', b3: '3', b4: '4' }[blockId];
      const markerTop = await markerLayer()
        .locator(`[data-page-marker="start"][data-page-marker-block="${blockId}"]`)
        .evaluate((element) => element.getBoundingClientRect().top);
      const cardTop = await page
        .locator(`.nf-editor[data-active="true"] [data-block-card="${blockId}"]`)
        .evaluate((element) => element.getBoundingClientRect().top);
      assert.ok(
        Math.abs(markerTop - cardTop) <= 1.5,
        `page ${pageNumber} marker sits on block ${blockId}'s top edge`,
      );
    }

    // Page Read derives the same count from the same model, and switching
    // layouts does not run the model again.
    const callsBefore = continuous.calls;
    await showPageView();
    const pageView = activePageView();
    assert.equal(Number(await pageView.getAttribute('data-page-count')), 4);
    assert.equal(
      Number(await pageView.getAttribute('data-model-runs')),
      1,
      'Page Read reuses the continuous model (no second measurement)',
    );
    assert.equal(
      Number(await pageView.getAttribute('data-measurement-calls')),
      callsBefore,
      'both surfaces report the same measurement pass',
    );
    assert.equal(await pageView.locator('[data-page-marker]').count(), 0);
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-page-markers').count(),
      0,
      'the continuous marker layer is not rendered in Page',
    );

    await showContinuous();
    assert.equal((await markerState()).runs, 1, 'returning to Continuous does not re-measure');

    // Continuous Read keeps the same derived hints; nothing about the layer is
    // editable or a focus stop.
    const firstMarker = markerLayer().locator('[data-page-marker="start"]').first();
    assert.equal(await firstMarker.getAttribute('tabindex'), null);
    assert.equal(
      await firstMarker.locator('.nf-page-marker-chip-start').getAttribute('tabindex'),
      null,
    );
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'read',
      (await h.state()).activeTab,
      { timeout: 5000 },
    );
    assert.equal((await markerState()).count, 4, 'markers remain in Continuous Read');
    assert.equal(await markerLayer().locator('[data-page-marker="start"]').count(), 4);
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      (await h.state()).activeTab,
      { timeout: 5000 },
    );
  });

  it('shows a continuation chip for a block that spans pages, without duplicates', async () => {
    const env = ui.isolated('m4b1c-long');
    await launch(env);
    await openPackage(env, 'Portrait long study', portraitLongDocument());
    await waitMarkersReady();

    const continuous = await markerState();
    assert.ok(continuous.pageCount > 2, `long fixture derives multiple pages, got ${continuous.pageCount}`);
    assert.equal(continuous.starts, 1, 'only page 1 starts at a block boundary');
    assert.equal(continuous.continuations, 1, 'one chip for the spanning block');

    const chip = markerLayer().locator(
      '[data-page-marker="continuation"][data-page-marker-block="child"]',
    );
    assert.equal(await chip.count(), 1, 'never duplicate the chip for one block');
    assert.equal(await chip.getAttribute('role'), 'note');
    assert.match(await chip.getAttribute('aria-label') ?? '', /^Continues on pages 2–7/);
    assert.match(await chip.innerText(), /Continues on pages 2–7/);
    assert.equal(
      await markerLayer()
        .locator('[data-page-marker="continuation"][data-page-marker-block="child"]')
        .getAttribute('data-page-marker-pages'),
      '2,3,4,5,6,7',
    );

    // Page Read reports the same first continuation target on page 1.
    await showPageView();
    await activePageView().locator('[data-page-continues-on]').waitFor();
    const pageTarget = await activePageView()
      .locator('[data-page-continues-on]')
      .getAttribute('data-page-continues-on');
    assert.equal(pageTarget, '2', 'Page Read and the chip agree on the next page');
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-page-markers').count(),
      0,
      'Page has no continuous marker overlay',
    );

    await showContinuous();
    assert.match(
      await markerLayer()
        .locator('[data-page-marker="continuation"][data-page-marker-block="child"]')
        .getAttribute('aria-label') ?? '',
      /Continues on pages 2–7/,
    );
  });

  it('keeps markers out of collapsed content without changing the page model', async () => {
    const env = ui.isolated('m4b1c-collapse');
    await launch(env);
    await openPackage(env, 'Portrait long study', portraitLongDocument());
    await waitMarkersReady();

    const before = await markerState();
    assert.equal(before.continuations, 1);
    await page.locator('.nf-editor[data-active="true"] [data-branch-port="parent"]').click();
    await page.waitForFunction(
      () => {
        const card = document.querySelector('.nf-editor[data-active="true"] [data-block-card="child"]');
        if (card === null) return true;
        const rect = card.getBoundingClientRect();
        return rect.width === 0 || rect.height === 0;
      },
      undefined,
      { timeout: 5000 },
    );
    await page.waitForTimeout(250);
    const collapsed = await markerState();
    assert.equal(collapsed.continuations, 0, 'the hidden block has no continuation chip');
    assert.equal(collapsed.count, collapsed.starts);
    assert.equal(collapsed.pageCount, before.pageCount, 'collapse does not repaginate');
    assert.equal(collapsed.runs, before.runs, 'collapse is view state, not a page-model revision');
    assert.equal(
      await markerLayer()
        .locator('[data-page-marker="continuation"][data-page-marker-block="child"]')
        .count(),
      0,
    );

    // Page/PDF still contain the hidden block: collapse never removes content
    // from the full page model.
    await showPageView();
    assert.equal(Number(await activePageView().getAttribute('data-page-count')), before.pageCount);
    await activePageView().locator('[data-fragment-block="child"]').waitFor({ timeout: 5000 });
    assert.ok(
      (await activePageView().locator('[data-fragment-block="child"]').count()) > 0,
      'the collapsed descendant is still in Page Read',
    );

    // Expand again and the chip returns; no document change is involved.
    await showContinuous();
    await page.locator('.nf-editor[data-active="true"] [data-branch-port="parent"]').click();
    await page.waitForFunction(
      () => {
        const card = document.querySelector('.nf-editor[data-active="true"] [data-block-card="child"]');
        if (card === null) return false;
        const rect = card.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      },
      undefined,
      { timeout: 5000 },
    );
    await waitMarkersReady();
    const expanded = await markerState();
    assert.equal(expanded.continuations, 1, 'expanding restores the chip');
    assert.equal(expanded.pageCount, before.pageCount);
    assert.equal(expanded.runs, before.runs, 'expanding does not re-measure either');
  });

  it('does not change block rects, scroll height or scroll position', async () => {
    const env = ui.isolated('m4b1c-neutral');
    await launch(env);
    await openPackage(env, 'Continuous markers', manualBreakDocument());
    await waitMarkersReady();

    const measure = () =>
      page.evaluate(() => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const content = scope?.querySelector('.nf-canvas-content');
        const scroller = scope?.querySelector('.nf-editor-scroll');
        if (content === null || content === undefined || scroller === null || scroller === undefined) {
          return null;
        }
        const rects = [...content.querySelectorAll('[data-block-card]')].map((card) => {
          const rect = card.getBoundingClientRect();
          return {
            id: card.getAttribute('data-block-card'),
            x: Math.round(rect.x * 10) / 10,
            y: Math.round(rect.y * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
          };
        });
        return {
          rects,
          contentHeight: content.getBoundingClientRect().height,
          scrollHeight: scroller.scrollHeight,
          scrollTop: scroller.scrollTop,
        };
      });

    const withMarkers = await measure();
    await markerLayer().evaluate((element) => {
      element.dataset['hiddenForTest'] = 'true';
      element.style.display = 'none';
    });
    await page.waitForTimeout(80);
    const withoutMarkers = await measure();
    assert.deepEqual(withoutMarkers, withMarkers, 'the overlay is layout-neutral');
    await markerLayer().evaluate((element) => {
      element.style.display = '';
      delete element.dataset['hiddenForTest'];
    });
  });

  it('updates markers after a live edit without scrolling the editor', async () => {
    const env = ui.isolated('m4b1c-live');
    await launch(env);
    await openPackage(env, 'Portrait long study', portraitLongDocument());
    await waitMarkersReady();

    const before = await markerState();
    assert.equal(before.continuations, 1);
    const chipBefore = markerLayer()
      .locator('[data-page-marker="continuation"][data-page-marker-block="child"]');
    const pagesBefore = await chipBefore.getAttribute('data-page-marker-pages');
    assert.equal(pagesBefore, '2,3,4,5,6,7');

    await page
      .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
      .evaluate((element) => {
        element.scrollTop = 80;
      });
    await page.waitForTimeout(80);
    const scrollBefore = await page
      .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
      .evaluate((element) => element.scrollTop);
    assert.equal(scrollBefore, 80);

    // Grow the long block: the paginator must add pages and the continuation
    // chip must update in place. The continuous scroll is not a layout input.
    const structure = await ui.structure();
    const content = structure.blocks['child'].content;
    const children = [...(content.children ?? [])];
    for (let index = 0; index < 40; index += 1) {
      children.push({
        type: 'paragraph',
        children: [
          {
            type: 'text',
            text: `Extra paragraph ${index + 1}. A live edit repaginates the derived markers after the debounce.`,
          },
        ],
      });
    }
    await ui.applyCommand({
      type: 'block.editContent',
      blockId: 'child',
      content: { ...content, children },
    });
    await page.waitForFunction(
      (previousPages) => {
        const layer = document.querySelector('.nf-editor[data-active="true"] .nf-page-markers');
        const chip = document.querySelector(
          '.nf-editor[data-active="true"] [data-page-marker="continuation"][data-page-marker-block="child"]',
        );
        return (
          layer !== null &&
          layer.getAttribute('data-page-model-updating') === 'false' &&
          chip !== null &&
          chip.getAttribute('data-page-marker-pages') !== previousPages
        );
      },
      pagesBefore,
      { timeout: 20000 },
    );
    const after = await markerState();
    assert.equal(after.continuations, 1, 'the grown block still spans pages');
    assert.equal(after.runs, before.runs + 1, 'the edit repaginates exactly once');
    const pagesAfter = await markerLayer()
      .locator('[data-page-marker="continuation"][data-page-marker-block="child"]')
      .getAttribute('data-page-marker-pages');
    assert.notEqual(pagesAfter, pagesBefore, 'the chip reports the new continuation range');
    const scrollAfter = await page
      .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
      .evaluate((element) => element.scrollTop);
    assert.ok(Math.abs(scrollAfter - scrollBefore) <= 1, 'markers update without a scroll jump');
  });

  it('degrades to no markers and keeps typing usable when measurement fails', async () => {
    const env = ui.isolated('m4b1c-error');
    await launch(env);
    await openPackage(env, 'Portrait long study', portraitLongDocument());
    await waitMarkersReady();

    await page.evaluate(() => {
      Object.defineProperty(document.fonts, 'ready', {
        configurable: true,
        get: () => Promise.reject(new Error('Forced continuous marker failure')),
      });
    });
    await ui.applyCommand({
      type: 'block.editContent',
      blockId: 'child',
      content: {
        type: 'doc',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Forced failure body.' }],
          },
        ],
      },
    });
    await page.waitForFunction(
      () => {
        const status = document.querySelector('.nf-editor[data-active="true"] .nf-page-markers-status');
        return status !== null && status.textContent?.includes('Page-break markers are unavailable');
      },
      undefined,
      { timeout: 20000 },
    );
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-page-marker').count(),
      0,
      'failures render no stale markers',
    );
    assert.match(
      await page.locator('.nf-editor[data-active="true"] .nf-page-markers-status').innerText(),
      /Forced continuous marker failure/,
    );

    const card = h.activeEditor().locator('[data-block-card="parent"]');
    await card.locator('.nf-block-prose').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Typing stays usable.');
    await h.waitEditorText('Typing stays usable.');
  });

  it('measures the 300-block continuous page model and typing responsiveness', async () => {
    const env = ui.isolated('m4b1c-perf');
    await launch(env);
    const started = Date.now();
    await page.evaluate(() => window.__noteforestTest.seed('performance'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await waitMarkersReady();
    const readyMs = Date.now() - started;

    const initial = await markerState();
    assert.ok(initial.pageCount > 1, `300-block fixture derives pages, got ${initial.pageCount}`);
    assert.ok(initial.calls >= 300, `the page model measured the blocks, got ${initial.calls} calls`);
    assert.ok(Number.isFinite(initial.ms) && initial.ms >= 0, 'model wall time is reported');
    assert.ok(
      Number.isFinite(initial.computeMs) && initial.computeMs >= 0,
      'synchronous compute time is reported',
    );

    // A committed edit triggers exactly one debounced model run. Type through
    // it: every keystroke must arrive at the editor.
    const card = h.activeEditor().locator('[data-block-card]').first();
    await card.locator('.nf-block-prose').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' x');
    await page.keyboard.press('Meta+s');
    const typingStarted = Date.now();
    await card.locator('.nf-block-prose').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' responsiveness check');
    const typingMs = Date.now() - typingStarted;
    await h.waitEditorText('responsiveness check');
    await page.waitForFunction(
      () => {
        const layer = document.querySelector('.nf-editor[data-active="true"] .nf-page-markers');
        return (
          layer !== null &&
          layer.getAttribute('data-page-model-updating') === 'false' &&
          Number(layer.getAttribute('data-page-model-runs')) >= 2
        );
      },
      undefined,
      { timeout: 30000 },
    );
    const after = await markerState();
    assert.equal(after.runs, initial.runs + 1, 'one commit produced one model run');
    assert.ok(typingMs < 5000, `typing through a model run stayed responsive (${typingMs} ms)`);
    // Report the numbers in the test log; they are repeated in the task report.
    console.log(
      `M4b1c 300-block page model: ready ${readyMs} ms, run ${initial.ms} ms, compute ${initial.computeMs} ms, ${initial.calls} calls, ${initial.pageCount} pages, ${initial.count} markers; typing ${typingMs} ms; second run ${after.ms} ms / compute ${after.computeMs} ms`,
    );
  });
});
