#!/usr/bin/env node
/**
 * Verifies a Page PDF against a fixture document using pdfjs-dist.
 * Usage: node scripts/verify-pdf.mjs fixtures/<fixture>.json <pdf-path>
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectPdfFile } from './lib/pdf.mjs';
import { checkPageSize, checkTexts } from './lib/verify.mjs';

const fixturePath = process.argv[2];
const pdfPath = process.argv[3];
if (!fixturePath || !pdfPath) {
  console.error('Usage: node scripts/verify-pdf.mjs <fixture.json> <pdf>');
  process.exit(2);
}

const document = JSON.parse(await readFile(resolve(fixturePath), 'utf8'));
const pdf = await inspectPdfFile(resolve(pdfPath));
const texts = checkTexts(document, pdf);
const pageSize = checkPageSize(document, pdf);
const imagePages = pdf.pages.filter((page) => page.imageCount > 0).map((page) => page.pageNumber);
const totalPaths = pdf.pages.reduce((sum, page) => sum + (page.pathCount ?? 0), 0);

console.log(
  JSON.stringify(
    {
      pdf: resolve(pdfPath),
      fixture: document.title,
      pageCount: pdf.pageCount,
      pageSizeMm: pdf.pages[0]
        ? [Number(pdf.pages[0].widthMm.toFixed(2)), Number(pdf.pages[0].heightMm.toFixed(2))]
        : null,
      textLength: pdf.text.length,
      textItems: pdf.textItems.length,
      imagePages,
      totalVectorPaths: totalPaths,
      missingGlyphCount: pdf.missingGlyphCount,
      texts: { pass: texts.pass, checkedBlocks: texts.checkedBlocks, failures: texts.failures },
      pageSize: { pass: pageSize.pass, failures: pageSize.failures },
    },
    null,
    2,
  ),
);

if (!texts.pass || !pageSize.pass || pdf.missingGlyphCount > 0) process.exitCode = 1;
