import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath, waitUntil } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageArrowsDocument, pageCalloutModesDocument, pageDocument, textBlock, imageBlock, writePagePackage } from '../support/page-fixtures.mjs';
import { inspectPdfFile, textContains } from '../../scripts/lib/pdf.mjs';

/**
 * M4c1 print compositor parity.
 *
 * Page Read is the reference surface. The test bridge builds the PrintModel
 * from the mounted Page model (the same real layout/paginate run) and mounts
 * the print-only compositor offscreen. Every page's sheets, content box,
 * fragment boxes/cards, edge/trunk SVG, labels, and chrome must match Page
 * Read; one fixed page container per derived page, direct children of the
 * print root.
 */

const tempRoot = artifactsPath('m4c1-ui');
const outputDir = artifactsPath('m4c1', 'ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const A5_PORTRAIT = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
const A5_PORTRAIT_STACKED = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 46, right: 46, bottom: 46, left: 46 },
};

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
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
  await ui.ensureInteractionMode('read');
}

async function currentPage() {
  return Number(await activePageView().getAttribute('data-current-page'));
}

/** Scroll to one page start through the jump surface. */
async function gotoPage(number) {
  await ui.gotoPage(number);
  await ui.waitCurrentPage(number);
}

async function setPageSettingsOverride(packagePath, override) {
  const runsBefore = Number(await activePageView().getAttribute('data-model-runs'));
  await page.evaluate(
    ({ path, value }) => window.__noteforestTest.setPageSettingsOverride(path, value),
    { path: packagePath, value: override },
  );
  await page.waitForFunction(
    (runs) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return (
        view !== null &&
        Number(view.getAttribute('data-model-runs')) > runs &&
        view.getAttribute('data-ready') === 'true' &&
        view.getAttribute('data-updating') === 'false'
      );
    },
    runsBefore,
    { timeout: 30000 },
  );
  await waitPageReady();
}

/**
 * Attributes that must be identical between Page Read and print. Viewport-only
 * view state is not print content: `data-page-current` names the page under the
 * centre of the canvas and the current page is read from the sheet selector.
 */
const VIEW_ONLY_ATTRIBUTES = new Set(['data-page-current']);

function pickAttributes(attributes, prefixes) {
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(
        ([name]) =>
          !VIEW_ONLY_ATTRIBUTES.has(name) &&
          prefixes.some((prefix) => name.startsWith(prefix)),
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

/** One page's observable Page Read attributes, relative to its sheet. */
async function snapshotSheet(sheet) {
  const styleBox = async (selector) => {
    const element = sheet.locator(selector).first();
    if ((await element.count()) === 0) return null;
    return element.evaluate((node) => ({
      style: Object.fromEntries(
        ['left', 'right', 'top', 'bottom'].map((key) => [key, node.style[key]]),
      ),
      text: node.textContent ?? '',
    }));
  };
  const edgeLabels = sheet.locator('[data-page-edge-labels]');
  return {
    sheet: pickAttributes(
      await sheet.evaluate((node) =>
        Object.fromEntries(
          [...node.attributes].map((attribute) => [attribute.name, attribute.value]),
        ),
      ),
      ['data-page-', 'data-margin-'],
    ),
    content: await sheet.locator('[data-page-content]').evaluate((node) => ({
      style: Object.fromEntries(
        ['left', 'top', 'width', 'height'].map((key) => [key, node.style[key]]),
      ),
      attributes: Object.fromEntries(
        [...node.attributes].map((attribute) => [attribute.name, attribute.value]),
      ),
    })).then((value) => ({
      style: value.style,
      attributes: pickAttributes(value.attributes, ['data-page-']),
    })),
    header: await styleBox('.nf-page-header'),
    footer: await styleBox('.nf-page-footer'),
    ghost: await styleBox('.nf-page-ghost-list'),
    continues: await styleBox('.nf-page-continues-list'),
    fragments: await sheet.locator('.nf-page-fragment').evaluateAll((nodes) =>
      nodes.map((node) => ({
        attributes: Object.fromEntries(
          [...node.attributes].map((attribute) => [attribute.name, attribute.value]),
        ),
        style: Object.fromEntries(
          ['left', 'top', 'width', 'height'].map((key) => [key, node.style[key]]),
        ),
        card: node.querySelector('.nf-page-fragment-card')?.innerHTML ?? null,
        defect: node.querySelector('[data-page-defect]')?.textContent ?? null,
        anchor: node.querySelector('[data-page-anchor-warning]')?.textContent ?? null,
      })),
    ).then((values) =>
      values.map((value) => ({
        attributes: pickAttributes(value.attributes, ['data-fragment-']),
        style: value.style,
        card: value.card,
        defect: value.defect,
        anchor: value.anchor,
      })),
    ),
    edgeSvg: await sheet.locator('[data-page-edges]').evaluate((node) => {
      const groups = (selector) =>
        [...node.querySelectorAll(selector)].map((group) => ({
          attributes: Object.fromEntries(
            [...group.attributes].map((attribute) => [attribute.name, attribute.value]),
          ),
          paths: [...group.querySelectorAll('path')].map((path) => ({
            attributes: Object.fromEntries(
              [...path.attributes].map((attribute) => [attribute.name, attribute.value]),
            ),
          })),
          title: group.querySelector('title')?.textContent ?? null,
        }));
      return {
        viewBox: node.getAttribute('viewBox'),
        edgeCount: node.getAttribute('data-page-edge-count'),
        trunkCount: node.getAttribute('data-page-trunk-count'),
        trunks: groups('[data-page-trunk-id]'),
        edges: groups('[data-page-edge-id]'),
      };
    }),
    edgeLabels:
      (await edgeLabels.count()) === 0
        ? null
        : await edgeLabels.evaluate((node) =>
            [...node.querySelectorAll('[data-page-edge-label]')].map((label) => ({
              attributes: Object.fromEntries(
                [...label.attributes].map((attribute) => [attribute.name, attribute.value]),
              ),
              style: Object.fromEntries(
                ['left', 'right', 'top', 'maxWidth', 'transform'].map((key) => [
                  key,
                  label.style[key],
                ]),
              ),
              text: label.textContent ?? '',
            })),
          ),
  };
}

/**
 * Print parity compares the anchor marker separately (B1): paper carries no dot,
 * no flag and no marker text, while Page Read keeps them. Everything else — the
 * fragment box, the card HTML, the foot/role/depth attributes — must still be
 * identical, so this strips only the one flag before the deep comparison.
 */
function withoutAnchor(fragment) {
  const { anchor, attributes, ...rest } = fragment;
  const kept = { ...attributes };
  delete kept['data-fragment-anchor-warning'];
  return { ...rest, attributes: kept };
}

async function readSnapshots(pageCount) {
  const view = activePageView();
  const snapshots = [];
  for (let number = 1; number <= pageCount; number += 1) {
    await gotoPage(number);
    // Page mounts the visible window ±2: read the named page, never "the first
    // mounted sheet".
    snapshots.push(await snapshotSheet(ui.pageSheet(number)));
  }
  await gotoPage(1);
  return snapshots;
}

async function renderPrint() {
  const result = await page.evaluate(() => window.__noteforestTest.renderPrint());
  assert.equal(result.ok, true, result.message ?? 'print model builds');
  await page.waitForSelector('[data-print-test-host] [data-print-page="1"]', { timeout: 20000 });
  return result;
}

/**
 * Computed metric probe for the print-skin parity check (M4c2 R6). Inline
 * attributes alone would not catch a `font-size`/line-height/padding drift in
 * `print.css`; these are the resolved values Chromium prints with.
 */
const METRIC_PROPERTIES = [
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginBottom',
];

async function computedMetrics(scopeSelector, sheetSelector) {
  return page.evaluate(
    ({ scope, sheet, properties }) => {
      const rootElement = document.querySelector(scope);
      const sheetElement = rootElement?.querySelector(sheet);
      if (rootElement === null || rootElement === undefined || sheetElement === null || sheetElement === undefined) {
        return null;
      }
      const collect = (selector) => {
        const element = sheetElement.querySelector(selector);
        if (element === null) return { selector, present: false };
        const style = getComputedStyle(element);
        return {
          selector,
          present: true,
          values: Object.fromEntries(properties.map((property) => [property, style[property]])),
        };
      };
      return [
        '.nf-page-card',
        '.nf-label',
        '.nf-page-header',
        '.nf-page-footer',
        '.nf-page-edge-label',
      ].map(collect);
    },
    { scope: scopeSelector, sheet: sheetSelector, properties: METRIC_PROPERTIES },
  );
}

async function printSnapshots(pageCount) {
  const host = page.locator('[data-print-test-host]');
  const snapshots = [];
  for (let number = 1; number <= pageCount; number += 1) {
    snapshots.push(await snapshotSheet(host.locator(`[data-print-page="${number}"]`)));
  }
  return snapshots;
}

async function assertPrintParity(pageCount, label, printScreenshotPath = null) {
  const read = await readSnapshots(pageCount);
  const result = await renderPrint();
  assert.equal(result.pageCount, pageCount, `${label}: print page count equals Page Read`);
  assert.equal(result.fingerprint, result.settingsFingerprint, `${label}: resolved fingerprint`);
  assert.equal(
    await page.locator('[data-print-test-host] [data-print-root]').getAttribute('data-print-fingerprint'),
    result.fingerprint,
    `${label}: print root carries the resolved fingerprint`,
  );

  // One fixed page container per derived page, direct children of the root.
  const structure = await page.locator('[data-print-test-host] [data-print-root]').evaluate((root) => ({
    sheets: [...root.querySelectorAll('.nf-print-sheet')].length,
    directSheets: [...root.children].filter((child) => child.classList.contains('nf-print-sheet')).length,
    childTags: [...root.children].map((child) => child.tagName.toLowerCase()),
  }));
  assert.equal(structure.sheets, pageCount, `${label}: one sheet per derived page`);
  assert.equal(structure.directSheets, pageCount, `${label}: sheets are direct children of the root`);
  assert.equal(
    structure.childTags.filter((tag) => tag === 'section').length,
    pageCount,
    `${label}: no wrapper between root and sheets`,
  );

  const print = await printSnapshots(pageCount);
  for (let index = 0; index < pageCount; index += 1) {
    const expected = read[index];
    const actual = print[index];
    assert.deepEqual(actual.sheet, expected.sheet, `${label}: page ${index + 1} sheet attributes`);
    assert.deepEqual(actual.content, expected.content, `${label}: page ${index + 1} content box`);
    // Page equals print on everything except the anchor marker (B1).
    assert.deepEqual(
      actual.fragments.map(withoutAnchor),
      expected.fragments.map(withoutAnchor),
      `${label}: page ${index + 1} fragments/cards`,
    );
    for (const fragment of actual.fragments) {
      assert.equal(fragment.anchor, null, `${label}: print carries no anchor dot`);
      assert.equal(
        fragment.attributes['data-fragment-anchor-warning'],
        undefined,
        `${label}: print carries no anchor flag`,
      );
    }
    assert.deepEqual(actual.edgeSvg, expected.edgeSvg, `${label}: page ${index + 1} edges/trunks`);
    assert.deepEqual(actual.edgeLabels, expected.edgeLabels, `${label}: page ${index + 1} edge labels`);
    assert.deepEqual(actual.header, expected.header, `${label}: page ${index + 1} header`);
    assert.deepEqual(actual.footer, expected.footer, `${label}: page ${index + 1} footer`);
    assert.deepEqual(actual.ghost, expected.ghost, `${label}: page ${index + 1} ghost`);
    assert.deepEqual(actual.continues, expected.continues, `${label}: page ${index + 1} continues`);
  }
  if (printScreenshotPath !== null) {
    // The test host is offscreen for DOM parity; bring it onscreen only for
    // the visual artifact. The element screenshot captures the print root,
    // not the app shell around it.
    const host = page.locator('[data-print-test-host]');
    await host.evaluate((element) => {
      element.style.position = 'fixed';
      element.style.left = '0';
      element.style.top = '0';
      element.style.zIndex = '9999';
      element.style.background = '#e5e7eb';
      element.style.padding = '24px';
      element.style.width = '100vw';
      element.style.height = '100vh';
      element.style.overflow = 'auto';
    });
    await host.locator('[data-print-root]').screenshot({ path: printScreenshotPath });
  }
  await page.evaluate(() => window.__noteforestTest.clearPrint());
  await page.waitForSelector('[data-print-test-host]', { state: 'detached', timeout: 5000 });
  return { read, print, result };
}

describe('M4c1 print compositor parity', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });
    await mkdir(artifactsPath('b1-defects'), { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('mode A: the print surface reproduces the Page Read sheet, cards, edges, and chrome', async () => {
    const env = ui.isolated('m4c1-a');
    await launch('m4c1-a');
    await openPackage(env, 'Print compositor A', pageCalloutModesDocument());
    await showPageRead();
    const pageCount = Number(await activePageView().getAttribute('data-page-count'));
    const { read } = await assertPrintParity(
      pageCount,
      'mode A',
      artifactsPath('m4c1', 'ui', 'print-compositor-a-print-1440x900.png'),
    );
    // One shared right trunk is present on the print page too.
    const printTrunks = read[0].edgeSvg.trunks.map((trunk) => trunk.attributes['data-page-trunk-id']);
    assert.ok(printTrunks.includes('cm-root:right'), 'print model carries the shared right trunk');
    await h.screenshot(artifactsPath('m4c1', 'ui', 'print-compositor-a-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('mode B2: the print surface carries both below trunks and the same page geometry', async () => {
    const env = ui.isolated('m4c1-b2');
    await launch('m4c1-b2');
    const packagePath = await openPackage(env, 'Print compositor B2', pageCalloutModesDocument());
    await showPageRead();
    await setPageSettingsOverride(packagePath, { setup: A5_PORTRAIT });
    const pageCount = Number(await activePageView().getAttribute('data-page-count'));
    const { read, result } = await assertPrintParity(pageCount, 'mode B2');
    assert.equal(result.pageWidthMm, 148);
    assert.equal(result.pageHeightMm, 210);
    const trunkIds = read[0].edgeSvg.trunks.map((trunk) => trunk.attributes['data-page-trunk-id']);
    assert.ok(trunkIds.includes('cm-root:below:callout'), 'print model carries the callout trunk');
    assert.ok(trunkIds.includes('cm-root:below:child'), 'print model carries the child trunk');
  });

  it('stacked: the legacy geometry prints with the same shared trunk', async () => {
    const env = ui.isolated('m4c1-stacked');
    await launch('m4c1-stacked');
    const packagePath = await openPackage(
      env,
      'Print compositor stacked',
      pageCalloutModesDocument(),
    );
    await showPageRead();
    await setPageSettingsOverride(packagePath, { setup: A5_PORTRAIT_STACKED });
    const pageCount = Number(await activePageView().getAttribute('data-page-count'));
    const { read, result } = await assertPrintParity(pageCount, 'stacked');
    assert.equal(result.pageWidthMm, 148);
    assert.equal(result.pageHeightMm, 210);
    const trunkIds = read[0].edgeSvg.trunks.map((trunk) => trunk.attributes['data-page-trunk-id']);
    assert.ok(trunkIds.includes('cm-root:below'), 'print model carries the shared below trunk');
  });

  it('print skin keeps the Page Read computed metrics (M4c2 R6)', async () => {
    const env = ui.isolated('m4c1-metrics');
    await launch('m4c1-metrics');
    const packagePath = await openPackage(
      env,
      'Print compositor metrics',
      pageArrowsDocument(),
    );
    await showPageRead();
    // Two pages with a cross-page reference: the last page carries a `← p.1`
    // label, so the edge-label metrics are compared too.
    await setPageSettingsOverride(packagePath, {
      setup: {
        size: 'A5',
        orientation: 'portrait',
        margins: { top: 30, right: 30, bottom: 30, left: 30 },
      },
      manualBreakBeforeBlockIds: ['callout', 'ref'],
    });
    await waitPageReady();
    const pageCount = Number(await activePageView().getAttribute('data-page-count'));
    assert.ok(pageCount >= 2, 'the manual breaks derive a continuation page');
    await gotoPage(pageCount);
    const read = await computedMetrics('.nf-page-view', '.nf-page-sheet[data-page-current="true"]');
    assert.ok(read !== null, 'Page Read metrics are readable');
    assert.equal(read.find((item) => item.selector === '.nf-page-card')?.present, true);
    assert.equal(
      read.find((item) => item.selector === '.nf-page-edge-label')?.present,
      true,
      'Page Read shows the cross-page label',
    );
    await renderPrint();
    const print = await computedMetrics(
      '[data-print-test-host]',
      `.nf-print-sheet[data-print-page="${pageCount}"]`,
    );
    assert.ok(print !== null, 'print metrics are readable');
    // A metric declaration in print.css would fail this: font size, line
    // height, padding, and margins must come from the Page styles.
    assert.deepEqual(print, read, 'print skin metrics equal Page Read');
    await page.evaluate(() => window.__noteforestTest.clearPrint());
    await page.waitForSelector('[data-print-test-host]', { state: 'detached', timeout: 5000 });
  });

  it('Letter landscape: page size, content box, and page count match Page Read', async () => {
    const env = ui.isolated('m4c1-letter');
    await launch('m4c1-letter');
    const packagePath = await openPackage(
      env,
      'Print compositor Letter',
      pageCalloutModesDocument(),
    );
    await showPageRead();
    await setPageSettingsOverride(packagePath, {
      setup: {
        size: 'Letter',
        orientation: 'landscape',
        margins: { top: 12, right: 12, bottom: 12, left: 12 },
      },
    });
    const pageCount = Number(await activePageView().getAttribute('data-page-count'));
    const { print, result } = await assertPrintParity(pageCount, 'Letter landscape');
    assert.equal(result.pageWidthMm, 279.4);
    assert.equal(result.pageHeightMm, 215.9);
    const width = Number(print[0].sheet['data-page-width-px']);
    const height = Number(print[0].sheet['data-page-height-px']);
    assert.ok(Math.abs(width - (279.4 * 96) / 25.4) < 0.05, 'Letter width px');
    assert.ok(Math.abs(height - (215.9 * 96) / 25.4) < 0.05, 'Letter height px');
  });

  it('prints the page without the anchor dot, Page Read keeps it', async () => {
    const env = ui.isolated('m4c1-markers');
    await launch('m4c1-markers');
    const document = pageDocument({
      id: 'print-markers',
      title: 'Print markers',
      chapterTitle: 'Diagnostics',
      blocks: [
        textBlock('intro', 'Intro', 'Parent text that does not contain the stale quote.'),
        imageBlock('missing-image', 'Lost figure', 'missing-asset-id', 'Lost diagram'),
        // The marker word is nowhere in the note text, so "no marker text" is
        // a real assertion rather than a coincidence of the fixture.
        textBlock('child', 'Broken callout', 'The branch survives the stale quote.'),
      ],
      anchors: [
        {
          id: 'broken-anchor',
          blockId: 'intro',
          kind: 'text',
          selector: { kind: 'text', quote: 'not present' },
          quote: 'not present',
        },
      ],
      branches: [
        {
          id: 'branch-broken',
          sourceBlockId: 'intro',
          sourceAnchorId: 'broken-anchor',
          targetBlockId: 'child',
          role: 'primary',
        },
      ],
    });
    const packagePath = await openPackage(env, 'Print compositor markers', document);
    await showPageRead();
    const pageCount = Number(await activePageView().getAttribute('data-page-count'));

    // Page Read: one dot for the warned block, 6 px inside a ≥ 24 px hit area.
    const view = activePageView();
    const dots = view.locator('[data-page-anchor-warning]');
    assert.equal(await dots.count(), 1, 'Page Read renders one dot for the warned block');
    const dot = dots.first();
    const dotBox = await dot.evaluate((element) => ({
      tag: element.tagName,
      position: getComputedStyle(element).position,
      hitWidth: element.offsetWidth,
      hitHeight: element.offsetHeight,
      shapeWidth: element.firstElementChild?.offsetWidth ?? 0,
      shapeHeight: element.firstElementChild?.offsetHeight ?? 0,
      label: element.getAttribute('aria-label'),
      title: element.getAttribute('title'),
      text: element.textContent,
    }));
    assert.equal(dotBox.tag, 'BUTTON', 'the dot is a real button');
    assert.equal(dotBox.position, 'absolute', 'the dot cannot move the card');
    assert.equal(dotBox.shapeWidth, 6, 'the visual is 6 px wide');
    assert.equal(dotBox.shapeHeight, 6, 'the visual is 6 px tall');
    assert.ok(dotBox.hitWidth >= 24 && dotBox.hitHeight >= 24, 'the hit area is ≥ 24 px');
    assert.equal(dotBox.label, 'Lost anchor. Open document health to repair.');
    assert.equal(dotBox.title, dotBox.label, 'the tooltip is the same short sentence');
    assert.equal(dotBox.text, '', 'the dot carries no marker text');

    // The card is exactly the measured fragment; the dot is outside the flow.
    const intro = view.locator('[data-fragment-block="intro"]');
    const boxes = await intro.evaluate((element) => {
      const card = element.querySelector('.nf-page-fragment-card');
      const fragmentBox = element.getBoundingClientRect();
      const cardBox = card?.getBoundingClientRect();
      return {
        fragment: { width: fragmentBox.width, height: fragmentBox.height },
        card: { width: cardBox?.width ?? 0, height: cardBox?.height ?? 0 },
      };
    });
    assert.ok(Math.abs(boxes.card.width - boxes.fragment.width) < 0.5, 'card width is unchanged');
    assert.ok(Math.abs(boxes.card.height - boxes.fragment.height) < 0.5, 'card height is unchanged');

    // No ⚠ anchor chip and no marker text anywhere on the page.
    const pageText = await view.innerText();
    assert.ok(!pageText.includes('anchor'), 'no anchor text on the page');
    assert.ok(!pageText.includes('⚠'), 'no warning glyph on the page');

    // Clicking the dot opens Document health on that anchor, without selecting
    // or opening the block behind it.
    const selectedBefore = await page.evaluate(
      () => window.__noteforestTest.state().runtimes[0]?.selectedBlockId ?? null,
    );
    await dot.click();
    await page.waitForSelector('[data-health-dialog="true"]', { timeout: 15000 });
    assert.equal(
      await page.locator('[data-health-dialog="true"]').getAttribute('data-health-row'),
      'anchor:broken-anchor',
      'Health opens on the anchor that owns the dot',
    );
    assert.equal(
      await page.evaluate(
        () => window.__noteforestTest.state().runtimes[0]?.selectedBlockId ?? null,
      ),
      selectedBefore,
      'the click does not select the block behind',
    );
    await page.locator('[data-health-dialog="true"] [data-health-close="true"]').last().click();
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });

    // Keyboard: the dot is a button, so Enter opens the same repair.
    await dot.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-health-dialog="true"]', { timeout: 15000 });
    assert.equal(
      await page.locator('[data-health-dialog="true"]').getAttribute('data-health-row'),
      'anchor:broken-anchor',
      'Enter opens the same anchor repair',
    );
    await page.locator('[data-health-dialog="true"] [data-health-close="true"]').last().click();
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    await ui.ensureInteractionMode('read');
    await h.screenshot(artifactsPath('b1-defects', 'page-anchor-dot.png'), {
      width: 1440,
      height: 900,
    });

    // Page Read and print are identical except the dot: no flag, no marker, no
    // text — every other parity record (boxes, cards, edges, chrome) is equal.
    const { read } = await assertPrintParity(
      pageCount,
      'markers',
      artifactsPath('b1-defects', 'printed-sheet-without-anchor.png'),
    );
    const readDots = read.reduce(
      (total, snapshot) =>
        total + snapshot.fragments.filter((fragment) => fragment.anchor !== null).length,
      0,
    );
    assert.ok(readDots > 0, 'Page Read keeps the dot');
    const readMissing = read.some((snapshot) =>
      snapshot.fragments.some((fragment) => (fragment.card ?? '').includes('data-missing-asset')),
    );
    assert.ok(readMissing, 'Page Read renders the missing-asset placeholder');

    // The print host carries nothing about anchors; the missing-image
    // placeholder and the defect badge stay exactly as they were.
    const printHost = await page.evaluate(() => {
      const result = window.__noteforestTest.renderPrint();
      return result.ok;
    });
    assert.equal(printHost, true, 'print model builds again');
    await page.waitForSelector('[data-print-test-host] [data-print-page="1"]', { timeout: 20000 });
    const hostAudit = await page.locator('[data-print-test-host]').evaluate((host) => ({
      dots: host.querySelectorAll('[data-page-anchor-warning]').length,
      flags: host.querySelectorAll('[data-fragment-anchor-warning]').length,
      text: host.textContent ?? '',
    }));
    assert.equal(hostAudit.dots, 0, 'the print host has no anchor dot');
    assert.equal(hostAudit.flags, 0, 'the print host has no anchor flag');
    assert.ok(!hostAudit.text.includes('anchor'), 'the print host has no marker text');
    assert.ok(!hostAudit.text.includes('⚠'), 'the print host has no warning glyph');
    await page.evaluate(() => window.__noteforestTest.clearPrint());
    await page.waitForSelector('[data-print-test-host]', { state: 'detached', timeout: 5000 });

    // The produced PDF carries no marker either. It is the same print model the
    // parity assertions just compared, printed by the real export path.
    const outputPath = artifactsPath('b1-defects', 'print-markers.pdf');
    const started = await page.evaluate(
      (input) => window.noteforest.exportPdf(input),
      { packagePath, outputPath, overwrite: true },
    );
    assert.equal(started.ok, true, started.message);
    const job = await waitUntil(
      async () => {
        const current = await page.evaluate(
          (id) => window.noteforest.getExportJob(id),
          started.jobId,
        );
        return current !== null && current.status !== 'running' ? current : false;
      },
      `export ${started.jobId}`,
      120000,
    );
    assert.equal(job.status, 'done', job.error?.message ?? 'the export succeeds');
    const pdf = await inspectPdfFile(outputPath);
    assert.equal(pdf.pageCount, pageCount, 'the PDF has the Page Read page count');
    assert.ok(pdf.text.trim().length > 0, 'the PDF has real text');
    assert.ok(!pdf.text.includes('anchor'), 'the PDF text has no marker');
    assert.ok(!pdf.text.includes('⚠'), 'the PDF text has no warning glyph');
    assert.ok(textContains(pdf.text, 'Broken callout'), 'the note text is still in the PDF');
  });

  it('keeps the dot and the defect chip on one card without overlap', async () => {
    const env = ui.isolated('m4c1-defect-dot');
    await launch('m4c1-defect-dot');
    const wideLine =
      'const aVeryLongUnbreakableCodeLineThatCannotFitOnANarrowPageAtAll = computeEverything();';
    const document = pageDocument({
      id: 'defect-and-dot',
      title: 'Defect and dot',
      chapterTitle: 'Diagnostics',
      blocks: [
        {
          id: 'wide-code',
          label: 'Wide code',
          content: {
            type: 'doc',
            children: [
              { type: 'codeBlock', attrs: { text: wideLine, language: 'ts' } },
            ],
          },
        },
        textBlock('defect-child', 'Broken callout', 'The branch survives the broken anchor.'),
      ],
      anchors: [
        {
          id: 'wide-anchor',
          blockId: 'wide-code',
          kind: 'text',
          selector: { kind: 'text', quote: 'not present' },
          quote: 'not present',
        },
      ],
      branches: [
        {
          id: 'branch-wide',
          sourceBlockId: 'wide-code',
          sourceAnchorId: 'wide-anchor',
          targetBlockId: 'defect-child',
          role: 'primary',
        },
      ],
    });
    const packagePath = await openPackage(env, 'Print compositor defect and dot', document);
    await showPageRead();
    // A narrow content box makes the unbreakable code line a blocking defect.
    await setPageSettingsOverride(packagePath, { setup: A5_PORTRAIT_STACKED });
    const view = activePageView();
    const fragment = view.locator('[data-fragment-block="wide-code"]');
    await fragment.waitFor();
    assert.equal(
      await fragment.getAttribute('data-fragment-defect'),
      'true',
      'the wide code block carries a blocking defect',
    );
    assert.equal(
      await fragment.getAttribute('data-fragment-anchor-warning'),
      'true',
      'the same block carries the anchor dot',
    );
    const geometry = await fragment.evaluate((element) => {
      const defect = element.querySelector('[data-page-defect]')?.getBoundingClientRect();
      const dot = element.querySelector('[data-page-anchor-warning]')?.getBoundingClientRect();
      return {
        defect: defect === undefined ? null : { left: defect.left, right: defect.right },
        dot: dot === undefined ? null : { left: dot.left, right: dot.right },
      };
    });
    assert.ok(geometry.defect !== null && geometry.dot !== null, 'both markers render');
    assert.ok(
      geometry.defect.right <= geometry.dot.left + 0.5,
      'the defect chip steps left of the dot',
    );
    await h.screenshot(artifactsPath('b1-defects', 'page-defect-and-dot.png'), {
      width: 1440,
      height: 900,
    });
  });
});
