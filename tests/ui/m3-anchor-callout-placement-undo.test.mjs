import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { calloutStackFixture } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3b2c-ui-placement-undo');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const { isolated } = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

async function runtimeHistory() {
  return page.evaluate(() => {
    const current = window.__noteforestTest.state();
    const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
    if (runtime === undefined) return null;
    return {
      lastHistoryOperation: runtime.lastHistoryOperation,
      canUndoText: runtime.canUndoText,
      canRedoText: runtime.canRedoText,
      canUndoStructural: runtime.canUndoStructural,
      canRedoStructural: runtime.canRedoStructural,
      blocks: runtime.blocks,
    };
  });
}

async function waitHistoryState(expected) {
  await page.waitForFunction(
    (conditions) => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      if (runtime === undefined) return false;
      return Object.entries(conditions).every(([key, value]) => runtime[key] === value);
    },
    expected,
    { timeout: 10000 },
  );
}

describe('NoteForest M3h1 callout placement undo', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('preserves the text undo stack when a resize flips a child below', async () => {
    await launch(isolated('placement-undo'));
    await h.setWindowSize(1440, 900);
    const { parentId, shortDirect, longDirect } = await calloutStackFixture(ui);

    // Type in the short child that stays right and in the long child that the
    // resize moves below. Both text events must survive the projection rebuild.
    await h.activeEditor().locator(`[data-block-card="${shortDirect}"] .nf-block-prose`).click();
    await h.waitSelected(shortDirect);
    await page.keyboard.press('End');
    await page.keyboard.type('Z');
    await h.waitEditorText('RZ');
    await h.activeEditor().locator(`[data-block-card="${longDirect}"] .nf-block-prose`).click();
    await h.waitSelected(longDirect);
    await page.keyboard.press('Control+e');
    await page.keyboard.type('Y');
    await h.waitEditorText('full right column width.Y');
    await h.waitSaved();
    await waitHistoryState({
      lastHistoryOperation: 'text',
      canUndoText: true,
      canUndoStructural: true,
      blocks: 11,
    });

    // The long sibling no longer fits: it moves from the right group into the
    // below stack. The placement change is view-only, so the text event must
    // survive the rebuild.
    await h.setWindowSize(960, 900);
    await h.waitLayout({ blocks: 11, arrows: 7 });
    await page.waitForFunction(
      ({ id, child }) => {
        const lane = document.querySelector(`[data-callout-lane="${id}"]`);
        if (lane === null) return false;
        const card = lane.querySelector(`[data-block-card="${child}"]`);
        return card !== null && card.closest('.nf-callout-lane') === lane;
      },
      { id: parentId, child: longDirect },
      { timeout: 10000 },
    );
    await waitHistoryState({
      lastHistoryOperation: 'text',
      canUndoText: true,
      canUndoStructural: true,
      blocks: 11,
    });
    assert.equal((await runtimeHistory()).blocks, 11, 'the placement flip keeps every block');

    // First undo is the last text edit in the moved child, not the unrelated
    // child creation.
    await page.keyboard.press('Meta+z');
    await h.waitEditorText('full right column width.Y', false);
    await h.waitBlockCount(11);
    await h.waitCanonicalBlockCount(11);
    await waitHistoryState({
      lastHistoryOperation: 'text',
      canUndoText: true,
      canUndoStructural: true,
      blocks: 11,
    });

    // The second undo is the earlier text edit in the child that stayed right.
    await page.keyboard.press('Meta+z');
    await h.waitEditorText('RZ', false);
    await h.waitBlockCount(11);
    await h.waitCanonicalBlockCount(11);
    await waitHistoryState({
      lastHistoryOperation: 'text',
      canUndoText: false,
      canUndoStructural: true,
      blocks: 11,
    });

    // The next undo still reaches the previous structural command and removes
    // the long direct child that the placement projection moved below.
    await page.keyboard.press('Meta+z');
    await h.waitBlockCount(10);
    await h.waitCanonicalBlockCount(10);
    assert.ok(
      !(await h.parity()).canonicalIds.includes(longDirect),
      'the structural undo removes the previously created long child',
    );
  });
});
