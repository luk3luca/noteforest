#!/usr/bin/env node
/**
 * Spike-only: rasterizes PDF pages with pdfjs-dist and @napi-rs/canvas.
 * Not part of the M2/M3 gate.
 * Usage: node scripts/raster-pdf.mjs <input.pdf> <output-prefix> [dpi] [pages]
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const input = process.argv[2];
const prefix = process.argv[3];
const dpi = Number(process.argv[4] ?? '150');
const pageSpec = process.argv[5] ?? '';
if (!input || !prefix) {
  console.error('Usage: node scripts/raster-pdf.mjs <input.pdf> <output-prefix> [dpi] [pages]');
  process.exit(2);
}

const pages = pageSpec
  ? pageSpec
      .split(',')
      .flatMap((part) => {
        const [start, end] = part.split('-').map(Number);
        if (end === undefined) return [start];
        return Array.from({ length: end - start + 1 }, (_, index) => start + index);
      })
      .filter((value) => Number.isFinite(value))
  : null;

const data = new Uint8Array(await readFile(resolve(input)));
const loadingTask = getDocument({
  data,
  useSystemFonts: false,
  disableFontFace: true,
  useWorkerFetch: false,
  verbosity: 0,
});
const pdf = await loadingTask.promise;
await mkdir(dirname(resolve(prefix)), { recursive: true });
const selected = pages ?? Array.from({ length: pdf.numPages }, (_, index) => index + 1);
for (const pageNumber of selected) {
  if (pageNumber < 1 || pageNumber > pdf.numPages) continue;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: dpi / 72 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const renderTask = page.render({ canvasContext: context, viewport });
  await renderTask.promise;
  const output = `${prefix}-${String(pageNumber).padStart(3, '0')}.png`;
  await writeFile(output, canvas.toBuffer('image/png'));
  console.log(`${output} ${canvas.width}x${canvas.height}`);
  page.cleanup();
}
await loadingTask.destroy();
