import { readFile } from 'node:fs/promises';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function inspectPdfFile(path) {
  const data = new Uint8Array(await readFile(path));
  return inspectPdf(data);
}

export async function inspectPdf(data) {
  const loadingTask = getDocument({
    data,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  const pages = [];
  const textItems = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const parts = [];
      let textItemCount = 0;
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        textItemCount += 1;
        parts.push(item.str);
        textItems.push({
          text: item.str,
          x: item.transform[4] ?? 0,
          y: item.transform[5] ?? 0,
          width: item.width,
          height: item.height,
          pageNumber,
        });
      }
      let imageCount = 0;
      let pathCount = 0;
      let hasOperatorList = true;
      try {
        const operators = await page.getOperatorList();
        for (const fn of operators.fnArray) {
          if (
            fn === OPS.paintImageXObject ||
            fn === OPS.paintInlineImageXObject ||
            fn === OPS.paintImageMaskXObject ||
            fn === OPS.paintImageXObjectRepeat
          ) {
            imageCount += 1;
          } else if (fn === OPS.constructPath) {
            pathCount += 1;
          }
        }
      } catch {
        // Operator-list extraction is optional evidence.
        hasOperatorList = false;
      }
      pages.push({
        pageNumber,
        widthPt: viewport.width,
        heightPt: viewport.height,
        widthMm: (viewport.width * 25.4) / 72,
        heightMm: (viewport.height * 25.4) / 72,
        text: parts.join(' '),
        textItemCount,
        imageCount,
        pathCount,
        hasOperatorList,
      });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  const text = pages.map((page) => page.text).join('\n');
  return {
    pageCount: pdf.numPages,
    pages,
    text,
    textItems,
    missingGlyphCount: (text.match(/\uFFFD/g) ?? []).length,
  };
}

export function normalizeText(value) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function textContains(extracted, expected) {
  const haystack = normalizeText(extracted);
  const needle = normalizeText(expected);
  if (!needle) return true;
  if (haystack.includes(needle)) return true;
  const tokens = needle.split(' ').filter(Boolean);
  let index = 0;
  for (const token of haystack.split(' ')) {
    if (token === tokens[index]) index += 1;
    if (index === tokens.length) return true;
  }
  return false;
}
