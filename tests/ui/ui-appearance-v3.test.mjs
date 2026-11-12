import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageDocument, writePagePackage } from '../support/page-fixtures.mjs';
import { inspectPdfFile, normalizeText } from '../../scripts/lib/pdf.mjs';

/**
 * R3 appearance v3: shell color contract, dark/light/system themes, accent
 * registry, UI scale/font, code font, and the paper-isolation guarantee.
 *
 * The shell is one contract; Page/PDF are another. Theme, accent, UI scale, and
 * UI font must never change the paper. The code font is the only appearance
 * value that reaches Page code and the PDF, and it joins the print identity.
 */

const tempRoot = artifactsPath('ui-appearance-v3-temp');
const screenshotDir = artifactsPath('ui-appearance-v3');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const SHELL_FONT = /-apple-system|SF Pro Text|Helvetica Neue/;
const SERIF_FONT = /ui-serif|New York|Iowan Old Style/;

function codeDocument(id) {
  return pageDocument({
    id,
    title: 'Appearance paper',
    chapterTitle: 'Paper',
    blocks: [
      {
        id: 'appearance-intro',
        label: 'Intro',
        content: {
          type: 'doc',
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', text: 'Shell appearance must not change the paper. ' },
                { type: 'text', marks: [{ type: 'code' }], text: 'inlineCode()' },
              ],
            },
          ],
        },
      },
      {
        id: 'appearance-code',
        label: 'Code',
        content: {
          type: 'doc',
          children: [
            {
              type: 'codeBlock',
              attrs: { language: 'ts' },
              children: [{ type: 'text', text: 'const paper = "unchanged";' }],
            },
          ],
        },
      },
    ],
  });
}

async function launch(name, overrides = {}) {
  page = await ui.launch({ ...ui.isolated(name), NOTEFOREST_E2E_HIDDEN: '1', ...overrides });
  await h.setWindowSize(1440, 900);
}

async function openPackage(env, name, document) {
  const packagePath = await writePagePackage(env.NOTEFOREST_LIBRARY, name, document);
  const opened = await page.evaluate((path) => window.__noteforestTest.openPath(path), packagePath);
  assert.equal(opened, true, 'fixture package opens');
  await page.waitForFunction(
    (path) => window.__noteforestTest.state().activeTab === path,
    packagePath,
    { timeout: 20000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  await h.waitSaved();
  return packagePath;
}

async function openSettings(pageId = 'appearance') {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  await page.keyboard.press('Meta+,');
  await page.waitForSelector('[data-settings-dialog="true"]');
  await page.locator(`[data-settings-nav="${pageId}"]`).click();
  await page.locator('.nf-settings-page-title').first().waitFor();
}

async function closeSettings() {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
}

async function appearance() {
  return page.evaluate(() => window.__noteforestTest.settings().app.appearance);
}

async function cssVariable(name) {
  return page.evaluate((variable) => {
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  }, name);
}

/** Resolve a color role to a computed rgb() through a probe element. */
async function roleColor(name) {
  return page.evaluate((variable) => {
    const probe = document.createElement('div');
    probe.style.color = `var(${variable})`;
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, name);
}

async function computed(selector, property) {
  return page.locator(selector).first().evaluate((element, name) => {
    return getComputedStyle(element).getPropertyValue(name);
  }, property);
}

async function waitTheme(theme) {
  await page.waitForFunction(
    (expected) => document.documentElement.dataset.theme === expected,
    theme,
    { timeout: 10000 },
  );
}

async function waitSavedAppearance(patch) {
  await page.waitForFunction(
    (expected) => {
      const stored = window.__noteforestTest.settings().app.appearance;
      return Object.entries(expected).every(([key, value]) => stored[key] === value);
    },
    patch,
    { timeout: 10000 },
  );
  await page.waitForFunction(
    () => window.__noteforestTest.settings().saveState.status === 'saved',
    undefined,
    { timeout: 10000 },
  );
}

async function waitForPageRead() {
  await page.keyboard.press('Meta+3');
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
    { timeout: 20000 },
  );
}

/** Page-paper fingerprint: geometry, paper colors, and Page typography. */
async function paperSnapshot() {
  return page.evaluate(() => {
    const sheet = document.querySelector('.nf-editor[data-active="true"] .nf-page-sheet');
    if (sheet === null) return null;
    const style = getComputedStyle(sheet);
    const card = sheet.querySelector('.nf-page-card');
    const code = sheet.querySelector('.nf-code-line');
    const inline = sheet.querySelector('.nf-inline-code');
    const header = sheet.querySelector('.nf-page-header');
    const footer = sheet.querySelector('.nf-page-footer');
    const number = sheet.querySelector('[data-page-indicator]');
    return {
      widthPx: sheet.getAttribute('data-page-width-px'),
      heightPx: sheet.getAttribute('data-page-height-px'),
      marginTop: sheet.getAttribute('data-margin-top'),
      marginRight: sheet.getAttribute('data-margin-right'),
      marginBottom: sheet.getAttribute('data-margin-bottom'),
      marginLeft: sheet.getAttribute('data-margin-left'),
      sheetBackground: style.backgroundColor,
      sheetFontFamily: style.fontFamily,
      sheetFontSize: style.fontSize,
      sheetLineHeight: style.lineHeight,
      cardBackground: card === null ? null : getComputedStyle(card).backgroundColor,
      codeFontFamily: code === null ? null : getComputedStyle(code).fontFamily,
      inlineCodeFontFamily: inline === null ? null : getComputedStyle(inline).fontFamily,
      headerFontSize: header === null ? null : getComputedStyle(header).fontSize,
      footerFontSize: footer === null ? null : getComputedStyle(footer).fontSize,
      numberFontSize: number === null ? null : getComputedStyle(number).fontSize,
      pageCount: sheet.getAttribute('data-page-count'),
    };
  });
}

async function chooseTheme(value) {
  await page.locator(`[data-appearance-theme-option="${value}"]`).click();
  await waitSavedAppearance({ theme: value });
}

async function chooseAccent(value) {
  await page.locator(`[data-accent-option="${value}"]`).click();
  await waitSavedAppearance({ accent: value });
}

/**
 * Page-number center against the paper center for one sheet. `ratio` is scale
 * independent (0.5 is the paper center); `offsetPx` is in paper pixels when the
 * sheet exposes its unscaled width.
 */
async function pageNumberCenter(sheetSelector) {
  return page.evaluate((selector) => {
    const sheet = document.querySelector(selector);
    if (sheet === null) return null;
    const number = sheet.querySelector('[data-page-indicator]');
    if (number === null) return null;
    const sheetBox = sheet.getBoundingClientRect();
    const numberBox = number.getBoundingClientRect();
    const numberCenter = numberBox.left + numberBox.width / 2;
    const ratio = (numberCenter - sheetBox.left) / sheetBox.width;
    const widthPx = Number(sheet.getAttribute('data-page-width-px'));
    const offsetPx = Number.isFinite(widthPx)
      ? (numberCenter - (sheetBox.left + sheetBox.width / 2)) / (sheetBox.width / widthPx)
      : null;
    return { ratio, offsetPx, shift: number.getAttribute('data-page-number-shift') };
  }, sheetSelector);
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

/** Simulate the native folder picker with a deterministic choice. */
async function mockFolderDialog(folderPath) {
  await h.app.evaluate(({ dialog }, chosen) => {
    globalThis.__nfFolderDialogCalls = [];
    dialog.showOpenDialog = async (_window, options) => {
      globalThis.__nfFolderDialogCalls.push(structuredClone(options));
      return { canceled: false, filePaths: [chosen] };
    };
  }, folderPath);
}

async function exportPdf(folder, fileName) {
  await invokeAppMenu('menu-export-pdf');
  await page.waitForSelector('[data-export-status="configure"]', { timeout: 10000 });
  await mockFolderDialog(folder);
  await page.locator('[data-export-choose-folder]').click();
  await page.waitForFunction(
    (expected) => document.querySelector('[data-export-folder]')?.textContent?.trim() === expected,
    folder,
    { timeout: 10000 },
  );
  await page.locator('[data-export-filename]').fill(fileName);
  await page.locator('[data-export-start]').click();
  await page.waitForFunction(
    () => window.__noteforestTest.exportState().status === 'done',
    undefined,
    { timeout: 180000 },
  );
  const outputPath = resolve(folder, `${fileName}.pdf`);
  await stat(outputPath);
  await page.locator('[data-export-close="true"]').click();
  await page.waitForSelector('[data-export-sheet="true"]', { state: 'detached', timeout: 10000 });
  return outputPath;
}

/**
 * The paper-centered page number inside a produced PDF.
 *
 * pdf.js may split `Page 1 of 1` into several text items. The footer band is
 * identified from the bottom of the page and the label items are unioned; the
 * left footer text is excluded because it never carries a `Page` token.
 */
function pdfPageNumberCenter(pdf, pageNumber) {
  const pdfPage = pdf.pages[pageNumber - 1];
  const items = pdf.textItems.filter((item) => item.pageNumber === pageNumber);
  const isFooter = (item) => {
    const topPt = pdfPage.heightPt - item.y - item.height;
    return topPt > pdfPage.heightPt * 0.8;
  };
  const footerItems = items.filter(isFooter).sort((left, right) => left.x - right.x);
  const labelItems = footerItems.filter((item) => {
    const text = normalizeText(item.text);
    return text.length > 0 && (/^page\b/.test(text) || text === 'of' || /^\d+$/.test(text));
  });
  if (labelItems.length === 0) return null;
  const left = Math.min(...labelItems.map((item) => item.x));
  const right = Math.max(...labelItems.map((item) => item.x + item.width));
  return {
    centerPt: (left + right) / 2,
    pageCenterPt: pdfPage.widthPt / 2,
    label: labelItems.map((item) => item.text).join(' '),
  };
}

describe('R3 appearance v3', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('applies and persists theme, accent, UI scale/font, and code font', async () => {
    const env = ui.isolated('appearance-controls');
    await launch('appearance-controls');
    await openPackage(env, 'appearance-controls', codeDocument('appearance-controls'));
    await page.waitForSelector('.nf-tab-title');

    const shell = {
      tabTitle: await computed('.nf-tab-title', 'font-size'),
      sidebarRow: await computed('.nf-sidebar-search', 'font-size'),
      bodyFont: await computed('body', 'font-family'),
    };
    assert.equal(shell.tabTitle, '12px', 'default shell tab title size');
    assert.match(shell.bodyFont, SHELL_FONT);
    // The default appearance is applied before the shell renders.
    assert.equal(await roleColor('--accent'), 'rgb(155, 183, 212)');
    assert.equal(await roleColor('--accent-strong'), 'rgb(185, 208, 230)');
    assert.equal(await cssVariable('--ui-scale'), '1');
    await waitTheme('dark');

    await openSettings('appearance');
    const controls = await page.evaluate(() => {
      const pressed = (attribute) =>
        [...document.querySelectorAll(`[${attribute}]`)]
          .filter((element) => element.getAttribute('aria-pressed') === 'true')
          .map((element) => element.getAttribute(attribute));
      return {
        themes: pressed('data-appearance-theme-option'),
        accents: pressed('data-accent-option'),
        swatches: document.querySelectorAll('[data-accent-option]').length,
        scales: pressed('data-ui-scale-option'),
        uiFont: document.querySelector('[data-ui-font-select]')?.value ?? null,
        codeFont: document.querySelector('[data-code-font-select]')?.value ?? null,
        themeCount: document.querySelectorAll('[data-appearance-theme-option]').length,
      };
    });
    assert.deepEqual(controls.themes, ['dark'], 'Dark is the default theme');
    assert.deepEqual(controls.accents, ['blue'], 'Blue is the default accent');
    assert.equal(controls.swatches, 4, 'four curated accent swatches');
    assert.deepEqual(controls.scales, ['1'], 'Default UI text size');
    assert.equal(controls.uiFont, 'system');
    assert.equal(controls.codeFont, 'jetbrains');
    assert.equal(controls.themeCount, 3, 'Dark / Light / System are real options');
    await page.screenshot({ path: join(screenshotDir, 'appearance-dark-blue.png') });

    // Light theme: the shell flips, the accent uses the light registry set.
    await chooseTheme('light');
    await waitTheme('light');
    assert.equal(await computed('body', 'background-color'), 'rgb(255, 255, 255)');
    assert.equal(await roleColor('--accent'), 'rgb(47, 95, 138)');
    assert.equal(
      await computed('.nf-appearance-preview', 'background-color'),
      'rgb(255, 255, 255)',
      'the preview strip follows the resolved theme',
    );
    await page.screenshot({ path: join(screenshotDir, 'appearance-light-blue.png') });

    // System follows the emulated OS preference and updates on change.
    await page.emulateMedia({ colorScheme: 'light' });
    await chooseTheme('system');
    await waitTheme('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await waitTheme('dark');
    assert.equal((await appearance()).theme, 'system', 'the stored value stays system');
    await page.emulateMedia({ colorScheme: 'light' });
    await waitTheme('light');

    // Accent switching; the light registry set is applied while light.
    await chooseAccent('amber');
    assert.equal(await roleColor('--accent'), 'rgb(138, 90, 0)');
    assert.equal(await roleColor('--accent-strong'), 'rgb(111, 72, 0)');
    const selected = await page
      .locator('[data-accent-option="amber"]')
      .getAttribute('aria-pressed');
    assert.equal(selected, 'true', 'the selected swatch is pressed');
    await page.screenshot({ path: join(screenshotDir, 'appearance-light-amber.png') });

    // Dark + teal for the remaining checks.
    await chooseTheme('dark');
    await waitTheme('dark');
    await chooseAccent('teal');
    assert.equal(await roleColor('--accent'), 'rgb(143, 199, 192)');

    // UI text size scales shell chrome text only.
    await page.locator('[data-ui-scale-option="1.1"]').click();
    await waitSavedAppearance({ uiScale: 1.1 });
    const largeTab = await computed('.nf-tab-title', 'font-size');
    const largeSidebar = await computed('.nf-sidebar-search', 'font-size');
    assert.equal(largeTab, '13.2px', 'the tab title grows by the UI scale');
    assert.ok(
      Number.parseFloat(largeSidebar) > Number.parseFloat(shell.sidebarRow),
      `the sidebar row grows (${largeSidebar} vs ${shell.sidebarRow})`,
    );
    assert.equal(await cssVariable('--ui-scale'), '1.1');

    // UI font changes the shell only.
    await page.locator('[data-ui-font-select]').selectOption('serif');
    await waitSavedAppearance({ uiFont: 'serif' });
    const serifBody = await computed('body', 'font-family');
    assert.match(serifBody, SERIF_FONT);
    await page.screenshot({ path: join(screenshotDir, 'appearance-scale-serif.png') });

    // Code font changes editor code and Page code; the paper body does not.
    await page.locator('[data-code-font-select]').selectOption('system-mono');
    await waitSavedAppearance({ codeFont: 'system-mono' });
    const editorCode = await computed('.nf-block-prose pre', 'font-family');
    assert.match(editorCode, /ui-monospace/);
    assert.doesNotMatch(editorCode, /JetBrains Mono/);

    // Compact restores the default scale; the controls keep the stored values.
    await page.locator('[data-ui-scale-option="0.9"]').click();
    await waitSavedAppearance({ uiScale: 0.9 });
    assert.equal(await computed('.nf-tab-title', 'font-size'), '10.8px');
    await page.locator('[data-ui-scale-option="1"]').click();
    await waitSavedAppearance({ uiScale: 1 });

    // Reset appearance restores every default.
    await page.locator('[data-appearance-reset="true"]').click();
    await waitSavedAppearance({
      theme: 'dark',
      accent: 'blue',
      uiScale: 1,
      uiFont: 'system',
      codeFont: 'jetbrains',
    });
    await waitTheme('dark');
    assert.equal(await roleColor('--accent'), 'rgb(155, 183, 212)');
    assert.match(await computed('body', 'font-family'), SHELL_FONT);
    await closeSettings();

    // Persisted file: schema v3 with the appearance namespace.
    const stored = JSON.parse(
      await readFile(resolve(env.NOTEFOREST_APP_SUPPORT, 'settings.json'), 'utf8'),
    );
    assert.equal(stored['settingsVersion'], 3);
    assert.deepEqual(stored['appearance'], {
      theme: 'dark',
      accent: 'blue',
      uiScale: 1,
      uiFont: 'system',
      codeFont: 'jetbrains',
    });

    // Persistence survives quit/reopen.
    await chooseThemePersisted(env);
  });

  it('works with zero documents and has no document or read-only scope', async () => {
    await launch('appearance-no-document');
    assert.deepEqual((await h.state()).tabs, [], 'the session starts with no documents');
    await openSettings('appearance');
    assert.equal(
      await page.locator('.nf-settings-page-title').first().innerText(),
      'Appearance',
    );
    assert.equal(
      await page.locator('[data-settings-pane] [data-page-scope]').count(),
      0,
      'Appearance is global: there is no Page scope selector',
    );
    for (const selector of [
      '[data-appearance-theme-option]',
      '[data-accent-option]',
      '[data-ui-scale-option]',
      '[data-ui-font-select]',
      '[data-code-font-select]',
    ]) {
      const control = page.locator(selector).first();
      assert.equal(await control.isVisible(), true, `${selector} is visible`);
      assert.equal(await control.isEnabled(), true, `${selector} is enabled`);
    }
    await chooseTheme('light');
    await waitTheme('light');
    await page.screenshot({ path: join(screenshotDir, 'appearance-no-document.png') });
    await closeSettings();
  });

  it('keeps the Page paper unchanged across theme, accent, scale, and UI font', async () => {
    const env = ui.isolated('appearance-paper');
    await launch('appearance-paper');
    await openPackage(env, 'appearance-paper', codeDocument('appearance-paper'));
    await waitForPageRead();

    const baseline = await paperSnapshot();
    assert.ok(baseline !== null, 'the Page paper renders');
    assert.equal(baseline.sheetBackground, 'rgb(255, 255, 255)', 'the paper is light');
    assert.match(baseline.sheetFontFamily, SHELL_FONT);
    assert.match(baseline.codeFontFamily, /JetBrains Mono/);
    const baselinePageCount = Number(await page
      .locator('.nf-editor[data-active="true"] .nf-page-view')
      .getAttribute('data-page-count'));
    await page.screenshot({ path: join(screenshotDir, 'paper-baseline-dark.png') });

    await openSettings('appearance');
    await chooseTheme('light');
    await waitTheme('light');
    await chooseAccent('rose');
    await page.locator('[data-ui-scale-option="1.1"]').click();
    await waitSavedAppearance({ uiScale: 1.1 });
    await page.locator('[data-ui-font-select]').selectOption('serif');
    await waitSavedAppearance({ uiFont: 'serif' });
    await closeSettings();
    await page.waitForFunction(
      () => {
        const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
        return view !== null && view.getAttribute('data-updating') !== 'true';
      },
      undefined,
      { timeout: 20000 },
    );

    const afterShell = await paperSnapshot();
    assert.deepEqual(
      afterShell,
      baseline,
      'theme, accent, UI scale, and UI font leave the paper geometry and typography unchanged',
    );
    assert.equal(
      Number(await page.locator('.nf-editor[data-active="true"] .nf-page-view').getAttribute('data-page-count')),
      baselinePageCount,
      'the page count is unchanged',
    );
    await page.screenshot({ path: join(screenshotDir, 'paper-light-rose.png') });

    // The code font is the one appearance value that reaches the paper. It also
    // joins the measured-run identity, so the Page re-measures.
    const runsBefore = Number(
      await page
        .locator('.nf-editor[data-active="true"] .nf-page-view')
        .getAttribute('data-model-runs'),
    );
    await openSettings('appearance');
    await page.locator('[data-code-font-select]').selectOption('system-mono');
    await waitSavedAppearance({ codeFont: 'system-mono' });
    await closeSettings();
    await page.waitForFunction(
      (runs) => {
        const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
        return (
          view !== null &&
          Number(view.getAttribute('data-model-runs')) > runs &&
          view.getAttribute('data-ready') === 'true' &&
          view.getAttribute('data-updating') !== 'true'
        );
      },
      runsBefore,
      { timeout: 30000 },
    );
    const afterCodeFont = await paperSnapshot();
    assert.notEqual(afterCodeFont.codeFontFamily, baseline.codeFontFamily);
    assert.match(afterCodeFont.codeFontFamily, /ui-monospace/);
    assert.doesNotMatch(afterCodeFont.codeFontFamily, /JetBrains Mono/);
    assert.notEqual(afterCodeFont.inlineCodeFontFamily, baseline.inlineCodeFontFamily);
    // Everything except the code family is still the paper's own.
    const { codeFontFamily: _a, inlineCodeFontFamily: _b, ...paperAfterCodeFont } = afterCodeFont;
    const { codeFontFamily: _c, inlineCodeFontFamily: _d, ...paperBaseline } = baseline;
    assert.deepEqual(paperAfterCodeFont, paperBaseline);
    await page.screenshot({ path: join(screenshotDir, 'paper-system-mono.png') });
  });

  it('centers the page number on the paper with asymmetric margins', async () => {
    const env = ui.isolated('appearance-page-number');
    const outputRoot = artifactsPath('ui-appearance-v3', 'export');
    await rm(outputRoot, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });
    await launch('appearance-page-number');
    const packagePath = await openPackage(
      env,
      'appearance-page-number',
      codeDocument('appearance-page-number'),
    );
    // Deliberately asymmetric: left 30 mm, right 10 mm.
    await page.evaluate(
      (path) =>
        window.__noteforestTest.setPageSettingsOverride(path, {
          setup: { margins: { top: 20, right: 10, bottom: 20, left: 30 } },
        }),
      packagePath,
    );
    await waitForPageRead();
    await page.waitForSelector('.nf-editor[data-active="true"] [data-page-indicator]');

    const read = await pageNumberCenter('.nf-editor[data-active="true"] .nf-page-sheet');
    assert.ok(read !== null, 'Page Read renders the page number');
    assert.ok(
      Math.abs(read.ratio - 0.5) <= 0.003,
      `Page Read: the number sits at the paper center (ratio ${read.ratio})`,
    );
    assert.ok(
      read.offsetPx !== null && Math.abs(read.offsetPx) <= 1,
      `Page Read: paper-center offset within 1 px (${read.offsetPx})`,
    );
    assert.equal(read.shift, '-37.795', 'the shift is (right - left) / 2 in paper px');
    await page.screenshot({ path: join(screenshotDir, 'page-number-read-asymmetric.png') });

    // Page Edit keeps the same chrome geometry.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-interaction-mode') === 'edit',
      undefined,
      { timeout: 5000 },
    );
    const fragment = page
      .locator('.nf-editor[data-active="true"] [data-fragment-block]')
      .first();
    await fragment.dblclick();
    await page.waitForSelector('[data-page-edit-overlay]', { timeout: 5000 });
    const edit = await pageNumberCenter('.nf-editor[data-active="true"] .nf-page-sheet');
    assert.ok(edit !== null);
    assert.ok(
      Math.abs(edit.ratio - 0.5) <= 0.003,
      `Page Edit: the number sits at the paper center (ratio ${edit.ratio})`,
    );
    await page.screenshot({ path: join(screenshotDir, 'page-number-edit-asymmetric.png') });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-page-edit-overlay]', { state: 'detached', timeout: 10000 });

    // The Settings preview uses the same shared chrome geometry.
    await openSettings('page');
    await page.locator('[data-page-scope-option="document"]').click();
    await page.waitForSelector('[data-page-preview="true"][data-page-preview-state="ready"]', {
      timeout: 15000,
    });
    await page.waitForFunction(() => {
      const sheet = document.querySelector('[data-page-preview="true"] .nf-page-sheet');
      return (
        sheet !== null &&
        sheet.querySelector('[data-page-indicator]') !== null &&
        sheet.querySelector('.nf-page-footer-text') !== null
      );
    });
    const preview = await pageNumberCenter('[data-page-preview="true"] .nf-page-sheet');
    assert.ok(preview !== null, 'the preview renders the page number');
    assert.ok(
      Math.abs(preview.ratio - 0.5) <= 0.006,
      `Preview: the number sits at the paper center (ratio ${preview.ratio})`,
    );
    await page.screenshot({ path: join(screenshotDir, 'page-number-preview-asymmetric.png') });
    await closeSettings();

    // The PDF composes the same paper: the number center matches the page center.
    const outputPath = await exportPdf(outputRoot, 'page-number-asymmetric');
    const pdf = await inspectPdfFile(outputPath);
    assert.equal(pdf.pageCount >= 1, true);
    const center = pdfPageNumberCenter(pdf, 1);
    assert.ok(center !== null, 'the produced PDF carries the page number label');
    assert.match(normalizeText(center.label), /page 1 of 1/);
    const deltaMm = (Math.abs(center.centerPt - center.pageCenterPt) * 25.4) / 72;
    assert.ok(
      deltaMm <= 2,
      `PDF: the number center is within 2 mm of the page center (${deltaMm.toFixed(2)} mm)`,
    );
    await writePdfEvidence(outputRoot, {
      read,
      edit,
      preview,
      pdf: {
        pageWidthMm: pdf.pages[0].widthMm,
        pageCenterPt: center.pageCenterPt,
        numberCenterPt: center.centerPt,
        deltaMm,
        label: center.label,
      },
    });
  });

  it('keeps the PDF identical across shell appearance and follows the code font', async () => {
    const env = ui.isolated('appearance-pdf');
    const outputRoot = artifactsPath('ui-appearance-v3', 'export');
    await mkdir(outputRoot, { recursive: true });
    await launch('appearance-pdf');
    await openPackage(env, 'appearance-pdf', codeDocument('appearance-pdf'));

    const summarize = async (path) => {
      const pdf = await inspectPdfFile(path);
      const bytes = await readFile(path, 'latin1');
      const fonts = new Set();
      for (const match of bytes.matchAll(/\/(?:BaseFont|FontName)\s*\/([^\s/\[\]<>()]+)/g)) {
        fonts.add(match[1].replace(/^[A-Z]{6}\+/, ''));
      }
      return {
        pageCount: pdf.pageCount,
        pageWidthMm: pdf.pages[0].widthMm,
        pageHeightMm: pdf.pages[0].heightMm,
        text: normalizeText(pdf.pages.map((pdfPage) => pdfPage.text).join('\n')),
        textItemCount: pdf.textItems.length,
        missingGlyphs: pdf.missingGlyphCount,
        fonts: [...fonts].sort(),
      };
    };

    const baselinePath = await exportPdf(outputRoot, 'appearance-baseline');
    const baseline = await summarize(baselinePath);
    assert.match(baseline.text, /const paper = "unchanged"/, 'the code prints as real text');
    assert.equal(baseline.missingGlyphs, 0);
    assert.ok(
      baseline.fonts.some((font) => /JetBrains/i.test(font)),
      `the default code font is JetBrains Mono (${baseline.fonts.join(', ')})`,
    );

    // Theme, accent, UI scale, and UI font leave the PDF untouched.
    await openSettings('appearance');
    await chooseTheme('light');
    await chooseAccent('rose');
    await page.locator('[data-ui-scale-option="1.1"]').click();
    await waitSavedAppearance({ uiScale: 1.1 });
    await page.locator('[data-ui-font-select]').selectOption('serif');
    await waitSavedAppearance({ uiFont: 'serif' });
    await closeSettings();
    const shellChangedPath = await exportPdf(outputRoot, 'appearance-shell-changed');
    const shellChanged = await summarize(shellChangedPath);
    assert.deepEqual(
      shellChanged,
      baseline,
      'theme, accent, UI scale, and UI font leave the PDF text, size, and fonts unchanged',
    );

    // The code font reaches the PDF: same text and size, different font.
    await openSettings('appearance');
    await page.locator('[data-code-font-select]').selectOption('system-mono');
    await waitSavedAppearance({ codeFont: 'system-mono' });
    await closeSettings();
    const codeChangedPath = await exportPdf(outputRoot, 'appearance-code-changed');
    const codeChanged = await summarize(codeChangedPath);
    assert.equal(codeChanged.pageCount, baseline.pageCount);
    assert.ok(Math.abs(codeChanged.pageWidthMm - baseline.pageWidthMm) <= 0.01);
    assert.equal(codeChanged.text, baseline.text, 'the same real text is exported');
    assert.equal(codeChanged.missingGlyphs, 0);
    assert.notDeepEqual(codeChanged.fonts, baseline.fonts, 'the code font changed in the PDF');
    assert.equal(
      codeChanged.fonts.some((font) => /JetBrains/i.test(font)),
      false,
      'System Mono does not embed JetBrains Mono',
    );
    await writeFile(
      resolve(outputRoot, 'pdf-code-font-evidence.json'),
      JSON.stringify({ baseline, shellChanged, codeChanged }, null, 2),
      'utf8',
    );
  });
});

/** Quit, relaunch with the same app support, and read the persisted values. */
async function chooseThemePersisted(env) {
  await h.quit();
  await launch('appearance-controls', env);
  await page.waitForFunction(
    () => window.__noteforestTest.settings().app.appearance.codeFont === 'jetbrains',
    undefined,
    { timeout: 20000 },
  );
  await waitTheme('dark');
  const restored = await appearance();
  assert.deepEqual(restored, {
    theme: 'dark',
    accent: 'blue',
    uiScale: 1,
    uiFont: 'system',
    codeFont: 'jetbrains',
  });
  assert.equal(await roleColor('--accent'), 'rgb(155, 183, 212)');
  await openSettings('appearance');
  assert.equal(
    await page.locator('[data-accent-option="blue"]').getAttribute('aria-pressed'),
    'true',
    'the persisted accent is selected after relaunch',
  );
  assert.equal(await page.locator('[data-ui-font-select]').inputValue(), 'system');
  assert.equal(await page.locator('[data-code-font-select]').inputValue(), 'jetbrains');
  await closeSettings();
}

async function writePdfEvidence(directory, evidence) {
  await writeFile(
    resolve(directory, 'page-number-evidence.json'),
    JSON.stringify(evidence, null, 2),
    'utf8',
  );
}
