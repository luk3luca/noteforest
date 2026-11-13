import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { textDoc } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3b2b-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const {
  isolated,
  applyCommand,
  structure,
  seedDemo,
  createAnchoredChild: createAnchoredChildBranch,
  createDirectChild,
} = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

async function createAnchoredChild(parentId, word, label) {
  const { blockId, anchorId } = await createAnchoredChildBranch(parentId, word);
  await applyCommand({
    type: 'block.editContent',
    blockId,
    content: textDoc(label),
  });
  await page.waitForSelector(`[data-block-card="${blockId}"]`);
  return { blockId, anchorId };
}

async function outlineAnchorSnapshot() {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('.nf-sidebar .nf-tree-anchor-row')];
    return rows.map((row) => ({
      id: row.getAttribute('data-block-id'),
      anchorId: row.getAttribute('data-anchor-id'),
      group: row.getAttribute('data-anchor-group'),
      first: row.getAttribute('data-anchor-first'),
      last: row.getAttribute('data-anchor-last'),
      selected: row.getAttribute('data-anchor-selected'),
      state: row.getAttribute('data-anchor-state'),
      branchCount: row.querySelector('[data-anchor-branch-count]')?.textContent?.trim() ?? null,
      prefix: row.querySelector('.nf-tree-anchor-prefix')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      label: row.querySelector('.nf-tree-label')?.textContent?.trim() ?? '',
      padding: getComputedStyle(row).paddingInlineStart,
      border: getComputedStyle(row).borderInlineStartWidth,
    }));
  });
}

async function waitForOutlineRows(count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('.nf-sidebar .nf-tree-anchor-row').length === expected,
    count,
    { timeout: 10000 },
  );
}

describe('NoteForest M3b2b anchored outline', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('shows anchored outline rows, cycles markers, and keeps callouts in the hidden count', async () => {
    await launch(isolated('outline'));
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const parentCard = h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Take the symmetric matrix below' })
      .first();
    const parentId = await parentCard.getAttribute('data-block-card');
    assert.equal(typeof parentId, 'string');

    const symOne = await createAnchoredChild(parentId, 'symmetric', 'Symmetric branch one');
    const symTwo = await createAnchoredChild(parentId, 'symmetric', 'Symmetric branch two');
    const eigenvalue = await createAnchoredChild(parentId, 'eigenvalues', 'Eigenvalue branch');
    assert.equal(symOne.anchorId, symTwo.anchorId, 'branching the same span reuses its anchor');
    assert.notEqual(symOne.anchorId, eigenvalue.anchorId);

    const directId = 'm3b2b-direct-child';
    await createDirectChild(parentId, directId, 'Direct child after the lane');
    await h.waitLayout({ blocks: 11, arrows: 7 });
    await waitForOutlineRows(3);

    const canonical = await structure();
    const anchoredBranches = Object.values(canonical.branches)
      .filter((branch) => branch.source.blockId === parentId && branch.source.anchorId !== undefined)
      .sort((left, right) => (left.source.anchorId < right.source.anchorId ? -1 : 1));
    assert.equal(anchoredBranches.length, 3);

    const rows = await outlineAnchorSnapshot();
    assert.deepEqual(
      rows.map((row) => row.id),
      [symOne.blockId, symTwo.blockId, eigenvalue.blockId],
      'anchored rows follow anchor start then branch order, before the direct child',
    );
    assert.deepEqual(
      rows.map((row) => row.prefix),
      ['↳ “symmetric”', '↳ “symmetric”', '↳ “eigenvalues”'],
      'rows carry the quote prefix',
    );
    assert.deepEqual(
      rows.map((row) => row.label),
      ['Symmetric branch one', 'Symmetric branch two', 'Eigenvalue branch'],
    );
    assert.deepEqual(
      rows.map((row) => row.branchCount),
      ['2', '2', null],
      'the rows from one anchor show the branch count',
    );
    assert.deepEqual(rows.map((row) => row.group), [
      symOne.anchorId,
      symOne.anchorId,
      eigenvalue.anchorId,
    ]);
    assert.deepEqual(rows.map((row) => row.first), ['true', 'false', 'true']);
    assert.deepEqual(rows.map((row) => row.last), ['false', 'true', 'true']);
    assert.ok(
      rows.every((row) => Number.parseFloat(row.border) >= 1),
      'the anchor group has a visible left rule',
    );

    const directPadding = await page.evaluate((id) => {
      const row = document.querySelector(`.nf-sidebar .nf-tree-row[data-block-id="${id}"]`);
      return getComputedStyle(row).paddingInlineStart;
    }, directId);
    assert.equal(rows[0].padding, directPadding, 'anchored rows use the direct-child indentation');

    const sourceRow = page.locator(`.nf-sidebar .nf-tree-row[data-block-id="${parentId}"]`);
    assert.equal(
      await sourceRow.locator('[data-anchor-count]').getAttribute('data-anchor-count'),
      '2',
      'the source row counts distinct anchors',
    );
    assert.equal(
      await sourceRow.locator('[data-anchor-warning-count]').count(),
      0,
      'resolved anchors show no warning chip',
    );

    // Selecting an anchored outline row focuses its target and highlights the
    // source quote/anchor.
    await page.locator(`.nf-sidebar .nf-tree-anchor-row[data-block-id="${symTwo.blockId}"]`).click();
    await page.waitForFunction(
      ({ blockId, anchorId }) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return (
          runtime?.selectedBlockId === blockId &&
          runtime?.selectedAnchor?.anchorId === anchorId &&
          runtime?.selectedAnchor?.targetBlockId === blockId
        );
      },
      { blockId: symTwo.blockId, anchorId: symOne.anchorId },
      { timeout: 10000 },
    );
    assert.equal(
      await page.locator(`[data-block-card="${parentId}"] .nf-anchor-mark[data-anchor-selected="true"]`).count(),
      1,
      'the anchor span is highlighted on the source block',
    );
    assert.equal(
      await page
        .locator(`[data-block-card="${symTwo.blockId}"] .nf-callout-quote[data-anchor-selected="true"]`)
        .count(),
      1,
      'the selected branch quote is highlighted',
    );
    assert.equal(
      await page
        .locator(`[data-block-card="${symOne.blockId}"] .nf-callout-quote[data-anchor-selected="true"]`)
        .count(),
      0,
      'sibling branches from the same anchor stay unselected',
    );

    // The anchor chip is a squared control, not a pill: selected uses the
    // accent-soft fill with an accent-strong inset border; hover uses border-2.
    const selectedChip = page.locator(
      `[data-block-card="${symTwo.blockId}"] .nf-callout-quote`,
    );
    const selectedStyle = await selectedChip.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        radius: style.borderRadius,
        background: style.backgroundColor,
        shadow: style.boxShadow,
      };
    });
    assert.equal(selectedStyle.radius, '3px', 'the chip uses the control radius');
    assert.equal(selectedStyle.background, 'rgb(38, 49, 60)', 'selected chip uses accent-soft');
    assert.match(selectedStyle.shadow, /rgb\(185, 208, 230\)/, 'selected chip has the accent-strong inset border');

    // Repro: an explicit block selection in the canvas clears the anchor even
    // when the block is the anchor's own source. Exactly one row stays selected.
    await page
      .locator(`[data-block-card="${parentId}"] .nf-block-prose`)
      .first()
      .click();
    await page.waitForFunction(
      (blockId) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return runtime?.selectedBlockId === blockId && runtime?.selectedAnchor === null;
      },
      parentId,
      { timeout: 10000 },
    );
    assert.equal(
      await page.locator('.nf-sidebar .nf-tree-anchor-row[data-anchor-selected="true"]').count(),
      0,
      'the anchor row clears when its source block is selected',
    );
    assert.equal(
      await page.locator('.nf-sidebar .nf-tree-item[data-selected]').count(),
      1,
      'exactly one block row stays selected',
    );
    assert.equal(
      await page.locator('[data-block-card] [data-anchor-selected="true"]').count(),
      0,
      'no editor anchor highlight survives the block selection',
    );

    // The same holds when the anchor's branch target is selected in the canvas.
    await page.locator(`.nf-sidebar .nf-tree-anchor-row[data-block-id="${symTwo.blockId}"]`).click();
    await page.waitForFunction(
      ({ anchorId, target }) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return runtime?.selectedAnchor?.anchorId === anchorId && runtime?.selectedAnchor?.targetBlockId === target;
      },
      { anchorId: symOne.anchorId, target: symTwo.blockId },
      { timeout: 10000 },
    );
    await page
      .locator(`[data-block-card="${symTwo.blockId}"] .nf-block-prose`)
      .first()
      .click();
    await page.waitForFunction(
      ({ blockId }) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return runtime?.selectedBlockId === blockId && runtime?.selectedAnchor === null;
      },
      { blockId: symTwo.blockId },
      { timeout: 10000 },
    );
    assert.equal(
      await page.locator('.nf-sidebar .nf-tree-anchor-row[data-anchor-selected="true"]').count(),
      0,
      'the anchor row clears when its target block is selected',
    );

    const siblingChip = page.locator(`[data-block-card="${symOne.blockId}"] .nf-callout-quote`);
    await siblingChip.hover();
    assert.equal(
      await siblingChip.evaluate((element) => getComputedStyle(element).borderColor),
      'rgb(110, 115, 122)',
      'hover promotes the boundary to border-2',
    );
    await page.mouse.move(4, 4);
    await h.screenshot(artifactsPath('m3b2b', 'anchor-chip-dark-1440x900.png'));
    const darkApp = (await page.evaluate(() => window.__noteforestTest.settings())).app;
    await page.evaluate(async (app) => {
      await window.__noteforestTest.setSettings({
        page: app.page,
        appearance: { ...app.appearance, theme: 'light' },
      });
    }, darkApp);
    await page.waitForSelector('html[data-theme="light"]');
    await h.screenshot(artifactsPath('m3b2b', 'anchor-chip-light-1440x900.png'));
    const lightApp = (await page.evaluate(() => window.__noteforestTest.settings())).app;
    await page.evaluate(async (app) => {
      await window.__noteforestTest.setSettings({
        page: app.page,
        appearance: { ...app.appearance, theme: 'dark' },
      });
    }, lightApp);
    await page.waitForSelector('html[data-theme="dark"]');

    // Collapsing the parent hides the callout lane and its subtrees, and the
    // hidden count includes the anchored children.
    const port = page.locator(`[data-branch-port="${parentId}"]`);
    assert.equal(await port.locator('.nf-port-dot').innerText(), '4');
    await port.click();
    await page.waitForFunction(
      (id) =>
        document.querySelector(`[data-block-card="${id}"]`)?.getAttribute('data-collapsed') === 'true',
      parentId,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      (id) => {
        const lane = document.querySelector(`[data-callout-lane="${id}"]`);
        return lane === null || lane.getClientRects().length === 0;
      },
      parentId,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-sidebar .nf-tree-anchor-row').length === 0,
      undefined,
      { timeout: 10000 },
    );
    assert.equal(
      await page.locator(`[data-branch-port="${parentId}"] .nf-port-dot`).innerText(),
      '4',
      'the collapsed port reports every hidden primary child',
    );

    // Navigating to a hidden callout from the palette expands ancestors and
    // focuses the block.
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.locator('.nf-palette-input').fill('Symmetric branch one');
    const paletteItem = page.locator('.nf-palette-item', { hasText: 'Symmetric branch one' }).first();
    await paletteItem.waitFor({ state: 'visible', timeout: 10000 });
    await paletteItem.click();
    await page.waitForFunction(
      ({ parent, child }) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return (
          runtime?.selectedBlockId === child && !runtime?.collapsed?.includes(parent)
        );
      },
      { parent: parentId, child: symOne.blockId },
      { timeout: 10000 },
    );
    await waitForOutlineRows(3);
    assert.ok(
      await page.locator(`[data-callout-lane="${parentId}"]`).isVisible(),
      'the callout lane is restored after expanding ancestors',
    );

    // The marker is a real button on the selected, non-editing block. Focus the
    // parent through the palette so the caret lands in its prose, then Escape
    // to the selected-but-not-editing state.
    await page.locator('.nf-sidebar-search').click();
    await page.waitForSelector('.nf-palette');
    await page.locator('.nf-palette-input').fill('Worked example');
    const parentItem = page.locator('.nf-palette-item', { hasText: 'Worked example' }).first();
    await parentItem.waitFor({ state: 'visible', timeout: 10000 });
    await parentItem.click();
    await page.waitForFunction(
      (parent) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return runtime?.selectedBlockId === parent;
      },
      parentId,
      { timeout: 10000 },
    );
    await page.keyboard.press('Escape');
    const marker = page.locator(
      `[data-block-card="${parentId}"] [data-anchor-marker-id="${symOne.anchorId}"]`,
    );
    await marker.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(
      await marker.getAttribute('aria-label'),
      'Anchor: “symmetric”, 2 branches',
      'the marker exposes an accessible label',
    );
    await marker.click();
    await page.waitForFunction(
      ({ anchorId, target }) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return runtime?.selectedAnchor?.anchorId === anchorId && runtime?.selectedAnchor?.targetBlockId === target;
      },
      { anchorId: symOne.anchorId, target: symOne.blockId },
      { timeout: 10000 },
    );
    await marker.click();
    await page.waitForFunction(
      ({ anchorId, target }) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return runtime?.selectedAnchor?.anchorId === anchorId && runtime?.selectedAnchor?.targetBlockId === target;
      },
      { anchorId: symOne.anchorId, target: symTwo.blockId },
      { timeout: 10000 },
    );

    // The callout quote chip selects the parent anchor.
    await page.locator(`[data-block-card="${symTwo.blockId}"] .nf-callout-quote`).click();
    await page.waitForFunction(
      ({ parent, anchorId }) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return (
          runtime?.selectedBlockId === parent && runtime?.selectedAnchor?.anchorId === anchorId
        );
      },
      { parent: parentId, anchorId: symOne.anchorId },
      { timeout: 10000 },
    );
    assert.equal(
      await page.locator(`[data-block-card="${parentId}"] .nf-anchor-mark[data-anchor-selected="true"]`).count(),
      1,
    );

    // Every pointer action has a menu equivalent: the block menu selects and
    // cycles anchored branches without a new global keybinding.
    await parentCard.click({ button: 'right' });
    await page
      .getByRole('menuitem', { name: 'Select anchor “symmetric”' })
      .waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(
      await page.getByRole('menuitem', { name: 'Next branch from “symmetric”' }).count(),
      1,
      'the block menu offers the branch-cycle path',
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-menu', { state: 'detached' });

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
    await parentCard.scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 11, arrows: 7 });
    await mkdir(artifactsPath('m3b2b'), { recursive: true });
    await h.screenshot(artifactsPath('m3b2b', 'anchor-outline-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Breaking the span keeps every branch and turns the source/rows into
    // warning chips; repair UX is M3e.
    await applyCommand({
      type: 'block.editContent',
      blockId: parentId,
      content: {
        type: 'doc',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'The span was rewritten without the anchored words.' }],
          },
        ],
      },
    });
    await page.waitForSelector(
      `.nf-sidebar .nf-tree-row[data-block-id="${parentId}"] [data-anchor-warning-count="2"]`,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      (count) =>
        document.querySelectorAll('.nf-callout-state[data-anchor-state="broken"]').length === count,
      3,
      { timeout: 10000 },
    );
    const brokenRows = await outlineAnchorSnapshot();
    assert.deepEqual(
      brokenRows.map((row) => row.state),
      ['broken', 'broken', 'broken'],
      'each anchored row reports the broken state',
    );
    assert.deepEqual(
      brokenRows
        .filter((row) => row.anchorId === symOne.anchorId)
        .map((row) => row.branchCount),
      ['2', '2'],
      'the two branches of a broken anchor keep their count and group',
    );
    assert.equal(
      await page.locator('.nf-callout-state[data-anchor-state="broken"]').count(),
      3,
      'the callout lane keeps all broken callouts visible',
    );
  });
});
