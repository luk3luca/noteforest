/**
 * Render one PDF page to pixels for test probes (evidence, not the gate).
 *
 * `scripts/raster-pdf.mjs` writes whole pages as PNG for the M4c3 gate; this
 * helper is the in-process variant a test needs when it has to look at a few
 * pixels (the arrowhead band in VF item 4) and write a crop as evidence.
 * Same toolchain: `pdfjs-dist` for the page, `@napi-rs/canvas` for the raster.
 */

import { createCanvas } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

function clampIndex(value, limit) {
  return Math.min(Math.max(Math.round(value), 0), limit - 1);
}

/**
 * Rasterize `pageNumber` at `dpi` (PDF units are 1/72 in, so the render scale is
 * `dpi / 72`). Returns the page size, a patch sampler in canvas pixels, and a
 * crop writer so a test can save the exact evidence it asserted on.
 * `pixelsPerMm` is the only safe mm→canvas factor: PDF user units are points,
 * not millimetres.
 */
export async function renderPdfPage(pdfPath, pageNumber, dpi = 400) {
  const data = new Uint8Array(await readFile(resolve(pdfPath)));
  const loadingTask = getDocument({
    data,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const scale = dpi / 72;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  page.cleanup();
  await loadingTask.destroy();

  const pixel = (x, y) => {
    const column = clampIndex(x, image.width);
    const row = clampIndex(y, image.height);
    const offset = (row * image.width + column) * 4;
    return {
      r: image.data[offset],
      g: image.data[offset + 1],
      b: image.data[offset + 2],
      a: image.data[offset + 3],
    };
  };

  return {
    width: canvas.width,
    height: canvas.height,
    scale,
    /** Canvas pixels per millimetre on the printed sheet. */
    pixelsPerMm: dpi / 25.4,
    pixel,
    /** Mean RGB of a square patch centred on (x, y), in canvas pixels. */
    patch(x, y, radius = 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let column = -radius; column <= radius; column += 1) {
        for (let row = -radius; row <= radius; row += 1) {
          const sample = pixel(x + column, y + row);
          r += sample.r;
          g += sample.g;
          b += sample.b;
          count += 1;
        }
      }
      return {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count),
      };
    },
    /** Write one crop (canvas pixels) as a PNG so the evidence is the assert. */
    async cropPng(path, box) {
      const width = Math.max(1, Math.round(box.width));
      const height = Math.max(1, Math.round(box.height));
      const target = createCanvas(width, height);
      const targetContext = target.getContext('2d');
      targetContext.drawImage(
        canvas,
        Math.round(box.x),
        Math.round(box.y),
        width,
        height,
        0,
        0,
        width,
        height,
      );
      await mkdir(dirname(resolve(path)), { recursive: true });
      await writeFile(resolve(path), target.toBuffer('image/png'));
      return resolve(path);
    },
  };
}
