import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageDocument, textBlock, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * S1 sidebar system (`docs/design/sidebar.md`).
 *
 * The four sections are one surface: one 28 px header pattern, one row ladder
 * (28 navigation / 40 two-line result / card), one five-value type scale, one
 * scroll owner with a reserved 10 px gutter, collapsible groups with the
 * chevron on the left, one result card with two variants, and a needs-repair
 * dot instead of a counter.
 *
 * The fixture covers everything the four sections need at once: six packages
 * (a Library list with content), one note with a five-level primary chain (the
 * Outline depth step and its cap), three lost anchors with branches (three
 * repairs and the dot at 3), and a second chapter (two Search groups).
 */

const tempRoot = artifactsPath('sidebar-system-ui');
const screenshotDir = artifactsPath('sidebar-system');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const { isolated } = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

/** The sidebar is the subject: capture it alone, at CSS pixels. */
async function shot(name, selector = '.nf-sidebar') {
  await page.locator(selector).screenshot({
    path: resolve(screenshotDir, name),
    scale: 'css',
  });
}

async function openPackage(packagePath) {
  const opened = await page.evaluate(
    (path) => window.__noteforestTest.openPath(path),
    packagePath,
  );
  assert.equal(opened, true, 'the package opens');
  await page.waitForFunction(
    (path) => window.__noteforestTest.state().activeTab === path,
    packagePath,
    { timeout: 15000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"]');
  await h.waitSaved();
}

/** Box, type and colour for one element, in CSS pixels. */
async function measure(selector) {
  return page.evaluate((wanted) => {
    const element = document.querySelector(wanted);
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      borderTopWidth: style.borderTopWidth,
      borderColor: style.borderTopColor,
      borderRadius: style.borderTopLeftRadius,
      background: style.backgroundColor,
      boxShadow: style.boxShadow,
      color: style.color,
      textTransform: style.textTransform,
      letterSpacing: style.letterSpacing,
    };
  }, selector);
}

/** The one scroll owner: its content box, its gutter, its overflow state. */
async function scrollState() {
  return page.evaluate(() => {
    const scroll = document.querySelector('.nf-sidebar-scroll');
    if (scroll === null) return null;
    const style = getComputedStyle(scroll);
    const rect = scroll.getBoundingClientRect();
    const inner = [...scroll.querySelectorAll('*')].filter((element) => {
      const elementStyle = getComputedStyle(element);
      return (
        (elementStyle.overflowY === 'auto' || elementStyle.overflowY === 'scroll') &&
        element.scrollHeight > element.clientHeight + 1
      );
    });
    return {
      gutter: style.scrollbarGutter,
      overflowY: style.overflowY,
      overflowX: style.overflowX,
      gutterWidth:
        rect.width -
        scroll.clientWidth -
        Number.parseFloat(style.borderLeftWidth) -
        Number.parseFloat(style.borderRightWidth),
      contentWidth:
        scroll.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight),
      overflowing: scroll.scrollHeight > scroll.clientHeight + 1,
      scrollTop: scroll.scrollTop,
      innerScrollers: inner.length,
    };
  });
}

/**
 * Six packages: the sidebar fixture plus five notes, so the Library has a real
 * list and the Outline/Health/Search have a document with a deep chain.
 */
function sidebarDocument() {
  const chain = [
    ['deep-1', 'deep-2'],
    ['deep-2', 'deep-3'],
    ['deep-3', 'deep-4'],
    ['deep-4', 'deep-5'],
  ];
  const document = pageDocument({
    id: 'sidebar-fixture',
    title: 'Sidebar fixture',
    chapterTitle: 'Eigenvalues',
    blocks: [
      textBlock('source', 'Source', 'An eigenvalue is a scalar that scales its eigenvector.'),
      textBlock('target-1', 'First target', 'First target text.'),
      textBlock('target-2', 'Second target', 'Second target text.'),
      textBlock('target-3', 'Third target', 'Third target text.'),
      textBlock('deep-1', 'Depth 1', 'Depth level one of the outline.'),
      textBlock('deep-2', 'Depth 2', 'Depth level two of the outline.'),
      textBlock('deep-3', 'Depth 3', 'Depth level three of the outline.'),
      textBlock('deep-4', 'Depth 4', 'Depth level four of the outline.'),
      textBlock('deep-5', 'Depth 5', 'Depth level five of the outline.'),
      // Enough top-level rows that the Outline overflows its 28 px ladder while
      // the Library list of six stays short: one section with the thumb, one
      // without, at the same width.
      ...Array.from({ length: 30 }, (_, index) =>
        textBlock(
          `reading-${index + 1}`,
          `Reading ${index + 1}`,
          `Reading block ${index + 1} keeps an eigenvalue in the text.`,
        ),
      ),
    ],
    // Three stored quotes that no longer exist, each with a primary branch:
    // three needs-repair anchors (the dot at 3) in the Anchors group.
    anchors: ['one', 'two', 'three'].map((word) => ({
      id: `lost-${word}`,
      blockId: 'source',
      kind: 'text',
      selector: { kind: 'text', quote: `gone ${word}` },
      quote: `gone ${word}`,
    })),
    branches: [
      ...chain.map(([parent, child], index) => ({
        id: `chain-${index + 1}`,
        sourceBlockId: parent,
        targetBlockId: child,
      })),
      ...['one', 'two', 'three'].map((word, index) => ({
        id: `lost-branch-${word}`,
        sourceBlockId: 'source',
        sourceAnchorId: `lost-${word}`,
        targetBlockId: `target-${index + 1}`,
      })),
    ],
  });
  // A second chapter, so Search has two collapsible groups.
  document.chapters.push({
    id: 'chapter-2',
    title: 'Second chapter',
    topLevelBlockIds: ['second'],
  });
  document.blocks['second'] = textBlock(
    'second',
    'Second',
    'A quokka and one more eigenvalue in the second chapter.',
  );
  return document;
}

/** Write the six packages before launch, so the initial library scan sees them. */
async function writeLibrary(env) {
  const fixture = await writePagePackage(
    env.NOTEFOREST_LIBRARY,
    'Sidebar fixture',
    sidebarDocument(),
  );
  for (let index = 1; index <= 5; index += 1) {
    await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      `Reading note ${index}`,
      pageDocument({
        id: `reading-note-${index}`,
        title: `Reading note ${index}`,
        chapterTitle: 'Notes',
        blocks: [
          textBlock(`note-body-${index}`, 'Note', `The body of reading note ${index}.`),
        ],
      }),
    );
  }
  return fixture;
}

/** Reach a clean, issue-free document: the dot must disappear. */
async function cleanPackagePath(env) {
  return writePagePackage(
    env.NOTEFOREST_LIBRARY,
    'Clean note',
    pageDocument({
      id: 'clean-note',
      title: 'Clean note',
      chapterTitle: 'Clean',
      blocks: [textBlock('clean-body', 'Clean', 'Nothing to repair here.')],
    }),
  );
}

/** Drag the separator so the persisted content column lands on `target`. */
async function dragSidebarTo(target) {
  const separator = await page.locator('.nf-separator').boundingBox();
  const card = await page.locator('.nf-sidebar').boundingBox();
  assert.ok(separator !== null && card !== null);
  const x = separator.x + separator.width / 2;
  const y = separator.y + 120;
  const delta = target + 48 - card.width;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 10));
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(x + (delta * step) / steps, y);
  }
  await page.mouse.up();
  await page.waitForFunction(
    (width) =>
      Math.abs(
        (document.querySelector('.nf-sidebar')?.getBoundingClientRect().width ?? 0) -
          (width + 48),
      ) <= 2,
    target,
    { timeout: 5000 },
  );
}

describe('Sidebar system', () => {
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

  it('gives the four sections one header, one title size and one content box', async () => {
    const env = isolated('rhythm');
    const fixture = await writeLibrary(env);
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(fixture);

    // Library: the switcher is the title slot (13/600), 11 px count, 22 px
    // controls; a document row is a 28 px navigation row at 12.5.
    await ui.showLibrary();
    await page.waitForSelector('[data-library-panel], [data-sidebar-panel="library"]');
    const library = await measure('.nf-library-head');
    assert.ok(library !== null);
    assert.equal(Math.round(library.height), 28, 'the Library header is 28 px');
    assert.equal(library.paddingTop, '2px');
    assert.equal(library.paddingBottom, '4px');
    assert.equal(library.paddingLeft, '6px', 'the header inset is 6 px');
    const switcherName = await measure('.nf-library-name');
    assert.ok(switcherName !== null);
    assert.equal(switcherName.fontSize, '13px', 'the switcher is the title');
    assert.equal(switcherName.fontWeight, '600');
    assert.equal(switcherName.color, 'rgb(231, 232, 234)', 'the title is text-1');
    const libraryCount = await measure('[data-library-count]');
    assert.ok(libraryCount !== null);
    assert.equal(libraryCount.fontSize, '11px', 'the header count is 11 px');
    assert.equal(libraryCount.color, 'rgb(148, 154, 162)', 'the count is text-3');
    const libraryRow = await measure('.nf-library-row');
    assert.ok(libraryRow !== null);
    assert.equal(Math.round(libraryRow.height), 28, 'a document row is 28 px');
    const libraryRowText = await measure('.nf-library-open');
    assert.equal(libraryRowText?.fontSize, '12.5px', 'a navigation row is 12.5 px');
    const add = await measure('.nf-section-add');
    assert.equal(Math.round(add?.width ?? 0), 22, 'header controls are 22 px');
    assert.equal(
      await page.locator('[data-library-count]').innerText(),
      '6',
      'six packages are listed',
    );
    await shot('library.png');

    // Outline: the same 28 px header and 13/600 title, 28 px rows at 12.5,
    // depth 12 px per level capped after three levels.
    await ui.showOutline();
    const outlineHead = await measure('.nf-sidebar-section[aria-label="Outline"] .nf-section-head');
    assert.ok(outlineHead !== null);
    assert.equal(Math.round(outlineHead.height), 28, 'the Outline header is 28 px');
    const outlineTitle = await measure(
      '.nf-sidebar-section[aria-label="Outline"] .nf-section-title',
    );
    assert.ok(outlineTitle !== null);
    assert.equal(outlineTitle.fontSize, '13px', 'the Outline title is 13 px');
    assert.equal(outlineTitle.fontWeight, '600');
    const depths = await page.evaluate(() => {
      const read = (id) => {
        const row = document.querySelector(`[data-block-id="${id}"]`);
        if (row === null) return null;
        return {
          indent: Number.parseFloat(getComputedStyle(row).paddingInlineStart),
          height: Math.round(row.getBoundingClientRect().height),
          fontSize: getComputedStyle(row).fontSize,
        };
      };
      return {
        deep: ['deep-1', 'deep-2', 'deep-3', 'deep-4', 'deep-5'].map(read),
        chapter: (() => {
          const row = document.querySelector('.nf-tree-chapter-row');
          return row === null
            ? null
            : {
                indent: Number.parseFloat(getComputedStyle(row).paddingInlineStart),
                height: Math.round(row.getBoundingClientRect().height),
                fontSize: getComputedStyle(row).fontSize,
              };
        })(),
      };
    });
    assert.ok(depths.chapter !== null);
    assert.equal(depths.chapter.indent, 6, 'the chapter row is level 0');
    assert.equal(Math.round(depths.chapter.height), 28, 'the chapter row is 28 px');
    assert.equal(depths.chapter.fontSize, '12.5px', 'the Outline is not inherited 13 px');
    assert.deepEqual(
      depths.deep.map((row) => row?.indent),
      [18, 30, 42, 42, 42],
      'depth steps 12 px and stops after three levels',
    );
    for (const row of depths.deep) {
      assert.equal(row?.height, 28, 'every Outline row is 28 px');
      assert.equal(row?.fontSize, '12.5px');
    }
    const treeCount = await measure('.nf-tree-count');
    assert.equal(treeCount?.fontSize, '10.5px', 'a row count is the 10.5 meta step');
    await shot('outline.png');

    // Search: shared header, the count, the ab toggle and close after it.
    await page.locator('[data-sidebar-tab="search"]').click();
    await page.waitForSelector('[data-search-input="true"]');
    await page.locator('[data-search-input="true"]').fill('eigen');
    await page.waitForFunction(
      () => window.__noteforestTest.state().findResults.length >= 3,
      undefined,
      { timeout: 10000 },
    );
    const searchHead = await measure('.nf-search-head');
    assert.ok(searchHead !== null);
    assert.equal(Math.round(searchHead.height), 28, 'the Search header is 28 px');
    const searchTitle = await measure('.nf-search-title');
    assert.equal(searchTitle?.fontSize, '13px');
    assert.equal(searchTitle?.fontWeight, '600');
    const searchCount = await measure('[data-search-count]');
    assert.equal(searchCount?.fontSize, '11px', 'the Search count is 11 px');
    const toggle = await measure('[data-search-whole-word="true"]');
    assert.equal(Math.round(toggle?.width ?? 0), 22, 'the ab toggle is 22 px');
    const close = await measure('[data-search-close="true"]');
    assert.equal(Math.round(close?.width ?? 0), 22, 'the close control is 22 px');
    assert.ok(
      (searchCount?.left ?? 0) < (toggle?.left ?? 0) &&
        (toggle?.right ?? 0) <= (close?.left ?? 0) + 0.5,
      'the toggle and close follow the count',
    );
    await shot('search.png');

    // Health: the header carries the title and the summary count only; the
    // manual re-check stays next to the filter field (S2.1, restated).
    await page.locator('[data-sidebar-tab="health"]').click();
    await page.waitForSelector('[data-sidebar-panel="health"]');
    await page.waitForSelector('[data-health-row]');
    const healthHead = await measure('.nf-health-head');
    assert.ok(healthHead !== null);
    assert.equal(Math.round(healthHead.height), 28, 'the Health header is 28 px');
    const healthTitle = await measure('.nf-health-title');
    assert.equal(healthTitle?.fontSize, '13px');
    assert.equal(healthTitle?.fontWeight, '600');
    const healthSummary = await measure('[data-health-summary]');
    assert.equal(healthSummary?.fontSize, '11px');
    assert.equal(
      (await page.locator('[data-health-summary]').innerText()).trim(),
      '3 to fix · 3 issues',
      'the header carries the exact count',
    );
    assert.equal(
      await page.locator('.nf-health-head [data-health-refresh]').count(),
      0,
      'the refresh is not in the header',
    );
    const refresh = await measure('[data-health-refresh="true"]');
    const field = await measure('.nf-health-search-row .nf-health-search');
    assert.ok(refresh !== null && field !== null);
    assert.ok(refresh.left >= field.right, 'the refresh follows the filter field');
    assert.equal(
      Math.abs(refresh.top + refresh.height / 2 - (field.top + field.height / 2)) <= 0.5,
      true,
      'the refresh sits on the filter row',
    );
    await shot('health.png');

    // One scroll owner, one content box: 312 − 2 border − 48 bar − 8 − 8 − 10.
    const scroll = await scrollState();
    assert.ok(scroll !== null);
    assert.equal(scroll.gutter, 'stable', 'the scroll container reserves its gutter');
    assert.equal(scroll.overflowY, 'auto');
    assert.equal(scroll.overflowX, 'hidden');
    assert.equal(Math.round(scroll.gutterWidth), 10, 'the reserved gutter is 10 px');
    assert.equal(Math.round(scroll.contentWidth), 236, 'the content box never changes');
    assert.equal(scroll.innerScrollers, 0, 'nothing inside the panel scrolls');
  });

  it('keeps the content box fixed when the panel starts to overflow', async () => {
    const env = isolated('overflow');
    const fixture = await writeLibrary(env);
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(fixture);

    // The Library list is short: no thumb, but the gutter is already reserved.
    await ui.showLibrary();
    const roomy = await scrollState();
    assert.ok(roomy !== null);
    assert.equal(roomy.overflowing, false, 'no thumb without overflow');
    assert.equal(Math.round(roomy.contentWidth), 236, 'the content box at rest');
    assert.equal(Math.round(roomy.gutterWidth), 10, 'the gutter is reserved from the start');
    const libraryHead = await page.evaluate(() => {
      const head = document.querySelector('.nf-library-head');
      const row = document.querySelector('.nf-library-row');
      if (head === null || row === null) return null;
      const headBox = head.getBoundingClientRect();
      return {
        left: headBox.left,
        right: headBox.right,
        width: headBox.width,
        rowRight: row.getBoundingClientRect().right,
      };
    });
    assert.ok(libraryHead !== null);
    await shot('library-roomy.png');

    // The Outline is long enough to scroll: same content box, same right edge,
    // so a section that starts to overflow never shifts sideways.
    await ui.showOutline();
    await page.waitForFunction(
      () => {
        const scroll = document.querySelector('.nf-sidebar-scroll');
        return scroll !== null && scroll.scrollHeight > scroll.clientHeight + 1;
      },
      undefined,
      { timeout: 10000 },
    );
    const tight = await scrollState();
    assert.ok(tight !== null);
    assert.equal(tight.overflowing, true, 'the thumb has something to scroll');
    assert.equal(Math.round(tight.contentWidth), 236, 'the content box did not shrink');
    assert.equal(Math.round(tight.gutterWidth), 10, 'the gutter is still reserved');
    const outlineHead = await page.evaluate(() => {
      const head = document.querySelector('.nf-sidebar-section[aria-label="Outline"] .nf-section-head');
      const row = document.querySelector('.nf-tree-row[data-block-id="deep-1"]');
      if (head === null || row === null) return null;
      const headBox = head.getBoundingClientRect();
      return {
        left: headBox.left,
        right: headBox.right,
        width: headBox.width,
        rowRight: row.getBoundingClientRect().right,
      };
    });
    assert.ok(outlineHead !== null);
    assert.ok(
      Math.abs(libraryHead.width - outlineHead.width) <= 0.5,
      `the header width is the same with and without the thumb (${libraryHead.width} vs ${outlineHead.width})`,
    );
    assert.ok(
      Math.abs(libraryHead.right - outlineHead.right) <= 0.5,
      'the right edge does not move',
    );
    assert.ok(
      Math.abs(libraryHead.rowRight - outlineHead.rowRight) <= 0.5,
      'rows end on the same right edge',
    );
    assert.equal(tight.innerScrollers, 0, 'the panel is still the only scroll owner');
    await shot('long-list-scroll.png');
  });

  it('draws one result card and puts the divider on the group', async () => {
    const env = isolated('cards');
    const fixture = await writeLibrary(env);
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(fixture);

    // Search: the occurrence card anatomy and the current variant.
    await page.locator('[data-sidebar-tab="search"]').click();
    await page.waitForSelector('[data-search-input="true"]');
    await page.locator('[data-search-input="true"]').fill('eigen');
    await page.waitForFunction(
      () => window.__noteforestTest.state().findResults.length >= 3,
      undefined,
      { timeout: 10000 },
    );
    const restingRow = page.locator('[data-search-row]').nth(1);
    const resting = await restingRow.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        borderTopWidth: style.borderTopWidth,
        borderColor: style.borderTopColor,
        radius: style.borderTopLeftRadius,
        padding: `${style.paddingTop} ${style.paddingRight}`,
        background: style.backgroundColor,
        boxShadow: style.boxShadow,
        fontSize: getComputedStyle(element.querySelector('.nf-search-snippet')).fontSize,
        lineHeight: Number.parseFloat(
          getComputedStyle(element.querySelector('.nf-search-snippet')).lineHeight,
        ),
        left: box.left,
      };
    });
    assert.equal(resting.borderTopWidth, '1px', 'the card has a 1 px outline');
    assert.equal(resting.radius, '4px', 'the card radius is 4');
    assert.equal(resting.padding, '7px 8px', 'the shared card padding');
    assert.equal(resting.fontSize, '12px', 'the result text is 12 px');
    assert.equal(resting.boxShadow, 'none', 'a resting card has no ring');
    const current = page.locator('[data-search-current="true"]');
    assert.equal(await current.count(), 1, 'exactly one current card');
    const currentStyle = await current.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderColor: style.borderTopColor,
        boxShadow: style.boxShadow,
        radius: style.borderTopLeftRadius,
        text: (element.textContent ?? '').trim().length,
      };
    });
    // The ring is the accent: same colour as the card's border, 1 px spread.
    assert.match(currentStyle.boxShadow, /^rgb\([^)]+\) 0px 0px 0px 1px$/, 'the current card has the accent ring');
    assert.equal(
      currentStyle.boxShadow.match(/^rgba?\([^)]+\)/)?.[0],
      currentStyle.borderColor,
      'the ring and the border share the accent',
    );
    assert.notEqual(currentStyle.borderColor, resting.borderColor);
    assert.equal(currentStyle.radius, '4px', 'the current card is not a pill');
    // The card is indented 12 px under its chapter label.
    assert.ok(
      Math.abs(
        resting.left -
          (await page
            .locator('[data-search-results="true"]')
            .evaluate((element) => element.getBoundingClientRect().left)),
      ) >= 11,
      'the card sits 12 px under the group label',
    );
    // The divider belongs to the group: the last card of group 1 is at least
    // 8 px above group 2's rule.
    const searchGap = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('[data-search-chapter]')];
      const first = groups[0];
      const second = groups[1];
      if (first === undefined || second === undefined) return null;
      const cards = first.querySelectorAll('[data-search-row]');
      const last = cards[cards.length - 1];
      if (last === undefined) return null;
      return {
        gap: second.getBoundingClientRect().top - last.getBoundingClientRect().bottom,
        border: getComputedStyle(second).borderTopWidth,
        headerBorder: getComputedStyle(
          second.querySelector('[data-search-chapter-toggle]'),
        ).borderTopWidth,
        padding: getComputedStyle(second).paddingTop,
      };
    });
    assert.ok(searchGap !== null);
    assert.ok(searchGap.gap >= 8, `Search keeps 8 px under the last card (${searchGap.gap})`);
    assert.equal(searchGap.border, '1px', 'the group owns the rule');
    assert.equal(searchGap.headerBorder, '0px', 'the header that follows has none');
    assert.equal(searchGap.padding, '8px', 'the group padding is symmetric');
    await shot('search-cards.png');

    // Health: the same card, the selected variant, the same divider rule.
    await page.locator('[data-sidebar-tab="health"]').click();
    await page.waitForSelector('[data-health-row]');
    const healthCard = page.locator('[data-health-row] [data-health-row-button="true"]').first();
    const card = await healthCard.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        card: element.classList.contains('nf-result-row'),
        borderTopWidth: style.borderTopWidth,
        radius: style.borderTopLeftRadius,
        padding: `${style.paddingTop} ${style.paddingRight}`,
        quoteSize: getComputedStyle(element.querySelector('.nf-health-row-quote')).fontSize,
        metaSize: getComputedStyle(element.querySelector('.nf-health-row-meta')).fontSize,
        lines: element.querySelectorAll('.nf-health-row-quote, .nf-health-row-meta').length,
      };
    });
    assert.equal(card.card, true, 'Health uses the shared result card');
    assert.equal(card.borderTopWidth, '1px');
    assert.equal(card.radius, '4px', 'the 3 px row radius is gone');
    assert.equal(card.padding, '7px 8px');
    assert.equal(card.quoteSize, '12px');
    assert.equal(card.metaSize, '10.5px');
    assert.equal(card.lines, 2, 'two lines: quote, then state · block');
    const groupRow = await measure('.nf-health-section-row');
    assert.ok(groupRow !== null);
    assert.equal(Math.round(groupRow.height), 28, 'a Health group row is 28 px');
    const groupName = await measure('.nf-health-section-name');
    assert.equal(groupName?.fontSize, '9.5px');
    assert.equal(groupName?.fontWeight, '600');
    assert.equal(groupName?.textTransform, 'uppercase');
    const groupCount = await measure('.nf-health-section-count');
    assert.equal(groupCount?.fontSize, '10.5px');
    const chevron = await measure('.nf-health-section-chevron');
    assert.equal(Math.round(chevron?.width ?? 0), 16, 'the chevron box is 16 px');
    assert.ok(
      (chevron?.left ?? 0) <= (groupName?.left ?? 0),
      'the chevron is on the left of the label',
    );

    // Selection is the `data-selected` variant: surface-2 + border-2, no ring.
    await healthCard.click();
    await page.waitForSelector('[data-health-dialog="true"]');
    await page.locator('[data-health-dialog="true"] [data-health-close="true"]').last().click();
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });
    const selected = await page
      .locator('[data-health-row] [data-health-row-button="true"][data-selected="true"]')
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { shadow: style.boxShadow, border: style.borderTopColor };
      });
    assert.equal(selected.shadow, 'none', 'the selected card has no accent ring');
    const healthGap = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('.nf-health-group')];
      if (groups.length < 2) return null;
      const first = groups[0];
      const second = groups[1];
      const rows = first.querySelectorAll('[data-health-row]');
      const last = rows[rows.length - 1];
      if (last === undefined) return null;
      return {
        gap: second.getBoundingClientRect().top - last.getBoundingClientRect().bottom,
        border: getComputedStyle(second).borderTopWidth,
        headerBorder: getComputedStyle(
          second.querySelector('.nf-health-section-row'),
        ).borderTopWidth,
      };
    });
    assert.ok(healthGap !== null);
    assert.ok(healthGap.gap >= 8, `Health keeps 8 px under the last card (${healthGap.gap})`);
    assert.equal(healthGap.border, '1px', 'the group owns the rule');
    assert.equal(healthGap.headerBorder, '0px');

    // A closed group keeps its count: the list is never a dead end.
    const anchorsToggle = page.locator(
      '[data-health-section-toggle="true"][data-health-section="anchors"]',
    );
    await anchorsToggle.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-health-section-toggle="true"][data-health-section="anchors"]')
          ?.getAttribute('aria-expanded') === 'false',
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await page.locator('[data-health-section="anchors"] [data-health-row]').count(), 0);
    assert.equal(
      (await page
        .locator('[data-health-section="anchors"] [data-health-section-count]')
        .innerText()).trim(),
      '3',
      'a closed Health group keeps its count',
    );
    await shot('health-closed-group.png');

    // The 8 px floor holds at the narrowest and widest panel widths too.
    for (const width of [180, 640]) {
      await dragSidebarTo(width);
      const gap = await page.evaluate(() => {
        const groups = [...document.querySelectorAll('.nf-health-group')];
        if (groups.length < 2) return null;
        const first = groups[0];
        const second = groups[1];
        const rows = first.querySelectorAll('[data-health-row]');
        const last = rows[rows.length - 1];
        if (last === undefined) return second.getBoundingClientRect().top;
        return second.getBoundingClientRect().top - last.getBoundingClientRect().bottom;
      });
      assert.ok(gap !== null);
      assert.ok(gap >= 8, `the group keeps 8 px at ${width} px (${gap})`);
    }
  });

  it('shows the needs-repair count as a dot, and nothing at zero', async () => {
    const env = isolated('dot');
    const fixture = await writeLibrary(env);
    const clean = await cleanPackagePath(env);
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(fixture);
    await page.waitForFunction(
      () => document.querySelector('[data-health-badge]') !== null,
      undefined,
      { timeout: 15000 },
    );

    const dot = await page.evaluate(() => {
      const element = document.querySelector('[data-health-badge]');
      if (element === null) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const button = element.closest('.nf-activity-button');
      const buttonBox = button?.getBoundingClientRect();
      return {
        label: element.getAttribute('aria-label'),
        title: element.getAttribute('title'),
        text: (element.textContent ?? '').trim(),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        radius: style.borderRadius,
        background: style.backgroundColor,
        top: buttonBox === undefined ? null : Math.round(rect.top - buttonBox.top),
        right: buttonBox === undefined ? null : Math.round(buttonBox.right - rect.right),
        count: element.getAttribute('data-health-badge'),
      };
    });
    assert.ok(dot !== null);
    assert.equal(dot.count, '3');
    assert.equal(dot.width, 6, 'the dot is 6 px wide');
    assert.equal(dot.height, 6, 'the dot is 6 px tall');
    assert.equal(dot.radius, '50%', 'the dot is a circle');
    assert.equal(dot.background, 'rgb(217, 139, 139)', 'the dot is --danger');
    assert.equal(dot.top, 4, 'the dot sits 4 px from the top');
    assert.equal(dot.right, 4, 'the dot sits 4 px from the right');
    assert.equal(dot.text, '', 'the dot carries no number');
    assert.equal(dot.label, '3 anchors need repair', 'the count lives in the label');
    assert.equal(dot.title, '3 anchors need repair', 'and in the tooltip');
    await shot('dot-3.png');
    await page.screenshot({
      path: resolve(screenshotDir, 'dot-3-window.png'),
      scale: 'css',
    });

    // A clean document: no dot, no empty box.
    await openPackage(clean);
    await page.waitForFunction(
      () => document.querySelector('[data-health-badge]') === null,
      undefined,
      { timeout: 15000 },
    );
    assert.equal(await page.locator('[data-health-badge]').count(), 0, 'nothing at zero');
    await page.locator('[data-sidebar-tab="health"]').click();
    await page.waitForSelector('[data-sidebar-panel="health"]');
    assert.equal(
      (await page.locator('[data-health-summary]').innerText()).trim(),
      '0 to fix · 0 issues',
      'the Health header keeps the exact count at zero',
    );
    await shot('dot-0.png');
  });
});
