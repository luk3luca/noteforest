import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  multiPageBlocksDocument,
  pageDocument,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';

/**
 * Batch C Page advanced typography and layout.
 *
 * Covers the frozen PageTheme fields that Batch B kept hidden: first-class max
 * card width, advanced typography/layout disclosures, frozen ranges, inline
 * cross-field validation without clamping, Custom/preset warning, document
 * overrides, no-document/read-only rules, Page Edit commit ordering, the live
 * preview, and Page Read parity under the same effective lens.
 */

const tempRoot = artifactsPath('ui-settings-advanced-temp');
const screenshotDir = artifactsPath('ui-settings-advanced');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(name, env) {
  page = await ui.launch({ ...(env ?? ui.isolated(name)), NOTEFOREST_E2E_HIDDEN: '1' });
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

function activePageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

async function showPageRead() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
}

async function waitPageReady() {
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
}

async function waitPageBody(expected) {
  await page.waitForFunction(
    (body) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      if (view === null) return false;
      if (view.getAttribute('data-ready') !== 'true') return false;
      if (view.getAttribute('data-updating') === 'true') return false;
      return getComputedStyle(view).getPropertyValue('--nf-page-body-size').trim() === body;
    },
    expected,
    { timeout: 30000 },
  );
}

async function openSettings() {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  await page.keyboard.press('Meta+,');
  await page.waitForSelector('[data-settings-dialog="true"]', { timeout: 10000 });
  await page.waitForSelector('[data-page-setup-section="true"]');
}

async function openSettingsFromButton() {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  await page.locator('.nf-sidebar-settings').click();
  await page.waitForSelector('[data-settings-dialog="true"]', { timeout: 10000 });
  await page.waitForSelector('[data-page-setup-section="true"]');
}

async function closeSettings() {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
}

async function waitPreviewState(expected) {
  await page.waitForFunction(
    (state) => {
      const preview = document.querySelector('[data-page-preview="true"]');
      return preview !== null && preview.getAttribute('data-page-preview-state') === state;
    },
    expected,
    { timeout: 30000 },
  );
}

async function settings() {
  return page.evaluate(() => window.__noteforestTest.settings());
}

async function resolvedPageSettings(packagePath) {
  return page.evaluate(
    (path) => window.__noteforestTest.resolvedPageSettings(path),
    packagePath,
  );
}

async function openAdvanced(kind) {
  const details = page.locator(`[data-page-advanced-${kind}]`);
  assert.equal(await details.count(), 1, `${kind} disclosure exists`);
  const open = await details.evaluate((element) => element.open);
  if (!open) await details.locator('summary').click();
  await page.waitForFunction(
    (target) => document.querySelector(`[data-page-advanced-${target}]`)?.open === true,
    kind,
    { timeout: 5000 },
  );
}

async function fillThemeField(key, value) {
  const input = page.locator(`[data-page-theme-input="${key}"]`);
  await input.fill(value);
  return input;
}

async function waitThemeSaved(fields) {
  await page.waitForFunction(
    (expected) => {
      const state = window.__noteforestTest.settings();
      return (
        state.saveState.status === 'saved' &&
        Object.entries(expected).every(
          ([key, value]) => state.app.page.theme[key] === value,
        )
      );
    },
    fields,
    { timeout: 20000 },
  );
}

async function pageCss() {
  return activePageView().evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      body: style.getPropertyValue('--nf-page-body-size').trim(),
      heading1: style.getPropertyValue('--nf-page-heading-1').trim(),
      heading2: style.getPropertyValue('--nf-page-heading-2').trim(),
      heading3: style.getPropertyValue('--nf-page-heading-3').trim(),
      code: style.getPropertyValue('--nf-page-code-size').trim(),
      table: style.getPropertyValue('--nf-page-table-size').trim(),
      label: style.getPropertyValue('--nf-page-label-size').trim(),
      cardPadding: style.getPropertyValue('--nf-page-card-padding').trim(),
      cardBorder: style.getPropertyValue('--nf-page-card-border').trim(),
      segmentGap: style.getPropertyValue('--nf-page-segment-gap').trim(),
      maxCard: style.getPropertyValue('--nf-page-max-card-width').trim(),
    };
  });
}

describe('Batch C Page advanced typography and layout', () => {
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

  it('exposes first-class max card width and collapsed Advanced groups with frozen units/ranges', async () => {
    const env = ui.isolated('advanced-surface');
    await launch('advanced-surface', env);
    const packagePath = await openPackage(env, 'advanced-surface', multiPageBlocksDocument(12));
    await showPageRead();
    await openSettings();
    await waitPreviewState('ready');

    // First-class: max card width is present without opening Advanced layout.
    const maxCard = page.locator('[data-page-theme-input="maxCardWidth"]');
    assert.equal(await maxCard.isVisible(), true);
    assert.equal(await maxCard.inputValue(), '420');
    assert.equal(
      await page
        .locator('[data-page-theme-field="maxCardWidth"]')
        .evaluate((element) => element.closest('details') === null),
      true,
      'max card width is not inside a disclosure',
    );

    // Advanced groups are real disclosures, collapsed by default.
    for (const kind of ['typography', 'layout']) {
      const details = page.locator(`[data-page-advanced-${kind}]`);
      assert.equal(await details.count(), 1);
      assert.equal(await details.evaluate((element) => element.open), false);
    }
    assert.equal(await page.locator('[data-page-theme-input="bodyPt"]').isVisible(), false);

    await openAdvanced('typography');
    const typographyKeys = [
      'bodyPt',
      'bodyLine',
      'heading1Pt',
      'heading2Pt',
      'heading3Pt',
      'codePt',
      'codeLine',
      'tablePt',
      'tableLine',
      'labelPt',
    ];
    for (const key of typographyKeys) {
      assert.equal(
        await page.locator(`[data-page-theme-input="${key}"]`).count(),
        1,
        `${key} is present`,
      );
    }
    assert.match(
      await page.locator('[data-page-theme-field="bodyPt"]').innerText(),
      /Body size/,
    );
    assert.match(
      await page.locator('[data-page-theme-field="bodyLine"]').innerText(),
      /×/,
      'line heights are unitless',
    );
    assert.equal(
      await page
        .locator('[data-page-theme-field="bodyPt"]')
        .evaluate((element) => element.textContent.includes('pt')),
      true,
    );
    // Frozen range: an out-of-range value stays visible and never writes.
    const before = await settings();
    await fillThemeField('bodyPt', '5');
    await page.waitForSelector('[data-page-theme-error="bodyPt"]', { timeout: 5000 });
    assert.match(await page.locator('[data-page-theme-error="bodyPt"]').innerText(), /6 to 24 pt/);
    assert.equal(await page.locator('[data-page-theme-input="bodyPt"]').inputValue(), '5');
    assert.equal(
      await page.locator('[data-page-theme-input="bodyPt"]').getAttribute('aria-invalid'),
      'true',
    );
    assert.equal((await settings()).app.page.theme.bodyPt, before.app.page.theme.bodyPt);
    await fillThemeField('bodyPt', '9');
    await page.waitForSelector('[data-page-theme-error="bodyPt"]', { state: 'detached' });

    await openAdvanced('layout');
    const layoutKeys = [
      'minContentWidth',
      'cardPadding',
      'cardBorder',
      'segmentGap',
      'siblingGap',
      'calloutGap',
      'wrapIndent',
      'maxWrapIndent',
      'childIndent',
    ];
    for (const key of layoutKeys) {
      assert.equal(
        await page.locator(`[data-page-theme-input="${key}"]`).count(),
        1,
        `${key} is present`,
      );
    }
    assert.match(
      await page.locator('[data-page-theme-field="wrapIndent"]').innerText(),
      /List indent/,
      'wrapIndent is labelled List indent',
    );
    assert.match(
      await page.locator('[data-page-theme-field="maxWrapIndent"]').innerText(),
      /Max list indent/,
    );
    assert.equal(
      await page.locator('[data-page-theme-input="bodyPt"]').isVisible(),
      true,
      'both disclosures can be open',
    );

    // Hidden engine values never appear as fields.
    for (const hidden of [
      'fontScale',
      'headingScale',
      'chromePt',
      'markerPt',
      'pagePacking',
      'calloutModes',
      'wrapPolicy',
      'childTrunkInset',
      'calloutTrunkInset',
      'calloutCardIndent',
      'calloutRightGap',
      'calloutModeMinWidth',
    ]) {
      assert.equal(
        await page.locator(`[data-page-theme-input="${hidden}"]`).count(),
        0,
        `${hidden} stays hidden`,
      );
    }

    await page.locator('[data-page-layout-section="true"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(screenshotDir, 'max-card-width.png') });
    await page
      .locator('[data-page-advanced-layout="true"]')
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(screenshotDir, 'advanced-layout.png') });
    await page
      .locator('[data-page-advanced-typography="true"]')
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(screenshotDir, 'advanced-typography.png') });

    await closeSettings();
    assert.equal((await resolvedPageSettings(packagePath)).theme.bodyPt, 9);
  });

  it('writes advanced typography through one density lens and keeps the preview and Page Read in parity', async () => {
    const env = ui.isolated('advanced-typography');
    await launch('advanced-typography', env);
    const packagePath = await openPackage(
      env,
      'advanced-typography',
      multiPageBlocksDocument(20),
    );
    await showPageRead();
    await openSettings();
    await openAdvanced('typography');

    const targets = {
      bodyPt: '11',
      bodyLine: '1.5',
      heading1Pt: '17',
      heading2Pt: '15',
      heading3Pt: '12.5',
      codePt: '9.5',
      codeLine: '1.4',
      tablePt: '10',
      tableLine: '1.35',
      labelPt: '10.5',
    };
    for (const [key, value] of Object.entries(targets)) {
      await fillThemeField(key, value);
    }
    await waitThemeSaved({
      bodyPt: 11,
      bodyLine: 1.5,
      heading1Pt: 17,
      heading2Pt: 15,
      heading3Pt: 12.5,
      codePt: 9.5,
      codeLine: 1.4,
      tablePt: 10,
      tableLine: 1.35,
      labelPt: 10.5,
      preset: 'custom',
    });

    await page.waitForFunction(
      () => {
        const preview = document.querySelector('[data-page-preview="true"]');
        if (preview === null) return false;
        if (preview.getAttribute('data-page-preview-state') !== 'ready') return false;
        const style = getComputedStyle(preview);
        return (
          style.getPropertyValue('--nf-page-body-size').trim() === '11pt' &&
          style.getPropertyValue('--nf-page-heading-1').trim() === '17pt' &&
          style.getPropertyValue('--nf-page-code-size').trim() === '9.5pt'
        );
      },
      undefined,
      { timeout: 30000 },
    );
    assert.equal(
      await page.locator('[data-page-preset-option="custom"]').getAttribute('aria-pressed'),
      'true',
      'editing an advanced value marks the layer Custom',
    );
    await page.screenshot({ path: join(screenshotDir, 'preview-advanced.png') });

    // Density 80% applies the lens once to the stored raw values.
    const slider = page.locator('[data-page-density-slider]');
    await slider.focus();
    await slider.press('Home');
    for (let step = 0; step < 4; step += 1) await slider.press('ArrowRight');
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.settings();
        return (
          Math.round(state.app.page.theme.density * 100) === 80 &&
          state.app.page.theme.bodyPt === 11 &&
          state.saveState.status === 'saved'
        );
      },
      undefined,
      { timeout: 20000 },
    );
    await page.waitForFunction(
      () => {
        const preview = document.querySelector('[data-page-preview="true"]');
        if (preview === null) return false;
        if (preview.getAttribute('data-page-preview-state') !== 'ready') return false;
        return getComputedStyle(preview).getPropertyValue('--nf-page-body-size').trim() === '9pt';
      },
      undefined,
      { timeout: 30000 },
    );

    await closeSettings();
    await waitPageBody('9pt');
    const css = await pageCss();
    assert.equal(css.body, '9pt');
    assert.equal(css.heading1, '13.5pt');
    assert.equal(css.heading2, '11.75pt');
    assert.equal(css.code, '8.25pt');
    assert.equal(css.table, '8.5pt');
    assert.equal(css.label, '8.75pt');
    const resolved = await resolvedPageSettings(packagePath);
    assert.equal(resolved.theme.bodyPt, 11, 'the stored value stays raw');
    assert.equal(Math.round(resolved.theme.density * 100), 80);
    assert.equal(resolved.theme.preset, 'custom');
  });

  it('writes first-class max card width and advanced layout values into Page Read and the preview', async () => {
    const env = ui.isolated('advanced-layout');
    await launch('advanced-layout', env);
    const packagePath = await openPackage(env, 'advanced-layout', multiPageBlocksDocument(24));
    await showPageRead();
    const initialCount = Number(await activePageView().getAttribute('data-page-count'));
    await openSettings();
    await waitPreviewState('ready');

    await fillThemeField('maxCardWidth', '360');
    await waitThemeSaved({ maxCardWidth: 360 });
    assert.equal(
      (await settings()).app.page.theme.preset,
      'compact',
      'the first-class cap does not force Custom',
    );
    assert.equal(await page.locator('[data-page-theme-override="maxCardWidth"]').count(), 0);

    await openAdvanced('layout');
    const targets = {
      minContentWidth: '180',
      cardPadding: '14',
      cardBorder: '2',
      segmentGap: '6',
      siblingGap: '20',
      calloutGap: '22',
      wrapIndent: '22',
      maxWrapIndent: '64',
      childIndent: '34',
    };
    for (const [key, value] of Object.entries(targets)) {
      await fillThemeField(key, value);
    }
    await waitThemeSaved({
      maxCardWidth: 360,
      minContentWidth: 180,
      cardPadding: 14,
      cardBorder: 2,
      segmentGap: 6,
      siblingGap: 20,
      calloutGap: 22,
      wrapIndent: 22,
      maxWrapIndent: 64,
      childIndent: 34,
      preset: 'custom',
    });

    await page.waitForFunction(
      () => {
        const preview = document.querySelector('[data-page-preview="true"]');
        if (preview === null) return false;
        if (preview.getAttribute('data-page-preview-state') !== 'ready') return false;
        const style = getComputedStyle(preview);
        return (
          style.getPropertyValue('--nf-page-card-padding').trim() === '14px' &&
          style.getPropertyValue('--nf-page-card-border').trim() === '2px' &&
          style.getPropertyValue('--nf-page-segment-gap').trim() === '6px' &&
          style.getPropertyValue('--nf-page-max-card-width').trim() === '360px'
        );
      },
      undefined,
      { timeout: 30000 },
    );
    await page
      .locator('[data-page-advanced-layout="true"]')
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(screenshotDir, 'advanced-layout-values.png') });

    await closeSettings();
    await page.waitForFunction(
      () => {
        const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
        if (view === null) return false;
        return (
          view.getAttribute('data-ready') === 'true' &&
          view.getAttribute('data-updating') !== 'true' &&
          getComputedStyle(view).getPropertyValue('--nf-page-max-card-width').trim() ===
            '360px'
        );
      },
      undefined,
      { timeout: 30000 },
    );
    const css = await pageCss();
    assert.equal(css.cardPadding, '14px');
    assert.equal(css.cardBorder, '2px');
    assert.equal(css.segmentGap, '6px');
    assert.equal(css.maxCard, '360px');
    const cardWidth = await activePageView()
      .locator('.nf-page-card')
      .first()
      .evaluate((element) => element.getBoundingClientRect().width);
    assert.ok(cardWidth <= 360.5, `page cards respect the 360 px cap (${cardWidth})`);
    assert.ok(
      Number(await activePageView().getAttribute('data-page-count')) >= 1,
      'the document still paginates',
    );
    assert.ok(initialCount >= 1, 'the baseline page count exists');
    const resolved = await resolvedPageSettings(packagePath);
    assert.equal(resolved.theme.maxCardWidth, 360);
    assert.equal(resolved.theme.minContentWidth, 180);
    assert.equal(resolved.theme.wrapIndent, 22);
    assert.equal(resolved.theme.maxWrapIndent, 64);
    assert.equal(resolved.theme.childIndent, 34);
  });

  it('validates cross-field constraints inline, keeps the input, and blocks the write', async () => {
    const env = ui.isolated('advanced-validation');
    await launch('advanced-validation', env);
    await openPackage(env, 'advanced-validation', multiPageBlocksDocument(8));
    await showPageRead();
    await openSettings();
    await openAdvanced('typography');
    await openAdvanced('layout');

    // 9.5 pt keeps the compact H3 (10.5 pt) exactly at body + 1.
    await fillThemeField('bodyPt', '9.5');
    await waitThemeSaved({ bodyPt: 9.5 });

    // H2 must stay at least 1.5 pt above the 9.5 pt body (11 pt).
    await fillThemeField('heading2Pt', '10');
    await page.waitForSelector('[data-page-theme-error="heading2Pt"]', { timeout: 5000 });
    assert.match(
      await page.locator('[data-page-theme-error="heading2Pt"]').innerText(),
      /1\.5 pt above/,
    );
    assert.equal(
      await page.locator('[data-page-theme-input="heading2Pt"]').getAttribute('aria-invalid'),
      'true',
    );
    assert.match(
      (await page.locator('[data-page-theme-input="heading2Pt"]').getAttribute('aria-describedby')) ??
        '',
      /page-theme-heading2Pt-error/,
    );
    assert.equal(await page.locator('[data-page-theme-input="heading2Pt"]').inputValue(), '10');
    assert.equal((await settings()).app.page.theme.heading2Pt, 12, 'no silent write');
    assert.equal(
      await page.locator('[data-settings-status]').getAttribute('data-settings-status'),
      'invalid',
    );
    assert.equal(await page.locator('[data-page-preview-invalid="true"]').isVisible(), true);
    await page.screenshot({ path: join(screenshotDir, 'invalid-cross-field.png') });

    await fillThemeField('heading2Pt', '12');
    await waitThemeSaved({ heading2Pt: 12 });
    assert.equal(await page.locator('[data-page-theme-error="heading2Pt"]').count(), 0);

    // Max list indent cannot be below the list indent.
    await fillThemeField('wrapIndent', '30');
    await waitThemeSaved({ wrapIndent: 30 });
    await fillThemeField('maxWrapIndent', '20');
    await page.waitForSelector('[data-page-theme-error="maxWrapIndent"]', { timeout: 5000 });
    assert.match(await page.locator('[data-page-theme-error="maxWrapIndent"]').innerText(), /30 px/);
    assert.equal((await settings()).app.page.theme.maxWrapIndent, 36);
    await fillThemeField('maxWrapIndent', '60');
    await waitThemeSaved({ maxWrapIndent: 60 });

    // The child indent must keep the trunk and stem visible.
    await fillThemeField('childIndent', '20');
    await page.waitForSelector('[data-page-theme-error="childIndent"]', { timeout: 5000 });
    assert.match(await page.locator('[data-page-theme-error="childIndent"]').innerText(), /26 px/);
    assert.equal((await settings()).app.page.theme.childIndent, 26);
    await fillThemeField('childIndent', '26');
    await waitThemeSaved({ childIndent: 26 });

    // The card cap cannot be below the content floor.
    await fillThemeField('minContentWidth', '300');
    await waitThemeSaved({ minContentWidth: 300 });
    await fillThemeField('maxCardWidth', '200');
    await page.waitForSelector('[data-page-theme-error="maxCardWidth"]', { timeout: 5000 });
    assert.match(
      await page.locator('[data-page-theme-error="maxCardWidth"]').innerText(),
      /300 px/,
    );
    assert.match(
      (await page.locator('[data-page-theme-input="maxCardWidth"]').getAttribute('aria-describedby')) ??
        '',
      /page-theme-maxCardWidth-error/,
    );
    assert.equal((await settings()).app.page.theme.maxCardWidth, 420);
    await fillThemeField('maxCardWidth', '320');
    await waitThemeSaved({ maxCardWidth: 320 });

    // Closing with an invalid range still never writes it.
    const lastBody = (await settings()).app.page.theme.bodyPt;
    await fillThemeField('bodyPt', '5');
    await page.waitForSelector('[data-page-theme-error="bodyPt"]', { timeout: 5000 });
    await closeSettings();
    assert.equal((await settings()).app.page.theme.bodyPt, lastBody);
  });

  it('warns before a preset switch replaces advanced values and never discards them silently', async () => {
    const env = ui.isolated('advanced-preset');
    await launch('advanced-preset', env);
    await openPackage(env, 'advanced-preset', multiPageBlocksDocument(12));
    await showPageRead();
    await openSettings();
    await openAdvanced('typography');

    await fillThemeField('bodyPt', '9.5');
    await waitThemeSaved({ bodyPt: 9.5, preset: 'custom' });
    assert.equal(
      await page.locator('[data-page-preset-option="custom"]').getAttribute('aria-pressed'),
      'true',
    );

    await page.locator('[data-page-preset-option="comfortable"]').click();
    await page.waitForSelector('[data-page-preset-warning="true"]', { timeout: 5000 });
    assert.match(
      await page.locator('[data-page-preset-warning="true"]').innerText(),
      /replaces the custom typography and layout values/,
    );
    // Nothing changed while the warning is open.
    assert.equal((await settings()).app.page.theme.preset, 'custom');
    assert.equal((await settings()).app.page.theme.bodyPt, 9.5);

    await page.locator('[data-page-preset-cancel="true"]').click();
    await page.waitForSelector('[data-page-preset-warning="true"]', { state: 'detached' });
    assert.equal((await settings()).app.page.theme.preset, 'custom');
    assert.equal((await settings()).app.page.theme.bodyPt, 9.5);

    await page.locator('[data-page-preset-option="comfortable"]').click();
    await page.waitForSelector('[data-page-preset-warning="true"]', { timeout: 5000 });
    await page.locator('[data-page-preset-confirm="true"]').click();
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.settings();
        return (
          state.app.page.theme.preset === 'comfortable' &&
          state.app.page.theme.bodyPt === 10.5 &&
          state.saveState.status === 'saved'
        );
      },
      undefined,
      { timeout: 20000 },
    );
    assert.equal(await page.locator('[data-page-preset-warning="true"]').count(), 0);
    assert.equal(
      await page.locator('[data-page-preset-option="comfortable"]').getAttribute('aria-pressed'),
      'true',
    );

    await closeSettings();
    await waitPageBody('10.5pt');
  });

  it('participates in document scope, per-field overrides, equal-to-global, and group Use global', async () => {
    const env = ui.isolated('advanced-overrides');
    await launch('advanced-overrides', env);
    const packagePath = await openPackage(env, 'advanced-overrides', multiPageBlocksDocument(12));
    await showPageRead();
    await openSettings();
    await page.locator('[data-page-scope-option="document"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="document"]')
          ?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal((await settings()).pageOverrides[packagePath], undefined);

    // First-class max card width: partial override, equal-to-global removal.
    await fillThemeField('maxCardWidth', '380');
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          state.pageOverrides[path]?.theme?.maxCardWidth === 380 &&
          state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 20000 },
    );
    assert.equal((await settings()).app.page.theme.maxCardWidth, 420);
    assert.equal(await page.locator('[data-page-theme-override="maxCardWidth"]').count(), 1);
    await fillThemeField('maxCardWidth', '420');
    await page.waitForFunction(
      (path) => window.__noteforestTest.settings().pageOverrides[path] === undefined,
      packagePath,
      { timeout: 20000 },
    );
    assert.equal(await page.locator('[data-page-theme-override="maxCardWidth"]').count(), 0);

    // Advanced typography: partial custom override with per-field dots.
    await openAdvanced('typography');
    await fillThemeField('bodyPt', '9.5');
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          state.pageOverrides[path]?.theme?.bodyPt === 9.5 &&
          state.pageOverrides[path]?.theme?.preset === 'custom' &&
          state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 20000 },
    );
    await fillThemeField('heading1Pt', '15');
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          state.pageOverrides[path]?.theme?.heading1Pt === 15 &&
          state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 20000 },
    );
    assert.equal(await page.locator('[data-page-theme-override="bodyPt"]').count(), 1);
    assert.equal(await page.locator('[data-page-theme-override="heading1Pt"]').count(), 1);
    assert.equal(await page.locator('[data-page-preset-override="true"]').count(), 1);

    // Per-field Use global removes only the edited field.
    await page.locator('[data-page-theme-use-global="bodyPt"]').click();
    await page.waitForFunction(
      (path) => {
        const theme = window.__noteforestTest.settings().pageOverrides[path]?.theme;
        return (
          theme?.bodyPt === undefined &&
          theme?.heading1Pt === 15 &&
          theme?.preset === 'custom' &&
          window.__noteforestTest.settings().saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 20000 },
    );
    assert.equal(await page.locator('[data-page-theme-input="bodyPt"]').inputValue(), '9');

    // Group Use global removes the remaining advanced typography values.
    await page.locator('[data-page-advanced-typography-use-global]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.settings().pageOverrides[path] === undefined,
      packagePath,
      { timeout: 20000 },
    );
    assert.equal(await page.locator('[data-page-theme-override="heading1Pt"]').count(), 0);
    assert.equal(await page.locator('[data-page-preset-override="true"]').count(), 0);

    // Advanced layout group keeps the first-class cap but clears layout fields.
    await fillThemeField('maxCardWidth', '380');
    await page.waitForFunction(
      (path) => window.__noteforestTest.settings().pageOverrides[path]?.theme?.maxCardWidth === 380,
      packagePath,
      { timeout: 20000 },
    );
    await openAdvanced('layout');
    await fillThemeField('cardPadding', '14');
    await page.waitForFunction(
      (path) => window.__noteforestTest.settings().pageOverrides[path]?.theme?.cardPadding === 14,
      packagePath,
      { timeout: 20000 },
    );
    await page.locator('[data-page-advanced-layout-use-global]').click();
    await page.waitForFunction(
      (path) => {
        const theme = window.__noteforestTest.settings().pageOverrides[path]?.theme;
        return (
          theme?.cardPadding === undefined &&
          theme?.maxCardWidth === 380 &&
          theme?.preset === undefined &&
          window.__noteforestTest.settings().saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 20000 },
    );
    assert.equal(await page.locator('[data-page-preset-override="true"]').count(), 0);

    // Switching layers is not a write.
    await page.locator('[data-page-scope-option="global"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="global"]')
          ?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );
    await page.locator('[data-page-scope-option="document"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="document"]')
          ?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(
      (await settings()).pageOverrides[packagePath]?.theme?.maxCardWidth,
      380,
      'the document override survives a scope round-trip',
    );

    await closeSettings();
  });

  it('allows advanced personal overrides on a read-only document without changing content', async () => {
    const env = ui.isolated('advanced-read-only');
    const packagePath = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'advanced-read-only',
      pageDocument({
        id: 'advanced-readonly',
        title: 'Advanced read-only',
        chapterTitle: 'Read only',
        blocks: [textBlock('intro', 'Intro', 'Read-only content for advanced Page settings.')],
      }),
    );
    const lockDir = join(env.NOTEFOREST_APP_SUPPORT, 'locks');
    await mkdir(lockDir, { recursive: true });
    const lockPath = join(
      lockDir,
      `${createHash('sha256').update(resolve(packagePath)).digest('hex')}.lock`,
    );
    const now = new Date().toISOString();
    await writeFile(
      lockPath,
      JSON.stringify({
        version: 1,
        documentPath: resolve(packagePath),
        pid: process.pid,
        host: (await import('node:os')).hostname(),
        sessionId: 'advanced-read-only-test',
        token: 'advanced-read-only-test-token',
        acquiredAt: now,
        heartbeatAt: now,
      }),
      'utf8',
    );
    await launch('advanced-read-only', env);
    const opened = await page.evaluate(
      (path) => window.__noteforestTest.openPath(path),
      packagePath,
    );
    assert.equal(opened, true);
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === path);
        return runtime?.status === 'read-only';
      },
      packagePath,
      { timeout: 10000 },
    );
    const documentHash = createHash('sha256')
      .update(await readFile(join(packagePath, 'document.json')))
      .digest('hex');

    await openSettings();
    await page.locator('[data-page-scope-option="document"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="document"]')
          ?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );
    await openAdvanced('typography');
    await fillThemeField('bodyPt', '9.5');
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          state.pageOverrides[path]?.theme?.bodyPt === 9.5 &&
          state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 20000 },
    );
    await closeSettings();
    assert.equal((await settings()).app.page.theme.bodyPt, 9);

    const afterHash = createHash('sha256')
      .update(await readFile(join(packagePath, 'document.json')))
      .digest('hex');
    assert.equal(afterHash, documentHash, 'the read-only content was not modified');
    const durable = JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'document-settings.json'), 'utf8'),
    );
    assert.equal(
      durable.entries.find((entry) => entry.packagePath === packagePath)?.page?.theme?.bodyPt,
      9.5,
    );
  });

  it('commits an open Page Edit before an advanced typography write', async () => {
    const env = ui.isolated('advanced-page-edit');
    await launch('advanced-page-edit', env);
    const packagePath = await openPackage(
      env,
      'advanced-page-edit',
      pageDocument({
        id: 'advanced-page-edit',
        title: 'Advanced Page edit',
        chapterTitle: 'Chapter',
        blocks: [
          textBlock('intro', 'Intro', 'Original page text.'),
          textBlock('extra', 'Extra', 'A second block keeps the chapter valid.'),
        ],
      }),
    );
    await showPageRead();
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-interaction-mode') === 'edit',
      undefined,
      { timeout: 5000 },
    );
    const fragment = activePageView().locator('[data-fragment-block="intro"]').first();
    await fragment.dblclick();
    await page.waitForSelector('[data-page-edit-overlay]', { timeout: 5000 });
    await page.waitForFunction(
      () => document.activeElement?.closest('[data-page-edit-overlay]') !== null,
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.type(' ADVANCED');
    await page.waitForFunction(
      () => {
        const overlay = document.querySelector('[data-page-edit-overlay]');
        return overlay !== null && (overlay.textContent ?? '').includes('ADVANCED');
      },
      undefined,
      { timeout: 5000 },
    );

    await openSettingsFromButton();
    await openAdvanced('typography');
    await fillThemeField('bodyPt', '9.5');
    await page.waitForFunction(
      () => window.__noteforestTest.settings().app.page.theme.bodyPt === 9.5,
      undefined,
      { timeout: 20000 },
    );
    await page.waitForSelector('[data-page-edit-overlay]', { state: 'detached', timeout: 10000 });
    assert.match(JSON.stringify((await ui.structure()).blocks.intro.content), /ADVANCED/);

    await closeSettings();
    await waitPageBody('9.5pt');
    assert.equal((await resolvedPageSettings(packagePath)).theme.bodyPt, 9.5);
  });
});
