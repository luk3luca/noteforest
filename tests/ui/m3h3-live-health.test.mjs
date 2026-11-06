import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addAnchor, addBranch, addTopLevelBlock, textDoc } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3h3-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const {
  isolated,
  applyCommand,
  structure,
  seedDemo,
  waitForHealthChip,
  openAnchorHealthFromChip,
  openAnchorHealthFromWarning,
} = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

const ids = {
  live: {
    source: 'm3h3-live-source',
    target: 'm3h3-live-target',
    anchor: 'm3h3-live-anchor',
    branch: 'm3h3-live-branch',
  },
  idle: {
    source: 'm3h3-idle-source',
    target: 'm3h3-idle-target',
    anchor: 'm3h3-idle-anchor',
    branch: 'm3h3-idle-branch',
  },
  broken: {
    source: 'm3h3-broken-source',
    target: 'm3h3-broken-target',
    anchor: 'm3h3-broken-anchor',
    branch: 'm3h3-broken-branch',
  },
};

async function pressTabUntilDataAttribute(attribute, value, max = 12) {
  for (let index = 0; index < max; index += 1) {
    const current = await page.evaluate((name) => {
      const active = document.activeElement;
      return active instanceof HTMLElement ? active.getAttribute(name) : null;
    }, attribute);
    if (current === value) return;
    await page.keyboard.press('Tab');
  }
  assert.fail(`keyboard focus never reached ${attribute}="${value}"`);
}

describe('M3h3 live anchor health and idle removal', () => {
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

  it('marks a deleted text anchor broken live, repairs, and clears on undo/redo', async () => {
    await launch(isolated('live'));
    await h.setWindowSize(1440, 900);
    await seedDemo();

    await addTopLevelBlock(ui, ids.live.source, textDoc('Alpha symmetric beta'));
    await addTopLevelBlock(ui, ids.live.target, textDoc('Live target'));
    await addAnchor(ui, {
      anchorId: ids.live.anchor,
      blockId: ids.live.source,
      kind: 'text',
      selector: { kind: 'text', quote: 'symmetric' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 6, end: 15 }] },
    });
    await addBranch(ui, {
      branchId: ids.live.branch,
      sourceBlockId: ids.live.source,
      sourceAnchorId: ids.live.anchor,
      targetBlockId: ids.live.target,
    });
    await h.waitLayout({ blocks: 9, arrows: 4 });

    const sourceCard = page.locator(`[data-block-card="${ids.live.source}"]`);
    await page.locator(`[data-callout-row="true"][data-anchor-id="${ids.live.anchor}"]`).waitFor();
    assert.equal(await page.locator(`[data-anchor-warning="${ids.live.anchor}"]`).count(), 0);
    assert.equal(await sourceCard.locator('.nf-callout-state').count(), 0);

    // Delete the anchored word through the real editor, not a structural
    // command. Wait only for the live warning: no click or forced render.
    const prose = sourceCard.locator('.nf-block-prose p').first();
    await prose.click({ position: { x: 2, y: 8 } });
    await page.keyboard.press('Home');
    for (let index = 0; index < 6; index += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.down('Shift');
    for (let index = 0; index < 9; index += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page
      .locator('[data-testid="selection-toolbar"]')
      .waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(
      await page.evaluate(() => window.getSelection()?.toString() ?? ''),
      'symmetric',
    );
    await page.keyboard.press('Backspace');

    const warning = page.locator(`[data-anchor-warning="${ids.live.anchor}"]`);
    await warning.waitFor({ state: 'visible', timeout: 10000 });
    await page
      .locator(
        `[data-callout-row="true"][data-anchor-id="${ids.live.anchor}"] .nf-callout-state[data-anchor-state="broken"]`,
      )
      .waitFor({ timeout: 10000 });
    await waitForHealthChip(1, 0);
    assert.equal((await warning.textContent())?.trim(), 'Lost anchor');
    assert.equal(await warning.getAttribute('data-anchor-state'), 'broken');

    const broken = await structure();
    assert.ok(broken.blocks[ids.live.target] !== undefined, 'the target still exists');
    assert.equal(
      broken.branches[ids.live.branch]?.source.anchorId,
      ids.live.anchor,
      'the branch stays anchored',
    );
    assert.equal(
      JSON.stringify(broken.blocks[ids.live.source].content).includes('symmetric'),
      false,
      'the anchored text is gone from canonical content',
    );

    await sourceCard.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await h.waitLayout({ blocks: 9, arrows: 4 });
    await mkdir(artifactsPath('m3h3'), { recursive: true });
    await h.screenshot(artifactsPath('m3h3', 'live-broken-warning-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await openAnchorHealthFromWarning(ids.live.anchor);
    const detail = (await page.locator(`[data-health-detail="${ids.live.anchor}"]`).textContent()) ?? '';
    assert.match(detail, /Lost anchor/);
    assert.match(detail, /symmetric/);
    assert.match(detail, /Live target/);
    await h.screenshot(artifactsPath('m3h3', 'live-broken-repair-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await waitForHealthChip(1, 0);

    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (anchorId) => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const card = scope?.querySelector('[data-block-card="m3h3-live-source"]');
        return (
          card !== null &&
          card !== undefined &&
          card.textContent?.includes('symmetric') === true &&
          card.querySelector(`[data-anchor-warning="${anchorId}"]`) === null
        );
      },
      ids.live.anchor,
      { timeout: 10000 },
    );
    await waitForHealthChip(0, 0);
    assert.equal(
      await page
        .locator(
          `[data-callout-row="true"][data-anchor-id="${ids.live.anchor}"] .nf-callout-state`,
        )
        .count(),
      0,
      'undo clears the callout warning too',
    );
    const undone = await structure();
    assert.equal(
      JSON.stringify(undone.blocks[ids.live.source].content).includes('"symmetric"'),
      true,
    );
    assert.deepEqual(undone.anchors[ids.live.anchor], broken.anchors[ids.live.anchor]);
    assert.deepEqual(undone.branches[ids.live.branch], broken.branches[ids.live.branch]);

    await page.keyboard.press('Meta+Shift+z');
    await warning.waitFor({ state: 'visible', timeout: 10000 });
    await waitForHealthChip(1, 0);
    await page
      .locator(
        `[data-callout-row="true"][data-anchor-id="${ids.live.anchor}"] .nf-callout-state[data-anchor-state="broken"]`,
      )
      .waitFor({ timeout: 10000 });
    const redone = await structure();
    assert.ok(redone.blocks[ids.live.target] !== undefined);
    assert.equal(redone.branches[ids.live.branch]?.source.anchorId, ids.live.anchor);
  });

  it('removes an idle anchor from All anchors by keyboard, with one exact undo', async () => {
    await launch(isolated('idle'));
    await h.setWindowSize(1440, 900);
    await seedDemo();

    await addTopLevelBlock(ui, ids.idle.source, textDoc('Alpha symmetric beta'));
    await addTopLevelBlock(ui, ids.idle.target, textDoc('Idle target'));
    await addAnchor(ui, {
      anchorId: ids.idle.anchor,
      blockId: ids.idle.source,
      kind: 'text',
      selector: { kind: 'text', quote: 'Alpha' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 5 }] },
    });
    await addBranch(ui, {
      branchId: ids.idle.branch,
      sourceBlockId: ids.idle.source,
      sourceAnchorId: ids.idle.anchor,
      targetBlockId: ids.idle.target,
    });
    await h.waitLayout({ blocks: 9, arrows: 4 });
    await applyCommand({
      type: 'branch.delete',
      branchId: ids.idle.branch,
      targetHandling: { kind: 'promote' },
    });
    await page.waitForFunction(
      (anchorId) => {
        const current = window.__noteforestTest.structure();
        return (
          current?.anchors?.[anchorId] !== undefined &&
          Object.values(current?.branches ?? {}).every(
            (branch) => branch.source.anchorId !== anchorId,
          )
        );
      },
      ids.idle.anchor,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 9, arrows: 3 });

    const before = await structure();
    assert.ok(before.blocks[ids.idle.target] !== undefined, 'the promoted target survives');
    assert.equal(await page.locator('[data-anchor-health-chip]').count(), 0);

    // The chip is hidden when no anchor needs repair, so the palette is the
    // keyboard path to All anchors.
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.locator('.nf-palette-input').fill('Anchor health');
    await page.getByRole('option', { name: /Anchor health/ }).waitFor({ timeout: 10000 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-anchor-health="true"]');
    await page.waitForFunction(
      () => document.querySelector('[data-health-filter="all"]')?.textContent?.includes('1') === true,
      undefined,
      { timeout: 10000 },
    );

    const idleRow = page.locator(`[data-health-anchor="${ids.idle.anchor}"]`);
    await idleRow.waitFor();
    assert.equal(await idleRow.getAttribute('data-health-state'), 'idle');
    const idleText = (await idleRow.textContent()) ?? '';
    assert.match(idleText, /Idle anchor/);
    assert.match(idleText, /This anchor has no branches\./);
    assert.match(idleText, /0 branches/);
    assert.equal(await page.locator(`[data-health-repair="${ids.idle.anchor}"]`).count(), 0);
    assert.equal(await page.locator(`[data-health-remove="${ids.idle.anchor}"]`).count(), 1);

    await mkdir(artifactsPath('m3h3'), { recursive: true });
    await h.screenshot(artifactsPath('m3h3', 'idle-anchor-health-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await pressTabUntilDataAttribute('data-health-remove', ids.idle.anchor);
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await page.waitForFunction(
      (anchorId) => window.__noteforestTest.structure()?.anchors?.[anchorId] === undefined,
      ids.idle.anchor,
      { timeout: 10000 },
    );

    const removed = await structure();
    assert.ok(removed.blocks[ids.idle.target] !== undefined, 'moving the anchor never deletes the target');
    assert.deepEqual(removed.branches, before.branches, 'no branch is created or deleted');
    assert.equal(
      JSON.stringify(removed.blocks[ids.idle.source].content).includes(ids.idle.anchor),
      false,
      'the content binding is gone',
    );
    assert.equal(await page.locator('[data-anchor-health-chip]').count(), 0);
    await h.screenshot(artifactsPath('m3h3', 'idle-anchor-removed-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (anchorId) => window.__noteforestTest.structure()?.anchors?.[anchorId] !== undefined,
      ids.idle.anchor,
      { timeout: 10000 },
    );
    const restored = await structure();
    assert.deepEqual(restored.anchors, before.anchors, 'one undo restores the idle anchor exactly');
    assert.deepEqual(
      restored.blocks[ids.idle.source].content,
      before.blocks[ids.idle.source].content,
      'one undo restores the exact content binding',
    );
    assert.ok(restored.blocks[ids.idle.target] !== undefined);

    // A live (broken) anchor is offered Repair, never the idle Remove path.
    await addTopLevelBlock(ui, ids.broken.source, textDoc('Delta omega'));
    await addTopLevelBlock(ui, ids.broken.target, textDoc('Broken target'));
    await addAnchor(ui, {
      anchorId: ids.broken.anchor,
      blockId: ids.broken.source,
      kind: 'text',
      selector: { kind: 'text', quote: 'missingword' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 5 }] },
    });
    await addBranch(ui, {
      branchId: ids.broken.branch,
      sourceBlockId: ids.broken.source,
      sourceAnchorId: ids.broken.anchor,
      targetBlockId: ids.broken.target,
    });
    // Remove the content binding while keeping the anchor record and branch:
    // the stored quote is gone, so the live anchor is broken and must offer
    // Repair rather than the idle Remove path.
    await applyCommand({
      type: 'block.editContent',
      blockId: ids.broken.source,
      content: textDoc('Delta omega'),
    });
    await waitForHealthChip(1, 0);
    await openAnchorHealthFromChip();
    assert.equal(await page.locator(`[data-health-remove="${ids.broken.anchor}"]`).count(), 0);
    assert.equal(await page.locator(`[data-health-repair="${ids.broken.anchor}"]`).count(), 1);
    assert.equal(await page.locator(`[data-health-remove="${ids.idle.anchor}"]`).count(), 1);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
  });
});
