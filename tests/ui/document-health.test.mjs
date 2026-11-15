import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addAnchor, addBranch, addTopLevelBlock, textDoc } from '../support/fixtures.mjs';
import { multiPageBlocksDocument, writePagePackage } from '../support/page-fixtures.mjs';

const tempRoot = artifactsPath('document-health-ui');
const screenshotDir = artifactsPath('document-health');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const { isolated, applyCommand, structure } = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

/** Paragraph with one inert anchor mark: an orphan reference. */
function markedDoc(parts) {
  return {
    type: 'doc',
    children: [
      {
        type: 'paragraph',
        children: parts.map((part) =>
          typeof part === 'string'
            ? { type: 'text', text: part }
            : {
                type: 'text',
                text: part.text,
                marks: [{ type: 'anchor', attrs: { anchorIds: part.anchorIds } }],
              },
        ),
      },
    ],
  };
}

async function openHealthFromPalette() {
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('.nf-palette');
  await page.locator('.nf-palette-input').fill('Check document health');
  await page.getByRole('option', { name: /Check document health/ }).waitFor({ timeout: 10000 });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-anchor-health="true"]');
}

async function openHealthFromInfoChip() {
  await page.locator('[data-health-info-chip]').click();
  await page.waitForSelector('[data-anchor-health="true"]');
}

async function waitForInfoChip({ idle = 0, orphans = 0, structure = 0 }, { timeout = 10000 } = {}) {
  await page.waitForFunction(
    (expected) => {
      const chip = document.querySelector('[data-health-info-chip]');
      if (expected.total === 0) return chip === null;
      return (
        chip !== null &&
        chip.getAttribute('data-health-idle') === String(expected.idle) &&
        chip.getAttribute('data-health-orphans') === String(expected.orphans) &&
        chip.getAttribute('data-health-structure') === String(expected.structure)
      );
    },
    { ...{ idle, orphans, structure }, total: idle + orphans + structure },
    { timeout },
  );
}

async function selectedBlock(blockId) {
  await page.waitForFunction(
    (expected) => {
      const state = window.__noteforestTest.state();
      const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
      return runtime?.selectedBlockId === expected;
    },
    blockId,
    { timeout: 10000 },
  );
}

async function activePageNumber() {
  return page
    .locator('.nf-editor[data-active="true"] .nf-page-view')
    .evaluate((element) => Number(element.getAttribute('data-current-page') ?? '1'));
}

describe('Document health sheet', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('audits mixed anchor and structure states, filters, searches, and locates', async () => {
    await launch(isolated('mixed'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();

    const ids = {
      brokenSource: 'dh-broken-source',
      brokenTarget: 'dh-broken-target',
      brokenAnchor: 'dh-broken-anchor',
      ambiguousSource: 'dh-ambiguous-source',
      ambiguousTarget: 'dh-ambiguous-target',
      ambiguousAnchor: 'dh-ambiguous-anchor',
      idleSource: 'dh-idle-source',
      idleAnchor: 'dh-idle-anchor',
      orphanSource: 'dh-orphan-source',
      emptyChapter: 'dh-empty-chapter',
    };

    await addTopLevelBlock(ui, ids.brokenSource, textDoc('Alpha omega beta'));
    await addTopLevelBlock(ui, ids.brokenTarget, textDoc('Broken target'));
    await addAnchor(ui, {
      anchorId: ids.brokenAnchor,
      blockId: ids.brokenSource,
      kind: 'text',
      selector: { kind: 'text', quote: 'omega' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 6, end: 11 }] },
    });
    await addBranch(ui, {
      sourceBlockId: ids.brokenSource,
      sourceAnchorId: ids.brokenAnchor,
      targetBlockId: ids.brokenTarget,
    });
    await applyCommand({
      type: 'block.editContent',
      blockId: ids.brokenSource,
      content: textDoc('Alpha beta'),
    });

    await addTopLevelBlock(ui, ids.ambiguousSource, textDoc('dup dup'));
    await addTopLevelBlock(ui, ids.ambiguousTarget, textDoc('Ambiguous target'));
    await addAnchor(ui, {
      anchorId: ids.ambiguousAnchor,
      blockId: ids.ambiguousSource,
      kind: 'text',
      selector: { kind: 'text', quote: 'dup', occurrenceHint: 1 },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 3 }] },
    });
    await addBranch(ui, {
      sourceBlockId: ids.ambiguousSource,
      sourceAnchorId: ids.ambiguousAnchor,
      targetBlockId: ids.ambiguousTarget,
    });
    await applyCommand({
      type: 'block.editContent',
      blockId: ids.ambiguousSource,
      content: textDoc('dup dup'),
    });

    await addTopLevelBlock(ui, ids.idleSource, textDoc('Idle anchor word'));
    await addAnchor(ui, {
      anchorId: ids.idleAnchor,
      blockId: ids.idleSource,
      kind: 'text',
      selector: { kind: 'text', quote: 'Idle' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 4 }] },
    });

    await addTopLevelBlock(
      ui,
      ids.orphanSource,
      markedDoc(['An ', { text: 'orphanword', anchorIds: ['dh-orphan-reference'] }, ' here']),
    );
    await applyCommand({
      type: 'chapter.create',
      chapterId: ids.emptyChapter,
      title: 'Empty chapter',
    });

    await waitForInfoChip({ idle: 1, orphans: 1, structure: 1 });
    const before = await structure();
    await openHealthFromPalette();

    assert.deepEqual(await structure(), before, 'opening the sheet never mutates the document');
    const summary = page.locator('[data-health-summary]');
    assert.equal(await summary.locator('[data-health-count-all]').getAttribute('data-health-count-all'), '5');
    assert.equal(
      await summary.locator('[data-health-count-needs-repair]').getAttribute('data-health-count-needs-repair'),
      '3',
    );
    assert.equal(
      await summary.locator('[data-health-count-orphans]').getAttribute('data-health-count-orphans'),
      '1',
    );
    assert.equal(
      await summary.locator('[data-health-count-structure]').getAttribute('data-health-count-structure'),
      '1',
    );
    assert.equal(await page.locator('[data-health-row]').count(), 5);
    assert.equal(await page.locator('[data-health-severity="S1"]').count(), 1);
    assert.equal(await page.locator('[data-health-anchor]').count(), 3);

    const brokenRow = page.locator(`[data-health-anchor="${ids.brokenAnchor}"]`);
    assert.equal(await brokenRow.getAttribute('data-health-state'), 'broken');
    assert.match((await brokenRow.textContent()) ?? '', /Lost anchor/);
    assert.match((await brokenRow.textContent()) ?? '', /omega/);
    const idleRow = page.locator(`[data-health-anchor="${ids.idleAnchor}"]`);
    assert.match((await idleRow.textContent()) ?? '', /Idle anchor/);
    assert.match((await idleRow.textContent()) ?? '', /0 branches/);

    await page.locator('[data-health-filter="broken"]').click();
    assert.equal(await page.locator('[data-health-row]').count(), 1);
    await page.locator('[data-health-filter="ambiguous"]').click();
    assert.equal(await page.locator('[data-health-row]').count(), 1);
    await page.locator('[data-health-filter="idle"]').click();
    assert.equal(await page.locator('[data-health-row]').count(), 1);
    await page.locator('[data-health-filter="orphans"]').click();
    assert.equal(await page.locator('[data-health-row]').count(), 1);
    await page.locator('[data-health-filter="structure"]').click();
    assert.equal(await page.locator('[data-health-row]').count(), 1);
    await page.locator('[data-health-filter="hidden"]').click();
    assert.equal(await page.locator('[data-health-row]').count(), 0);
    await page.locator('[data-health-filter="all"]').click();

    await page.locator('[data-health-search="true"]').fill('omega');
    assert.equal(await page.locator('[data-health-row]').count(), 1);
    await page.locator('[data-health-search="true"]').fill('Empty chapter');
    assert.equal(await page.locator('[data-health-row]').count(), 1);
    await page.locator('[data-health-search="true"]').fill('no match at all');
    assert.equal(await page.locator('[data-health-empty="true"]').count(), 1);
    await page.locator('[data-health-search="true"]').fill('');

    await h.screenshot(artifactsPath('document-health', 'sheet-mixed-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await page.locator(`[data-health-navigate="${ids.brokenAnchor}"]`).click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await page.waitForFunction(
      ({ blockId, anchorId }) => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
        return (
          runtime?.selectedBlockId === blockId &&
          runtime?.selectedAnchor?.anchorId === anchorId
        );
      },
      { blockId: ids.brokenSource, anchorId: ids.brokenAnchor },
      { timeout: 10000 },
    );
    await h.screenshot(artifactsPath('document-health', 'locate-broken-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    assert.deepEqual(await structure(), before, 'Locate never mutates the document');
  });

  it('branches an idle anchor and removes it with undo', async () => {
    await launch(isolated('idle'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();

    await openHealthFromPalette();
    assert.equal(await page.locator('[data-health-row]').count(), 0);
    assert.equal(
      (await page.locator('[data-health-empty="true"] p').first().textContent())?.trim(),
      'No document issues need repair.',
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });

    const ids = {
      source: 'dh-idle-actions-source',
      target: 'dh-idle-actions-target',
      anchor: 'dh-idle-actions-anchor',
    };
    await addTopLevelBlock(ui, ids.source, textDoc('Idle anchor text'));
    await addTopLevelBlock(ui, ids.target, textDoc('Reference target'));
    await addAnchor(ui, {
      anchorId: ids.anchor,
      blockId: ids.source,
      kind: 'text',
      selector: { kind: 'text', quote: 'Idle' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 4 }] },
    });
    await waitForInfoChip({ idle: 1 });
    await page.locator('[data-health-info-chip]').scrollIntoViewIfNeeded();
    await h.screenshot(artifactsPath('document-health', 'status-bar-idle-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await openHealthFromInfoChip();
    assert.equal(
      await page.locator('[data-health-filter="idle"]').getAttribute('aria-pressed'),
      'true',
      'the muted status indicator opens the sheet filtered on idle',
    );
    assert.equal(await page.locator('[data-health-row]').count(), 1);
    await page.locator(`[data-health-open="anchor:${ids.anchor}"]`).click();
    await page.waitForSelector(`[data-health-detail="${ids.anchor}"]`);
    await page.locator('[data-health-branch-target="true"]').selectOption(ids.target);
    await h.screenshot(artifactsPath('document-health', 'idle-detail-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await page.locator('[data-health-action="branch-from-anchor"]').click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await page.waitForFunction(
      (anchorId) => {
        const current = window.__noteforestTest.structure();
        return Object.values(current?.branches ?? {}).some(
          (branch) => branch.source.anchorId === anchorId,
        );
      },
      ids.anchor,
      { timeout: 10000 },
    );
    const branched = await structure();
    const created = Object.values(branched.branches).find(
      (branch) => branch.source.anchorId === ids.anchor,
    );
    assert.equal(created?.role, 'reference');
    assert.equal(created?.targetBlockId, ids.target);
    await waitForInfoChip({});

    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (anchorId) => {
        const current = window.__noteforestTest.structure();
        return Object.values(current?.branches ?? {}).every(
          (branch) => branch.source.anchorId !== anchorId,
        );
      },
      ids.anchor,
      { timeout: 10000 },
    );
    await waitForInfoChip({ idle: 1 });

    await openHealthFromPalette();
    await page.locator(`[data-health-open="anchor:${ids.anchor}"]`).click();
    await page.locator('[data-health-action="remove-idle"]').click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await page.waitForFunction(
      (anchorId) => window.__noteforestTest.structure()?.anchors?.[anchorId] === undefined,
      ids.anchor,
      { timeout: 10000 },
    );
    const removed = await structure();
    assert.ok(removed.blocks[ids.target] !== undefined, 'the target block is kept');
    await waitForInfoChip({});

    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (anchorId) => window.__noteforestTest.structure()?.anchors?.[anchorId] !== undefined,
      ids.anchor,
      { timeout: 10000 },
    );
    assert.deepEqual((await structure()).anchors, branched.anchors);
  });

  it('strips and recreates an orphan reference, and repairs an empty chapter', async () => {
    await launch(isolated('orphans'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();

    const orphanBlockId = 'dh-orphan-block';
    const orphanAnchorId = 'dh-orphan-reference';
    const orphanText = 'orphanword';
    await addTopLevelBlock(
      ui,
      orphanBlockId,
      markedDoc(['An ', { text: orphanText, anchorIds: [orphanAnchorId] }, ' here']),
    );
    await applyCommand({
      type: 'chapter.create',
      chapterId: 'dh-empty-chapter',
      title: 'Empty chapter',
    });
    await waitForInfoChip({ orphans: 1, structure: 1 });

    await openHealthFromInfoChip();
    assert.equal(await page.locator('[data-health-filter="orphans"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-health-row]').count(), 1);
    await page.locator('[data-health-open^="orphan-reference:"]').click();
    await page.waitForSelector('[data-health-detail^="orphan-reference:"]');
    assert.equal(await page.locator('[data-health-occurrences="true"]').count(), 1);
    await page.locator('[data-health-action="strip-orphan"]').click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await page.waitForFunction(
      ({ blockId, anchorId }) => {
        const current = window.__noteforestTest.structure();
        return JSON.stringify(current?.blocks?.[blockId]?.content ?? {}).includes(anchorId) === false;
      },
      { blockId: orphanBlockId, anchorId: orphanAnchorId },
      { timeout: 10000 },
    );
    await waitForInfoChip({ structure: 1 });
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      ({ blockId, anchorId }) => {
        const current = window.__noteforestTest.structure();
        return JSON.stringify(current?.blocks?.[blockId]?.content ?? {}).includes(anchorId) === true;
      },
      { blockId: orphanBlockId, anchorId: orphanAnchorId },
      { timeout: 10000 },
    );
    await waitForInfoChip({ orphans: 1, structure: 1 });

    // Select the orphaned word, then recreate the record from that selection.
    const prose = page
      .locator(`[data-block-card="${orphanBlockId}"] .nf-block-prose p`)
      .first();
    await prose.click({ position: { x: 2, y: 8 } });
    await page.keyboard.press('Home');
    for (let index = 0; index < 3; index += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.down('Shift');
    for (let index = 0; index < orphanText.length; index += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(() => window.getSelection()?.toString() ?? ''), orphanText);

    await openHealthFromInfoChip();
    await page.locator('[data-health-open^="orphan-reference:"]').click();
    await page.locator('[data-health-action="recreate-orphan"]').click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await page.waitForFunction(
      (anchorId) => window.__noteforestTest.structure()?.anchors?.[anchorId] !== undefined,
      orphanAnchorId,
      { timeout: 10000 },
    );
    const recreated = await structure();
    assert.equal(recreated.anchors[orphanAnchorId].blockId, orphanBlockId);
    assert.equal(
      Object.values(recreated.branches).some(
        (branch) => branch.source.anchorId === orphanAnchorId,
      ),
      false,
    );
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (anchorId) => window.__noteforestTest.structure()?.anchors?.[anchorId] === undefined,
      orphanAnchorId,
      { timeout: 10000 },
    );

    // Empty chapter: add a block, then delete a restored empty chapter.
    await openHealthFromPalette();
    await page.locator('[data-health-filter="structure"]').click();
    assert.equal(await page.locator('[data-health-row]').count(), 1);
    await page.locator('[data-health-open^="chapter:"]').click();
    await page.waitForSelector('[data-health-detail^="chapter:"]');
    await h.screenshot(artifactsPath('document-health', 'structure-row-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await page.locator('[data-health-action="add-chapter-block"]').click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
        return runtime?.chapterList.find((chapter) => chapter.id === 'dh-empty-chapter')?.blocks === 1;
      },
      undefined,
      { timeout: 10000 },
    );
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
        return runtime?.chapterList.find((chapter) => chapter.id === 'dh-empty-chapter')?.blocks === 0;
      },
      undefined,
      { timeout: 10000 },
    );

    await openHealthFromPalette();
    await page.locator('[data-health-open^="chapter:"]').click();
    await page.locator('[data-health-action="delete-chapter"]').click();
    await page.waitForSelector('[data-health-confirm="delete-chapter"]');
    await page.locator('[data-health-confirm-action="delete-chapter"]').click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
        return !runtime?.chapterList.some((chapter) => chapter.id === 'dh-empty-chapter');
      },
      undefined,
      { timeout: 10000 },
    );
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
        return runtime?.chapterList.some((chapter) => chapter.id === 'dh-empty-chapter');
      },
      undefined,
      { timeout: 10000 },
    );
  });

  it('jumps to the containing Page, keeps Read mode read-only, and shows the no-document state', async () => {
    const environment = isolated('page-read');
    await launch(environment);
    await h.setWindowSize(1440, 900);

    const document = multiPageBlocksDocument(20);
    const packagePath = await writePagePackage(
      environment.NOTEFOREST_LIBRARY,
      'document-health-pages',
      document,
    );
    const opened = await page.evaluate(
      (path) => window.__noteforestTest.openPath(path),
      packagePath,
    );
    assert.equal(opened, true);
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      packagePath,
      { timeout: 10000 },
    );
    await page.waitForSelector('.nf-editor[data-active="true"]');
    await applyCommand({
      type: 'anchor.create',
      anchorId: 'dh-page-anchor',
      blockId: 'b16',
      kind: 'text',
      selector: { kind: 'text', quote: 'A short' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 7 }] },
    });
    await waitForInfoChip({ idle: 1 });

    await page.keyboard.press('Meta+3');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
    await page.waitForFunction(
      () =>
        document.querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-ready') === 'true',
      undefined,
      { timeout: 20000 },
    );
    const firstPage = await activePageNumber();
    assert.equal(firstPage, 1);

    await openHealthFromInfoChip();
    await page.locator(`[data-health-navigate="dh-page-anchor"]`).click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await page.waitForFunction(
      (anchorId) => {
        const fragment = document.querySelector(
          `.nf-editor[data-active="true"] .nf-page-view [data-fragment-block="b16"]`,
        );
        return fragment !== null;
      },
      'dh-page-anchor',
      { timeout: 20000 },
    );
    const containingPage = await activePageNumber();
    assert.ok(containingPage > 1, `Locate jumped to page ${containingPage}`);
    const view = await page.evaluate(
      (path) => window.__noteforestTest.viewState()[path],
      packagePath,
    );
    assert.equal(view.currentPage, containingPage);
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-page-view [data-fragment-block="b16"]').count(),
      1,
    );
    await h.screenshot(artifactsPath('document-health', 'page-locate-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await page.keyboard.press('Meta+2');
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await ui.ensureInteractionMode('read');
    const before = await structure();
    await openHealthFromInfoChip();
    assert.equal(await page.locator('[data-health-read-only="true"]').count(), 1);
    await page.locator('[data-health-open="anchor:dh-page-anchor"]').click();
    assert.equal(
      await page.locator('[data-health-action="remove-idle"]').isDisabled(),
      true,
      'Read mode cannot remove an anchor',
    );
    assert.deepEqual(await structure(), before, 'Read mode opening and reviewing mutates nothing');
    await h.screenshot(artifactsPath('document-health', 'read-mode-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await page.locator('[data-health-action="locate-expand"]').click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await selectedBlock('b16');
    await ui.ensureInteractionMode('edit');

    const activeTab = await page.evaluate(() => window.__noteforestTest.state().activeTab);
    await page.evaluate((path) => window.__noteforestTest.closePath(path), activeTab);
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs.length === 0,
      undefined,
      { timeout: 10000 },
    );
    await openHealthFromPalette();
    assert.equal(await page.locator('[data-health-no-document="true"]').count(), 1);
    assert.equal(
      (await page.locator('[data-health-empty="true"]').textContent())?.trim(),
      'Open a document to check its anchors and structure.',
    );
    await h.screenshot(artifactsPath('document-health', 'no-document-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });
});
