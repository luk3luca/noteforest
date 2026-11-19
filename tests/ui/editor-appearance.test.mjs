import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { artifactsPath, root } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  pageDocument,
  paragraph,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';
import { inspectPdfFile, textContains } from '../../scripts/lib/pdf.mjs';

/**
 * Editor appearance phase 1.
 *
 * Part A: Monokai (dark) / One Light (light) syntax colours reach Continuous,
 * Page Read/Edit, and the PDF from the same segment HTML; Page and print stay
 * One Light on the fixed-light paper in any app theme; text stays real.
 * Part B: the compact table toolbar never covers the header row or active cell,
 * stays inside the viewport, and keeps every command and ARIA role.
 */

const tempRoot = artifactsPath('editor-appearance-ui');
const outputRoot = artifactsPath('editor-appearance', 'export');
const screenshotDir = artifactsPath('editor-appearance');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const evidence = [];
let page;

const CODE_TEXT = [
  'def greeting(name):',
  '    message = "hello " + name  # greet',
  '    version = 2',
  '    return message',
].join('\n');
const CODE_FIRST_LINE = 'def greeting(name):';

const MONOKAI = {
  keyword: 'rgb(249, 38, 114)',
  string: 'rgb(230, 219, 116)',
  comment: 'rgb(117, 113, 94)',
  number: 'rgb(174, 129, 255)',
  function: 'rgb(166, 226, 46)',
};

const ONE_LIGHT = {
  keyword: 'rgb(166, 38, 164)',
  string: 'rgb(80, 161, 79)',
  comment: 'rgb(160, 161, 167)',
  number: 'rgb(152, 104, 1)',
  function: 'rgb(64, 120, 242)',
};

/**
 * B2: the default code theme is `auto`, which follows the app theme
 * (dark → Dark+, light → Light+), each on its own code surface. The classics
 * above stay in the registry and on the paper (One Light).
 */
const DARK_PLUS = {
  keyword: 'rgb(86, 156, 214)',
  string: 'rgb(206, 145, 120)',
  comment: 'rgb(106, 153, 85)',
  number: 'rgb(181, 206, 168)',
  function: 'rgb(220, 220, 170)',
};

const LIGHT_PLUS = {
  keyword: 'rgb(0, 0, 255)',
  string: 'rgb(163, 21, 21)',
  comment: 'rgb(0, 128, 0)',
  number: 'rgb(9, 134, 88)',
  function: 'rgb(121, 94, 38)',
};

async function launch(name, overrides = {}) {
  page = await ui.launch({ ...ui.isolated(name), ...overrides });
  await h.setWindowSize(1440, 900);
}

function codeBlock(id, label, text, language = 'python', anchorIds = []) {
  return {
    id,
    label,
    content: {
      type: 'doc',
      children: [
        {
          type: 'codeBlock',
          attrs: { text, language, ...(anchorIds.length === 0 ? {} : { anchorIds }) },
          children: [{ type: 'text', text }],
        },
      ],
    },
  };
}

function cell(type, text) {
  return {
    type,
    children: [paragraph(text)],
  };
}

function tableBlock(id, label) {
  return {
    id,
    label,
    content: {
      type: 'doc',
      children: [
        {
          type: 'table',
          attrs: { headerRow: true },
          children: [
            {
              type: 'tableRow',
              children: [
                cell('tableHeader', 'Name'),
                cell('tableHeader', 'Value'),
                cell('tableHeader', 'Notes'),
              ],
            },
            {
              type: 'tableRow',
              children: [
                cell('tableCell', 'alpha'),
                cell('tableCell', '1'),
                cell('tableCell', 'first row'),
              ],
            },
            {
              type: 'tableRow',
              children: [
                cell('tableCell', 'beta'),
                cell('tableCell', '2'),
                cell('tableCell', 'second row'),
              ],
            },
          ],
        },
      ],
    },
  };
}

function appearanceDocument() {
  return pageDocument({
    id: 'editor-appearance',
    title: 'Editor appearance',
    chapterTitle: 'Syntax and tables',
    blocks: [
      textBlock('ea-intro', 'Intro', 'Syntax colours and a table toolbar.'),
      codeBlock('ea-code', 'Code', CODE_TEXT, 'python', ['a-code-token']),
      textBlock('ea-child', 'Code child', 'Anchored branch from the code token.'),
      tableBlock('ea-table', 'Table'),
    ],
    anchors: [
      {
        id: 'a-code-token',
        blockId: 'ea-code',
        kind: 'code',
        selector: {
          kind: 'code',
          form: 'range',
          quote: 'greeting',
          prefix: 'def ',
          suffix: '(name):',
          occurrenceHint: 1,
          startOffset: 4,
          endOffset: 12,
          lineStart: 1,
          lineEnd: 1,
        },
        quote: 'greeting',
        codeToken: 'greeting',
        codeLine: 1,
        occurrenceHint: 1,
      },
    ],
    branches: [
      {
        id: 'ea-branch',
        sourceBlockId: 'ea-code',
        sourceAnchorId: 'a-code-token',
        targetBlockId: 'ea-child',
      },
    ],
  });
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
    { timeout: 20000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card="ea-code"]');
  return packagePath;
}

function activeEditor() {
  return page.locator('.nf-editor[data-active="true"]');
}

async function tokenColors(scopeSelector) {
  return page.evaluate((scope) => {
    const container = document.querySelector(scope);
    if (container === null) return null;
    const read = (className) => {
      const element = container.querySelector(`.${className}`);
      return element === null ? null : getComputedStyle(element).color;
    };
    return {
      keyword: read('hljs-keyword'),
      string: read('hljs-string'),
      comment: read('hljs-comment'),
      number: read('hljs-number'),
      function: read('hljs-title'),
    };
  }, scopeSelector);
}

async function waitContinuousCode() {
  await page.waitForSelector(
    '.nf-editor[data-active="true"] [data-block-card="ea-code"] .hljs-keyword',
    { timeout: 20000 },
  );
}

async function waitTheme(theme) {
  await page.waitForFunction(
    (expected) => document.documentElement.dataset.theme === expected,
    theme,
    { timeout: 10000 },
  );
}

/** The four registry themes' own surface and ink (B2). */
const CODE_THEME_CHROME = {
  'dark-plus': { surface: '#1e1e1e', text: '#d4d4d4' },
  'light-plus': { surface: '#ffffff', text: '#000000' },
  monokai: { surface: '#272822', text: '#f8f8f2' },
  'one-light': { surface: '#fafafa', text: '#383a42' },
};

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return `rgb(${Number.parseInt(value.slice(0, 2), 16)}, ${Number.parseInt(
    value.slice(2, 4),
    16,
  )}, ${Number.parseInt(value.slice(4, 6), 16)})`;
}

/** CSSOM can serialize `#ffffff` as `#fff`; compare the same normalized hex. */
function normalizeHex(value) {
  const hex = value.trim().replace('#', '').toLowerCase();
  const full = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  return `#${full}`;
}

/**
 * Select a code theme through the real settings control and wait for the
 * resolved root attribute. `auto` resolves to the app theme's default.
 */
async function chooseCodeTheme(value, resolved) {
  await page.locator('[data-code-theme-select]').selectOption(value);
  await page.waitForFunction(
    (codeTheme) => window.__noteforestTest.settings()?.app?.appearance?.codeTheme === codeTheme,
    value,
    { timeout: 15000 },
  );
  await page.waitForFunction(
    (expected) => document.documentElement.dataset.codeTheme === expected,
    resolved,
    { timeout: 10000 },
  );
}

/** The fence row and copy chip backgrounds and ink, plus the code tokens. */
async function codeChromeState() {
  return page.evaluate(() => {
    const fence = document.querySelector('.nf-editor[data-active="true"] .nf-code-fence');
    const chip = document.querySelector('.nf-editor[data-active="true"] .nf-code-copy');
    const root = getComputedStyle(document.documentElement);
    return {
      surface: root.getPropertyValue('--code-surface').trim(),
      ink: root.getPropertyValue('--code-text').trim(),
      fenceBackground: fence === null ? null : getComputedStyle(fence).backgroundColor,
      fenceColor: fence === null ? null : getComputedStyle(fence).color,
      chipBackground: chip === null ? null : getComputedStyle(chip).backgroundColor,
      chipColor: chip === null ? null : getComputedStyle(chip).color,
      shellSurface2: root.getPropertyValue('--surface-2').trim(),
    };
  });
}

/**
 * Plan #3: in a mixed polarity pair the fence row and the copy chip follow the
 * code theme's own surface and ink, not the app-theme surface/text chrome.
 */
async function assertMixedPolarityChrome(themeId, appTheme, screenshotName) {
  const expected = CODE_THEME_CHROME[themeId];
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    appTheme,
    `${themeId} runs on the ${appTheme} app`,
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.codeTheme),
    themeId,
    `${themeId} is the resolved code theme`,
  );
  const state = await codeChromeState();
  assert.equal(
    normalizeHex(state.surface),
    normalizeHex(expected.surface),
    `${themeId} surface token`,
  );
  assert.equal(normalizeHex(state.ink), normalizeHex(expected.text), `${themeId} ink token`);
  assert.equal(
    state.fenceBackground,
    hexToRgb(expected.surface),
    `${themeId} fence sits on the code surface`,
  );
  assert.equal(
    state.fenceColor,
    hexToRgb(expected.text),
    `${themeId} fence uses the code ink`,
  );
  assert.equal(
    state.chipColor,
    hexToRgb(expected.text),
    `${themeId} copy chip uses the code ink`,
  );
  assert.notEqual(
    state.chipBackground,
    hexToRgb(state.shellSurface2),
    `${themeId} copy chip leaves the shell surface`,
  );
  await h.screenshot(resolve(screenshotDir, screenshotName), { width: 1440, height: 900 });
  return { appTheme, themeId, ...state, screenshot: screenshotName };
}

async function openSettings(pageId = 'appearance') {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  await page.keyboard.press('Meta+,');
  await page.waitForSelector('[data-settings-dialog="true"]');
  await page.locator(`[data-settings-nav="${pageId}"]`).click();
  await page.locator('.nf-settings-page-title').first().waitFor();
}

async function chooseTheme(value) {
  await page.locator(`[data-appearance-theme-option="${value}"]`).click();
  await page.waitForFunction(
    (expected) => window.__noteforestTest.settings()?.app?.appearance?.theme === expected,
    value,
    { timeout: 5000 },
  );
  await waitTheme(value);
}

async function closeSettings() {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
}

function activePageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

async function waitPageRead() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
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

async function pageCount() {
  return Number(await activePageView().getAttribute('data-page-count'));
}

async function enterPageEdit() {
  await page.keyboard.press('Meta+e');
  await page.waitForFunction(
    () => document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-interaction-mode') === 'edit',
    undefined,
    { timeout: 5000 },
  );
}

function table() {
  return activeEditor().locator('.nf-block-prose table').first();
}

async function toolbarGeometry() {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[data-testid="table-toolbar"]');
    if (toolbar === null) return null;
    const tableElement = document.querySelector(
      '.nf-editor[data-active="true"] .nf-block-prose table',
    );
    const headerRow = tableElement?.querySelector('tr');
    const selection = window.getSelection();
    const anchor = selection?.anchorNode ?? null;
    const cell =
      anchor === null
        ? null
        : anchor instanceof Element
          ? anchor.closest('td, th')
          : anchor.parentElement?.closest('td, th') ?? null;
    const rect = (element) =>
      element === null || element === undefined
        ? null
        : (() => {
            const bounds = element.getBoundingClientRect();
            return {
              top: bounds.top,
              bottom: bounds.bottom,
              left: bounds.left,
              right: bounds.right,
              width: bounds.width,
              height: bounds.height,
            };
          })();
    return {
      toolbar: rect(toolbar),
      table: rect(tableElement),
      headerRow: rect(headerRow),
      cell: rect(cell),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      buttons: [...toolbar.querySelectorAll('button')].map((button) => ({
        action: button.dataset['action'] ?? '',
        label: button.getAttribute('aria-label') ?? '',
        pressed: button.getAttribute('aria-pressed'),
      })),
      role: toolbar.querySelector('[role="toolbar"]')?.getAttribute('role') ?? null,
      toolbarLabel: toolbar
        .querySelector('[role="toolbar"]')
        ?.getAttribute('aria-label') ?? null,
    };
  });
}

/** Wait until the toolbar is fully below the table (header caret placement). */
async function waitToolbarBelowTable() {
  await page.waitForFunction(
    () => {
      const toolbar = document.querySelector('[data-testid="table-toolbar"]');
      const tableElement = document.querySelector(
        '.nf-editor[data-active="true"] .nf-block-prose table',
      );
      if (toolbar === null || tableElement === null) return false;
      return toolbar.getBoundingClientRect().top >= tableElement.getBoundingClientRect().bottom - 1;
    },
    undefined,
    { timeout: 10000 },
  );
}

async function mockFolderDialog(folderPath) {
  await h.app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
  }, folderPath);
}

async function invokeAppMenu(id) {
  await h.app.evaluate(
    ({ Menu, BrowserWindow }, menuId) => {
      const item = Menu.getApplicationMenu()?.getMenuItemById(menuId);
      if (item === null || item === undefined) throw new Error(`missing menu item ${menuId}`);
      item.click(item, BrowserWindow.getAllWindows()[0], undefined);
    },
    id,
  );
}

async function exportState() {
  return page.evaluate(() => window.__noteforestTest.exportState());
}

async function waitExportStatus(status, timeout = 180000) {
  await page.waitForFunction(
    (expected) => window.__noteforestTest.exportState().status === expected,
    status,
    { timeout },
  );
  return exportState();
}

async function exportPdf(folder) {
  await mockFolderDialog(folder);
  await invokeAppMenu('menu-export-pdf');
  await page.waitForSelector('[data-export-status="configure"]', { timeout: 10000 });
  await page.locator('[data-export-filename]').fill('Code palette');
  await page.locator('[data-export-choose-folder]').click();
  await page.waitForFunction(
    (expected) =>
      document.querySelector('[data-export-folder]')?.textContent?.trim() === expected,
    folder,
    { timeout: 10000 },
  );
  await page.locator('[data-export-start]').click();
  return waitExportStatus('done');
}

async function rasterizePageOne(pdfPath, prefix) {
  execFileSync(
    process.execPath,
    [resolve(root, 'scripts/raster-pdf.mjs'), pdfPath, prefix, '150', '1'],
    { stdio: 'pipe' },
  );
  const generated = `${prefix}-001.png`;
  const target = resolve(screenshotDir, 'pdf-page-1.png');
  await rename(generated, target);
  return target;
}

async function countPixelsNear(pngPath, hex, tolerance) {
  const image = await loadImage(pngPath);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const channels = [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    const difference =
      Math.abs((data[index] ?? 0) - channels[0]) +
      Math.abs((data[index + 1] ?? 0) - channels[1]) +
      Math.abs((data[index + 2] ?? 0) - channels[2]);
    if (difference <= tolerance) count += 1;
  }
  return count;
}

function record(entry) {
  evidence.push({ at: new Date().toISOString(), ...entry });
}

describe('editor appearance phase 1', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    await writeFile(
      resolve(outputRoot, 'editor-appearance-evidence.json'),
      JSON.stringify(evidence, null, 2),
      'utf8',
    );
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('keeps the code theme, the One Light paper, and the table toolbar contracted end to end', async () => {
    const env = ui.isolated('editor-appearance');
    await launch('editor-appearance');
    await openPackage(env, 'Editor appearance', appearanceDocument());
    await waitContinuousCode();

    // Dark Continuous: the auto theme is Dark+ on its own surface, and no code
    // colour reaches table text.
    const dark = await tokenColors('.nf-editor[data-active="true"]');
    assert.deepEqual(dark, DARK_PLUS);
    const tableTextColor = await page.evaluate(() => {
      const cellElement = document.querySelector(
        '.nf-editor[data-active="true"] .nf-block-prose table th',
      );
      return cellElement === null ? null : getComputedStyle(cellElement).color;
    });
    for (const color of [...Object.values(MONOKAI), ...Object.values(DARK_PLUS)]) {
      assert.notEqual(tableTextColor, color, 'table text never reads a syntax role');
    }
    await h.screenshot(resolve(screenshotDir, 'continuous-dark.png'), {
      width: 1440,
      height: 900,
    });

    // Table toolbar: a header caret places the compact bar below the table.
    await table().locator('th').first().click();
    await waitToolbarBelowTable();
    const headerGeometry = await toolbarGeometry();
    assert.ok(headerGeometry !== null);
    assert.ok(
      headerGeometry.toolbar.top >= headerGeometry.table.bottom - 1,
      `header toolbar ${headerGeometry.toolbar.top} is below the table ${headerGeometry.table.bottom}`,
    );
    assert.ok(
      headerGeometry.toolbar.height <= headerGeometry.headerRow.height + 1,
      `toolbar height ${headerGeometry.toolbar.height} <= header row ${headerGeometry.headerRow.height}`,
    );
    assert.ok(
      headerGeometry.toolbar.top >= 8 - 1 &&
        headerGeometry.toolbar.bottom <= headerGeometry.viewport.height - 8 + 1,
      'header toolbar is inside the viewport',
    );
    assert.equal(headerGeometry.role, 'toolbar');
    assert.equal(headerGeometry.toolbarLabel, 'Table');
    assert.equal(headerGeometry.buttons.length, 13, 'every table command stays reachable');
    assert.ok(
      headerGeometry.buttons.every((button) => button.label.length > 0),
      'every table command keeps an accessible name',
    );
    await h.screenshot(resolve(screenshotDir, 'table-toolbar-header.png'), {
      width: 1440,
      height: 900,
    });

    // The first body row would put an above-caret bar over the header row, so
    // it stays below the table; the keyboard path still works.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await waitToolbarBelowTable();
    const firstBodyGeometry = await toolbarGeometry();
    assert.ok(firstBodyGeometry !== null);
    assert.ok(
      firstBodyGeometry.toolbar.top >= firstBodyGeometry.headerRow.bottom - 1,
      'a first-body-row caret keeps the bar clear of the header row',
    );
    assert.ok(
      firstBodyGeometry.toolbar.top >= 8 - 1 &&
        firstBodyGeometry.toolbar.bottom <= firstBodyGeometry.viewport.height - 8 + 1,
      'first body toolbar is inside the viewport',
    );

    // The bar is anchored to the table bottom edge, not the active cell: moving
    // the caret to a deeper body row leaves its table-relative rect unchanged.
    // (The header and first-body-row checks above already prove it is below the
    // table; this is the anti-jump assertion the old above-cell rule used to
    // express.)
    const stableOffset = firstBodyGeometry.toolbar.top - firstBodyGeometry.table.bottom;
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await waitToolbarBelowTable();
    const bodyGeometry = await toolbarGeometry();
    assert.ok(bodyGeometry !== null);
    const movedOffset = bodyGeometry.toolbar.top - bodyGeometry.table.bottom;
    assert.ok(
      Math.abs(movedOffset - stableOffset) <= 1,
      `body toolbar moved with the cell: ${movedOffset} vs ${stableOffset}`,
    );
    assert.ok(
      bodyGeometry.toolbar.top >= bodyGeometry.table.bottom - 1,
      'body toolbar stays below the table',
    );
    assert.ok(
      bodyGeometry.toolbar.top >= 8 - 1 &&
        bodyGeometry.toolbar.bottom <= bodyGeometry.viewport.height - 8 + 1,
      'body toolbar is inside the viewport',
    );

    // The source panel expands below the table and still never covers the cell.
    await table().locator('th').first().click();
    await waitToolbarBelowTable();
    await page.locator('[data-testid="table-toolbar"] [data-action="toggle-source"]').click();
    await page.waitForSelector('[data-table-source]');
    await waitToolbarBelowTable();
    assert.equal(
      await page
        .locator('[data-testid="table-toolbar"] [data-action="toggle-source"]')
        .getAttribute('aria-expanded'),
      'true',
    );
    await page.locator('[data-testid="table-toolbar"] [data-action="toggle-source"]').click();
    await page.waitForSelector('[data-table-source]', { state: 'detached' });

    // Mixed polarity on the dark app: Light+ and One Light are light code
    // themes, so the fence row and the copy chip follow their white surface and
    // dark ink instead of the dark shell chrome (plan #3).
    const mixedOnDark = [];
    for (const [id, screenshot] of [
      ['light-plus', 'mixed-light-plus-dark-app.png'],
      ['one-light', 'mixed-one-light-dark-app.png'],
    ]) {
      await openSettings();
      await chooseCodeTheme(id, id);
      await closeSettings();
      await waitContinuousCode();
      mixedOnDark.push(await assertMixedPolarityChrome(id, 'dark', screenshot));
    }
    // Back to auto: Dark+ on the dark app, the same-polarity look.
    await openSettings();
    await chooseCodeTheme('auto', 'dark-plus');
    await closeSettings();
    await waitContinuousCode();

    // Light Continuous: the auto theme is Light+ on its own white surface.
    await openSettings();
    await chooseTheme('light');
    await closeSettings();
    await waitContinuousCode();
    const light = await tokenColors('.nf-editor[data-active="true"]');
    assert.deepEqual(light, LIGHT_PLUS);
    await h.screenshot(resolve(screenshotDir, 'continuous-light.png'), {
      width: 1440,
      height: 900,
    });

    // Mixed polarity on the light app: Dark+ and Monokai are dark code themes,
    // so the fence row and the copy chip follow their dark surface and light
    // ink instead of the light shell chrome (plan #3).
    const mixedOnLight = [];
    for (const [id, screenshot] of [
      ['monokai', 'mixed-monokai-light-app.png'],
      ['dark-plus', 'mixed-dark-plus-light-app.png'],
    ]) {
      await openSettings();
      await chooseCodeTheme(id, id);
      await closeSettings();
      await waitContinuousCode();
      mixedOnLight.push(await assertMixedPolarityChrome(id, 'light', screenshot));
    }
    // Back to auto: Light+ on the light app, the same-polarity look.
    await openSettings();
    await chooseCodeTheme('auto', 'light-plus');
    await closeSettings();
    await waitContinuousCode();

    // Page Read renders the same highlighted segments, the code-token anchor,
    // and real selectable text.
    await waitPageRead();
    const pagesLight = await pageCount();
    assert.ok(pagesLight >= 1);
    assert.ok((await activePageView().locator('.hljs-keyword').count()) > 0);
    const pageColors = await tokenColors('.nf-editor[data-active="true"] .nf-page-view');
    assert.deepEqual(pageColors, ONE_LIGHT);
    const anchorSpan = activePageView().locator('[data-anchor-id="a-code-token"]');
    await anchorSpan.first().waitFor();
    assert.equal(await anchorSpan.count(), 1, 'one anchor span per code token occurrence');
    assert.equal((await anchorSpan.first().innerText()).trim(), 'greeting');
    assert.ok(
      (await anchorSpan.first().boundingBox())?.width > 0,
      'the Page code anchor has a real rectangle',
    );
    assert.match(
      await activePageView().locator('.nf-code-line').first().innerText(),
      /def greeting\(name\):/,
      'Page code keeps real text',
    );
    assert.equal(await activePageView().locator('[data-code-block]').count(), 0);
    await h.screenshot(resolve(screenshotDir, 'page-read.png'), {
      width: 1440,
      height: 900,
    });

    // Page Edit uses the same One Light roles on the paper.
    await enterPageEdit();
    const codeFragment = activePageView().locator(
      '.nf-page-fragment[data-fragment-block="ea-code"]',
    ).first();
    await codeFragment.dblclick();
    const overlay = page.locator('[data-page-edit-overlay]');
    await overlay.waitFor({ timeout: 5000 });
    await overlay.locator('.hljs-keyword').first().waitFor();
    const editColors = await tokenColors('[data-page-edit-overlay]');
    assert.deepEqual(editColors, ONE_LIGHT);
    await page.keyboard.press('Escape');
    await overlay.waitFor({ state: 'detached' });

    // Switching the app back to dark never recolours the paper.
    await ui.ensureInteractionMode('read');
    await openSettings();
    await chooseTheme('dark');
    await closeSettings();
    await waitTheme('dark');
    await waitPageRead();
    assert.equal(await pageCount(), pagesLight, 'theme switching leaves pagination unchanged');
    const paperOnDark = await tokenColors('.nf-editor[data-active="true"] .nf-page-view');
    assert.deepEqual(paperOnDark, ONE_LIGHT, 'the fixed-light paper stays One Light');

    // PDF: same page count, real text, and One Light colour in the raster.
    const folder = resolve(outputRoot, 'pdf');
    await mkdir(folder, { recursive: true });
    const state = await exportPdf(folder);
    assert.equal(state.status, 'done');
    assert.equal(state.pageCount, pagesLight, 'PDF page count equals the Page model');
    const outputPath = resolve(folder, 'Code palette.pdf');
    assert.equal(state.outputPath, outputPath);
    const pdf = await inspectPdfFile(outputPath);
    assert.equal(pdf.pageCount, pagesLight);
    assert.ok(textContains(pdf.text, CODE_FIRST_LINE), 'code text is real in the PDF');
    assert.ok(textContains(pdf.text, 'Anchored branch from the code token.'));
    const rasterPath = await rasterizePageOne(resolve(outputPath), resolve(screenshotDir, 'raw-page'));
    const oneLightKeywordPixels = await countPixelsNear(rasterPath, '#a626a4', 60);
    const monokaiKeywordPixels = await countPixelsNear(rasterPath, '#f92672', 20);
    assert.ok(
      oneLightKeywordPixels > 20,
      `the PDF prints One Light keyword colour (${oneLightKeywordPixels} px)`,
    );
    assert.equal(monokaiKeywordPixels, 0, 'the fixed-light PDF never prints Monokai');
    record({
      case: 'appearance',
      pages: pagesLight,
      pdfPages: pdf.pageCount,
      oneLightKeywordPixels,
      monokaiKeywordPixels,
      dark,
      light,
      pageColors,
      editColors,
      paperOnDark,
      mixedOnDark,
      mixedOnLight,
      headerToolbar: headerGeometry,
      bodyToolbar: bodyGeometry,
    });
  });
});
