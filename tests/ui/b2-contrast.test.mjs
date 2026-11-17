import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addBranch } from '../support/fixtures.mjs';
import { pageDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * B2 — code-theme registry and Continuous edge contrast.
 *
 * Two colour questions, one measured pass:
 *
 * A. Each shell code theme brings its own surface, so every syntax role is read
 *    against the theme's background instead of the tinted note card. The picker
 *    shows the computed worst role; the Page and the PDF keep One Light.
 * B. Resting, reference and muted Continuous edges clear 3:1 on the canvas at
 *    full opacity; no state is carried by a fade, and the R6 widths and the
 *    fixed arrowhead never move.
 *
 * Screenshots go to `artifacts/b2-contrast/`.
 */

const tempRoot = artifactsPath('b2-contrast-ui');
const screenshotDir = artifactsPath('b2-contrast');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const CODE_THEME_VALUES = ['auto', 'dark-plus', 'light-plus', 'monokai', 'one-light'];

/** The four registry themes with their measured worst label and surface. */
const THEMES = {
  'dark-plus': { surface: '#1e1e1e', text: '#d4d4d4', keyword: '#569cd6', label: 'AA 5.00' },
  'light-plus': { surface: '#ffffff', text: '#000000', keyword: '#0000ff', label: 'AA 4.59' },
  monokai: { surface: '#272822', text: '#f8f8f2', keyword: '#f92672', label: '3.03' },
  'one-light': { surface: '#fafafa', text: '#383a42', keyword: '#a626a4', label: '2.47' },
};

function rgb(hex) {
  const value = hex.replace('#', '');
  return `rgb(${Number.parseInt(value.slice(0, 2), 16)}, ${Number.parseInt(
    value.slice(2, 4),
    16,
  )}, ${Number.parseInt(value.slice(4, 6), 16)})`;
}

/** A code document with one block containing all eight role families. */
function themeCodeDocument(id) {
  return pageDocument({
    id,
    title: 'Code themes',
    chapterTitle: 'Palette',
    blocks: [
      {
        id: `${id}-intro`,
        label: 'Intro',
        content: {
          type: 'doc',
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', text: 'The code block brings its own surface. ' },
                { type: 'text', marks: [{ type: 'code' }], text: 'inlineCode()' },
              ],
            },
          ],
        },
      },
      {
        id: `${id}-code`,
        label: 'Code',
        content: {
          type: 'doc',
          children: [
            {
              type: 'codeBlock',
              attrs: { language: 'ts' },
              children: [
                {
                  type: 'text',
                  text: [
                    '// eight roles on one surface',
                    'const notes: string[] = ["alpha", "beta"];',
                    'function study(count: number): boolean {',
                    '  return count > 3;',
                    '}',
                  ].join('\n'),
                },
              ],
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

async function waitSavedCodeTheme(expected) {
  await page.waitForFunction(
    (codeTheme) => {
      const state = window.__noteforestTest.settings();
      return state.app.appearance.codeTheme === codeTheme && state.saveState.status === 'saved';
    },
    expected,
    { timeout: 15000 },
  );
}

/** Set one appearance field through the test bridge (a product settings write). */
async function setCodeTheme(codeTheme) {
  await page.evaluate(async (value) => {
    const current = window.__noteforestTest.settings().app;
    await window.__noteforestTest.setSettings({
      ...current,
      appearance: { ...current.appearance, codeTheme: value },
    });
  }, codeTheme);
  await waitSavedCodeTheme(codeTheme);
}

/** Root custom property value, trimmed and hex-normalized (`#ffffff` / `#fff`). */
async function cssVariable(name) {
  const value = await page.evaluate(
    (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(),
    name,
  );
  const match = /^#([0-9a-f]{3})$/i.exec(value);
  if (match === null) return value;
  const short = match[1];
  return `#${short[0]}${short[0]}${short[1]}${short[1]}${short[2]}${short[2]}`;
}

async function computed(selector, property) {
  return page.evaluate(
    ({ selector: target, property: name }) => {
      const element = document.querySelector(target);
      if (element === null) return null;
      return getComputedStyle(element).getPropertyValue(name);
    },
    { selector, property },
  );
}

/** The rendered code block, its surface and its first keyword span. */
async function codeBlockState() {
  return page.evaluate(() => {
    const block = document.querySelector(
      '.nf-editor[data-active="true"] .nf-code-block',
    );
    const keyword = block?.querySelector('.hljs-keyword');
    const content = block?.querySelector('.nf-code-content');
    return {
      background: block === null ? null : getComputedStyle(block).backgroundColor,
      color: block === null ? null : getComputedStyle(block).color,
      keyword: keyword === null || keyword === undefined ? null : getComputedStyle(keyword).color,
      contentColor:
        content === null || content === undefined ? null : getComputedStyle(content).color,
      inlineCodeBackground: (() => {
        const inline = document.querySelector(
          '.nf-editor[data-active="true"] .nf-inline-code',
        );
        return inline === null ? null : getComputedStyle(inline).backgroundColor;
      })(),
    };
  });
}

/** Wait for the Continuous code block to render its highlighted content. */
async function waitCodeBlock() {
  await page.waitForSelector(
    '.nf-editor[data-active="true"] .nf-code-block .hljs-keyword',
    { timeout: 15000 },
  );
}

/** Switch the Continuous surface to Page Read and wait for the page model. */
async function showPageRead() {
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
    { timeout: 20000 },
  );
}

async function showContinuous() {
  await page.keyboard.press('Meta+2');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', {
    state: 'detached',
  });
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-code-block');
}

async function pageCount() {
  return page.evaluate(() =>
    Number(
      document
        .querySelector('.nf-editor[data-active="true"] .nf-page-view')
        ?.getAttribute('data-page-count') ?? '0',
    ),
  );
}

/** Page code colours: the fixed One Light paper roles. */
async function paperCodeState() {
  return page.evaluate(() => {
    const segment = document.querySelector('.nf-page-scope .nf-seg-code-line');
    const keyword = document.querySelector('.nf-page-scope .hljs-keyword');
    const sheet = document.querySelector('.nf-page-sheet');
    return {
      segmentBackground: segment === null ? null : getComputedStyle(segment).backgroundColor,
      keyword: keyword === null ? null : getComputedStyle(keyword).color,
      sheetBackground: sheet === null ? null : getComputedStyle(sheet).backgroundColor,
    };
  });
}

/**
 * Read the three Continuous edge states and the canvas colour.
 *
 * Contrast is computed here with the WCAG definition so the numbers in the
 * report are reproducible from the DOM the product actually painted.
 */
async function edgeStates() {
  return page.evaluate(() => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const parse = (value) => {
      const match = /^rgba?\(([^)]+)\)$/.exec(value.trim());
      if (match === null) throw new Error(`not an rgb colour: ${value}`);
      const parts = match[1].split(/[,/ ]+/).filter((part) => part.length > 0);
      return {
        rgb: [Number(parts[0]), Number(parts[1]), Number(parts[2])],
        alpha: parts.length > 3 ? Number(parts[3]) : 1,
      };
    };
    const luminance = ([red, green, blue]) =>
      0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
    const contrast = (left, right) => {
      const first = luminance(left);
      const second = luminance(right);
      const lighter = Math.max(first, second);
      const darker = Math.min(first, second);
      return (lighter + 0.05) / (darker + 0.05);
    };
    const canvasElement = document.querySelector('[data-canvas-panel="true"]');
    const canvas = parse(getComputedStyle(canvasElement).backgroundColor).rgb;
    const scope = '.nf-editor[data-active="true"]';
    const read = (selector) => {
      const element = document.querySelector(`${scope} ${selector}`);
      if (element === null) return null;
      const style = getComputedStyle(element);
      const stroke = style.stroke;
      const colour = parse(stroke);
      return {
        stroke,
        opacity: Number(style.opacity),
        width: Number.parseFloat(style.strokeWidth),
        dash: style.strokeDasharray,
        ratio: contrast(colour.rgb, canvas),
      };
    };
    const role = (name) => {
      const probe = document.createElement('div');
      probe.style.color = `var(${name})`;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    return {
      canvas: getComputedStyle(canvasElement).backgroundColor,
      accentStrong: role('--accent-strong'),
      edgeReference: role('--edge-reference'),
      edgeMuted: role('--edge-muted'),
      resting: read('.nf-edge-path:not(.nf-edge-active):not(.nf-edge-muted)'),
      active: read('.nf-edge-path.nf-edge-active'),
      muted: read('.nf-edge-path.nf-edge-muted'),
      reference: read('.nf-edge-reference'),
      referenceArrow: read('.nf-edge-reference-arrow'),
      referenceEdges: document.querySelectorAll(`${scope} .nf-edge-reference`).length,
      mutedEdges: document.querySelectorAll(`${scope} .nf-edge-path.nf-edge-muted`).length,
      arrowBox: (() => {
        const arrow = document.querySelector(`${scope} .nf-edge-arrow`);
        if (arrow === null) return null;
        const box = arrow.getBBox();
        return { width: box.width, height: box.height };
      })(),
    };
  });
}

async function setDensity(density) {
  await page.evaluate(async (value) => {
    const current = window.__noteforestTest.settings().app;
    await window.__noteforestTest.setSettings({
      ...current,
      page: { ...current.page, theme: { ...current.page.theme, density: value } },
    });
  }, density);
  await page.waitForFunction(
    (expected) =>
      Math.abs(window.__noteforestTest.settings().app.page.theme.density - expected) < 1e-9,
    density,
    { timeout: 10000 },
  );
}

async function setTheme(theme) {
  await page.evaluate(async (value) => {
    const current = window.__noteforestTest.settings().app;
    await window.__noteforestTest.setSettings({
      ...current,
      appearance: { ...current.appearance, theme: value },
    });
  }, theme);
  await page.waitForFunction(
    (expected) => document.documentElement.dataset.theme === expected,
    theme,
    { timeout: 10000 },
  );
}

/** Clear the mount-time editor selection through the Page Escape contract. */
async function clearSelection() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await page.locator('.nf-page-view').click({ position: { x: 8, y: 8 } });
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      return runtime?.selectedBlockId === null;
    },
    undefined,
    { timeout: 10000 },
  );
  await page.keyboard.press('Meta+2');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', {
    state: 'detached',
  });
  await page.waitForSelector('.nf-edge-path', { state: 'attached' });
}

/**
 * Wait for every edge stroke to finish its 120 ms colour transition.
 *
 * The stroke colour animates from the previous value, so a computed-style read
 * taken right after a theme or selection change would sample an interpolation.
 */
async function waitForEdgeColours({ resting, reference, muted }) {
  await page.waitForFunction(
    (expected) => {
      const scope = '.nf-editor[data-active="true"]';
      const read = (selector) => {
        const element = document.querySelector(`${scope} ${selector}`);
        return element === null ? null : getComputedStyle(element).stroke;
      };
      const probe = document.createElement('div');
      probe.style.color = 'var(--accent-strong)';
      document.body.appendChild(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      if (expected.resting === true && read('.nf-edge-path:not(.nf-edge-active):not(.nf-edge-muted)') !== accent) {
        return false;
      }
      if (expected.reference !== null && read('.nf-edge-reference') !== expected.reference) {
        return false;
      }
      if (expected.muted !== null) {
        const paths = [
          ...document.querySelectorAll(`${scope} .nf-edge-path.nf-edge-muted`),
        ];
        if (paths.length === 0) return false;
        if (paths.some((path) => getComputedStyle(path).stroke !== expected.muted)) {
          return false;
        }
        // The width animates on the same 120 ms clock: a colour match without a
        // settled stroke-width would still sample the selection transition.
        if (
          paths.some(
            (path) => Math.abs(Number.parseFloat(getComputedStyle(path).strokeWidth) - 1) >= 0.001,
          )
        ) {
          return false;
        }
      }
      const active = document.querySelector(`${scope} .nf-edge-path.nf-edge-active`);
      if (
        active !== null &&
        Math.abs(Number.parseFloat(getComputedStyle(active).strokeWidth) - 1.75) >= 0.001
      ) {
        return false;
      }
      return true;
    },
    { resting: resting === true, reference: reference ?? null, muted: muted ?? null },
    { timeout: 15000 },
  );
}

/**
 * One reference edge over the seeded demo: "Worked example" cross-links to
 * "Eigenvector", which already has a primary home. No new blocks, so the canvas
 * and the reference route stay inside one viewport.
 */
async function referenceFixture() {
  const ids = await page.evaluate(() => {
    const idOf = (text) => {
      const card = [...document.querySelectorAll('[data-block-card]')].find((element) =>
        element.textContent?.includes(text),
      );
      return card?.getAttribute('data-block-card') ?? null;
    };
    return { source: idOf('Worked example'), target: idOf('Eigenvector') };
  });
  assert.ok(ids.source !== null && ids.target !== null, 'demo blocks resolve');
  await addBranch(ui, {
    branchId: 'b2-reference',
    sourceBlockId: ids.source,
    targetBlockId: ids.target,
    role: 'reference',
  });
  await page.waitForSelector('[data-reference-edge-id="b2-reference"]');
  await page.waitForFunction(
    () => {
      const path = document.querySelector(
        '.nf-editor[data-active="true"] [data-reference-edge-id="b2-reference"] .nf-edge-reference',
      );
      if (path === null) return false;
      const box = path.getBoundingClientRect();
      return box.width > 1 || box.height > 1;
    },
    undefined,
    { timeout: 15000 },
  );
  await h.waitSaved();
}

describe('B2 code themes and edge contrast', () => {
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

  it('offers the four measured code themes and paints each theme surface', async () => {
    const env = ui.isolated('b2-code-themes');
    await launch('b2-code-themes');
    await openPackage(env, 'b2-code-themes', themeCodeDocument('b2-code-themes'));
    await waitCodeBlock();

    await openSettings('appearance');
    const control = await page.evaluate(() => {
      const select = document.querySelector('[data-code-theme-select]');
      return {
        value: select?.value ?? null,
        options: [...(select?.querySelectorAll('option') ?? [])].map((option) => ({
          value: option.value,
          label: option.textContent?.trim() ?? '',
        })),
        help: document
          .querySelector('[data-appearance-code-help]')
          ?.textContent?.trim() ?? null,
        paper: document
          .querySelector('[data-appearance-code-paper]')
          ?.textContent?.trim() ?? null,
        title: document
          .querySelector('[data-appearance-code-section] .nf-settings-section-title')
          ?.textContent?.trim() ?? null,
      };
    });
    assert.equal(control.value, 'auto', 'auto is the stored default and is preselected');
    assert.deepEqual(
      control.options.map((option) => option.value),
      CODE_THEME_VALUES,
      'auto first, then the four registry themes',
    );
    assert.deepEqual(
      control.options.map((option) => option.label),
      [
        'Match app theme',
        `Dark+ (dark) · ${THEMES['dark-plus'].label}`,
        `Light+ (light) · ${THEMES['light-plus'].label}`,
        `Monokai (dark) · ${THEMES.monokai.label}`,
        `One Light (light) · ${THEMES['one-light'].label}`,
      ],
      'every theme carries its computed worst role, never a typed number',
    );
    assert.equal(control.title, 'Code');
    assert.match(control.help ?? '', /Worst colour contrast/);
    assert.equal(control.paper, 'Page and PDF keep One Light.');
    await page.screenshot({ path: join(screenshotDir, 'appearance-code-theme.png') });

    // The picker is a real control: choosing a theme writes it and the root
    // attribute follows.
    await page.locator('[data-code-theme-select]').selectOption('monokai');
    await waitSavedCodeTheme('monokai');
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.codeTheme),
      'monokai',
    );
    await page.locator('[data-code-theme-select]').selectOption('auto');
    await waitSavedCodeTheme('auto');
    await closeSettings();

    const measured = [];
    for (const [id, theme] of Object.entries(THEMES)) {
      await setCodeTheme(id);
      const state = await codeBlockState();
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.codeTheme),
        id,
        `${id} is the resolved root attribute`,
      );
      assert.equal(await cssVariable('--code-surface'), theme.surface, `${id} surface token`);
      assert.equal(state.background, rgb(theme.surface), `${id} code block background`);
      assert.equal(state.color, rgb(theme.text), `${id} code block ink`);
      assert.equal(state.contentColor, rgb(theme.text), `${id} code text inherits the ink`);
      assert.equal(state.keyword, rgb(theme.keyword), `${id} keyword role`);
      // Inline code and prose never take the code surface.
      assert.notEqual(
        state.inlineCodeBackground,
        rgb(theme.surface),
        `${id} inline code keeps its own surface`,
      );
      measured.push({ id, ...state });
      await page.screenshot({ path: join(screenshotDir, `code-${id}.png`) });
    }
    // Four distinct surfaces: the registry cannot collapse to one background.
    assert.equal(new Set(measured.map((entry) => entry.background)).size, 4);

    // auto follows the app theme, so the default look is Dark+ / Light+.
    await setCodeTheme('auto');
    assert.equal(await cssVariable('--code-surface'), THEMES['dark-plus'].surface);
    await setTheme('light');
    await page.waitForFunction(
      () => document.documentElement.dataset.codeTheme === 'light-plus',
      undefined,
      { timeout: 10000 },
    );
    const autoLight = await codeBlockState();
    assert.equal(autoLight.background, rgb(THEMES['light-plus'].surface));
    assert.equal(autoLight.keyword, rgb(THEMES['light-plus'].keyword));
    await page.screenshot({ path: join(screenshotDir, 'code-auto-light.png') });
  });

  it('keeps Page and the paper on One Light while the shell theme changes', async () => {
    const env = ui.isolated('b2-paper');
    await launch('b2-paper');
    await openPackage(env, 'b2-paper', themeCodeDocument('b2-paper'));
    await waitCodeBlock();
    await showPageRead();

    const paper = await paperCodeState();
    assert.equal(paper.sheetBackground, 'rgb(255, 255, 255)', 'the paper stays light');
    assert.equal(paper.segmentBackground, 'rgb(245, 247, 249)', 'the paper code surface is fixed');
    assert.equal(paper.keyword, 'rgb(166, 38, 164)', 'the paper keeps One Light keyword');
    const baselinePages = await pageCount();
    assert.ok(baselinePages >= 1, 'the page model renders');

    for (const id of ['dark-plus', 'light-plus', 'monokai', 'one-light']) {
      await setCodeTheme(id);
      const after = await paperCodeState();
      assert.equal(
        await pageCount(),
        baselinePages,
        `${id}: the shell code theme cannot change the page count`,
      );
      assert.deepEqual(after, paper, `${id}: the paper code colours do not move`);
    }
    await page.screenshot({ path: join(screenshotDir, 'page-one-light.png') });

    // Continuous IS following the theme in the same session.
    await showContinuous();
    await waitCodeBlock();
    assert.equal(
      (await codeBlockState()).background,
      rgb(THEMES['one-light'].surface),
      'Continuous follows the chosen code theme',
    );
  });

  it('keeps resting, reference and muted edges at 3:1 without fading', async () => {
    await launch('b2-edges');
    await ui.seedDemo();
    await clearSelection();
    await referenceFixture();
    await h.waitLayout({ blocks: 7, arrows: 3 });

    for (const [theme, expected] of [
      ['dark', { canvas: 'rgb(23, 24, 26)', muted: 'rgb(106, 115, 124)', reference: 'rgb(123, 133, 143)' }],
      ['light', { canvas: 'rgb(255, 255, 255)', muted: 'rgb(124, 134, 143)', reference: 'rgb(108, 120, 130)' }],
    ]) {
      await setTheme(theme);
      // The stroke colour transitions for 120 ms; measure the settled values.
      await waitForEdgeColours({ resting: true, reference: expected.reference });
      const resting = await edgeStates();
      assert.equal(resting.canvas, expected.canvas, `${theme} canvas`);
      assert.equal(resting.mutedEdges, 0, `${theme}: no selection leaves no muted edge`);
      assert.ok(resting.referenceEdges > 0, `${theme}: the reference edge renders`);
      assert.equal(resting.resting?.stroke, resting.accentStrong, `${theme} resting = accent`);
      assert.equal(resting.reference?.stroke, expected.reference, `${theme} reference token`);
      assert.equal(resting.edgeMuted, expected.muted, `${theme} muted token`);
      assert.equal(resting.reference?.opacity, 1, `${theme}: the reference is not faded`);
      assert.equal(resting.referenceArrow?.opacity, 1, `${theme}: the chevron is not faded`);
      assert.ok(
        (resting.reference?.dash ?? '').length > 0,
        `${theme}: the reference keeps its dash pattern`,
      );
      for (const [state, value] of [
        ['resting', resting.resting],
        ['reference', resting.reference],
      ]) {
        assert.ok(
          value !== null && value.ratio >= 3,
          `${theme} ${state} contrast ${value?.ratio?.toFixed(2)} must be >= 3`,
        );
      }
      // The reference must still read as the quieter neutral: it sits below the
      // resting accent (measured on the accent token itself, since an active
      // path only exists while something is selected).
      assert.ok(
        (await edgeRatio(resting.accentStrong, resting.canvas)) >
          (resting.reference?.ratio ?? 0),
        `${theme}: the resting accent stays above the reference`,
      );
      assert.ok(
        (resting.reference?.ratio ?? 0) > (await edgeRatio(resting.edgeMuted, resting.canvas)),
        `${theme}: the reference stays above the muted grey`,
      );
      await page.screenshot({
        path: join(screenshotDir, `edges-resting-reference-100-${theme}.png`),
      });
      // Selection: the path is active at 1.75 px, the other branches muted.
      // "Spectrum" is neither the reference source nor its target, so the
      // dashed reference keeps its neutral token in this state.
      const child = h
        .activeEditor()
        .locator('[data-block-card]', { hasText: 'Spectrum' })
        .first();
      const childId = await child.getAttribute('data-block-card');
      await child.locator('.nf-block-prose').click();
      await h.waitSelected(childId);
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.nf-editor[data-active="true"] .nf-edge-path.nf-edge-muted')
            .length > 0,
        undefined,
        { timeout: 10000 },
      );
      // Widths and colours both settle after the 120 ms transition.
      await waitForEdgeColours({ muted: expected.muted });
      const selected = await edgeStates();
      // The reference is untouched by the selection elsewhere: still the neutral
      // dashed stroke, still above 3:1.
      assert.equal(selected.reference?.stroke, expected.reference, `${theme}: reference stays neutral`);
      assert.equal(selected.reference?.opacity, 1, `${theme}: reference stays full opacity`);
      assert.ok(
        (selected.reference?.ratio ?? 0) >= 3,
        `${theme} reference contrast ${selected.reference?.ratio?.toFixed(2)}`,
      );
      assert.ok(selected.mutedEdges > 0, `${theme}: unselected branches are muted`);
      assert.equal(selected.muted?.opacity, 1, `${theme}: the muted edge is not faded`);
      assert.equal(selected.muted?.stroke, expected.muted, `${theme}: muted token`);
      assert.ok(
        (selected.muted?.ratio ?? 0) >= 3,
        `${theme} muted contrast ${selected.muted?.ratio?.toFixed(2)} must be >= 3`,
      );
      assert.ok(
        (selected.active?.ratio ?? 0) >= 3,
        `${theme}: the active accent clears 3:1`,
      );
      // R6 owns the widths and the fixed arrowhead.
      assert.ok(Math.abs((selected.muted?.width ?? 0) - 1) < 0.001, `${theme}: muted width 1`);
      assert.ok(
        Math.abs((selected.active?.width ?? 0) - 1.75) < 0.001,
        `${theme}: active width 1.75`,
      );
      assert.deepEqual(selected.arrowBox, { width: 6, height: 6 }, `${theme}: 6 px arrowhead`);
      await page.screenshot({
        path: join(screenshotDir, `edges-muted-100-${theme}.png`),
      });

      if (theme === 'dark') {
        // Before/after of the muted edge: the same DOM with the retired token
        // and the retired 0.35 fade re-applied, then removed again.
        const retired = await page.addStyleTag({
          content:
            '.nf-edge-path.nf-edge-muted, .nf-edge-arrow.nf-edge-muted { stroke: #565f68; fill: #565f68; opacity: 0.35; }',
        });
        await page.waitForFunction(
          () => {
            const path = document.querySelector(
              '.nf-editor[data-active="true"] .nf-edge-path.nf-edge-muted',
            );
            return path !== null && getComputedStyle(path).opacity === '0.35';
          },
          undefined,
          { timeout: 5000 },
        );
        await page.screenshot({ path: join(screenshotDir, 'muted-before-100.png') });
        await retired.evaluate((element) => element.remove());
        await page.waitForFunction(
          () => {
            const path = document.querySelector(
              '.nf-editor[data-active="true"] .nf-edge-path.nf-edge-muted',
            );
            return path !== null && getComputedStyle(path).opacity === '1';
          },
          undefined,
          { timeout: 5000 },
        );
        await page.screenshot({ path: join(screenshotDir, 'muted-after-100.png') });
      }

      // Density is a Page setting: at 60 % the Continuous edge tokens and the
      // R6 widths are identical. The selected and idle shots below are the
      // 60 % evidence: the canvas looks the same by design, and the edges never
      // scale with density.
      await setDensity(0.6);
      await waitForEdgeColours({ muted: expected.muted });
      const dense = await edgeStates();
      assert.equal(dense.muted?.stroke, selected.muted?.stroke, `${theme}: 60 % muted stroke`);
      assert.equal(dense.reference?.stroke, selected.reference?.stroke, `${theme}: 60 % reference`);
      assert.ok(Math.abs((dense.muted?.width ?? 0) - 1) < 0.001, `${theme}: 60 % muted width`);
      assert.ok(
        (dense.muted?.ratio ?? 0) >= 3,
        `${theme}: 60 % muted contrast ${dense.muted?.ratio?.toFixed(2)}`,
      );
      await page.screenshot({
        path: join(screenshotDir, `edges-muted-60-${theme}.png`),
      });
      await clearSelection();
      const idle60 = await edgeStates();
      assert.equal(idle60.mutedEdges, 0, `${theme}: 60 % idle has no muted edge`);
      assert.equal(idle60.resting?.stroke, resting.resting?.stroke, `${theme}: 60 % resting`);
      await page.screenshot({
        path: join(screenshotDir, `edges-resting-reference-60-${theme}.png`),
      });
      await setDensity(1);
    }
  });
});

/** Contrast of one computed colour against the canvas, for the assertions above. */
async function edgeRatio(colour, canvas) {
  return page.evaluate(
    ({ colour: foreground, canvas: background }) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      const parse = (value) => {
        const match = /^rgba?\(([^)]+)\)$/.exec(value.trim());
        const parts = match[1].split(/[,/ ]+/).filter((part) => part.length > 0);
        return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
      };
      const luminance = ([red, green, blue]) =>
        0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
      const first = luminance(parse(foreground));
      const second = luminance(parse(background));
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    },
    { colour, canvas },
  );
}
