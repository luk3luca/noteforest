import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';

/**
 * L1 sidebar surface: Library/Outline tabs, session restore, ARIA keyboard
 * behavior, the single New note path, the Outline empty state, and the
 * product-owner no-left-accent rule. L2 library roots extend this suite.
 */

const tempRoot = artifactsPath('library-surface-temp');
const screenshotDir = artifactsPath('library-surface');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(name, overrides = {}) {
  page = await ui.launch({ ...ui.isolated(name), ...overrides });
  await h.setWindowSize(1440, 900);
}

async function sidebarState() {
  return page.evaluate(() => window.__noteforestTest.state());
}

describe('Library surface', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('shows Library by default with ARIA tabs, one New note, and a persisted Outline tab', async () => {
    const env = ui.isolated('tabs');
    await launch('tabs', env);
    await ui.seedDemo();

    // Tab strip: tablist + two tabs, Library selected by default.
    assert.equal(await page.locator('[data-sidebar-tabs][role="tablist"]').count(), 1);
    assert.equal(await page.locator('[data-sidebar-tabs] [role="tab"]').count(), 2);
    assert.equal(
      await page.locator('[data-sidebar-tab="library"]').getAttribute('aria-selected'),
      'true',
    );
    assert.equal(
      await page.locator('[data-sidebar-tab="outline"]').getAttribute('aria-selected'),
      'false',
    );
    assert.equal(
      await page.locator('[data-sidebar-tab="library"]').getAttribute('aria-controls'),
      'nf-sidebar-panel',
    );
    assert.equal(await page.locator('#nf-sidebar-panel').getAttribute('role'), 'tabpanel');
    assert.equal(
      await page.locator('#nf-sidebar-panel').getAttribute('aria-labelledby'),
      'nf-sidebar-tab-library',
    );
    assert.equal(
      await page.locator('[data-sidebar-panel="library"]').count(),
      1,
      'the Library panel is the default tab panel',
    );

    // Library header: name, count, one New note. The global header + is gone.
    const libraryName = await page.locator('[data-library-name]').innerText();
    assert.ok(libraryName.length > 0, 'the library name is visible');
    assert.match(await page.locator('[data-library-count]').innerText(), /^\d+$/);
    assert.equal(await page.locator('.nf-sidebar [aria-label="New note"]').count(), 1);
    assert.equal(
      await page.locator('.nf-sidebar-head [aria-label="New note"]').count(),
      0,
      'the global header + is gone',
    );

    // The one + creates a note inside the active library.
    const before = await sidebarState();
    const activePath = before.library?.path ?? '';
    assert.ok(activePath.length > 0);
    const tabsBefore = before.tabs.length;
    await page.locator('[data-library-new="true"]').click();
    await page.waitForFunction(
      (count) => window.__noteforestTest.state().tabs.length === count + 1,
      tabsBefore,
      { timeout: 15000 },
    );
    const created = await page.evaluate(
      () => window.__noteforestTest.state().tabs.at(-1)?.packagePath ?? null,
    );
    assert.ok(created !== null && created.startsWith(activePath), 'the note is in the active library');
    await h.waitSaved();
    await page.screenshot({ path: join(screenshotDir, 'library-tab.png') });

    // Arrow keys move selection and focus together.
    await page.locator('[data-sidebar-tab="library"]').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(
      () => document.querySelector('[data-sidebar-tab="outline"]')?.getAttribute('aria-selected') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('data-sidebar-tab')),
      'outline',
      'focus follows the arrow key',
    );
    assert.equal(
      await page.locator('#nf-sidebar-panel').getAttribute('aria-labelledby'),
      'nf-sidebar-tab-outline',
    );
    assert.equal(await page.locator('[data-sidebar-panel="outline"]').count(), 1);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(
      () => document.querySelector('[data-sidebar-tab="library"]')?.getAttribute('aria-selected') === 'true',
      undefined,
      { timeout: 5000 },
    );

    // Outline shows the active document tree; opening another document does
    // not force a tab switch.
    await page.keyboard.press('Meta+1');
    await page.waitForFunction(
      () => window.__noteforestTest.state().activeTab === window.__noteforestTest.state().tabs[0]?.packagePath,
      undefined,
      { timeout: 10000 },
    );
    await page.locator('[data-sidebar-tab="outline"]').click();
    await page.waitForSelector('[data-sidebar-panel="outline"] .nf-tree-row[data-block-id]');
    const parentId = await page.evaluate(() => {
      const current = window.__noteforestTest.structure();
      return (
        Object.values(current.blocks).find((block) =>
          JSON.stringify(block.content).includes('Take the symmetric matrix below'),
        )?.id ?? null
      );
    });
    assert.ok(parentId !== null, 'the demo parent block is active');
    const anchored = await ui.createAnchoredChild(parentId, 'symmetric');
    await page.waitForSelector(`.nf-tree-anchor-row[data-block-id="${anchored.blockId}"]`);
    const anchorRow = page.locator(`.nf-tree-anchor-row[data-block-id="${anchored.blockId}"]`);
    assert.equal(
      await anchorRow.evaluate((element) => getComputedStyle(element).borderInlineStartWidth),
      '0px',
      'the anchor row has no left accent bar',
    );
    await anchorRow.click();
    await page.waitForSelector('.nf-tree-anchor-row[data-anchor-selected="true"]');
    const shadow = await page
      .locator('.nf-tree-anchor-row[data-anchor-selected="true"]')
      .evaluate((element) => getComputedStyle(element).boxShadow);
    assert.match(shadow, /0px 0px 0px 1px inset/, 'selection is the full-row ring');
    assert.doesNotMatch(shadow, /2px 0px/, 'selection has no left stripe');
    await page.screenshot({ path: join(screenshotDir, 'outline-tab.png') });

    await page.evaluate(() => window.__noteforestTest.seed('performance'));
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs.length >= 3,
      undefined,
      { timeout: 20000 },
    );
    assert.equal((await sidebarState()).sidebarTab, 'outline', 'opening a document keeps the tab');

    // The active tab persists across a relaunch.
    await h.flushSession();
    await h.quit();
    page = await ui.launch(env);
    await h.setWindowSize(1440, 900);
    await page.waitForSelector('[data-sidebar-tab="outline"][aria-selected="true"]');
    assert.equal(
      await page.locator('[data-sidebar-panel="outline"]').count(),
      1,
      'the Outline tab is restored on launch',
    );
  });

  it('shows the Outline empty state and keeps sidebar collapse unchanged', async () => {
    await launch('empty');
    await page.locator('[data-sidebar-tab="outline"]').click();
    await page.waitForSelector('[data-outline-empty="true"]');
    assert.equal(
      (await page.locator('[data-outline-empty]').innerText()).trim(),
      'Open a document to see its outline.',
    );
    await page.screenshot({ path: join(screenshotDir, 'outline-empty.png') });

    // Collapse/expand keeps the rail contract and the selected tab.
    await page.keyboard.press('Meta+\\');
    await page.waitForSelector('.nf-sidebar-rail');
    await page.locator('[data-sidebar-expand="true"]').click();
    await page.waitForSelector('[data-sidebar-tab="outline"][aria-selected="true"]');
  });
});
