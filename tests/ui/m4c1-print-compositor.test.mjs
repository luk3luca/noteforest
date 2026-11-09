import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageCalloutModesDocument, pageDocument, textBlock, imageBlock, writePagePackage } from '../support/page-fixtures.mjs';

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
}

async function currentPage() {
  return Number(await activePageView().getAttribute('data-current-page'));
}

async function gotoPage(number) {
  let current = await currentPage();
  while (current < number) {
    const next = current + 1;
    await activePageView().locator('[data-page-nav="next"]').click();
    await page.waitForFunction(
      (expected) =>
        Number(
          document.querySelector('.nf-editor[data-active="true"] .nf-page-view')
            ?.getAttribute('data-current-page'),
        ) === expected,
      next,
      { timeout: 10000 },
    );
    current = next;
  }
  while (current > number) {
    const previous = current - 1;
    await activePageView().locator('[data-page-nav="prev"]').click();
    await page.waitForFunction(
      (expected) =>
        Number(
          document.querySelector('.nf-editor[data-active="true"] .nf-page-view')
            ?.getAttribute('data-current-page'),
        ) === expected,
      previous,
      { timeout: 10000 },
    );
    current = previous;
  }
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

function pickAttributes(attributes, prefixes) {
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([name]) => prefixes.some((prefix) => name.startsWith(prefix)))
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

async function readSnapshots(pageCount) {
  const view = activePageView();
  const snapshots = [];
  for (let number = 1; number <= pageCount; number += 1) {
    await gotoPage(number);
    snapshots.push(await snapshotSheet(view.locator('.nf-page-sheet').first()));
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

async function printSnapshots(pageCount) {
  const host = page.locator('[data-print-test-host]');
  const snapshots = [];
  for (let number = 1; number <= pageCount; number += 1) {
    snapshots.push(await snapshotSheet(host.locator(`[data-print-page="${number}"]`)));
  }
  return snapshots;
}

async function assertPrintParity(pageCount, label) {
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
    assert.deepEqual(actual.fragments, expected.fragments, `${label}: page ${index + 1} fragments/cards`);
    assert.deepEqual(actual.edgeSvg, expected.edgeSvg, `${label}: page ${index + 1} edges/trunks`);
    assert.deepEqual(actual.edgeLabels, expected.edgeLabels, `${label}: page ${index + 1} edge labels`);
    assert.deepEqual(actual.header, expected.header, `${label}: page ${index + 1} header`);
    assert.deepEqual(actual.footer, expected.footer, `${label}: page ${index + 1} footer`);
    assert.deepEqual(actual.ghost, expected.ghost, `${label}: page ${index + 1} ghost`);
    assert.deepEqual(actual.continues, expected.continues, `${label}: page ${index + 1} continues`);
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
    const { read } = await assertPrintParity(pageCount, 'mode A');
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

  it('prints broken-anchor and missing-asset markers exactly like Page Read', async () => {
    const env = ui.isolated('m4c1-markers');
    await launch('m4c1-markers');
    const document = pageDocument({
      id: 'print-markers',
      title: 'Print markers',
      chapterTitle: 'Diagnostics',
      blocks: [
        textBlock('intro', 'Intro', 'Parent text that does not contain the stale quote.'),
        imageBlock('missing-image', 'Lost figure', 'missing-asset-id', 'Lost diagram'),
        textBlock('child', 'Broken callout', 'The branch survives the broken anchor.'),
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
    await openPackage(env, 'Print compositor markers', document);
    await showPageRead();
    const pageCount = Number(await activePageView().getAttribute('data-page-count'));
    const { read } = await assertPrintParity(pageCount, 'markers');
    const readBadges = read.reduce(
      (total, snapshot) =>
        total + snapshot.fragments.filter((fragment) => fragment.anchor !== null).length,
      0,
    );
    assert.ok(readBadges > 0, 'Page Read shows the broken-anchor badge');
    const readMissing = read.some((snapshot) =>
      snapshot.fragments.some((fragment) => (fragment.card ?? '').includes('data-missing-asset')),
    );
    assert.ok(readMissing, 'Page Read renders the missing-asset placeholder');
  });
});
