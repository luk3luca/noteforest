import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath, killTestAppsUnder } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageDocument, paragraph, writePagePackage } from '../support/page-fixtures.mjs';

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
/** VH1 evidence (part B): the refused note with its Details open. */
const hardeningDir = artifactsPath('v1-hardening');
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

/**
 * VH1, part B: the table-cell load guard.
 *
 * The editor's table cells are inline-only. A canonical document whose cell
 * holds block content opens in the existing unreadable/recovery state instead of
 * being flattened on load (which destroyed the content on the first save), and
 * opening it never writes `document.json`. An ordinary inline-only table is
 * unaffected.
 */
describe('table cell guard (VH1)', () => {
  before(async () => {
    killTestAppsUnder(tempRoot);
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
    await mkdir(hardeningDir, { recursive: true });
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

  /** A cell with exactly one paragraph: the shape the editor produces. */
  function inlineCell(type, text) {
    return { type, children: [paragraph(text)] };
  }

  /** A cell with block content: the shape the editor cannot represent. */
  function richCell(texts) {
    return { type: 'tableCell', children: texts.map((text) => paragraph(text)) };
  }

  /** Click at the far right of a cell so the caret lands after its text. */
  async function clickCellEnd(cell) {
    const box = await cell.boundingBox();
    assert.ok(box !== null, 'the cell has a box');
    await cell.click({ position: { x: box.width - 4, y: box.height / 2 } });
  }

  /** The visible text of one inline-only cell (its single paragraph's text). */
  function cellText(cell) {
    return (cell.children[0]?.children ?? []).map((child) => child.text ?? '').join('');
  }

  function tableDocument({ id, title, bodyCells }) {
    return pageDocument({
      id,
      title,
      blocks: [
        {
          id: `${id}-block`,
          label: 'Table',
          content: {
            type: 'doc',
            children: [
              paragraph('A table follows.'),
              {
                type: 'table',
                children: [
                  {
                    type: 'tableRow',
                    children: [inlineCell('tableHeader', 'Head')],
                  },
                  {
                    type: 'tableRow',
                    children: [
                      { type: 'tableCell', children: bodyCells },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });
  }

  async function openFromLibrary(packagePath) {
    await page.waitForSelector('[data-sidebar-panel="library"] [role="tree"]');
    const row = page.locator(`[data-vault-path="${packagePath}"] [data-library-document="true"]`);
    await row.waitFor({ timeout: 15000 });
    await row.click();
  }

  it('refuses a rich cell, shows Details, and leaves document.json byte-identical', { timeout: 120000 }, async () => {
    const env = ui.isolated('table-guard-rich');
    const packagePath = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'Rich cell',
      tableDocument({
        id: 'rich-cell',
        title: 'Rich cell',
        bodyCells: [paragraph('first line'), paragraph('second line')],
      }),
    );
    const documentPath = join(packagePath, 'document.json');
    const before = await readFile(documentPath);

    await launch(env);
    await page.waitForSelector('[data-sidebar-panel="library"] [role="tree"]');

    // P2: the Library says what opening says. The row carries the same
    // unreadable state and short line as a corrupt note, not a normal row.
    const richRow = row(packagePath);
    await richRow.waitFor({ timeout: 15000 });
    assert.equal(await richRow.getAttribute('data-doc-status'), 'unreadable');
    assert.equal((await rowReason(packagePath)).trim(), 'This note couldn’t be read.');
    assert.match(
      (await richRow.locator('[data-doc-status-label="true"]').innerText()).trim(),
      /^unreadable$/i,
    );
    assert.match((await richRow.getAttribute('title')) ?? '', /table cell holds 2 blocks/);
    await widenSidebar();
    await mkdir(artifactsPath('p2-polish'), { recursive: true });
    await page.screenshot({
      path: join(artifactsPath('p2-polish'), 'library-rich-cell-row.png'),
    });

    await openFromLibrary(packagePath);
    await page.waitForSelector('[data-recovery-surface="true"]', { timeout: 20000 });

    // The existing unreadable state, not an editor: the note never opened.
    assert.equal(
      await page.locator('[data-recovery-surface]').getAttribute('data-recovery-status'),
      'unreadable',
    );
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] [data-block-card]').count(),
      0,
      'no editor mounts for a refused note',
    );
    const reasonCell = page.locator('[data-recovery-reason="true"]');
    const reasonText = (await reasonCell.innerText()).split('\n')[0];
    assert.equal(reasonText, 'The file isn’t valid NoteForest data.');
    assert.doesNotMatch(reasonText, /table cell|paragraph|block/i);

    const details = reasonCell.locator('details[data-details="true"]');
    await details.waitFor();
    assert.equal(await details.locator('summary').innerText(), 'Details');
    await details.locator('summary').click();
    const raw = await details.locator('[data-details-value="true"]').innerText();
    assert.match(raw, /table cell holds 2 blocks \(paragraph\)/);
    assert.match(raw, /blocks\.rich-cell-block\.content/);
    await page.screenshot({ path: join(hardeningDir, 'refused-rich-table-cell-details.png') });

    // Nothing was written: no lock, no migration, no autosave touched the file.
    await page.waitForTimeout(1200);
    const after = await readFile(documentPath);
    assert.equal(Buffer.compare(before, after), 0, 'document.json stays byte-identical');
  });

  it('opens, edits, saves and reloads an ordinary inline-only table', { timeout: 180000 }, async () => {
    const env = ui.isolated('table-guard-inline');
    const packagePath = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'Inline cell',
      tableDocument({
        id: 'inline-cell',
        title: 'Inline cell',
        bodyCells: [paragraph('typed later')],
      }),
    );
    await launch(env);
    await page.waitForSelector('[data-sidebar-panel="library"] [role="tree"]');
    // An inline-only table is a normal note: no unreadable state on its row.
    assert.equal(await row(packagePath).getAttribute('data-doc-status'), 'ok');
    assert.equal(await row(packagePath).locator('[data-doc-reason="true"]').count(), 0);
    await openFromLibrary(packagePath);

    const table = page.locator('.nf-editor[data-active="true"] .nf-block-prose table').first();
    await table.waitFor({ timeout: 20000 });
    assert.equal(await table.locator('tr').count(), 2, 'one header row and one body row render');
    assert.equal(await table.locator('th').count(), 1, 'the header cell renders');
    assert.equal(await table.locator('td').count(), 1, 'the body cell renders');

    const cell = table.locator('td').first();
    await clickCellEnd(cell);
    await page.keyboard.type(' and edited');
    await h.waitSaved();

    // The canonical cell keeps the inline-only shape: one paragraph, not a
    // flattened projection and not a block list.
    const saved = JSON.parse(await readFile(join(packagePath, 'document.json'), 'utf8'));
    const body = saved.blocks['inline-cell-block'].content.children;
    const tableNode = body.find((node) => node.type === 'table');
    const bodyCell = tableNode.children[1].children[0];
    assert.equal(bodyCell.type, 'tableCell');
    assert.equal(bodyCell.children.length, 1, 'one paragraph, one cell');
    assert.equal(bodyCell.children[0].type, 'paragraph');
    assert.match(cellText(bodyCell), /typed later and edited/);

    // Reload from disk: the edit is there and the table is still editable.
    await h.quit();
    await launch(env);
    await openFromLibrary(packagePath);
    const reloaded = page.locator('.nf-editor[data-active="true"] .nf-block-prose table').first();
    await reloaded.waitFor({ timeout: 20000 });
    assert.match(await reloaded.textContent(), /typed later and edited/);
    await clickCellEnd(reloaded.locator('td').first());
    await page.keyboard.type(' again');
    await h.waitSaved();
    const resaved = JSON.parse(await readFile(join(packagePath, 'document.json'), 'utf8'));
    const resavedCell = resaved.blocks['inline-cell-block'].content.children.find(
      (node) => node.type === 'table',
    ).children[1].children[0];
    assert.equal(resavedCell.children.length, 1, 'still one paragraph after the reload');
    assert.match(cellText(resavedCell), /typed later and edited again/);
  });
});
