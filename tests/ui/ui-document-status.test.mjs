import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
    assert.match(await slim().innerText(), /another session holds the lock/);
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

    // Details is a real disclosure, not a second card.
    await slim().locator('[data-status-details] summary').click();
    assert.match(
      await slim().locator('[data-status-details] p').innerText(),
      /opened read-only/,
    );
    await page.screenshot({ path: join(screenshotDir, 'read-only-slim.png') });

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

    // Take over makes the document editable and removes the panel.
    await page.locator('[data-stale-lock-action="take-over"]').click();
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
});
