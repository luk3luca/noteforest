import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import {
  artifactsPath,
  createHarness,
  waitUntil,
} from '../support/harness.mjs';

const tempRoot = artifactsPath('m2f-recovery-tmp');
const h = createHarness({ tempRoot });
let page;
let sourcePackage = '';
let validBytes = Buffer.alloc(0);

function isolated(name) {
  return {
    NOTEFOREST_LIBRARY: resolve(tempRoot, `${name}-library`),
    NOTEFOREST_APP_SUPPORT: resolve(tempRoot, `${name}-support`),
  };
}

async function launchEnv(env) {
  await h.launch(env);
  page = h.page;
  return env;
}

async function installValidPackage(env, folder) {
  const target = resolve(env.NOTEFOREST_LIBRARY, folder);
  await mkdir(env.NOTEFOREST_LIBRARY, { recursive: true });
  await cp(sourcePackage, target, { recursive: true });
  return target;
}

/** Write a session that reopens one tab on next launch. */
async function writeSession(env, packagePath) {
  await mkdir(env.NOTEFOREST_APP_SUPPORT, { recursive: true });
  await writeFile(
    resolve(env.NOTEFOREST_APP_SUPPORT, 'shell-session.json'),
    JSON.stringify(
      {
        tabs: [{ packagePath, scrollTop: 0, selectedBlockId: null, collapsed: [] }],
        activeTab: packagePath,
        sidebarCollapsed: false,
        sidebarWidth: 264,
        collapsedTopics: {},
      },
      null,
      2,
    ),
  );
}

function backupsDirFor(packagePath, supportDir) {
  const digest = createHash('sha256').update(resolve(packagePath)).digest('hex').slice(0, 32);
  return resolve(supportDir, 'backups', digest);
}

async function writeStaleLock(env, packagePath, token = 'dead-token') {
  const digest = createHash('sha256').update(resolve(packagePath)).digest('hex');
  const lockPath = resolve(env.NOTEFOREST_APP_SUPPORT, 'locks', `${digest}.lock`);
  await mkdir(resolve(env.NOTEFOREST_APP_SUPPORT, 'locks'), { recursive: true });
  await writeFile(
    lockPath,
    `${JSON.stringify(
      {
        version: 1,
        documentPath: resolve(packagePath),
        pid: 2_147_483_647,
        host: 'stale-lock-test',
        sessionId: 'dead-session',
        token,
        acquiredAt: '2020-01-01T00:00:00.000Z',
        heartbeatAt: '2020-01-01T00:00:00.000Z',
      },
      null,
      2,
    )}\n`,
  );
  return lockPath;
}

function readLock(lockPath) {
  return readFile(lockPath, 'utf8').then((text) => JSON.parse(text));
}

async function writeBackup(env, packagePath, bytes, options = {}) {
  const kind = options.kind ?? 'autosave';
  const revision = options.revision ?? 1;
  const date = options.date ?? new Date();
  const iso = date.toISOString();
  const stamp = `${iso.slice(0, 19).replace(/[-:]/g, '')}${iso.slice(20, 23)}Z`;
  const dir = backupsDirFor(packagePath, env.NOTEFOREST_APP_SUPPORT);
  await mkdir(dir, { recursive: true });
  const file = resolve(
    dir,
    `${kind}-${stamp}-r${String(revision).padStart(10, '0')}.json`,
  );
  await writeFile(file, bytes);
  return file;
}

async function waitLibraryStatus(status, count = 1) {
  await page.waitForFunction(
    ({ expected, expectedCount }) =>
      document.querySelectorAll(`[data-library-document][data-doc-status="${expected}"]`)
        .length === expectedCount,
    { expected: status, expectedCount: count },
    { timeout: 10000 },
  );
}

async function openLibraryDocument(status) {
  await page.locator(`[data-library-document][data-doc-status="${status}"]`).first().click();
  await page.locator('[data-recovery-surface="true"]').waitFor({ timeout: 10000 });
}

async function waitTabCount(count) {
  await page.waitForFunction(
    (expected) => window.__noteforestTest.state().tabs.length === expected,
    count,
    { timeout: 10000 },
  );
}

async function noDialogs() {
  const calls = await h.app.evaluate(() => globalThis.__nfDialogCalls ?? []);
  assert.deepEqual(calls, [], 'recovery must never open a native OS dialog');
}

function tabFor(state, packagePath) {
  return state.tabs.find((tab) => tab.packagePath === packagePath);
}

describe('M2f phase 4a corrupt package recovery', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await h.launch({
      NOTEFOREST_LIBRARY: resolve(tempRoot, 'source-library'),
      NOTEFOREST_APP_SUPPORT: resolve(tempRoot, 'source-support'),
    });
    page = h.page;
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    sourcePackage = (await h.state()).activeTab;
    assert.ok(sourcePackage.length > 0, 'seed document path');
    validBytes = await readFile(resolve(sourcePackage, 'document.json'));
    await h.quit();
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('lists a truncated document with a reason and opens a read-only recovery surface', async () => {
    const env = isolated('truncated');
    const packagePath = await installValidPackage(env, 'truncated-note');
    const documentPath = resolve(packagePath, 'document.json');
    const brokenBytes = validBytes.subarray(0, Math.floor(validBytes.byteLength / 2));
    await writeFile(documentPath, brokenBytes);
    await launchEnv(env);

    await waitLibraryStatus('unreadable');
    const row = page.locator('[data-library-document][data-doc-status="unreadable"]');
    const rowText = await row.innerText();
    assert.match(rowText, /truncated-note/, 'folder-name title fallback is visible');
    assert.match(rowText, /unreadable/i);
    assert.match(rowText, /not valid JSON/);

    await openLibraryDocument('unreadable');
    const surface = page.locator('[data-recovery-surface="true"]');
    assert.equal(await surface.getAttribute('data-recovery-status'), 'unreadable');
    assert.equal(await surface.locator('[data-recovery-path="true"]').innerText(), packagePath);
    assert.match(
      await surface.locator('[data-recovery-reason="true"]').innerText(),
      /not valid JSON/,
    );
    assert.match(
      await surface.locator('[data-recovery-readonly="true"]').innerText(),
      /Read-only/,
    );
    assert.match(await surface.innerText(), /This note couldn’t be read\./);
    await surface.locator('[data-recovery-empty="true"]').waitFor({ timeout: 10000 });
    await page.screenshot({ path: artifactsPath('copy-cd/recovery.png') });

    const state = await h.state();
    assert.equal(tabFor(state, packagePath)?.recovery, 'unreadable');
    assert.equal(
      state.runtimes.some((runtime) => runtime.packagePath === packagePath),
      false,
      'a damaged package never becomes an editable runtime',
    );
    assert.equal((await readFile(documentPath)).equals(brokenBytes), true);

    await noDialogs();
    await surface.locator('[data-recovery-action="close"]').click();
    await waitTabCount(0);
    assert.equal(await page.locator('[data-recovery-surface="true"]').count(), 0);
    await noDialogs();
  });

  it('opens a newer-schema document read-only with no downgrade or overwrite controls', async () => {
    const env = isolated('newer');
    const packagePath = await installValidPackage(env, 'future-note');
    const documentPath = resolve(packagePath, 'document.json');
    const newer = JSON.parse(validBytes.toString('utf8'));
    newer.schemaVersion = 3;
    newer.title = 'From the future';
    const newerBytes = Buffer.from(JSON.stringify(newer, null, 2), 'utf8');
    await writeFile(documentPath, newerBytes);
    await launchEnv(env);

    await waitLibraryStatus('newer-schema');
    const row = page.locator('[data-library-document][data-doc-status="newer-schema"]');
    const rowText = await row.innerText();
    assert.match(rowText, /From the future/);
    assert.match(rowText, /newer version/i);
    assert.match(rowText, /newer than this app supports/);

    await openLibraryDocument('newer-schema');
    const surface = page.locator('[data-recovery-surface="true"]');
    assert.equal(await surface.getAttribute('data-recovery-status'), 'newer-schema');
    assert.match(
      await surface.locator('[data-recovery-reason="true"]').innerText(),
      /newer than this app supports/,
    );
    assert.match(
      await surface.innerText(),
      /Open it in the newer NoteForest\. This version leaves the file unchanged\./,
    );
    assert.equal(await surface.locator('[data-recovery-action="restore-newest"]').count(), 1);
    assert.equal(await surface.locator('[data-save-failure="true"]').count(), 0);
    await surface.locator('[data-recovery-empty="true"]').waitFor({ timeout: 10000 });

    const state = await h.state();
    assert.equal(tabFor(state, packagePath)?.recovery, 'newer-schema');
    assert.equal(
      state.runtimes.some((runtime) => runtime.packagePath === packagePath),
      false,
    );
    assert.equal((await readFile(documentPath)).equals(newerBytes), true);
    await noDialogs();
  });

  it('shows Remove tab and Retry for a missing session package', async () => {
    const env = isolated('missing');
    const packagePath = resolve(env.NOTEFOREST_LIBRARY, 'gone-note');
    await writeSession(env, packagePath);
    await launchEnv(env);

    await page.locator('[data-recovery-surface="true"]').waitFor({ timeout: 10000 });
    const surface = page.locator('[data-recovery-surface="true"]');
    assert.equal(await surface.getAttribute('data-recovery-status'), 'missing');
    assert.equal(await surface.locator('[data-recovery-path="true"]').innerText(), packagePath);
    assert.match(await surface.innerText(), /missing/i);

    const state = await h.state();
    assert.equal(state.tabs.length, 1, 'the missing session tab is restored');
    assert.equal(tabFor(state, packagePath)?.recovery, 'missing');
    assert.equal(tabFor(state, packagePath)?.missing, false);

    await surface.locator('[data-recovery-action="retry"]').click();
    await surface.locator('[data-recovery-error="true"]').waitFor({ timeout: 10000 });
    assert.match(
      await surface.locator('[data-recovery-error="true"]').innerText(),
      /Still unavailable/,
    );
    await noDialogs();

    await surface.locator('[data-recovery-action="remove"]').click();
    await waitTabCount(0);
    assert.equal(await page.locator('[data-recovery-surface="true"]').count(), 0);
    await noDialogs();
  });

  it('restores the newest valid backup as a new copy and leaves the original damaged file untouched', async () => {
    const env = isolated('restore');
    const packagePath = await installValidPackage(env, 'recover-me');
    const documentPath = resolve(packagePath, 'document.json');
    const brokenBytes = Buffer.from('{ "schemaVersion": 1,');
    await writeFile(documentPath, brokenBytes);

    await writeBackup(env, packagePath, validBytes, {
      revision: 3,
      date: new Date('2026-11-04T10:00:00.000Z'),
    });
    const invalidBackup = Buffer.from('{ "schemaVersion": 1,');
    await writeBackup(env, packagePath, invalidBackup, {
      revision: 9,
      date: new Date('2026-11-04T11:00:00.000Z'),
    });
    await launchEnv(env);

    await waitLibraryStatus('unreadable');
    await openLibraryDocument('unreadable');
    const surface = page.locator('[data-recovery-surface="true"]');
    await surface.locator('[data-recovery-backup="true"]').first().waitFor({ timeout: 10000 });
    const rows = await surface.locator('[data-recovery-backup="true"]').evaluateAll((nodes) =>
      nodes.map((node) => ({ ...node.dataset })),
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.backupValid, 'false', 'the newer invalid backup is shown disabled');
    assert.match(await surface.locator('[data-backup-valid="false"]').innerText(), /Unusable/);
    assert.equal(await surface.locator('[data-recovery-empty="true"]').count(), 0);
    const restoreButton = surface.locator('[data-recovery-action="restore-newest"]');
    assert.equal(await restoreButton.isDisabled(), false);

    await restoreButton.click();
    await page.waitForFunction(
      (original) => {
        const state = window.__noteforestTest.state();
        return state.tabs.length === 2 && state.activeTab !== original;
      },
      packagePath,
      { timeout: 15000 },
    );

    const state = await h.state();
    const restoredPath = state.activeTab;
    assert.ok(restoredPath.startsWith(`${env.NOTEFOREST_LIBRARY}/`));
    assert.match(basename(restoredPath), /^recover-me restored \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}/);
    assert.equal(
      state.runtimes.some((runtime) => runtime.packagePath === restoredPath),
      true,
      'the restored copy is editable and open',
    );
    assert.equal(tabFor(state, packagePath)?.recovery, 'unreadable');
    assert.equal((await readFile(documentPath)).equals(brokenBytes), true);
    assert.equal(
      (await readFile(resolve(restoredPath, 'document.json'))).equals(validBytes),
      true,
      'the restored copy is the newest valid backup',
    );
    await h.waitSaved();

    const scan = await page.evaluate(() => window.noteforest.scanLibrary());
    assert.equal(
      scan.documents.find((document) => document.packagePath === packagePath)?.status,
      'unreadable',
    );
    assert.equal(
      scan.documents.find((document) => document.packagePath === restoredPath)?.status,
      'ok',
    );
    await noDialogs();
  });

  it('shows an empty backup state for no backups and for invalid-only backups', async () => {
    const env = isolated('empty');
    const noBackupPath = await installValidPackage(env, 'no-backup-note');
    await writeFile(resolve(noBackupPath, 'document.json'), '{ "schemaVersion": 1,');
    const invalidOnlyPath = await installValidPackage(env, 'invalid-backup-note');
    await writeFile(resolve(invalidOnlyPath, 'document.json'), '{ "schemaVersion": 1,');
    await writeBackup(env, invalidOnlyPath, Buffer.from('{ "schemaVersion": 1,'), {
      revision: 5,
    });
    await launchEnv(env);

    await waitLibraryStatus('unreadable', 2);

    await openLibraryDocument('unreadable');
    let surface = page.locator('[data-recovery-surface="true"]');
    await surface.locator('[data-recovery-empty="true"]').waitFor({ timeout: 10000 });
    assert.match(await surface.locator('[data-recovery-empty="true"]').innerText(), /No usable backups/);
    assert.equal(await surface.locator('[data-recovery-action="restore-newest"]').isDisabled(), true);
    await noDialogs();
    await surface.locator('[data-recovery-action="close"]').click();
    await waitTabCount(0);

    await page
      .locator('[data-library-document][data-doc-status="unreadable"]')
      .filter({ hasText: 'invalid-backup-note' })
      .click();
    surface = page.locator('[data-recovery-surface="true"]');
    await surface.locator('[data-recovery-empty="true"]').waitFor({ timeout: 10000 });
    assert.match(await surface.locator('[data-recovery-empty="true"]').innerText(), /No usable backups/);
    assert.equal(await surface.locator('[data-recovery-backup="true"]').count(), 1);
    assert.match(await surface.locator('[data-backup-valid="false"]').innerText(), /Unusable/);
    assert.equal(await surface.locator('[data-recovery-action="restore-newest"]').isDisabled(), true);
    await noDialogs();
  });

  it('leaves valid documents editable and unaffected beside damaged packages', async () => {
    const env = isolated('valid');
    const validPath = await installValidPackage(env, 'valid-note');
    const brokenPath = await installValidPackage(env, 'broken-note');
    const documentPath = resolve(brokenPath, 'document.json');
    const brokenBytes = Buffer.from('{ "schemaVersion": 1,');
    await writeFile(documentPath, brokenBytes);
    await launchEnv(env);

    await waitLibraryStatus('ok');
    await waitLibraryStatus('unreadable');
    assert.equal(
      await page.locator('[data-library-document][data-doc-status="ok"]').innerText(),
      'Linear algebra',
      'valid rows keep their parsed title',
    );

    await page
      .locator('[data-library-document][data-doc-status="ok"]')
      .filter({ hasText: 'Linear algebra' })
      .click();
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitBlockCount(7);

    await page.locator('.nf-editor[data-active="true"] [data-block-card] .nf-block-prose').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' unaffected');
    await h.waitEditorText('unaffected');
    await h.waitSaved();

    const saved = JSON.parse(await readFile(resolve(validPath, 'document.json'), 'utf8'));
    assert.match(JSON.stringify(saved), /unaffected/, 'the valid document saved normally');
    assert.equal((await readFile(documentPath)).equals(brokenBytes), true);
    await noDialogs();
  });
});

describe('M2f phase 4b empty chapters and stale locks', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await h.launch({
      NOTEFOREST_LIBRARY: resolve(tempRoot, 'phase4b-source-library'),
      NOTEFOREST_APP_SUPPORT: resolve(tempRoot, 'phase4b-source-support'),
    });
    page = h.page;
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    sourcePackage = (await h.state()).activeTab;
    assert.ok(sourcePackage.length > 0, 'seed document path');
    await h.quit();
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('opens a stale lock read-only, keeps it on Cancel, and takes over only on the action', async () => {
    const env = isolated('stale-lock');
    const packagePath = await installValidPackage(env, 'stale-note');
    const lockPath = await writeStaleLock(env, packagePath, 'dead-token');
    await launchEnv(env);

    await page.locator('[data-library-document][data-doc-status="ok"]').first().click();
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    const banner = page.locator('[data-stale-lock-banner="true"]');
    await banner.waitFor({ timeout: 10000 });
    assert.match(await banner.innerText(), /Read-only · stale lock/);
    // R3: the shell status panel sits between the Toolbar and the canvas panel,
    // outside the canvas surface; lock metadata is a secondary Details row.
    const placement = await page.evaluate(() => {
      const toolbar = document.querySelector('[data-toolbar="true"]');
      const panel = document.querySelector('[data-stale-lock-banner="true"]');
      const canvas = document.querySelector('[data-canvas-panel="true"]');
      if (toolbar === null || panel === null || canvas === null) return null;
      return {
        parent: panel.parentElement?.className ?? '',
        toolbarBottom: toolbar.getBoundingClientRect().bottom,
        panelTop: panel.getBoundingClientRect().top,
        panelBottom: panel.getBoundingClientRect().bottom,
        canvasTop: canvas.getBoundingClientRect().top,
        canvasHeight: canvas.getBoundingClientRect().height,
        insideCanvas: panel.closest('.nf-canvas-panel') !== null,
      };
    });
    assert.ok(placement !== null);
    assert.match(placement.parent, /nf-main-column/);
    assert.equal(placement.insideCanvas, false, 'the panel is outside the canvas surface');
    assert.ok(
      placement.panelTop >= placement.toolbarBottom - 0.5,
      'the panel follows the Toolbar',
    );
    assert.ok(
      placement.canvasTop >= placement.panelBottom - 0.5,
      'the canvas panel follows the status panel',
    );
    await banner.locator('[data-status-details] summary').click();
    assert.equal(await banner.locator('[data-lock-pid="true"]').innerText(), '2147483647');
    assert.equal(await banner.locator('[data-lock-host="true"]').innerText(), 'stale-lock-test');
    assert.equal(await banner.locator('[data-lock-session="true"]').innerText(), 'dead-session');
    assert.match(await banner.locator('[data-lock-heartbeat="true"]').innerText(), /2020/);

    let state = await h.state();
    let runtime = state.runtimes.find((item) => item.packagePath === packagePath);
    assert.equal(runtime?.status, 'read-only');
    assert.equal(runtime?.readOnlyReason, 'stale-lock');
    assert.equal(runtime?.lock?.sessionId, 'dead-session');
    assert.equal((await readLock(lockPath)).token, 'dead-token', 'no silent lock break');

    // Esc is Cancel: the panel collapses to the slim bar instead of disappearing.
    await page.keyboard.press('Escape');
    const slim = page.locator('[data-status-slim="true"][data-status-kind="stale-lock"]');
    await slim.waitFor({ timeout: 5000 });
    assert.match(await slim.innerText(), /Read-only · stale lock/);
    assert.equal(
      await slim.locator('[data-stale-lock-action="review"]').count(),
      1,
      'Cancel keeps the explanation and a Review action',
    );
    const reflow = await page.evaluate(() => {
      const canvas = document.querySelector('[data-canvas-panel="true"]');
      const panel = document.querySelector('[data-status-slim="true"]');
      if (canvas === null || panel === null) return null;
      return {
        canvasHeight: canvas.getBoundingClientRect().height,
        panelHeight: panel.getBoundingClientRect().height,
        panelBottom: panel.getBoundingClientRect().bottom,
        canvasTop: canvas.getBoundingClientRect().top,
      };
    });
    assert.ok(reflow !== null);
    assert.ok(
      Math.abs(reflow.panelHeight - 34) <= 1.5,
      `the slim bar is 34 px (${reflow.panelHeight})`,
    );
    assert.ok(
      reflow.canvasHeight > placement.canvasHeight,
      `the canvas reflows taller after Cancel (${reflow.canvasHeight} > ${placement.canvasHeight})`,
    );
    assert.ok(reflow.canvasTop >= reflow.panelBottom - 0.5);
    state = await h.state();
    runtime = state.runtimes.find((item) => item.packagePath === packagePath);
    assert.equal(runtime?.status, 'read-only');
    assert.equal((await readLock(lockPath)).token, 'dead-token', 'Cancel leaves the lock untouched');

    await page.locator('[data-stale-lock-action="review"]').click();
    await banner.waitFor({ timeout: 5000 });
    await banner.locator('[data-stale-lock-action="take-over"]').click();
    await page.waitForFunction(
      (path) => {
        const current = window.__noteforestTest.state();
        const item = current.runtimes.find((runtimeItem) => runtimeItem.packagePath === path);
        return item?.status === 'editable';
      },
      packagePath,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => document.querySelector('[data-stale-lock-banner="true"]') === null,
      undefined,
      { timeout: 10000 },
    );

    await page
      .locator('.nf-editor[data-active="true"] [data-block-card] .nf-block-prose')
      .first()
      .click();
    await page.keyboard.press('End');
    await page.keyboard.type(' taken over');
    await h.waitEditorText('taken over');
    await h.waitSaved();

    const saved = JSON.parse(await readFile(resolve(packagePath, 'document.json'), 'utf8'));
    assert.match(JSON.stringify(saved), /taken over/, 'the taken-over document saves');
    const lockAfterTakeover = await readLock(lockPath);
    assert.notEqual(lockAfterTakeover.token, 'dead-token');
    await noDialogs();
  });

  it('quits a read-only stale-lock document without a dialog or a package write', async () => {
    const env = isolated('readonly-quit');
    const packagePath = await installValidPackage(env, 'readonly-quit-note');
    const documentPath = resolve(packagePath, 'document.json');
    const lockPath = await writeStaleLock(env, packagePath, 'readonly-token');
    const before = await readFile(documentPath);
    await launchEnv(env);

    await page.locator('[data-library-document][data-doc-status="ok"]').first().click();
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    const state = await h.state();
    const runtime = state.runtimes.find((item) => item.packagePath === packagePath);
    assert.equal(runtime?.status, 'read-only');
    assert.equal(runtime?.readOnlyReason, 'stale-lock');
    assert.equal(runtime?.dirty, false, 'the read-only runtime has no unsaved changes');
    await noDialogs();

    const child = h.app.process();
    await h.app.evaluate(({ app: electronApp }) => {
      electronApp.quit();
    });
    await waitUntil(
      () => child.exitCode !== null || child.signalCode !== null,
      'the process exits: a clean read-only document never blocks quit',
      5000,
    );
    assert.deepEqual(await readFile(documentPath), before, 'the read-only package is never written');
    assert.equal(
      (await readLock(lockPath)).token,
      'readonly-token',
      'quitting does not break the stale lock',
    );
  });

  it('renders a legacy empty chapter after reload and recovers it with Add top-level block', async () => {
    const env = isolated('legacy-empty');
    const packagePath = await installValidPackage(env, 'legacy-empty-note');
    const documentPath = resolve(packagePath, 'document.json');
    const document = JSON.parse(await readFile(documentPath, 'utf8'));
    document.chapters.push({
      id: 'chapter-legacy-empty',
      title: 'Legacy empty',
      topLevelBlockIds: [],
    });
    await writeFile(documentPath, `${JSON.stringify(document, null, 2)}\n`);
    await writeStaleLock(env, packagePath);

    await launchEnv(env);
    await page.locator('[data-library-document][data-doc-status="ok"]').first().click();
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');

    const chapter = page.locator('.nf-chapter[data-chapter-id="chapter-legacy-empty"]');
    await chapter.waitFor({ timeout: 10000 });
    assert.match(await chapter.innerText(), /Legacy empty/);
    assert.equal(await chapter.locator('[data-chapter-empty="chapter-legacy-empty"]').count(), 1);
    assert.equal(await chapter.locator('[data-chapter-add="chapter-legacy-empty"]').count(), 1);
    assert.equal(await page.locator('.nf-chapter[data-chapter-id]').count(), 2);

    let state = await h.state();
    let runtime = state.runtimes.find((item) => item.packagePath === packagePath);
    assert.equal(
      runtime?.chapterList.find((item) => item.id === 'chapter-legacy-empty')?.blocks,
      0,
      'the canonical legacy chapter has no blocks',
    );

    await page.locator('[data-stale-lock-action="take-over"]').click();
    await page.waitForFunction(
      (path) => {
        const current = window.__noteforestTest.state();
        return current.runtimes.find((item) => item.packagePath === path)?.status === 'editable';
      },
      packagePath,
      { timeout: 10000 },
    );
    await page.locator('[data-chapter-add="chapter-legacy-empty"]').click();
    await page.waitForFunction(
      (path) => {
        const current = window.__noteforestTest.state();
        const item = current.runtimes.find((runtimeItem) => runtimeItem.packagePath === path);
        return (
          item?.chapterList.find((chapterItem) => chapterItem.id === 'chapter-legacy-empty')
            ?.blocks === 1
        );
      },
      packagePath,
      { timeout: 10000 },
    );
    await h.waitSaved();

    const saved = JSON.parse(await readFile(documentPath, 'utf8'));
    const recovered = saved.chapters.find((item) => item.id === 'chapter-legacy-empty');
    assert.equal(recovered?.topLevelBlockIds.length, 1);
    assert.equal(
      await page.locator('.nf-chapter[data-chapter-id="chapter-legacy-empty"] [data-block-card]').count(),
      1,
    );
    await noDialogs();
  });

  it('shows stale-lock consent on an empty document and recovers the first block', async () => {
    const env = isolated('empty-stale');
    const packagePath = await installValidPackage(env, 'empty-stale-note');
    const documentPath = resolve(packagePath, 'document.json');
    const document = JSON.parse(await readFile(documentPath, 'utf8'));
    document.blocks = {};
    document.branches = {};
    document.anchors = {};
    for (const chapter of document.chapters) {
      chapter.topLevelBlockIds = [];
      delete chapter.title;
    }
    await writeFile(documentPath, `${JSON.stringify(document, null, 2)}\n`);
    await writeStaleLock(env, packagePath);

    await launchEnv(env);
    await page.locator('[data-library-document][data-doc-status="ok"]').first().click();
    await page.locator('.nf-empty-state').waitFor({ timeout: 10000 });
    const banner = page.locator('[data-stale-lock-banner="true"]');
    await banner.waitFor({ timeout: 10000 });
    const addFirst = page.locator('.nf-empty-actions .nf-button-primary');
    assert.equal(await addFirst.isDisabled(), true, 'read-only empty document cannot add');

    await banner.locator('[data-stale-lock-action="take-over"]').click();
    await page.waitForFunction(
      (path) => {
        const current = window.__noteforestTest.state();
        return current.runtimes.find((item) => item.packagePath === path)?.status === 'editable';
      },
      packagePath,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => document.querySelector('[data-stale-lock-banner="true"]') === null,
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await addFirst.isDisabled(), false);

    await addFirst.click();
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitCanonicalBlockCount(1);
    await h.waitSaved();

    const saved = JSON.parse(await readFile(documentPath, 'utf8'));
    assert.equal(saved.chapters[0]?.topLevelBlockIds.length, 1);
    await noDialogs();
  });

  it('rejects move, branch, and delete operations that would leave a chapter empty', async () => {
    const env = isolated('empty-invariant');
    const packagePath = await installValidPackage(env, 'invariant-note');
    await launchEnv(env);
    await page.locator('[data-library-document][data-doc-status="ok"]').first().click();
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');

    const state = await h.state();
    const firstChapterId = state.runtimes[0]?.chapterList[0]?.id;
    assert.ok(firstChapterId);

    const createdChapter = await page.evaluate(() =>
      window.__noteforestTest.applyStructural({ type: 'chapter.create', title: 'Second' }),
    );
    assert.equal(createdChapter.ok, true);
    const secondChapterId = createdChapter.chapterId;
    assert.ok(secondChapterId);

    const createdBlock = await page.evaluate(
      (chapterId) =>
        window.__noteforestTest.applyStructural({
          type: 'block.create',
          placement: { kind: 'top-level', chapterId },
        }),
      secondChapterId,
    );
    assert.equal(createdBlock.ok, true);
    const secondBlockId = createdBlock.blockId;
    assert.ok(secondBlockId);

    const structure = await page.evaluate(() => window.__noteforestTest.structure());
    const firstBlockId = structure.chapters.find((chapter) => chapter.id === firstChapterId)
      ?.topLevelBlockIds[0];
    assert.ok(firstBlockId);

    const moveOut = await page.evaluate(
      ({ blockId, chapterId }) =>
        window.__noteforestTest.applyStructural({
          type: 'block.move',
          blockId,
          to: { kind: 'top-level', chapterId },
        }),
      { blockId: secondBlockId, chapterId: firstChapterId },
    );
    assert.equal(moveOut.ok, false);
    assert.match(moveOut.message, /Cannot move the last top-level block/);
    assert.match(moveOut.message, /"Second"/);

    const branchOut = await page.evaluate(
      ({ sourceBlockId, targetBlockId }) =>
        window.__noteforestTest.applyStructural({
          type: 'branch.create',
          sourceBlockId,
          targetBlockId,
        }),
      { sourceBlockId: firstBlockId, targetBlockId: secondBlockId },
    );
    assert.equal(branchOut.ok, false);
    assert.match(branchOut.message, /Cannot branch the last top-level block/);

    const deleteLast = await page.evaluate(
      (blockId) =>
        window.__noteforestTest.applyStructural({
          type: 'block.delete',
          blockId,
          children: 'delete-subtree',
        }),
      secondBlockId,
    );
    assert.equal(deleteLast.ok, false);
    assert.match(deleteLast.message, /Cannot delete the last top-level block of chapter "Second"/);

    const stillThere = await h.state();
    assert.equal(
      stillThere.runtimes[0]?.chapterList.find((chapter) => chapter.id === secondChapterId)?.blocks,
      1,
      'rejected operations leave the chapter intact',
    );

    const anotherRoot = await page.evaluate(
      (chapterId) =>
        window.__noteforestTest.applyStructural({
          type: 'block.create',
          placement: { kind: 'top-level', chapterId },
        }),
      secondChapterId,
    );
    assert.equal(anotherRoot.ok, true);

    const allowed = await page.evaluate(
      ({ blockId, chapterId }) =>
        window.__noteforestTest.applyStructural({
          type: 'block.move',
          blockId,
          to: { kind: 'top-level', chapterId },
        }),
      { blockId: secondBlockId, chapterId: firstChapterId },
    );
    assert.equal(allowed.ok, true, 'a move is allowed once the chapter still has a root');

    const afterMove = await h.state();
    assert.equal(
      afterMove.runtimes[0]?.chapterList.find((chapter) => chapter.id === secondChapterId)?.blocks,
      1,
    );
    await noDialogs();
  });
});
