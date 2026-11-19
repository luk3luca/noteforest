import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { artifactsPath, killTestAppsUnder } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageDocument, writePagePackage, textBlock } from '../support/page-fixtures.mjs';

/**
 * Phase 3 / S2 — the recursive Library tree.
 *
 * The library is a vault: folders expand/collapse, note packages and `.md` guest
 * files are rows, and everything else (assets, images, `.md.bak`, hidden files)
 * is ignored. Folder create/rename/move/trash, note/Markdown move and
 * "New note here" are app-level actions with dialogs: they stay available in
 * Read mode, which only gates document content. `.md` rows open the Markdown
 * guest view (no forest, Page, or PDF).
 */

const tempRoot = artifactsPath('vault-library-temp');
const screenshotDir = artifactsPath('vault-library');
// S1 evidence: the Library rows with a folder, a note, and a `.md` file.
const activityArtifacts = artifactsPath('activity-bar');
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

/** Current interaction mode of the active tab (Edit when it has no view state). */
async function interactionMode() {
  return page.evaluate(() => {
    const active = window.__noteforestTest.state().activeTab;
    return window.__noteforestTest.viewState()[active]?.interactionMode ?? 'edit';
  });
}

/**
 * Set Edit/Read through the real shortcut, but only when the mode differs: a
 * vault move closes and reopens the tab, and the reopened view may reset.
 */
async function setInteractionMode(mode) {
  if ((await interactionMode()) === mode) return;
  await page.keyboard.press('Meta+e');
  await page.waitForFunction(
    (target) => {
      const active = window.__noteforestTest.state().activeTab;
      return window.__noteforestTest.viewState()[active]?.interactionMode === target;
    },
    mode,
    { timeout: 10000 },
  );
}

/** Visible library entries of one directory, hidden and temp files excluded. */
async function directoryEntries(directory) {
  return (await readdir(directory).catch(() => []))
    .filter((name) => !name.startsWith('.'))
    .sort();
}

/** Wait until the open draft tab is replaced by a real package inside `parent`. */
async function waitMaterializedIn(draftKey, parent) {
  await page.waitForFunction(
    (key) => !window.__noteforestTest.state().tabs.some((tab) => tab.packagePath === key),
    draftKey,
    { timeout: 15000 },
  );
  const packagePath = (await state()).activeTab ?? '';
  assert.equal(dirname(packagePath), parent, 'the package materialized inside the target folder');
  return packagePath;
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
    // A previous run can leave a test app alive with the suite's userData.
    killTestAppsUnder(tempRoot);
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await h.quit();
    } finally {
      // No test Electron may survive a failed or timed-out test: an orphan keeps
      // the userData single-instance lock and every later launch hangs.
      killTestAppsUnder(tempRoot);
    }
  });

  after(async () => {
    killTestAppsUnder(tempRoot);
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('shows folders, notes, and .md files only, expands folders, and opens a guest file', { timeout: 120000 }, async () => {
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
    assert.equal(await page.locator('[data-page-position]').count(), 0);
    assert.equal(await page.locator('[data-zoom-value]').count(), 0);
    assert.equal(await guest.locator('[data-page-export]').count(), 0);
    assert.equal(await guest.locator('[data-view-layout="page"]').count(), 0);
    assert.equal(
      await guest.locator('h1').evaluate((element) => {
        const clone = element.cloneNode(true);
        for (const marker of clone.querySelectorAll('.nf-heading-marker')) marker.remove();
        return clone.textContent ?? '';
      }),
      'Diario',
    );
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

    // S1 icon semantics: a folder row, a note row, and a `.md` row differ by
    // glyph (and the `.md` suffix), never by colour alone.
    const noteRow = page.locator('[data-library-document][data-library-kind="note"]').first();
    const mdRow = page.locator('[data-library-document][data-library-kind="markdown"]').first();
    assert.equal(
      await page.locator('[data-library-folder]').count() > 0,
      true,
      'the fixture has folder rows',
    );
    assert.equal(await noteRow.locator('[data-library-icon="note"]').count(), 1, 'a note uses the note glyph');
    assert.equal(await mdRow.locator('[data-library-icon="markdown"]').count(), 1, 'a .md uses the file glyph');
    assert.equal(await noteRow.locator('[data-library-icon="markdown"]').count(), 0);
    assert.equal(await mdRow.locator('[data-library-icon="note"]').count(), 0);
    assert.equal(
      await page.locator('[role="treeitem"][aria-label="diario.md"]').count(),
      1,
      'the full file name stays the row label',
    );
    const suffix = mdRow.locator('[data-library-suffix="markdown"]');
    assert.equal((await suffix.innerText()).trim(), '.md', 'the .md suffix follows the title');
    assert.match(await mdRow.innerText(), /diario\.md/, 'title and suffix read as one name');
    const colours = await mdRow.evaluate((element) => {
      const suffixElement = element.querySelector('[data-library-suffix="markdown"]');
      const titleElement = element.querySelector('.nf-library-title');
      const mdIcon = element.querySelector('[data-library-icon="markdown"]');
      return {
        suffix: suffixElement === null ? null : getComputedStyle(suffixElement).color,
        title: titleElement === null ? null : getComputedStyle(titleElement).color,
        mdIcon: mdIcon === null ? null : getComputedStyle(mdIcon).color,
      };
    });
    const noteIconColour = await noteRow
      .locator('[data-library-icon="note"]')
      .evaluate((element) => getComputedStyle(element).color);
    assert.equal(colours.mdIcon, colours.suffix, 'the .md glyph and suffix share text-3');
    assert.notEqual(noteIconColour, colours.mdIcon, 'note and .md glyphs differ in weight too');
    assert.notEqual(colours.suffix, colours.title, 'the suffix is dimmer than the title');
    await mkdir(activityArtifacts, { recursive: true });
    await page.screenshot({ path: join(activityArtifacts, 'library-rows.png') });
  });

  it('creates, renames, and moves entries through the folder dialogs', { timeout: 90000 }, async () => {
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

  it('keeps library organization available in Read mode and gates only document content', { timeout: 90000 }, async () => {
    const env = ui.isolated('read-actions');
    await writeFixtures(env);
    await launch(env);
    const library = env.NOTEFOREST_LIBRARY;

    // Open a note and switch to Read: library organization stays available.
    await page.locator('[data-library-document]', { hasText: 'Nota in radice' }).click();
    await page.waitForSelector('.nf-editor[data-active="true"]');
    await setInteractionMode('read');

    const addFolder = page.locator('[data-library-new-folder="true"]');
    assert.equal(await addFolder.isDisabled(), false, 'New folder stays available in Read');
    assert.equal(await addFolder.getAttribute('aria-label'), 'New folder');
    assert.doesNotMatch((await addFolder.getAttribute('title')) ?? '', /Read mode/);

    // Every folder action is enabled and carries no Read-mode suffix.
    await openFolderMenu(join(library, 'Personale'));
    for (const id of [
      'vault-new-note',
      'vault-new-folder',
      'vault-rename-folder',
      'vault-move-folder',
      'vault-trash-folder',
    ]) {
      const item = page.locator(`[data-menu-entry="${id}"]`);
      assert.equal(await item.count(), 1, `the folder menu offers ${id}`);
      assert.equal(await item.getAttribute('aria-disabled'), null, `${id} is enabled in Read`);
      assert.doesNotMatch(await item.innerText(), /Read mode/, `${id} has no Read-mode suffix`);
    }
    await page.keyboard.press('Escape');

    // Document content stays gated: adding a chapter is a content command and
    // lives on the Outline tab.
    await page.locator('[data-sidebar-tab="outline"]').click();
    await page.waitForSelector('[data-sidebar-panel="outline"]');
    const addChapter = page.getByRole('button', { name: /^Add chapter/ });
    assert.equal(await addChapter.isDisabled(), true, 'content commands stay gated in Read');
    assert.match((await addChapter.getAttribute('title')) ?? '', /Read mode/);
    await page.locator('[data-sidebar-tab="library"]').click();
    await page.waitForSelector('[data-sidebar-panel="library"]');
    await page.screenshot({ path: join(screenshotDir, 'library-read-actions.png') });

    // New folder works from Read.
    const readFolder = join(library, 'Cartella lettura');
    await addFolder.click();
    await page.waitForSelector('[data-new-folder-dialog="true"]');
    await page.locator('[data-new-folder-name]').fill('Cartella lettura');
    await page.locator('[data-new-folder-create]').click();
    await page.waitForSelector('[data-new-folder-dialog="true"]', { state: 'detached' });
    await page.waitForSelector(`[data-library-folder][data-vault-path="${readFolder}"]`, {
      timeout: 10000,
    });
    assert.equal((await stat(readFolder)).isDirectory(), true);

    // Move the open note into it from Read: the file and the tab follow.
    const rootNotePath = join(library, 'root-note');
    const movedPath = join(readFolder, 'root-note');
    await openDocumentMenu('Nota in radice');
    await chooseMenuItem('Move to folder…');
    await page.waitForSelector('[data-move-dialog="true"]');
    await page.locator(`[data-move-target="${readFolder}"]`).click();
    await page.locator('[data-move-confirm="true"]').click();
    await page.waitForSelector('[data-move-dialog="true"]', { state: 'detached' });
    assert.equal((await stat(movedPath)).isDirectory(), true);
    await assert.rejects(stat(rootNotePath));
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().tabs.some((tab) => tab.packagePath === path),
      movedPath,
      { timeout: 20000 },
    );

    // The reopened tab may reset its view; Read again before the trash step.
    await setInteractionMode('read');
    await openFolderMenu(join(library, 'Università'));
    await chooseMenuItem('Move to Trash…');
    await page.waitForSelector('[data-trash-dialog="true"]');
    assert.equal(await page.locator('[data-trash-dialog]').getAttribute('data-trash-kind'), 'folder');
    assert.match(await page.locator('[data-trash-contained]').innerText(), /1 note/);
    assert.match(await page.locator('[data-trash-contained]').innerText(), /0 Markdown/);
    await page.screenshot({ path: join(screenshotDir, 'folder-trash-dialog.png') });
    const folder = join(library, 'Università');
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

  it('creates a new note inside a folder and materializes the package there', { timeout: 90000 }, async () => {
    const env = ui.isolated('folder-new-note');
    await writeFixtures(env);
    await launch(env);
    const library = env.NOTEFOREST_LIBRARY;
    const universita = join(library, 'Università');
    const analisi = join(universita, 'Analisi');
    await expandFolder(universita);
    await expandFolder(analisi);

    // Nested folder target: the draft writes nothing until the first edit.
    await openFolderMenu(analisi);
    await chooseMenuItem('New note here');
    await page.waitForFunction(() => window.__noteforestTest.state().tabs.length === 1);
    const before = await state();
    const draftKey = before.tabs[0]?.packagePath ?? '';
    assert.match(draftKey, /^draft:/, 'New note here starts an in-memory draft');
    assert.deepEqual(await directoryEntries(analisi), ['serie-1'], 'the draft writes nothing yet');
    assert.deepEqual(
      await directoryEntries(library),
      ['Archive', 'Personale', 'Università', 'diario.assets', 'diario.md', 'diario.md.bak', 'photo.png', 'root-note'],
      'the draft never appears at the library root',
    );
    await page.screenshot({ path: join(screenshotDir, 'folder-new-note-before.png') });

    // The first real edit materializes the package inside the target folder.
    await page.locator('.nf-editor[data-active="true"] .nf-block-prose').first().click();
    await page.keyboard.type('Nota dentro Analisi');
    const packagePath = await waitMaterializedIn(draftKey, analisi);
    assert.deepEqual(await directoryEntries(analisi), ['serie-1', basename(packagePath)].sort());
    assert.deepEqual(
      await directoryEntries(library),
      ['Archive', 'Personale', 'Università', 'diario.assets', 'diario.md', 'diario.md.bak', 'photo.png', 'root-note'],
      'the folder note never lands at the root',
    );

    // The tree refreshes without a manual Refresh: the row is inside Analisi.
    const nestedRow = page.locator(
      `[data-library-folder][data-vault-path="${analisi}"] [data-library-document]`,
      { hasText: 'Untitled' },
    );
    await nestedRow.waitFor({ timeout: 10000 });
    assert.equal(
      await page.locator('.nf-library-list > .nf-library-row', { hasText: 'Untitled' }).count(),
      0,
      'the folder note is not a root row',
    );

    // The typed text reached the package inside the folder.
    await page.keyboard.press('Meta+s');
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
        return runtime !== undefined && runtime.saveState === 'saved';
      },
      undefined,
      // Autosave on a loaded machine, not a missing write: keep the assertion,
      // give the save coordinator room (PG1 harness hardening).
      { timeout: 30000 },
    );
    const stored = await readFile(join(packagePath, 'document.json'), 'utf8');
    assert.match(stored, /Nota dentro Analisi/);
    await page.screenshot({ path: join(screenshotDir, 'folder-new-note-after.png') });

    // The global New note stays root-bound.
    const openRootNote = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if ((await state()).tabs.length >= 2) return;
        await page.locator('[data-library-new="true"]').click();
        try {
          await page.waitForFunction(
            () => window.__noteforestTest.state().tabs.length === 2,
            undefined,
            { timeout: 3000 },
          );
          return;
        } catch {
          // The first click can land before the shell's first renderer tick.
        }
      }
      await page.waitForFunction(() => window.__noteforestTest.state().tabs.length === 2, undefined, {
        timeout: 10000,
      });
    };
    await openRootNote();
    const rootDraft = (await state()).tabs.find((tab) => tab.packagePath.startsWith('draft:'));
    assert.ok(rootDraft !== undefined, 'the header New note opens a draft');
    await page.locator('.nf-editor[data-active="true"] .nf-block-prose').first().click();
    await page.keyboard.type('Nota alla radice');
    const rootPackage = await waitMaterializedIn(rootDraft.packagePath, library);
    assert.deepEqual(await directoryEntries(library), [
      'Archive',
      'Personale',
      'Università',
      'diario.assets',
      'diario.md',
      'diario.md.bak',
      'photo.png',
      'root-note',
      'untitled',
    ]);
    assert.equal(dirname(rootPackage), library, 'the global New note stays at the library root');
  });

  it('refuses a folder that disappeared before the first edit and creates no package', { timeout: 60000 }, async () => {
    const env = ui.isolated('folder-gone');
    await writeFixtures(env);
    await launch(env);
    const library = env.NOTEFOREST_LIBRARY;
    const personale = join(library, 'Personale');

    await openFolderMenu(personale);
    await chooseMenuItem('New note here');
    await page.waitForFunction(() => window.__noteforestTest.state().tabs.length === 1);
    const draftKey = (await state()).tabs[0]?.packagePath ?? '';
    assert.match(draftKey, /^draft:/);

    // The target folder disappears while the draft is still in memory.
    await rm(personale, { recursive: true, force: true });
    await page.locator('.nf-editor[data-active="true"] .nf-block-prose').first().click();
    await page.keyboard.type('Senza cartella');

    const banner = page.locator('[data-draft-materialize-error]');
    await banner.waitFor({ timeout: 15000 });
    const bannerCode = await banner.getAttribute('data-draft-materialize-error');
    const bannerText = await page.locator('[data-draft-error-message]').innerText();
    assert.equal(bannerCode, 'not-found');
    assert.match(bannerText, /no longer exists/);
    const afterFailure = await state();
    assert.equal(afterFailure.tabs[0]?.packagePath, draftKey, 'the draft stays in memory');
    assert.deepEqual(
      await directoryEntries(library),
      ['Archive', 'Università', 'diario.assets', 'diario.md', 'diario.md.bak', 'photo.png', 'root-note'],
      'no package is created for a removed target folder',
    );
    await page.screenshot({ path: join(screenshotDir, 'folder-new-note-missing-target.png') });
    // The draft cannot materialize; closing the tab discards it so the app can
    // quit (the same user path as any unsaved draft). A test must never leave a
    // dirty document that makes the app refuse to quit.
    await page.evaluate(() =>
      window.__noteforestTest.closePath(window.__noteforestTest.state().activeTab),
    );
    await page.waitForFunction(() => window.__noteforestTest.state().tabs.length === 0);
  });

  it('steps library rows on the shared sidebar ladder, equal to the Outline (VF item 5)', async () => {
    const env = ui.isolated('indent');
    const library = env.NOTEFOREST_LIBRARY;
    // A folder chain five levels deep, a document at the root, one at depth 2,
    // and an empty folder at every level so each row stays a row.
    const chain = ['A-folder', 'A-folder/B-folder', 'A-folder/B-folder/C-folder', 'A-folder/B-folder/C-folder/D-folder', 'A-folder/B-folder/C-folder/D-folder/E-folder'];
    for (const relative of chain) await mkdir(join(library, relative), { recursive: true });
    await writePagePackage(
      library,
      'Z-root-note',
      pageDocument({
        id: 'indent-root-note',
        title: 'Nota in radice',
        chapterTitle: 'Radice',
        blocks: [textBlock('r1', 'R1', 'Nota alla radice della libreria.')],
      }),
    );
    await writePagePackage(
      library,
      'A-folder/nota-interna',
      pageDocument({
        id: 'indent-inner-note',
        title: 'Nota interna',
        chapterTitle: 'Interna',
        blocks: [textBlock('i1', 'I1', 'Nota dentro una cartella.')],
      }),
    );
    await launch(env);
    await page.waitForSelector('[data-sidebar-panel="library"] [role="tree"]');

    for (const relative of chain) {
      await expandFolder(join(library, relative));
    }

    /** Computed `padding-inline-start` of one Library row. */
    const indentOf = (selector) =>
      page.locator(selector).first().evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingInlineStart),
      );
    const folderIndent = (relative) =>
      indentOf(
        `[data-library-folder][data-vault-path="${join(library, relative)}"] > .nf-library-folder-row`,
      );
    // The document row wrapper carries the ladder value; the button inside it
    // owns the hover/active geometry.
    const documentIndent = (relative) =>
      indentOf(`.nf-library-row[data-vault-path="${join(library, relative)}"]`);
    const measured = {
      rootFolder: await folderIndent('A-folder'),
      rootDocument: await documentIndent('Z-root-note'),
      depth2Folder: await folderIndent('A-folder/B-folder'),
      depth2Document: await documentIndent('A-folder/nota-interna'),
      depth3Folder: await folderIndent('A-folder/B-folder/C-folder'),
      depth4Folder: await folderIndent('A-folder/B-folder/C-folder/D-folder'),
      depth5Folder: await folderIndent('A-folder/B-folder/C-folder/D-folder/E-folder'),
    };
    // The folder button and the document row carry the ladder value itself; no
    // component adds a second inset.
    assert.deepEqual(measured, {
      rootFolder: 6,
      rootDocument: 6,
      depth2Folder: 18,
      depth2Document: 18,
      depth3Folder: 30,
      depth4Folder: 42,
      depth5Folder: 54,
    });
    // Past the Outline's three-level cap the library keeps stepping.
    assert.ok(measured.depth5Folder > measured.depth4Folder, 'depth 5 is further right');
    assert.equal(measured.depth4Folder - measured.depth3Folder, 12, 'the step stays 12 px');
    await page.screenshot({
      path: artifactsPath('vf-release-fixes', 'library-indent-after.png'),
      scale: 'css',
    });

    // The same ladder as the Outline: the chapter row (level 1) is the library
    // root's 6 px, a top-level block (level 2) is a depth-2 document's 18 px.
    await page
      .locator(`.nf-library-row[data-vault-path="${join(library, 'Z-root-note')}"] .nf-library-open`)
      .click();
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await ui.showOutline();
    const outline = await page.evaluate(() => {
      const read = (element) =>
        element === null ? null : Number.parseFloat(getComputedStyle(element).paddingInlineStart);
      return {
        chapter: read(document.querySelector('.nf-tree-chapter-row')),
        block: read(document.querySelector('.nf-tree-row[data-block-id]')),
      };
    });
    assert.equal(outline.chapter, measured.rootFolder, 'folder depth 1 equals the chapter row');
    assert.equal(outline.block, measured.depth2Document, 'a depth-2 row equals a top-level block');
  });
});
