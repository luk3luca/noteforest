import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath, killTestAppsUnder } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * Data and recovery (DR1, `core` reasons at the boundary).
 *
 * `packages/core` speaks in log sentences (`document.json is not valid JSON`,
 * `a document must keep at least one chapter`). No surface may show one: the
 * library row and the recovery surface keep a short line, and the raw sentence
 * opens under `Details` (copy-plan §E, dialogs.md §3).
 *
 * The boundary itself is unit-tested (`core-reasons.test.ts`,
 * `recovery-library.test.ts`); this suite is the visible proof and the
 * screenshots.
 */

const tempRoot = artifactsPath('data-recovery-temp');
const screenshotDir = artifactsPath('data-recovery');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(env) {
  page = await ui.launch({ ...env, NOTEFOREST_E2E_HIDDEN: '0' });
  await h.setWindowSize(1440, 900);
}

/** A valid note, a damaged one, a newer-schema one, and a missing package. */
async function writeFixtures(env) {
  const library = env.NOTEFOREST_LIBRARY;
  await mkdir(library, { recursive: true });

  await writePagePackage(
    library,
    'Algebra',
    pageDocument({
      id: 'algebra-note',
      title: 'Algebra',
      blocks: [
        {
          id: 'algebra-block',
          label: 'Eigenvalues',
          content: {
            type: 'doc',
            children: [
              { type: 'paragraph', children: [{ type: 'text', text: 'An eigenvalue is a scalar.' }] },
            ],
          },
        },
      ],
    }),
  );

  const broken = await writePagePackage(
    library,
    'Broken note',
    pageDocument({ id: 'broken-note', title: 'Broken note' }),
  );
  await writeFile(join(broken, 'document.json'), '{ "schemaVersion": 2, "id": "broken-note",', 'utf8');

  const newer = await writePagePackage(
    library,
    'From the future',
    pageDocument({ id: 'newer-note', title: 'From the future' }),
  );
  const newerDocument = JSON.parse(await readFile(join(newer, 'document.json'), 'utf8'));
  newerDocument.schemaVersion = 3;
  await writeFile(join(newer, 'document.json'), JSON.stringify(newerDocument, null, 2), 'utf8');

  // A missing package is a folder that looks like one (assets/) with no
  // document.json; an arbitrary folder is not a library row.
  await mkdir(join(library, 'Gone note', 'assets'), { recursive: true });
}

function row(path) {
  return page.locator(`[data-vault-path="${path}"] [data-library-document="true"]`);
}

async function rowReason(path) {
  const element = row(path);
  await element.waitFor({ timeout: 15000 });
  return element.locator('[data-doc-reason="true"]').innerText();
}

/**
 * The default 264 px sidebar ellipsizes a reason line; widen it with the real
 * separator so the evidence shows the whole short line.
 */
async function widenSidebar(pixels = 120) {
  const handle = page.locator('[aria-label="Resize sidebar"]');
  const box = await handle.boundingBox();
  if (box === null) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + pixels, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

describe('core reasons at the boundary', () => {
  before(async () => {
    killTestAppsUnder(tempRoot);
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await h.quit();
    } finally {
      killTestAppsUnder(tempRoot);
    }
  });

  after(async () => {
    killTestAppsUnder(tempRoot);
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('shows short package reasons with the core sentence in Details', { timeout: 120000 }, async () => {
    const env = ui.isolated('reasons');
    await writeFixtures(env);
    await launch(env);
    await page.waitForSelector('[data-sidebar-panel="library"] [role="tree"]');

    const brokenPath = join(env.NOTEFOREST_LIBRARY, 'Broken note');
    const newerPath = join(env.NOTEFOREST_LIBRARY, 'From the future');
    const missingPath = join(env.NOTEFOREST_LIBRARY, 'Gone note');

    // Library row: a list line, never the parse sentence.
    assert.equal(await rowReason(brokenPath), 'This note couldn’t be read.');
    assert.equal(await rowReason(newerPath), 'A newer NoteForest wrote this note.');
    assert.equal(await rowReason(missingPath), 'This note’s file is missing.');
    for (const reason of [
      await rowReason(brokenPath),
      await rowReason(newerPath),
      await rowReason(missingPath),
    ]) {
      assert.doesNotMatch(reason, /document\.json|JSON|schema/i);
    }

    // The row tooltip keeps the technical value for support, not for the line.
    const brokenTitle = await row(brokenPath).getAttribute('title');
    assert.match(brokenTitle ?? '', /document\.json/);
    assert.match(brokenTitle ?? '', /not valid JSON/);
    await widenSidebar();
    await page.screenshot({ path: join(screenshotDir, 'library-row-reason.png') });

    // Open the damaged note: the recovery tab's Reason row is the short line,
    // and Details under it holds the raw sentence.
    await row(brokenPath).click();
    await page.waitForSelector('[data-recovery-surface="true"]', { timeout: 20000 });
    assert.equal(
      await page.locator('[data-recovery-surface]').getAttribute('data-recovery-status'),
      'unreadable',
    );
    const reasonCell = page.locator('[data-recovery-reason="true"]');
    const reasonText = (await reasonCell.innerText()).split('\n')[0];
    assert.equal(reasonText, 'The file isn’t valid NoteForest data.');
    assert.doesNotMatch(reasonText, /document\.json|JSON|schema/i);

    const details = reasonCell.locator('details[data-details="true"]');
    await details.waitFor();
    assert.equal(await details.locator('summary').innerText(), 'Details');
    await details.locator('summary').click();
    const raw = await details.locator('[data-details-value="true"]').innerText();
    assert.match(raw, /not valid JSON/);
    await page.screenshot({ path: join(screenshotDir, 'recovery-reason-details.png') });

    // The visible Details line is copyable text, not a shortened label.
    assert.equal(await details.locator('[data-details-value="true"]').getAttribute('title'), raw);
  });

  it('keeps a newer-schema reason short on the recovery surface too', { timeout: 120000 }, async () => {
    const env = ui.isolated('newer');
    await writeFixtures(env);
    await launch(env);
    await page.waitForSelector('[data-sidebar-panel="library"] [role="tree"]');

    await row(join(env.NOTEFOREST_LIBRARY, 'From the future')).click();
    await page.waitForSelector('[data-recovery-surface="true"]', { timeout: 20000 });
    const reasonCell = page.locator('[data-recovery-reason="true"]');
    const reasonText = (await reasonCell.innerText()).split('\n')[0];
    assert.equal(reasonText, 'A newer NoteForest wrote the file.');
    const details = reasonCell.locator('details[data-details="true"]');
    await details.locator('summary').click();
    const raw = await details.locator('[data-details-value="true"]').innerText();
    assert.match(raw, /newer than this app supports/);
  });
});
