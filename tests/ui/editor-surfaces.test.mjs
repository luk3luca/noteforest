import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  pageDocument,
  paragraph,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';

const tempRoot = artifactsPath('editor-surfaces-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const screenshotDir = artifactsPath('editor-surfaces');
let page;

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

function viewState() {
  return page.evaluate(() => {
    const state = window.__noteforestTest.state();
    return window.__noteforestTest.viewState()[state.activeTab];
  });
}

async function waitMode(layout, mode) {
  await page.waitForFunction(
    ({ expectedLayout, expectedMode }) => {
      const state = window.__noteforestTest.state();
      const view = window.__noteforestTest.viewState()[state.activeTab];
      return view?.layout === expectedLayout && view?.interactionMode === expectedMode;
    },
    { expectedLayout: layout, expectedMode: mode },
    { timeout: 10000 },
  );
}

function card(blockId) {
  return page.locator(`.nf-editor[data-active="true"] [data-block-card="${blockId}"]`).first();
}

async function menuEntryIds() {
  return page
    .locator('.nf-menu [data-menu-entry]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-menu-entry')));
}

async function openMenuItem(entries, id) {
  assert.ok(entries.includes(id), `menu has ${id}: ${entries.join(', ')}`);
  await page.locator(`.nf-menu [data-menu-entry="${id}"]`).click();
  await page.waitForSelector('.nf-menu', { state: 'detached' });
}

async function escapeMenu() {
  await page.keyboard.press('Escape');
  await page.waitForSelector('.nf-menu', { state: 'detached' });
}

/**
 * Select one block as an object through the real gutter pointerdown. The
 * gutter of the first card can sit under the fixed canvas header, so the
 * synthetic pointer keeps the test independent of the hit-testing offset while
 * still running the product handler that sets the branchBlock node selection.
 */
async function selectBlock(blockId) {
  await page.locator(`[data-block-actions="${blockId}"]`).evaluate((button) => {
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
  });
  await page.waitForFunction(
    () => document.querySelectorAll('.ProseMirror-selectednode').length > 0,
    undefined,
    { timeout: 5000 },
  );
  // The gutter selection is a NodeSelection; keyboard commands (Tab) only run
  // when the editor owns focus. Pointer events on the gutter do not focus it.
  await page
    .locator('.nf-editor[data-active="true"] .ProseMirror')
    .evaluate((element) => element.focus());
}

function proseDocument() {
  return pageDocument({
    id: 'surfaces-prose',
    title: 'Surfaces prose',
    chapterTitle: 'Surfaces',
    blocks: [
      textBlock('prose-block', 'Prose', 'The eigenvalue is stable under a similar matrix.'),
      textBlock('second-block', 'Second', 'A second paragraph for the menu.'),
    ],
  });
}

function surfacesDocument() {
  const table = {
    id: 'table-block',
    label: 'Table',
    content: {
      type: 'doc',
      children: [
        {
          type: 'table',
          children: [
            {
              type: 'tableRow',
              children: [
                { type: 'tableCell', children: [paragraph('Name')] },
                { type: 'tableCell', children: [paragraph('Value')] },
              ],
            },
            {
              type: 'tableRow',
              children: [
                { type: 'tableCell', children: [paragraph('lambda')] },
                { type: 'tableCell', children: [paragraph('1.25')] },
              ],
            },
          ],
        },
      ],
    },
  };
  const code = {
    id: 'code-block',
    label: 'Code',
    content: {
      type: 'doc',
      children: [
        {
          type: 'codeBlock',
          attrs: { language: 'ts' },
          children: [{ type: 'text', text: 'const x = 1;' }],
        },
      ],
    },
  };
  const formula = {
    id: 'formula-block',
    label: 'Formula',
    content: {
      type: 'doc',
      children: [{ type: 'blockMath', attrs: { latex: 'E = mc^2' } }],
    },
  };
  return pageDocument({
    id: 'surfaces-all',
    title: 'Surfaces all',
    chapterTitle: 'Surfaces',
    blocks: [
      textBlock('prose-block', 'Prose', 'The eigenvalue is stable under a similar matrix.'),
      table,
      code,
      formula,
    ],
  });
}

function formulaFirstDocument() {
  return pageDocument({
    id: 'surfaces-formula-page',
    title: 'Page formula',
    chapterTitle: 'Page formula',
    blocks: [
      {
        id: 'page-formula',
        label: 'Page formula',
        content: {
          type: 'doc',
          children: [{ type: 'blockMath', attrs: { latex: 'E = mc^2 + \\frac{a}{b}' } }],
        },
      },
      textBlock('page-after', 'After', 'Text after the formula block.'),
    ],
  });
}

function branchOf(structure, targetBlockId) {
  return Object.values(structure.branches).find(
    (branch) => branch.targetBlockId === targetBlockId && branch.role === 'primary',
  );
}

describe('Editor surfaces: contextual menu, Page formula, mode parity, indent', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(screenshotDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('shows one target-aware menu for prose, card, cell, code, formula and Read', async () => {
    const env = ui.isolated('surfaces-menu');
    await launch('surfaces-menu');
    await openPackage(env, 'Surfaces all', surfacesDocument());

    // Prose: text group + the complete block menu.
    await page.evaluate(() => {
      window.__surfacesContextPrevented = null;
      document.addEventListener(
        'contextmenu',
        (event) => {
          window.__surfacesContextPrevented = event.defaultPrevented;
        },
        false,
      );
    });
    await card('prose-block').locator('.nf-block-prose').first().click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    assert.equal(await page.locator('.nf-menu').count(), 1, 'exactly one menu is visible');
    let entries = await menuEntryIds();
    for (const id of ['text-cut', 'text-copy', 'text-paste', 'text-select-all']) {
      assert.ok(entries.includes(id), `prose menu has ${id}`);
    }
    for (const id of ['focus', 'insert-image', 'insert-table', 'add-child', 'indent', 'outdent', 'delete']) {
      assert.ok(entries.includes(id), `prose menu keeps the block entry ${id}`);
    }
    assert.equal(
      entries.includes('table-row-above'),
      false,
      'prose does not show table commands',
    );
    assert.equal(
      await page.locator('[data-menu-entry="text-cut"]').getAttribute('aria-disabled'),
      'true',
      'Cut is disabled without a selection',
    );
    assert.equal(
      await page.locator('[data-menu-entry="text-copy"]').getAttribute('aria-disabled'),
      'true',
      'Copy is disabled without a selection',
    );
    assert.notEqual(
      await page.locator('[data-menu-entry="text-paste"]').getAttribute('aria-disabled'),
      'true',
      'Paste is available on the editable prose target',
    );
    assert.equal(
      await page.evaluate(() => window.__surfacesContextPrevented),
      true,
      'the renderer prevents the native context menu',
    );
    await page.screenshot({ path: resolve(screenshotDir, 'menu-prose.png') });
    await escapeMenu();
    await page.waitForFunction(
      () => document.activeElement?.closest('.nf-prosemirror') !== null,
      undefined,
      { timeout: 5000 },
    );

    // Card/chrome: the formula render belongs to the card, so no text group.
    await card('formula-block').locator('[data-type="block-math"]').first().click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    assert.equal(await page.locator('.nf-menu').count(), 1);
    entries = await menuEntryIds();
    assert.equal(entries.includes('text-cut'), false, 'card menu has no text group');
    assert.ok(entries.includes('focus'));
    assert.ok(entries.includes('indent'));
    await page.screenshot({ path: resolve(screenshotDir, 'menu-card.png') });
    await escapeMenu();

    // Table cell: text + table commands, never block structure or insertion.
    await card('table-block').locator('td').first().click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    assert.equal(await page.locator('.nf-menu').count(), 1);
    entries = await menuEntryIds();
    for (const id of ['text-cut', 'text-copy', 'text-paste', 'text-select-all']) {
      assert.ok(entries.includes(id), `cell menu has ${id}`);
    }
    for (const id of [
      'table-row-above',
      'table-row-below',
      'table-row-delete',
      'table-column-left',
      'table-column-right',
      'table-column-delete',
      'table-align-left',
      'table-align-center',
      'table-align-right',
      'table-copy-markdown',
    ]) {
      assert.ok(entries.includes(id), `cell menu has ${id}`);
    }
    assert.equal(entries.includes('focus'), false, 'cell menu has no block structure');
    assert.equal(entries.includes('insert-image'), false, 'cell menu has no image insertion');
    assert.equal(entries.includes('insert-table'), false, 'cell menu has no table insertion');
    await page.screenshot({ path: resolve(screenshotDir, 'menu-cell.png') });
    await escapeMenu();

    // Code content: text only. Enter the code block first so its language
    // input exists, then check both text targets.
    await card('code-block').locator('pre code').first().click();
    await page.waitForSelector('[data-code-language-input]');
    await card('code-block').locator('pre code').first().click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    entries = await menuEntryIds();
    assert.deepEqual(
      entries,
      ['text-cut', 'text-copy', 'text-paste', 'text-select-all'],
      'code content shows the text group only',
    );
    await escapeMenu();
    await page.locator('[data-code-language-input]').click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    entries = await menuEntryIds();
    assert.deepEqual(
      entries,
      ['text-cut', 'text-copy', 'text-paste', 'text-select-all'],
      'code language input shows the text group only',
    );
    await escapeMenu();

    // Formula source: text only, and the source stays open with its value.
    // Leave the code fence first so its own node-view update cannot replace
    // the formula element between the two clicks of a double-click.
    await card('prose-block').locator('.nf-block-prose').first().click();
    await page.waitForSelector('[data-code-state="idle"]');
    const formula = card('formula-block').locator('[data-type="block-math"]').first();
    await formula.dblclick();
    const source = card('formula-block').locator('[data-formula-source]');
    await source.waitFor();
    await source.press('Home');
    await source.press('Shift+ArrowRight');
    await source.press('Shift+ArrowRight');
    const before = await source.evaluate((element) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
      value: element.value,
    }));
    assert.equal(before.end > before.start, true, 'the source has a selection');
    await source.click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    entries = await menuEntryIds();
    assert.deepEqual(
      entries,
      ['text-cut', 'text-copy', 'text-paste', 'text-select-all'],
      'formula source shows the text group only',
    );
    assert.equal(await source.count(), 1, 'the formula source stays open on right-click');
    const during = await source.evaluate((element) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
    }));
    assert.deepEqual(during, { start: before.start, end: before.end }, 'the selection is preserved');
    await page.screenshot({ path: resolve(screenshotDir, 'menu-formula-source.png') });
    await openMenuItem(entries, 'text-select-all');
    const selectedAll = await source.evaluate((element) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
      length: element.value.length,
    }));
    assert.equal(selectedAll.start, 0);
    assert.equal(selectedAll.end, selectedAll.length, 'Select All selects the whole source');
    assert.equal(await source.count(), 1, 'Select All never closes the source');
    await page.waitForFunction(
      () => document.activeElement?.matches('[data-formula-source]') === true,
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-formula-source]', { state: 'detached' });

    // Escape returned focus to the source; the formula render is focused for
    // the Read check below. Read text exposes Copy/Select All only.
    await page.keyboard.press('Meta+e');
    await waitMode('continuous', 'read');
    await card('prose-block').locator('.nf-block-prose').first().click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    entries = await menuEntryIds();
    assert.deepEqual(entries, ['text-copy', 'text-select-all'], 'Read text has Copy/Select All');
    await escapeMenu();
    await card('formula-block').locator('[data-type="block-math"]').first().click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    entries = await menuEntryIds();
    assert.ok(entries.includes('focus'), 'Read card keeps the gated block menu');
    assert.equal(
      await page.locator('[data-menu-entry="focus"]').getAttribute('aria-disabled'),
      null,
      'focus stays available in Read',
    );
    assert.equal(
      await page.locator('[data-menu-entry="insert-image"]').getAttribute('aria-disabled'),
      'true',
      'insertion is gated in Read',
    );
    assert.match(
      await page.locator('[data-menu-entry="insert-image"]').innerText(),
      /Read mode/,
      'the disabled entry states the reason',
    );
    await escapeMenu();
  });

  it('preserves the right-clicked prose selection for Cut/Paste and undo', async () => {
    const env = ui.isolated('surfaces-text-actions');
    await launch('surfaces-text-actions');
    await openPackage(env, 'Surfaces prose', proseDocument());

    const prose = card('prose-block').locator('.nf-block-prose').first();
    await prose.click();
    // Select "The " with a real DOM range and capture a point inside it for the
    // right-click. A visual Home would move to the start of a wrapped line in
    // this narrow card, not the start of the paragraph.
    const point = await page.evaluate(() => {
      const host = document.querySelector('[data-block-card="prose-block"] .nf-block-prose');
      if (host === null) return null;
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      if (text === null) return null;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 4);
      const selection = window.getSelection();
      if (selection === null) return null;
      selection.removeAllRanges();
      selection.addRange(range);
      const rect = range.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    assert.equal(selected, 'The ', 'the first word is selected');
    assert.ok(point !== null);
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await page.locator('.nf-menu').waitFor();
    assert.equal(
      await page.evaluate(() => window.getSelection()?.toString() ?? ''),
      'The ',
      'opening the menu keeps the selection',
    );
    await openMenuItem(await menuEntryIds(), 'text-cut');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-block-card="prose-block"] .nf-block-prose')
          ?.textContent?.startsWith('eigenvalue') === true,
      undefined,
      { timeout: 10000 },
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-block-card="prose-block"] .nf-block-prose')
            ?.textContent ?? '',
      ),
      'eigenvalue is stable under a similar matrix.',
      'Cut removes exactly the selected text',
    );
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-block-card="prose-block"] .nf-block-prose')
          ?.textContent?.startsWith('The eigenvalue') === true,
      undefined,
      { timeout: 10000 },
    );

    // Copy/Select All stay selection-only. Select All selects the block text.
    await prose.click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    await openMenuItem(await menuEntryIds(), 'text-select-all');
    assert.equal(
      await page.evaluate(() => window.getSelection()?.toString() ?? ''),
      'The eigenvalue is stable under a similar matrix.',
      'Select All selects the right-clicked block text',
    );
  });

  it('expands the Page Edit formula panel with every control visible and no scrollbar', async () => {
    const env = ui.isolated('surfaces-page-formula');
    await launch('surfaces-page-formula');
    await openPackage(env, 'Page formula', formulaFirstDocument());

    // Continuous Edit -> Page stays Edit; no overlay opens by itself.
    await page.keyboard.press('Meta+3');
    await waitMode('page', 'edit');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-ready') === 'true',
      undefined,
      { timeout: 30000 },
    );
    assert.equal(await page.locator('[data-page-edit-overlay]').count(), 0);
    const fragment = page
      .locator('.nf-editor[data-active="true"] .nf-page-fragment[data-fragment-block="page-formula"]')
      .first();
    await fragment.dblclick();
    const overlay = page.locator('[data-page-edit-overlay]');
    await overlay.waitFor({ timeout: 5000 });
    await overlay.locator('[data-type="block-math"]').first().dblclick();
    const panel = page.locator('.nf-formula-panel-page');
    await panel.waitFor();

    const metrics = await page.evaluate(() => {
      const panel = document.querySelector('.nf-formula-panel-page');
      const actions = panel?.querySelector('[data-formula-actions]');
      const preview = panel?.querySelector('.nf-formula-preview');
      if (panel === null || panel === undefined || actions === null || actions === undefined) {
        return null;
      }
      const rect = (element) => {
        const box = element.getBoundingClientRect();
        return {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          right: box.right,
          bottom: box.bottom,
        };
      };
      return {
        panel: rect(panel),
        actions: rect(actions),
        preview: rect(preview),
        buttons: [...panel.querySelectorAll('.nf-formula-action')].map((button) => ({
          text: button.textContent,
          ...rect(button),
        })),
        panelOverflowX: getComputedStyle(panel).overflowX,
        panelClientWidth: panel.clientWidth,
        panelScrollWidth: panel.scrollWidth,
        scroll: (() => {
          const element = document.querySelector('.nf-page-scroll');
          return element === null
            ? null
            : { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
        })(),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    });
    assert.ok(metrics !== null);
    assert.ok(
      metrics.panel.x >= 0 && metrics.panel.y >= 0,
      'the panel starts inside the viewport',
    );
    assert.ok(
      metrics.panel.right <= metrics.viewport.width &&
        metrics.panel.bottom <= metrics.viewport.height,
      'the panel is clamped to the viewport',
    );
    assert.ok(metrics.panel.width >= 400, `the panel expands (${metrics.panel.width} px)`);
    assert.equal(metrics.buttons.length, 3, 'the action row has all three controls');
    const rowY = new Set(metrics.buttons.map((button) => Math.round(button.y)));
    assert.equal(rowY.size, 1, 'the action row stays on one line');
    for (const button of metrics.buttons) {
      assert.ok(
        button.x >= metrics.panel.x && button.right <= metrics.panel.right,
        `${button.text} is inside the panel`,
      );
      assert.ok(
        button.y >= metrics.panel.y && button.bottom <= metrics.panel.bottom,
        `${button.text} is vertically inside the panel`,
      );
      assert.ok(
        button.right <= metrics.viewport.width && button.bottom <= metrics.viewport.height,
        `${button.text} is inside the viewport`,
      );
    }
    assert.ok(
      metrics.preview.right <= metrics.panel.right + 0.5 &&
        metrics.preview.bottom <= metrics.panel.bottom + 0.5,
      'the preview is fully visible',
    );
    assert.equal(
      metrics.panelScrollWidth <= metrics.panelClientWidth + 1,
      true,
      'the formula panel introduces no horizontal scrollbar',
    );
    assert.notEqual(metrics.panelOverflowX, 'auto');
    assert.notEqual(metrics.panelOverflowX, 'scroll');
    assert.ok(
      metrics.scroll === null || metrics.scroll.scrollWidth <= metrics.scroll.clientWidth,
      'the page scroll surface has no horizontal scrollbar',
    );
    await page.screenshot({ path: resolve(screenshotDir, 'page-formula-panel.png') });

    // The Page formula source uses the same text-only custom menu and stays
    // open when the menu closes.
    const source = panel.locator('[data-formula-source]');
    await source.click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    assert.deepEqual(await menuEntryIds(), ['text-cut', 'text-copy', 'text-paste', 'text-select-all']);
    assert.equal(await source.count(), 1);
    assert.equal(await overlay.count(), 1, 'the Page Edit overlay stays open');
    await escapeMenu();
    await page.waitForFunction(
      () => document.activeElement?.matches('[data-formula-source]') === true,
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-formula-source]', { state: 'detached' });
    assert.equal(await overlay.count(), 1, 'Esc closes the formula source first');

    // Cut/Paste run the platform commands on the captured source selection.
    await overlay.locator('[data-type="block-math"]').first().dblclick();
    await panel.waitFor();
    const sourceAgain = panel.locator('[data-formula-source]');
    const sourceValue = await sourceAgain.inputValue();
    await sourceAgain.click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    await openMenuItem(await menuEntryIds(), 'text-select-all');
    await sourceAgain.click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    await openMenuItem(await menuEntryIds(), 'text-cut');
    await page.waitForFunction(
      () =>
        document.querySelector('.nf-formula-panel-page [data-formula-source]')?.value === '',
      undefined,
      { timeout: 10000 },
    );
    await sourceAgain.click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    await openMenuItem(await menuEntryIds(), 'text-paste');
    await page.waitForFunction(
      (expected) =>
        document.querySelector('.nf-formula-panel-page [data-formula-source]')?.value === expected,
      sourceValue,
      { timeout: 10000 },
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-formula-source]', { state: 'detached' });

    // One commit, one undo entry: change the formula source, commit the source,
    // then commit the block with Done.
    await overlay.locator('[data-type="block-math"]').first().dblclick();
    await panel.waitFor();
    await source.fill('E = mc^3');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-formula-source]', { state: 'detached' });
    await page.locator('[data-page-edit-done]').click();
    await page.waitForSelector('[data-page-edit-overlay]', { state: 'detached', timeout: 10000 });
    await page.waitForFunction(
      () =>
        JSON.stringify(window.__noteforestTest.structure().blocks['page-formula'].content).includes(
          'mc^3',
        ),
      undefined,
      { timeout: 10000 },
    );
    // Global undo is Continuous Edit only; switch there and undo once. The
    // canonical formula type may normalize through the editor projection, so
    // the contract is the restored LaTeX plus an empty structural stack.
    await page.keyboard.press('Meta+2');
    await waitMode('continuous', 'edit');
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      () => {
        const content = JSON.stringify(
          window.__noteforestTest.structure().blocks['page-formula'].content,
        );
        return content.includes('mc^2') && !content.includes('mc^3');
      },
      undefined,
      { timeout: 10000 },
    );
    const afterUndo = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      return state.runtimes.find((runtime) => runtime.packagePath === state.activeTab);
    });
    assert.equal(afterUndo.canUndoStructural, false, 'one undo restored the whole edit');
  });

  it('preserves Edit/Read across Continuous and Page and restores Page Edit state', async () => {
    const env = ui.isolated('surfaces-mode-parity');
    await launch('surfaces-mode-parity');
    const packagePath = await openPackage(env, 'Surfaces prose', proseDocument());

    // Continuous Edit -> Page keeps Edit and does not auto-open an overlay.
    await card('prose-block').locator('.nf-block-prose').first().click();
    await page.keyboard.press('Meta+3');
    await waitMode('page', 'edit');
    assert.equal(await page.locator('[data-page-edit-overlay]').count(), 0);
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-page-view').getAttribute(
        'data-interaction-mode',
      ),
      'edit',
    );
    await page.screenshot({ path: resolve(screenshotDir, 'mode-parity-page-edit.png') });

    // Page Edit -> Continuous keeps Edit.
    await page.keyboard.press('Meta+2');
    await waitMode('continuous', 'edit');
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').getAttribute(
        'contenteditable',
      ),
      'true',
    );

    // Continuous Read -> Page keeps Read; Page Read -> Continuous keeps Read.
    await page.keyboard.press('Meta+e');
    await waitMode('continuous', 'read');
    await page.keyboard.press('Meta+3');
    await waitMode('page', 'read');
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-page-view').getAttribute(
        'data-interaction-mode',
      ),
      'read',
    );
    await page.keyboard.press('Meta+2');
    await waitMode('continuous', 'read');
    await page.keyboard.press('Meta+e');
    await waitMode('continuous', 'edit');

    // Explicit Page Edit survives a session round trip.
    await page.keyboard.press('Meta+3');
    await waitMode('page', 'edit');
    await page.evaluate(() => window.__noteforestTest.flushSession());
    await h.quit();
    await launch('surfaces-mode-parity');
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      packagePath,
      { timeout: 10000 },
    );
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
    await waitMode('page', 'edit');
    assert.equal(await page.locator('[data-page-edit-overlay]').count(), 0);
  });

  it('indents under the previous sibling from Tab, the menu and the palette, with one undo', async () => {
    const env = ui.isolated('surfaces-indent');
    await launch('surfaces-indent');
    await openPackage(env, 'Surfaces indent', proseDocument());
    const firstId = 'prose-block';
    const secondId = 'second-block';

    // First top-level block: Indent is disabled with a reason.
    await selectBlock(firstId);
    await page.keyboard.press('Tab');
    await page
      .locator('[data-sonner-toast]', { hasText: 'No previous sibling to indent under.' })
      .waitFor({ timeout: 5000 });
    const before = await page.evaluate(() => window.__noteforestTest.structure());
    assert.deepEqual(
      before.chapters[0].topLevelBlockIds,
      [firstId, secondId],
      'a disabled Tab changes nothing',
    );

    // Second top-level block: Tab makes it the last child of the previous one.
    await selectBlock(secondId);
    await page.keyboard.press('Tab');
    await page.waitForFunction(
      ({ childId, parentId }) => {
        const structure = window.__noteforestTest.structure();
        return Object.values(structure.branches).some(
          (branch) =>
            branch.role === 'primary' &&
            branch.targetBlockId === childId &&
            branch.source.blockId === parentId,
        );
      },
      { childId: secondId, parentId: firstId },
      { timeout: 10000 },
    );
    let structure = await page.evaluate(() => window.__noteforestTest.structure());
    assert.deepEqual(structure.chapters[0].topLevelBlockIds, [firstId]);
    assert.equal(structure.chapters[0].topLevelBlockIds.includes(secondId), false);
    assert.equal(branchOf(structure, secondId)?.source.blockId, firstId);
    await page.screenshot({ path: resolve(screenshotDir, 'indent-result.png') });

    // One undo restores the top-level position.
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      ({ ids }) => {
        const structure = window.__noteforestTest.structure();
        return JSON.stringify(structure.chapters[0].topLevelBlockIds) === JSON.stringify(ids);
      },
      { ids: [firstId, secondId] },
      { timeout: 10000 },
    );

    // Position menu entry.
    await card(secondId).locator('.nf-block-prose').first().click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    await openMenuItem(await menuEntryIds(), 'indent');
    await page.waitForFunction(
      ({ childId, parentId }) => {
        const structure = window.__noteforestTest.structure();
        return Object.values(structure.branches).some(
          (branch) =>
            branch.role === 'primary' &&
            branch.targetBlockId === childId &&
            branch.source.blockId === parentId,
        );
      },
      { childId: secondId, parentId: firstId },
      { timeout: 10000 },
    );
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (ids) =>
        JSON.stringify(window.__noteforestTest.structure().chapters[0].topLevelBlockIds) ===
        JSON.stringify(ids),
      [firstId, secondId],
      { timeout: 10000 },
    );

    // Palette command.
    await selectBlock(secondId);
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.locator('.nf-palette-input').fill('Indent block');
    const paletteItem = page
      .locator('.nf-palette-item', {
        has: page.locator('.nf-palette-label', { hasText: 'Indent block' }),
      })
      .first();
    await paletteItem.waitFor({ state: 'visible' });
    assert.notEqual(await paletteItem.getAttribute('aria-disabled'), 'true');
    await paletteItem.click();
    await page.waitForSelector('.nf-palette', { state: 'detached' });
    await page.waitForFunction(
      ({ childId, parentId }) => {
        const structure = window.__noteforestTest.structure();
        return Object.values(structure.branches).some(
          (branch) =>
            branch.role === 'primary' &&
            branch.targetBlockId === childId &&
            branch.source.blockId === parentId,
        );
      },
      { childId: secondId, parentId: firstId },
      { timeout: 10000 },
    );
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (ids) =>
        JSON.stringify(window.__noteforestTest.structure().chapters[0].topLevelBlockIds) ===
        JSON.stringify(ids),
      [firstId, secondId],
      { timeout: 10000 },
    );

    // Shift+Tab outdents the child again (one undo).
    await selectBlock(secondId);
    await page.keyboard.press('Tab');
    await page.waitForFunction(
      ({ childId, parentId }) => {
        const structure = window.__noteforestTest.structure();
        return Object.values(structure.branches).some(
          (branch) =>
            branch.role === 'primary' &&
            branch.targetBlockId === childId &&
            branch.source.blockId === parentId,
        );
      },
      { childId: secondId, parentId: firstId },
      { timeout: 10000 },
    );
    await selectBlock(secondId);
    await page.keyboard.press('Shift+Tab');
    await page.waitForFunction(
      ({ childId, ids }) => {
        const structure = window.__noteforestTest.structure();
        const hasPrimary = Object.values(structure.branches).some(
          (branch) => branch.role === 'primary' && branch.targetBlockId === childId,
        );
        return (
          JSON.stringify(structure.chapters[0].topLevelBlockIds) === JSON.stringify(ids) &&
          hasPrimary === false
        );
      },
      { childId: secondId, ids: [firstId, secondId] },
      { timeout: 10000 },
    );
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      ({ childId, parentId }) => {
        const structure = window.__noteforestTest.structure();
        return Object.values(structure.branches).some(
          (branch) =>
            branch.role === 'primary' &&
            branch.targetBlockId === childId &&
            branch.source.blockId === parentId,
        );
      },
      { childId: secondId, parentId: firstId },
      { timeout: 10000 },
    );
  });

  it('keeps an anchored primary edge as a cited reference on outdent with one undo', async () => {
    const env = ui.isolated('surfaces-anchored');
    await launch('surfaces-anchored');
    await openPackage(env, 'Surfaces anchored', proseDocument());

    const anchored = await ui.createAnchoredChild('prose-block', 'eigenvalue');
    await page.waitForSelector(`[data-block-card="${anchored.blockId}"]`);
    const anchoredCard = card(anchored.blockId);
    await anchoredCard.locator('.nf-block-prose').first().click();
    await selectBlock(anchored.blockId);
    await page.keyboard.press('Shift+Tab');
    await page
      .locator('[data-sonner-toast]', { hasText: 'Kept as reference from' })
      .waitFor({ timeout: 10000 });
    await page.waitForFunction(
      ({ branchId, parentId }) => {
        const structure = window.__noteforestTest.structure();
        const branch = structure.branches[branchId];
        return (
          branch !== undefined &&
          branch.role === 'reference' &&
          branch.source.blockId === parentId
        );
      },
      { branchId: anchored.branchId, parentId: 'prose-block' },
      { timeout: 10000 },
    );
    const structure = await page.evaluate(() => window.__noteforestTest.structure());
    assert.equal(structure.branches[anchored.branchId].role, 'reference');
    assert.equal(structure.branches[anchored.branchId].source.anchorId, anchored.anchorId);
    assert.equal(
      structure.chapters[0].topLevelBlockIds.includes(anchored.blockId),
      true,
      'the outdented block leaves the parent as a top-level block',
    );
    const incoming = Object.values(structure.branches).find(
      (branch) => branch.role === 'primary' && branch.targetBlockId === anchored.blockId,
    );
    assert.equal(incoming, undefined, 'a top-level block has no primary incoming edge');

    // The reference is the citation: the anchor record survived and the old
    // reference edge is visible as a See also chip on the source block.
    assert.equal(structure.anchors[anchored.anchorId] !== undefined, true);
    await page.waitForSelector(
      `[data-see-also-branch="${anchored.branchId}"], [data-referenced-by-branch="${anchored.branchId}"]`,
      { timeout: 10000 },
    );

    // One undo restores the primary edge and removes the citation.
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      ({ branchId, parentId }) => {
        const structure = window.__noteforestTest.structure();
        const branch = structure.branches[branchId];
        return (
          branch !== undefined &&
          branch.role === 'primary' &&
          branch.source.blockId === parentId
        );
      },
      { branchId: anchored.branchId, parentId: 'prose-block' },
      { timeout: 10000 },
    );
  });
});
