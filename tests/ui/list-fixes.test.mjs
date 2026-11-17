import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addTopLevelBlock } from '../support/fixtures.mjs';

/**
 * List fixes UI.
 *
 * 1. Tailwind preflight resets `ul`/`ol`, so the Continuous editor rendered no
 *    bullet/number marker at any depth. The block prose restores the markers;
 *    the Page renderer keeps its own explicit `.nf-li-marker` glyphs.
 * 2. Typing `1) ` did not start an ordered list (only `1. ` did), so Enter
 *    could not continue the numbering. The paren input rule mirrors the native
 *    one; `1. `, `- `, and prose parentheses keep their behavior.
 */

const tempRoot = artifactsPath('list-fixes-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

function card(blockId) {
  return page.locator(`.nf-editor[data-active="true"] [data-block-card="${blockId}"]`);
}

function prose(blockId) {
  return card(blockId).locator('.nf-block-prose');
}

function paragraphs(blockId) {
  return prose(blockId).locator('p');
}

/** Center the card in the Continuous viewport for the evidence screenshot. */
async function centerCard(blockId) {
  await card(blockId).evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'nearest' }),
  );
}

async function addBlock(blockId, content) {
  await addTopLevelBlock(ui, blockId, content);
  const current = await ui.structure();
  await h.waitLayout({
    blocks: Object.keys(current.blocks).length,
    arrows: Object.values(current.branches).filter((branch) => branch.role === 'primary')
      .length,
  });
}

async function focusProse(blockId) {
  const first = paragraphs(blockId).first();
  await first.scrollIntoViewIfNeeded();
  await first.click();
  // The click is ready when ProseMirror reports this block as selected; a
  // browser-selection check alone can race the editor's selection sync.
  await page.waitForFunction(
    (id) => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      return runtime?.selectedBlockId === id;
    },
    blockId,
    { timeout: 5000 },
  );
}

async function typeInBlock(blockId, text) {
  await focusProse(blockId);
  await page.keyboard.type(text);
}

/** Marker text and list styles of the block's lists, depth = list ancestors. */
async function listReport(blockId) {
  return page.evaluate((block) => {
    const root = document.querySelector(
      `.nf-editor[data-active="true"] [data-block-card="${block}"] .nf-block-prose`,
    );
    if (root === null) return null;
    const depthOf = (element) => {
      let depth = 0;
      for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
        if (parent.tagName === 'UL' || parent.tagName === 'OL') depth += 1;
      }
      return depth;
    };
    return [...root.querySelectorAll('ul, ol')].map((list) => {
      const style = getComputedStyle(list);
      const markerStyle =
        list.firstElementChild === null
          ? null
          : getComputedStyle(list.firstElementChild, '::marker');
      return {
        tag: list.tagName.toLowerCase(),
        depth: depthOf(list),
        listStyleType: style.listStyleType,
        listStylePosition: style.listStylePosition,
        paddingLeft: style.paddingLeft,
        marginLeft: style.marginLeft,
        start: list.getAttribute('start'),
        itemCount: list.querySelectorAll(':scope > li').length,
        markerColor: markerStyle?.color ?? null,
        rootOverflowX: getComputedStyle(root).overflowX,
      };
    });
  }, blockId);
}

async function bodyChildren(blockId) {
  return page.evaluate((block) => {
    const root = document.querySelector(
      `.nf-editor[data-active="true"] [data-block-card="${block}"] .nf-block-prose`,
    );
    const container = root?.querySelector('[data-node-view-content-react]') ?? root;
    if (container === null) return [];
    return [...container.children].map((element) => element.tagName.toLowerCase());
  }, blockId);
}

async function switchTheme(theme) {
  await page.evaluate(async (next) => {
    const { app } = await window.__noteforestTest.settings();
    await window.__noteforestTest.setSettings({
      ...app,
      appearance: { ...app.appearance, theme: next },
    });
  }, theme);
  await page.waitForSelector(`html[data-theme="${theme}"]`, { timeout: 5000 });
}

function pageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

async function waitCurrentPage(index) {
  await page.waitForFunction(
    (expected) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return (
        view !== null &&
        Number(view.getAttribute('data-current-page')) === expected &&
        view.getAttribute('data-ready') === 'true' &&
        view.getAttribute('data-updating') !== 'true'
      );
    },
    index,
    { timeout: 30000 },
  );
}

async function showPageRead() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', { timeout: 10000 });
  await page.waitForFunction(
    () => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return (
        view !== null &&
        view.getAttribute('data-ready') === 'true' &&
        view.getAttribute('data-updating') !== 'true'
      );
    },
    undefined,
    { timeout: 30000 },
  );
  await ui.ensureInteractionMode('read');
}

/** Scroll to one page start through the jump surface and wait for it to settle. */
async function goToPage(index) {
  await ui.gotoPage(index);
  await waitCurrentPage(index);
}

/**
 * Walk every derived page from page 1 and record the explicit `.nf-li-marker`
 * glyphs of one block's fragments. The list block may continue on the next
 * page; Page mounts the visible page window, so each step reads the sheet of
 * the page the indicator names.
 */
async function blockMarkersByPage(blockId) {
  await goToPage(1);
  const pageCount = Number((await pageView().getAttribute('data-page-count')) ?? '1');
  const pages = [];
  for (let index = 1; index <= pageCount; index += 1) {
    const markers = await pageView()
      .locator(
        `.nf-page-sheet[data-page-number="${index}"] .nf-page-fragment[data-fragment-block="${blockId}"] .nf-li-marker`,
      )
      .evaluateAll((elements) => elements.map((element) => element.textContent));
    pages.push({ page: index, markers });
    await goToPage(Math.min(index + 1, pageCount));
  }
  return pages;
}

function listItem(text, ...children) {
  return {
    type: 'listItem',
    children: [{ type: 'paragraph', children: [{ type: 'text', text }] }, ...children],
  };
}

function bulletList(...items) {
  return { type: 'bulletList', children: items };
}

function orderedList(start, ...items) {
  return { type: 'orderedList', attrs: { start }, children: items };
}

/** Depth 1–4 bullets and depth 1–3 ordered lists in one block body. */
function nestedListDoc() {
  return {
    type: 'doc',
    children: [
      bulletList(
        listItem(
          'Bullet depth 1',
          bulletList(
            listItem(
              'Bullet depth 2',
              bulletList(
                listItem('Bullet depth 3', bulletList(listItem('Bullet depth 4'))),
              ),
            ),
          ),
        ),
      ),
      orderedList(
        1,
        listItem(
          'Ordered depth 1',
          orderedList(
            1,
            listItem('Ordered depth 2', orderedList(1, listItem('Ordered depth 3'))),
          ),
        ),
      ),
    ],
  };
}

describe('NoteForest list fixes', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(artifactsPath('list-fixes'), { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('A: markers render at every depth in Continuous Edit and Read, in both themes', async () => {
    const env = ui.isolated('list-fixes-markers');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();

    const blockId = 'lf-markers';
    await addBlock(blockId, nestedListDoc());

    const dark = await listReport(blockId);
    assert.ok(dark !== null);
    const bullets = dark.filter((entry) => entry.tag === 'ul');
    const ordered = dark.filter((entry) => entry.tag === 'ol');
    assert.deepEqual(
      bullets.map((entry) => [entry.depth, entry.listStyleType]),
      [
        [0, 'disc'],
        [1, 'circle'],
        [2, 'square'],
        [3, 'disc'],
      ],
      'the bullet cycle is disc -> circle -> square -> disc by depth',
    );
    assert.deepEqual(
      ordered.map((entry) => [entry.depth, entry.listStyleType]),
      [
        [0, 'decimal'],
        [1, 'lower-alpha'],
        [2, 'lower-roman'],
      ],
      'the ordered cycle is decimal -> lower-alpha -> lower-roman by depth',
    );
    for (const entry of dark) {
      // Outside markers are painted in the list's own 20 px padding, inside the
      // card; no negative offset and no clipping container.
      assert.equal(entry.listStylePosition, 'outside', `${entry.tag} keeps outside markers`);
      assert.equal(entry.paddingLeft, '20px', `${entry.tag} keeps the 20 px gutter`);
      assert.equal(entry.marginLeft, '0px', `${entry.tag} does not pull the list left`);
      assert.equal(entry.rootOverflowX, 'visible', 'the block prose never clips markers');
      assert.notEqual(entry.markerColor, null, `${entry.tag} exposes a marker box`);
    }
    // The dark marker resolves the muted shell role (#949aa2).
    assert.equal(
      new Set(dark.map((entry) => entry.markerColor)).size,
      1,
      'one muted marker colour for every list',
    );
    assert.equal(dark[0]?.markerColor, 'rgb(148, 154, 162)', 'dark ::marker uses --text-3');
    // Evidence: the whole nested block is in view, not cut by the viewport.
    await centerCard(blockId);
    await h.screenshot(artifactsPath('list-fixes', 'continuous-lists-dark-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await switchTheme('light');
    const light = await listReport(blockId);
    assert.equal(
      light?.[0]?.markerColor,
      'rgb(91, 103, 113)',
      'light ::marker follows the light muted role',
    );
    assert.deepEqual(
      light?.map((entry) => [entry.depth, entry.listStyleType]),
      dark.map((entry) => [entry.depth, entry.listStyleType]),
      'the depth cycle is theme independent',
    );
    await h.screenshot(artifactsPath('list-fixes', 'continuous-lists-light-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await switchTheme('dark');

    // Continuous Read keeps the same markers (no edit affordance is involved).
    await ui.ensureInteractionMode('read');
    const read = await listReport(blockId);
    assert.deepEqual(
      read?.map((entry) => [entry.depth, entry.listStyleType]),
      light?.map((entry) => [entry.depth, entry.listStyleType]),
      'Continuous Read shows the same markers as Edit',
    );
    await h.screenshot(artifactsPath('list-fixes', 'continuous-lists-read-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // The Page renderer is untouched: explicit glyph rows, no browser lists.
    await showPageRead();
    await page.waitForSelector('.nf-page-view .nf-li-marker');
    assert.equal(
      await page.locator('.nf-page-view .nf-block-prose').count(),
      0,
      'the page renderer never mounts the editor prose',
    );
    assert.equal(
      await page.locator('.nf-page-view ul, .nf-page-view ol').count(),
      0,
      'the page renderer draws no browser list',
    );
    await h.screenshot(artifactsPath('list-fixes', 'page-read-lists-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    // The block may continue on the next derived page; walk them all so every
    // explicit glyph is counted once.
    const pages = await blockMarkersByPage(blockId);
    const pageMarkers = pages.flatMap((entry) => entry.markers);
    for (const marker of pageMarkers) {
      assert.match(marker ?? '', /^(•|\d+\.)$/, 'the page keeps its explicit glyphs');
    }
    assert.equal(
      pageMarkers.filter((marker) => marker === '•').length,
      4,
      'one bullet glyph per bullet depth',
    );
    assert.deepEqual(
      pageMarkers.filter((marker) => /^\d+\.$/.test(marker ?? '')),
      ['1.', '1.', '1.'],
      'each nested ordered level keeps its own explicit number glyph',
    );
    await goToPage(1);

    await h.waitSaved();
  });

  it('B: 1) starts an ordered list, Enter continues it, and 1. / - / prose keep working', async () => {
    const env = ui.isolated('list-fixes-input');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();

    const parenId = 'lf-paren';
    await addBlock(parenId, { type: 'doc', children: [{ type: 'paragraph' }] });
    await typeInBlock(parenId, '1)');
    await page.keyboard.type(' ');
    await page.waitForFunction(
      (block) =>
        document.querySelector(`[data-block-card="${block}"] .nf-block-prose ol`) !== null,
      parenId,
      { timeout: 5000 },
    );
    let report = await listReport(parenId);
    assert.equal(report?.length, 1, '1) creates exactly one ordered list');
    assert.equal(report?.[0]?.tag, 'ol');
    assert.equal(report?.[0]?.listStyleType, 'decimal');
    assert.equal(report?.[0]?.start, null, 'a 1) list starts at 1, the implicit default');
    assert.equal(report?.[0]?.itemCount, 1);

    await page.keyboard.type('first item');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second item');
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(`[data-block-card="${block}"] .nf-block-prose ol > li`)
          .length === 2,
      parenId,
      { timeout: 5000 },
    );
    report = await listReport(parenId);
    assert.equal(report?.[0]?.itemCount, 2, 'Enter continues the same ordered list');
    assert.equal(report?.[0]?.listStyleType, 'decimal', 'the continuation stays decimal');
    const items = await prose(parenId)
      .locator('ol > li')
      .evaluateAll((elements) => elements.map((element) => element.textContent?.trim()));
    assert.deepEqual(items, ['first item', 'second item']);
    // The native list continues 2., 3.: two list items in one decimal <ol>.
    await centerCard(parenId);
    await h.screenshot(artifactsPath('list-fixes', 'continuous-paren-list-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // A list started at 3) keeps its start and continues 4).
    const startedAtThree = 'lf-paren-three';
    await addBlock(startedAtThree, { type: 'doc', children: [{ type: 'paragraph' }] });
    await typeInBlock(startedAtThree, '3)');
    await page.keyboard.type(' ');
    await page.waitForFunction(
      (block) =>
        document.querySelector(`[data-block-card="${block}"] .nf-block-prose ol[start="3"]`) !==
        null,
      startedAtThree,
      { timeout: 5000 },
    );
    await page.keyboard.type('third');
    await page.keyboard.press('Enter');
    await page.keyboard.type('fourth');
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(`[data-block-card="${block}"] .nf-block-prose ol > li`)
          .length === 2,
      startedAtThree,
      { timeout: 5000 },
    );
    const threeReport = await listReport(startedAtThree);
    assert.equal(threeReport?.[0]?.start, '3', 'the typed 3) sets the ordered-list start');
    assert.equal(threeReport?.[0]?.itemCount, 2, '3) continues with the next item');

    // 1. (the native rule) and - (bullets) still convert.
    const dotId = 'lf-dot';
    await addBlock(dotId, { type: 'doc', children: [{ type: 'paragraph' }] });
    await typeInBlock(dotId, '1.');
    await page.keyboard.type(' ');
    await page.waitForFunction(
      (block) =>
        document.querySelector(`[data-block-card="${block}"] .nf-block-prose ol`) !== null,
      dotId,
      { timeout: 5000 },
    );
    const dotReport = await listReport(dotId);
    assert.equal(dotReport?.[0]?.tag, 'ol');
    assert.equal(dotReport?.[0]?.listStyleType, 'decimal');
    assert.equal(dotReport?.[0]?.start, null, 'the native 1. rule is unchanged');

    const bulletId = 'lf-bullet';
    await addBlock(bulletId, { type: 'doc', children: [{ type: 'paragraph' }] });
    await typeInBlock(bulletId, '-');
    await page.keyboard.type(' ');
    await page.waitForFunction(
      (block) =>
        document.querySelector(`[data-block-card="${block}"] .nf-block-prose ul`) !== null,
      bulletId,
      { timeout: 5000 },
    );
    assert.equal((await listReport(bulletId))?.[0]?.listStyleType, 'disc');

    // Prose parentheses never convert: the marker must start the text block.
    const proseId = 'lf-prose';
    await addBlock(proseId, { type: 'doc', children: [{ type: 'paragraph' }] });
    await typeInBlock(proseId, 'see 1) here');
    assert.equal(await prose(proseId).locator('ol').count(), 0, 'prose parentheses stay text');
    assert.equal((await paragraphs(proseId).first().textContent())?.trim(), 'see 1) here');
    assert.deepEqual(await bodyChildren(proseId), ['p'], 'the paragraph is never wrapped');

    await h.waitSaved();
  });

  it('C: the 1) rule works in Page Edit and the committed Page Read markers match', async () => {
    const env = ui.isolated('list-fixes-page-edit');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();

    const blockId = 'lf-page-edit';
    // An empty block keeps the overlay flow about the input rule: the caret has
    // exactly one start position and no existing text to split.
    await addBlock(blockId, { type: 'doc', children: [{ type: 'paragraph' }] });

    await showPageRead();
    const fragment = page
      .locator('.nf-editor[data-active="true"] .nf-page-view')
      .locator(`.nf-page-fragment[data-fragment-block="${blockId}"]`)
      .first();
    await fragment.waitFor();
    // Page Edit is opt-in; the overlay shares the editor extension set.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () =>
        window.__noteforestTest.viewState()[window.__noteforestTest.state().activeTab]
          ?.interactionMode === 'edit',
      undefined,
      { timeout: 5000 },
    );
    await fragment.dblclick();
    const overlay = page.locator('.nf-editor[data-active="true"] [data-page-edit-overlay]');
    await overlay.waitFor({ timeout: 5000 });
    await overlay.locator('.nf-page-edit-prose').click();
    await page.keyboard.type('1)');
    await page.keyboard.type(' ');
    await overlay.locator('ol').waitFor({ timeout: 5000 });
    await page.keyboard.type('alpha');
    await page.keyboard.press('Enter');
    await page.keyboard.type('beta');
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-page-edit-overlay] ol > li').length === 2,
      undefined,
      { timeout: 5000 },
    );
    const inOverlay = await overlay.locator('ol').evaluate((element) => {
      const item = element.querySelector(':scope > li');
      return {
        style: getComputedStyle(element).listStyleType,
        start: element.getAttribute('start'),
        items: element.querySelectorAll(':scope > li').length,
        markerColor:
          item === null ? null : getComputedStyle(item, '::marker').color,
      };
    });
    assert.equal(inOverlay.style, 'decimal', 'Page Edit shows the ordered marker too');
    assert.equal(inOverlay.start, null);
    assert.equal(inOverlay.items, 2);
    // The overlay sits on fixed light paper: its marker uses the page muted
    // role, never the shell theme colour (dark here is rgb(148, 154, 162)).
    assert.equal(inOverlay.markerColor, 'rgb(101, 115, 124)');

    await page.keyboard.press('Meta+Enter');
    await page.waitForSelector('[data-page-edit-overlay]', { state: 'detached', timeout: 10000 });
    await ui.ensureInteractionMode('read');
    // Wait for the re-measured page to render the committed text; `data-ready`
    // alone is still true from the pre-commit model during the same tick.
    await page.waitForFunction(
      (block) => {
        const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
        const rendered = view?.querySelector(
          `.nf-page-fragment[data-fragment-block="${block}"]`,
        );
        return (
          view !== null &&
          view.getAttribute('data-ready') === 'true' &&
          view.getAttribute('data-updating') !== 'true' &&
          rendered !== null &&
          rendered !== undefined &&
          rendered.textContent?.includes('beta') === true
        );
      },
      blockId,
      { timeout: 30000 },
    );

    const content = (await ui.structure()).blocks[blockId]?.content;
    const list = content?.children?.find((child) => child.type === 'orderedList');
    assert.ok(list !== undefined, 'the committed block keeps the ordered list');
    assert.equal(list.children?.length, 2, 'both typed items are committed');

    const pages = await blockMarkersByPage(blockId);
    const markers = pages.flatMap((entry) => entry.markers);
    assert.ok(markers.includes('1.'), 'Page Read draws the explicit first number');
    assert.ok(markers.includes('2.'), 'Page Read draws the explicit second number');
    const blockPage = pages.find((entry) => entry.markers.length > 0)?.page ?? 1;
    await goToPage(blockPage);
    await h.screenshot(artifactsPath('list-fixes', 'page-read-paren-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await h.waitSaved();
  });
});
