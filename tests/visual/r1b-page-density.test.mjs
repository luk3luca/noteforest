import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { artifactsPath, createHarness, root } from '../support/harness.mjs';

/**
 * R1b density lab.
 *
 * The product owner showcase is read-only input: it is copied into the
 * isolated test library and never modified. The committed `scale-300.json`
 * fixture is the reproducible second corpus. The lab measures the real DOM page
 * surface, not the DOM-free estimator, so typography and card chrome changes
 * affect the result exactly as they affect the product.
 */

const tempRoot = artifactsPath('r1b-density-tmp');
const outputDir = artifactsPath('r1b');
const supportRoot = resolve(root, 'fixtures');
const showcasePath = '/Users/luca/Documents/NoteForest/note-forest-showcase';

const VARIANTS = [
  {
    id: 'comfortable',
    label: 'Comfortable (pre-R1)',
    theme: { preset: 'comfortable' },
  },
  {
    id: 'intermediate',
    label: 'Intermediate 9.5 pt / 400 px',
    theme: {
      preset: 'compact',
      bodyPt: 9.5,
      bodyLine: 1.35,
      cardPadding: 9,
      segmentGap: 6,
      siblingGap: 20,
      wrapIndent: 14,
      maxWrapIndent: 44,
      calloutGap: 16,
      maxCardWidth: 400,
    },
  },
  {
    id: 'compact',
    label: 'Compact (default)',
    theme: { preset: 'compact' },
  },
];

const h = createHarness({ tempRoot });
let page;

function isolated(name) {
  return {
    NOTEFOREST_LIBRARY: resolve(tempRoot, `${name}-library`),
    NOTEFOREST_APP_SUPPORT: resolve(tempRoot, `${name}-support`),
  };
}

function activePageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

async function launch(env) {
  await h.launch({ NOTEFOREST_E2E_HIDDEN: '0', ...env });
  page = h.page;
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
    { timeout: 60000 },
  );
}

async function showPageRead() {
  await page.keyboard.press('Meta+3');
  await activePageView().waitFor({ timeout: 10000 });
  await waitPageReady();
}

async function openPath(packagePath) {
  const opened = await page.evaluate(
    (path) => window.__noteforestTest.openPath(path),
    packagePath,
  );
  assert.equal(opened, true, `package opens: ${packagePath}`);
  await page.waitForFunction(
    (path) => window.__noteforestTest.state().activeTab === path,
    packagePath,
    { timeout: 20000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]', {
    timeout: 20000,
  });
}

async function setTheme(theme) {
  await page.evaluate(
    (value) =>
      window.__noteforestTest.setSettings({
        page: {
          setup: {
            size: 'A4',
            orientation: 'landscape',
            margins: { top: 12, right: 12, bottom: 12, left: 12 },
          },
          theme: value,
          manualBreakBeforeBlockIds: [],
        },
        continuous: { zoom: 1 },
      }),
    theme,
  );
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
    { timeout: 60000 },
  );
}

async function modelRuns() {
  return Number(await activePageView().getAttribute('data-model-runs'));
}

async function waitForRunAtLeast(expected) {
  await page.waitForFunction(
    (runs) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return (
        view !== null &&
        Number(view.getAttribute('data-model-runs')) >= runs &&
        view.getAttribute('data-ready') === 'true' &&
        view.getAttribute('data-updating') === 'false'
      );
    },
    expected,
    { timeout: 60000 },
  );
}

async function currentPage() {
  return Number(await activePageView().getAttribute('data-current-page'));
}

async function pageCount() {
  return Number(await activePageView().getAttribute('data-page-count'));
}

async function navigate(direction, expected) {
  await page.evaluate((dir) => {
    document
      .querySelector(`.nf-editor[data-active="true"] [data-page-nav="${dir}"]`)
      ?.click();
  }, direction);
  await page.waitForFunction(
    (value) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return Number(view?.getAttribute('data-current-page')) === value;
    },
    expected,
    { timeout: 10000 },
  );
}

/** Read layout + rendered line metrics from the current derived page. */
async function readPageMetrics() {
  return page.evaluate(() => {
    const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
    const sheet = view.querySelector('.nf-page-sheet');
    const content = sheet.querySelector('.nf-page-content');
    const wrap = view.querySelector('.nf-page-sheet-wrap');
    const zoom = Number(wrap?.getAttribute('data-page-zoom') ?? '100') / 100;
    const contentHeight = Number.parseFloat(content.style.height);
    const fragments = [...view.querySelectorAll('.nf-page-fragment')];
    const usedHeight = fragments.reduce(
      (total, element) => total + Number.parseFloat(element.style.height),
      0,
    );
    const maxBottom = Math.max(
      0,
      ...fragments.map(
        (element) =>
          Number.parseFloat(element.style.top) + Number.parseFloat(element.style.height),
      ),
    );

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const measureLines = (selector, cappedMaxWidth = null) => {
      let maxPx = 0;
      let maxChars = 0;
      let count = 0;
      let widest = '';
      for (const paragraph of view.querySelectorAll(selector)) {
        const card = paragraph.closest('.nf-page-card');
        const cardWidth = card ? card.getBoundingClientRect().width / zoom : 0;
        if (cappedMaxWidth !== null && cardWidth > cappedMaxWidth) continue;
        const style = getComputedStyle(paragraph);
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const averageChar =
          context.measureText('abcdefghijklmnopqrstuvwxyz ').width / 27;
        const byLine = new Map();
        const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node !== null) {
          if ((node.textContent ?? '').trim().length > 0) {
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              if (rect.width <= 0) continue;
              const key = Math.round(rect.top / 2) * 2;
              const current = byLine.get(key) ?? { left: rect.left, right: rect.right };
              current.left = Math.min(current.left, rect.left);
              current.right = Math.max(current.right, rect.right);
              byLine.set(key, current);
            }
          }
          node = walker.nextNode();
        }
        for (const line of byLine.values()) {
          const width = (line.right - line.left) / zoom;
          if (width <= 0) continue;
          count += 1;
          if (width > maxPx) {
            maxPx = width;
            widest = `${paragraph.className}: ${(paragraph.textContent ?? '').slice(0, 80)}`;
          }
          if (averageChar > 0) maxChars = Math.max(maxChars, width / averageChar);
        }
      }
      return { maxPx, maxChars, count, widest };
    };

    // Prose line length is the readability signal; table cells can legitimately
    // span the full content width, so they are reported separately.
    const proseSelector =
      '.nf-block-content .nf-p, .nf-block-content .nf-li-paragraph';
    const prose = measureLines(proseSelector);
    // Cards wider than the text measure are unbreakable content (an image or
    // wide table forces the block wide). Report their lines separately so the
    // readability decision is not masked by a single image-bearing block.
    const capped = measureLines(proseSelector, 440);
    const table = measureLines('.nf-block-content .nf-cell-paragraph');

    return {
      pageNumber: Number(view.getAttribute('data-current-page')),
      contentHeight,
      usedHeight,
      maxBottom,
      overflow: sheet.getAttribute('data-overflow') === '1',
      fragments: fragments.length,
      lines: prose.count + table.count,
      maxLinePx: prose.maxPx,
      maxLineChars: prose.maxChars,
      cappedLinePx: capped.maxPx,
      cappedLineChars: capped.maxChars,
      tableLinePx: table.maxPx,
      tableLineChars: table.maxChars,
      proseWidest: prose.widest,
      defectCount: Number(view.getAttribute('data-defect-count') ?? '0'),
    };
  });
}

async function measureDocument(label) {
  const variants = [];
  for (const variant of VARIANTS) {
    const runStart = await modelRuns();
    await setTheme(variant.theme);
    await waitForRunAtLeast(runStart + 1);
    // Start from page 1 for every variant.
    while ((await currentPage()) > 1) {
      await navigate('prev', (await currentPage()) - 1);
    }
    const totalPages = await pageCount();
    const pages = [];
    for (let index = 1; index <= totalPages; index += 1) {
      if ((await currentPage()) !== index) await navigate('next', index);
      pages.push(await readPageMetrics());
    }
    const blocks = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      return state.runtimes.find((item) => item.packagePath === state.activeTab)?.blocks ?? 0;
    });
    const used = pages.reduce((total, item) => total + item.usedHeight, 0);
    const available = pages.reduce((total, item) => total + item.contentHeight, 0);
    const result = {
      document: label,
      variant: variant.id,
      variantLabel: variant.label,
      pages: totalPages,
      blocks,
      blocksPerPage: totalPages > 0 ? blocks / totalPages : 0,
      contentHeightPx: pages[0]?.contentHeight ?? 0,
      averageUsedHeightPx: totalPages > 0 ? used / totalPages : 0,
      whitespaceRatio: available > 0 ? 1 - used / available : 0,
      maxLinePx: Math.max(0, ...pages.map((item) => item.maxLinePx)),
      maxLineChars: Math.max(0, ...pages.map((item) => item.maxLineChars)),
      cappedLinePx: Math.max(0, ...pages.map((item) => item.cappedLinePx)),
      cappedLineChars: Math.max(0, ...pages.map((item) => item.cappedLineChars)),
      tableLinePx: Math.max(0, ...pages.map((item) => item.tableLinePx)),
      tableLineChars: Math.max(0, ...pages.map((item) => item.tableLineChars)),
      proseWidest: pages.reduce(
        (best, item) => (item.maxLinePx > (best?.maxLinePx ?? 0) ? item : best),
        null,
      )?.proseWidest,
      overflowPages: pages.filter((item) => item.overflow).length,
      defects: Math.max(0, ...pages.map((item) => item.defectCount)),
      fragments: pages.reduce((total, item) => total + item.fragments, 0),
      lines: pages.reduce((total, item) => total + item.lines, 0),
    };
    variants.push(result);
    console.log(
      `DENSITY ${JSON.stringify(result)}`,
    );
  }
  assert.ok(
    variants.every((variant) => variant.pages > 0),
    `${label} has at least one derived page in every variant`,
  );
  const comfortable = variants.find((variant) => variant.variant === 'comfortable');
  const compact = variants.find((variant) => variant.variant === 'compact');
  assert.ok(comfortable !== undefined && compact !== undefined);
  assert.ok(
    compact.pages <= comfortable.pages,
    `${label}: compact (${compact.pages}) no more pages than comfortable (${comfortable.pages})`,
  );
  assert.equal(compact.overflowPages, 0, `${label}: compact has no overflowing page`);
  assert.ok(
    compact.defects <= comfortable.defects,
    `${label}: compact introduces no page defects`,
  );
  return variants;
}

async function copyShowcase(env) {
  if (!existsSync(join(showcasePath, 'document.json'))) return null;
  const target = join(env.NOTEFOREST_LIBRARY, 'showcase');
  await cp(showcasePath, target, { recursive: true });
  return target;
}

async function copyScale300(env) {
  const packagePath = join(env.NOTEFOREST_LIBRARY, 'scale-300');
  await mkdir(join(packagePath, 'assets'), { recursive: true });
  await writeFile(
    join(packagePath, 'document.json'),
    await readFile(join(supportRoot, 'scale-300.json')),
  );
  await cp(join(supportRoot, 'assets'), join(packagePath, 'assets'), {
    recursive: true,
  });
  return packagePath;
}

async function screenshot(name, width, height) {
  await page.waitForTimeout(150);
  await h.screenshot(join(outputDir, name), { width, height });
}

describe('R1b page density lab and compact screenshots', () => {
  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
    await h.quit();
  });

  it('measures showcase and scale-300 density per variant', async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });
    const env = isolated('r1b-density');
    await mkdir(env.NOTEFOREST_LIBRARY, { recursive: true });
    await launch(env);
    await h.setWindowSize(1440, 900);

    const lab = [];
    const showcase = await copyShowcase(env);
    if (showcase !== null) {
      await openPath(showcase);
      await showPageRead();
      lab.push(...(await measureDocument('showcase')));
    } else {
      console.log('DENSITY showcase skipped: /Users/luca/Documents showcase not present');
    }

    const scale = await copyScale300(env);
    await openPath(scale);
    await showPageRead();
    lab.push(...(await measureDocument('scale-300')));

    await writeFile(
      join(outputDir, 'density.json'),
      `${JSON.stringify(lab, null, 2)}\n`,
    );

    // Screenshot the compact Page Read page at both window sizes and both
    // orientations. The showcase is the product-owner corpus when present;
    // scale-300 is the committed fallback.
    const screenshotPackage = showcase ?? scale;
    await page.evaluate(
      (path) => window.__noteforestTest.openPath(path),
      screenshotPackage,
    );
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      screenshotPackage,
      { timeout: 20000 },
    );
    await showPageRead();
    const compact = VARIANTS.find((variant) => variant.id === 'compact');
    await setTheme(compact.theme);
    // Evidence starts at page 1, not the last page the lab navigated to.
    while ((await currentPage()) > 1) {
      await navigate('prev', (await currentPage()) - 1);
    }
    await h.setWindowSize(1440, 900);
    await screenshot('page-compact-1440x900-landscape.png', 1440, 900);

    await setTheme({ preset: 'compact' });
    const portraitStart = await modelRuns();
    await page.evaluate(() =>
      window.__noteforestTest.setSettings({
        page: {
          setup: {
            size: 'A4',
            orientation: 'portrait',
            margins: { top: 12, right: 12, bottom: 12, left: 12 },
          },
          theme: { preset: 'compact' },
          manualBreakBeforeBlockIds: [],
        },
        continuous: { zoom: 1 },
      }),
    );
    await waitForRunAtLeast(portraitStart + 1);
    await screenshot('page-compact-1440x900-portrait.png', 1440, 900);

    await h.setWindowSize(960, 720);
    await screenshot('page-compact-960x720-portrait.png', 960, 720);

    const landscapeStart = await modelRuns();
    await page.evaluate(() =>
      window.__noteforestTest.setSettings({
        page: {
          setup: {
            size: 'A4',
            orientation: 'landscape',
            margins: { top: 12, right: 12, bottom: 12, left: 12 },
          },
          theme: { preset: 'compact' },
          manualBreakBeforeBlockIds: [],
        },
        continuous: { zoom: 1 },
      }),
    );
    await waitForRunAtLeast(landscapeStart + 1);
    await screenshot('page-compact-960x720-landscape.png', 960, 720);
  });
});
