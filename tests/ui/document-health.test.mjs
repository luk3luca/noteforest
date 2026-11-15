import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addAnchor, addBranch, addTopLevelBlock, textDoc } from '../support/fixtures.mjs';
import { multiPageBlocksDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * S2 Document health: the sidebar report and the 520 px repair modal.
 *
 * The sidebar is the report (grouped sections, one row per issue); a row opens
 * the modal in front. Confirm closes it, the row leaves the list and the toast
 * carries Undo. The v1 sheet is retired, so every assertion here targets the
 * section + modal surface.
 */

const tempRoot = artifactsPath('document-health-ui');
const screenshotDir = artifactsPath('document-health');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const { isolated, applyCommand, structure } = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

/** Paragraph with one inert anchor mark: an unlinked mark. */
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
  await page.locator('.nf-palette-input').fill('Document health');
  await page.getByRole('option', { name: /Document health/ }).first().waitFor({ timeout: 10000 });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-sidebar-panel="health"]');
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

async function waitForBadge(count, { timeout = 10000 } = {}) {
  await page.waitForFunction(
    (expected) => {
      const badge = document.querySelector('[data-health-badge]');
      if (expected === 0) return badge === null;
      return badge !== null && badge.getAttribute('data-health-badge') === String(expected);
    },
    count,
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

async function clickHealthRow(rowId) {
  await page.locator(`[data-health-row="${rowId}"] [data-health-row-button="true"]`).click();
  await page.waitForSelector(`[data-health-dialog="true"][data-health-row="${rowId}"]`);
}

async function closeModal() {
  await page.locator('[data-health-dialog="true"] [data-health-close="true"]').last().click();
  await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
}

async function ensureSection(id) {
  const toggle = page.locator(`[data-health-section-toggle="true"][data-health-section="${id}"]`);
  await toggle.waitFor();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

describe('Document health sidebar and repair modal', () => {
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

  it('groups a mixed document into sections, counts it, searches it, and keeps session state', async () => {
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
      orphanBlock: 'dh-orphan-block',
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
    await waitForBadge(3);
    const before = await structure();

    // Health is the third section tab, not an action bridge.
    assert.equal(await page.locator('[data-sidebar-tabs] [role="tab"]').count(), 3);
    assert.equal(await page.locator('[data-activity-health="true"]').count(), 0);
    const badge = page.locator('[data-health-badge]');
    assert.equal(await badge.getAttribute('data-health-badge'), '3');
    assert.equal(await badge.getAttribute('aria-label'), '3 anchors need repair');
    const badgeStyle = await badge.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        radius: style.borderRadius,
        numeric: style.fontVariantNumeric,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
    assert.equal(badgeStyle.radius, '2px', 'the counter is a square, not a pill');
    assert.equal(badgeStyle.numeric, 'tabular-nums');
    assert.equal(badgeStyle.width, badgeStyle.height, 'the counter is square');
    await h.screenshot(artifactsPath('document-health', 'badge-nonzero-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await page.locator('[data-sidebar-tab="health"]').click();
    await page.waitForSelector('[data-sidebar-panel="health"]');
    assert.equal(
      await page.locator('[data-sidebar-tab="health"]').getAttribute('aria-selected'),
      'true',
    );
    assert.deepEqual(await structure(), before, 'opening Health never mutates the document');

    const summary = page.locator('[data-health-summary]');
    assert.equal(await summary.getAttribute('data-health-count-all'), '5');
    assert.equal(await summary.getAttribute('data-health-count-needs-repair'), '3');
    assert.equal(await summary.getAttribute('data-health-count-idle'), '1');
    assert.equal((await summary.innerText()).trim(), '3 to fix · 5 issues');

    // Sections in the confirmed order; Hidden has no rows and must not render.
    assert.deepEqual(
      await page.locator('[role="treeitem"][data-health-section]').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-health-section')),
      ),
      ['anchors', 'unused', 'structure'],
    );
    assert.equal(await page.locator('[data-health-section="hidden"]').count(), 0);
    assert.equal(
      await page.locator('[data-health-section-toggle="true"][data-health-section="anchors"]')
        .getAttribute('aria-expanded'),
      'true',
      'Anchors to fix is open by default',
    );
    assert.equal(
      await page.locator('[data-health-section="anchors"] [data-health-row]').count(),
      3,
      'broken, ambiguous and the unlinked mark',
    );
    assert.equal(
      await page.locator('[data-health-section="unused"] [data-health-row]').count(),
      0,
      'collapsed sections render no rows',
    );
    assert.equal(
      await page
        .locator('[data-health-section-toggle="true"][data-health-section="anchors"] [data-health-section-count]')
        .getAttribute('data-health-section-count'),
      '3',
    );
    await h.screenshot(artifactsPath('document-health', 'sections-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Open sections persist across a section switch within the session.
    await page.locator('[data-health-section-toggle="true"][data-health-section="unused"]').click();
    assert.equal(
      await page.locator('[data-health-section="unused"] [data-health-row]').count(),
      1,
    );
    const idleRow = page.locator('[data-health-section="unused"] [data-health-row]');
    assert.equal(await idleRow.getAttribute('data-health-state'), 'idle');
    assert.equal(await idleRow.getAttribute('data-health-info'), 'true');
    assert.equal(
      await idleRow.locator('[data-health-row-button="true"]').innerText(),
      '“Idle”',
      'the row is the quote; a zero branch count is not rendered',
    );
    await ui.showLibrary();
    await ui.showHealth();
    assert.equal(
      await page.locator('[data-health-section-toggle="true"][data-health-section="unused"]')
        .getAttribute('aria-expanded'),
      'true',
      'the open section survived the tab switch',
    );

    // Check again re-runs the audit without touching the document.
    await page.locator('[data-health-check-again="true"]').click();
    assert.equal(await page.locator('[data-health-row]').count(), 4);
    assert.deepEqual(await structure(), before, 'Check again is read-only');

    // Search filters across sections and auto-expands the matches.
    await page.locator('[data-health-search="true"]').fill('omega');
    assert.equal(await page.locator('[data-health-row]').count(), 1);
    assert.equal(
      await page.locator('[data-health-section="anchors"] [data-health-row]').count(),
      1,
    );
    assert.equal(await page.locator('[data-health-section-toggle="true"]').count(), 0);
    await page.locator('[data-health-search="true"]').fill('no match at all');
    assert.equal(await page.locator('[data-health-empty-search="true"]').count(), 1);
    await page.locator('[data-health-search="true"]').fill('');

    // Tree keyboard: Up/Down move, Enter opens, Esc closes back onto the row.
    await page.locator('[data-health-row="anchor:dh-broken-anchor"] [data-health-row-button="true"]').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('data-health-key')),
      'anchor:dh-ambiguous-anchor',
    );
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-health-dialog="true"][data-health-row="anchor:dh-ambiguous-anchor"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-health-key') === 'anchor:dh-ambiguous-anchor',
      undefined,
      { timeout: 5000 },
    );

    // Selecting a row survives opening another section and reopening the modal.
    await clickHealthRow('anchor:dh-broken-anchor');
    await closeModal();
    await page.locator('[data-health-section-toggle="true"][data-health-section="unused"]').click();
    await page.waitForFunction(
      () => document.querySelector('[data-health-row="anchor:dh-broken-anchor"] [data-selected="true"]') !== null,
      undefined,
      { timeout: 5000 },
    );
  });

  it('previews a candidate, confirms one undoable repair, closes, and keeps the selection valid', async () => {
    await launch(isolated('candidates'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();

    const ids = {
      source: 'dh-cand-source',
      targetA: 'dh-cand-target-a',
      targetB: 'dh-cand-target-b',
      anchor: 'dh-cand-anchor',
    };
    await addTopLevelBlock(ui, ids.source, textDoc('dup dup'));
    await addTopLevelBlock(ui, ids.targetA, textDoc('First target'));
    await addTopLevelBlock(ui, ids.targetB, textDoc('Second target'));
    await addAnchor(ui, {
      anchorId: ids.anchor,
      blockId: ids.source,
      kind: 'text',
      selector: { kind: 'text', quote: 'dup', occurrenceHint: 1 },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 3 }] },
    });
    await addBranch(ui, {
      sourceBlockId: ids.source,
      sourceAnchorId: ids.anchor,
      targetBlockId: ids.targetA,
    });
    await addBranch(ui, {
      sourceBlockId: ids.source,
      sourceAnchorId: ids.anchor,
      targetBlockId: ids.targetB,
      role: 'reference',
    });
    await applyCommand({
      type: 'block.editContent',
      blockId: ids.source,
      content: textDoc('dup dup'),
    });
    await waitForBadge(1);
    await page.locator('[data-sidebar-tab="health"]').click();
    await page.waitForSelector('[data-sidebar-panel="health"]');

    const before = await structure();
    await clickHealthRow(`anchor:${ids.anchor}`);
    const dialog = page.locator('[data-health-dialog="true"]');
    assert.equal(
      await page.locator('.nf-dialog-modal-repair').evaluate((element) =>
        Math.round(element.getBoundingClientRect().width),
      ),
      520,
      'the repair modal is 520 px wide',
    );
    assert.equal(
      (await dialog.locator('.nf-health-kicker').textContent()).trim(),
      'Document health',
    );
    assert.equal(
      (await dialog.locator('.nf-health-dialog-title').innerText()).trim(),
      'Ambiguous anchor',
    );
    assert.equal(
      await dialog.locator('[data-health-severity-label]').getAttribute('data-health-severity-label'),
      'Needs repair',
    );
    assert.match((await dialog.innerText()) ?? '', /Text anchor/);
    assert.match((await dialog.innerText()) ?? '', /“dup”/);
    assert.match((await dialog.innerText()) ?? '', /First target|Second target/);
    assert.equal(await dialog.locator('[data-health-candidate]').count(), 2);
    assert.equal(
      await dialog.locator('[data-health-action="preview-repair"]').isDisabled(),
      true,
      'a candidate must be chosen first',
    );
    assert.equal(await dialog.locator('[data-health-action="relink"]').count(), 1);
    assert.equal(await dialog.locator('[data-health-action="attach"]').count(), 1);
    assert.equal(await dialog.locator('[data-health-action="keep"]').count(), 1);
    assert.equal(await dialog.locator('[data-health-action="delete-anchor"]').count(), 1);
    assert.equal(await dialog.locator('[data-health-action="show-in-note"]').count(), 1);
    await h.screenshot(artifactsPath('document-health', 'modal-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await dialog.locator('[data-health-candidate="1"]').click();
    assert.equal(
      await dialog.locator('[data-health-candidate="1"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.deepEqual(await structure(), before, 'choosing a candidate mutates nothing');
    await dialog.locator('[data-health-action="preview-repair"]').click();
    await page.waitForSelector('[data-health-preview="true"]');
    const previewText = (await page.locator('[data-health-preview="true"]').textContent()) ?? '';
    assert.match(previewText, /Before/);
    assert.match(previewText, /After/);
    assert.match(previewText, /one undoable repair/);
    assert.match(previewText, /occurrence 2/);
    assert.equal(
      await page.locator('[data-health-preview-branch]').count(),
      2,
      'both branches are named in the preview',
    );
    assert.equal(
      await page.locator(`[data-health-preview-target="${ids.targetA}"]`).count(),
      1,
    );
    assert.equal(
      await page.locator(`[data-health-preview-target="${ids.targetB}"]`).count(),
      1,
    );
    assert.deepEqual(await structure(), before, 'the preview mutates nothing');
    await h.screenshot(artifactsPath('document-health', 'confirm-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Back returns to the issue; the candidate choice survives.
    await page.locator('[data-health-preview-back="true"]').click();
    await page.waitForSelector('[data-health-preview="true"]', { state: 'detached' });
    assert.equal(
      await dialog.locator('[data-health-candidate="1"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.deepEqual(await structure(), before, 'Back changes nothing');

    // Esc stack: confirm → issue → close, and focus returns to the row.
    await dialog.locator('[data-health-action="preview-repair"]').click();
    await page.waitForSelector('[data-health-preview="true"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-health-preview="true"]', { state: 'detached' });
    assert.equal(await dialog.count(), 1, 'the first Esc only leaves the confirm stage');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    await page.waitForFunction(
      (expected) => document.activeElement?.getAttribute('data-health-key') === expected,
      `anchor:${ids.anchor}`,
      { timeout: 5000 },
    );

    // Confirm applies one undoable command, closes, removes the row, toasts Undo.
    await clickHealthRow(`anchor:${ids.anchor}`);
    await dialog.locator('[data-health-candidate="1"]').click();
    await dialog.locator('[data-health-action="preview-repair"]').click();
    await page.waitForSelector('[data-health-preview="true"]');
    await page.locator('[data-health-preview-confirm="true"]').click();
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    await page.waitForFunction(
      (anchorId) => {
        const current = window.__noteforestTest.structure();
        return current?.anchors?.[anchorId]?.selector?.occurrenceHint === 2;
      },
      ids.anchor,
      { timeout: 10000 },
    );
    assert.equal(
      await page.locator(`[data-health-row="anchor:${ids.anchor}"]`).count(),
      0,
      'the repaired row leaves the list',
    );
    const toast = page.locator('[data-sonner-toast]', { hasText: 'Anchor candidate applied.' });
    await toast.waitFor({ timeout: 10000 });
    assert.equal(
      await toast.getByRole('button', { name: 'Undo' }).count(),
      1,
      'the toast carries Undo',
    );
    await waitForBadge(0);
    const repaired = await structure();
    const repairedBranch = Object.values(repaired.branches).find(
      (branch) => branch.source.anchorId === ids.anchor,
    );
    assert.equal(repairedBranch?.targetBlockId, ids.targetA, 'the branch ID and target survive');
    assert.ok(repaired.blocks[ids.targetA] !== undefined);
    assert.ok(repaired.blocks[ids.targetB] !== undefined);
    const sidebarState = await page.evaluate(() => window.__noteforestTest.state());
    if (sidebarState.healthSelectedRowId !== null) {
      assert.equal(
        await page.locator(`[data-health-row="${sidebarState.healthSelectedRowId}"]`).count(),
        1,
        'the kept selection is still a rendered row',
      );
    }

    await page.keyboard.press('Meta+z');
    await waitForBadge(1);
    await page.waitForFunction(
      (anchorId) => {
        const current = window.__noteforestTest.structure();
        return current?.anchors?.[anchorId]?.selector?.occurrenceHint === 1;
      },
      ids.anchor,
      { timeout: 10000 },
    );
    assert.equal(
      await page.locator(`[data-health-row="anchor:${ids.anchor}"]`).count(),
      1,
      'one undo restores the row',
    );
  });

  it('keeps the v1 fixes for unused anchors, unlinked marks, and structure rows', async () => {
    await launch(isolated('actions'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();

    const ids = {
      idleSource: 'dh-idle-source',
      idleTarget: 'dh-idle-target',
      idleAnchor: 'dh-idle-anchor',
      markSource: 'dh-mark-source',
      emptyChapter: 'dh-empty-chapter',
    };
    await addTopLevelBlock(ui, ids.idleSource, textDoc('Idle anchor text'));
    await addTopLevelBlock(ui, ids.idleTarget, textDoc('Reference target'));
    await addAnchor(ui, {
      anchorId: ids.idleAnchor,
      blockId: ids.idleSource,
      kind: 'text',
      selector: { kind: 'text', quote: 'Idle' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 4 }] },
    });
    await addTopLevelBlock(
      ui,
      ids.markSource,
      markedDoc(['An ', { text: 'orphanword', anchorIds: ['dh-mark-reference'] }, ' here']),
    );
    await applyCommand({
      type: 'chapter.create',
      chapterId: ids.emptyChapter,
      title: 'Empty chapter',
    });
    await waitForInfoChip({ idle: 1, orphans: 1, structure: 1 });
    await waitForBadge(1);

    // Unused anchor: add a branch (primary disabled until a target is chosen).
    await page.locator('[data-sidebar-tab="health"]').click();
    await page.waitForSelector('[data-sidebar-panel="health"]');
    await page.locator('[data-health-section-toggle="true"][data-health-section="unused"]').click();
    await clickHealthRow(`anchor:${ids.idleAnchor}`);
    const dialog = page.locator('[data-health-dialog="true"]');
    assert.equal(await dialog.locator('[data-health-action="add-branch"]').isDisabled(), true);
    assert.equal(await dialog.locator('[data-health-action="remove-anchor"]').count(), 1);
    assert.match((await dialog.innerText()) ?? '', /This anchor has no branches\./);
    await dialog.locator('[data-health-branch-target="true"]').selectOption(ids.idleTarget);
    await dialog.locator('[data-health-action="add-branch"]').click();
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    await page.waitForFunction(
      (anchorId) => {
        const current = window.__noteforestTest.structure();
        return Object.values(current?.branches ?? {}).some(
          (branch) => branch.source.anchorId === anchorId,
        );
      },
      ids.idleAnchor,
      { timeout: 10000 },
    );
    const withBranch = await structure();
    const created = Object.values(withBranch.branches).find(
      (branch) => branch.source.anchorId === ids.idleAnchor,
    );
    assert.equal(created?.role, 'reference');
    assert.equal(created?.targetBlockId, ids.idleTarget);
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (anchorId) => {
        const current = window.__noteforestTest.structure();
        return Object.values(current?.branches ?? {}).every(
          (branch) => branch.source.anchorId !== anchorId,
        );
      },
      ids.idleAnchor,
      { timeout: 10000 },
    );

    // Remove the unused anchor itself: one command, target kept, one undo.
    await ui.showHealth();
    await ensureSection('unused');
    await clickHealthRow(`anchor:${ids.idleAnchor}`);
    await page.locator('[data-health-dialog="true"] [data-health-action="remove-anchor"]').click();
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    await page.waitForFunction(
      (anchorId) => window.__noteforestTest.structure()?.anchors?.[anchorId] === undefined,
      ids.idleAnchor,
      { timeout: 10000 },
    );
    assert.ok((await structure()).blocks[ids.idleTarget] !== undefined, 'the target is kept');
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (anchorId) => window.__noteforestTest.structure()?.anchors?.[anchorId] !== undefined,
      ids.idleAnchor,
      { timeout: 10000 },
    );

    // Unlinked mark: remove the mark, then recreate it from a real selection.
    await ensureSection('anchors');
    await clickHealthRow('orphan-reference:dh-mark-reference:dh-mark-source');
    assert.equal(
      await page.locator('[data-health-dialog="true"] [data-health-action="recreate-link"]').count(),
      1,
    );
    assert.equal(
      await page.locator('[data-health-dialog="true"] [data-health-action="remove-mark"]').count(),
      1,
    );
    // A rejected command keeps the modal open with the reason inside it: there is
    // no editor selection in the anchor's block yet.
    await page.locator('[data-health-dialog="true"] [data-health-action="recreate-link"]').click();
    await page.waitForSelector('[data-health-dialog="true"] [data-health-error="true"]');
    assert.match(
      await page.locator('[data-health-dialog="true"] [data-health-error="true"]').innerText(),
      /Select text or a formula|Select the replacement range/,
    );
    assert.equal(
      await page.locator('[data-health-dialog="true"]').count(),
      1,
      'the rejected command does not close the modal',
    );
    await page.locator('[data-health-dialog="true"] [data-health-action="remove-mark"]').click();
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    await page.waitForFunction(
      ({ blockId, anchorId }) => {
        const current = window.__noteforestTest.structure();
        return JSON.stringify(current?.blocks?.[blockId]?.content ?? {}).includes(anchorId) === false;
      },
      { blockId: ids.markSource, anchorId: 'dh-mark-reference' },
      { timeout: 10000 },
    );
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      ({ blockId, anchorId }) => {
        const current = window.__noteforestTest.structure();
        return JSON.stringify(current?.blocks?.[blockId]?.content ?? {}).includes(anchorId) === true;
      },
      { blockId: ids.markSource, anchorId: 'dh-mark-reference' },
      { timeout: 10000 },
    );

    const prose = page
      .locator(`[data-block-card="${ids.markSource}"] .nf-block-prose p`)
      .first();
    await prose.click({ position: { x: 2, y: 8 } });
    await page.keyboard.press('Home');
    for (let index = 0; index < 3; index += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.down('Shift');
    for (let index = 0; index < 'orphanword'.length; index += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(() => window.getSelection()?.toString() ?? ''), 'orphanword');
    await ui.showHealth();
    await clickHealthRow('orphan-reference:dh-mark-reference:dh-mark-source');
    await page.locator('[data-health-dialog="true"] [data-health-action="recreate-link"]').click();
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    await page.waitForFunction(
      (anchorId) => window.__noteforestTest.structure()?.anchors?.[anchorId] !== undefined,
      'dh-mark-reference',
      { timeout: 10000 },
    );
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (anchorId) => window.__noteforestTest.structure()?.anchors?.[anchorId] === undefined,
      'dh-mark-reference',
      { timeout: 10000 },
    );

    // Empty chapter: add a block, undo, then delete the chapter with its confirm.
    await ui.showHealth();
    await ensureSection('structure');
    await clickHealthRow(`chapter:${ids.emptyChapter}`);
    assert.equal(
      await page.locator('[data-health-dialog="true"] [data-health-action="add-block"]').count(),
      1,
    );
    assert.equal(
      await page.locator('[data-health-dialog="true"] [data-health-action="delete-chapter"]').count(),
      1,
    );
    await page.locator('[data-health-dialog="true"] [data-health-action="add-block"]').click();
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    await page.waitForFunction(
      (chapterId) => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
        return runtime?.chapterList.find((chapter) => chapter.id === chapterId)?.blocks === 1;
      },
      ids.emptyChapter,
      { timeout: 10000 },
    );
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (chapterId) => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
        return runtime?.chapterList.find((chapter) => chapter.id === chapterId)?.blocks === 0;
      },
      ids.emptyChapter,
      { timeout: 10000 },
    );
    await ui.showHealth();
    await clickHealthRow(`chapter:${ids.emptyChapter}`);
    await page
      .locator('[data-health-dialog="true"] [data-health-action="delete-chapter"]')
      .click();
    await page.waitForSelector('[data-health-confirm="delete-chapter"]');
    await page.locator('[data-health-confirm-action="delete-chapter"]').click();
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    await page.waitForFunction(
      (chapterId) => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
        return !runtime?.chapterList.some((chapter) => chapter.id === chapterId);
      },
      ids.emptyChapter,
      { timeout: 10000 },
    );
  });

  it('shows all-clear and no-document states, hides the badge at zero, and opens from the palette', async () => {
    await launch(isolated('states'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();

    await page.locator('[data-sidebar-tab="health"]').click();
    await page.waitForSelector('[data-sidebar-panel="health"]');
    assert.equal(await page.locator('[data-health-badge]').count(), 0, 'badge hidden at zero');
    assert.equal(await page.locator('[data-health-summary]').count(), 0);
    assert.equal(
      (await page.locator('[data-health-empty="true"] p').first().innerText()).trim(),
      'No issues found',
    );
    assert.match(
      await page.locator('[data-health-empty-info="true"]').innerText(),
      /0 idle · 0 orphans · 0 structure · 0 hidden/,
    );
    await h.screenshot(artifactsPath('document-health', 'all-clear-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await h.screenshot(artifactsPath('document-health', 'badge-zero-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // The palette opens the section, never a modal; a known anchor opens its modal.
    await ui.showLibrary();
    await openHealthFromPalette();
    assert.equal(await page.locator('[data-sidebar-panel="health"]').count(), 1);
    assert.equal(await page.locator('[data-health-dialog="true"]').count(), 0);
    assert.equal(
      await page.locator('[data-health-section-toggle="true"][data-health-section="anchors"]')
        .count(),
      0,
      'an empty report has no sections',
    );

    // A broken anchor: the status chip opens its first repair row, the block chip
    // opens exactly that anchor.
    const ids = { source: 'dh-state-source', target: 'dh-state-target', anchor: 'dh-state-anchor' };
    await addTopLevelBlock(ui, ids.source, textDoc('Delta omega'));
    await addTopLevelBlock(ui, ids.target, textDoc('Broken target'));
    await addAnchor(ui, {
      anchorId: ids.anchor,
      blockId: ids.source,
      kind: 'text',
      selector: { kind: 'text', quote: 'missingword' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 5 }] },
    });
    await addBranch(ui, {
      sourceBlockId: ids.source,
      sourceAnchorId: ids.anchor,
      targetBlockId: ids.target,
    });
    await applyCommand({
      type: 'block.editContent',
      blockId: ids.source,
      content: textDoc('Delta omega'),
    });
    await waitForBadge(1);
    assert.equal(
      await page.locator('[data-health-badge]').getAttribute('aria-label'),
      '1 anchor needs repair',
    );
    await page.locator('[data-anchor-health-chip]').scrollIntoViewIfNeeded();
    await page.locator('[data-anchor-health-chip]').click();
    await page.waitForSelector(`[data-health-dialog="true"][data-health-row="anchor:${ids.anchor}"]`);
    await closeModal();
    assert.equal(
      await page.evaluate(() => window.__noteforestTest.state().sidebarTab),
      'health',
      'the status chip opens the Health section',
    );
    await page.locator(`[data-anchor-warning="${ids.anchor}"]`).click();
    await page.waitForSelector(`[data-health-dialog="true"][data-health-row="anchor:${ids.anchor}"]`);
    await closeModal();

    const activeTab = await page.evaluate(() => window.__noteforestTest.state().activeTab);
    await page.evaluate((path) => window.__noteforestTest.closePath(path), activeTab);
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs.length === 0,
      undefined,
      { timeout: 10000 },
    );
    await ui.showHealth();
    assert.equal(
      (await page.locator('[data-health-no-document="true"]').innerText()).trim(),
      'Open a document to check its anchors.',
    );
    assert.equal(await page.locator('[data-health-badge]').count(), 0);
    await h.screenshot(artifactsPath('document-health', 'no-document-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // The Health section persists across a relaunch (session file).
    await h.flushSession();
    await h.quit();
    page = await ui.launch(isolated('states'));
    await h.setWindowSize(1440, 900);
    await page.waitForSelector('[data-sidebar-tab="health"][aria-selected="true"]');
    assert.equal(await page.locator('[data-sidebar-panel="health"]').count(), 1);
  });

  it('keeps Read mode, Page locate, and the reset on undo correct', async () => {
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
    await applyCommand({
      type: 'chapter.create',
      chapterId: 'dh-page-empty-chapter',
      title: 'Empty chapter',
    });
    await applyCommand({
      type: 'anchor.create',
      anchorId: 'dh-page-broken',
      blockId: 'b2',
      kind: 'text',
      selector: { kind: 'text', quote: 'A short' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 7 }] },
    });
    await applyCommand({
      type: 'branch.create',
      sourceBlockId: 'b2',
      sourceAnchorId: 'dh-page-broken',
      targetBlockId: 'b4',
    });
    await applyCommand({
      type: 'block.editContent',
      blockId: 'b2',
      content: textDoc('Rewritten block'),
    });
    await waitForBadge(1);

    await page.locator('[data-sidebar-tab="health"]').click();
    await page.waitForSelector('[data-sidebar-panel="health"]');
    const before = await structure();

    // Read mode keeps the modal visible and disables every mutation.
    await ui.ensureInteractionMode('read');
    await clickHealthRow('anchor:dh-page-broken');
    assert.equal(await page.locator('[data-health-read-only="true"]').count(), 1);
    assert.equal(await page.locator('[data-health-action="attach"]').isDisabled(), true);
    assert.equal(await page.locator('[data-health-action="delete-anchor"]').isDisabled(), true);
    assert.equal(await page.locator('[data-health-action="keep"]').isEnabled(), true);
    assert.equal(await page.locator('[data-health-action="show-in-note"]').isEnabled(), true);
    assert.deepEqual(await structure(), before, 'Read mode opening and reviewing mutates nothing');
    await h.screenshot(artifactsPath('document-health', 'read-only-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await page.locator('[data-health-action="show-in-note"]').click();
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    await selectedBlock('b2');
    await ui.ensureInteractionMode('edit');

    // Page: Show in note goes to the containing page and never changes layout.
    await page.keyboard.press('Meta+3');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
    await page.waitForFunction(
      () =>
        document.querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-ready') === 'true',
      undefined,
      { timeout: 20000 },
    );
    assert.equal(await activePageNumber(), 1);
    await ui.showHealth();
    await ensureSection('unused');
    await clickHealthRow('anchor:dh-page-anchor');
    await page.locator('[data-health-action="show-in-note"]').click();
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    await page.waitForFunction(
      () =>
        document.querySelector(
          '.nf-editor[data-active="true"] .nf-page-view [data-fragment-block="b16"]',
        ) !== null,
      undefined,
      { timeout: 20000 },
    );
    const containingPage = await activePageNumber();
    assert.ok(containingPage > 1, `Show in note jumped to page ${containingPage}`);
    const view = await page.evaluate(
      (path) => window.__noteforestTest.viewState()[path],
      packagePath,
    );
    assert.equal(view.currentPage, containingPage);
    assert.equal(view.layout, 'page', 'Show in note never changes the layout');
  });
});
