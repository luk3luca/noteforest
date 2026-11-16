import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { artifactsPath, waitUntil } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';

/**
 * M1 + M2 Markdown guest-file surface.
 *
 * M1: open from the flat library and File → Open Markdown…, render the declared
 * GFM subset, Continuous Edit/Read, a clear Markdown badge, no forest/Page/PDF
 * chrome, confined local images, session restore.
 *
 * M2: autosave + ⌘S with an atomic write and one app-support previous copy
 * (never a `.md.bak` in the vault); verbatim read-only
 * frontmatter; external-change Reload/Overwrite/Cancel with no silent overwrite;
 * missing-file state with no recreate; the 2 MB read-only guard; the same dirty
 * close prompt as notes; rich copy/paste into a NoteForest note; and the
 * "Branch from term" action hidden in a guest-file formula.
 */

const tempRoot = artifactsPath('markdown-file-temp');
const screenshotDir = artifactsPath('markdown-file');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const FIXTURE = `---
title: "Guest: fixture # not a comment"
owner: 'Luca'
# a real YAML comment
tags: [markdown, guest]
ratio: 3:14
---

# Markdown fixture

## Overview

A paragraph with **bold**, *italic*, ~~strike~~, \`inline code\`, and a [link](https://example.com).

EDIT-ME paragraph: type here.

###### Heading six

### Lists

- first bullet
  - nested bullet
- second bullet

1. first ordered
2. second ordered

> A quoted line.

### Code

\`\`\`ts
const answer: number = 42;
\`\`\`

### Table

| Left | Center | Right |
| :--- | :---: | ---: |
| a | b | c |

### Math

Inline $x^2 + y^2$ formula.

$$
a^2 + b^2 = c^2
$$

---

![A local fixture image](pic.png)

![Remote fixture](https://example.com/remote.png)

<div>raw html stays text</div>

<Component prop={1} />
`;

const FRONTMATTER_PREFIX = `---
title: "Guest: fixture # not a comment"
owner: 'Luca'
# a real YAML comment
tags: [markdown, guest]
ratio: 3:14
---
`;

async function state() {
  return page.evaluate(() => window.__noteforestTest.state());
}

async function settle() {
  await page.evaluate(
    () =>
      new Promise((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
      }),
  );
}

async function writeFixtures(env) {
  const library = env.NOTEFOREST_LIBRARY;
  await mkdir(library, { recursive: true });
  await writeFile(join(library, 'fixture.md'), FIXTURE);
  const canvas = createCanvas(320, 120);
  const context = canvas.getContext('2d');
  context.fillStyle = '#2f6f5e';
  context.fillRect(0, 0, 320, 120);
  context.fillStyle = '#e8f1ec';
  context.fillRect(24, 24, 272, 72);
  await writeFile(join(library, 'pic.png'), canvas.toBuffer('image/png'));
}

async function launch(env) {
  await writeFixtures(env);
  page = await ui.launch({ ...env, NOTEFOREST_E2E_HIDDEN: '0' });
  await h.setWindowSize(1440, 900);
}

async function waitMarkdownEditor(requireEditable = true) {
  await page.waitForSelector('.nf-markdown-editor[data-active="true"]', {
    timeout: 20000,
  });
  if (requireEditable) {
    await page.waitForSelector(
      '.nf-markdown-editor[data-active="true"] [contenteditable="true"]',
      { timeout: 20000 },
    );
  }
}

async function activateMarkdownPath(path, requireEditable = true) {
  await page.evaluate((target) => window.__noteforestTest.activateTab(target), path);
  await page.waitForFunction(
    (target) => window.__noteforestTest.state().activeTab === target,
    path,
    { timeout: 10000 },
  );
  await waitMarkdownEditor(requireEditable);
}

/** The one previous copy lives in app support, keyed by the canonical path. */
async function backupPaths(env, filePath) {
  const real = await realpath(filePath);
  const directory = join(
    env.NOTEFOREST_APP_SUPPORT,
    'backups',
    'markdown',
    createHash('sha256').update(real).digest('hex'),
  );
  return { directory, previous: join(directory, 'previous.md'), meta: join(directory, 'meta.json') };
}

async function openFixtureFromLibrary() {
  const row = page.locator('[data-library-document][data-library-kind="markdown"]', {
    hasText: 'fixture.md',
  });
  await row.waitFor({ timeout: 15000 });
  await row.click();
  await waitMarkdownEditor();
}

async function dispatch(command) {
  await page.evaluate((value) => window.__noteforestTest.dispatchMenuCommand(value), command);
}

/** The same product save action without the 120 ms menu-command throttle. */
async function saveNow() {
  await page.evaluate(() => window.__noteforestTest.saveNow());
}

async function waitFile(path, needle, present = true) {
  return waitUntil(
    async () => {
      try {
        const bytes = await readFile(path, 'utf8');
        return present ? bytes.includes(needle) : !bytes.includes(needle);
      } catch {
        return present ? false : true;
      }
    },
    `file ${present ? 'contains' : 'lacks'} ${needle}`,
    10000,
  );
}

async function waitMarkdownState(path, predicate) {
  await page.waitForFunction(
    ({ target, check }) => {
      const file = window.__noteforestTest
        .state()
        .markdownFiles.find((entry) => entry.path === target);
      if (file === undefined) return false;
      if (check.dirty !== undefined && file.dirty !== check.dirty) return false;
      if (check.missing !== undefined && file.missing !== check.missing) return false;
      if (check.conflict !== undefined && file.conflict !== check.conflict) return false;
      return true;
    },
    { target: path, check: predicate },
    { timeout: 10000 },
  );
}

async function noteContentSummary() {
  return page.evaluate(() => {
    const structure = window.__noteforestTest.structure();
    const types = {};
    const markedText = [];
    const texts = [];
    const walk = (node) => {
      if (node === null || typeof node !== 'object') return;
      if (typeof node.type === 'string') types[node.type] = (types[node.type] ?? 0) + 1;
      if (typeof node.text === 'string') {
        texts.push(node.text);
        const marks = (node.marks ?? []).map((mark) => mark.type);
        if (marks.length > 0) markedText.push({ text: node.text, marks });
      }
      for (const child of node.children ?? []) walk(child);
    };
    for (const block of Object.values(structure.blocks)) walk(block.content);
    return { types, markedText, text: texts.join(' ') };
  });
}

describe('Markdown file view', () => {
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

  it('opens, renders the subset, keeps frontmatter read-only, and hides the branch action', async () => {
    const env = ui.isolated('markdown-render');
    await launch(env);
    const mdPath = join(env.NOTEFOREST_LIBRARY, 'fixture.md');

    const fileMenu = await h.app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu()?.items.find((item) => item.label === 'File');
      return file?.submenu?.items.map((item) => item.label) ?? [];
    });
    assert.ok(fileMenu.includes('Open Markdown…'), 'File menu has Open Markdown…');

    await openFixtureFromLibrary();

    // Tab identity and badge.
    assert.equal(
      (await state()).tabs.find((tab) => tab.packagePath === mdPath)?.kind,
      'markdown',
    );
    assert.equal(await page.locator('[data-markdown-badge]').innerText(), 'Markdown file');

    // The declared subset renders through the reused node views.
    const editor = page.locator('.nf-markdown-editor[data-active="true"]');
    assert.equal(await editor.locator('h1').innerText(), 'Markdown fixture');
    assert.equal(await editor.locator('h2').innerText(), 'Overview');
    assert.equal(await editor.locator('h6').innerText(), 'Heading six');
    assert.ok((await editor.locator('strong').count()) >= 1);
    assert.ok((await editor.locator('em').count()) >= 1);
    assert.ok((await editor.locator('s').count()) >= 1);
    assert.ok((await editor.locator('code').count()) >= 2);
    assert.ok((await editor.locator('a[href="https://example.com"]').count()) >= 1);
    assert.equal(await editor.locator('ul ul li').count(), 1);
    assert.equal(await editor.locator('ol li').count(), 2);
    assert.equal(await editor.locator('blockquote').count(), 1);
    assert.equal(await editor.locator('table').count(), 1);
    assert.equal(await editor.locator('table th').count(), 3);
    assert.equal(await editor.locator('table td').count(), 3);
    assert.equal(await editor.locator('.katex').count(), 2);
    assert.equal(await editor.locator('hr').count(), 1);

    // Frontmatter: a labelled read-only block, not an editable YAML fence.
    const frontmatter = editor.locator('[data-markdown-frontmatter]');
    assert.equal(await frontmatter.count(), 1);
    assert.match(
      await frontmatter.locator('.nf-markdown-frontmatter-label').innerText(),
      /FRONTMATTER/i,
    );
    assert.equal(
      await frontmatter.locator('.nf-markdown-frontmatter-body').textContent(),
      FRONTMATTER_PREFIX,
    );
    assert.equal(
      await frontmatter.locator('.nf-markdown-frontmatter-body').evaluate((element) =>
        element.closest('[data-markdown-frontmatter]')?.getAttribute('contenteditable'),
      ),
      'false',
    );
    assert.match(await editor.locator('.nf-code-block').first().innerText(), /const answer/);
    // The flat guest editor must use the same hljs token colours as Continuous:
    // a highlighted keyword must exist and differ from the code block text.
    const codeColours = await editor.locator('.nf-code-block').first().evaluate((block) => {
      const keyword = block.querySelector('.hljs-keyword');
      return keyword === null
        ? null
        : {
            keyword: getComputedStyle(keyword).color,
            text: getComputedStyle(block).color,
          };
    });
    assert.ok(codeColours !== null, 'the Markdown code block is highlighted');
    assert.notEqual(codeColours.keyword, codeColours.text, 'the keyword is coloured');

    // Local image loads; the remote image is a labelled placeholder.
    const localImage = editor.locator('img.nf-markdown-image-el');
    await localImage.waitFor({ timeout: 15000 });
    await page.waitForFunction(
      () => {
        const image = document.querySelector(
          '.nf-markdown-editor[data-active="true"] img.nf-markdown-image-el',
        );
        return image !== null && image.naturalWidth === 320;
      },
      undefined,
      { timeout: 15000 },
    );
    assert.match(
      await editor.locator('[data-image-state="placeholder"]').innerText(),
      /Remote images are not loaded\./,
    );

    // Raw HTML/MDX stay visible text; no forest or Page/PDF chrome.
    assert.match(await editor.innerText(), /<div>raw html stays text<\/div>/);
    assert.match(await editor.innerText(), /<Component prop=\{1\} \/>/);
    assert.equal(await editor.locator('script, iframe, style').count(), 0);
    assert.equal(await editor.locator('[data-block-card]').count(), 0);
    assert.equal(await editor.locator('[data-chapter-id]').count(), 0);
    assert.equal(await editor.locator('.nf-edge-path').count(), 0);
    assert.equal(await editor.locator('[data-page-counter]').count(), 0);
    assert.equal(await editor.locator('[data-page-export]').count(), 0);
    assert.equal(await editor.locator('[data-view-layout="page"]').count(), 0);
    assert.equal((await state()).runtimes.length, 0);

    // A guest-file formula hides "Branch from term" (no blocks or anchors).
    const blockMath = editor.locator('[data-type="block-math"]').first();
    await blockMath.dblclick();
    await page.waitForSelector('[data-formula-actions="true"]');
    assert.equal(
      await page.locator('[data-testid="branch-from-term"]').count(),
      0,
      'a Markdown formula has no dead branch control',
    );
    assert.equal(
      await page.locator('[data-formula-actions="true"][data-formula-no-branch="true"]').count(),
      1,
    );
    assert.ok((await page.locator('[data-testid="copy-formula"]').count()) >= 1);
    await page.keyboard.press('Escape');

    const settings = await page.evaluate(() => window.__noteforestTest.settings());
    assert.equal(
      settings.documentSettings.some((entry) => entry.packagePath === mdPath),
      false,
    );

    const setMarkdownScroll = (position) =>
      page.evaluate((where) => {
        const scroller = document.querySelector(
          '.nf-markdown-editor[data-active="true"] .nf-markdown-scroll',
        );
        if (scroller === null) return;
        scroller.scrollTop = where === 'bottom' ? scroller.scrollHeight : 0;
      }, position);

    await setMarkdownScroll('top');
    await settle();
    await page.screenshot({ path: join(screenshotDir, 'frontmatter-readonly.png') });
    await page.locator('.nf-toolbar').screenshot({ path: join(screenshotDir, 'tab.png') });

    // File → Open Markdown… still opens an outside path (M1 regression guard).
    const outsideDir = join(tempRoot, 'outside');
    await mkdir(outsideDir, { recursive: true });
    const other = join(outsideDir, 'other.md');
    await writeFile(other, '# Other file\n\nOpened from File → Open Markdown…\n');
    await h.app.evaluate(({ dialog }, chosen) => {
      globalThis.__nfMarkdownDialogCalls = [];
      dialog.showOpenDialog = async (_window, options) => {
        globalThis.__nfMarkdownDialogCalls.push(structuredClone(options));
        return { canceled: false, filePaths: [chosen] };
      };
    }, other);
    await dispatch('open-markdown');
    await page.waitForFunction(
      (path) =>
        window.__noteforestTest
          .state()
          .tabs.some((tab) => tab.kind === 'markdown' && tab.packagePath === path),
      other,
      { timeout: 15000 },
    );
    await waitMarkdownEditor();
    assert.equal(
      await page.locator('.nf-markdown-editor[data-active="true"] h1').innerText(),
      'Other file',
    );
    const calls = await h.app.evaluate(() => globalThis.__nfMarkdownDialogCalls ?? []);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].filters?.[0]?.extensions?.includes('md'), true);
  });

  it('autosaves and ⌘S atomically, keeps one app-support copy, never writes in Read, and prompts on close/quit', async () => {
    const env = ui.isolated('markdown-save');
    await launch(env);
    const mdPath = join(env.NOTEFOREST_LIBRARY, 'fixture.md');
    const original = await readFile(mdPath, 'utf8');

    await openFixtureFromLibrary();
    const editor = page.locator('.nf-markdown-editor[data-active="true"]');

    const backup = await backupPaths(env, mdPath);

    // First save is manual: the previous bytes become the app-support copy.
    const paragraph = editor.locator('p', { hasText: 'EDIT-ME paragraph' });
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' ALPHA');
    await dispatch('save');
    await waitFile(mdPath, 'EDIT-ME paragraph: type here. ALPHA');
    await waitMarkdownState(mdPath, { dirty: false });
    assert.equal(await readFile(backup.previous, 'utf8'), original);
    // The vault never gets a `.md.bak`.
    await assert.rejects(stat(`${mdPath}.bak`));
    const meta = JSON.parse(await readFile(backup.meta, 'utf8'));
    assert.equal(meta.path, await realpath(mdPath));
    assert.equal(meta.size, Buffer.byteLength(original, 'utf8'));
    assert.equal(meta.hash, createHash('sha256').update(original, 'utf8').digest('hex'));
    assert.match(await page.locator('[data-markdown-status]').innerText(), /Saved/);

    // Second save is the 700 ms autosave: the backup now holds the first save.
    const firstSave = await readFile(mdPath, 'utf8');
    await page.keyboard.press('End');
    await page.keyboard.type(' BETA');
    await waitFile(mdPath, 'BETA');
    await waitMarkdownState(mdPath, { dirty: false });
    assert.equal(await readFile(backup.previous, 'utf8'), firstSave);
    await page.screenshot({ path: join(screenshotDir, 'save-state.png') });

    // Read mode is not editable and a save command never touches the file.
    const savedBytes = await readFile(mdPath, 'utf8');
    const savedMtime = (await stat(mdPath)).mtimeMs;
    await editor.locator('[data-markdown-mode="read"]').click();
    await page.waitForSelector('.nf-markdown-editor[data-active="true"] [contenteditable="false"]');
    await dispatch('save');
    await settle();
    assert.equal(await readFile(mdPath, 'utf8'), savedBytes);
    assert.equal((await stat(mdPath)).mtimeMs, savedMtime);
    assert.equal(await page.locator('[data-testid="selection-toolbar"]').count(), 0);

    // A dirty tab asks Save / Don't Save / Cancel like a note.
    await editor.locator('[data-markdown-mode="edit"]').click();
    await page.waitForSelector('.nf-markdown-editor[data-active="true"] [contenteditable="true"]');
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' GAMMA');
    await waitMarkdownState(mdPath, { dirty: true });
    await dispatch('close-tab');
    await page.waitForSelector('[data-markdown-close-save]', { timeout: 10000 });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForSelector('[data-markdown-close-save]', { state: 'detached' });
    assert.equal((await state()).tabs.length, 1);
    // The tab close button is the same user path without the menu-command
    // throttle (two dispatches inside 120 ms would drop the second one).
    await page.locator('.nf-tab-close').first().click();
    await page.waitForSelector('[data-markdown-close-discard]', { timeout: 10000 });
    await page.locator('[data-markdown-close-discard]').click();
    await page.waitForFunction(() => window.__noteforestTest.state().tabs.length === 0);
    assert.equal((await readFile(mdPath, 'utf8')).includes('GAMMA'), false);

    // Reopening reads the saved bytes, not the discarded local edits.
    await openFixtureFromLibrary();
    assert.equal(
      (await page.locator('.nf-markdown-editor[data-active="true"]').innerText()).includes('BETA'),
      true,
    );

    // A dirty quit participates in the shared flush: the E2E close branch asks
    // the renderer for the atomic saves before the window closes.
    const reopened = page.locator('.nf-markdown-editor[data-active="true"]');
    await reopened.locator('p', { hasText: 'EDIT-ME paragraph' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' DELTA');
    await waitMarkdownState(mdPath, { dirty: true });
    await h.quit();
    page = await ui.launch({ ...env, NOTEFOREST_E2E_HIDDEN: '1' });
    await waitFile(mdPath, 'DELTA');
    await page.waitForFunction(
      (path) =>
        window.__noteforestTest
          .state()
          .tabs.some((tab) => tab.kind === 'markdown' && tab.packagePath === path),
      mdPath,
      { timeout: 20000 },
    );
    await activateMarkdownPath(mdPath, false);
    assert.match(
      await page.locator('.nf-markdown-editor[data-active="true"]').innerText(),
      /DELTA/,
    );
  });

  it('never silently overwrites an external change; Reload and Overwrite are explicit; a deleted file stays missing', async () => {
    const env = ui.isolated('markdown-conflict');
    await launch(env);
    const mdPath = join(env.NOTEFOREST_LIBRARY, 'fixture.md');
    const backup = await backupPaths(env, mdPath);
    await openFixtureFromLibrary();
    const editor = page.locator('.nf-markdown-editor[data-active="true"]');

    // External write, then a local edit + save: the dialog must appear.
    await writeFile(mdPath, '# External change\n\nSomeone else edited this.\n');
    const externalBytes = await readFile(mdPath, 'utf8');
    const paragraph = editor.locator('p', { hasText: 'EDIT-ME paragraph' });
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' local');
    await dispatch('save');
    await page.waitForSelector('[data-markdown-conflict-overwrite]', { timeout: 10000 });
    assert.match(await page.locator('.nf-dialog-title').innerText(), /changed on disk/);
    assert.equal(
      await page.locator('.nf-dialog-description').innerText(),
      'Another app wrote this file. Nothing has been overwritten.',
    );
    assert.equal(
      await page.locator('.nf-settings-help').innerText(),
      'Reload discards your edits. Overwrite keeps a backup of the version on disk.',
    );
    assert.equal(
      await page.locator('[data-details] summary').innerText(),
      'Details',
      'the path lives in one Details disclosure',
    );
    assert.equal(await page.locator('[data-details-value]').textContent(), mdPath);
    assert.match(
      await page.evaluate(() => document.activeElement?.textContent ?? ''),
      /Cancel/,
      'a danger primary never takes the default focus',
    );
    assert.equal(await readFile(mdPath, 'utf8'), externalBytes);
    await page.screenshot({ path: join(screenshotDir, 'conflict.png') });

    // Cancel writes nothing and leaves the conflict flagged.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await waitMarkdownState(mdPath, { conflict: true });
    assert.match(await page.locator('[data-markdown-status]').innerText(), /External change/);
    assert.equal(await readFile(mdPath, 'utf8'), externalBytes);

    // Reload discards the local edit and shows the external version.
    await saveNow();
    await page.waitForSelector('[data-markdown-conflict-reload]', { timeout: 10000 });
    await page.locator('[data-markdown-conflict-reload]').click();
    await page.waitForFunction(
      (path) => {
        const file = window.__noteforestTest
          .state()
          .markdownFiles.find((entry) => entry.path === path);
        return file?.dirty === false && file?.conflict === false;
      },
      mdPath,
      { timeout: 10000 },
    );
    assert.equal(
      await page.locator('.nf-markdown-editor[data-active="true"] h1').innerText(),
      'External change',
    );

    // Local edit + second external write; Overwrite keeps the local content and
    // stores the external bytes in the single app-support copy.
    const heading = page.locator('.nf-markdown-editor[data-active="true"] h1');
    await heading.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' local');
    await writeFile(mdPath, '# External again\n');
    await saveNow();
    await page.waitForSelector('[data-markdown-conflict-overwrite]', { timeout: 10000 });
    await page.locator('[data-markdown-conflict-overwrite]').click();
    await waitMarkdownState(mdPath, { dirty: false, conflict: false });
    assert.match(await readFile(mdPath, 'utf8'), /^# External change local/);
    assert.equal(await readFile(backup.previous, 'utf8'), '# External again\n');
    await assert.rejects(stat(`${mdPath}.bak`));

    // External delete: the tab is missing, nothing is recreated.
    await rm(mdPath);
    await heading.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' more');
    await saveNow();
    await page.waitForSelector('[data-markdown-missing]', { timeout: 10000 });
    await waitMarkdownState(mdPath, { missing: true });
    assert.equal(
      (await state()).tabs.find((tab) => tab.packagePath === mdPath)?.missing,
      true,
    );
    await assert.rejects(stat(mdPath));

    // Clean up through the same close prompt (Don't Save).
    await page.locator('.nf-tab-close').first().click();
    await page.waitForSelector('[data-markdown-close-discard]', { timeout: 10000 });
    await page.locator('[data-markdown-close-discard]').click();
    await page.waitForFunction(() => window.__noteforestTest.state().tabs.length === 0);
  });

  it('opens a >2 MB file read-only with a message and never writes it', async () => {
    const env = ui.isolated('markdown-large');
    await mkdir(env.NOTEFOREST_LIBRARY, { recursive: true });
    const largePath = join(env.NOTEFOREST_LIBRARY, 'large.md');
    const largeSource = `# Large guest\n\n${'x'.repeat(2 * 1024 * 1024 + 4096)}\n`;
    await writeFile(largePath, largeSource);
    const bytes = await readFile(largePath);
    page = await ui.launch({ ...env, NOTEFOREST_E2E_HIDDEN: '0' });
    await h.setWindowSize(1440, 900);

    const row = page.locator('[data-library-document][data-library-kind="markdown"]', {
      hasText: 'large.md',
    });
    await row.waitFor({ timeout: 15000 });
    await row.click();
    await waitMarkdownEditor(false);

    await page.waitForSelector('[data-markdown-too-large]', { timeout: 10000 });
    assert.match(await page.locator('[data-markdown-too-large]').innerText(), /2 MB/);
    assert.match(
      await page.locator('[data-markdown-too-large]').innerText(),
      /not opened here/,
    );
    assert.match(await page.locator('[data-markdown-status]').innerText(), /Read-only/);
    assert.equal(
      await page
        .locator('.nf-markdown-editor[data-active="true"] [data-markdown-mode="edit"]')
        .isDisabled(),
      true,
    );
    // The body is not parsed or rendered at all; no contenteditable editor.
    assert.equal(
      await page.locator('.nf-markdown-editor[data-active="true"] [contenteditable="true"]').count(),
      0,
    );
    await page.screenshot({ path: join(screenshotDir, 'large-readonly.png') });

    // A save command and a mode click never write the large file.
    await dispatch('save');
    await page
      .locator('.nf-markdown-editor[data-active="true"] [data-markdown-mode="edit"]')
      .click({ force: true });
    await settle();
    assert.deepEqual(await readFile(largePath), bytes);
    await assert.rejects(stat(`${largePath}.bak`));
    await assert.rejects(stat((await backupPaths(env, largePath)).previous));
  });

  it('copies a paragraph, table, formula, and code into a note as rich nodes', async () => {
    const env = ui.isolated('markdown-copy');
    await launch(env);
    await ui.seedDemo();
    const mdPath = join(env.NOTEFOREST_LIBRARY, 'fixture.md');
    await openFixtureFromLibrary();
    const note = (await state()).runtimes[0];
    assert.ok(note, 'the seeded note runtime is open');

    async function pasteIntoNote(kind, expected, canonical = expected) {
      const selected = await page.evaluate(
        ({ path, nodeKind }) => window.__noteforestTest.markdownSelect(path, nodeKind),
        { path: mdPath, nodeKind: kind },
      );
      assert.ok(selected, `selection for ${kind}`);
      await page.keyboard.press('Meta+c');
      const clipboard = await h.clipboardText();
      if (kind === 'paragraph' || kind === 'table' || kind === 'codeBlock') {
        assert.ok(clipboard.length > 0, `${kind} reached the clipboard`);
      }

      await page.evaluate((path) => window.__noteforestTest.activateTab(path), note.packagePath);
      await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
      const targetCard = page.locator('.nf-editor[data-active="true"] [data-block-card]').first();
      await targetCard.locator('p').first().click();
      await page.keyboard.press('End');
      await page.keyboard.press('Meta+v');

      // The live editor is the immediate source of truth; the canonical
      // document follows through the note's own save/commit path.
      await page.waitForFunction(
        (expectedType) => {
          const runtimes = window.__noteforestTest.editorJson();
          const types = {};
          const walk = (node) => {
            if (node === null || typeof node !== 'object') return;
            if (typeof node.type === 'string') types[node.type] = (types[node.type] ?? 0) + 1;
            for (const mark of node.marks ?? []) {
              if (typeof mark.type === 'string') types[mark.type] = (types[mark.type] ?? 0) + 1;
            }
            for (const child of node.content ?? []) walk(child);
          };
          for (const runtime of runtimes) walk(runtime.json);
          return (types[expectedType] ?? 0) > 0;
        },
        expected,
        { timeout: 10000 },
      );
      await h.waitSaved();
      await page.waitForFunction(
        (expectedType) => {
          const structure = window.__noteforestTest.structure();
          const types = {};
          const walk = (node) => {
            if (node === null || typeof node !== 'object') return;
            if (typeof node.type === 'string') types[node.type] = (types[node.type] ?? 0) + 1;
            for (const mark of node.marks ?? []) {
              if (typeof mark.type === 'string') types[mark.type] = (types[mark.type] ?? 0) + 1;
            }
            for (const child of node.children ?? []) walk(child);
          };
          for (const block of Object.values(structure.blocks)) walk(block.content);
          return (types[expectedType] ?? 0) > 0;
        },
        canonical,
        { timeout: 10000 },
      );
    }

    await pasteIntoNote('paragraph', 'bold');
    await activateMarkdownPath(mdPath);
    await pasteIntoNote('table', 'table');
    await activateMarkdownPath(mdPath);
    await pasteIntoNote('inlineMath', 'inlineMath');
    await activateMarkdownPath(mdPath);
    await pasteIntoNote('blockMath', 'blockMath', 'mathBlock');
    await activateMarkdownPath(mdPath);
    await pasteIntoNote('codeBlock', 'codeBlock');

    const summary = await noteContentSummary();
    assert.ok((summary.types['table'] ?? 0) >= 1, 'a table node survived the paste');
    assert.ok((summary.types['inlineMath'] ?? 0) >= 1, 'an inline formula survived');
    assert.ok((summary.types['mathBlock'] ?? 0) >= 1, 'a block formula survived');
    assert.ok((summary.types['codeBlock'] ?? 0) >= 1, 'a code block survived');
    assert.match(summary.text, /const answer: number = 42;/);
    const marks = new Set(summary.markedText.flatMap((entry) => entry.marks));
    for (const mark of ['bold', 'italic', 'strike', 'code', 'link']) {
      assert.ok(marks.has(mark), `the ${mark} mark survived`);
    }
    await page.screenshot({ path: join(screenshotDir, 'copy-paste-note.png') });
  });
});
