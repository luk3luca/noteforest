import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, pngSize, root } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  imageBlock,
  pageDocument,
  longDocument,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';


const tempRoot = artifactsPath('m4b1b1-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(name) {
  page = await ui.launch(ui.isolated(name));
  await h.setWindowSize(1440, 900);
}

async function openPackage(env, name, document, assetFiles = {}) {
  const packagePath = await writePagePackage(
    env.NOTEFOREST_LIBRARY,
    name,
    document,
    assetFiles,
  );
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
  await page.waitForSelector('.nf-editor[data-active="true"]');
  return packagePath;
}

function activePageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

function activeSheet() {
  return activePageView().locator('.nf-page-sheet').first();
}

function overlay() {
  return page.locator('.nf-editor[data-active="true"] [data-page-edit-overlay]');
}

function fragmentFor(blockId) {
  return activePageView().locator(`.nf-page-fragment[data-fragment-block="${blockId}"]`);
}

async function waitPageReady(expectedCount) {
  await page.waitForFunction(
    (count) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      if (view === null) return false;
      if (view.getAttribute('data-ready') !== 'true') return false;
      if (view.getAttribute('data-updating') === 'true') return false;
      if (count !== null && Number(view.getAttribute('data-page-count')) !== count) return false;
      return true;
    },
    expectedCount ?? null,
    { timeout: 30000 },
  );
}

async function showPageRead() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
  await ui.ensureInteractionMode('read');
}

async function enterPageEdit() {
  if ((await viewState()).interactionMode !== 'edit') {
    await page.keyboard.press('Meta+e');
  }
  await page.waitForFunction(
    () => window.__noteforestTest.viewState()[window.__noteforestTest.state().activeTab]?.interactionMode === 'edit',
    undefined,
    { timeout: 5000 },
  );
  await page.waitForFunction(
    () => document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-interaction-mode') === 'edit',
    undefined,
    { timeout: 5000 },
  );
}

async function viewState() {
  const path = (await h.state()).activeTab;
  return (await page.evaluate(() => window.__noteforestTest.viewState()))[path] ?? {};
}

async function runtimeContent(blockId) {
  return (await ui.structure()).blocks[blockId]?.content;
}

async function waitOverlayClosed() {
  await page.waitForSelector('.nf-editor[data-active="true"] [data-page-edit-overlay]', {
    state: 'detached',
    timeout: 10000,
  });
}

async function openOverlay(blockId) {
  const fragment = fragmentFor(blockId).first();
  await fragment.waitFor();
  await fragment.dblclick();
  await overlay().waitFor({ timeout: 5000 });
  await page.waitForFunction(
    () => document.activeElement?.closest('[data-page-edit-overlay]') !== null,
    undefined,
    { timeout: 5000 },
  );
}

async function typeInOverlay(text) {
  await overlay().locator('.nf-page-edit-prose').click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
  await page.waitForFunction(
    (expected) => document.querySelector('[data-page-edit-overlay]')?.textContent?.includes(expected),
    text,
    { timeout: 5000 },
  );
}

function findNode(content, predicate) {
  if (predicate(content)) return content;
  for (const child of content.children ?? []) {
    const found = findNode(child, predicate);
    if (found !== null) return found;
  }
  return null;
}

function fragmentIdsOnPage() {
  return activePageView()
    .locator('.nf-page-fragment')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-fragment-block')));
}

async function pageModelState() {
  return activePageView().evaluate((element) => ({
    runs: Number(element.getAttribute('data-model-runs') ?? '0'),
    ms: Number(element.getAttribute('data-model-ms') ?? '0'),
    computeMs: Number(element.getAttribute('data-model-compute-ms') ?? '0'),
    calls: Number(element.getAttribute('data-measurement-calls') ?? '0'),
    pageCount: Number(element.getAttribute('data-page-count') ?? '0'),
  }));
}

describe('M4b1b1 Page Edit content overlay', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('toggles Page Edit, opens one overlay, keeps geometry until commit, and closes on click outside', async () => {
    await launch('m4b1b1-basics');
    await ui.seedDemo();
    const packagePath = (await h.state()).activeTab;
    const blockIds = (await h.state()).runtimes[0].blockIds;

    await showPageRead();
    assert.equal((await viewState()).interactionMode, 'read');
    assert.equal(await overlay().count(), 0);
    assert.equal(
      await activePageView().locator('[contenteditable="true"]').count(),
      0,
      'Page Read has no editor',
    );

    await enterPageEdit();
    assert.equal((await viewState()).interactionMode, 'edit');
    assert.equal(
      await page.locator('[data-view-interaction="edit"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await activePageView().locator('[contenteditable="true"]').count(),
      0,
      'Page Edit has no editor until a block is opened',
    );

    const firstId = blockIds[0];
    const originalContent = JSON.stringify(await runtimeContent(firstId));
    const fragment = fragmentFor(firstId).first();
    await fragment.waitFor();
    const before = await fragment.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    const modelBefore = await pageModelState();

    await fragment.dblclick();
    await overlay().waitFor({ timeout: 5000 });
    assert.equal(await overlay().count(), 1, 'one active overlay');
    assert.equal(
      await overlay().getAttribute('data-page-edit-block'),
      firstId,
      'the overlay names the opened block',
    );
    assert.equal(await overlay().getAttribute('role'), 'dialog');
    assert.match((await overlay().getAttribute('aria-label')) ?? '', /^Edit block:/);
    assert.match(await overlay().locator('[data-page-edit-title]').textContent(), /Editing/);
    await page.waitForFunction(
      () => document.activeElement?.closest('[data-page-edit-overlay]') !== null,
      undefined,
      { timeout: 5000 },
    );

    // Typing never touches the canonical document or the page model. A
    // Shift+2 character must reach the editor instead of triggering Fit width.
    await page.keyboard.type(' Page overlay edit. @');
    await page.waitForTimeout(200);
    assert.match(await overlay().textContent(), /Page overlay edit\. @/);
    assert.equal((await viewState()).pageFit, 'page', 'page shortcuts do not steal typing');
    assert.equal((await pageModelState()).runs, modelBefore.runs, 'typing does not re-paginate');
    assert.equal(
      JSON.stringify(await runtimeContent(firstId)),
      originalContent,
      'typing never reaches the canonical document before commit',
    );
    const afterOpen = await fragment.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    assert.deepEqual(afterOpen, before, 'page geometry is unchanged while editing');

    // Local text undo stays inside the overlay and creates no history entry.
    const revisionBeforeUndo = (await h.state()).runtimes[0].revision;
    await page.keyboard.type(' LOCAL');
    assert.match(await overlay().textContent(), /LOCAL/);
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      () => !document.querySelector('[data-page-edit-overlay]')?.textContent?.includes('LOCAL'),
      undefined,
      { timeout: 5000 },
    );
    assert.equal(
      (await h.state()).runtimes[0].revision,
      revisionBeforeUndo,
      'local undo creates no canonical revision',
    );
    assert.equal(await overlay().count(), 1, 'local undo keeps the overlay open');

    // Local undo may undo the whole adjacent typing group; type a fresh marker
    // that the commit assertion owns.
    await page.keyboard.type(' Page overlay edit.');
    assert.match(await overlay().textContent(), /Page overlay edit\./);

    // Click outside commits, then the shared model re-paginates.
    await activePageView().locator('.nf-page-footer').first().click();
    await waitOverlayClosed();
    await page.waitForFunction(
      (id) => {
        const content = window.__noteforestTest.structure()?.blocks?.[id]?.content;
        return JSON.stringify(content).includes('Page overlay edit.');
      },
      firstId,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      (runs) => {
        const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
        return view !== null && Number(view.getAttribute('data-model-runs')) > runs;
      },
      modelBefore.runs,
      { timeout: 30000 },
    );
    await waitPageReady();
    assert.match(await activeSheet().textContent(), /Page overlay edit\./);
    assert.equal(await overlay().count(), 0);
    assert.equal(await activePageView().locator('[contenteditable="true"]').count(), 0);

    // Page Read has no overlay and stays exact.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () => window.__noteforestTest.viewState()[window.__noteforestTest.state().activeTab]?.interactionMode === 'read',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(await overlay().count(), 0);
    assert.equal(await activePageView().locator('[contenteditable="true"]').count(), 0);

    // Enter on a fragment opens the overlay; Esc commits and returns focus.
    await enterPageEdit();
    const ids = await fragmentIdsOnPage();
    assert.ok(ids.length >= 2, 'the demo page has more than one fragment');
    await fragmentFor(ids[0]).first().click();
    await page.keyboard.press('Enter');
    await overlay().waitFor({ timeout: 5000 });
    assert.equal(await overlay().getAttribute('data-page-edit-block'), ids[0]);
    await page.keyboard.press('Escape');
    await waitOverlayClosed();
    await page.waitForFunction(
      (id) => document.activeElement?.getAttribute('data-fragment-block') === id,
      ids[0],
      { timeout: 5000 },
    );

    // Opening another block commits the first and keeps exactly one overlay.
    await openOverlay(ids[0]);
    // Double-click can place the caret at the hit point. Append explicitly so
    // this assertion is independent of the R2b packing geometry.
    await typeInOverlay(' First overlay.');
    const firstText = await overlay().textContent();
    assert.match(firstText, /First overlay\./);
    await fragmentFor(ids[1]).first().dblclick();
    await page.waitForFunction(
      (id) => document.querySelector('[data-page-edit-overlay]')?.getAttribute('data-page-edit-block') === id,
      ids[1],
      { timeout: 10000 },
    );
    assert.equal(await overlay().count(), 1, 'only one overlay can be active');
    await page.waitForFunction(
      (id) => {
        const content = window.__noteforestTest.structure()?.blocks?.[id]?.content;
        return JSON.stringify(content).includes('First overlay.');
      },
      ids[0],
      { timeout: 10000 },
    );

    await page.keyboard.type(' Second overlay.');
    await page.keyboard.press('Meta+Enter');
    await waitOverlayClosed();
    await page.waitForFunction(
      (id) => {
        const content = window.__noteforestTest.structure()?.blocks?.[id]?.content;
        return JSON.stringify(content).includes('Second overlay.');
      },
      ids[1],
      { timeout: 10000 },
    );
    assert.equal(packagePath, (await h.state()).activeTab);
  });

  it('writes bold, list, math, and code with the shared schema and commits as one structural entry', async () => {
    await launch('m4b1b1-formatting');
    await ui.seedDemo();
    const firstId = (await h.state()).runtimes[0].blockIds[0];
    const original = await runtimeContent(firstId);

    await showPageRead();
    await enterPageEdit();
    await openOverlay(firstId);

    await page.keyboard.press('Meta+a');
    await page.keyboard.type('# Page heading ');
    await overlay().locator('h1').waitFor({ timeout: 5000 });

    await page.keyboard.press('Enter');
    await page.keyboard.type('Bold ');
    await page.keyboard.press('Meta+b');
    await page.keyboard.type('strong');
    await page.keyboard.press('Meta+b');
    await page.keyboard.type(' text.');

    await page.keyboard.press('Enter');
    await page.keyboard.type('- list item');
    await page.keyboard.type(' ');
    await overlay().locator('ul li').first().waitFor({ timeout: 5000 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    await page.keyboard.type('$x^2$');
    await page.keyboard.type(' ');
    await overlay().locator('[data-type="inline-math"]').waitFor({ timeout: 5000 });

    await page.keyboard.press('Enter');
    await page.keyboard.type('```');
    await page.keyboard.type(' ');
    await page.keyboard.type('const y = 2;');
    await overlay().locator('pre code').waitFor({ timeout: 5000 });

    await page.keyboard.press('Meta+Enter');
    await waitOverlayClosed();

    const content = await runtimeContent(firstId);
    const children = content.children ?? [];
    const heading = children.find((node) => node.type === 'heading');
    assert.ok(heading !== undefined, 'heading survives the commit');
    assert.equal(heading.attrs?.level, 1);
    const bold = findNode(
      content,
      (node) => node.type === 'text' && node.text === 'strong',
    );
    assert.ok(
      bold?.marks?.some((mark) => mark.type === 'bold'),
      'bold mark survives the commit',
    );
    await waitPageReady();
    assert.ok(
      (await activeSheet().locator('strong').count()) > 0,
      'the page renders the committed bold mark',
    );
    assert.ok(
      children.some((node) => node.type === 'bulletList'),
      'bullet list survives the commit',
    );
    assert.ok(
      JSON.stringify(content).includes('inlineMath'),
      'inline math survives the commit',
    );
    assert.ok(
      children.some(
        (node) => node.type === 'codeBlock' && JSON.stringify(node).includes('const y = 2;'),
      ),
      'code block survives the commit',
    );

    const afterCommit = (await h.state()).runtimes[0];
    assert.equal(afterCommit.lastHistoryOperation, 'structural');
    assert.equal(afterCommit.canUndoStructural, true);

    // One structural entry: a single global undo restores the original block.
    await page.keyboard.press('Meta+2');
    await page.waitForFunction(
      () => window.__noteforestTest.viewState()[window.__noteforestTest.state().activeTab]?.layout === 'continuous',
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      ({ id, expected }) => {
        const content = window.__noteforestTest.structure()?.blocks?.[id]?.content;
        return JSON.stringify(content) === expected;
      },
      { id: firstId, expected: JSON.stringify(original) },
      { timeout: 10000 },
    );
  });

  it('names the cell-conversion reason inside the Page Edit overlay (R3)', async () => {
    const env = ui.isolated('m4b1b1-formula-cell');
    await launch('m4b1b1-formula-cell');
    const cellParagraph = (children) => ({ type: 'paragraph', children });
    const document = pageDocument({
      id: 'page-edit-formula-cell',
      title: 'Page Edit formula cell',
      chapterTitle: 'Tables',
      blocks: [
        {
          id: 'formula-table',
          label: 'Formula table',
          content: {
            type: 'doc',
            children: [
              {
                type: 'table',
                children: [
                  {
                    type: 'tableRow',
                    children: [
                      {
                        type: 'tableHeader',
                        children: [cellParagraph([{ type: 'text', text: 'Term' }])],
                      },
                      {
                        type: 'tableCell',
                        children: [cellParagraph([{ type: 'text', text: 'Value' }])],
                      },
                    ],
                  },
                  {
                    type: 'tableRow',
                    children: [
                      {
                        type: 'tableCell',
                        children: [
                          cellParagraph([
                            { type: 'text', text: 'z = ' },
                            { type: 'inlineMath', attrs: { latex: 'z' } },
                          ]),
                        ],
                      },
                      {
                        type: 'tableCell',
                        children: [cellParagraph([{ type: 'text', text: '1' }])],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    await openPackage(env, 'Page Edit formula cell', document);
    await showPageRead();
    await enterPageEdit();
    await openOverlay('formula-table');

    // Inline → Block inside a cell is rejected. The overlay mounts the node
    // view without editor bindings, so the reason must come from the shared
    // toast helper; a dead click is the bug (R3).
    const cellFormula = overlay().locator('[data-type="inline-math"]').first();
    await cellFormula.waitFor();
    await cellFormula.dblclick();
    // The Page Edit formula source is a viewport-clamped panel mounted on the
    // body (editor chrome), not a child of the page overlay.
    const formulaPanel = page.locator('[data-page-edit-extension="true"]');
    await formulaPanel.locator('[data-formula-source]').waitFor();
    await formulaPanel.locator('[data-testid="toggle-formula-kind"]').click();
    await page
      .locator('[data-sonner-toast]', { hasText: 'stays inline' })
      .first()
      .waitFor({ timeout: 5000 });
    assert.equal(
      await overlay().locator('[data-type="inline-math"]').count(),
      1,
      'the formula inside the cell stays inline',
    );
    assert.equal(
      await overlay().locator('[data-type="block-math"]').count(),
      0,
      'no block formula was inserted into the cell',
    );

    // Done closes the overlay with the rejected conversion unapplied. (The
    // source row is left open on purpose: Escape there also closes the
    // overlay, which would make this assertion depend on event ordering.)
    await overlay().locator('[data-page-edit-done]').click();
    await waitOverlayClosed();
    const content = await runtimeContent('formula-table');
    const serialized = JSON.stringify(content);
    assert.match(serialized, /"type":"inlineMath"/, 'the inline formula survives the commit');
    assert.equal(serialized.includes('mathBlock'), false, 'no block formula was written');
  });

  it('renders images inside the overlay read-only, with no image actions', async () => {
    const env = ui.isolated('m4b1b1-image');
    await launch('m4b1b1-image');
    const source = resolve(root, 'fixtures/assets/forest.png');
    const bytes = await readFile(source);
    const assetId = createHash('sha256').update(bytes).digest('hex');
    const size = await pngSize(source);
    const intro = textBlock('intro', 'Intro', 'Anchored phrase plus image.');
    intro.content.children[0].children = [
      { type: 'text', text: 'Anchored ' },
      {
        type: 'text',
        text: 'phrase',
        marks: [{ type: 'anchor', attrs: { anchorIds: ['anchor-intro'] } }],
      },
      { type: 'text', text: ' plus image.' },
    ];
    const document = pageDocument({
      id: 'page-edit-image',
      title: 'Page Edit image',
      chapterTitle: 'Images',
      blocks: [intro, imageBlock('figure', 'Forest diagram', assetId, 'Forest', size)],
    });
    document.assets[assetId] = {
      id: assetId,
      path: `assets/${assetId}`,
      mime: 'image/png',
      width: size.width,
      height: size.height,
      alt: 'Forest',
    };
    await openPackage(env, 'Page Edit image', document, { [assetId]: source });
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card="figure"]');
    await showPageRead();
    await enterPageEdit();
    await openOverlay('figure');

    const image = overlay().locator(`img[data-asset-id="${assetId}"]`);
    await image.waitFor();
    const loaded = await image.evaluate((element) => ({
      width: element.naturalWidth,
      height: element.naturalHeight,
    }));
    assert.ok(loaded.width > 0 && loaded.height > 0, 'the image decodes in the overlay');
    assert.equal(
      await overlay().locator('[data-image-action]').count(),
      0,
      'image actions are not available in Page Edit',
    );
    assert.equal(
      await overlay().locator('[data-image-authoring-mode]').count(),
      0,
      'image anchor authoring is not available in Page Edit',
    );
    assert.equal(await overlay().locator('[data-missing-asset]').count(), 0);

    await page.keyboard.press('Meta+Enter');
    await waitOverlayClosed();
    const content = await runtimeContent('figure');
    assert.equal(content.children?.[0]?.type, 'image');
    assert.equal(content.children?.[0]?.attrs?.assetId, assetId, 'the asset id survives the commit');

    // Text anchors are semantic marks: an overlay edit keeps them.
    await openOverlay('intro');
    await overlay().locator('[data-anchor-mark="true"][data-anchor-ids="anchor-intro"]').waitFor();
    await typeInOverlay(' Still anchored.');
    await page.keyboard.press('Meta+Enter');
    await waitOverlayClosed();
    const introContent = await runtimeContent('intro');
    assert.match(JSON.stringify(introContent), /Still anchored\./);
    assert.match(JSON.stringify(introContent), /"type":"anchor"/);
    assert.match(JSON.stringify(introContent), /anchor-intro/);
  });

  it('commits on page navigation, mode, layout, and block selection without losing keystrokes', async () => {
    const env = ui.isolated('m4b1b1-paths');
    await launch('m4b1b1-paths');
    await openPackage(env, 'Commit paths', longDocument());
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card="parent"]');
    await showPageRead();
    await enterPageEdit();

    // Esc commits typed text.
    await openOverlay('parent');
    await typeInOverlay(' Esc commit.');
    await page.keyboard.press('Escape');
    await waitOverlayClosed();
    await waitPageReady();
    assert.match(JSON.stringify(await runtimeContent('parent')), /Esc commit\./);

    // Page navigation from the toolbar commits the overlay first.
    await openOverlay('parent');
    await typeInOverlay(' Nav commit.');
    await page.locator('[data-canvas-header] [data-page-nav="next"]').click();
    await page.waitForFunction(
      () => Number(document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-current-page')) === 2,
      undefined,
      { timeout: 10000 },
    );
    assert.match(JSON.stringify(await runtimeContent('parent')), /Nav commit\./);
    assert.equal(await overlay().count(), 0);
    await waitPageReady();

    // Block selection commits the active block.
    await page.locator('[data-canvas-header] [data-page-nav="prev"]').click();
    await page.waitForFunction(
      () => Number(document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-current-page')) === 1,
      undefined,
      { timeout: 10000 },
    );
    await waitPageReady();
    await openOverlay('parent');
    await typeInOverlay(' Selection commit.');
    const childFragment = fragmentFor('child').first();
    await childFragment.waitFor();
    await childFragment.click();
    await waitOverlayClosed();
    await waitPageReady();
    assert.match(JSON.stringify(await runtimeContent('parent')), /Selection commit\./);

    // Mode switch commits first and Page Read has no editor.
    await openOverlay('parent');
    await typeInOverlay(' Mode commit.');
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () => window.__noteforestTest.viewState()[window.__noteforestTest.state().activeTab]?.interactionMode === 'read',
      undefined,
      { timeout: 5000 },
    );
    await waitOverlayClosed();
    await waitPageReady();
    assert.match(JSON.stringify(await runtimeContent('parent')), /Mode commit\./);
    assert.equal(await overlay().count(), 0);

    // Layout switch commits first and returns to Continuous Edit.
    await enterPageEdit();
    await openOverlay('parent');
    await typeInOverlay(' Layout commit.');
    await page.keyboard.press('Meta+2');
    await page.waitForFunction(
      () => {
        const view = window.__noteforestTest.viewState()[window.__noteforestTest.state().activeTab];
        return view?.layout === 'continuous' && view?.interactionMode === 'edit';
      },
      undefined,
      { timeout: 5000 },
    );
    assert.match(JSON.stringify(await runtimeContent('parent')), /Layout commit\./);
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] [data-page-edit-overlay]').count(),
      0,
    );
  });

  it('persists a committed Page Edit block and the Page Edit view state across reload', async () => {
    const env = ui.isolated('m4b1b1-reload');
    await launch('m4b1b1-reload');
    await openPackage(env, 'Reload page edit', longDocument());
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card="parent"]');
    await showPageRead();
    await enterPageEdit();
    await openOverlay('parent');
    await page.keyboard.type(' Reload keeps this sentence.');
    // ⌘S commits the overlay before writing, so the file cannot omit it.
    await page.keyboard.press('Meta+s');
    await waitOverlayClosed();
    await page.waitForFunction(
      () => {
        const content = window.__noteforestTest.structure()?.blocks?.['parent']?.content;
        return JSON.stringify(content).includes('Reload keeps this sentence.');
      },
      undefined,
      { timeout: 10000 },
    );
    await h.waitSaved();
    await h.flushSession();
    await h.quit();

    await launch('m4b1b1-reload');
    await page.waitForFunction(
      () => window.__noteforestTest.state().activeTab !== null,
      undefined,
      { timeout: 10000 },
    );
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
    await waitPageReady();
    assert.equal((await viewState()).layout, 'page');
    assert.equal(
      (await viewState()).interactionMode,
      'edit',
      'explicit Page Edit is restored from the session',
    );
    assert.match(await activeSheet().textContent(), /Reload keeps this sentence\./);
    assert.equal(await overlay().count(), 0, 'reload never restores an open overlay');
  });

  it('opens a spanning block in an unclipped scrollable overlay over the exact page', async () => {
    const env = ui.isolated('m4b1b1-spanning');
    await launch('m4b1b1-spanning');
    await openPackage(env, 'Spanning block', longDocument());
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card="parent"]');
    await showPageRead();
    await enterPageEdit();
    await page.locator('[data-canvas-header] [data-page-nav="next"]').click();
    await page.waitForFunction(
      () => Number(document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-current-page')) === 2,
      undefined,
      { timeout: 10000 },
    );
    const continuation = activePageView()
      .locator('.nf-page-fragment[data-fragment-block="child"][data-fragment-first="0"]')
      .first();
    await continuation.waitFor();
    await continuation.dblclick();
    await overlay().waitFor({ timeout: 5000 });
    assert.equal(await overlay().getAttribute('data-page-edit-spanning'), 'true');
    const text = await overlay().textContent();
    assert.match(text, /Paragraph 1\./, 'the overlay contains the whole block, not the fragment slice');
    assert.match(text, /Paragraph 90\./);
    const scrolling = await overlay().locator('[data-page-edit-scroll]').evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
      maxHeight: getComputedStyle(element.parentElement).maxHeight,
    }));
    assert.ok(scrolling.scrollHeight > scrolling.clientHeight, 'the overlay body scrolls');
    assert.equal(scrolling.overflowY, 'auto');
    assert.notEqual(scrolling.maxHeight, 'none');
    const sheetOverflow = await activeSheet().evaluate((element) => getComputedStyle(element).overflow);
    assert.equal(sheetOverflow, 'visible', 'the page sheet never clips the overlay');

    await page.keyboard.press('Meta+Enter');
    await waitOverlayClosed();
    const content = await runtimeContent('child');
    assert.equal(content.children?.length, 90, 'committing a spanning block keeps every paragraph');
  });

  it('keeps a rejected commit open with the typed text and shows the error', async () => {
    const env = ui.isolated('m4b1b1-reject');
    await launch('m4b1b1-reject');
    await openPackage(env, 'Rejected commit', longDocument());
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card="parent"]');
    await showPageRead();
    await enterPageEdit();
    await openOverlay('parent');
    await page.keyboard.type(' This text must survive.');
    await page.waitForFunction(
      () => document.querySelector('[data-page-edit-overlay]')?.textContent?.includes('This text must survive.'),
      undefined,
      { timeout: 5000 },
    );

    // Delete the block behind the open overlay. The overlay's own buffer is
    // untouched; commit now has to be rejected by the core.
    await ui.applyCommand({
      type: 'block.delete',
      blockId: 'parent',
      children: 'promote',
    });
    await page.waitForFunction(
      () => !window.__noteforestTest.structure().blocks['parent'],
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await overlay().count(), 1, 'the overlay stays open when the block disappears');

    await overlay().locator('[data-page-edit-scroll]').click();
    await page.keyboard.press('Meta+Enter');
    await overlay().locator('[data-page-edit-error]').waitFor({ timeout: 10000 });
    assert.match(await overlay().locator('[data-page-edit-error]').textContent(), /no longer exists|not exist/i);
    assert.equal(await overlay().count(), 1, 'a rejected commit keeps the overlay');
    assert.match(await overlay().textContent(), /This text must survive\./);

    // Restore a block with the same identity and retry: the same overlay buffer
    // commits successfully, proving the failure path keeps a usable editor.
    const chapterId = (await ui.structure()).chapters[0].id;
    await ui.applyCommand({
      type: 'block.create',
      blockId: 'parent',
      content: textBlock('parent', 'Parent topic', 'Restored parent.').content,
      placement: { kind: 'top-level', chapterId },
    });
    await overlay().locator('[data-page-edit-scroll]').click();
    await page.keyboard.press('Meta+Enter');
    await waitOverlayClosed();
    await page.waitForFunction(
      () => {
        const content = window.__noteforestTest.structure()?.blocks?.['parent']?.content;
        return JSON.stringify(content).includes('This text must survive.');
      },
      undefined,
      { timeout: 10000 },
    );
  });

  it('measures the 300-block page model while opening, typing, and committing one overlay', async () => {
    await launch('m4b1b1-perf');
    const started = Date.now();
    await page.evaluate(() => window.__noteforestTest.seed('performance'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const readyStarted = Date.now();
    await showPageRead();
    const readyMs = Date.now() - readyStarted;
    const initial = await pageModelState();
    assert.ok(initial.pageCount > 1, `300-block fixture derives pages, got ${initial.pageCount}`);
    assert.ok(initial.calls >= 300, `the page model measured the blocks, got ${initial.calls} calls`);

    await enterPageEdit();
    const firstId = (await activePageView().locator('.nf-page-fragment').first().getAttribute('data-fragment-block'));
    await openOverlay(firstId);
    const typingStarted = Date.now();
    await page.keyboard.type(' page edit responsiveness');
    await page.waitForFunction(
      () => document.querySelector('[data-page-edit-overlay]')?.textContent?.includes('page edit responsiveness'),
      undefined,
      { timeout: 5000 },
    );
    const typingMs = Date.now() - typingStarted;
    const during = await pageModelState();
    assert.equal(during.runs, initial.runs, 'typing in the overlay does not re-paginate');

    await page.keyboard.press('Meta+Enter');
    await waitOverlayClosed();
    await page.waitForFunction(
      (runs) => {
        const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
        return (
          view !== null &&
          view.getAttribute('data-updating') === 'false' &&
          Number(view.getAttribute('data-model-runs')) > runs
        );
      },
      initial.runs,
      { timeout: 30000 },
    );
    const after = await pageModelState();
    assert.ok(typingMs < 5000, `typing through the page model stayed responsive (${typingMs} ms)`);
    assert.equal(after.runs, initial.runs + 1, 'one commit produces one model run');
    console.log(
      `M4b1b1 300-block page model: seed ${Date.now() - started - readyMs} ms, page ready ${readyMs} ms, run ${initial.ms} ms, compute ${initial.computeMs} ms, ${initial.calls} calls, ${initial.pageCount} pages; overlay typing ${typingMs} ms (no model run); commit run ${after.ms} ms / compute ${after.computeMs} ms`,
    );
  });
});
