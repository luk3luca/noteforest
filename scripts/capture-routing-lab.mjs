/**
 * Capture the static edge-routing lab at the two design sizes.
 *
 * Usage: node scripts/capture-routing-lab.mjs
 * Output: artifacts/m2e/routing-lab-<variant>-<width>x<height>.png
 */

import { existsSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const lab = pathToFileURL(resolve(root, 'docs/design/edge-routing-lab.html')).href;
const out = resolve(root, 'artifacts/m2e');
const variants = ['v1', 'v2', 'v3', 'v4'];
const sizes = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
];

await mkdir(out, { recursive: true });

/** Reuse any locally cached Chromium when Playwright's pinned build is absent. */
function localChromium() {
  if (process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE']) {
    return process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE'];
  }
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return undefined;
  for (const entry of readdirSync(cache).sort().reverse()) {
    if (!entry.startsWith('chromium-')) continue;
    const binary = resolve(
      cache,
      entry,
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    );
    if (existsSync(binary)) return binary;
  }
  return undefined;
}

const executablePath = localChromium();
const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
for (const variant of variants) {
  for (const size of sizes) {
    const page = await browser.newPage({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
    });
    await page.goto(`${lab}?variant=${variant}`);
    await page.waitForSelector('figure.case');
    await page.screenshot({
      path: resolve(out, `routing-lab-${variant}-${size.width}x${size.height}.png`),
    });
    await page.close();
  }
}
await browser.close();
console.log(`routing-lab screenshots: ${out}`);
