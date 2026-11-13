import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addTopLevelBlock, textDoc } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('backspace-boundary-ui');
const evidenceRoot = artifactsPath('backspace-boundary');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const { isolated, structure } = ui;
let page;

const FIRST_ID = 'backspace-boundary-first';
const SECOND_ID = 'backspace-boundary-second';
const EMPTY_ID = 'backspace-boundary-empty';

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

async function selectedBlockId() {
  return (await h.activeRuntimeInfo()).selectedBlockId;
}

/** The block that owns the collapsed DOM caret. */
async function domCaretBlockId() {
  return page.evaluate(() => {
    const selection = window.getSelection();
    if (selection === null || selection.rangeCount === 0) return null;
    const node = selection.getRangeAt(0).startContainer;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return element?.closest('[data-block-card]')?.getAttribute('data-block-card') ?? null;
  });
}

/**
 * Click a block body and put the caret at the very start of its first line.
 * The click lands before the first character (the editor's native Home key is
 * not bound on macOS, so it cannot be used here). The DOM probe also covers an
 * empty block, where `caretLocation()` is null by contract (there is no text
 * leaf to map).
 */
async function placeCaretAtStart(blockId) {
  const card = page.locator(
    `.nf-editor[data-active="true"] [data-block-card="${blockId}"]`,
  );
  await card.locator('.nf-block-prose p').first().click({ position: { x: 2, y: 8 } });
  await h.waitSelected(blockId);
  await page.waitForFunction(
    (expected) => {
      const selection = window.getSelection();
      if (selection === null || selection.rangeCount === 0) return false;
      const node = selection.getRangeAt(0).startContainer;
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return element?.closest('[data-block-card]')?.getAttribute('data-block-card') === expected;
    },
    blockId,
    { timeout: 10000 },
  );
}

describe('NoteForest plain Backspace block boundary', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(evidenceRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(evidenceRoot, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('keeps Backspace and the caret inside the active block', async () => {
    await launch(isolated('boundary'));
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    await addTopLevelBlock(ui, FIRST_ID, textDoc('Alpha boundary'));
    await addTopLevelBlock(ui, SECOND_ID, textDoc('Beta boundary'));
    await addTopLevelBlock(ui, EMPTY_ID, {
      type: 'doc',
      children: [{ type: 'paragraph' }],
    });
    await h.waitCanonicalBlockCount(10);
    await h.waitSaved();
    await h.waitLayout({ blocks: 10 });

    const before = await structure();
    const beforeCount = Object.keys(before.blocks).length;
    const firstBefore = structuredClone(before.blocks[FIRST_ID]);
    const secondBefore = structuredClone(before.blocks[SECOND_ID]);
    const emptyBefore = structuredClone(before.blocks[EMPTY_ID]);

    // A collapsed caret at the very start of a non-empty block: Backspace
    // neither joins the previous block nor moves focus.
    await placeCaretAtStart(SECOND_ID);
    assert.deepEqual(
      await page.evaluate(() => window.__noteforestTest.caretLocation()),
      { blockId: SECOND_ID, nodePath: [0, 0], offset: 0 },
      'the caret starts at the very start of the second block',
    );
    const secondCard = h
      .activeEditor()
      .locator(`[data-block-card="${SECOND_ID}"]`);
    await secondCard.scrollIntoViewIfNeeded();
    await h.screenshot(`${evidenceRoot}/two-block-boundary-1440x900.png`, {
      width: 1440,
      height: 900,
    });

    await page.keyboard.press('Backspace');

    assert.equal(await selectedBlockId(), SECOND_ID, 'the second block stays active');
    assert.equal(await domCaretBlockId(), SECOND_ID, 'the caret stays in the second block');
    assert.deepEqual(
      await page.evaluate(() => window.__noteforestTest.caretLocation()),
      { blockId: SECOND_ID, nodePath: [0, 0], offset: 0 },
      'the caret stays at the very start of the second block',
    );
    const afterNonEmpty = await structure();
    assert.equal(
      Object.keys(afterNonEmpty.blocks).length,
      beforeCount,
      'Backspace deletes no block',
    );
    assert.deepEqual(
      afterNonEmpty.blocks[FIRST_ID],
      firstBefore,
      'the previous block is unchanged',
    );
    assert.deepEqual(
      afterNonEmpty.blocks[SECOND_ID],
      secondBefore,
      'the active block is unchanged',
    );

    // The same boundary on an empty block: it stays, no previous focus, and
    // the caret remains inside it.
    await placeCaretAtStart(EMPTY_ID);
    assert.equal(
      await page.evaluate(() => window.__noteforestTest.caretLocation()),
      null,
      'an empty block has no text caret location by contract',
    );
    await page.keyboard.press('Backspace');
    assert.equal(await selectedBlockId(), EMPTY_ID, 'the empty block stays active');
    assert.equal(await domCaretBlockId(), EMPTY_ID, 'the caret stays in the empty block');
    const afterEmpty = await structure();
    assert.equal(
      Object.keys(afterEmpty.blocks).length,
      beforeCount,
      'Backspace deletes no empty block',
    );
    assert.deepEqual(
      afterEmpty.blocks[SECOND_ID],
      secondBefore,
      'the previous block is still unchanged',
    );
    assert.deepEqual(
      afterEmpty.blocks[EMPTY_ID],
      emptyBefore,
      'the empty block body is unchanged',
    );

    // Away from the block start the native keymap keeps editing normally:
    // type one character, Backspace deletes it, and the caret never leaves.
    await page.keyboard.type('x');
    await h.waitSaved();
    assert.equal(
      (await page.evaluate(() => window.__noteforestTest.caretLocation()))?.offset,
      1,
      'typing advances the caret inside the block',
    );
    const typed = await structure();
    assert.ok(
      JSON.stringify(typed.blocks[EMPTY_ID]).includes('"text":"x"'),
      'the typed character is in the active block',
    );
    await page.keyboard.press('Backspace');
    await h.waitSaved();
    assert.equal(await selectedBlockId(), EMPTY_ID, 'native Backspace stays in the block');
    assert.equal(await domCaretBlockId(), EMPTY_ID, 'native Backspace keeps the caret in the block');
    const afterNative = await structure();
    assert.equal(
      Object.keys(afterNative.blocks).length,
      beforeCount,
      'native Backspace deletes no block',
    );
    assert.deepEqual(
      afterNative.blocks[EMPTY_ID].content,
      emptyBefore.content,
      'native Backspace only removed the typed character',
    );
    assert.equal(afterNative.blocks[EMPTY_ID].id, EMPTY_ID);
    assert.deepEqual(
      afterNative.blocks[SECOND_ID],
      secondBefore,
      'the previous block stayed unchanged through native editing',
    );
  });
});
