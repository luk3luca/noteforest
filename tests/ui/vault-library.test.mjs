import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageDocument, writePagePackage, textBlock } from '../support/page-fixtures.mjs';

/**
 * Phase 3 / S2 — the recursive Library tree.
 *
 * The library is a vault: folders expand/collapse, note packages and `.md` guest
 * files are rows, and everything else (assets, images, `.md.bak`, hidden files)
 * is ignored. Folder create/rename/move/trash and note/Markdown move are
 * app-level actions with dialogs; Read mode keeps the tree navigation-only.
 * `.md` rows open the Markdown guest view (no forest, Page, or PDF).
 */

const tempRoot = artifactsPath('vault-library-temp');
const screenshotDir = artifactsPath('vault-library');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function state() {
  return page.evaluate(() => window.__noteforestTest.state());
}

async function launch(env) {
  page = await ui.launch({ ...env, NOTEFOREST_E2E_HIDDEN: '0' });
  await h.setWindowSize(1440, 900);
}

async function treeRows() {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-sidebar-panel="library"] [role="treeitem"]')].map(
      (element) => ({
        kind: element.getAttribute('data-library-folder') === 'true' ? 'folder' : 'document',
        name:
          element.getAttribute('data-library-folder') === 'true'
            ? (element.querySelector('.nf-library-folder-row .nf-library-title')?.textContent ?? '')
            : (element.querySelector('.nf-library-title')?.textContent ?? ''),
        path: element.getAttribute('data-vault-path'),
        expanded: element.getAttribute('data-expanded'),
      }),
    ),
  );
}

async function folderRowPath(folderPath) {
  const row = page.locator(`[data-library-folder][data-vault-path="${folderPath}"]`);
  await row.waitFor({ timeout: 15000 });
  return row;
}

async function folderExpanded(folderPath) {
  const node = await folderRowPath(folderPath);
  return (await node.getAttribute('data-expanded')) === 'true';
}

async function setFolderExpanded(folderPath, expanded) {
  const node = await folderRowPath(folderPath);
  if (((await node.getAttribute('data-expanded')) === 'true') !== expanded) {
    await node.locator('> .nf-library-folder-row').click();
  }
  await page.waitForFunction(
    ({ target, value }) =>
      document
        .querySelector(`[data-library-folder][data-vault-path="${target}"]`)
        ?.getAttribute('data-expanded') === (value ? 'true' : 'false'),
    { target: folderPath, value: expanded },
    { timeout: 10000 },
  );
}

async function expandFolder(folderPath) {
  await setFolderExpanded(folderPath, true);
}

async function chooseMenuItem(label) {
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  await page.locator('.nf-menu').waitFor({ state: 'detached' });
}

async function openFolderMenu(folderPath) {
  const node = await folderRowPath(folderPath);
  await node.locator('> .nf-library-folder-row').click({ button: 'right' });
  await page.locator('.nf-menu').waitFor();
}

async function openDocumentMenu(title) {
  const row = page.locator('[data-sidebar-panel="library"] .nf-library-row', { hasText: title });
  await row.waitFor({ timeout: 15000 });
  await row.locator('.nf-row-menu').click();
  await page.locator('.nf-menu').waitFor();
}

async function writeFixtures(env) {
  const library = env.NOTEFOREST_LIBRARY;
  await mkdir(join(library, 'Università', 'Analisi'), { recursive: true });
  await mkdir(join(library, 'Personale'), { recursive: true });
  await writePagePackage(
    library,
    'Università/Analisi/serie-1',
    pageDocument({
      id: 'vault-serie-1',
      title: 'Serie uno',
      chapterTitle: 'Analisi',
      blocks: [textBlock('s1', 'S1', 'Una serie converge.')],
    }),
  );
  await writePagePackage(
    library,
    'root-note',
    pageDocument({
      id: 'vault-root-note',
      title: 'Nota in radice',
      chapterTitle: 'Radice',
      blocks: [textBlock('r1', 'R1', 'Nota alla radice della libreria.')],
    }),
  );
  await mkdir(join(library, 'Archive'), { recursive: true });
  await writeFile(join(library, 'diario.md'), '# Diario\n\nUna riga di testo.\n');
  // None of these is a library node.
  await writeFile(join(library, 'diario.md.bak'), '# vecchio diario\n');
  await mkdir(join(library, 'diario.assets'), { recursive: true });
  await writeFile(join(library, 'diario.assets', 'pic.png'), 'not an image');
  await writeFile(join(library, 'photo.png'), 'not an image');
  await writeFile(join(library, '.hidden.md'), '# hidden');
}

describe('Vault library tree', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('shows folders, notes, and .md files only, expands folders, and opens a guest file', async () => {
    const env = ui.isolated('tree');
    await writeFixtures(env);
    await launch(env);

    // Folders first (case-insensitive), then notes, then Markdown.
    await page.waitForSelector('[data-sidebar-panel="library"] [role="tree"]');
    assert.deepEqual(
      (await treeRows()).map((row) => `${row.kind}:${row.name}`),
      [
        'folder:Archive',
        'folder:Personale',
        'folder:Università',
        'document:Nota in radice',
        'document:diario.md',
      ],
      'only folders, note packages, and .md files are rows',
    );
    assert.equal(await page.locator('[data-library-kind="markdown"]', { hasText: 'diario.md.bak' }).count(), 0);
    assert.equal(
      await page.locator('[data-sidebar-panel="library"] [data-vault-path$="photo.png"]').count(),
      0,
      'images are not library nodes',
    );
    assert.equal(
      await page.locator('[data-sidebar-panel="library"] [data-vault-path$="diario.assets"]').count(),
      0,
      'asset folders are not library nodes',
    );

    // An empty folder is visible and persists; expanding it shows no children.
    await expandFolder(join(env.NOTEFOREST_LIBRARY, 'Personale'));
    assert.deepEqual(
      await page
        .locator(`[data-library-folder][data-vault-path="${join(env.NOTEFOREST_LIBRARY, 'Personale')}"] [role="treeitem"]`)
        .count(),
      0,
    );

    // Expand Università → Analisi → the nested note.
    await expandFolder(join(env.NOTEFOREST_LIBRARY, 'Università'));
    await expandFolder(join(env.NOTEFOREST_LIBRARY, 'Università', 'Analisi'));
    const nested = page.locator('[data-library-document]', { hasText: 'Serie uno' });
    await nested.waitFor({ timeout: 10000 });
    assert.equal(
      await page
        .locator('[data-library-folder][data-vault-path="' + join(env.NOTEFOREST_LIBRARY, 'Università') + '"]')
        .getAttribute('data-expanded'),
      'true',
    );

    // Collapsing keeps the folder and hides the descendant rows.
    assert.equal(await folderExpanded(join(env.NOTEFOREST_LIBRARY, 'Università')), true);
    await setFolderExpanded(join(env.NOTEFOREST_LIBRARY, 'Università'), false);
    assert.equal(await page.locator('[data-library-document]', { hasText: 'Serie uno' }).count(), 0);
    await expandFolder(join(env.NOTEFOREST_LIBRARY, 'Università'));
    await expandFolder(join(env.NOTEFOREST_LIBRARY, 'Università', 'Analisi'));

    // The count is notes + Markdown: folders and ignored files never inflate it.
    assert.equal((await state()).library.documents.length, 3);
    assert.match(await page.locator('[data-library-count]').innerText(), /^3$/);

    // A `.md` row opens the guest view: no forest, Page, or PDF surface.
    await page.locator('[data-library-document][data-library-kind="markdown"]', { hasText: 'diario.md' }).click();
    const guest = page.locator('.nf-markdown-editor[data-active="true"]');
    await guest.waitFor({ timeout: 20000 });
    assert.equal(await guest.locator('[data-block-card]').count(), 0);
    assert.equal(await guest.locator('[data-chapter-id]').count(), 0);
    assert.equal(await guest.locator('[data-page-counter]').count(), 0);
    assert.equal(await guest.locator('[data-page-export]').count(), 0);
    assert.equal(await guest.locator('[data-view-layout="page"]').count(), 0);
    assert.equal(await guest.locator('h1').innerText(), 'Diario');
    assert.equal((await state()).runtimes.length, 0, 'a .md opens no document runtime');

    // Expansion state survives a relaunch through the shell session.
    await h.flushSession();
    await h.quit();
    page = await ui.launch({ ...env, NOTEFOREST_E2E_HIDDEN: '0' });
    await h.setWindowSize(1440, 900);
    await page.waitForSelector(
      `[data-library-folder][data-vault-path="${join(env.NOTEFOREST_LIBRARY, 'Università')}"][data-expanded="true"]`,
      { timeout: 15000 },
    );
    await page.screenshot({ path: join(screenshotDir, 'library-tree.png') });
  });

  it('creates, renames, and moves entries through the folder dialogs', async () => {
    const env = ui.isolated('folders');
    await writeFixtures(env);
    await launch(env);
    const library = env.NOTEFOREST_LIBRARY;

    // Create a folder from the Library header.
    await page.locator('[data-library-new-folder="true"]').click();
    await page.waitForSelector('[data-new-folder-dialog="true"]');
    await page.locator('[data-new-folder-name]').fill('Nuova cartella');
    await page.locator('[data-new-folder-create]').click();
    await page.waitForSelector('[data-new-folder-dialog="true"]', { state: 'detached' });
    await page.waitForSelector(`[data-library-folder][data-vault-path="${join(library, 'Nuova cartella')}"]`, {
      timeout: 10000,
    });
    assert.equal((await stat(join(library, 'Nuova cartella'))).isDirectory(), true);

    // Rename it in place.
    await openFolderMenu(join(library, 'Nuova cartella'));
    assert.equal(
      await page.getByRole('menuitem', { name: 'Reveal in Finder', exact: true }).count(),
      1,
      'the folder menu offers Reveal in Finder',
    );
    await chooseMenuItem('Rename folder…');
    await page.waitForSelector('[data-rename-folder-dialog="true"]');
    await page.locator('[data-rename-folder-name]').fill('Rinominata');
    await page.locator('[data-rename-folder-save]').click();
    await page.waitForSelector(`[data-library-folder][data-vault-path="${join(library, 'Rinominata')}"]`, {
      timeout: 10000,
    });
    assert.equal((await stat(join(library, 'Rinominata'))).isDirectory(), true);
    await assert.rejects(stat(join(library, 'Nuova cartella')));

    // Move the root note into the renamed folder.
    const rootNotePath = join(library, 'root-note');
    const targetPath = join(library, 'Rinominata', 'root-note');
    await page.locator('[data-library-document]', { hasText: 'Nota in radice' }).click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      rootNotePath,
      { timeout: 15000 },
    );
    await page.screenshot({ path: join(screenshotDir, 'library-tree-before-move.png') });
    await openDocumentMenu('Nota in radice');
    await chooseMenuItem('Move to folder…');
    await page.waitForSelector('[data-move-dialog="true"]');
    await page.locator(`[data-move-target="${join(library, 'Rinominata')}"]`).click();
    await page.screenshot({ path: join(screenshotDir, 'move-dialog.png') });
    await page.locator('[data-move-confirm="true"]').click();
    await page.waitForSelector('[data-move-dialog="true"]', { state: 'detached' });
    assert.equal((await stat(targetPath)).isDirectory(), true);
    await assert.rejects(stat(rootNotePath));

    // The open tab followed the document id to the new path.
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().tabs.some((tab) => tab.packagePath === path),
      targetPath,
      { timeout: 20000 },
    );
    assert.equal((await state()).activeTab, targetPath);
    await expandFolder(join(library, 'Rinominata'));
    assert.equal(
      await page
        .locator(`[data-library-folder][data-vault-path="${join(library, 'Rinominata')}"] [data-library-document]`, {
          hasText: 'Nota in radice',
        })
        .count(),
      1,
    );
    await page.screenshot({ path: join(screenshotDir, 'library-tree-after-move.png') });

    // Session, recents, and the durable settings entry follow the move.
    await h.flushSession();
    const session = JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'shell-session.json'), 'utf8'),
    );
    assert.ok(
      session.tabs.some((tab) => tab.packagePath === targetPath),
      'the session tab moved with the note',
    );
  });

  it('keeps the tree navigation-only in Read mode and moves a folder to the OS Trash', async () => {
    const env = ui.isolated('read-trash');
    await writeFixtures(env);
    await launch(env);
    const library = env.NOTEFOREST_LIBRARY;

    // Open a note and switch to Read: vault mutations are disabled with the
    // shared Read-mode reason; the tree still navigates.
    await page.locator('[data-library-document]', { hasText: 'Nota in radice' }).click();
    await page.waitForSelector('.nf-editor[data-active="true"]');
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () => {
        const active = window.__noteforestTest.state().activeTab;
        return window.__noteforestTest.viewState()[active]?.interactionMode === 'read';
      },
      undefined,
      { timeout: 10000 },
    );
    const addFolder = page.locator('[data-library-new-folder="true"]');
    assert.equal(await addFolder.isDisabled(), true, 'New folder is gated in Read mode');
    assert.match((await addFolder.getAttribute('title')) ?? '', /Read mode/);
    await openFolderMenu(join(library, 'Personale'));
    const newFolderItem = page.getByRole('menuitem', { name: /New folder/ });
    assert.match(await newFolderItem.innerText(), /Read mode/);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: join(screenshotDir, 'library-read-gating.png') });

    // Back to Edit: folder trash names the contained notes and uses the OS Trash.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () => {
        const active = window.__noteforestTest.state().activeTab;
        return window.__noteforestTest.viewState()[active]?.interactionMode === 'edit';
      },
      undefined,
      { timeout: 10000 },
    );
    const folder = join(library, 'Università');
    await openFolderMenu(folder);
    await chooseMenuItem('Move to Trash…');
    await page.waitForSelector('[data-trash-dialog="true"]');
    assert.equal(await page.locator('[data-trash-dialog]').getAttribute('data-trash-kind'), 'folder');
    assert.match(await page.locator('[data-trash-contained]').innerText(), /1 note/);
    assert.match(await page.locator('[data-trash-contained]').innerText(), /0 Markdown/);
    await page.screenshot({ path: join(screenshotDir, 'folder-trash-dialog.png') });
    await page.locator('[data-trash-confirm="true"]').click();
    await page.waitForSelector('[data-trash-dialog="true"]', { state: 'detached' });
    await page.waitForFunction(
      (path) =>
        !window.__noteforestTest
          .state()
          .library.tree.some((node) => node.path === path),
      folder,
      { timeout: 20000 },
    );
    await assert.rejects(stat(folder));
    assert.equal((await state()).tabs.some((tab) => tab.title === 'Serie uno'), false);
    await page.screenshot({ path: join(screenshotDir, 'library-after-folder-trash.png') });
  });
});
