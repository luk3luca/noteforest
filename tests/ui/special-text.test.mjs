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

    // Editing: opening fence + closing row, no idle label.
    assert.equal(await code.locator('[data-code-label]').isVisible(), false);
    await h.screenshot(artifactsPath('special-text', 'code-editing-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // ArrowDown at the end exits to a paragraph and shows the idle state: no
    // fences, a language label and the copy affordance only on hover.
    await card(blockId).locator('pre[data-anchor-kind="code"] code').click();
    await page.keyboard.press('End');
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
    // Copy on hover (an idle affordance; editing hides the header).
    await code.hover();
    const copy = code.locator('[data-code-action="copy"]');
    await copy.waitFor();
    assert.ok(
      (await copy.evaluate((el) => getComputedStyle(el).opacity)) !== '0',
      'the copy button is visible on hover',
    );
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
    await h.screenshot(artifactsPath('special-text', 'code-idle-1440x900.png'), {
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
    await card(blockId).locator('pre[data-anchor-kind="code"] code').click();
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
    await card(blockId).locator('pre[data-anchor-kind="code"] code').click();
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
      (await card(blockId).locator('.nf-block-prose').first().innerText()).includes('`'),
      false,
      'the toggling backticks never enter the text',
    );

    // ⇧` inserts a literal backtick.
    await page.keyboard.press('Shift+Backquote');
    assert.equal(
      (await card(blockId).locator('.nf-block-prose').first().innerText()).includes('`'),
      true,
    );

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
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (block) =>
        document.querySelector(`[data-block-card="${block}"] .nf-block-prose table`) === null,
      typedId,
      { timeout: 5000 },
    );

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
