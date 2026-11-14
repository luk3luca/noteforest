import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  pageSubtreeWrapCalloutDocument,
  pageSubtreeWrapDocument,
  pageSubtreeWrapNestedDocument,
  pageSubtreeWrapSiblingsDocument,
  writePagePackage,
} from '../support/page-fixtures.mjs';

/**
 * R2i Page subtree-aware wrap.
 *
 * The first child card may fit beside its parent while the whole subtree does
 * not. Page Read/Edit must then move the whole direct-child group below the
 * parent at the Page child indent, keep siblings in one atomic level column,
 * and then keep the child's children beside it when they fit. The same layout
 * feeds the paginator fragments and the print model; this suite records page
 * count, whitespace, and screenshots for the product-owner checkpoint.
 */

const tempRoot = artifactsPath('r2i-ui');
const outputDir = artifactsPath('r2i', 'ui');
const evidenceDir = artifactsPath('r2i');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const CHILD_INDENT = 26;
// Fixed Page corridor: lead 4 + stem 14.
const SIBLING_GAP = 18;
const CALLOUT_RIGHT_GAP = 24;
const TOLERANCE = 1.5;

async function launch(name, width = 1440, height = 900) {
  page = await ui.launch(ui.isolated(name));
  await h.setWindowSize(width, height);
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

async function pageCount() {
  return Number(await activePageView().getAttribute('data-page-count'));
}

async function fragmentBox(blockId) {
  return page
    .locator(`.nf-editor[data-active="true"] [data-fragment-block="${blockId}"]`)
    .evaluate((element) => ({
      blockId: element.getAttribute('data-fragment-block') ?? '',
      left: Number.parseFloat(element.style.left),
      top: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }));
}

async function allFragmentBoxes() {
  return activePageView()
    .locator('.nf-page-fragment')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        blockId: element.getAttribute('data-fragment-block') ?? '',
        left: Number.parseFloat(element.style.left),
        top: Number.parseFloat(element.style.top),
        width: Number.parseFloat(element.style.width),
        height: Number.parseFloat(element.style.height),
      })),
    );
}

async function contentBox() {
  return activePageView()
    .locator('[data-page-content]')
    .evaluate((element) => ({
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }));
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
}

function closeTo(actual, expected, tolerance = TOLERANCE) {
  return Math.abs(actual - expected) <= tolerance;
}

function assertNoOverlap(boxes, label) {
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      const horizontal = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
      const vertical = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
      assert.ok(
        horizontal <= 0.5 || vertical <= 0.5,
        `${label}: ${a.blockId} and ${b.blockId} do not overlap`,
      );
    }
  }
}

function assertInsideContent(boxes, content, label) {
  for (const box of boxes) {
    assert.ok(box.left >= -0.75, `${label}: ${box.blockId} does not start left of the content box`);
    assert.ok(
      box.left + box.width <= content.width + 0.75,
      `${label}: ${box.blockId} does not overflow the content width`,
    );
    assert.ok(box.top >= -0.75, `${label}: ${box.blockId} does not start above the content box`);
    assert.ok(
      box.top + box.height <= content.height + 0.75,
      `${label}: ${box.blockId} does not overflow the content height`,
    );
  }
}

async function writeEvidence(name, fixture) {
  const boxes = await allFragmentBoxes();
  const content = await contentBox();
  const usedArea = boxes.reduce((total, box) => total + box.width * box.height, 0);
  const contentArea = content.width * content.height;
  const evidence = {
    fixture,
    pageCount: await pageCount(),
    content,
    whitespaceRatio: contentArea > 0 ? Number((1 - usedArea / contentArea).toFixed(4)) : 0,
    boxes,
  };
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(resolve(evidenceDir, `${name}.json`), JSON.stringify(evidence, null, 2), 'utf8');
  return { boxes, content, evidence };
}

describe('R2i Page subtree-aware wrap', () => {
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

  it('wraps the group below the parent and keeps the grandchild beside the child', async () => {
    const env = ui.isolated('r2i-read');
    await launch('r2i-read');
    await openPackage(env, 'Page subtree wrap', pageSubtreeWrapDocument());
    await showPageRead();

    assert.equal(await pageCount(), 1, 'the fixture fits one landscape page');
    const root = await fragmentBox('r2i-root');
    const child = await fragmentBox('r2i-child');
    const grandchild = await fragmentBox('r2i-grandchild');
    const { boxes, content } = await writeEvidence('page-subtree-wrap', 'pageSubtreeWrap');

    // The child group moves below the root at the Page child indent.
    assert.ok(child.top >= root.top + root.height - 0.75, 'child starts below the root card');
    assert.ok(
      closeTo(child.left - root.left, CHILD_INDENT),
      `child starts one childIndent right of the root (${child.left - root.left})`,
    );
    // The grandchild fits beside the child at the new origin, not below it.
    assert.ok(
      grandchild.left >= child.left + child.width - 0.75,
      'grandchild sits right of the child',
    );
    assert.ok(closeTo(grandchild.top, child.top, 1), 'grandchild shares the child y');
    assert.ok(
      closeTo(grandchild.left, child.left + child.width + SIBLING_GAP),
      'grandchild starts one sibling gap right of the child',
    );
    assertNoOverlap(boxes, 'subtree wrap');
    assertInsideContent(boxes, content, 'subtree wrap');

    await h.screenshot(artifactsPath('r2i', 'ui', 'page-subtree-wrap-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('keeps the fixed child corridor when a legacy childIndent is stored', async () => {
    const env = ui.isolated('r2i-indent');
    await launch('r2i-indent');
    const packagePath = await openPackage(env, 'Page subtree wrap indent', pageSubtreeWrapDocument());
    await showPageRead();

    const root = await fragmentBox('r2i-root');
    const before = await fragmentBox('r2i-child');
    assert.ok(closeTo(before.left - root.left, CHILD_INDENT), 'the compact default is 26 px');

    await setPageSettingsOverride(packagePath, { theme: { childIndent: 40, maxWrapIndent: 80 } });
    await waitPageReady(1);
    const rootAfter = await fragmentBox('r2i-root');
    const childAfter = await fragmentBox('r2i-child');
    // The stored legacy offset is kept for compatibility but is no longer an
    // engine lever: the Page corridor is a fixed 26 px (12 trunk + 14 stem).
    assert.ok(
      closeTo(childAfter.left - rootAfter.left, CHILD_INDENT, 2),
      `the engine keeps the fixed child corridor (${childAfter.left - rootAfter.left})`,
    );
    const grandchild = await fragmentBox('r2i-grandchild');
    assert.ok(
      grandchild.left >= childAfter.left + childAfter.width - 0.75,
      'the grandchild still fits beside the child at the fixed origin',
    );
    await writeEvidence('page-subtree-wrap-indent', 'pageSubtreeWrapIndent40');
  });

  it('wraps the first child children below it when the new origin cannot hold them', async () => {
    const env = ui.isolated('r2i-nested');
    await launch('r2i-nested');
    await openPackage(env, 'Page subtree wrap nested', pageSubtreeWrapNestedDocument());
    await showPageRead();

    assert.equal(await pageCount(), 1, 'the nested fixture fits one landscape page');
    const root = await fragmentBox('r2i-nested-root');
    const child = await fragmentBox('r2i-nested-child');
    const grandchild = await fragmentBox('r2i-nested-grandchild');
    const great = await fragmentBox('r2i-nested-great');
    const { boxes, content } = await writeEvidence('page-subtree-wrap-nested', 'pageSubtreeWrapNested');

    assert.ok(child.top >= root.top + root.height - 0.75, 'child starts below the root');
    assert.ok(
      closeTo(child.left - root.left, CHILD_INDENT),
      'child uses the first child indent',
    );
    // Level 2: the grandchild still does not fit beside the child, so it wraps
    // one more level at the child indent.
    assert.ok(
      grandchild.top >= child.top + child.height - 0.75,
      'grandchild starts below the child',
    );
    assert.ok(
      closeTo(grandchild.left - child.left, CHILD_INDENT),
      `grandchild uses one more child indent (${grandchild.left - child.left})`,
    );
    // Level 3: the great-grandchild fits beside the grandchild.
    assert.ok(
      great.left >= grandchild.left + grandchild.width - 0.75,
      'great-grandchild sits right of the grandchild',
    );
    assert.ok(closeTo(great.top, grandchild.top, 1), 'great-grandchild shares its parent y');
    assertNoOverlap(boxes, 'nested subtree wrap');
    assertInsideContent(boxes, content, 'nested subtree wrap');

    await h.screenshot(artifactsPath('r2i', 'ui', 'page-subtree-wrap-nested-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('keeps the direct-child group atomic when one subtree fails', async () => {
    const env = ui.isolated('r2i-siblings');
    await launch('r2i-siblings');
    await openPackage(env, 'Page subtree wrap siblings', pageSubtreeWrapSiblingsDocument());
    await showPageRead();

    const root = await fragmentBox('r2i-sibling-root');
    const child = await fragmentBox('r2i-sibling-child');
    const grandchild = await fragmentBox('r2i-sibling-grandchild');
    const leaf = await fragmentBox('r2i-sibling-leaf');
    const { boxes, content } = await writeEvidence('page-subtree-wrap-siblings', 'pageSubtreeWrapSiblings');

    // One failing subtree moves the whole level column below the root: the
    // leaf does not stay right while its sibling wraps.
    assert.ok(child.top >= root.top + root.height - 0.75, 'the first child wraps below');
    assert.ok(leaf.top >= root.top + root.height - 0.75, 'the leaf wraps below with it');
    assert.ok(closeTo(leaf.left, child.left), 'siblings share one level column x');
    assert.ok(
      leaf.top >= child.top + child.height - 0.75,
      'the leaf starts below the first child subtree',
    );
    assert.ok(
      grandchild.left >= child.left + child.width - 0.75,
      'the grandchild stays beside its own parent',
    );
    assertNoOverlap(boxes, 'atomic subtree wrap');
    assertInsideContent(boxes, content, 'atomic subtree wrap');

    await h.screenshot(artifactsPath('r2i', 'ui', 'page-subtree-wrap-siblings-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('moves the callout to the right lane and the child group below (R2j A)', async () => {
    const env = ui.isolated('r2i-callout');
    await launch('r2i-callout');
    await openPackage(env, 'Page subtree wrap callout', pageSubtreeWrapCalloutDocument());
    await showPageRead();

    const root = await fragmentBox('r2i-callout-root');
    const callout = await fragmentBox('r2i-callout-note');
    const child = await fragmentBox('r2i-callout-child');
    const grandchild = await fragmentBox('r2i-callout-grandchild');
    const { boxes, content } = await writeEvidence('page-subtree-wrap-callout', 'pageSubtreeWrapCallout');

    assert.ok(
      closeTo(callout.left - root.left, root.width + CALLOUT_RIGHT_GAP, 2),
      `the callout moves to the parent right lane (${callout.left - root.left})`,
    );
    assert.ok(closeTo(callout.top, root.top, 1), 'the callout starts at the parent y');
    assert.ok(
      child.top >= callout.top + callout.height - 0.75,
      'the wrapped child group starts below the callout stack',
    );
    assert.ok(closeTo(child.left - root.left, CHILD_INDENT), 'the group keeps the child indent');
    assert.ok(
      grandchild.left >= child.left + child.width - 0.75,
      'the grandchild stays beside the child, not in the callout lane',
    );
    assertNoOverlap(boxes, 'callout subtree wrap');
    assertInsideContent(boxes, content, 'callout subtree wrap');

    await h.screenshot(artifactsPath('r2i', 'ui', 'page-subtree-wrap-callout-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('keeps Page Read and Page Edit fragment geometry identical', async () => {
    const env = ui.isolated('r2i-edit');
    await launch('r2i-edit');
    const packagePath = await openPackage(env, 'Page subtree wrap edit', pageSubtreeWrapDocument());
    await showPageRead();
    const read = await allFragmentBoxes();

    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 5000 },
    );
    await waitPageReady(1);
    const edit = await allFragmentBoxes();
    assert.deepEqual(edit, read, 'Page Edit uses the same wrapped fragment placement');

    await h.screenshot(artifactsPath('r2i', 'ui', 'page-subtree-wrap-edit-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });
});
