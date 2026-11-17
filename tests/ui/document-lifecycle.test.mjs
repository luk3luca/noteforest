import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { artifactsPath, killTestAppsUnder, waitUntil } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageDocument, textBlock, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * L3 drafts and L4 document management.
 *
 * `+` is in-memory only: no package, lock, recent, or session entry until the
 * first real mutation. The first keystroke materializes in the bound library
 * and the tab path changes without remounting the editor. Rename changes the
 * title only; Move to Trash flushes, uses the OS Trash, cleans recent/settings/
 * session, and activates the next tab.
 */

const tempRoot = artifactsPath('document-lifecycle-temp');
const screenshotDir = artifactsPath('document-lifecycle');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(name, overrides = {}) {
  page = await ui.launch({ ...ui.isolated(name), ...overrides });
  await h.setWindowSize(1440, 900);
  await page.waitForSelector(
    '[data-sidebar-panel="library"] [data-library-new="true"]:not([disabled])',
  );
}

async function state() {
  return page.evaluate(() => window.__noteforestTest.state());
}

/** Switch the shell theme through the real appearance settings path. */
async function setTheme(theme) {
  await page.evaluate(async (next) => {
    const app = window.__noteforestTest.settings().app;
    await window.__noteforestTest.setSettings({
      ...app,
      appearance: { ...app.appearance, theme: next },
    });
  }, theme);
  await page.waitForFunction(
    (next) => document.documentElement.dataset.theme === next,
    theme,
    { timeout: 10000 },
  );
  // Cards animate background/color for 120 ms; wait for running CSS
  // transitions to finish before a screenshot instead of sleeping.
  await page.evaluate(async () => {
    const transitions = document
      .getAnimations()
      .filter((animation) => animation.constructor.name === 'CSSTransition');
    await Promise.all(transitions.map((animation) => animation.finished.catch(() => undefined)));
  });
}

async function clickNewNote(expectedTabs) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await state()).tabs.length >= expectedTabs) return;
    await page.locator('[data-library-new="true"]').click();
    try {
      await page.waitForFunction(
        (count) => window.__noteforestTest.state().tabs.length === count,
        expectedTabs,
        { timeout: 3000 },
      );
      return;
    } catch {
      // The first click can land before the shell's first renderer tick.
    }
  }
  await page.waitForFunction(
    (count) => window.__noteforestTest.state().tabs.length === count,
    expectedTabs,
    { timeout: 10000 },
  );
}

async function waitTabPathChange(draftKey) {
  await page.waitForFunction(
    (key) => !window.__noteforestTest.state().tabs.some((tab) => tab.packagePath === key),
    draftKey,
    { timeout: 15000 },
  );
  const current = await state();
  const tab = current.tabs.at(-1);
  assert.ok(
    tab !== undefined && tab.packagePath.startsWith(current.library.path),
    'the materialized tab is inside the library',
  );
  return tab.packagePath;
}

/**
 * Wait until the app has taken a verdict on the current lock state: the draft
 * is gone, the retry affordance is unmounted, and the tab holds a real package.
 * The banner's Retry can be clicked while the previous materialize attempt is
 * still in flight, so the subtest waits for what the app reports instead of for
 * a duration.
 */
async function waitDraftMaterialized({ timeout = 15000 } = {}) {
  await page.waitForFunction(
    () => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes[0];
      return (
        runtime !== undefined &&
        runtime.draftId === null &&
        runtime.draftError === null &&
        current.tabs.every((tab) => !String(tab.packagePath).startsWith('draft:'))
      );
    },
    undefined,
    { timeout },
  );
}

async function writeLock(env, packagePath, record) {
  const file = join(
    env.NOTEFOREST_APP_SUPPORT,
    'locks',
    `${createHash('sha256').update(resolve(packagePath)).digest('hex')}.lock`,
  );
  await mkdir(join(env.NOTEFOREST_APP_SUPPORT, 'locks'), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify(
      {
        version: 1,
        documentPath: resolve(packagePath),
        sessionId: 'lifecycle-session',
        token: 'lifecycle-token',
        acquiredAt: '2020-01-01T00:00:00.000Z',
        ...record,
      },
      null,
      2,
    )}\n`,
  );
  return file;
}

async function libraryEntries(env) {
  return (await readdir(env.NOTEFOREST_LIBRARY).catch(() => [])).filter(
    (name) => !name.startsWith('.'),
  );
}

async function sessionFile(env) {
  return JSON.parse(
    await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'shell-session.json'), 'utf8'),
  );
}

async function recentsFile(env) {
  try {
    return JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'recent-documents.json'), 'utf8'),
    );
  } catch {
    return { items: [] };
  }
}

async function documentSettingsFile(env) {
  return JSON.parse(
    await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'document-settings.json'), 'utf8'),
  );
}

function pageOverrideEntry(file, packagePath) {
  return file.entries.find((entry) => entry.packagePath === packagePath) ?? null;
}

async function openRowMenu(title) {
  const row = page.locator('[data-sidebar-panel="library"] .nf-library-row', { hasText: title });
  await row.waitFor();
  await row.locator('.nf-row-menu').click();
  await page.locator('.nf-menu').waitFor();
}

async function chooseRowMenu(label) {
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  await page.locator('.nf-menu').waitFor({ state: 'detached' });
}

async function refreshLibrary() {
  await page.locator('[data-library-switcher]').click();
  await page.getByRole('menuitem', { name: 'Refresh', exact: true }).click();
  await page.locator('.nf-menu').waitFor({ state: 'detached' });
}

describe('Document lifecycle', () => {
  before(async () => {
    // Kill a stale test app from an earlier run before removing its userData;
    // a running app can rewrite its session after the rm and leave an active
    // library path that no longer exists.
    killTestAppsUnder(tempRoot);
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

  it('writes nothing for an untouched draft and never persists it in the session', async () => {
    const env = ui.isolated('discard');
    await launch('discard', env);
    assert.deepEqual(await libraryEntries(env), []);

    await clickNewNote(1);
    const draft = await state();
    assert.match(draft.tabs[0]?.packagePath ?? '', /^draft:/);
    assert.equal(draft.library?.documents.length, 0, 'the draft is not in the library');
    assert.deepEqual(await libraryEntries(env), [], 'the untouched draft writes no folder');
    await page.screenshot({ path: join(screenshotDir, 'draft-untouched.png') });

    await h.flushSession();
    const persisted = await sessionFile(env);
    assert.equal(
      persisted.tabs.some((tab) => String(tab.packagePath).startsWith('draft:')),
      false,
      'a draft is never persisted in the session',
    );

    // Closing an untouched draft discards it; a plain close never materializes.
    await page.evaluate(() =>
      window.__noteforestTest.closePath(window.__noteforestTest.state().activeTab),
    );
    await page.waitForFunction(() => window.__noteforestTest.state().tabs.length === 0);
    assert.deepEqual(await libraryEntries(env), []);
    assert.deepEqual((await recentsFile(env)).items, []);

    // Quit with an untouched draft: still nothing on disk, and the relaunch
    // restores no draft.
    await clickNewNote(1);
    await h.quit();
    assert.deepEqual(await libraryEntries(env), []);
    await launch('discard', env);
    assert.equal((await state()).tabs.length, 0, 'the draft did not survive the relaunch');

    // A dirty draft saves before quit: the flushed text is on disk after the
    // relaunch (the flush materializes and writes the debounced edit).
    await clickNewNote(1);
    const dirtyDraftKey = (await state()).tabs[0]?.packagePath ?? '';
    await page.locator('.nf-editor[data-active="true"] .nf-block-prose').first().click();
    await page.keyboard.type('Saved on quit');
    await waitTabPathChange(dirtyDraftKey);
    await page.keyboard.type(' and flushed');
    await h.quit();
    await launch('discard', env);
    await page.waitForFunction(() => window.__noteforestTest.state().tabs.length === 1);
    await page.waitForFunction(
      () => window.__noteforestTest.state().runtimes[0]?.title === 'Untitled',
    );
    const [savedFolder] = await libraryEntries(env);
    const saved = await readFile(
      join(env.NOTEFOREST_LIBRARY, savedFolder ?? '', 'document.json'),
      'utf8',
    );
    assert.match(saved, /Saved on quit and flushed/);
  });

  it('materializes a draft for a per-document Page setting and for an export', async () => {
    const env = ui.isolated('draft-actions');
    await launch('draft-actions', env);
    await clickNewNote(1);
    const settingDraft = (await state()).tabs[0]?.packagePath ?? '';

    await page.keyboard.press('Meta+,');
    await page.waitForSelector('[data-settings-dialog="true"]');
    await page.locator('[data-settings-nav="page"]').click();
    await page.locator('[data-page-scope-option="document"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="document"]')
          ?.getAttribute('aria-pressed') === 'true',
    );
    await page.locator('[data-page-density-slider]').focus();
    await page.locator('[data-page-density-slider]').press('End');
    const settingPath = await waitTabPathChange(settingDraft);
    const entry = await waitUntil(async () => {
      try {
        const file = JSON.parse(
          await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'document-settings.json'), 'utf8'),
        );
        return (
          file.entries.find((candidate) => candidate.packagePath === settingPath) ?? false
        );
      } catch {
        return false;
      }
    }, 'per-document override write');
    assert.equal(entry.packagePath, settingPath);
    assert.equal(typeof entry.documentId, 'string');
    assert.ok(entry.page?.theme?.density !== undefined, 'the density override was kept');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });

    // Export from a fresh draft materializes before the sheet pins its path.
    await clickNewNote(2);
    const exportDraft = (await state()).tabs[1]?.packagePath ?? '';
    assert.match(exportDraft, /^draft:/);
    await page.evaluate(() => window.__noteforestTest.dispatchMenuCommand('export-pdf'));
    await page.waitForSelector('[data-export-sheet="true"]', { timeout: 15000 });
    const exportPath = await waitTabPathChange(exportDraft);
    assert.equal(exportPath.startsWith(env.NOTEFOREST_LIBRARY), true);
    assert.equal(await page.locator('[data-export-sheet="true"]').count(), 1);
    await page.locator('[data-export-close="true"]').click();
    await page.waitForSelector('[data-export-sheet="true"]', { state: 'detached' });
  });

  it('materializes a draft for an immediate Page setting and leaves no draft override', async () => {
    const env = ui.isolated('draft-immediate');
    await launch('draft-immediate', env);
    await clickNewNote(1);
    const draftKey = (await state()).tabs[0]?.packagePath ?? '';
    assert.match(draftKey, /^draft:/);

    await page.keyboard.press('Meta+,');
    await page.waitForSelector('[data-settings-dialog="true"]');
    await page.locator('[data-settings-nav="page"]').click();
    await page.locator('[data-page-scope-option="document"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="document"]')
          ?.getAttribute('aria-pressed') === 'true',
    );

    // Immediate chrome write (not a debounced slider): the first click must
    // materialize the draft and retarget the write to the package (F4). The
    // controlled checkbox can re-render while the materialization awaits, so
    // the click is not asserted on the DOM; the persisted override is.
    await page.locator('[data-page-chrome-page-number]').click();
    const packagePath = await waitTabPathChange(draftKey);
    const chromeEntry = await waitUntil(async () => {
      try {
        const entry = pageOverrideEntry(await documentSettingsFile(env), packagePath);
        return entry?.page?.chrome?.pageNumber === false ? entry : false;
      } catch {
        return false;
      }
    }, 'immediate chrome override on the package');

    // A size and a preset change are immediate writes too; they stay on the
    // same package and keep the earlier chrome override.
    await page.locator('[data-page-size-option="A5"]').click();
    await page.locator('[data-page-preset-option="comfortable"]').click();
    const fullEntry = await waitUntil(async () => {
      try {
        const entry = pageOverrideEntry(await documentSettingsFile(env), packagePath);
        return entry?.page?.setup?.size === 'A5' &&
          entry?.page?.theme?.preset === 'comfortable' &&
          entry?.page?.chrome?.pageNumber === false
          ? entry
          : false;
      } catch {
        return false;
      }
    }, 'immediate size and preset override on the package');
    assert.equal(fullEntry.documentId, chromeEntry.documentId);

    const inMemory = await page.evaluate(() => window.__noteforestTest.settings());
    assert.equal(
      inMemory.documentSettings.some((entry) => String(entry.packagePath).startsWith('draft:')),
      false,
      'no in-memory override stays keyed by the draft',
    );
    const stored = await documentSettingsFile(env);
    assert.deepEqual(
      stored.entries.map((entry) => entry.packagePath),
      [packagePath],
      'exactly one package-keyed override was written',
    );
    assert.equal(
      stored.entries.some((entry) => String(entry.packagePath).startsWith('draft:')),
      false,
      'the map has no draft-keyed entry',
    );

    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
    assert.equal(
      (await state()).tabs[0]?.packagePath,
      packagePath,
      'the tab stays materialized',
    );
    assert.equal(
      (await stat(join(packagePath, 'document.json'))).isFile(),
      true,
      'the document persisted',
    );
    await page.screenshot({
      path: join(artifactsPath('sentinel-fixes'), 'draft-immediate-materialized.png'),
    });
    // Closing the tab keeps the override and leaves no orphan draft entry.
    await page.evaluate(() =>
      window.__noteforestTest.closePath(window.__noteforestTest.state().activeTab),
    );
    await page.waitForFunction(() => window.__noteforestTest.state().tabs.length === 0);
    const afterClose = await documentSettingsFile(env);
    assert.deepEqual(afterClose.entries.map((entry) => entry.packagePath), [packagePath]);
  });

  it('keeps an immediate A5 write when a debounced density materializes the draft (R2)', async () => {
    const env = ui.isolated('draft-debounce-immediate');
    await launch('draft-debounce-immediate', env);
    await clickNewNote(1);
    const draftKey = (await state()).tabs[0]?.packagePath ?? '';
    assert.match(draftKey, /^draft:/);

    await page.keyboard.press('Meta+,');
    await page.waitForSelector('[data-settings-dialog="true"]');
    await page.locator('[data-settings-nav="page"]').click();
    await page.locator('[data-page-scope-option="document"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="document"]')
          ?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );

    // Move the density slider (240 ms debounced write) and click A5 inside that
    // window, in one task: the A5 write captures the draft target, its
    // pre-execute flush applies the density and materializes the draft, and the
    // captured draft key must resolve to the new package by document id (R2).
    // No sleep and no timing assumption: the debounce timer cannot fire before
    // the same task ends.
    await page.evaluate(() => {
      const slider = document.querySelector('[data-page-density-slider]');
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      ).set;
      setter.call(slider, '120');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-page-size-option="A5"]').click();
    });

    const packagePath = await waitTabPathChange(draftKey);
    const entry = await waitUntil(async () => {
      try {
        const candidate = pageOverrideEntry(await documentSettingsFile(env), packagePath);
        return candidate?.page?.setup?.size === 'A5' &&
          Math.round((candidate?.page?.theme?.density ?? 0) * 100) === 120
          ? candidate
          : false;
      } catch {
        return false;
      }
    }, 'density flush + immediate size override');

    // The write reported saved, not "the document closed before this change was
    // saved", and Retry was never needed.
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-settings-status]')
          ?.getAttribute('data-settings-status') === 'saved',
      undefined,
      { timeout: 15000 },
    );
    assert.equal(await page.locator('[data-settings-save-error]').count(), 0);
    assert.equal(await page.locator('[data-settings-retry]').count(), 0);
    await page.waitForFunction(
      () => {
        const preview = document.querySelector('[data-page-preview="true"]');
        return (
          preview?.getAttribute('data-page-preview-size') === 'A5' &&
          preview?.getAttribute('data-page-preview-density') === '120'
        );
      },
      undefined,
      { timeout: 15000 },
    );
    const documentId = await page.evaluate(
      (path) =>
        window.__noteforestTest.state().runtimes.find(
          (runtime) => runtime.packagePath === path,
        )?.documentId,
      packagePath,
    );
    assert.equal(typeof documentId, 'string', 'the copy has a real document identity');
    assert.equal(entry.documentId, documentId, 'the override is keyed by that identity');
    const inMemory = await page.evaluate(() => window.__noteforestTest.settings());
    assert.equal(
      inMemory.documentSettings.some((candidate) => String(candidate.packagePath).startsWith('draft:')),
      false,
      'no in-memory override stays keyed by the draft',
    );

    await mkdir(artifactsPath('identity-followups'), { recursive: true });
    await page.screenshot({
      path: join(artifactsPath('identity-followups'), 'density-debounce-a5.png'),
    });
  });

  it('materializes on the first keystroke and keeps the mounted editor state', async () => {
    const env = ui.isolated('materialize');
    await launch('materialize', env);
    // A live lock on the first folder name keeps the draft in memory while it
    // is edited, so scroll, selection, and undo exist at the path swap.
    const liveLock = await writeLock(env, join(env.NOTEFOREST_LIBRARY, 'untitled'), {
      pid: process.pid,
      host: 'lifecycle-live-host',
      heartbeatAt: new Date().toISOString(),
    });

    await clickNewNote(1);
    const draftKey = (await state()).tabs[0]?.packagePath ?? '';
    assert.match(draftKey, /^draft:/);
    await page.locator('.nf-editor[data-active="true"] .nf-block-prose').first().click();
    for (let line = 1; line <= 30; line += 1) {
      await page.keyboard.type(`Line ${line}`);
      if (line < 30) await page.keyboard.press('Enter');
    }
    await page.waitForSelector('[data-draft-materialize-error]');
    await page.screenshot({ path: join(screenshotDir, 'draft-blocked.png') });
    // A draft failure is exactly one surface: DraftMaterializeBanner in the
    // shell, with no save-failure banner and no raw `draft:<id>` text.
    assert.equal(await page.locator('[data-draft-materialize-error]').count(), 1);
    assert.equal(
      await page.locator('[data-save-failure="true"]').count(),
      0,
      'the save-failure surface is suppressed while the runtime is a draft',
    );
    const draftSurface = await page
      .locator('[data-draft-materialize-error]')
      .evaluate((element) => ({
        parent: element.parentElement?.className ?? '',
        insideCanvas: element.closest('.nf-canvas-panel') !== null,
        actions: [...element.querySelectorAll('button')].map((button) => button.textContent?.trim()),
      }));
    assert.match(draftSurface.parent, /nf-main-column/);
    assert.equal(draftSurface.insideCanvas, false, 'the draft banner is shell chrome');
    assert.deepEqual(draftSurface.actions, ['Choose another library…', 'Retry']);
    assert.doesNotMatch(
      await page.locator('.nf-main-column').innerText(),
      /draft:/,
      'the raw draft key is never visible',
    );
    await setTheme('light');
    await page.screenshot({ path: join(screenshotDir, 'draft-blocked-light.png') });
    await setTheme('dark');

    // Scroll and select before the swap; remember the exact editor DOM node.
    const before = await page.evaluate(() => {
      const scroller = document.querySelector('.nf-editor[data-active="true"] .nf-editor-scroll');
      scroller.scrollTop = 240;
      const prose = document.querySelector('.nf-editor[data-active="true"] .nf-prosemirror');
      window.__nfProseBefore = prose;
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      return {
        scrollTop: scroller.scrollTop,
        selectedBlockId: runtime?.selectedBlockId ?? null,
        canUndoText: runtime?.canUndoText ?? false,
      };
    });
    assert.equal(before.canUndoText, true, 'typed text is undoable before the swap');

    await rm(liveLock);
    await page.locator('[data-draft-retry="true"]').click();
    // The app can still hold the lock verdict it took while the file existed.
    // Wait for the materialization it reports, not for a duration, before
    // asking the save state to settle.
    await waitDraftMaterialized();
    assert.equal(
      await page.locator('[data-draft-retry="true"]').count(),
      0,
      'the retry affordance is gone once the package exists',
    );
    const packagePath = await waitTabPathChange(draftKey);
    await h.waitSaved();
    const after = await page.evaluate(() => {
      const scroller = document.querySelector('.nf-editor[data-active="true"] .nf-editor-scroll');
      const prose = document.querySelector('.nf-editor[data-active="true"] .nf-prosemirror');
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      return {
        sameEditor: window.__nfProseBefore === prose && prose.isConnected,
        scrollTop: scroller.scrollTop,
        selectedBlockId: runtime?.selectedBlockId ?? null,
        canUndoText: runtime?.canUndoText ?? false,
        draftId: runtime?.draftId ?? null,
      };
    });
    assert.equal(after.sameEditor, true, 'the TipTap editor is not remounted');
    assert.equal(after.draftId, null, 'the runtime is no longer a draft');
    assert.ok(
      Math.abs(after.scrollTop - before.scrollTop) <= 2,
      `scroll survives the swap (${before.scrollTop} -> ${after.scrollTop})`,
    );
    assert.equal(after.selectedBlockId, before.selectedBlockId, 'selection survives the swap');
    assert.equal(after.canUndoText, true, 'text history survives the swap');
    assert.equal((await libraryEntries(env)).length, 1, 'exactly one package exists');
    await page.screenshot({ path: join(screenshotDir, 'draft-materialized.png') });

    // The text history still works after materialization.
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      () =>
        !document
          .querySelector('.nf-editor[data-active="true"]')
          ?.textContent?.includes('Line 30'),
    );
    assert.match(packagePath, new RegExp(`^${env.NOTEFOREST_LIBRARY}`));
  });

  it('renames the title only, reveals the package, and moves it to the Trash', async () => {
    const env = ui.isolated('documents');
    await launch('documents', env);
    await ui.seedDemo();
    const demoPath = (await state()).tabs[0]?.packagePath ?? '';

    // A second document materializes from a draft and is renamed from the row
    // menu. The package folder name stays stable.
    await clickNewNote(2);
    const draftKey = (await state()).tabs[1]?.packagePath ?? '';
    await page.locator('.nf-editor[data-active="true"] .nf-block-prose').first().click();
    await page.keyboard.type('Second note body');
    const secondPath = await waitTabPathChange(draftKey);
    await h.waitSaved();
    const folderBefore = secondPath.split('/').at(-1);

    await openRowMenu('Untitled');
    await chooseRowMenu('Rename document…');
    await page.locator('.nf-input').fill('Renamed note');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() =>
      window.__noteforestTest.state().tabs.some((tab) => tab.title === 'Renamed note'),
    );
    const renamed = await state();
    const tab = renamed.tabs.find((candidate) => candidate.title === 'Renamed note');
    assert.equal(tab?.packagePath, secondPath, 'the tab path did not change');
    assert.equal(secondPath.split('/').at(-1), folderBefore, 'the folder name stays stable');
    await page.waitForFunction(
      (path) =>
        window.__noteforestTest.state().library?.documents.some(
          (document) => document.title === 'Renamed note' && document.packagePath === path,
        ) === true,
      secondPath,
      { timeout: 15000 },
    );

    // Reveal uses shell.showItemInFolder on document.json.
    await h.app.evaluate(({ shell: electronShell }) => {
      globalThis.__nfRevealed = null;
      electronShell.showItemInFolder = (target) => {
        globalThis.__nfRevealed = target;
      };
    });
    await openRowMenu('Renamed note');
    await chooseRowMenu('Reveal in Finder');
    const revealed = await waitUntil(
      () => h.app.evaluate(() => globalThis.__nfRevealed),
      'reveal in Finder',
    );
    assert.equal(revealed, join(secondPath, 'document.json'));

    // Cancel is the focused default and leaves the package untouched.
    await h.flushSession();
    await openRowMenu('Renamed note');
    await chooseRowMenu('Move to Trash…');
    await page.waitForSelector('[data-trash-dialog="true"]');
    const dialog = await page.evaluate(() => ({
      text: document.querySelector('[data-trash-dialog]')?.textContent ?? '',
      detailsSummary: document.querySelector('[data-trash-dialog] [data-details] summary')
        ?.textContent ?? '',
      detailsValue:
        document.querySelector('[data-trash-dialog] [data-details-value]')?.textContent ?? '',
      focused: document.activeElement?.textContent ?? '',
    }));
    assert.match(dialog.text, /Renamed note/);
    assert.equal(dialog.detailsSummary, 'Details', 'the path moved into Details');
    assert.equal(dialog.detailsValue, secondPath, 'the Details value is the exact path');
    assert.equal(
      await page.locator('[data-trash-dialog] [data-trash-path]').count(),
      0,
      'the path is no longer a paragraph',
    );
    assert.match(dialog.focused, /Cancel/, 'Cancel is focused by default');
    await page.screenshot({ path: join(screenshotDir, 'trash-confirmation.png') });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForSelector('[data-trash-dialog="true"]', { state: 'detached' });
    assert.equal((await stat(secondPath)).isDirectory(), true, 'Cancel keeps the package');

    // Confirmed Move to Trash: the OS Trash moves the package, references are
    // cleaned, the tab closes, and the previous tab becomes active.
    const tabsBefore = (await state()).tabs.length;
    await openRowMenu('Renamed note');
    await chooseRowMenu('Move to Trash…');
    await page.waitForSelector('[data-trash-dialog="true"]');
    await page.locator('[data-trash-confirm="true"]').click();
    await page.waitForFunction(
      (count) => window.__noteforestTest.state().tabs.length === count - 1,
      tabsBefore,
      { timeout: 15000 },
    );
    const afterTrash = await state();
    assert.equal(afterTrash.activeTab, demoPath, 'the next tab is active');
    assert.equal(
      afterTrash.library?.documents.some((document) => document.packagePath === secondPath),
      false,
      'the library row is gone',
    );
    await assert.rejects(stat(secondPath), 'the package left the library');
    assert.equal((await stat(join(env.NOTEFOREST_LIBRARY))).isDirectory(), true);
    assert.equal(
      (await recentsFile(env)).items.some((item) => item.path === secondPath),
      false,
    );
    await h.flushSession();
    assert.equal(
      (await sessionFile(env)).tabs.some((tab) => tab.packagePath === secondPath),
      false,
      'the session no longer names the trashed document',
    );
    await page.screenshot({ path: join(screenshotDir, 'trash-next-tab.png') });
  });

  it('trashing one copy keeps the other copy override and session tab', async () => {
    const env = ui.isolated('duplicate-id');
    const sharedId = 'lifecycle-shared-id';
    const original = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'shared-original',
      pageDocument({
        id: sharedId,
        title: 'Shared original',
        chapterTitle: 'Shared id',
        blocks: [textBlock('shared-original-block', 'Original', 'The original package.')],
      }),
    );
    const copy = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'shared-copy',
      pageDocument({
        id: sharedId,
        title: 'Shared copy',
        chapterTitle: 'Shared id',
        blocks: [textBlock('shared-copy-block', 'Copy', 'The copied package.')],
      }),
    );
    await launch('duplicate-id', env);
    await page.waitForFunction(
      () => window.__noteforestTest.state().library?.documents.length === 2,
      undefined,
      { timeout: 15000 },
    );

    await page.locator('[data-library-document]', { hasText: 'Shared original' }).click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      original,
    );
    await page.locator('[data-library-document]', { hasText: 'Shared copy' }).click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      copy,
    );
    assert.equal((await state()).tabs.length, 2, 'both copies are open');

    // Give the copy its own per-document Page override.
    await page.keyboard.press('Meta+,');
    await page.waitForSelector('[data-settings-dialog="true"]');
    await page.locator('[data-settings-nav="page"]').click();
    await page.locator('[data-page-scope-option="document"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="document"]')
          ?.getAttribute('aria-pressed') === 'true',
    );
    await page.locator('[data-page-chrome-page-number]').click();
    const copyEntry = await waitUntil(async () => {
      try {
        const entry = pageOverrideEntry(await documentSettingsFile(env), copy);
        return entry?.page?.chrome?.pageNumber === false ? entry : false;
      } catch {
        return false;
      }
    }, 'copy page override');
    assert.equal(copyEntry.documentId, sharedId);
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
    await h.flushSession();
    const sessionBefore = await sessionFile(env);
    assert.equal(
      sessionBefore.tabs.some((tab) => tab.packagePath === copy),
      true,
      'the copy has a session tab before the trash',
    );

    // Move the original to the Trash. The copy shares its document id; the
    // cleanup must not remove the copy's override or session tab (F3).
    await openRowMenu('Shared original');
    await chooseRowMenu('Move to Trash…');
    await page.waitForSelector('[data-trash-dialog="true"]');
    await page.locator('[data-trash-confirm="true"]').click();
    await page.waitForFunction(
      (path) =>
        window.__noteforestTest.state().tabs.length === 1 &&
        window.__noteforestTest.state().activeTab === path,
      copy,
      { timeout: 15000 },
    );
    await assert.rejects(stat(original), 'the original package left the library');
    const afterTrash = await state();
    assert.equal(afterTrash.library?.documents.some((doc) => doc.packagePath === copy), true);

    const inMemory = await page.evaluate(() => window.__noteforestTest.settings());
    const survivingEntry = inMemory.documentSettings.find((entry) => entry.packagePath === copy);
    assert.ok(survivingEntry !== undefined, 'the copy override is still in memory');
    assert.equal(survivingEntry.page.chrome.pageNumber, false);
    const stored = await documentSettingsFile(env);
    assert.deepEqual(
      stored.entries.map((entry) => entry.packagePath),
      [copy],
      'only the copy override remains on disk',
    );
    assert.equal(stored.entries[0].documentId, sharedId);
    const sessionAfter = await sessionFile(env);
    assert.deepEqual(
      sessionAfter.tabs.map((tab) => tab.packagePath),
      [copy],
      'the copy session tab survives the trash',
    );
    assert.equal(sessionAfter.activeTab, copy);

    const resolved = await page.evaluate(
      (path) => window.__noteforestTest.resolvedPageSettings(path),
      copy,
    );
    assert.equal(resolved.chrome.pageNumber, false, 'the copy resolves its own override');
    await page.screenshot({
      path: join(artifactsPath('sentinel-fixes'), 'two-copy-trash-survivor.png'),
    });
  });

  it('blocks Move to Trash when the open document cannot be flushed', async () => {
    const env = ui.isolated('trash-flush');
    await launch('trash-flush', env);
    await ui.seedDemo();
    const packagePath = (await state()).tabs[0]?.packagePath ?? '';
    const original = await readFile(join(packagePath, 'document.json'), 'utf8');
    const changed = JSON.parse(original);
    changed.title = 'Changed externally';
    await writeFile(join(packagePath, 'document.json'), `${JSON.stringify(changed, null, 2)}\n`);

    await openRowMenu('Linear algebra');
    await chooseRowMenu('Move to Trash…');
    await page.waitForSelector('[data-trash-dialog="true"]');
    await page.locator('[data-trash-confirm="true"]').click();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-sonner-toast]')].some((element) =>
          element.textContent?.includes('changed on disk'),
        ),
      undefined,
      { timeout: 15000 },
    );
    assert.equal((await state()).tabs.length, 1, 'the tab stays open after the failed flush');
    assert.equal(
      (await stat(packagePath)).isDirectory(),
      true,
      'the refused trash leaves the package untouched',
    );

    // Discard the tab without writing so the quit path is clean.
    await writeFile(join(packagePath, 'document.json'), original);
    await page.evaluate(() =>
      window.__noteforestTest.closePath(window.__noteforestTest.state().activeTab),
    );
  });

  it('cleans a missing package from recents and refuses a live-locked package', async () => {
    const env = ui.isolated('documents-edge');
    await launch('documents-edge', env);
    const missing = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'missing-note',
      pageDocument({
        id: 'lifecycle-missing',
        title: 'Missing note',
        chapterTitle: 'Gone',
        blocks: [textBlock('m1', 'M1', 'Content that will lose its document.json.')],
      }),
    );
    await refreshLibrary();
    await page.locator('[data-library-document]', { hasText: 'Missing note' }).click();
    await page.waitForFunction(() =>
      window.__noteforestTest.state().tabs.some((tab) => tab.title === 'Missing note'),
    );
    await h.flushSession();
    await rm(join(missing, 'document.json'));
    await refreshLibrary();
    await page.waitForSelector('[data-doc-status="missing"]');

    // After document.json is gone the row falls back to the folder name.
    await openRowMenu('missing-note');
    await chooseRowMenu('Remove from recents');
    await page.waitForSelector('[data-trash-dialog="true"]');
    assert.match(await page.getByRole('dialog').innerText(), /no files are deleted/i);
    const tabsBefore = (await state()).tabs.length;
    await page.locator('[data-trash-confirm="true"]').click();
    await page.waitForFunction(
      (count) => window.__noteforestTest.state().tabs.length === count - 1,
      tabsBefore,
      { timeout: 15000 },
    );
    assert.equal((await stat(missing)).isDirectory(), true, 'the folder itself is kept');
    await h.flushSession();
    assert.equal(
      (await sessionFile(env)).tabs.some((tab) => tab.packagePath === missing),
      false,
      'the session tab was removed',
    );

    // A live-locked package is refused before the confirmation dialog.
    const locked = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'locked-note',
      pageDocument({
        id: 'lifecycle-locked',
        title: 'Locked note',
        chapterTitle: 'Busy',
        blocks: [textBlock('l1', 'L1', 'Someone else is writing this note.')],
      }),
    );
    await writeLock(env, locked, {
      pid: process.pid,
      host: 'lifecycle-live-lock',
      heartbeatAt: new Date().toISOString(),
    });
    await refreshLibrary();
    await page.waitForFunction(() =>
      window.__noteforestTest.state().library?.documents.some(
        (document) => document.title === 'Locked note',
      ),
    );
    await openRowMenu('Locked note');
    await chooseRowMenu('Move to Trash…');
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-sonner-toast]')].some((element) =>
          element.textContent?.includes('Another window is writing this note.'),
        ),
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await page.locator('[data-trash-dialog="true"]').count(), 0);
    assert.equal((await stat(locked)).isDirectory(), true, 'a live lock keeps the package');

    // Opening the live-locked note is read-only; the row menu refuses rename.
    await page.locator('[data-library-document]', { hasText: 'Locked note' }).click();
    await page.waitForFunction(() => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      return runtime?.status === 'read-only';
    });
    await openRowMenu('Locked note');
    assert.equal(
      await page.getByRole('menuitem', { name: /Rename document/ }).isDisabled(),
      true,
      'a read-only document cannot be renamed from the row menu',
    );
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // A newer-schema package warns more strongly before the trash.
    const future = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'future-note',
      pageDocument({
        id: 'lifecycle-future',
        title: 'Future note',
        chapterTitle: 'Future',
        blocks: [textBlock('f1', 'F1', 'Written by a newer NoteForest.')],
      }),
    );
    const futureJson = JSON.parse(await readFile(join(future, 'document.json'), 'utf8'));
    futureJson.schemaVersion = 999;
    await writeFile(join(future, 'document.json'), `${JSON.stringify(futureJson, null, 2)}\n`);
    await refreshLibrary();
    await page.waitForFunction(() =>
      window.__noteforestTest.state().library?.documents.some(
        (document) => document.title === 'Future note',
      ),
    );
    await openRowMenu('Future note');
    await chooseRowMenu('Move to Trash…');
    await page.waitForSelector('[data-trash-newer-schema="true"]');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForSelector('[data-trash-dialog="true"]', { state: 'detached' });
    assert.equal((await stat(future)).isDirectory(), true);
  });
});
