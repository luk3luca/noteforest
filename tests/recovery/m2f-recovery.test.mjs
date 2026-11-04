import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import {
  artifactsPath,
  createHarness,
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
    assert.match(await surface.innerText(), /could not be read/i);
    await surface.locator('[data-recovery-empty="true"]').waitFor({ timeout: 10000 });

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
    newer.schemaVersion = 2;
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
    assert.match(await surface.innerText(), /will not be downgraded, edited, or overwritten/);
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
