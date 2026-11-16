import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * R3 document status panel.
 *
 * One shell component for stale lock and generic read-only, between the Toolbar
 * and the canvas panel (not inside the canvas). Stale lock starts as a neutral
 * full panel with lock metadata and Take over/Cancel; Cancel (or Esc) collapses
 * it to a 34 px slim bar with Review, per document for the session. Generic
 * read-only has no takeover. Corrupt/missing documents keep the RecoverySurface.
 */

const tempRoot = artifactsPath('ui-document-status-temp');
const screenshotDir = artifactsPath('ui-document-status');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

function note(id, title) {
  return pageDocument({
    id,
    title,
    chapterTitle: 'Status',
    blocks: [
      {
        id: `${id}-intro`,
        label: 'Intro',
        content: {
          type: 'doc',
          children: [
            { type: 'paragraph', children: [{ type: 'text', text: 'Status panel fixture.' }] },
          ],
        },
      },
    ],
  });
}

function lockPathFor(env, packagePath) {
  const digest = createHash('sha256').update(resolve(packagePath)).digest('hex');
  return resolve(env.NOTEFOREST_APP_SUPPORT, 'locks', `${digest}.lock`);
}

async function writeLock(env, packagePath, record) {
  const path = lockPathFor(env, packagePath);
  await mkdir(resolve(env.NOTEFOREST_APP_SUPPORT, 'locks'), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify(
      {
        version: 1,
        documentPath: resolve(packagePath),
        sessionId: 'status-session',
        token: record.token ?? 'status-token',
        acquiredAt: '2020-01-01T00:00:00.000Z',
        ...record,
      },
      null,
      2,
    )}\n`,
  );
  return path;
}

async function readLock(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** A lock from another host with a fresh heartbeat is live, not stale. */
async function writeLiveLock(env, packagePath) {
  return writeLock(env, packagePath, {
    pid: 2_147_483_647,
    host: 'another-mac',
    heartbeatAt: new Date().toISOString(),
    token: 'live-token',
  });
}

/** A dead process on this host is a stale lock (recovery requires consent). */
async function writeStaleLock(env, packagePath) {
  return writeLock(env, packagePath, {
    pid: 2_147_483_647,
    host: 'stale-lock-ui',
    heartbeatAt: '2020-01-01T00:00:00.000Z',
    token: 'stale-token',
  });
}

async function launch(name, overrides = {}) {
  page = await ui.launch({ ...ui.isolated(name), NOTEFOREST_E2E_HIDDEN: '1', ...overrides });
  await h.setWindowSize(1440, 900);
}

async function openPath(path) {
  const opened = await page.evaluate((target) => window.__noteforestTest.openPath(target), path);
  assert.equal(opened, true, 'the package opens');
  await page.waitForFunction(
    (target) => window.__noteforestTest.state().activeTab === target,
    path,
    { timeout: 20000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
}

async function activate(path) {
  await page.evaluate((target) => window.__noteforestTest.activateTab(target), path);
  await page.waitForFunction(
    (target) => window.__noteforestTest.state().activeTab === target,
    path,
    { timeout: 10000 },
  );
}

async function runtimeState(packagePath) {
  const state = await h.state();
  return state.runtimes.find((item) => item.packagePath === packagePath);
}

async function waitToast(text) {
  await page.waitForFunction(
    (expected) =>
      [...document.querySelectorAll('[data-sonner-toast]')].some((element) =>
        element.textContent?.includes(expected),
      ),
    text,
    { timeout: 10000 },
  );
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

/**
 * Click the sidebar `+` until the expected tab appears. Condition-based (no
 * sleep): a click that lands before the shell's first renderer tick can be
 * dropped, and a draft tab appears asynchronously.
 */
async function clickNewNoteOnce(expectedTabs) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = (await h.state()).tabs.length;
    if (current >= expectedTabs) return;
    await page.locator('[data-library-new="true"]').click();
    try {
      await page.waitForFunction(
        (count) => window.__noteforestTest.state().tabs.length === count,
        expectedTabs,
        { timeout: 3000 },
      );
      return;
    } catch {
      // The click did not reach the handler yet; retry only while no tab opened.
    }
  }
  await page.waitForFunction(
    (count) => window.__noteforestTest.state().tabs.length === count,
    expectedTabs,
    { timeout: 10000 },
  );
}

async function canvasPanel() {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-canvas-panel="true"]');
    const toolbar = document.querySelector('[data-toolbar="true"]');
    const panel =
      document.querySelector('[data-stale-lock-banner="true"]') ??
      document.querySelector('[data-status-slim="true"]');
    if (canvas === null || toolbar === null) return null;
    return {
      canvasHeight: canvas.getBoundingClientRect().height,
      canvasTop: canvas.getBoundingClientRect().top,
      toolbarBottom: toolbar.getBoundingClientRect().bottom,
      panelHeight: panel?.getBoundingClientRect().height ?? 0,
      panelBottom: panel?.getBoundingClientRect().bottom ?? toolbar.getBoundingClientRect().bottom,
      panelInsideCanvas: panel?.closest('.nf-canvas-panel') !== null,
      panelParent: panel?.parentElement?.className ?? '',
    };
  });
}

describe('R3 document status panel', () => {
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

  it('shows a slim read-only bar for a live lock and reflows the canvas', async () => {
    const env = ui.isolated('status-readonly');
    await mkdir(env.NOTEFOREST_LIBRARY, { recursive: true });
    const lockedPath = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'locked-note',
      note('status-readonly', 'Locked note'),
    );
    const editablePath = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'editable-note',
      note('status-editable', 'Editable note'),
    );
    await writeLiveLock(env, lockedPath);
    await launch('status-readonly');

    await openPath(lockedPath);
    const runtime = await runtimeState(lockedPath);
    assert.equal(runtime?.status, 'read-only');
    assert.equal(runtime?.readOnlyReason, 'locked');
    assert.equal(runtime?.lock?.host, 'another-mac');

    const slim = () => page.locator('[data-status-slim="true"][data-status-kind="read-only"]');
    await slim().waitFor({ timeout: 10000 });
    assert.match(await slim().innerText(), /Read-only/);
    assert.match(await slim().innerText(), /open in another window/);
    assert.equal(
      await page.locator('[data-stale-lock-action="take-over"]').count(),
      0,
      'generic read-only has no takeover',
    );
    assert.equal(
      await page.locator('[data-stale-lock-banner="true"]').count(),
      0,
      'generic read-only is the slim bar, not the stale-lock panel',
    );
    assert.equal(
      await page.locator('.nf-tab[data-active="true"] .nf-tab-lock').count(),
      1,
      'the tab lock icon stays',
    );

    // The slim bar is outside the canvas surface, right under the Toolbar.
    const placement = await canvasPanel();
    assert.ok(placement !== null);
    assert.match(placement.panelParent, /nf-main-column/);
    assert.equal(placement.panelInsideCanvas, false);
    assert.ok(placement.canvasTop >= placement.panelBottom - 0.5);
    assert.ok(Math.abs(placement.panelHeight - 34) <= 1.5, `slim bar is 34 px (${placement.panelHeight})`);

    // Details is a real disclosure, not a second card. A live lock exposes the
    // lock metadata and the quit/reopen guidance, but never a takeover.
    const recheck = slim().locator('[data-status-action="recheck"]');
    assert.equal(await recheck.count(), 1, 'a locked document offers Recheck');
    await slim().locator('[data-status-details] summary').click();
    const details = slim().locator('[data-status-details]');
    assert.match(await details.innerText(), /opened read-only/);
    assert.match(await details.innerText(), /quit and reopen NoteForest/);
    assert.equal(await details.locator('[data-lock-pid="true"]').innerText(), '2147483647');
    assert.equal(await details.locator('[data-lock-host="true"]').innerText(), 'another-mac');
    assert.equal(await details.locator('[data-lock-session="true"]').innerText(), 'status-session');
    assert.doesNotMatch(
      await details.locator('[data-lock-heartbeat="true"]').innerText(),
      /unknown/,
    );
    await page.screenshot({ path: join(screenshotDir, 'read-only-slim.png') });

    // Recheck reopens the package but a live lock still keeps it read-only.
    await recheck.click();
    await waitToast('Still read-only');
    assert.equal((await runtimeState(lockedPath))?.readOnlyReason, 'locked');
    assert.match(await slim().innerText(), /Read-only/);

    // Switching to an editable document removes the panel and the canvas grows.
    await openPath(editablePath);
    await page.waitForFunction(() => document.querySelector('[data-document-status]') === null, undefined, {
      timeout: 10000,
    });
    const withoutPanel = await canvasPanel();
    assert.ok(withoutPanel !== null);
    assert.ok(
      withoutPanel.canvasHeight > placement.canvasHeight,
      `the canvas reflows when the panel disappears (${withoutPanel.canvasHeight} > ${placement.canvasHeight})`,
    );

    // Back to the locked document: the slim bar is still there.
    await activate(lockedPath);
    await slim().waitFor({ timeout: 10000 });
    assert.match(await slim().innerText(), /Read-only/);
    assert.equal(await page.locator('.nf-status-slim-icon').count(), 1);

    // Once the live lock disappears, Recheck reopens the package as editable
    // and removes both the panel and the tab lock icon. No force-break path.
    await rm(lockPathFor(env, lockedPath));
    await slim().locator('[data-status-action="recheck"]').click();
    await page.waitForFunction(
      (path) => {
        const current = window.__noteforestTest.state();
        return current.runtimes.find((item) => item.packagePath === path)?.status === 'editable';
      },
      lockedPath,
      { timeout: 10000 },
    );
    await page.waitForFunction(() => document.querySelector('[data-document-status]') === null, undefined, {
      timeout: 10000,
    });
    assert.equal(
      await page.locator('.nf-tab[data-active="true"] .nf-tab-lock').count(),
      0,
      'the recovered tab no longer shows the lock icon',
    );

    // The mounted editor gained editability with the runtime, not only the
    // status: typing and saving work without a reopen.
    await page
      .locator('.nf-editor[data-active="true"] [data-block-card] .nf-block-prose')
      .first()
      .click();
    await page.keyboard.press('End');
    await page.keyboard.type(' unlocked');
    await h.waitEditorText('unlocked');
    await h.waitSaved();
    const saved = JSON.parse(await readFile(resolve(lockedPath, 'document.json'), 'utf8'));
    assert.match(JSON.stringify(saved), /unlocked/);
  });

  it('collapses a stale lock per document, reviews, and takes over', async () => {
    const env = ui.isolated('status-stale');
    await mkdir(env.NOTEFOREST_LIBRARY, { recursive: true });
    const stalePath = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'stale-note',
      note('status-stale', 'Stale note'),
    );
    const editablePath = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'other-note',
      note('status-other', 'Other note'),
    );
    const lockPath = await writeStaleLock(env, stalePath);
    const lockBefore = await readLock(lockPath);
    await launch('status-stale');
    // Reduced motion: the panel has no height/opacity animation.
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await openPath(stalePath);
    const full = () => page.locator('[data-stale-lock-banner="true"]');
    const slim = () => page.locator('[data-status-slim="true"][data-status-kind="stale-lock"]');
    await full().waitFor({ timeout: 10000 });
    assert.equal(await full().getAttribute('role'), 'alert', 'the appearance is announced');
    const animation = await full().evaluate(
      (element) => getComputedStyle(element).animationDuration,
    );
    assert.ok(
      ['0s', '0.01ms', '0.001s'].includes(animation) || Number.parseFloat(animation) <= 0.001,
      `reduced motion removes the panel animation (${animation})`,
    );
    await page.emulateMedia({ reducedMotion: null });

    // The state blocks an edit, so the primary action owns focus; it is not a
    // modal and does not trap focus.
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('data-stale-lock-action') === 'take-over',
      undefined,
      { timeout: 5000 },
    );
    for (let index = 0; index < 5; index += 1) await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.closest('[data-document-status]') === null),
      true,
      'Tab leaves the panel: no focus trap',
    );
    await page.screenshot({ path: join(screenshotDir, 'stale-lock-full.png') });

    // Esc = Cancel collapses to the 34 px slim bar.
    await page.locator('[data-stale-lock-action="take-over"]').focus();
    await page.keyboard.press('Escape');
    await slim().waitFor({ timeout: 5000 });
    assert.match(await slim().innerText(), /Read-only · stale lock/);
    assert.equal(await page.locator('[data-stale-lock-banner="true"]').count(), 0);
    assert.equal((await readLock(lockPath)).token, lockBefore.token, 'Cancel keeps the lock');

    // The compressed bar keeps both the one-click takeover and the explanation.
    assert.equal(
      await slim().locator('[data-stale-lock-action="take-over"]').count(),
      1,
      'the slim stale bar offers Take over lock',
    );
    assert.equal(await slim().locator('[data-stale-lock-action="review"]').count(), 1);
    await page.screenshot({ path: join(screenshotDir, 'stale-lock-slim.png') });

    // Cancel is per document for the session: leaving and returning keeps slim.
    await openPath(editablePath);
    assert.equal(await page.locator('[data-document-status]').count(), 0);
    await activate(stalePath);
    await slim().waitFor({ timeout: 10000 });
    assert.equal(await page.locator('[data-stale-lock-banner="true"]').count(), 0);

    // A restart shows the full panel again (the state is not persisted).
    await h.quit();
    await launch('status-stale', env);
    await openPath(stalePath);
    await full().waitFor({ timeout: 10000 });
    assert.equal(
      await page.locator('[data-status-slim="true"]').count(),
      0,
      'the restart shows the full panel, not the session slim bar',
    );

    // Review reopens the panel from the slim bar after one Cancel.
    await page.locator('[data-stale-lock-action="cancel"]').click();
    await slim().waitFor({ timeout: 5000 });
    await page.locator('[data-stale-lock-action="review"]').click();
    await full().waitFor({ timeout: 5000 });

    // Take over from the compressed bar is one click.
    await page.locator('[data-stale-lock-action="cancel"]').click();
    await slim().waitFor({ timeout: 5000 });
    await slim().locator('[data-stale-lock-action="take-over"]').click();
    await page.waitForFunction(
      (path) => {
        const current = window.__noteforestTest.state();
        return current.runtimes.find((item) => item.packagePath === path)?.status === 'editable';
      },
      stalePath,
      { timeout: 10000 },
    );
    await page.waitForFunction(() => document.querySelector('[data-document-status]') === null, undefined, {
      timeout: 10000,
    });
    assert.notEqual((await readLock(lockPath)).token, lockBefore.token, 'the stale lock is replaced');
    await page.screenshot({ path: join(screenshotDir, 'stale-lock-taken-over.png') });

    // The taken-over document edits and saves normally.
    await page
      .locator('.nf-editor[data-active="true"] [data-block-card] .nf-block-prose')
      .first()
      .click();
    await page.keyboard.press('End');
    await page.keyboard.type(' editable');
    await h.waitEditorText('editable');
    await h.waitSaved();
    const saved = JSON.parse(await readFile(resolve(stalePath, 'document.json'), 'utf8'));
    assert.match(JSON.stringify(saved), /editable/);
  });

  it('creates a draft over a stale lock and reports a live lock without internals', async () => {
    const env = ui.isolated('status-create');
    await mkdir(env.NOTEFOREST_LIBRARY, { recursive: true });
    const stalePath = join(env.NOTEFOREST_LIBRARY, 'untitled');
    const staleLock = await writeLock(env, stalePath, {
      pid: 2_147_483_647,
      host: 'stale-create-lock',
      heartbeatAt: '2020-01-01T00:00:00.000Z',
      token: 'create-stale-token',
    });
    await launch('status-create');
    await page.waitForSelector(
      '[data-sidebar-panel="library"] [data-library-new="true"]:not([disabled])',
    );

    // `+` opens an in-memory draft: no folder, lock, or recent entry yet.
    await clickNewNoteOnce(1);
    const draft = await page.evaluate(() => {
      const current = window.__noteforestTest.state();
      return current.runtimes.find((item) => item.packagePath === current.activeTab) ?? null;
    });
    assert.equal(draft?.status, 'editable', 'the draft is editable');
    assert.equal(draft?.title, 'Untitled');
    assert.match(draft?.packagePath ?? '', /^draft:/, 'the tab key is a draft key');
    await assert.rejects(stat(stalePath), 'the untouched draft creates no folder');
    assert.equal((await readLock(staleLock)).token, 'create-stale-token');

    // The first keystroke materializes; the stale lock from the deleted package
    // must not block creation.
    await page
      .locator('.nf-editor[data-active="true"] .nf-block-prose')
      .first()
      .click();
    await page.keyboard.type('D');
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return runtime !== null && runtime !== undefined && !runtime.draftId;
      },
      undefined,
      { timeout: 15000 },
    );
    const materialized = await page.evaluate(() => {
      const current = window.__noteforestTest.state();
      return current.runtimes.find((item) => item.packagePath === current.activeTab) ?? null;
    });
    assert.ok(
      (materialized?.packagePath ?? '').startsWith(env.NOTEFOREST_LIBRARY),
      'the draft materializes inside the active library',
    );
    assert.equal((await stat(materialized?.packagePath ?? '')).isDirectory(), true);
    assert.notEqual((await readLock(staleLock)).token, 'create-stale-token');

    // A live lock on the next free folder name still fails, with a user-facing
    // message that never exposes the lock path, and the draft stays in memory.
    const livePath = join(env.NOTEFOREST_LIBRARY, 'untitled-2');
    const liveLock = await writeLock(env, livePath, {
      pid: process.pid,
      host: 'live-create-host',
      heartbeatAt: new Date().toISOString(),
      token: 'create-live-token',
    });
    const tabsBefore = (await h.state()).tabs.length;
    await clickNewNoteOnce(tabsBefore + 1);
    await page
      .locator('.nf-editor[data-active="true"] .nf-block-prose')
      .first()
      .click();
    await page.keyboard.type('L');
    await page.waitForSelector('[data-draft-materialize-error]');
    assert.equal(
      await page.locator('[data-save-failure="true"]').count(),
      0,
      'a draft failure never renders the save-failure surface as well',
    );
    assert.doesNotMatch(
      await page.locator('.nf-main-column').innerText(),
      /draft:/,
      'the raw draft key is never visible',
    );
    const bannerText = await page.evaluate(() =>
      [...document.querySelectorAll('[data-draft-materialize-error]')]
        .map((element) => element.textContent ?? '')
        .join(' '),
    );
    assert.match(bannerText, /Another window has this note open\. Close it there and try again\./);
    assert.doesNotMatch(bannerText, /\.lock/);
    assert.ok(
      !bannerText.includes(env.NOTEFOREST_APP_SUPPORT),
      'the banner never exposes the app-support lock path',
    );
    await page.screenshot({ path: join(screenshotDir, 'draft-live-lock.png') });
    const keptDraft = await page.evaluate(() => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      return runtime === null || runtime === undefined
        ? null
        : { draftId: runtime.draftId, error: runtime.draftError };
    });
    assert.ok(keptDraft !== null && keptDraft.draftId !== null, 'the draft stays in memory');
    assert.equal(keptDraft.error?.message, 'Another window has this note open. Close it there and try again.');
    assert.equal((await h.state()).tabs.length, tabsBefore + 1, 'the draft tab stays open');
    assert.equal((await readLock(liveLock)).token, 'create-live-token', 'the live lock is untouched');
    await assert.rejects(stat(livePath), 'a failed materialization leaves no folder');

    // Discard the blocked draft so the close/quit path has no unsaved draft to
    // materialize (the live lock still blocks it).
    await page.evaluate(() =>
      window.__noteforestTest.closePath(window.__noteforestTest.state().activeTab),
    );
    await page.waitForFunction(
      (count) => window.__noteforestTest.state().tabs.length === count,
      tabsBefore,
      { timeout: 10000 },
    );
    await h.waitSaved();
  });

  it('shows a real save failure as a neutral shell panel outside the canvas (R4)', async () => {
    await launch('status-save-failure');
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    await chmod(packagePath, 0o555);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Surface permission failure');
      await page.waitForFunction(
        () => {
          const current = window.__noteforestTest.state();
          const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
          return runtime?.saveFailure?.code === 'permission';
        },
        undefined,
        { timeout: 10000 },
      );

      const banner = page.locator('[data-save-failure="true"]');
      await banner.waitFor();
      const geometry = await banner.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          parent: element.parentElement?.className ?? '',
          insideCanvas: element.closest('.nf-canvas-panel') !== null,
          borderLeftWidth: style.borderLeftWidth,
          borderRightWidth: style.borderRightWidth,
          borderLeftColor: style.borderLeftColor,
          borderTopColor: style.borderTopColor,
          borderRadius: style.borderRadius,
        };
      });
      assert.match(geometry.parent, /nf-main-column/);
      assert.equal(geometry.insideCanvas, false, 'the save failure is shell chrome');
      assert.equal(geometry.borderLeftWidth, '1px');
      assert.equal(geometry.borderRightWidth, '1px');
      assert.equal(
        geometry.borderLeftColor,
        geometry.borderTopColor,
        'no colored left stripe: every border edge uses the neutral border token',
      );
      assert.notEqual(geometry.borderRadius, '0px');

      const title = banner.locator('.nf-save-failure-title');
      assert.equal(await title.innerText(), 'NoteForest can’t write to this folder.');
      // C-03.1: the hint is one line and `Autosave is paused.` is its own line.
      assert.equal(
        (await banner.locator('.nf-save-failure-hint').innerText()).trim(),
        'Check the folder permissions and Retry, or save a copy elsewhere.',
      );
      assert.equal(
        (await banner.locator('.nf-save-failure-paused').innerText()).trim(),
        'Autosave is paused.',
      );
      for (const action of ['retry', 'restore-backup', 'save-copy', 'reload', 'reveal']) {
        assert.equal(
          await banner.locator(`[data-save-action="${action}"]`).count(),
          1,
          `${action} action is preserved`,
        );
      }
      assert.equal(
        await banner.locator('[data-save-action="overwrite"]').count(),
        0,
        'permission failures never offer overwrite',
      );
      // The raw failure and the package path live in the shared, closed
      // Details disclosure (one value, joined with ` · `), never as a visible
      // technical paragraph.
      const details = banner.locator('[data-details="true"]');
      assert.equal(await details.count(), 1, 'exactly one Details per surface');
      assert.equal(await details.locator('summary').innerText(), 'Details');
      assert.equal(await details.getAttribute('open'), null);
      const detailsValue = await details.locator('[data-details-value]').textContent();
      assert.ok(detailsValue.includes(packagePath), 'the path is in Details');
      assert.match(detailsValue, /permission|EACCES/i);
      assert.equal(await banner.locator('.nf-save-failure-message').count(), 0);
      await details.locator('summary').click();
      await page.screenshot({
        path: join(screenshotDir, 'save-failure-details.png'),
        scale: 'css',
      });
      await details.locator('summary').click();

      await page.screenshot({ path: join(screenshotDir, 'save-failure-dark.png') });
      await setTheme('light');
      await page.screenshot({ path: join(screenshotDir, 'save-failure-light.png') });
      await setTheme('dark');
    } finally {
      await chmod(packagePath, 0o755);
    }

    const banner = page.locator('[data-save-failure="true"]');
    await banner.locator('[data-save-action="retry"]').click();
    await h.waitSaved();
    await page.waitForSelector('[data-save-failure="true"]', { state: 'detached' });
  });
});
