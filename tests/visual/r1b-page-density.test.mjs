import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { artifactsPath, createHarness, root } from '../support/harness.mjs';

/**
 * R2c page compaction lab (built on the R1b/R2b density harness).
 *
 * The product-owner showcase is read-only input: it is copied into the
 * isolated test library and never modified. The committed `scale-300.json`
 * fixture is the reproducible second corpus. Every variant is measured on the
 * real DOM page surface at 1440x900, not the DOM-free estimator.
 *
 * The lab compares:
 *   - comfortable typography (the pre-R1 reference),
 *   - compact + stacked (the accepted R2a page geometry),
 *   - compact + beside (the R2b candidate),
 *   - compact + compaction (the R2c finite-space packer),
 *   - compact + a wider max card width (whether width alone helps).
 *
 * Page coverage is a union-area ratio, so side-by-side cards are not counted
 * twice. Row fill groups fragments by their page-local top; max columns is the
 * maximum number of fragments intersecting one horizontal scanline. Arrow
 * crossings are a rough straight-line heuristic over the same page content
 * boxes; PageEdges draws cubic curves, so treat it as a signal.
 */

const tempRoot = artifactsPath('r2c-density-tmp');
const outputDir = artifactsPath('r2c');
const supportRoot = resolve(root, 'fixtures');
const showcasePath = '/Users/luca/Documents/NoteForest/note-forest-showcase';

/** The packing this lab must justify for the compact page default. */
const SELECTED_PACKING = 'compaction';

const VARIANTS = [
  {
    id: 'comfortable',
    label: 'Comfortable / stacked (pre-R1)',
    theme: { preset: 'comfortable' },
  },
  {
    id: 'compact-stacked',
    label: 'Compact / stacked (R2a)',
    theme: { preset: 'compact', pagePacking: 'stacked' },
  },
  {
    id: 'compact-beside',
    label: 'Compact / beside (R2b)',
    theme: { preset: 'compact', pagePacking: 'beside' },
  },
  {
    id: 'compact-compaction',
    label: `Compact / compaction (R2c ${SELECTED_PACKING})`,
    theme: { preset: 'compact', pagePacking: 'compaction' },
  },
  {
    id: 'compact-stacked-560',
    label: 'Compact / stacked / 560 px card',
    theme: { preset: 'compact', pagePacking: 'stacked', maxCardWidth: 560 },
  },
  {
    id: 'compact-beside-480',
    label: 'Compact / beside / 480 px card',
    theme: { preset: 'compact', pagePacking: 'beside', maxCardWidth: 480 },
  },
  {
    id: 'compact-beside-560',
    label: 'Compact / beside / 560 px card',
    theme: { preset: 'compact', pagePacking: 'beside', maxCardWidth: 560 },
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
    state: 'attached',
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

/**
 * Read layout, coverage, overlap, and line metrics from the current page.
 *
 * Rectangle geometry is page-content-local: fragments are absolutely placed
 * inside `.nf-page-content`. Union area avoids double counting a card that
 * sits beside another card in the same vertical band.
 */
async function readPageMetrics() {
  return page.evaluate(() => {
    const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
    const sheet = view.querySelector('.nf-page-sheet');
    const content = sheet.querySelector('.nf-page-content');
    const wrap = view.querySelector('.nf-page-sheet-wrap');
    const zoom = Number(wrap?.getAttribute('data-page-zoom') ?? '100') / 100;
    const contentWidth = Number.parseFloat(content.style.width);
    const contentHeight = Number.parseFloat(content.style.height);
    const fragments = [...view.querySelectorAll('.nf-page-fragment')].map((element) => ({
      blockId: element.getAttribute('data-fragment-block') ?? '',
      role: element.getAttribute('data-fragment-role') ?? '',
      x: Number.parseFloat(element.style.left),
      y: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }));
    const callouts = fragments.filter((fragment) => fragment.role === 'callout');
    const minCalloutWidth =
      callouts.length > 0 ? Math.min(...callouts.map((fragment) => fragment.width)) : 0;
    // Compact min content is 160 px + 2 * (8 px padding + 1 px border).
    const narrowCalloutWidth = 160 + 2 * (8 + 1);
    const narrowCallouts = callouts.filter(
      (fragment) => fragment.width + 0.5 < narrowCalloutWidth,
    ).length;
    const maxRightEdge = Math.max(
      0,
      ...fragments.map((fragment) => fragment.x + fragment.width),
    );
    const rightOverflow = fragments.filter(
      (fragment) => fragment.x + fragment.width > contentWidth + 0.6,
    ).length;
    const usedHeight = fragments.reduce((total, fragment) => total + fragment.height, 0);
    const maxBottom = Math.max(
      0,
      ...fragments.map((fragment) => fragment.y + fragment.height),
    );

    const unionArea = (() => {
      const xs = [...new Set(fragments.flatMap((fragment) => [fragment.x, fragment.x + fragment.width]))]
        .sort((a, b) => a - b);
      let area = 0;
      for (let index = 0; index < xs.length - 1; index += 1) {
        const left = xs[index];
        const right = xs[index + 1];
        const width = right - left;
        if (width <= 0) continue;
        const intervals = [];
        for (const fragment of fragments) {
          if (fragment.x >= right || fragment.x + fragment.width <= left) continue;
          intervals.push([fragment.y, fragment.y + fragment.height]);
        }
        intervals.sort((a, b) => a[0] - b[0]);
        let covered = 0;
        let start = null;
        let end = null;
        for (const [intervalStart, intervalEnd] of intervals) {
          if (start === null) {
            start = intervalStart;
            end = intervalEnd;
          } else if (intervalStart <= end + 0.5) {
            end = Math.max(end, intervalEnd);
          } else {
            covered += end - start;
            start = intervalStart;
            end = intervalEnd;
          }
        }
        if (start !== null) covered += end - start;
        area += width * covered;
      }
      return area;
    })();

    let overlapPairs = 0;
    let columnOverlapPx = 0;
    let sideBySidePairs = 0;
    for (let i = 0; i < fragments.length; i += 1) {
      for (let j = i + 1; j < fragments.length; j += 1) {
        const a = fragments[i];
        const b = fragments[j];
        const horizontal =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const vertical =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (horizontal > 0.5 && vertical > 0.5) {
          overlapPairs += 1;
          columnOverlapPx = Math.max(columnOverlapPx, horizontal);
          continue;
        }
        if (vertical > 0.5) {
          const gap =
            a.x + a.width <= b.x + 0.5
              ? b.x - (a.x + a.width)
              : b.x + b.width <= a.x + 0.5
                ? a.x - (b.x + b.width)
                : null;
          if (gap !== null && gap <= 80) sideBySidePairs += 1;
        }
      }
    }

    // Row fill groups fragments by page-local top (0.5 px tolerance). Max
    // columns is the maximum number of fragments intersecting one horizontal
    // scanline, which is the "simultaneous columns" measure.
    const rowBuckets = new Map();
    for (const fragment of fragments) {
      const key = Math.round(fragment.y * 2) / 2;
      rowBuckets.set(key, (rowBuckets.get(key) ?? 0) + 1);
    }
    const rowCounts = [...rowBuckets.values()];
    const rowFill = rowCounts.length > 0 ? fragments.length / rowCounts.length : 0;
    const maxRowColumns = rowCounts.length > 0 ? Math.max(...rowCounts) : 0;
    const yPoints = [
      ...new Set(
        fragments.flatMap((fragment) => [fragment.y, fragment.y + fragment.height]),
      ),
    ].sort((a, b) => a - b);
    let maxColumnsAtScanline = 0;
    for (let index = 0; index + 1 < yPoints.length; index += 1) {
      const sample = (yPoints[index] + yPoints[index + 1]) / 2;
      let columns = 0;
      for (const fragment of fragments) {
        if (fragment.y <= sample && fragment.y + fragment.height >= sample) columns += 1;
      }
      maxColumnsAtScanline = Math.max(maxColumnsAtScanline, columns);
    }

    const point = (value) => {
      const [x, y] = (value ?? '').split(',').map(Number);
      return { x, y };
    };
    const nearRect = (fragment, x, y) =>
      x >= fragment.x - 1.5 &&
      x <= fragment.x + fragment.width + 1.5 &&
      y >= fragment.y - 1.5 &&
      y <= fragment.y + fragment.height + 1.5;
    const edges = [...view.querySelectorAll('[data-page-edge-id]')].map((element) => ({
      branchId: element.getAttribute('data-page-edge-id') ?? '',
      role: element.getAttribute('data-page-edge-role') ?? '',
      direction: element.getAttribute('data-page-edge-direction') ?? '',
      from: point(element.getAttribute('data-page-edge-from')),
      to: point(element.getAttribute('data-page-edge-to')),
    }));
    let crossingEdges = 0;
    let crossingHits = 0;
    for (const edge of edges) {
      if (edge.direction !== 'same-page') continue;
      const sourceIndex = fragments.findIndex((fragment) =>
        nearRect(fragment, edge.from.x, edge.from.y),
      );
      const targetIndex = fragments.findIndex((fragment) =>
        nearRect(fragment, edge.to.x, edge.to.y),
      );
      let hits = 0;
      for (let step = 1; step < 24; step += 1) {
        const t = step / 24;
        const x = edge.from.x + (edge.to.x - edge.from.x) * t;
        const y = edge.from.y + (edge.to.y - edge.from.y) * t;
        for (let index = 0; index < fragments.length; index += 1) {
          if (index === sourceIndex || index === targetIndex) continue;
          const fragment = fragments[index];
          if (
            x > fragment.x + 1 &&
            x < fragment.x + fragment.width - 1 &&
            y > fragment.y + 1 &&
            y < fragment.y + fragment.height - 1
          ) {
            hits += 1;
            break;
          }
        }
      }
      if (hits > 0) {
        crossingEdges += 1;
        crossingHits += hits;
      }
    }

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

    const proseSelector =
      '.nf-block-content .nf-p, .nf-block-content .nf-li-paragraph';
    const prose = measureLines(proseSelector);
    const capped = measureLines(proseSelector, 500);
    const table = measureLines('.nf-block-content .nf-cell-paragraph');

    return {
      pageNumber: Number(view.getAttribute('data-current-page')),
      contentWidth,
      contentHeight,
      usedHeight,
      maxBottom,
      coveredArea: unionArea,
      totalArea: contentWidth * contentHeight,
      overflow: sheet.getAttribute('data-overflow') === '1',
      fragments: fragments.length,
      calloutFragments: callouts.length,
      minCalloutWidth,
      narrowCallouts,
      maxRightEdge,
      rightOverflow,
      sideBySidePairs,
      rowFill,
      rowCount: rowCounts.length,
      maxRowColumns,
      maxColumnsAtScanline,
      overlapPairs,
      columnOverlapPx,
      edgeCount: edges.length,
      crossingEdges,
      crossingHits,
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

async function setThemeAndWait(theme) {
  const runStart = await modelRuns();
  await setTheme(theme);
  await waitForRunAtLeast(runStart + 1);
}

async function readDocumentPages() {
  // Start from page 1 for every pass.
  while ((await currentPage()) > 1) {
    await navigate('prev', (await currentPage()) - 1);
  }
  const totalPages = await pageCount();
  const pages = [];
  for (let index = 1; index <= totalPages; index += 1) {
    if ((await currentPage()) !== index) await navigate('next', index);
    pages.push(await readPageMetrics());
  }
  return { totalPages, pages };
}

async function measureVariant(variant) {
  await setThemeAndWait(variant.theme);
  return {
    variant,
    ...(await readDocumentPages()),
  };
}

async function measureDocument(label) {
  const variants = [];
  for (const variant of VARIANTS) {
    const measured = await measureVariant(variant);
    const pages = measured.pages;
    const blocks = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      return state.runtimes.find((item) => item.packagePath === state.activeTab)?.blocks ?? 0;
    });
    const used = pages.reduce((total, item) => total + item.usedHeight, 0);
    const available = pages.reduce((total, item) => total + item.contentHeight, 0);
    const coveredArea = pages.reduce((total, item) => total + item.coveredArea, 0);
    const totalArea = pages.reduce((total, item) => total + item.totalArea, 0);
    const result = {
      document: label,
      variant: variant.id,
      variantLabel: variant.label,
      pages: measured.totalPages,
      blocks,
      blocksPerPage: measured.totalPages > 0 ? blocks / measured.totalPages : 0,
      contentHeightPx: pages[0]?.contentHeight ?? 0,
      contentWidthPx: pages[0]?.contentWidth ?? 0,
      averageUsedHeightPx: measured.totalPages > 0 ? used / measured.totalPages : 0,
      verticalCoverageRatio: available > 0 ? used / available : 0,
      coveredAreaRatio: totalArea > 0 ? coveredArea / totalArea : 0,
      whitespaceRatio: totalArea > 0 ? 1 - coveredArea / totalArea : 0,
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
      calloutFragments: pages.reduce((total, item) => total + item.calloutFragments, 0),
      minCalloutWidth: (() => {
        const withCallouts = pages.filter((item) => item.calloutFragments > 0);
        return withCallouts.length > 0
          ? Math.min(...withCallouts.map((item) => item.minCalloutWidth))
          : 0;
      })(),
      narrowCallouts: pages.reduce((total, item) => total + item.narrowCallouts, 0),
      maxRightEdge: Math.max(0, ...pages.map((item) => item.maxRightEdge)),
      rightOverflow: pages.reduce((total, item) => total + item.rightOverflow, 0),
      sideBySidePairs: pages.reduce((total, item) => total + item.sideBySidePairs, 0),
      rowCount: pages.reduce((total, item) => total + item.rowCount, 0),
      averageRowFill:
        pages.reduce((total, item) => total + item.fragments, 0) /
        Math.max(1, pages.reduce((total, item) => total + item.rowCount, 0)),
      maxRowColumns: Math.max(0, ...pages.map((item) => item.maxRowColumns)),
      maxColumnsAtScanline: Math.max(0, ...pages.map((item) => item.maxColumnsAtScanline)),
      overlapPairs: pages.reduce((total, item) => total + item.overlapPairs, 0),
      columnOverlapPx: Math.max(0, ...pages.map((item) => item.columnOverlapPx)),
      edges: pages.reduce((total, item) => total + item.edgeCount, 0),
      crossingEdges: pages.reduce((total, item) => total + item.crossingEdges, 0),
      crossingHits: pages.reduce((total, item) => total + item.crossingHits, 0),
      lines: pages.reduce((total, item) => total + item.lines, 0),
    };
    variants.push(result);
    console.log(`DENSITY ${JSON.stringify(result)}`);
  }
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

function byVariant(lab, documentLabel, variantId) {
  return lab.find((entry) => entry.document === documentLabel && entry.variant === variantId);
}

function assertVariantInvariants(entry) {
  assert.equal(entry.overflowPages, 0, `${entry.document}/${entry.variant}: no overflowing page`);
  assert.equal(entry.overlapPairs, 0, `${entry.document}/${entry.variant}: no overlapping fragments`);
  assert.equal(entry.columnOverlapPx, 0, `${entry.document}/${entry.variant}: no column intrusion`);
  assert.equal(entry.rightOverflow, 0, `${entry.document}/${entry.variant}: no fragment beyond the content box`);
}

describe('R2c page compaction lab', () => {
  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
    await h.quit();
  });

  it('compares stacked, beside, compaction, and wider cards on showcase and scale-300', async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });
    const env = isolated('r2c-density');
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

    for (const documentLabel of [...new Set(lab.map((entry) => entry.document))]) {
      const comfortable = byVariant(lab, documentLabel, 'comfortable');
      const stacked = byVariant(lab, documentLabel, 'compact-stacked');
      const beside = byVariant(lab, documentLabel, 'compact-beside');
      const compaction = byVariant(lab, documentLabel, 'compact-compaction');
      assert.ok(
        comfortable !== undefined &&
          stacked !== undefined &&
          beside !== undefined &&
          compaction !== undefined,
      );
      for (const entry of lab.filter((item) => item.document === documentLabel)) {
        assertVariantInvariants(entry);
      }
      assert.ok(
        stacked.pages <= comfortable.pages,
        `${documentLabel}: compact stacked (${stacked.pages}) no more pages than comfortable (${comfortable.pages})`,
      );
      // The selected default must be no worse than both reference geometries.
      assert.ok(
        beside.pages <= stacked.pages,
        `${documentLabel}: beside (${beside.pages}) no more pages than stacked (${stacked.pages})`,
      );
      assert.ok(
        compaction.pages <= beside.pages,
        `${documentLabel}: compaction (${compaction.pages}) no more pages than beside (${beside.pages})`,
      );
      assert.equal(
        compaction.narrowCallouts,
        0,
        `${documentLabel}: compaction keeps callouts above the readable minimum`,
      );
      assert.ok(
        compaction.cappedLineChars <= 75,
        `${documentLabel}: compaction capped prose stays within 75 ch (${compaction.cappedLineChars.toFixed(1)})`,
      );
    }

    // Determinism on the product-owner corpus: re-running the same variant must
    // produce the same page count, fragment count, coverage, and crossings.
    if (showcase !== null) {
      await openPath(showcase);
      await showPageRead();
      const variant = VARIANTS.find((item) => item.id === 'compact-compaction');
      const alternate = VARIANTS.find((item) => item.id === 'compact-stacked');
      const first = await measureVariant(variant);
      // Force a second model run by alternating the packing, then compare the
      // same variant's page geometry.
      await setThemeAndWait(alternate.theme);
      await setThemeAndWait(variant.theme);
      const second = {
        variant,
        ...(await readDocumentPages()),
      };
      const signature = (measured) =>
        JSON.stringify(
          measured.pages.map((entry) => [
            entry.pageNumber,
            entry.fragments,
            Math.round(entry.coveredArea),
            entry.crossingHits,
          ]),
        );
      assert.equal(signature(second), signature(first), 'compaction geometry is deterministic');
      await writeFile(
        join(outputDir, 'determinism.json'),
        `${JSON.stringify({ first: signature(first), second: signature(second) }, null, 2)}\n`,
      );
    }

    // Screenshot the selected packing on the product-owner corpus when
    // present; scale-300 is the committed fallback. Page 1 is the evidence
    // page, not the last page the lab navigated to.
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
    const selected = VARIANTS.find((item) => item.id === 'compact-compaction');
    await setTheme(selected.theme);
    while ((await currentPage()) > 1) {
      await navigate('prev', (await currentPage()) - 1);
    }
    await h.setWindowSize(1440, 900);
    await screenshot('page-compaction-1440x900-landscape.png', 1440, 900);

    const portraitStart = await modelRuns();
    await page.evaluate(() =>
      window.__noteforestTest.setSettings({
        page: {
          setup: {
            size: 'A4',
            orientation: 'portrait',
            margins: { top: 12, right: 12, bottom: 12, left: 12 },
          },
          theme: { preset: 'compact', pagePacking: 'compaction' },
          manualBreakBeforeBlockIds: [],
        },
        continuous: { zoom: 1 },
      }),
    );
    await waitForRunAtLeast(portraitStart + 1);
    await screenshot('page-compaction-1440x900-portrait.png', 1440, 900);

    await h.setWindowSize(960, 720);
    await screenshot('page-compaction-960x720-portrait.png', 960, 720);

    const landscapeStart = await modelRuns();
    await page.evaluate(() =>
      window.__noteforestTest.setSettings({
        page: {
          setup: {
            size: 'A4',
            orientation: 'landscape',
            margins: { top: 12, right: 12, bottom: 12, left: 12 },
          },
          theme: { preset: 'compact', pagePacking: 'compaction' },
          manualBreakBeforeBlockIds: [],
        },
        continuous: { zoom: 1 },
      }),
    );
    await waitForRunAtLeast(landscapeStart + 1);
    await screenshot('page-compaction-960x720-landscape.png', 960, 720);

    // One beside comparison at the primary window size.
    await h.setWindowSize(1440, 900);
    const besideStart = await modelRuns();
    await page.evaluate(() =>
      window.__noteforestTest.setSettings({
        page: {
          setup: {
            size: 'A4',
            orientation: 'landscape',
            margins: { top: 12, right: 12, bottom: 12, left: 12 },
          },
          theme: { preset: 'compact', pagePacking: 'beside' },
          manualBreakBeforeBlockIds: [],
        },
        continuous: { zoom: 1 },
      }),
    );
    await waitForRunAtLeast(besideStart + 1);
    while ((await currentPage()) > 1) {
      await navigate('prev', (await currentPage()) - 1);
    }
    await screenshot('page-beside-1440x900-landscape.png', 1440, 900);

    // One stacked comparison at the primary window size.
    await h.setWindowSize(1440, 900);
    const stackedStart = await modelRuns();
    await page.evaluate(() =>
      window.__noteforestTest.setSettings({
        page: {
          setup: {
            size: 'A4',
            orientation: 'landscape',
            margins: { top: 12, right: 12, bottom: 12, left: 12 },
          },
          theme: { preset: 'compact', pagePacking: 'stacked' },
          manualBreakBeforeBlockIds: [],
        },
        continuous: { zoom: 1 },
      }),
    );
    await waitForRunAtLeast(stackedStart + 1);
    while ((await currentPage()) > 1) {
      await navigate('prev', (await currentPage()) - 1);
    }
    await screenshot('page-stacked-1440x900-landscape.png', 1440, 900);
  });
});
