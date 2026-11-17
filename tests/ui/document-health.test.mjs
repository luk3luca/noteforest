import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addAnchor, addBranch, addTopLevelBlock, textDoc } from '../support/fixtures.mjs';
import { multiPageBlocksDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * S2.1 Document health: the sidebar report and the 560 px repair modal.
 *
 * The sidebar is the report (four sections, two-line rows, one manual re-check
 * next to the search); a row opens the modal in front. The modal body is at
 * most context + problem + decision and every action lives in a footer slot:
 * Show in note · … · Close · primary. Confirm closes it, the row leaves the
 * list and the toast carries Undo. Read mode keeps the body and disables every
 * mutation.
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

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

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

/** The footer slots, left to right. */
async function footerLabels() {
  return page
    .locator('[data-health-dialog="true"] .nf-dialog-actions button')
    .evaluateAll((buttons) => buttons.map((button) => (button.textContent ?? '').trim()));
}

/** Open the footer `…` menu and return its entry ids. */
async function openFooterMenu() {
  await page.locator('[data-health-dialog="true"] [data-health-menu="true"]').click();
  await page.waitForSelector('[data-health-menu-list="true"]');
  return page
    .locator('[data-health-menu-list="true"] [role="menuitem"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-menu-entry')));
}

async function chooseFooterMenu(entry) {
  await page.locator(`[data-health-menu-list="true"] [data-menu-entry="${entry}"]`).click();
  await page.waitForSelector('[data-health-menu-list="true"]', { state: 'detached' });
}

async function waitForRefreshChecked(expected, { timeout = 10000 } = {}) {
  await page.waitForFunction(
    (value) => {
      const button = document.querySelector('[data-health-refresh]');
      if (button === null) return false;
      return (button.getAttribute('data-checked') === 'true') === value;
    },
    expected,
    { timeout },
  );
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

  it('renders four sections with zero counts, two-line rows, a manual re-check and a search', async () => {
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
    await waitForBadge(3);
    const before = await structure();

    // Health is the third section tab, not an action bridge. Breaks is the
    // fifth entry (`docs/design/manual-breaks.md` §11.3).
    assert.equal(await page.locator('[data-sidebar-tabs] [role="tab"]').count(), 5);
    assert.equal(await page.locator('[data-activity-health="true"]').count(), 0);
    const badge = page.locator('[data-health-badge]');
    assert.equal(await badge.getAttribute('data-health-badge'), '3');
    assert.equal(await badge.getAttribute('aria-label'), '3 anchors need repair');
    // S1 (docs/design/sidebar.md §8): a 6 px status dot, not a counter. The
    // number lives in the label and the tooltip; the dot carries no text.
    assert.equal(await badge.getAttribute('title'), '3 anchors need repair');
    assert.equal((await badge.textContent())?.trim(), '', 'the dot carries no text');
    const badgeStyle = await badge.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        radius: style.borderRadius,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
    assert.equal(badgeStyle.radius, '50%', 'the counter is a dot, not a square');
    assert.equal(badgeStyle.width, 6, 'the dot is 6 px wide');
    assert.equal(badgeStyle.height, 6, 'the dot is 6 px tall');
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

    // S2.1 decision 2: all four sections render, Hidden with 0 included.
    assert.deepEqual(
      await page.locator('[role="treeitem"][data-health-section]').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-health-section')),
      ),
      ['anchors', 'unused', 'structure', 'hidden'],
    );
    assert.deepEqual(
      await page
        .locator('[role="treeitem"][data-health-section] [data-health-section-count]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-health-section-count'))),
      ['3', '1', '1', '0'],
    );
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

    // Section labels use the sidebar's label pattern: uppercase 9.5.
    const labelStyle = await page
      .locator('[data-health-section-toggle="true"][data-health-section="anchors"] .nf-health-section-name')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          size: style.fontSize,
          transform: style.textTransform,
          spacing: style.letterSpacing,
        };
      });
    assert.equal(labelStyle.size, '9.5px');
    assert.equal(labelStyle.transform, 'uppercase');
    assert.notEqual(labelStyle.spacing, 'normal');

    await h.screenshot(artifactsPath('document-health', 'sidebar-zero-sections-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // An empty group says so once expanded, and the count stays 0.
    await ensureSection('hidden');
    assert.equal(
      (await page.locator('[data-health-group-empty="hidden"]').innerText()).trim(),
      'No issues in this group',
    );

    // Row = two lines at 40 px: quote, then state · block · branches.
    await ensureSection('unused');
    const idleRow = page.locator(`[data-health-row="anchor:${ids.idleAnchor}"]`);
    const idleButton = idleRow.locator('[data-health-row-button="true"]');
    assert.equal(await idleRow.getAttribute('data-health-state'), 'idle');
    assert.equal(await idleRow.getAttribute('data-health-info'), 'true');
    assert.equal(
      (await idleButton.locator('.nf-health-row-quote').innerText()).trim(),
      '“Idle”',
    );
    assert.equal(
      (await idleButton.locator('.nf-health-row-state').innerText()).trim(),
      'Anchor with no branches',
      'the approved rename replaces Idle anchor',
    );
    assert.match(
      (await idleButton.locator('.nf-health-row-block').innerText()).trim(),
      /Idle anchor word/,
      'the second line names the canvas block',
    );
    assert.equal(
      await idleButton.locator('[data-health-branch-count]').count(),
      0,
      'a zero branch count is not rendered',
    );
    // S1: a problem is the shared result card — the same anatomy as a Search
    // occurrence: 1 px outline on all four sides, radius 4, 7×8 padding, the
    // 12 px result line and the 10.5 meta line.
    const idleStyle = await idleButton.evaluate((element) => {
      const style = getComputedStyle(element);
      const quote = getComputedStyle(element.querySelector('.nf-health-row-quote'));
      const meta = getComputedStyle(element.querySelector('.nf-health-row-meta'));
      return {
        height: Math.round(element.getBoundingClientRect().height),
        card: element.classList.contains('nf-result-row'),
        borderLeft: style.borderLeftWidth,
        borderTop: style.borderTopWidth,
        radius: style.borderTopLeftRadius,
        padding: `${style.paddingTop} ${style.paddingRight}`,
        quote: quote.fontWeight,
        quoteSize: quote.fontSize,
        metaSize: meta.fontSize,
      };
    });
    assert.equal(idleStyle.card, true, 'Health uses the shared result card');
    assert.equal(idleStyle.borderLeft, '1px', 'the card outline, not a left accent stripe');
    assert.equal(idleStyle.borderTop, '1px');
    assert.equal(idleStyle.radius, '4px', 'the card radius, not a row radius');
    assert.equal(idleStyle.padding, '7px 8px', 'the shared card padding');
    assert.equal(idleStyle.quote, '400', 'the quote is the 12 px result line');
    assert.equal(idleStyle.quoteSize, '12px');
    assert.equal(idleStyle.metaSize, '10.5px', 'the meta line is the 10.5 meta step');
    assert.ok(
      idleStyle.height >= 40,
      `the two-line card keeps the 40 px result floor (${idleStyle.height})`,
    );

    // A row with one branch says so, in words, at the right.
    const brokenRow = page.locator(`[data-health-row="anchor:${ids.brokenAnchor}"]`);
    assert.equal(
      await brokenRow.locator('[data-health-branch-count]').getAttribute('data-health-branch-count'),
      '1',
    );
    assert.equal(
      (await brokenRow.locator('[data-health-branch-count]').innerText()).trim(),
      '1 branch',
      'the count keeps its word',
    );

    // Selection is a filled row, not a pill and not an accent stripe.
    await clickHealthRow(`anchor:${ids.idleAnchor}`);
    await closeModal();
    const selectedStyle = await page
      .locator(`[data-health-row="anchor:${ids.idleAnchor}"] [data-health-row-button="true"]`)
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, selected: element.getAttribute('data-selected') };
      });
    assert.equal(selectedStyle.selected, 'true');
    assert.notEqual(selectedStyle.background, 'rgba(0, 0, 0, 0)', 'the selected row is filled');

    // The manual re-check is the icon next to the search, and it is feedback.
    assert.equal(await page.locator('[data-health-check-again="true"]').count(), 0);
    assert.equal(await page.locator('.nf-health-section .nf-section-foot').count(), 0);
    const refresh = page.locator('[data-health-refresh="true"]');
    assert.equal(await refresh.getAttribute('aria-label'), 'Check again');
    assert.equal(await refresh.getAttribute('title'), 'Check again');
    assert.equal(
      await refresh.evaluate((element) => Math.round(element.getBoundingClientRect().width)),
      28,
    );
    await refresh.click();
    await waitForRefreshChecked(true);
    assert.equal(
      (await page.locator('[data-health-checked-status="true"]').textContent())?.trim(),
      'Checked',
      'the live region announces the re-check',
    );
    assert.deepEqual(await structure(), before, 'Check again is read-only');
    await waitForRefreshChecked(false);
    assert.equal(await page.locator('[data-health-row]').count(), 4);

    // Search filters across sections and auto-expands the matches.
    await page.locator('[data-health-search="true"]').fill('omega');
    assert.equal(await page.locator('[data-health-row]').count(), 1);
    assert.equal(
      await page.locator('[data-health-section="anchors"] [data-health-row]').count(),
      1,
    );
    assert.equal(
      await page.locator('[data-health-section-label]').count(),
      1,
      'a search renders only the matching section',
    );
    assert.equal(await page.locator('[data-health-section-toggle="true"]').count(), 0);
    await page.locator('[data-health-search="true"]').fill('no match at all');
    assert.equal(await page.locator('[data-health-empty-search="true"]').count(), 1);
    await page.locator('[data-health-search="true"]').fill('');
    assert.equal(await page.locator('[data-health-section-toggle="true"]').count(), 4);

    // Tree keyboard: Up/Down move, Enter opens, Esc closes back onto the row.
    await ensureSection('anchors');
    await page.locator(`[data-health-row="anchor:${ids.brokenAnchor}"] [data-health-row-button="true"]`).focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('data-health-key')),
      `anchor:${ids.ambiguousAnchor}`,
    );
    await page.keyboard.press('Enter');
    await page.waitForSelector(
      `[data-health-dialog="true"][data-health-row="anchor:${ids.ambiguousAnchor}"]`,
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    await page.waitForFunction(
      (expected) => document.activeElement?.getAttribute('data-health-key') === expected,
      `anchor:${ids.ambiguousAnchor}`,
      { timeout: 5000 },
    );

    // Selecting a row survives opening another section and reopening the modal.
    await clickHealthRow(`anchor:${ids.brokenAnchor}`);
    await closeModal();
    await ensureSection('unused');
    await page.waitForFunction(
      (rowId) =>
        document.querySelector(`[data-health-row="${rowId}"] [data-selected="true"]`) !== null,
      `anchor:${ids.brokenAnchor}`,
      { timeout: 5000 },
    );
  });

  it('repairs an ambiguous anchor from the footer: candidates, Preview repair, Back, Confirm repair', async () => {
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
      560,
      'the repair modal is 560 px wide',
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
    const issueBody = (await dialog.locator('.nf-dialog-body').innerText()) ?? '';
    assert.match(issueBody, /“dup”/);
    assert.match(issueBody, /This text appears twice\./);
    assert.match(issueBody, /First target|Second target/);
    // Never in the body: internal data and the retired reference sections.
    assert.doesNotMatch(issueBody, /Text anchor/);
    assert.doesNotMatch(issueBody, /Stale bindings/);
    assert.doesNotMatch(issueBody, /node \d/);
    assert.doesNotMatch(issueBody, UUID);
    assert.doesNotMatch(issueBody, new RegExp(ids.anchor));
    // No action row in the body: every action is a footer slot. The one
    // exception is the quiet per-branch removal on a branch row.
    assert.equal(
      await dialog
        .locator('.nf-dialog-body button[data-health-action]:not(.nf-health-branch-remove)')
        .count(),
      0,
      'the body carries no action buttons',
    );
    assert.equal(
      await dialog.locator('.nf-dialog-body .nf-health-branch-remove').count(),
      2,
      'each branch row keeps its quiet removal',
    );
    assert.deepEqual(await footerLabels(), ['Show in note', '…', 'Close', 'Preview repair']);
    assert.equal(await dialog.locator('[data-health-candidate]').count(), 2);
    assert.equal(
      await dialog.locator('[data-health-action="preview-repair"]').isDisabled(),
      true,
      'a candidate must be chosen first',
    );
    await h.screenshot(artifactsPath('document-health', 'modal-ambiguous-anchor-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // The `…` menu holds the rare and destructive actions, and Esc closes the
    // menu without closing the modal.
    assert.deepEqual(await openFooterMenu(), [
      'health-action-relink',
      'health-action-attach',
      'health-action-delete-anchor',
    ]);
    await h.screenshot(artifactsPath('document-health', 'modal-menu-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-health-menu-list="true"]', { state: 'detached' });
    assert.equal(await dialog.count(), 1, 'the first Esc only closes the menu');
    assert.deepEqual(await structure(), before, 'opening the menu mutates nothing');

    await dialog.locator('[data-health-candidate="1"]').click();
    assert.equal(
      await dialog.locator('[data-health-candidate="1"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.deepEqual(await structure(), before, 'choosing a candidate mutates nothing');
    await dialog.locator('[data-health-action="preview-repair"]').click();
    await page.waitForSelector('[data-health-preview="true"]');
    const preview = page.locator('[data-health-preview="true"]');
    const previewText = (await preview.textContent()) ?? '';
    assert.match(previewText, /Before/);
    assert.match(previewText, /After/);
    assert.match(previewText, /occurrence 2/);
    assert.match(
      previewText,
      /What changes: the anchor binding\. What stays: the branch, its target, the block\. One undo entry\./,
    );
    assert.doesNotMatch(previewText, UUID, 'the confirm stage carries no IDs');
    assert.doesNotMatch(previewText, new RegExp(ids.anchor));
    assert.deepEqual(await footerLabels(), ['Back', 'Confirm repair']);
    assert.equal(
      await dialog.locator('[data-health-action="show-in-note"]').count(),
      0,
      'the confirm step has no Show in note slot',
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
    const branchIds = Object.keys(before.branches).filter(
      (id) => before.branches[id].source.anchorId === ids.anchor,
    );
    assert.equal(branchIds.length, 2);
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
    for (const branchId of branchIds) {
      assert.ok(repaired.branches[branchId] !== undefined, `branch ${branchId} survives the repair`);
    }
    const repairedBranch = Object.values(repaired.branches).find(
      (branch) => branch.source.anchorId === ids.anchor,
    );
    assert.equal(repairedBranch?.targetBlockId, ids.targetA, 'the branch target survives');
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

  it('shows the four approved modals, the guidance line, and the danger-only footer', async () => {
    await launch(isolated('actions'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();

    const ids = {
      idleSource: 'dh-idle-source',
      idleTarget: 'dh-idle-target',
      idleAnchor: 'dh-idle-anchor',
      brokenSource: 'dh-broken-source',
      brokenTarget: 'dh-broken-target',
      brokenAnchor: 'dh-broken-anchor',
      markSource: 'dh-mark-source',
      unusedSource: 'dh-unused-source',
      unusedAnchor: 'dh-unused-anchor',
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
    await addTopLevelBlock(ui, ids.brokenSource, textDoc('Alpha omega beta'));
    await addTopLevelBlock(ui, ids.brokenTarget, textDoc('Broken target'));
    await addAnchor(ui, {
      anchorId: ids.brokenAnchor,
      blockId: ids.brokenSource,
      kind: 'text',
      selector: { kind: 'text', quote: 'missingword' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 11 }] },
    });
    await addBranch(ui, {
      sourceBlockId: ids.brokenSource,
      sourceAnchorId: ids.brokenAnchor,
      targetBlockId: ids.brokenTarget,
    });
    await applyCommand({
      type: 'block.editContent',
      blockId: ids.brokenSource,
      content: textDoc('Alpha omega beta'),
    });
    await addTopLevelBlock(
      ui,
      ids.markSource,
      markedDoc(['An ', { text: 'orphanword', anchorIds: ['dh-mark-reference'] }, ' here']),
    );
    // An anchor record with no content binding and no branch is an unused
    // anchor: rewriting the paragraph drops the mark, not the record.
    await addTopLevelBlock(ui, ids.unusedSource, textDoc('Plain words only'));
    await addAnchor(ui, {
      anchorId: ids.unusedAnchor,
      blockId: ids.unusedSource,
      kind: 'text',
      selector: { kind: 'text', quote: 'Plain' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 5 }] },
    });
    await applyCommand({
      type: 'block.editContent',
      blockId: ids.unusedSource,
      content: textDoc('Plain words only'),
    });
    await applyCommand({
      type: 'chapter.create',
      chapterId: ids.emptyChapter,
      title: 'Empty chapter',
    });
    await waitForInfoChip({ idle: 1, orphans: 2, structure: 1 });
    await waitForBadge(3);

    await page.locator('[data-sidebar-tab="health"]').click();
    await page.waitForSelector('[data-sidebar-panel="health"]');

    // 1 · Unlinked mark: problem + one guidance line, no `…`, one secondary slot.
    await clickHealthRow('orphan-reference:dh-mark-reference:dh-mark-source');
    let body = (await page.locator('[data-health-dialog="true"] .nf-dialog-body').innerText()) ?? '';
    assert.equal(
      (await page.locator('[data-health-dialog="true"] .nf-health-dialog-title').innerText()).trim(),
      'Unlinked mark',
    );
    assert.match(body, /The highlight has no anchor behind it\./);
    assert.match(body, /Recreate the link from a selection, or remove the mark\./);
    assert.doesNotMatch(body, /Text anchor/);
    assert.doesNotMatch(body, /node \d/);
    assert.equal(
      await page.locator('[data-health-dialog="true"] .nf-dialog-body [data-health-action]').count(),
      0,
    );
    assert.deepEqual(await footerLabels(), [
      'Show in note',
      'Remove mark',
      'Close',
      'Recreate link from selection',
    ]);
    assert.equal(await page.locator('[data-health-menu="true"]').count(), 0, 'no `…` slot here');
    await h.screenshot(artifactsPath('document-health', 'modal-unlinked-mark-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    // A rejected command keeps the modal open with the reason inside it.
    await page.locator('[data-health-action="recreate-link"]').click();
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
    await closeModal();

    // 2 · Lost anchor, no candidates: the fallback becomes the primary.
    await clickHealthRow(`anchor:${ids.brokenAnchor}`);
    body = (await page.locator('[data-health-dialog="true"] .nf-dialog-body').innerText()) ?? '';
    assert.match(body, /This text is no longer in the block\./);
    assert.doesNotMatch(body, /More than one location matches/);
    assert.match(body, /1 branch/, 'the branch line carries the count and its word');
    assert.match(body, /Broken target/);
    assert.deepEqual(await footerLabels(), [
      'Show in note',
      '…',
      'Close',
      'Link to current selection',
    ]);
    assert.equal(
      await page.locator('[data-health-dialog="true"] [data-health-action="delete-branch"]').count(),
      1,
      'the branch row keeps its quiet removal',
    );
    await h.screenshot(artifactsPath('document-health', 'modal-lost-anchor-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    assert.deepEqual(await openFooterMenu(), [
      'health-action-attach',
      'health-action-delete-anchor',
    ]);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-health-menu-list="true"]', { state: 'detached' });
    await closeModal();

    // 3 · Anchor with no branches: renamed, problem + target select only.
    // The where line shows the chapter only when it differs from the block
    // (S2.1 §5): rename the chapter to the block title and check it once.
    await applyCommand({
      type: 'chapter.rename',
      chapterId: (await structure()).chapters[0].id,
      title: 'Idle anchor text',
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"] .nf-chapter-title')
          ?.textContent?.includes('Idle anchor text') === true,
      undefined,
      { timeout: 10000 },
    );
    await ensureSection('unused');
    await clickHealthRow(`anchor:${ids.idleAnchor}`);
    const idleDialog = page.locator('[data-health-dialog="true"]');
    assert.equal(
      (await idleDialog.locator('.nf-health-dialog-title').innerText()).trim(),
      'Anchor with no branches',
      'the approved rename replaces Idle anchor',
    );
    body = (await idleDialog.locator('.nf-dialog-body').innerText()) ?? '';
    assert.equal(
      (await idleDialog.locator('[data-health-where="true"]').innerText()).trim(),
      'Idle anchor text',
      'the block · chapter line is not duplicated',
    );
    assert.match(body, /Nothing branches from this anchor\./);
    assert.doesNotMatch(body, /This anchor has no branches\./);
    assert.equal(await idleDialog.locator('[data-health-branch-target="true"]').count(), 1);
    assert.deepEqual(await footerLabels(), ['Show in note', '…', 'Close', 'Add a branch…']);
    assert.equal(await idleDialog.locator('[data-health-action="add-branch"]').isDisabled(), true);
    await h.screenshot(
      artifactsPath('document-health', 'modal-anchor-with-no-branches-1440x900.png'),
      { width: 1440, height: 900 },
    );
    assert.deepEqual(await openFooterMenu(), ['health-action-remove-anchor']);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-health-menu-list="true"]', { state: 'detached' });
    await closeModal();

    // 4 · Unused anchor: the only fix is destructive and stays in the footer.
    await clickHealthRow(`anchor:${ids.unusedAnchor}`);
    const unusedDialog = page.locator('[data-health-dialog="true"]');
    assert.equal(
      (await unusedDialog.locator('.nf-health-dialog-title').innerText()).trim(),
      'Unused anchor',
    );
    body = (await unusedDialog.locator('.nf-dialog-body').innerText()) ?? '';
    assert.match(body, /This anchor is not attached to any text\./);
    assert.deepEqual(await footerLabels(), ['Show in note', 'Close', 'Delete unused anchor']);
    assert.equal(await page.locator('[data-health-menu="true"]').count(), 0);
    assert.equal(
      await unusedDialog
        .locator('[data-health-action="delete-unused"]')
        .evaluate((element) => element.classList.contains('nf-button-danger')),
      true,
      'a destructive primary keeps the danger style',
    );
    await h.screenshot(artifactsPath('document-health', 'modal-unused-anchor-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    // Confirm is Back + the action, and it never shows an ID.
    await unusedDialog.locator('[data-health-action="delete-unused"]').click();
    await page.waitForSelector('[data-health-confirm="delete-anchor"]');
    const confirmBody =
      (await page.locator('[data-health-dialog="true"] .nf-dialog-body').innerText()) ?? '';
    assert.match(
      confirmBody,
      /What changes: the unused anchor\. What stays: every block and branch\. One undo entry\./,
    );
    assert.doesNotMatch(confirmBody, UUID);
    assert.deepEqual(await footerLabels(), ['Back', 'Delete anchor']);
    await page.locator('[data-health-stage-back="true"]').click();
    await page.waitForSelector('[data-health-confirm="delete-anchor"]', { state: 'detached' });
    assert.equal(await page.locator('[data-health-dialog="true"]').count(), 1, 'Back returns');
    await closeModal();

    // 5 · Empty chapter: input-free body, the destructive path behind `…`.
    await ensureSection('structure');
    await clickHealthRow(`chapter:${ids.emptyChapter}`);
    assert.equal(
      (await page.locator('[data-health-dialog="true"] .nf-health-dialog-title').innerText()).trim(),
      'Empty chapter',
    );
    assert.deepEqual(await footerLabels(), ['Show in note', '…', 'Close', 'Add block']);
    assert.deepEqual(await openFooterMenu(), ['health-action-delete-chapter']);
    await chooseFooterMenu('health-action-delete-chapter');
    await page.waitForSelector('[data-health-confirm="delete-chapter"]');
    assert.deepEqual(await footerLabels(), ['Back', 'Delete chapter']);
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

  it('renders the no-action footer for a hidden anchor', async () => {
    await launch(isolated('hidden'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();

    const ids = {
      parent: 'dh-hidden-parent',
      child: 'dh-hidden-child',
      target: 'dh-hidden-target',
      anchor: 'dh-hidden-anchor',
    };
    await addTopLevelBlock(ui, ids.parent, textDoc('Parent block'));
    await addTopLevelBlock(ui, ids.child, textDoc('Hidden child'));
    await addTopLevelBlock(ui, ids.target, textDoc('Hidden target'));
    await addAnchor(ui, {
      anchorId: ids.anchor,
      blockId: ids.child,
      kind: 'text',
      selector: { kind: 'text', quote: 'Hidden' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 6 }] },
    });
    await applyCommand({
      type: 'branch.create',
      sourceBlockId: ids.child,
      sourceAnchorId: ids.anchor,
      targetBlockId: ids.target,
      role: 'primary',
    });
    await applyCommand({
      type: 'branch.create',
      sourceBlockId: ids.parent,
      targetBlockId: ids.child,
      role: 'primary',
    });
    await page.locator('[data-sidebar-tab="health"]').click();
    await page.waitForSelector('[data-sidebar-panel="health"]');
    // A resolved anchor with a live branch is healthy, so it is not listed.
    assert.equal(
      await page.locator(`[data-health-row="anchor:${ids.anchor}"]`).count(),
      0,
      'a healthy anchor is not an issue',
    );

    // Collapsing the parent hides the marker: the row moves to Hidden and its
    // only repair frame is Show in note + Close.
    await page.locator(`[data-branch-port="${ids.parent}"]`).click();
    await page.waitForFunction(
      (parentId) =>
        document
          .querySelector(`[data-block-card="${parentId}"]`)
          ?.getAttribute('data-collapsed') === 'true',
      ids.parent,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            '[data-health-section-toggle="true"][data-health-section="hidden"] [data-health-section-count]',
          )
          ?.getAttribute('data-health-section-count') === '1',
      undefined,
      { timeout: 10000 },
    );
    await ensureSection('hidden');
    await page.waitForSelector(`[data-health-section="hidden"] [data-health-row="anchor:${ids.anchor}"]`);
    await clickHealthRow(`anchor:${ids.anchor}`);
    const dialog = page.locator('[data-health-dialog="true"]');
    assert.equal(
      (await dialog.locator('.nf-health-dialog-title').innerText()).trim(),
      'Hidden anchor',
    );
    assert.equal(
      await dialog.locator('[data-health-severity-label]').getAttribute('data-health-severity-label'),
      'Information',
    );
    assert.match(
      (await dialog.locator('.nf-dialog-body').innerText()) ?? '',
      /Its marker is hidden because a parent block is closed\./,
    );
    assert.deepEqual(await footerLabels(), ['Show in note', 'Close']);
    assert.equal(await page.locator('[data-health-menu="true"]').count(), 0);
    assert.equal(
      await dialog.locator('.nf-dialog-body button[data-health-action]').count(),
      0,
    );
    await h.screenshot(artifactsPath('document-health', 'modal-no-action-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await closeModal();
  });

  it('shows all-clear and no-document states, hides the badge at zero, and opens from the palette', async () => {
    await launch(isolated('states'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();

    await page.locator('[data-sidebar-tab="health"]').click();
    await page.waitForSelector('[data-sidebar-panel="health"]');
    assert.equal(await page.locator('[data-health-badge]').count(), 0, 'badge hidden at zero');
    // S1 (design §4): Health always shows the summary count, all-clear included.
    assert.equal(
      (await page.locator('[data-health-summary]').innerText()).trim(),
      '0 to fix · 0 issues',
    );
    assert.equal(
      (await page.locator('[data-health-empty="true"] p').first().innerText()).trim(),
      'No issues found',
    );
    assert.match(
      await page.locator('[data-health-empty-info="true"]').innerText(),
      /0 idle · 0 orphans · 0 structure · 0 hidden/,
    );
    // S2.2 (design §2): the all-clear keeps the four sections with `0` under
    // the "No issues found" line and the information counts, so the list never
    // changes shape between documents.
    assert.deepEqual(
      await page.locator('[role="treeitem"][data-health-section]').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-health-section')),
      ),
      ['anchors', 'unused', 'structure', 'hidden'],
    );
    assert.deepEqual(
      await page
        .locator('[role="treeitem"][data-health-section] [data-health-section-count]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-health-section-count'))),
      ['0', '0', '0', '0'],
    );
    assert.equal(
      (await page.locator('[data-health-group-empty="anchors"]').innerText()).trim(),
      'No issues in this group',
      'the open section is empty, not hidden',
    );
    assert.equal(await page.locator('[data-health-row]').count(), 0, 'no issue rows at zero');
    await h.screenshot(artifactsPath('document-health', 'all-clear-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await h.screenshot(artifactsPath('chrome', 'health-all-clear-1440x900.png'), {
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
      await page.locator('[data-health-section-toggle="true"]').count(),
      4,
      'the palette entry lands on the same four-section all-clear report',
    );
    assert.equal(await page.locator('[data-health-empty="true"]').count(), 1);

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

    // Read mode keeps the modal visible, keeps Show in note and Close, and
    // disables every mutation with one line of why.
    await ui.ensureInteractionMode('read');
    await clickHealthRow('anchor:dh-page-broken');
    assert.equal(await page.locator('[data-health-read-only="true"]').count(), 1);
    assert.equal(await page.locator('[data-health-action="preview-repair"]').count(), 0);
    assert.equal(await page.locator('[data-health-menu="true"]').isDisabled(), true);
    assert.equal(await page.locator('[data-health-action="show-in-note"]').isEnabled(), true);
    assert.equal(
      await page.locator('[data-health-dialog="true"] [data-health-close="true"]').last().isEnabled(),
      true,
    );
    assert.deepEqual(await footerLabels(), ['Show in note', '…', 'Close', 'Link to current selection']);
    await h.screenshot(artifactsPath('document-health', 'read-only-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    assert.deepEqual(await structure(), before, 'Read mode opening and reviewing mutates nothing');
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
    // Page mounts the visible window ±2, so b16's presence is not the signal
    // (a neighbour page can carry it at rest). The indicator is: it names the
    // page under the viewport centre after the scroll.
    await page.waitForFunction(
      () => {
        const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
        return Number(view?.getAttribute('data-current-page') ?? '1') > 1;
      },
      undefined,
      { timeout: 20000 },
    );
    const containingPage = await activePageNumber();
    assert.ok(containingPage > 1, `Show in note jumped to page ${containingPage}`);
    assert.ok(
      await page.evaluate(
        (number) =>
          document.querySelector(
            `.nf-editor[data-active="true"] .nf-page-sheet[data-page-number="${number}"] [data-fragment-block="b16"]`,
          ) !== null,
        containingPage,
      ),
      'the containing page is mounted with the block',
    );
    const view = await page.evaluate(
      (path) => window.__noteforestTest.viewState()[path],
      packagePath,
    );
    assert.equal(view.currentPage, containingPage);
    assert.equal(view.layout, 'page', 'Show in note never changes the layout');
  });
});
