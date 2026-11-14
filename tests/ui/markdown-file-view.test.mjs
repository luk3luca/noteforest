import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';

/**
 * M1 Markdown guest-file surface: open from the flat library root and from
 * File → Open Markdown…, render the declared GFM subset through the flat
 * editor, Continuous Edit/Read, a clear Markdown badge, no forest/Page/PDF
 * chrome, confined local images with remote placeholders, explicit dirty state,
 * and session restore by path. M1 never writes the file (that is M2).
 */

const tempRoot = artifactsPath('markdown-file-temp');
const screenshotDir = artifactsPath('markdown-file');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const FIXTURE = `---
title: Guest fixture
owner: Luca
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

function state() {
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

async function libraryPath() {
  return join(tempRoot, 'library');
}

async function fixturePath() {
  return join(await libraryPath(), 'fixture.md');
}

async function otherPath() {
  return join(tempRoot, 'outside', 'other.md');
}

async function writeFixtures() {
  const library = await libraryPath();
  await mkdir(library, { recursive: true });
  await writeFile(await fixturePath(), FIXTURE);
  const canvas = createCanvas(320, 120);
  const context = canvas.getContext('2d');
  context.fillStyle = '#2f6f5e';
  context.fillRect(0, 0, 320, 120);
  context.fillStyle = '#e8f1ec';
  context.fillRect(24, 24, 272, 72);
  await writeFile(join(library, 'pic.png'), canvas.toBuffer('image/png'));
  await mkdir(join(tempRoot, 'outside'), { recursive: true });
  await writeFile(await otherPath(), '# Other file\n\nOpened from File → Open Markdown…\n');
}

async function launch(name, env) {
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

describe('Markdown file view M1', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(screenshotDir, { recursive: true });
    await writeFixtures();
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('opens from the flat library, renders the subset, and has no forest or Page chrome', async () => {
    const env = ui.isolated('markdown');
    await mkdir(env.NOTEFOREST_LIBRARY, { recursive: true });
    await writeFile(join(env.NOTEFOREST_LIBRARY, 'fixture.md'), FIXTURE);
    await writeFile(
      join(env.NOTEFOREST_LIBRARY, 'pic.png'),
      await readFile(join(await libraryPath(), 'pic.png')),
    );

    await launch('markdown', env);
    const mdPath = join(env.NOTEFOREST_LIBRARY, 'fixture.md');
    const fileMenu = await h.app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu()?.items.find((item) => item.label === 'File');
      return file?.submenu?.items.map((item) => item.label) ?? [];
    });
    assert.ok(fileMenu.includes('Open Markdown…'), 'File menu has Open Markdown…');

    // The library lists the .md as a file row, not a broken package.
    const row = page.locator('[data-library-document][data-library-kind="markdown"]');
    await row.waitFor({ timeout: 15000 });
    assert.match(await row.innerText(), /fixture\.md/);
    assert.equal(await page.locator('[data-doc-reason]').count(), 0);

    await row.click();
    await waitMarkdownEditor();

    // Tab identity and badge.
    assert.equal(
      await page.evaluate((path) => window.__noteforestTest.state().tabs[0]?.kind, mdPath),
      'markdown',
    );
    assert.match(await page.locator('.nf-tablist [role="tab"]').first().innerText(), /fixture\.md/);
    assert.equal(await page.locator('[data-markdown-badge]').innerText(), 'Markdown file');
    assert.equal(
      await page.locator('.nf-tablist [role="tab"]').first().getAttribute('data-tab-kind'),
      null,
    );
    assert.equal(await page.locator('.nf-tablist [data-tab-kind="markdown"]').count(), 1);

    // Declared subset renders through the reused node views and prose CSS.
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
    assert.match(
      await editor.locator('.nf-code-block').first().innerText(),
      /title: Guest fixture/,
    );
    assert.match(
      await editor.locator('.nf-code-block').nth(1).innerText(),
      /const answer: number = 42;/,
    );
    assert.equal(await editor.locator('table').count(), 1);
    assert.equal(await editor.locator('table th').count(), 3);
    assert.equal(await editor.locator('table td').count(), 3);
    assert.equal(await editor.locator('.katex').count(), 2);
    assert.equal(await editor.locator('hr').count(), 1);

    // The confined local image loads; the remote one is a labelled placeholder.
    const localImage = editor.locator('img.nf-markdown-image-el');
    await localImage.waitFor({ timeout: 15000 });
    await page.waitForFunction(
      () => {
        const image = document.querySelector('.nf-markdown-editor[data-active="true"] img.nf-markdown-image-el');
        return image !== null && image.naturalWidth === 320;
      },
      undefined,
      { timeout: 15000 },
    );
    assert.match(
      await editor.locator('[data-image-state="placeholder"]').innerText(),
      /Remote images are not loaded\./,
    );

    // Raw HTML, MDX, and frontmatter stay visible text/blocks, never executed.
    assert.match(await editor.innerText(), /<div>raw html stays text<\/div>/);
    assert.match(await editor.innerText(), /<Component prop=\{1\} \/>/);
    assert.match(await editor.innerText(), /title: Guest fixture/);
    assert.equal(await editor.locator('script, iframe, style').count(), 0);

    // No forest or Page/PDF chrome.
    assert.equal(await editor.locator('[data-block-card]').count(), 0);
    assert.equal(await editor.locator('[data-chapter-id]').count(), 0);
    assert.equal(await editor.locator('.nf-edge-path').count(), 0);
    assert.equal(await editor.locator('[data-page-counter]').count(), 0);
    assert.equal(await editor.locator('[data-page-export]').count(), 0);
    assert.equal(await editor.locator('[data-view-layout="page"]').count(), 0);
    assert.equal(await page.locator('.nf-markdown-editor[data-active="true"] [data-canvas-action="add-chapter"]').count(), 0);
    assert.equal((await state()).runtimes.length, 0, 'a Markdown file creates no document runtime');

    // The outline tab names the absence instead of faking a tree.
    await ui.showOutline();
    assert.match(
      await page.locator('[data-outline-empty]').innerText(),
      /A Markdown file has no outline\./,
    );

    // No document-settings entry is created for a guest file.
    const settings = await page.evaluate(() => window.__noteforestTest.settings());
    assert.equal(
      settings.documentSettings.some((entry) => entry.packagePath === mdPath),
      false,
    );

    await page.locator('.nf-toolbar').screenshot({
      path: join(screenshotDir, 'tab.png'),
    });

    const setMarkdownScroll = (position) =>
      page.evaluate((where) => {
        const scroller = document.querySelector(
          '.nf-markdown-editor[data-active="true"] .nf-markdown-scroll',
        );
        if (scroller === null) return;
        scroller.scrollTop = where === 'bottom' ? scroller.scrollHeight : 0;
      }, position);

    // Edit, document start: headings, lists, code, table, math, image.
    await setMarkdownScroll('top');
    await settle();
    await page.screenshot({ path: join(screenshotDir, 'edit-top.png') });

    // Edit: type in the sentinel paragraph, dirty state becomes explicit.
    await ui.showLibrary();
    const beforeBytes = await readFile(mdPath, 'utf8');
    const paragraph = editor.locator('p', { hasText: 'EDIT-ME paragraph' });
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' edited in M1');
    await page.waitForFunction(
      () => window.__noteforestTest.state().markdownFiles[0]?.dirty === true,
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await page.locator('[aria-label="Unsaved changes"]').count(), 1);
    assert.match(await page.locator('[data-markdown-status]').innerText(), /Unsaved changes/);
    assert.match(await page.locator('[data-markdown-status]').innerText(), /Not saved to disk yet/);

    // Global ⌘Z/⇧⌘Z route to the flat editor's own history.
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      () =>
        !(document.querySelector('.nf-markdown-editor[data-active="true"]')?.textContent ?? '').includes(
          'edited in M1',
        ),
      undefined,
      { timeout: 10000 },
    );
    await page.keyboard.press('Meta+Shift+z');
    await page.waitForFunction(
      () =>
        (document.querySelector('.nf-markdown-editor[data-active="true"]')?.textContent ?? '').includes(
          'edited in M1',
        ),
      undefined,
      { timeout: 10000 },
    );

    await setMarkdownScroll('bottom');
    await settle();
    await page.screenshot({ path: join(screenshotDir, 'edit-bottom.png') });

    // Read: same content, not editable, no formatting toolbar.
    await page.locator('.nf-markdown-editor[data-active="true"] [data-markdown-mode="read"]').click();
    await page.waitForSelector('.nf-markdown-editor[data-active="true"] [contenteditable="false"]');
    assert.equal(await page.locator('[data-testid="selection-toolbar"]').count(), 0);
    assert.equal(
      await page
        .locator('.nf-markdown-editor[data-active="true"] [data-markdown-mode="read"]')
        .getAttribute('aria-pressed'),
      'true',
    );
    await page.evaluate(() => {
      window.getSelection()?.removeAllRanges();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await setMarkdownScroll('top');
    await settle();
    await setMarkdownScroll('top');
    await settle();
    await page.screenshot({ path: join(screenshotDir, 'read-top.png') });
    await setMarkdownScroll('bottom');
    await settle();
    await page.screenshot({ path: join(screenshotDir, 'read-bottom.png') });
    await setMarkdownScroll('top');
    await settle();

    // M1 never writes: the file bytes are unchanged after Edit and Read.
    assert.equal(await readFile(mdPath, 'utf8'), beforeBytes);

    // A dirty close asks before discarding in-memory edits.
    await page.evaluate(() => window.__noteforestTest.dispatchMenuCommand('close-tab'));
    await page.waitForSelector('[data-markdown-discard]', { timeout: 10000 });
    assert.match(await page.locator('.nf-dialog-title').innerText(), /Close Markdown file\?/);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForSelector('[data-markdown-discard]', { state: 'detached' });
    assert.equal((await state()).tabs.length, 1);

    // File → Open Markdown… opens a path outside the library.
    const other = await otherPath();
    await h.app.evaluate(({ dialog }, chosen) => {
      globalThis.__nfMarkdownDialogCalls = [];
      dialog.showOpenDialog = async (_window, options) => {
        globalThis.__nfMarkdownDialogCalls.push(structuredClone(options));
        return { canceled: false, filePaths: [chosen] };
      };
    }, other);
    await page.evaluate(() =>
      window.__noteforestTest.dispatchMenuCommand('open-markdown'),
    );
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

    // Persist the session, then restore by path on a fresh window.
    await page.evaluate(() => window.__noteforestTest.flushSession());
    await page.evaluate((path) => window.__noteforestTest.activateTab(path), mdPath);
    await settle();
    await page.evaluate(() => window.__noteforestTest.flushSession());
    const session = await readFile(
      join(env.NOTEFOREST_APP_SUPPORT, 'shell-session.json'),
      'utf8',
    );
    assert.match(session, /fixture\.md/);
    assert.match(session, /other\.md/);

    await h.quit();
    page = await ui.launch({ ...env, NOTEFOREST_E2E_HIDDEN: '1' });
    await page.waitForFunction(
      (path) =>
        window.__noteforestTest
          .state()
          .tabs.some((tab) => tab.kind === 'markdown' && tab.packagePath === path),
      mdPath,
      { timeout: 20000 },
    );
    const restored = await state();
    assert.equal(restored.tabs.filter((tab) => tab.kind === 'markdown').length, 2);
    assert.equal(restored.markdownFiles.length, 2);
    // A restored `.md` tab reads the file again; M1 in-memory edits were never
    // written, so the restored source has no "edited in M1" text.
    await activateMarkdownPath(mdPath, false);
    assert.equal(
      await page
        .locator('.nf-markdown-editor[data-active="true"] [data-markdown-mode="read"]')
        .getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.locator('.nf-markdown-editor[data-active="true"] h1').innerText(),
      'Markdown fixture',
    );
    assert.equal(
      (await page.locator('.nf-markdown-editor[data-active="true"]').innerText()).includes(
        'edited in M1',
      ),
      false,
    );
    assert.equal(
      (await page.locator('.nf-markdown-editor[data-active="true"]').innerText()).includes(
        'title: Guest fixture',
      ),
      true,
    );
  });
});
