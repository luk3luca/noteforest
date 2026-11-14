import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addTopLevelBlock } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('special-text-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const { isolated, seedDemo } = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

function card(blockId) {
  return page.locator(`.nf-editor[data-active="true"] [data-block-card="${blockId}"]`);
}

function codeBlock(blockId) {
  return card(blockId).locator('[data-code-block="true"]');
}

async function blankBlock(blockId) {
  await addTopLevelBlock(ui, blockId, {
    type: 'doc',
    children: [{ type: 'paragraph' }],
  });
  const current = await ui.structure();
  await h.waitLayout({
    blocks: Object.keys(current.blocks).length,
    arrows: Object.values(current.branches).filter((branch) => branch.role === 'primary')
      .length,
  });
}

/**
 * Click the right edge of a code block body and wait until the node view reports
 * the editing state. The PM selection can lag a synthetic click, so a key press
 * right after a plain click would run against the previous selection.
 */
async function clickCodeEnd(blockId) {
  const line = card(blockId).locator('pre[data-anchor-kind="code"] code');
  const box = await line.boundingBox();
  await line.click({
    position: { x: Math.max(1, (box?.width ?? 20) - 2), y: Math.max(2, (box?.height ?? 18) / 2) },
  });
  await page.waitForFunction(
    (block) =>
      document
        .querySelector(`[data-block-card="${block}"] [data-code-block="true"]`)
        ?.getAttribute('data-code-state') === 'editing',
    blockId,
    { timeout: 5000 },
  );
}

async function focusProse(blockId) {
  const prose = card(blockId).locator('.nf-block-prose p').first();
  await prose.scrollIntoViewIfNeeded();
  await prose.click();
  // The click is ready when ProseMirror reports this block as selected; a
  // browser-selection check alone can race the editor's selection sync.
  await page.waitForFunction(
    (id) => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      return runtime?.selectedBlockId === id;
    },
    blockId,
    { timeout: 5000 },
  );
}

async function typeInBlank(blockId, text) {
  await focusProse(blockId);
  await page.keyboard.type(text);
}

function paragraphs(blockId) {
  return card(blockId).locator('.nf-block-prose p');
}

/**
 * Paragraph text without the live-preview delimiter widgets. The widgets are
 * editor affordances, never document text; the canonical content still has no
 * backtick.
 */
async function proseText(blockId) {
  return page.evaluate((block) => {
    const prose = document.querySelector(`[data-block-card="${block}"] .nf-block-prose`);
    if (prose === null) return '';
    const clone = prose.cloneNode(true);
    for (const delimiter of clone.querySelectorAll('.nf-inline-code-delim')) {
      delimiter.remove();
    }
    return clone.textContent ?? '';
  }, blockId);
}

/** The number of inline-code delimiter widgets rendered in a block. */
function delimiterCount(blockId) {
  return card(blockId).locator('.nf-inline-code-delim').count();
}

async function selectedBlockId() {
  return page.evaluate(() => {
    const current = window.__noteforestTest.state();
    const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
    return runtime?.selectedBlockId ?? null;
  });
}

/**
 * Block-body child tags plus the tag/index that owns the browser caret. Used by
 * the table paragraph actions: the caret must land in the new paragraph, in the
 * same block, without a block jump.
 */
async function proseCaretInfo(blockId) {
  return page.evaluate((block) => {
    const prose = document.querySelector(`[data-block-card="${block}"] .nf-block-prose`);
    if (prose === null) return null;
    const container = prose.querySelector('[data-node-view-content-react]') ?? prose;
    const tagOf = (element) =>
      element.tagName === 'TABLE' || element.querySelector(':scope > table') !== null
        ? 'table'
        : element.tagName.toLowerCase();
    const children = [...container.children].map(tagOf);
    const node = window.getSelection()?.anchorNode ?? null;
    const element =
      node === null ? null : node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const paragraph = element?.closest?.('p') ?? null;
    return {
      children,
      index: paragraph === null ? -1 : [...container.children].indexOf(paragraph),
      tableIndex: children.indexOf('table'),
    };
  }, blockId);
}

/** `row:cell` of the table cell that owns the browser caret, or null. */
async function cellAtCaret() {
  return page.evaluate(() => {
    const selection = window.getSelection();
    const node = selection?.anchorNode ?? null;
    const element =
      node === null ? null : node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const cell = element?.closest?.('td,th') ?? null;
    if (cell === null) return null;
    const row = cell.parentElement;
    if (row === null) return null;
    return `${[...row.parentElement.children].indexOf(row)}:${[...row.children].indexOf(cell)}`;
  });
}

/** Wait until ProseMirror has read the browser caret after a click. */
async function waitCaretSettled() {
  await page.evaluate(
    () =>
      new Promise((settle) => {
        requestAnimationFrame(() => requestAnimationFrame(() => settle(true)));
      }),
  );
}

describe('NoteForest special text editing', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(artifactsPath('special-text'), { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('A: code fences auto-close, show language/copy, keep syntax colours and exit once', async () => {
    const env = isolated('special-text-code');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const blockId = 'st-code';
    await blankBlock(blockId);
    await typeInBlank(blockId, '```python');
    await page.keyboard.press('Enter');

    const code = codeBlock(blockId);
    await code.waitFor();
    assert.equal(await code.getAttribute('data-code-language'), 'python');
    assert.equal(await code.getAttribute('data-code-state'), 'editing');
    // The fence is editable text, never a menu/token, and the closing row is a
    // button affordance.
    assert.equal(await code.locator('[data-code-language-input]').inputValue(), 'python');
    assert.equal(await code.locator('[data-code-language-input]').evaluate((el) => el.tagName), 'INPUT');
    assert.equal(await code.locator('[data-code-action="close"]').evaluate((el) => el.tagName), 'BUTTON');
    assert.equal(await code.locator('select').count(), 0);

    // The caret stays inside the converted block and lowlight decorations are
    // applied to the contentDOM.
    await page.keyboard.type('def value(): return 1  # note');
    await page.waitForSelector(`.nf-editor[data-active="true"] [data-block-card="${blockId}"] .hljs-keyword`);
    assert.match(
      await card(blockId).locator('pre[data-anchor-kind="code"] code').innerText(),
      /def value\(\): return 1  # note/,
    );

    // Editing: opening fence + closing row with the copy action; the language
    // label is the idle affordance and is hidden while editing.
    assert.equal(await code.locator('[data-code-label]').isVisible(), false);
    const copy = code.locator('[data-code-action="copy"]');
    assert.equal(await copy.isVisible(), true);
    await copy.click();
    await page.waitForFunction(
      (block) =>
        document
          .querySelector(`[data-block-card="${block}"] [data-code-action="copy"]`)
          ?.textContent?.includes('Copied') === true,
      blockId,
      { timeout: 5000 },
    );
    assert.equal(await h.clipboardText(), 'def value(): return 1  # note');
    await h.screenshot(artifactsPath('special-text-polish', 'code-editing-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // ArrowDown at the end exits to a paragraph and shows the idle state: no
    // fences, a top-right language label, and no copy button (idle or hover).
    await clickCodeEnd(blockId);
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(
      (block) =>
        document
          .querySelector(`[data-block-card="${block}"] [data-code-block="true"]`)
          ?.getAttribute('data-code-state') === 'idle',
      blockId,
      { timeout: 5000 },
    );
    assert.equal(await code.locator('[data-code-label]').isVisible(), true);
    assert.equal(await code.locator('.nf-code-fence-open').isVisible(), false);
    assert.equal(await code.locator('.nf-code-fence-close-row').isVisible(), false);
    assert.equal(
      (await card(blockId).locator('[data-code-label]').textContent())?.trim(),
      'python',
    );
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(`[data-block-card="${block}"] .nf-block-prose p`).length === 1,
      blockId,
      { timeout: 5000 },
    );
    assert.equal(await paragraphs(blockId).count(), 1, 'one paragraph sits below the code');
    await page.waitForFunction(
      (block) => {
        const paragraph = document.querySelector(
          `[data-block-card="${block}"] .nf-block-prose p`,
        );
        const selection = window.getSelection();
        const node = selection?.anchorNode ?? null;
        return paragraph !== null && node !== null && paragraph.contains(node);
      },
      blockId,
      { timeout: 5000 },
    );
    // Idle chrome: the language label is top-right and the copy action is
    // editing-only; hovering the idle block must not reveal it.
    await code.hover();
    assert.equal(
      await code.locator('[data-code-action="copy"]').isVisible(),
      false,
      'the copy action is not an idle or hover affordance',
    );
    await h.screenshot(artifactsPath('special-text-polish', 'code-idle-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // One undo removes only the inserted paragraph, not the code block.
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(
          `[data-block-card="${block}"] .nf-block-prose p`,
        ).length === 0,
      blockId,
      { timeout: 5000 },
    );
    assert.equal(await codeBlock(blockId).count(), 1);

    // Mod-Enter exits from anywhere in the code. Collapse the selection the
    // undo leaves behind first; its bubble would intercept the click.
    await page.keyboard.press('ArrowRight');
    await page
      .locator('[data-testid="selection-toolbar"]')
      .waitFor({ state: 'detached', timeout: 5000 });
    await clickCodeEnd(blockId);
    await page.keyboard.press('Meta+Enter');
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(
          `[data-block-card="${block}"] .nf-block-prose p`,
        ).length === 1,
      blockId,
      { timeout: 5000 },
    );

    // The closing row exits too.
    await clickCodeEnd(blockId);
    await code.locator('[data-code-action="close"]').waitFor();
    await code.locator('[data-code-action="close"]').click();
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(
          `[data-block-card="${block}"] .nf-block-prose p`,
        ).length === 1,
      blockId,
      { timeout: 5000 },
    );

    // Language: Enter commits, empty means plaintext (no label), unknown tokens
    // are stored, Escape cancels.
    await card(blockId).locator('pre[data-anchor-kind="code"] code').click();
    const input = code.locator('[data-code-language-input]');
    await input.fill('ts');
    await input.press('Enter');
    await page.waitForFunction(
      (block) =>
        document
          .querySelector(`[data-block-card="${block}"] [data-code-block="true"]`)
          ?.getAttribute('data-code-language') === 'ts',
      blockId,
    );
    await card(blockId).locator('pre[data-anchor-kind="code"] code').click();
    await input.fill('');
    await input.press('Enter');
    await page.waitForFunction(
      (block) =>
        document
          .querySelector(`[data-block-card="${block}"] [data-code-block="true"]`)
          ?.getAttribute('data-code-language') === 'plaintext',
      blockId,
    );
    assert.equal(await code.locator('[data-code-label]').isVisible(), false);
    await card(blockId).locator('pre[data-anchor-kind="code"] code').click();
    await input.fill('not-a-language');
    await input.press('Enter');
    await page.waitForFunction(
      (block) =>
        document
          .querySelector(`[data-block-card="${block}"] [data-code-block="true"]`)
          ?.getAttribute('data-code-language') === 'not-a-language',
      blockId,
    );
    await card(blockId).locator('pre[data-anchor-kind="code"] code').click();
    await input.fill('cancelled');
    await input.press('Escape');
    assert.equal(await input.inputValue(), 'not-a-language');

    // Page Read stays neutral: no code chrome and no token colours.
    await page.keyboard.press('Meta+3');
    await page.locator('.nf-editor[data-active="true"] .nf-page-view').waitFor();
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-sheet');
    assert.equal(await page.locator('.nf-page-view [data-code-block]').count(), 0);
    assert.equal(await page.locator('.nf-page-view .hljs-keyword').count(), 0);
    assert.equal(await page.locator('.nf-page-view .hljs-comment').count(), 0);

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });

  it('B: backtick toggles the inline code mark without literal backticks', async () => {
    const env = isolated('special-text-inline');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const blockId = 'st-inline';
    await blankBlock(blockId);
    await typeInBlank(blockId, 'Run `npm run build` now.');
    await page.waitForSelector(`[data-block-card="${blockId}"] .nf-block-prose code`);
    assert.equal(
      (await card(blockId).locator('.nf-block-prose code').first().innerText()).trim(),
      'npm run build',
    );
    assert.equal(
      (await proseText(blockId)).includes('`'),
      false,
      'the toggling backticks never enter the text',
    );

    // Entering the chip shows the live-preview delimiters at both ends; moving
    // the caret out of the marked range hides them again.
    await card(blockId).locator('.nf-block-prose code').first().click();
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(`[data-block-card="${block}"] .nf-inline-code-delim`)
          .length === 2,
      blockId,
      { timeout: 5000 },
    );
    assert.equal(await delimiterCount(blockId), 2);
    assert.equal(
      await card(blockId)
        .locator('.nf-inline-code-delim')
        .first()
        .evaluate((element) => element.textContent),
      '`',
    );

    // F6: the delimiter widgets are an Edit affordance. Continuous Read keeps
    // the stored code mark but renders no backticks that are not content.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"]')
          ?.getAttribute('data-interaction-mode') === 'read',
      undefined,
      { timeout: 5000 },
    );
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(`[data-block-card="${block}"] .nf-inline-code-delim`)
          .length === 0,
      blockId,
      { timeout: 5000 },
    );
    assert.equal(await delimiterCount(blockId), 0);
    assert.equal(
      await card(blockId).locator('.nf-block-prose code').count(),
      1,
      'Read keeps the stored code mark',
    );
    assert.equal(
      (await proseText(blockId)).includes('`'),
      false,
      'Read renders no delimiter backticks',
    );
    await h.screenshot(
      artifactsPath('sentinel-fixes', 'read-delimiters-hidden-1440x900.png'),
      { width: 1440, height: 900 },
    );
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"]')
          ?.getAttribute('data-interaction-mode') === 'edit',
      undefined,
      { timeout: 5000 },
    );
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(`[data-block-card="${block}"] .nf-inline-code-delim`)
          .length === 2,
      blockId,
      { timeout: 5000 },
    );
    assert.equal(await delimiterCount(blockId), 2, 'Edit shows the delimiters again');

    const mark = await page.evaluate((block) => {
      const code = document.querySelector(`[data-block-card="${block}"] .nf-block-prose code`);
      const selection = window.getSelection();
      const node = selection?.anchorNode ?? null;
      return {
        length: code?.textContent?.length ?? 0,
        offset:
          node !== null && code !== null && code.contains(node)
            ? selection.anchorOffset
            : 0,
      };
    }, blockId);
    // Move just past the marked range: from the caret to the range end, then
    // one character into the following text.
    for (let index = 0; index < Math.max(1, mark.length - mark.offset + 1); index += 1) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(`[data-block-card="${block}"] .nf-inline-code-delim`)
          .length === 0,
      blockId,
      { timeout: 5000 },
    );
    assert.equal(await delimiterCount(blockId), 0);
    assert.equal(
      await card(blockId).locator('.nf-block-prose code').count(),
      1,
      'the canonical mark survives the live-preview widgets',
    );

    // ⇧` inserts a literal backtick, never a delimiter widget.
    await page.keyboard.press('Shift+Backquote');
    await page.waitForFunction(
      (block) => {
        const prose = document.querySelector(`[data-block-card="${block}"] .nf-block-prose`);
        if (prose === null) return false;
        const clone = prose.cloneNode(true);
        for (const delimiter of clone.querySelectorAll('.nf-inline-code-delim')) {
          delimiter.remove();
        }
        return (clone.textContent ?? '').includes('`');
      },
      blockId,
      { timeout: 5000 },
    );
    assert.equal((await proseText(blockId)).includes('`'), true);
    assert.equal(await delimiterCount(blockId), 0);

    // A selection wraps and unwraps.
    const secondId = 'st-inline-selection';
    await blankBlock(secondId);
    await typeInBlank(secondId, 'word');
    for (let index = 0; index < 'word'.length; index += 1) {
      await page.keyboard.press('Shift+ArrowLeft');
    }
    // The bubble is the visible proof that ProseMirror owns the range, not
    // just the browser selection.
    await page.locator('[data-testid="selection-toolbar"]').waitFor({ state: 'visible' });
    await page.keyboard.press('Backquote');
    await page.waitForSelector(`[data-block-card="${secondId}"] .nf-block-prose code`);
    assert.equal(
      (await card(secondId).locator('.nf-block-prose code').innerText()).trim(),
      'word',
    );
    await page.keyboard.press('Backquote');
    await page.waitForFunction(
      (block) =>
        document.querySelector(`[data-block-card="${block}"] .nf-block-prose code`) === null,
      secondId,
    );

    // The mini menu applies and removes the same mark; entering the chip shows
    // the delimiters, and collapsing the caret at its end keeps them.
    const inlineCodeButton = page.locator(
      '[data-testid="selection-toolbar"] [aria-label="Inline code"]',
    );
    await inlineCodeButton.waitFor({ state: 'visible' });
    await inlineCodeButton.click();
    await page.waitForSelector(`[data-block-card="${secondId}"] .nf-block-prose code`);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(`[data-block-card="${block}"] .nf-inline-code-delim`)
          .length === 2,
      secondId,
      { timeout: 5000 },
    );
    await h.screenshot(artifactsPath('special-text-polish', 'inline-code-delimiters-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    for (let index = 0; index < 'word'.length; index += 1) {
      await page.keyboard.press('Shift+ArrowLeft');
    }
    await inlineCodeButton.waitFor({ state: 'visible' });
    await inlineCodeButton.click();
    await page.waitForFunction(
      (block) =>
        document.querySelector(`[data-block-card="${block}"] .nf-block-prose code`) === null,
      secondId,
    );
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(`[data-block-card="${block}"] .nf-inline-code-delim`)
          .length === 0,
      secondId,
    );

    // Escape ends the stored mark armed by a backtick without blurring the
    // editor: the following text is plain and still lands in the paragraph.
    const thirdId = 'st-inline-escape';
    await blankBlock(thirdId);
    await typeInBlank(thirdId, 'a`');
    await page.keyboard.press('Escape');
    await page.keyboard.type('xy');
    await page.waitForFunction(
      (block) => {
        const prose = document.querySelector(`[data-block-card="${block}"] .nf-block-prose`);
        return (
          prose?.querySelector('code') === null &&
          prose?.textContent?.trim() === 'axy'
        );
      },
      thirdId,
      { timeout: 5000 },
    );

    // Inside a code block every backtick is literal.
    const codeId = 'st-inline-codeblock';
    await blankBlock(codeId);
    await typeInBlank(codeId, '```js');
    await page.keyboard.press('Enter');
    await page.keyboard.type('`literal`');
    assert.equal(
      (await card(codeId).locator('pre[data-anchor-kind="code"] code').innerText()).trim(),
      '`literal`',
    );
    assert.equal(await card(codeId).locator('.nf-block-prose code code').count(), 0);

    await h.screenshot(artifactsPath('special-text', 'inline-code-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });

  it('B2: plain arrows stay inside the block and ⌘↓ still navigates', async () => {
    const env = isolated('special-text-arrows');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const firstId = 'st-arrow-first';
    const secondId = 'st-arrow-second';
    await blankBlock(firstId);
    await typeInBlank(firstId, 'alpha');
    await blankBlock(secondId);
    await typeInBlank(secondId, 'beta');
    await focusProse(firstId);
    await page.keyboard.press('Meta+ArrowRight');
    await page.waitForFunction(
      () => window.__noteforestTest.caretLocation()?.offset === 'alpha'.length,
      undefined,
      { timeout: 5000 },
    );
    assert.equal(await selectedBlockId(), firstId);

    // At the block end, ArrowDown and ArrowRight are consumed: the caret and
    // the selected block stay in the first block.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    assert.equal(await selectedBlockId(), firstId);
    assert.equal(
      await page.evaluate((block) => {
        const selection = window.getSelection();
        const node = selection?.anchorNode ?? null;
        return (
          node !== null &&
          document
            .querySelector(`[data-block-card="${block}"] .nf-block-prose`)
            ?.contains(node) === true
        );
      }, firstId),
      true,
    );

    // At the block start, ArrowUp and ArrowLeft are consumed too. The native
    // ⌘← moves the DOM caret before ProseMirror observes it: the following
    // ArrowRight must still move natively (no stale-state swallow), and the
    // arrows at the live start are then consumed.
    await page.keyboard.press('Meta+ArrowLeft');
    await page.keyboard.press('ArrowRight');
    assert.equal(
      await page.evaluate(() => window.getSelection()?.anchorOffset),
      1,
      'the first ArrowRight after ⌘← moves natively',
    );
    await page.keyboard.press('Meta+ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await selectedBlockId(), firstId);
    assert.equal(await page.evaluate(() => window.getSelection()?.anchorOffset), 0);

    // Block navigation is still ⌘↓.
    await page.keyboard.press('Meta+ArrowDown');
    await page.waitForFunction(
      (expected) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return runtime?.selectedBlockId === expected;
      },
      secondId,
      { timeout: 5000 },
    );
  });

  it('C: $…$ and $$…$$ rules, in-place source editing and the anchor click', async () => {
    const env = isolated('special-text-formula');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const blockId = 'st-formula';
    await blankBlock(blockId);
    await typeInBlank(blockId, '$2*2$ $a_1$ $x^2$ $100$');
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(
          `[data-block-card="${block}"] [data-type="inline-math"]`,
        ).length === 4,
      blockId,
      { timeout: 5000 },
    );
    assert.ok(
      (await card(blockId).locator('[data-type="inline-math"] .katex').count()) >= 4,
      'each inline formula renders with KaTeX',
    );

    const textId = 'st-formula-text';
    await blankBlock(textId);
    await typeInBlank(textId, '$5 and $6');
    assert.equal(
      await card(textId).locator('[data-type="inline-math"]').count(),
      0,
      '$5 and $6 stays text',
    );

    // Block math at the paragraph start; $$ + Enter creates an empty block.
    const blockMathId = 'st-formula-block';
    await blankBlock(blockMathId);
    await typeInBlank(blockMathId, '$$E=mc^2$$');
    await page.waitForSelector(`[data-block-card="${blockMathId}"] [data-type="block-math"]`);
    assert.equal(
      await card(blockMathId).locator('[data-type="block-math"]').getAttribute('data-latex'),
      'E=mc^2',
    );
    const emptyMathId = 'st-formula-block-empty';
    await blankBlock(emptyMathId);
    await typeInBlank(emptyMathId, '$$');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (block) =>
        document.querySelectorAll(
          `[data-block-card="${block}"] [data-type="block-math"]`,
        ).length === 1,
      emptyMathId,
      { timeout: 5000 },
    );
    assert.equal(
      await card(emptyMathId).locator('[data-type="block-math"]').getAttribute('data-latex'),
      '',
    );

    // Single click selects the whole formula (anchor workflow), double click
    // edits the source in place.
    const formula = card(blockMathId).locator('[data-type="block-math"]').first();
    await formula.click();
    await page.waitForFunction(
      (block) =>
        document.querySelector(
          `[data-block-card="${block}"] [data-type="block-math"].ProseMirror-selectednode`,
        ) !== null,
      blockMathId,
      { timeout: 5000 },
    );
    await formula.dblclick();
    const source = card(blockMathId).locator('[data-formula-source]');
    await source.waitFor();
    assert.equal(await source.inputValue(), 'E=mc^2');
    assert.equal(await card(blockMathId).locator('.nf-textarea').count(), 1);
    await h.screenshot(artifactsPath('special-text', 'formula-source-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await source.fill('E=mc^3');
    await page.waitForSelector(`[data-block-card="${blockMathId}"] .nf-formula-preview .katex`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (block) =>
        document
          .querySelector(`[data-block-card="${block}"] [data-type="block-math"]`)
          ?.getAttribute('data-latex') === 'E=mc^3',
      blockMathId,
      { timeout: 5000 },
    );

    // Escape cancels the draft.
    await card(blockMathId).locator('[data-type="block-math"]').first().dblclick();
    await source.waitFor();
    await source.fill('cancelled');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-formula-source]', { state: 'detached' });
    assert.equal(
      await card(blockMathId).locator('[data-type="block-math"]').first().getAttribute('data-latex'),
      'E=mc^3',
    );

    // The anchor command still binds after selecting a formula; one undo
    // removes the child and the binding.
    await card(blockMathId).locator('[data-type="block-math"]').first().click();
    await page.waitForFunction(
      (block) =>
        document.querySelector(
          `[data-block-card="${block}"] [data-type="block-math"].ProseMirror-selectednode`,
        ) !== null,
      blockMathId,
    );
    const before = await ui.structure();
    await page.keyboard.press('Meta+Shift+Enter');
    await h.waitCanonicalBlockCount(Object.keys(before.blocks).length + 1);
    const created = await ui.structure();
    assert.equal(
      Object.values(created.anchors).some((anchor) => anchor.kind === 'formula'),
      true,
      'the whole-formula anchor is created',
    );
    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(Object.keys(before.blocks).length);

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });

  it('G: the link form resets when the selection bubble hides', async () => {
    const env = isolated('special-text-link');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const blockId = 'st-link-reset';
    await blankBlock(blockId);
    await typeInBlank(blockId, 'link target text');
    const selectLink = async () => {
      await page.keyboard.press('Meta+ArrowLeft');
      for (let index = 0; index < 'link'.length; index += 1) {
        await page.keyboard.press('Shift+ArrowRight');
      }
      await page.locator('[data-testid="selection-toolbar"]').waitFor({ state: 'visible' });
    };
    await selectLink();
    await page.locator('[data-testid="selection-toolbar"] [aria-label="Link"]').click();
    const form = page.locator('.nf-bubble-link');
    await form.waitFor();
    await form.locator('input').fill('https://example.com');

    // Clicking outside collapses the selection and hides the bubble.
    await card(blockId).locator('.nf-block-prose p').first().click();
    await page.waitForSelector('.nf-bubble-link', { state: 'detached' });
    await selectLink();
    assert.equal(await page.locator('.nf-bubble-link').count(), 0);
    assert.equal(
      await page.locator('[data-testid="selection-toolbar"] [aria-label="Link"]').isVisible(),
      true,
      'the new bubble starts from the buttons',
    );
    await h.screenshot(artifactsPath('special-text-polish', 'link-reset-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });

  it('E: formula outline, source action row, copy/convert and paste', async () => {
    const env = isolated('special-text-formula-polish');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const blockId = 'st-formula-polish';
    const latex = '\\frac{a}{b}+\\frac{c}{d}';
    await blankBlock(blockId);
    await typeInBlank(blockId, `Av = $${latex}$ v`);
    const formula = card(blockId).locator('[data-type="inline-math"]').first();
    await formula.waitFor();

    // One inline-block box: the formula's full rendered height and width, not a
    // fragmented inline line box.
    const metrics = await formula.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const katex = element.querySelector('.katex')?.getBoundingClientRect() ?? null;
      return {
        display: style.display,
        verticalAlign: style.verticalAlign,
        width: box.width,
        height: box.height,
        katexWidth: katex?.width ?? 0,
        katexHeight: katex?.height ?? 0,
        rects: element.getClientRects().length,
      };
    });
    assert.equal(metrics.display, 'inline-block');
    assert.equal(metrics.verticalAlign, 'middle');
    assert.equal(metrics.rects, 1);
    assert.ok(metrics.height >= metrics.katexHeight - 1, 'the box holds the full formula height');
    assert.ok(metrics.width >= metrics.katexWidth - 1, 'the box holds the full formula width');

    // The outline stays anchor-only: a selected, non-anchored formula has none.
    await formula.click();
    await page.waitForFunction(
      (block) =>
        document.querySelector(
          `[data-block-card="${block}"] [data-type="inline-math"].ProseMirror-selectednode`,
        ) !== null,
      blockId,
      { timeout: 5000 },
    );
    await waitCaretSettled();
    assert.equal(
      await formula.evaluate((element) => getComputedStyle(element).outlineStyle),
      'none',
      'no selection outline without an anchor',
    );
    assert.equal(
      await page.locator('[data-testid="selection-toolbar"]').count(),
      0,
      'the general selection toolbar is suppressed for a formula NodeSelection',
    );

    // Anchor the whole formula, then reselect it: one dashed rectangle around
    // the full rendered box.
    await page.keyboard.press('Meta+Shift+Enter');
    await h.waitCanonicalBlockCount(9);
    await h.waitBlockCount(9);
    await formula.click();
    await page.waitForFunction(
      (block) =>
        document.querySelector(
          `[data-block-card="${block}"] [data-type="inline-math"].ProseMirror-selectednode`,
        ) !== null,
      blockId,
      { timeout: 5000 },
    );
    const outline = await formula.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        style: style.outlineStyle,
        width: style.outlineWidth,
        rects: element.getClientRects().length,
        height: box.height,
      };
    });
    assert.equal(outline.style, 'dashed');
    assert.notEqual(outline.width, '0px');
    assert.equal(outline.rects, 1);
    await h.screenshot(artifactsPath('special-text-polish', 'formula-selection-rect-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Double click opens the source editor and keeps its textarea focused; the
    // general selection toolbar stays away.
    await formula.dblclick();
    const source = card(blockId).locator('[data-formula-source]');
    await source.waitFor();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-formula-source') === 'true',
      undefined,
      { timeout: 5000 },
    );
    await source.press('End');
    await page.keyboard.type('+z');
    assert.equal(await source.inputValue(), `${latex}+z`);
    assert.equal(await page.locator('[data-testid="selection-toolbar"]').count(), 0);

    // One stable action row with three commands; Branch from term is disabled
    // until a non-empty LaTeX selection exists.
    const actions = card(blockId).locator('[data-formula-actions="true"]');
    await actions.waitFor();
    assert.equal(await actions.locator('button').count(), 3);
    const termAction = actions.locator('[data-testid="branch-from-term"]');
    assert.equal(await termAction.isDisabled(), true);
    await ui.selectRange(source, 0, latex.length);
    assert.equal(await termAction.isDisabled(), false);
    await h.screenshot(artifactsPath('special-text-polish', 'formula-action-row-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Copy formula writes the source with the inline delimiters.
    await actions.locator('[data-testid="copy-formula"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="copy-formula"]')?.textContent === 'Copied',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(await h.clipboardText(), `$${latex}+z$`);

    // Branch from the term keeps the existing flow: the source closes, a child
    // and the term anchor are created.
    await termAction.click();
    await page.waitForSelector('[data-formula-source]', { state: 'detached' });
    await h.waitCanonicalBlockCount(10);
    await h.waitBlockCount(10);

    // Reopen the source: the term-highlight layer is mounted but hidden so it
    // cannot overlay the textarea, and the textarea owns the focus.
    await formula.dblclick();
    await source.waitFor();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-formula-source') === 'true',
      undefined,
      { timeout: 5000 },
    );
    const termLayer = card(blockId).locator('[data-formula-term-layer]');
    await termLayer.waitFor({ state: 'attached' });
    assert.equal(await termLayer.isVisible(), false);
    assert.equal(await source.isVisible(), true);

    // Inline → block keeps the source and the editor open. One conversion is
    // one transaction: the single undo below returns to inline.
    const toggle = actions.locator('[data-testid="toggle-formula-kind"]');
    assert.equal(await toggle.getAttribute('data-formula-kind-target'), 'block');
    await toggle.click();
    await page.waitForSelector(`[data-block-card="${blockId}"] [data-type="block-math"]`);
    await source.waitFor();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-formula-source') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(await source.inputValue(), `${latex}+z`);
    const reverse = actions.locator('[data-testid="toggle-formula-kind"]');
    assert.equal(await reverse.getAttribute('data-formula-kind-target'), 'inline');

    // Commit the draft by clicking the paragraph text, then one undo returns to
    // the single conversion transaction.
    await card(blockId).locator('.nf-block-prose p').first().click({ position: { x: 2, y: 2 } });
    await page.waitForSelector(`[data-block-card="${blockId}"] [data-formula-source]`, {
      state: 'detached',
    });
    await page.keyboard.press('Meta+z');
    await page.waitForSelector(`[data-block-card="${blockId}"] [data-type="inline-math"]`);

    // Paste creates the formula node instead of literal text.
    const pasteInlineId = 'st-formula-paste-inline';
    await blankBlock(pasteInlineId);
    await focusProse(pasteInlineId);
    await h.writeClipboard('$x^2$');
    await page.keyboard.press('Meta+v');
    await page.waitForFunction(
      (block) =>
        document
          .querySelector(`[data-block-card="${block}"] [data-type="inline-math"]`)
          ?.getAttribute('data-latex') === 'x^2',
      pasteInlineId,
      { timeout: 5000 },
    );
    const pasteBlockId = 'st-formula-paste-block';
    await blankBlock(pasteBlockId);
    await focusProse(pasteBlockId);
    await h.writeClipboard('$$\\frac{1}{2}$$');
    await page.keyboard.press('Meta+v');
    await page.waitForFunction(
      (block) =>
        document
          .querySelector(`[data-block-card="${block}"] [data-type="block-math"]`)
          ?.getAttribute('data-latex') === '\\frac{1}{2}',
      pasteBlockId,
      { timeout: 5000 },
    );

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });

  it('D: table picker, toolbar, keyboard, conversions, copy and scrolling', async () => {
    const env = isolated('special-text-table');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();

    // Insert picker through the existing command; the size is remembered.
    await page.keyboard.press('Meta+k');
    await page.locator('.nf-palette-input').fill('Insert table');
    await page.locator('.nf-palette-item', { hasText: 'Insert table' }).first().click();
    const picker = page.locator('.nf-table-size-dialog');
    await picker.waitFor();
    assert.equal(await picker.locator('[data-table-size]').count(), 100);
    await picker.locator('[data-table-size="3:4"]').click();
    const table = page.locator('.nf-editor[data-active="true"] .nf-block-prose table').first();
    await table.waitFor();
    assert.equal(await table.locator('tbody > tr').count(), 3);
    assert.equal(await table.locator('tr').first().locator('th').count(), 4);
    await page.locator('[data-testid="table-toolbar"]').waitFor();

    // The last size is remembered for the session.
    await page.keyboard.press('Meta+k');
    await page.locator('.nf-palette-input').fill('Insert table');
    await page.locator('.nf-palette-item', { hasText: 'Insert table' }).first().click();
    await picker.waitFor();
    assert.equal(
      await picker.locator('[data-table-size="3:4"]').getAttribute('aria-pressed'),
      'true',
    );
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'detached' });

    // Toolbar row/column operations and per-column alignment. Put the caret
    // back in the table after the picker dialog closed.
    await table.locator('th').first().click();
    const toolbar = page.locator('[data-testid="table-toolbar"]');
    await toolbar.waitFor();
    const rows = () => page.locator('.nf-editor[data-active="true"] .nf-block-prose table').first().locator('tr');
    await toolbar.locator('[data-action="row-below"]').click();
    assert.equal(await rows().count(), 4);
    // Delete a body row, not the header: the caret is still in the header cell.
    await table.locator('tbody > tr').nth(1).locator('td').first().click();
    await toolbar.waitFor();
    await toolbar.locator('[data-action="row-delete"]').click();
    assert.equal(await rows().count(), 3);
    await toolbar.locator('[data-action="column-right"]').click();
    assert.equal(await rows().first().locator('th').count(), 5);
    await toolbar.locator('[data-action="column-delete"]').click();
    assert.equal(await rows().first().locator('th').count(), 4);
    await toolbar.locator('[data-action="align-center"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"] .nf-block-prose table th')
          ?.getAttribute('style')
          ?.includes('center') === true,
    );
    await h.screenshot(artifactsPath('special-text', 'table-toolbar-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Paragraph above/below: one paragraph in the same block body, the caret
    // moves into it, and one undo removes exactly that paragraph.
    const tableCard = page
      .locator('.nf-editor[data-active="true"] [data-block-card]')
      .filter({ has: page.locator('.nf-block-prose table') })
      .first();
    const tableBlockId = await tableCard.getAttribute('data-block-card');
    assert.equal(typeof tableBlockId, 'string');
    const baseChildren = (await proseCaretInfo(tableBlockId)).children;
    const baseParagraphs = baseChildren.filter((tag) => tag === 'p').length;
    const cell = table.locator('tbody > tr').nth(1).locator('td').last();
    await cell.click();
    await toolbar.waitFor();
    await toolbar.locator('[data-action="paragraph-above"]').click();
    await page.waitForFunction(
      ({ block, expected }) => {
        const prose = document.querySelector(`[data-block-card="${block}"] .nf-block-prose`);
        const container = prose?.querySelector('[data-node-view-content-react]') ?? prose;
        return container !== null && container.querySelectorAll(':scope > p').length === expected;
      },
      { block: tableBlockId, expected: baseParagraphs + 1 },
      { timeout: 5000 },
    );
    const above = await proseCaretInfo(tableBlockId);
    assert.equal(above.children.length, baseChildren.length + 1);
    assert.equal(above.index, above.tableIndex - 1, 'the caret is in the paragraph above');
    assert.equal(await selectedBlockId(), tableBlockId, 'the block never jumps');
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      ({ block, expected }) => {
        const prose = document.querySelector(`[data-block-card="${block}"] .nf-block-prose`);
        const container = prose?.querySelector('[data-node-view-content-react]') ?? prose;
        return container !== null && container.querySelectorAll(':scope > p').length === expected;
      },
      { block: tableBlockId, expected: baseParagraphs },
      { timeout: 5000 },
    );

    await cell.click();
    await toolbar.waitFor();
    await toolbar.locator('[data-action="paragraph-below"]').click();
    await page.waitForFunction(
      ({ block, expected }) => {
        const prose = document.querySelector(`[data-block-card="${block}"] .nf-block-prose`);
        const container = prose?.querySelector('[data-node-view-content-react]') ?? prose;
        return container !== null && container.querySelectorAll(':scope > p').length === expected;
      },
      { block: tableBlockId, expected: baseParagraphs + 1 },
      { timeout: 5000 },
    );
    const below = await proseCaretInfo(tableBlockId);
    assert.equal(below.children.length, baseChildren.length + 1);
    assert.equal(below.index, below.tableIndex + 1, 'the caret is in the paragraph below');
    assert.equal(await selectedBlockId(), tableBlockId, 'the block never jumps');
    await h.screenshot(artifactsPath('special-text-polish', 'table-paragraph-actions-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      ({ block, expected }) => {
        const prose = document.querySelector(`[data-block-card="${block}"] .nf-block-prose`);
        const container = prose?.querySelector('[data-node-view-content-react]') ?? prose;
        return container !== null && container.querySelectorAll(':scope > p').length === expected;
      },
      { block: tableBlockId, expected: baseParagraphs },
      { timeout: 5000 },
    );
    assert.deepEqual((await proseCaretInfo(tableBlockId)).children, baseChildren);

    // Enter is a hard break inside a cell (never a new block).
    const bodyCell = table.locator('tbody > tr').nth(1).locator('td').first();
    await bodyCell.click();
    await page.keyboard.type('a');
    await page.keyboard.press('Enter');
    await page.keyboard.type('b');
    await page.waitForFunction(
      () => {
        const cell = document.querySelector(
          '.nf-editor[data-active="true"] .nf-block-prose table tbody tr:nth-child(2) td',
        );
        return cell?.innerHTML.includes('a<br>b') === true;
      },
      undefined,
      { timeout: 5000 },
    );

    // Tab on the last cell appends a row. The body row's last cell is a known
    // position; the appended row becomes the new last row.
    const beforeTabRows = await rows().count();
    await table.locator('tbody > tr').last().locator('td').last().click();
    await waitCaretSettled();
    await page.keyboard.press('Tab');
    await page.waitForFunction(
      (expected) => {
        const current = document.querySelector(
          '.nf-editor[data-active="true"] .nf-block-prose table',
        );
        return current !== null && current.querySelectorAll('tr').length === expected;
      },
      beforeTabRows + 1,
      { timeout: 5000 },
    );

    // Shift+Tab walks back to the previous cell.
    const appendedCell = await cellAtCaret();
    await page.keyboard.press('Shift+Tab');
    assert.notEqual(await cellAtCaret(), appendedCell, 'Shift+Tab moves to the previous cell');

    // F9: inline → block inside a cell names the reason instead of a dead
    // click. The cell keeps an inline formula and the source stays open.
    // Leave the table first: the contextual toolbar can cover a cell (F8).
    await page
      .locator('.nf-editor[data-active="true"] .nf-prosemirror')
      .click({ position: { x: 2, y: 2 } });
    await waitCaretSettled();
    const formulaCell = table.locator('tbody > tr').nth(1).locator('td').nth(1);
    await formulaCell.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' $z$');
    const cellFormula = formulaCell.locator('[data-type="inline-math"]').first();
    await cellFormula.waitFor();
    await cellFormula.dblclick();
    const cellSource = formulaCell.locator('[data-formula-source]');
    await cellSource.waitFor();
    await formulaCell.locator('[data-testid="toggle-formula-kind"]').click();
    await page
      .locator('[data-sonner-toast]', { hasText: 'stays inline' })
      .first()
      .waitFor({ timeout: 5000 });
    assert.equal(
      await formulaCell.locator('[data-type="inline-math"]').count(),
      1,
      'the formula inside the cell stays inline',
    );
    assert.equal(
      await formulaCell.locator('[data-type="block-math"]').count(),
      0,
      'no block formula was inserted into the cell',
    );
    await cellSource.press('Escape');

    // Typed GFM conversion on the blank paragraph after the last row.
    const typedId = 'st-table-typed';
    await blankBlock(typedId);
    await typeInBlank(typedId, '| A | B |');
    await page.keyboard.press('Enter');
    await page.keyboard.type('| --- | --- |');
    await page.keyboard.press('Enter');
    await page.keyboard.type('| 1 | 2 |');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForSelector(`[data-block-card="${typedId}"] .nf-block-prose table`);
    assert.equal(
      await card(typedId).locator('.nf-block-prose table tr').count(),
      2,
    );
    // F5: the blank trigger paragraph survives below the table and keeps the
    // caret; one undo removes the conversion.
    const typedAfterConvert = await proseCaretInfo(typedId);
    assert.equal(typedAfterConvert.children.at(-1), 'p');
    assert.equal(
      typedAfterConvert.index,
      typedAfterConvert.tableIndex + 1,
      'the caret is in the paragraph below the typed table',
    );
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (block) =>
        document.querySelector(`[data-block-card="${block}"] .nf-block-prose table`) === null,
      typedId,
      { timeout: 5000 },
    );

    // Typing immediately after a typed conversion lands in the document
    // instead of nowhere (F5).
    const typingId = 'st-table-typed-input';
    await blankBlock(typingId);
    await typeInBlank(typingId, '| E | F |');
    await page.keyboard.press('Enter');
    await page.keyboard.type('| --- | --- |');
    await page.keyboard.press('Enter');
    await page.keyboard.type('| 7 | 8 |');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForSelector(`[data-block-card="${typingId}"] .nf-block-prose table`);
    await page.keyboard.type('ZZ');
    await page.waitForFunction(
      (block) => {
        const prose = document.querySelector(`[data-block-card="${block}"] .nf-block-prose`);
        const container = prose?.querySelector('[data-node-view-content-react]') ?? prose;
        const last = container?.lastElementChild ?? null;
        return last?.tagName === 'P' && last.textContent === 'ZZ';
      },
      typingId,
      { timeout: 5000 },
    );
    // The canonical runtime commit is debounced; wait for it before asserting.
    await page.waitForFunction(
      (block) => {
        const content = window.__noteforestTest.structure()?.blocks?.[block]?.content;
        const last = content?.children?.at(-1);
        return last?.type === 'paragraph' && last.children?.[0]?.text === 'ZZ';
      },
      typingId,
      { timeout: 5000 },
    );
    const typedContent = (await ui.structure()).blocks[typingId].content.children;
    assert.equal(typedContent.at(-1)?.type, 'paragraph');
    assert.equal(typedContent.at(-1)?.children?.[0]?.text, 'ZZ');
    await h.screenshot(artifactsPath('sentinel-fixes', 'gfm-typed-caret-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Cmd+Enter converts an explicit paragraph run without the blank line.
    const cmdId = 'st-table-cmd';
    await blankBlock(cmdId);
    await typeInBlank(cmdId, '| C | D |');
    await page.keyboard.press('Enter');
    await page.keyboard.type('| --- | --- |');
    await page.keyboard.press('Enter');
    await page.keyboard.type('| 5 | 6 |');
    await page.keyboard.press('Meta+Enter');
    await page.waitForSelector(`[data-block-card="${cmdId}"] .nf-block-prose table`);
    assert.equal(await card(cmdId).locator('.nf-block-prose table tr').count(), 2);
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (block) =>
        document.querySelector(`[data-block-card="${block}"] .nf-block-prose table`) === null,
      cmdId,
      { timeout: 5000 },
    );

    // GFM paste conversion.
    const pasteId = 'st-table-paste';
    await blankBlock(pasteId);
    await focusProse(pasteId);
    await h.writeClipboard('| X | Y |\n| --- | --- |\n| 3 | 4 |');
    await page.keyboard.press('Meta+v');
    await page.waitForSelector(`[data-block-card="${pasteId}"] .nf-block-prose table`);
    assert.equal(
      await card(pasteId).locator('.nf-block-prose table tr').count(),
      2,
    );

    // Copy as Markdown escapes pipes, keeps <br> and writes the alignment row.
    await card(pasteId).locator('.nf-block-prose table th').first().click();
    await page.locator('[data-testid="table-toolbar"]').locator('[data-action="align-right"]').click();
    await page.locator('[data-testid="table-toolbar"]').locator('[data-action="toggle-source"]').click();
    const source = page.locator('[data-table-source]');
    await source.waitFor();
    assert.equal(
      (await source.innerText()).trim(),
      '| X | Y |\n| ---: | --- |\n| 3 | 4 |',
    );
    await page.locator('[data-testid="table-toolbar"]').locator('[data-action="copy-markdown"]').click();
    await page.waitForFunction(
      () => document.querySelector('[data-action="copy-markdown"]')?.textContent?.includes('Copied') === true,
      undefined,
      { timeout: 5000 },
    );
    assert.equal(await h.clipboardText(), '| X | Y |\n| ---: | --- |\n| 3 | 4 |');
    await h.screenshot(artifactsPath('special-text', 'table-source-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // A wide table scrolls inside the card; the card does not grow.
    const wideId = 'st-table-wide';
    await blankBlock(wideId);
    await focusProse(wideId);
    const wide = [
      '| Header one | Header two | Header three | Header four | Header five | Header six | Header seven |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| alpha beta gamma | delta epsilon | zeta eta | theta iota | kappa lambda | mu nu xi | omicron pi |',
    ].join('\n');
    await h.writeClipboard(wide);
    await page.keyboard.press('Meta+v');
    await page.waitForSelector(`[data-block-card="${wideId}"] .nf-block-prose table`);
    const geometry = await page.evaluate((block) => {
      const table = document.querySelector(
        `[data-block-card="${block}"] .nf-block-prose .tableWrapper`,
      );
      const inner = table?.querySelector('table');
      const card = document.querySelector(`[data-block-card="${block}"]`);
      if (table === null || table === undefined || inner === null || inner === undefined) {
        return null;
      }
      return {
        overflow: getComputedStyle(table).overflowX,
        wrapperWidth: table.clientWidth,
        scrollWidth: inner.scrollWidth,
        cardWidth: card?.getBoundingClientRect().width ?? 0,
        tableWidth: inner.getBoundingClientRect().width,
      };
    }, wideId);
    assert.ok(geometry !== null);
    assert.equal(geometry.overflow, 'auto');
    assert.ok(geometry.scrollWidth > geometry.wrapperWidth, 'the table overflows its wrapper');
    assert.ok(geometry.tableWidth >= geometry.scrollWidth - 1);
    await h.screenshot(artifactsPath('special-text', 'table-scroll-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });

  it('D3: block menu is grouped, renames Focus to Edit and inserts a table', async () => {
    const env = isolated('special-text-menu');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const blockId = 'st-menu-target';
    await blankBlock(blockId);
    await ui.openBlockMenu(blockId);
    const ids = await page
      .locator('.nf-menu [data-menu-entry]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-menu-entry')));
    assert.deepEqual(ids, [
      'focus',
      'insert-image',
      'insert-table',
      'add-child',
      'add-sibling',
      'split-at-caret',
      'merge-previous',
      'link-reference',
      'move',
      'move-up',
      'move-down',
      'delete',
    ]);
    assert.equal(
      (await page.locator('[data-menu-entry="focus"]').innerText()).trim(),
      'Edit block',
    );
    assert.match(
      (await page.locator('[data-menu-entry="delete"]').innerText()).trim(),
      /^Delete block/,
    );

    // Insert table uses the same size dialog as the palette and lands in the
    // block that opened the menu.
    await page.getByRole('menuitem', { name: /^Insert table/ }).click();
    const picker = page.locator('.nf-table-size-dialog');
    await picker.waitFor();
    assert.equal(await picker.locator('input[type="checkbox"]').count(), 0);
    await picker.locator('[data-table-size="2:2"]').click();
    const table = card(blockId).locator('.nf-block-prose table');
    await table.waitFor();
    assert.equal(await table.locator('tr').count(), 2);
    assert.equal(await table.locator('tr').first().locator('th').count(), 2);
    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });

  it('D2: Page Read keeps its fixed table rendering', async () => {
    const env = isolated('special-text-page-table');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();
    await page.keyboard.press('Meta+3');
    await page.locator('.nf-editor[data-active="true"] .nf-page-view').waitFor();
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-sheet');
    await page.locator('.nf-page-view table.nf-table').first().waitFor({ timeout: 15000 });
    assert.equal(
      await page.locator('.nf-page-view .tableWrapper').count(),
      0,
      'Page Read never mounts the Continuous table wrapper',
    );
    assert.equal(
      await page.locator('.nf-page-view table.nf-table').count() > 0,
      true,
      'the page keeps its own fixed table rendering',
    );
    await h.screenshot(artifactsPath('special-text', 'page-table-neutral-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });
});
