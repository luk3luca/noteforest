import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright';
import { artifactsPath, root, waitUntil } from '../support/harness.mjs';
import { writePagePackage } from '../support/page-fixtures.mjs';
import { m4c3PackagedSmokeDocument } from '../support/m4c3-fixtures.mjs';
import { inspectPdfFile, textContains } from '../../scripts/lib/pdf.mjs';

/**
 * M4c3 S2-3 — packaged-runtime export smoke.
 *
 * The app is staged outside the repository with only `out/`, its `package.json`,
 * and `node_modules/pdfjs-dist` (the runtime dependency used by `inspectPdf`).
 * The staged app has no path to the repository's node_modules, so a successful
 * hidden-window export plus produced-PDF inspection proves the packaged
 * runtime can run the inspector. A real asar/notarization/signing build is a
 * Docs/Release step; this is the closest asar/packaged harness in the repo.
 */

const outputRoot = artifactsPath('m4c3', 'packaged');
let stagedDir;
let libraryDir;
let supportDir;

async function stageApp() {
  const appSource = resolve(root, 'apps/desktop');
  const staged = await mkdtemp(join(tmpdir(), 'nf-m4c3-package-'));
  await cp(resolve(appSource, 'out'), resolve(staged, 'out'), { recursive: true });
  const packageJson = JSON.parse(await readFile(resolve(appSource, 'package.json'), 'utf8'));
  await writeFile(
    resolve(staged, 'package.json'),
    JSON.stringify(
      {
        name: 'noteforest-packaged-smoke',
        version: packageJson.version,
        private: true,
        main: 'out/main/index.js',
      },
      null,
      2,
    ),
    'utf8',
  );
  const pdfjsSource = resolve(root, 'node_modules/pdfjs-dist');
  const pdfjsStat = await stat(resolve(pdfjsSource, 'package.json')).catch(() => null);
  assert.ok(pdfjsStat !== null, 'pdfjs-dist is installed for the packaged runtime');
  await mkdir(resolve(staged, 'node_modules'), { recursive: true });
  await cp(pdfjsSource, resolve(staged, 'node_modules/pdfjs-dist'), { recursive: true });
  return staged;
}

async function launchPackaged(staged) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: ['.'],
    cwd: staged,
    env: {
      ...env,
      NOTEFOREST_LIBRARY: libraryDir,
      NOTEFOREST_APP_SUPPORT: supportDir,
      NOTEFOREST_E2E: '1',
      NOTEFOREST_ALLOW_SEED: '1',
      NOTEFOREST_E2E_HIDDEN: '1',
    },
  });
  const page = await app.firstWindow();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  await page.waitForFunction(() => window.__noteforestTest?.state().ready === true, undefined, {
    timeout: 20000,
  });
  return { app, page, pageErrors };
}

describe('M4c3 packaged export', () => {
  before(async () => {
    await rm(outputRoot, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });
    stagedDir = await stageApp();
    libraryDir = join(stagedDir, 'library');
    supportDir = join(stagedDir, 'support');
    await mkdir(libraryDir, { recursive: true });
    await mkdir(supportDir, { recursive: true });
  });

  after(async () => {
    if (stagedDir !== undefined) await rm(stagedDir, { recursive: true, force: true });
  });

  it('exports and inspects a PDF from a staged packaged runtime (S2-3)', async () => {
    const { app, page, pageErrors } = await launchPackaged(stagedDir);
    try {
      const { document, assetFiles } = await m4c3PackagedSmokeDocument();
      const packagePath = await writePagePackage(
        libraryDir,
        'Packaged smoke',
        document,
        assetFiles,
      );
      const opened = await page.evaluate(
        (path) => window.__noteforestTest.openPath(path),
        packagePath,
      );
      assert.equal(opened, true, 'the packaged app opens the fixture');
      await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]', {
        timeout: 20000,
      });
      const outputPath = resolve(outputRoot, 'packaged-export.pdf');
      const started = await page.evaluate(
        (input) => window.noteforest.exportPdf(input),
        { packagePath, outputPath },
      );
      assert.equal(started.ok, true, started.message);
      const job = await waitUntil(
        async () => {
          const current = await page.evaluate(
            (id) => window.noteforest.getExportJob(id),
            started.jobId,
          );
          return current !== null && current.status !== 'running' ? current : false;
        },
        'packaged export',
        120000,
      );
      assert.equal(job.status, 'done', job.error?.message ?? 'packaged export succeeds');
      assert.ok(job.pageCount > 0);
      assert.ok(job.timings.measureMs > 0);
      const pdf = await inspectPdfFile(outputPath);
      assert.equal(pdf.pageCount, job.pageCount);
      assert.ok(pdf.text.trim().length > 0, 'the packaged PDF has real text');
      assert.equal(pdf.missingGlyphCount, 0, 'no replacement glyphs');
      assert.ok(
        pdf.pages.some((item) => item.imageCount > 0),
        'the packaged PDF embeds the real image',
      );
      assert.ok(textContains(pdf.text, 'Packaged PDF smoke'), 'the title is extracted');
      assert.ok(textContains(pdf.text, 'packaged_1 = transform'), 'the code text is extracted');
      assert.ok(textContains(pdf.text, 'lambda'), 'the table text is extracted');
      assert.ok(pdf.text.includes('λ'), 'the KaTeX lambda is vector text');
      assert.deepEqual(pageErrors, [], `packaged renderer errors: ${pageErrors.join('; ')}`);
      const dialogs = await app.evaluate(() => globalThis.__nfDialogCalls ?? []);
      assert.deepEqual(dialogs, [], 'the packaged export opened no native dialog');
      assert.ok(
        (await stat(outputPath)).size > 10000,
        'the packaged PDF is a real multi-KB file',
      );
    } finally {
      await app.close().catch(() => undefined);
    }
  });
});
