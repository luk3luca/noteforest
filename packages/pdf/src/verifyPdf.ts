export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber: number;
}

export interface PdfPageInfo {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  widthMm: number;
  heightMm: number;
  text: string;
  /** Non-empty extracted text items (S2-1 ink check). */
  textItemCount: number;
  /** Image XObjects painted on the page (an image-only page is not blank). */
  imageCount: number;
  /** Vector path constructions on the page (arrows, borders, trunks). */
  pathCount: number;
  /** False when the operator list could not be read; counts are then unknown. */
  hasOperatorList: boolean;
}

export interface PdfInspection {
  pageCount: number;
  pages: PdfPageInfo[];
  text: string;
  textItems: PdfTextItem[];
  missingGlyphCount: number;
}

interface PdfjsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/**
 * Extracts page metadata and the text layer with pdfjs-dist. This is the
 * spike's replacement for Poppler's pdftotext/pdftoppm, which are not
 * installed on the reference machine.
 */
export async function inspectPdf(data: Uint8Array): Promise<PdfInspection> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { OPS } = pdfjs;
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  const pages: PdfPageInfo[] = [];
  const textItems: PdfTextItem[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const parts: string[] = [];
      let textItemCount = 0;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const textItem = item as PdfjsTextItem;
        if (textItem.str.length === 0) continue;
        textItemCount += 1;
        parts.push(textItem.str);
        textItems.push({
          text: textItem.str,
          x: textItem.transform[4] ?? 0,
          y: textItem.transform[5] ?? 0,
          width: textItem.width,
          height: textItem.height,
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
        // Operator-list extraction is optional; text remains authoritative.
        hasOperatorList = false;
      }
      const text = parts.join(' ');
      pages.push({
        pageNumber,
        widthPt: viewport.width,
        heightPt: viewport.height,
        widthMm: (viewport.width * 25.4) / 72,
        heightMm: (viewport.height * 25.4) / 72,
        text,
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
  const fullText = pages.map((page) => page.text).join('\n');
  const missingGlyphCount = (fullText.match(/\uFFFD/g) ?? []).length;
  return {
    pageCount: pdf.numPages,
    pages,
    text: fullText,
    textItems,
    missingGlyphCount,
  };
}

export function normalizeText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s*([,.;:!?])\s*/g, '$1 ')
    .trim()
    .toLowerCase();
}

export function textContains(extracted: string, expected: string): boolean {
  const haystack = normalizeText(extracted);
  const needle = normalizeText(expected);
  if (!needle) return true;
  if (haystack.includes(needle)) return true;
  // Line-break normalization: every token must appear in order.
  const tokens = needle.split(' ').filter(Boolean);
  let index = 0;
  for (const token of haystack.split(' ')) {
    if (token === tokens[index]) index += 1;
    if (index === tokens.length) return true;
  }
  return false;
}
