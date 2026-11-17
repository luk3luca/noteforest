import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { artifactsPath, root, waitUntil } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { inspectPdfFile } from '../../scripts/lib/pdf.mjs';

/**
 * F4b — the highlighter (docs/design/highlight.md §2–§5).
 *
 * A highlight is a stored inline mark with one `tone`. This suite proves the
 * user path: the bubble applies and removes every tone, ⌘⇧H applies the
 * session's last tone and toggles it off, undo is one entry per action, the mark
 * survives reload and copy/paste (one block, another block, another document),
 * deleting the text deletes the highlight, Continuous and Page both render the
 * tint, the page count and a measured card box do not move, the PDF prints the
 * paper tone and never a find highlight, Read mode shows but cannot change
 * highlights, and a document without highlights stays byte-identical.
 */

const tempRoot = artifactsPath('highlighter-ui');
const evidenceDir = artifactsPath('highlighter');

const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

/** The fixed light paper tones: the light-theme role at 28 % over white. */
const PAPER_TONES = {
  blue: '#c5d2de',
  green: '#c5d6ce',
  amber: '#ded1b8',
  rose: '#e5c8c6',
};

const PLAIN_SENTENCE = 'A plain sentence used for the swatch row and for paste.';

/**
 * One block spec. Both fixture documents share the same text, so the only
 * difference between them is the mark; line breaks, card boxes, and the page
 * count must therefore be identical.
 */
const BLOCKS = [
  {
    id: 'blue-block',
    label: 'Blue tone',
    text: 'This sentence carries a blue highlight on the key phrase.',
    phrase: 'blue highlight',
    tone: 'blue',
  },
  {
    id: 'green-block',
    label: 'Green tone',
    text: 'This sentence carries a green highlight on the key phrase.',
    phrase: 'green highlight',
    tone: 'green',
  },
  {
    id: 'amber-block',
    label: 'Amber tone',
    text: 'This sentence carries an amber highlight on the key phrase.',
    phrase: 'amber highlight',
    tone: 'amber',
  },
  {
    id: 'rose-block',
    label: 'Rose tone',
    text: 'This sentence carries a rose highlight on the key phrase.',
    phrase: 'rose highlight',
    tone: 'rose',
  },
  {
    id: 'find-block',
    label: 'Find',
    text: 'An eigenvector in this sentence is highlighted too.',
    phrase: 'eigenvector',
    tone: 'amber',
  },
  { id: 'plain-block', label: 'Plain', text: PLAIN_SENTENCE },
  {
    id: 'copy-source',
    label: 'Copy source',
    text: 'Copy me into another block and another note.',
    phrase: 'Copy me',
    tone: 'amber',
  },
  { id: 'copy-target', label: 'Copy target', text: 'Paste lands here.' },
  {
    id: 'delete-block',
    label: 'Delete',
    text: 'Delete this highlighted phrase from the sentence.',
    phrase: 'highlighted',
    tone: 'green',
  },
  ...[1, 2, 3, 4].map((index) => ({
    id: `filler-${index}`,
    label: `Filler ${index}`,
    text:
      `Filler paragraph ${index}. ` +
      'The paginator prefers a break between paragraphs, so this filler keeps the page count stable. '.repeat(2),
  })),
];

function markedText(text, phrase, tone) {
  const start = text.indexOf(phrase);
  assert.notEqual(start, -1, `fixture phrase "${phrase}" is in its block`);
  return [
    ...(start === 0 ? [] : [{ type: 'text', text: text.slice(0, start) }]),
    { type: 'text', text: phrase, marks: [{ type: 'highlight', attrs: { tone } }] },
    ...(start + phrase.length === text.length
      ? []
      : [{ type: 'text', text: text.slice(start + phrase.length) }]),
  ];
}

function documentBlocks(withHighlights) {
  return BLOCKS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    content: {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children:
            withHighlights && spec.phrase !== undefined
              ? markedText(spec.text, spec.phrase, spec.tone)
              : [{ type: 'text', text: spec.text }],
        },
      ],
    },
  }));
}

function highlightDocument(withHighlights) {
  return {
    schemaVersion: 2,
    id: withHighlights ? 'highlighter-toned' : 'highlighter-plain',
    title: withHighlights ? 'Highlighter tones' : 'Highlighter plain',
    createdAt: '2026-11-17T00:00:00.000Z',
    updatedAt: '2026-11-17T00:00:00.000Z',
    revision: 0,
    chapters: [
      {
        id: 'chapter-1',
        title: 'Highlighter',
        topLevelBlockIds: BLOCKS.map((block) => block.id),
      },
    ],
    blocks: Object.fromEntries(documentBlocks(withHighlights).map((block) => [block.id, block])),
    anchors: {},
    branches: {},
    assets: {},
  };
}

function plainSecondDocument() {
  return {
    schemaVersion: 2,
    id: 'highlighter-second',
    title: 'Second note',
    createdAt: '2026-11-17T00:00:00.000Z',
    updatedAt: '2026-11-17T00:00:00.000Z',
    revision: 0,
    chapters: [{ id: 'chapter-1', title: 'Second', topLevelBlockIds: ['second-plain'] }],
    blocks: {
      'second-plain': {
        id: 'second-plain',
        label: 'Second plain',
        content: {
          type: 'doc',
          children: [{ type: 'paragraph', children: [{ type: 'text', text: 'A second note.' }] }],
        },
      },
    },
    anchors: {},
    branches: {},
    assets: {},
  };
}

/** The canonical formatting the app writes (two spaces + a trailing newline). */
function canonicalText(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

async function writeCanonicalPackage(libraryPath, name, document) {
  const packagePath = resolve(libraryPath, name);
  await mkdir(resolve(packagePath, 'assets'), { recursive: true });
  await writeFile(resolve(packagePath, 'document.json'), canonicalText(document), 'utf8');
  return packagePath;
}

async function launch(name = 'highlights', overrides = {}) {
  page = await ui.launch({
    ...ui.isolated(name),
    NOTEFOREST_E2E_HIDDEN: '0',
    ...overrides,
  });
  await h.setWindowSize(1440, 900);
}

function activePageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

function card(blockId) {
  return page.locator(`.nf-editor[data-active="true"] [data-block-card="${blockId}"]`);
}

function bubble() {
  return page.locator('[data-testid="selection-toolbar"]');
}

async function waitPageReady(expectedCount = null) {
  await page.waitForFunction(
    (count) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      if (view === null) return false;
      if (view.getAttribute('data-ready') !== 'true') return false;
      if (view.getAttribute('data-updating') === 'true') return false;
      if (count !== null && Number(view.getAttribute('data-page-count')) !== count) return false;
      return true;
    },
    expectedCount,
    { timeout: 30000 },
  );
}

async function showPageRead() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
  await ui.ensureInteractionMode('read');
  await waitPageReady();
}

async function openPackage(packagePath) {
  const opened = await page.evaluate((path) => window.__noteforestTest.openPath(path), packagePath);
  assert.equal(opened, true, 'fixture package opens');
  await page.waitForFunction(
    (path) => window.__noteforestTest.state().activeTab === path,
    packagePath,
    { timeout: 10000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  return packagePath;
}

async function focusBlock(blockId) {
  const prose = card(blockId).locator('.nf-block-prose p').first();
  await prose.scrollIntoViewIfNeeded();
  await prose.click();
  await page.waitForFunction(
    (id) => {
      const state = window.__noteforestTest.state();
      const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
      return runtime?.selectedBlockId === id;
    },
    blockId,
    { timeout: 5000 },
  );
}

async function pressLeft(count) {
  for (let index = 0; index < count; index += 1) await page.keyboard.press('ArrowLeft');
}

async function pressShiftLeft(count) {
  for (let index = 0; index < count; index += 1) await page.keyboard.press('Shift+ArrowLeft');
}

/** Caret at the line end, then extend left by `length` characters. */
async function selectLineEnd(blockId, length) {
  await focusBlock(blockId);
  await page.keyboard.press('Meta+ArrowRight');
  await pressShiftLeft(length);
  await bubble().waitFor({ state: 'visible', timeout: 5000 });
}

/** Select one substring by walking back from the paragraph end. */
async function selectPhrase(blockId, text, phrase) {
  const end = text.indexOf(phrase) + phrase.length;
  assert.ok(end >= phrase.length, `"${phrase}" is in ${blockId}`);
  await focusBlock(blockId);
  await page.keyboard.press('Meta+ArrowRight');
  await pressLeft(text.length - end);
  await pressShiftLeft(phrase.length);
  await bubble().waitFor({ state: 'visible', timeout: 5000 });
}

async function readDocumentJson(packagePath) {
  return readFile(resolve(packagePath, 'document.json'), 'utf8');
}

async function waitTone(blockId, tone) {
  await card(blockId)
    .locator(`.nf-block-prose .nf-highlight[data-highlight-tone="${tone}"]`)
    .first()
    .waitFor({ state: 'visible', timeout: 10000 });
}

async function waitNoTone(blockId) {
  await page.waitForFunction(
    (block) =>
      document.querySelector(
        `.nf-editor[data-active="true"] [data-block-card="${block}"] .nf-block-prose .nf-highlight`,
      ) === null,
    blockId,
    { timeout: 5000 },
  );
}

function highlightCount(blockId, tone = null) {
  const selector =
    tone === null
      ? '.nf-block-prose .nf-highlight'
      : `.nf-block-prose .nf-highlight[data-highlight-tone="${tone}"]`;
  return card(blockId).locator(selector).count();
}

async function toneAttribute(blockId) {
  return (
    (await card(blockId)
      .locator('.nf-block-prose .nf-highlight')
      .first()
      .getAttribute('data-highlight-tone')) ?? null
  );
}

async function currentMode() {
  return page.evaluate(() => {
    const state = window.__noteforestTest.state();
    return window.__noteforestTest.viewState()[state.activeTab]?.interactionMode ?? 'edit';
  });
}

/** Two animation frames: a queued keyboard command has had its chance to run. */
async function settle() {
  await page.evaluate(
    () =>
      new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))),
  );
}

function scrollContinuousToTop() {
  return page.evaluate(() =>
    document
      .querySelector('.nf-editor[data-active="true"] .nf-editor-scroll')
      ?.scrollTo(0, 0),
  );
}

function rasterize(pdfPath, prefix) {
  execFileSync(
    process.execPath,
    [resolve(root, 'scripts/raster-pdf.mjs'), pdfPath, prefix, '150', '1'],
    { stdio: 'pipe' },
  );
  return `${prefix}-001.png`;
}

async function countPixelsNear(pngPath, hex, tolerance) {
  const image = await loadImage(pngPath);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const channels = [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    const difference =
      Math.abs((data[index] ?? 0) - channels[0]) +
      Math.abs((data[index + 1] ?? 0) - channels[1]) +
      Math.abs((data[index + 2] ?? 0) - channels[2]);
    if (difference <= tolerance) count += 1;
  }
  return count;
}

async function renderPrint() {
  const result = await page.evaluate(() => window.__noteforestTest.renderPrint());
  assert.equal(result.ok, true, result.message ?? 'print model builds');
  await page.waitForSelector('[data-print-test-host] [data-print-page="1"]', { timeout: 20000 });
  return result;
}

async function exportPdf(packagePath, outputPath) {
  const started = await page.evaluate(
    (input) => window.noteforest.exportPdf(input),
    { packagePath, outputPath },
  );
  assert.equal(started.ok, true, started.message);
  return waitUntil(
    async () => {
      const current = await page.evaluate(
        (id) => window.noteforest.getExportJob(id),
        started.jobId,
      );
      return current !== null && current.status !== 'running' ? current : false;
    },
    `export ${started.jobId}`,
    120000,
  );
}

describe('highlighter', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(evidenceDir, { recursive: true, force: true });
    await mkdir(evidenceDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('applies and removes every tone from the bubble and ⌘⇧H toggles one undo entry', async () => {
    await launch('highlight-swatches');
    const env = ui.isolated('highlight-swatches');
    const packagePath = await writeCanonicalPackage(
      env.NOTEFOREST_LIBRARY,
      'swatches',
      highlightDocument(true),
    );
    await openPackage(packagePath);
    await h.waitSaved();

    // A plain selection: four swatches, no remove control yet.
    await selectLineEnd('plain-block', PLAIN_SENTENCE.length);
    assert.equal(await page.locator('[data-highlight-swatches="true"]').count(), 1);
    assert.equal(await page.locator('[data-highlight-swatch]').count(), 4);
    assert.equal(await page.locator('[data-highlight-remove="true"]').count(), 0);

    // Blue is pressed after applying it, and the remove control appears.
    await page.locator('[data-highlight-swatch="blue"]').click();
    await waitTone('plain-block', 'blue');
    assert.equal(
      await page.locator('[data-highlight-swatch="blue"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await page.locator('[data-highlight-remove="true"]').count(), 1);
    await h.screenshot(resolve(evidenceDir, 'bubble-active-tone-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Switching the tone replaces it: one mark, not two.
    await page.locator('[data-highlight-swatch="green"]').click();
    await waitTone('plain-block', 'green');
    assert.equal(await highlightCount('plain-block'), 1);
    assert.equal(await highlightCount('plain-block', 'green'), 1);

    // The remove control clears the selection's tone.
    await page.locator('[data-highlight-remove="true"]').click();
    await waitNoTone('plain-block');
    assert.equal(await page.locator('[data-highlight-remove="true"]').count(), 0);

    // ⌘⇧H applies the session's last clicked tone (green), then removes it.
    await page.keyboard.press('Meta+Shift+H');
    await waitTone('plain-block', 'green');
    await page.keyboard.press('Meta+Shift+H');
    await waitNoTone('plain-block');
    await page.keyboard.press('Meta+Shift+H');
    await waitTone('plain-block', 'green');

    // One undo entry per action: a single undo removes exactly the highlight.
    await page.keyboard.press('Meta+z');
    await waitNoTone('plain-block');
    await page.keyboard.press('Meta+Shift+z');
    await waitTone('plain-block', 'green');

    await h.waitSaved();
    const saved = JSON.parse(await readDocumentJson(packagePath));
    assert.equal(saved.schemaVersion, 2, 'the mark is additive: schemaVersion stays 2');
    const runs = saved.blocks['plain-block'].content.children[0].children;
    assert.deepEqual(
      runs.flatMap((node) => node.marks ?? []),
      [{ type: 'highlight', attrs: { tone: 'green' } }],
    );

    // Reload: quit and relaunch on the same library; the tone renders again.
    await h.quit();
    await launch('highlight-swatches');
    await card('plain-block')
      .locator('.nf-block-prose .nf-highlight[data-highlight-tone="green"]')
      .waitFor({ timeout: 20000 });
    assert.equal(await toneAttribute('plain-block'), 'green');
    assert.equal(JSON.parse(await readDocumentJson(packagePath)).schemaVersion, 2);
  });

  it('keeps the tone across blocks and documents, and deleting the text deletes the highlight', async () => {
    await launch('highlight-clipboard');
    const env = ui.isolated('highlight-clipboard');
    const first = await writeCanonicalPackage(
      env.NOTEFOREST_LIBRARY,
      'copy-a',
      highlightDocument(true),
    );
    const second = await writeCanonicalPackage(
      env.NOTEFOREST_LIBRARY,
      'copy-b',
      plainSecondDocument(),
    );
    await openPackage(first);

    // The fixture renders all four tones as soon as it opens.
    await waitTone('blue-block', 'blue');
    assert.equal(await toneAttribute('rose-block'), 'rose');

    // Copy the amber phrase into another block of the same document.
    await selectPhrase('copy-source', 'Copy me into another block and another note.', 'Copy me');
    await page.keyboard.press('Meta+c');
    await focusBlock('copy-target');
    await page.keyboard.press('Meta+v');
    await page.waitForFunction(
      (block) =>
        document.querySelector(
          `.nf-editor[data-active="true"] [data-block-card="${block}"] .nf-block-prose .nf-highlight[data-highlight-tone="amber"]`,
        ) !== null,
      'copy-target',
      { timeout: 10000 },
    );
    assert.equal((await card('copy-target').locator('.nf-highlight').innerText()).trim(), 'Copy me');

    // Copy the same phrase into another document: the tone travels with it.
    await selectPhrase('copy-source', 'Copy me into another block and another note.', 'Copy me');
    await page.keyboard.press('Meta+c');
    await openPackage(second);
    await focusBlock('second-plain');
    await page.keyboard.press('Meta+v');
    await waitTone('second-plain', 'amber');
    await h.waitSaved();
    const secondText = await readDocumentJson(second);
    assert.match(secondText, /"type": "highlight"/);
    assert.match(secondText, /"tone": "amber"/);

    // Deleting the highlighted text removes the highlight with it.
    await openPackage(first);
    await selectPhrase(
      'delete-block',
      'Delete this highlighted phrase from the sentence.',
      'highlighted',
    );
    await page.keyboard.press('Backspace');
    await waitNoTone('delete-block');
    await h.waitSaved();
    const firstSaved = JSON.parse(await readDocumentJson(first));
    const deleted = JSON.stringify(firstSaved.blocks['delete-block'].content);
    assert.doesNotMatch(deleted, /"highlight"/);
    assert.doesNotMatch(deleted, /"highlighted"/);
    assert.match(deleted, /Delete this\s+phrase from the sentence/);
    // The other blocks keep their own stored tones.
    assert.match(JSON.stringify(firstSaved.blocks['green-block'].content), /"tone":"green"/);
  });

  it('renders the four tones in Continuous and Page without moving the page count or a card box', async () => {
    await launch('highlight-surfaces');
    const env = ui.isolated('highlight-surfaces');
    const tonedPath = await writeCanonicalPackage(
      env.NOTEFOREST_LIBRARY,
      'toned',
      highlightDocument(true),
    );
    const plainPath = await writeCanonicalPackage(
      env.NOTEFOREST_LIBRARY,
      'plain',
      highlightDocument(false),
    );

    // A document without highlights is byte-unchanged by opening and saving.
    const plainBefore = await readDocumentJson(plainPath);
    await openPackage(plainPath);
    await h.waitSaved();
    await page.evaluate(() => window.__noteforestTest.flushSession());
    await h.waitSaved();
    assert.equal(
      await readDocumentJson(plainPath),
      plainBefore,
      'a no-highlight note is byte-unchanged',
    );

    // The toned document in Continuous: four distinct tints, no metric effect.
    await openPackage(tonedPath);
    for (const tone of Object.keys(PAPER_TONES)) {
      await waitTone(`${tone}-block`, tone);
      const style = await page.evaluate((block) => {
        const element = document.querySelector(
          `.nf-editor[data-active="true"] [data-block-card="${block}"] .nf-block-prose .nf-highlight`,
        );
        if (element === null) return null;
        const computed = getComputedStyle(element);
        return {
          background: computed.backgroundColor,
          padding: computed.paddingLeft,
          border: computed.borderLeftWidth,
        };
      }, `${tone}-block`);
      assert.ok(style !== null, `${tone} renders in Continuous`);
      assert.notEqual(style.background, 'rgba(0, 0, 0, 0)', `${tone} has a tint`);
      assert.equal(style.padding, '0px', `${tone} adds no padding`);
      assert.equal(style.border, '0px', `${tone} adds no border`);
    }
    await scrollContinuousToTop();
    await h.screenshot(resolve(evidenceDir, 'continuous-four-tones-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Page Read: the same mark, the paper tone, the same page count.
    await showPageRead();
    const tonedPages = Number(await activePageView().getAttribute('data-page-count'));
    const blueCard = page.locator(
      '.nf-editor[data-active="true"] .nf-page-view [data-fragment-block="blue-block"] .nf-page-card',
    );
    await blueCard.scrollIntoViewIfNeeded();
    const tonedBox = await blueCard.boundingBox();
    assert.ok(tonedBox !== null, 'the blue card is measured and rendered');
    await page.waitForSelector(
      '.nf-editor[data-active="true"] .nf-page-view [data-fragment-block="blue-block"] .nf-highlight[data-highlight-tone="blue"]',
    );
    const paper = await page.evaluate(() => {
      const element = document.querySelector(
        '.nf-editor[data-active="true"] .nf-page-view [data-fragment-block="blue-block"] .nf-highlight',
      );
      if (element === null) return null;
      const computed = getComputedStyle(element);
      return {
        background: computed.backgroundColor,
        padding: computed.paddingLeft,
        border: computed.borderLeftWidth,
      };
    });
    assert.deepEqual(paper, {
      background: 'rgb(197, 210, 222)',
      padding: '0px',
      border: '0px',
    });
    await h.screenshot(resolve(evidenceDir, 'page-four-tones-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Same content without highlights: identical page count and identical box.
    await page.keyboard.press('Meta+2');
    await openPackage(plainPath);
    await showPageRead();
    await waitPageReady(tonedPages);
    const plainCard = page.locator(
      '.nf-editor[data-active="true"] .nf-page-view [data-fragment-block="blue-block"] .nf-page-card',
    );
    await plainCard.scrollIntoViewIfNeeded();
    const plainBox = await plainCard.boundingBox();
    assert.ok(plainBox !== null, 'the plain card is measured and rendered');
    assert.equal(
      Number(await activePageView().getAttribute('data-page-count')),
      tonedPages,
      'the page count is identical with and without highlights',
    );
    assert.ok(
      Math.abs(plainBox.width - tonedBox.width) <= 0.5 &&
        Math.abs(plainBox.height - tonedBox.height) <= 0.5,
      `the measured card box is identical (${JSON.stringify(tonedBox)} vs ${JSON.stringify(plainBox)})`,
    );
  });

  it('prints the paper tint in the PDF, keeps the page count, and never prints a find highlight', async () => {
    await launch('highlight-print');
    const env = ui.isolated('highlight-print');
    const tonedPath = await writeCanonicalPackage(
      env.NOTEFOREST_LIBRARY,
      'print-toned',
      highlightDocument(true),
    );
    const plainPath = await writeCanonicalPackage(
      env.NOTEFOREST_LIBRARY,
      'print-plain',
      highlightDocument(false),
    );
    await openPackage(tonedPath);

    // A highlighted word that is also a find match reads as the find.
    await page.keyboard.press('Meta+f');
    await page.waitForSelector('.nf-find-input');
    await page.locator('.nf-find-input').fill('eigenvector');
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.state();
        return state.findQuery === 'eigenvector' && state.findResults.length > 0;
      },
      undefined,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => {
        const count = document.querySelector('.nf-find-count');
        return count !== null && count.getAttribute('data-find-count') !== '0';
      },
      undefined,
      { timeout: 10000 },
    );
    const findOverHighlight = await page.evaluate(() => {
      const highlight = document.querySelector(
        '.nf-editor[data-active="true"] [data-block-card="find-block"] .nf-block-prose .nf-highlight',
      );
      const hit = document.querySelector(
        '.nf-editor[data-active="true"] [data-block-card="find-block"] .nf-block-prose .nf-find-hit',
      );
      if (highlight === null || hit === null) return null;
      return {
        nested: highlight.contains(hit),
        hitBackground: getComputedStyle(hit).backgroundColor,
        tone: highlight.getAttribute('data-highlight-tone'),
      };
    });
    assert.equal(findOverHighlight?.nested, true, 'the find decoration paints inside the mark');
    assert.equal(findOverHighlight?.tone, 'amber');
    assert.notEqual(findOverHighlight?.hitBackground, 'rgba(0, 0, 0, 0)');
    // The debounced scan re-runs on a document update; the evidence must show a
    // settled count, not the transient empty set between two scans.
    await settle();
    await page.waitForFunction(
      () => document.querySelector('.nf-find-count')?.getAttribute('data-find-count') !== '0',
      undefined,
      { timeout: 10000 },
    );
    await h.screenshot(resolve(evidenceDir, 'find-over-highlight-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // The print DOM: mark classes and paper tones are there, the find is not.
    await showPageRead();
    const pageCount = Number(await activePageView().getAttribute('data-page-count'));
    const printed = await renderPrint();
    assert.equal(printed.pageCount, pageCount, 'the print model keeps the Page count');
    const printDom = await page.evaluate(() => {
      const printRoot = document.querySelector('[data-print-test-host] [data-print-root]');
      if (printRoot === null) return null;
      const blue = printRoot.querySelector('.nf-highlight[data-highlight-tone="blue"]');
      return {
        tones: [...printRoot.querySelectorAll('.nf-highlight')].map((element) =>
          element.getAttribute('data-highlight-tone'),
        ),
        blueTint: blue === null ? null : getComputedStyle(blue).backgroundColor,
        findNodes: printRoot.querySelectorAll('.nf-find-hit, .nf-find, [data-find]').length,
        pages: printRoot.querySelectorAll('.nf-print-sheet').length,
      };
    });
    assert.ok(printDom !== null, 'the print compositor rendered');
    assert.equal(printDom.findNodes, 0, 'the print DOM never carries a find highlight');
    assert.equal(printDom.blueTint, 'rgb(197, 210, 222)', 'the paper tone is applied on print');
    for (const tone of Object.keys(PAPER_TONES)) {
      assert.ok(printDom.tones.includes(tone), `${tone} is in the print DOM`);
    }
    assert.equal(printDom.pages, pageCount);

    const tonedPdf = resolve(evidenceDir, 'highlighter.pdf');
    const tonedJob = await exportPdf(tonedPath, tonedPdf);
    assert.equal(tonedJob.status, 'done', JSON.stringify(tonedJob.error ?? tonedJob));
    assert.equal(tonedJob.pageCount, pageCount, 'the PDF page count equals the Page count');
    const tonedInspect = await inspectPdfFile(tonedPdf);
    assert.equal(tonedInspect.pageCount, tonedJob.pageCount);

    // The produced PDF really carries the four paper tints.
    const prefix = resolve(evidenceDir, 'print-page');
    const raster = rasterize(tonedPdf, prefix);
    const tintedPixels = {};
    for (const [tone, hex] of Object.entries(PAPER_TONES)) {
      const pixels = await countPixelsNear(raster, hex, 6);
      tintedPixels[tone] = pixels;
      assert.ok(pixels > 60, `${tone} prints as its paper tone (${hex}); found ${pixels} pixels`);
    }
    await rename(raster, resolve(evidenceDir, 'print-page-tint-150dpi.png'));
    await writeFile(
      resolve(evidenceDir, 'evidence.json'),
      JSON.stringify(
        { pageCount, paperTones: PAPER_TONES, tintedPixels, findNodesInPrint: printDom.findNodes },
        null,
        2,
      ),
      'utf8',
    );

    // The same content without highlights keeps the page count. The export
    // resolves an open document, so activate the plain tab first.
    await openPackage(plainPath);
    const plainPdf = resolve(evidenceDir, 'plain.pdf');
    const plainJob = await exportPdf(plainPath, plainPdf);
    assert.equal(plainJob.status, 'done', JSON.stringify(plainJob.error ?? plainJob));
    assert.equal(plainJob.pageCount, tonedJob.pageCount, 'highlights never add a page');
  });

  it('shows highlights in Read mode but cannot change them', async () => {
    await launch('highlight-read');
    const env = ui.isolated('highlight-read');
    const packagePath = await writeCanonicalPackage(
      env.NOTEFOREST_LIBRARY,
      'read-mode',
      highlightDocument(true),
    );
    await openPackage(packagePath);
    await h.waitSaved();
    assert.equal(await currentMode(), 'edit');

    await ui.ensureInteractionMode('read');
    assert.equal(await currentMode(), 'read');
    assert.equal(await highlightCount('rose-block', 'rose'), 1, 'the tint stays visible in Read');
    const before = await readDocumentJson(packagePath);
    const jsonBefore = JSON.stringify(await page.evaluate(() => window.__noteforestTest.editorJson()));

    // A selection in Read can be made and copied, but not highlighted.
    await card('rose-block').locator('.nf-block-prose p').click();
    await page.keyboard.press('Meta+ArrowRight');
    await pressShiftLeft('rose highlight'.length);
    await page.keyboard.press('Meta+Shift+H');
    await settle();
    assert.equal(await highlightCount('rose-block'), 1, 'no second highlight appears');
    assert.equal(await toneAttribute('rose-block'), 'rose', 'the existing tone is unchanged');
    assert.equal(await bubble().count(), 0, 'the selection bubble is not mounted in Read');
    assert.equal(await readDocumentJson(packagePath), before, 'Read wrote nothing');
    assert.equal(
      JSON.stringify(await page.evaluate(() => window.__noteforestTest.editorJson())),
      jsonBefore,
      'Read changed no in-memory content',
    );
  });
});
