import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, createHarness } from '../support/harness.mjs';

const tempRoot = artifactsPath('perf-tmp');
const reportDir = artifactsPath('perf');
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

describe('NoteForest M2 performance report', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(reportDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('measures the 300-block editor and the 1,000-block collapse report', async () => {
    await launch(isolated('perf'));
    const started = Date.now();
    await page.evaluate(() => window.__noteforestTest.seed('performance'));
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card]').length >= 300,
      undefined,
      { timeout: 20000 },
    );
    const initialRenderMs = Date.now() - started;
    assert.ok(initialRenderMs < 1500, `initial render ${initialRenderMs} ms`);

    const scope = h.activeEditor();
    await scope.locator('[data-block-card] p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type('x');
    // Deliberate sampling window: the p95 reflow/measure numbers need samples
    // from the typing and structural commands that follow.
    await page.waitForTimeout(1000);
    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press('Meta+.');
      await page.waitForTimeout(250);
    }
    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(500);
    }
    const perf = await page.evaluate(() => window.__noteforestTest.perf());
    const fullRebuildSamples = await page.evaluate(() => window.__noteforestTest.benchmarkReflow(6));
    assert.ok(perf.edge.p95 < 8, `edge routing p95 ${perf.edge.p95} ms`);
    assert.ok(perf.measure.p95 < 8, `measurement p95 ${perf.measure.p95} ms`);
    assert.ok(perf.reflow.p95 < 50, `structural reflow p95 ${perf.reflow.p95} ms`);

    const scroll = await page.evaluate(async () => {
      const scroller = document.querySelector('.nf-editor[data-active="true"] .nf-editor-scroll');
      if (scroller === null) return { fps: 0 };
      const frames = [];
      let last = performance.now();
      let running = true;
      const tick = (now) => {
        frames.push(now - last);
        last = now;
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      for (let index = 0; index < 90; index += 1) {
        scroller.scrollTop += 48;
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
      running = false;
      const average = frames.reduce((total, value) => total + value, 0) / Math.max(1, frames.length);
      return { fps: Math.round(1000 / average), averageFrameMs: average };
    });

    await h.quit();
    await launch(isolated('perf'));
    const thousandStarted = Date.now();
    await page.evaluate(() => window.__noteforestTest.seed('performance-1000'));
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card]').length >= 1000,
      undefined,
      { timeout: 30000 },
    );
    const thousandRenderMs = Date.now() - thousandStarted;
    const thousandScope = h.activeEditor();
    await thousandScope.locator('[data-block-card] p').first().click();
    await page.keyboard.press('Meta+.');
    await page.waitForFunction(
      () =>
        [
          ...document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card]'),
        ].filter((card) => card.getClientRects().length > 0).length < 1000,
      undefined,
      { timeout: 10000 },
    );
    const thousandCards = await thousandScope.locator('[data-block-card]:visible').count();
    const thousandPerf = await page.evaluate(() => window.__noteforestTest.perf());
    const thousandFullRebuildSamples = await page.evaluate(() =>
      window.__noteforestTest.benchmarkReflow(4),
    );

    const report = {
      measuredAt: new Date().toISOString(),
      initialRenderMs,
      thousandRenderMs,
      thousandVisibleCardsAfterCollapse: thousandCards,
      thousandPerf,
      fullRebuildSamples,
      thousandFullRebuildSamples,
      perf,
      scroll,
    };
    await writeFile(resolve(reportDir, 'performance.json'), `${JSON.stringify(report, null, 2)}\n`);
    await h.quit();
  });
});
