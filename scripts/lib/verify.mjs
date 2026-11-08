import { normalizeText, textContains } from './pdf.mjs';

const MM_PER_PX = 25.4 / 96;

export function pxToMm(px) {
  return px * MM_PER_PX;
}

function inlineText(node) {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return ' ';
  if (node.type === 'inlineMath') return '';
  if (node.type === 'image') return '';
  return (node.children ?? []).map(inlineText).join('');
}

function blockText(node, out) {
  switch (node.type) {
    case 'doc':
    case 'blockquote':
      for (const child of node.children ?? []) blockText(child, out);
      break;
    case 'paragraph':
    case 'heading':
      out.push(inlineText(node));
      break;
    case 'bulletList':
    case 'orderedList':
    case 'listItem':
      for (const child of node.children ?? []) blockText(child, out);
      break;
    case 'codeBlock':
      out.push(typeof node.attrs?.text === 'string' ? node.attrs.text : '');
      break;
    case 'mathBlock':
      out.push('');
      break;
    case 'table':
    case 'tableRow':
    case 'tableCell':
      for (const child of node.children ?? []) blockText(child, out);
      break;
    case 'image':
      out.push('');
      break;
    default:
      for (const child of node.children ?? []) blockText(child, out);
  }
}

export function blockPlainText(block) {
  const out = [];
  blockText(block.content, out);
  return out.filter((line) => normalizeText(line).length > 0).join('\n');
}

export function documentTexts(document) {
  return Object.entries(document.blocks).map(([blockId, block]) => ({
    blockId,
    label: block.label ?? null,
    text: blockPlainText(block),
  }));
}

export function checkPageCount(state, pdf) {
  return {
    pass: state.pageCount === pdf.pageCount,
    expected: state.pageCount,
    actual: pdf.pageCount,
  };
}

const PAGE_DIMENSIONS_MM = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
};

export const DEFAULT_PAGE_SETUP = Object.freeze({
  size: 'A4',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
});

function pageDimensionsMm(setup) {
  const size = PAGE_DIMENSIONS_MM[setup?.size] ?? PAGE_DIMENSIONS_MM.A4;
  return setup?.orientation === 'portrait'
    ? { widthMm: size.width, heightMm: size.height }
    : { widthMm: size.height, heightMm: size.width };
}

export function checkPageSize(pdf, setup = DEFAULT_PAGE_SETUP, toleranceMm = 1.5) {
  const { widthMm: expectedWidth, heightMm: expectedHeight } = pageDimensionsMm(setup);
  const failures = [];
  for (const page of pdf.pages) {
    if (Math.abs(page.widthMm - expectedWidth) > toleranceMm) {
      failures.push(`page ${page.pageNumber} width ${page.widthMm.toFixed(2)} mm`);
    }
    if (Math.abs(page.heightMm - expectedHeight) > toleranceMm) {
      failures.push(`page ${page.pageNumber} height ${page.heightMm.toFixed(2)} mm`);
    }
  }
  return {
    pass: failures.length === 0,
    failures,
    expected: `${expectedWidth} × ${expectedHeight} mm`,
    actual: `${pdf.pages[0]?.widthMm.toFixed(2)} × ${pdf.pages[0]?.heightMm.toFixed(2)} mm`,
  };
}

export function checkTexts(document, pdf) {
  const failures = [];
  for (const entry of documentTexts(document)) {
    if (!entry.text) continue;
    if (!textContains(pdf.text, entry.text)) {
      failures.push({
        blockId: entry.blockId,
        missing: entry.text.slice(0, 120),
      });
    }
  }
  const missingGlyphs = pdf.missingGlyphCount;
  return {
    pass: failures.length === 0 && missingGlyphs === 0,
    failures,
    missingGlyphCount: missingGlyphs,
    checkedBlocks: documentTexts(document).length,
  };
}

export function checkContinuations(state, pdf) {
  const failures = [];
  let checked = 0;
  for (const page of state.pages) {
    const pageText = pdf.pages[page.pageNumber - 1]?.text ?? '';
    for (const out of page.continuationOut) {
      checked += 1;
      if (!textContains(pageText, `continues on page ${out.toPage}`)) {
        failures.push(`page ${page.pageNumber}: missing "continues on page ${out.toPage}" for ${out.blockId}`);
      }
    }
    for (const incoming of page.continuationIn) {
      checked += 1;
      if (!textContains(pageText, `continued from page ${incoming.fromPage}`)) {
        failures.push(`page ${page.pageNumber}: missing "continued from page ${incoming.fromPage}" for ${incoming.blockId}`);
      }
      if (!textContains(pageText, incoming.ghostParent.blockLabel)) {
        failures.push(`page ${page.pageNumber}: missing ghost label ${incoming.ghostParent.blockLabel}`);
      }
    }
  }
  return { pass: failures.length === 0, failures, checked };
}

export function checkSegmentAtomicity(state) {
  const failures = [];
  for (const block of state.blocks) {
    const fragments = state.pages
      .flatMap((page) =>
        page.fragments
          .filter((fragment) => fragment.blockId === block.blockId)
          .map((fragment) => ({ ...fragment, pageNumber: page.pageNumber })),
      )
      .sort((a, b) => a.pageNumber - b.pageNumber);
    if (fragments.length === 0) continue;
    if (fragments[0].startSegment !== 0) {
      failures.push(`${block.blockId}: first fragment starts at ${fragments[0].startSegment}`);
    }
    if (fragments[fragments.length - 1].endSegment !== block.segmentCount) {
      failures.push(`${block.blockId}: last fragment ends at ${fragments[fragments.length - 1].endSegment}/${block.segmentCount}`);
    }
    for (let index = 1; index < fragments.length; index += 1) {
      if (fragments[index].startSegment !== fragments[index - 1].endSegment) {
        failures.push(`${block.blockId}: gap between pages ${fragments[index - 1].pageNumber} and ${fragments[index].pageNumber}`);
      }
    }
    for (const segment of block.segments) {
      const containing = fragments.filter(
        (fragment) => fragment.startSegment <= segment.index && segment.index < fragment.endSegment,
      );
      if (containing.length !== 1) {
        failures.push(`${block.blockId}: segment ${segment.index} (${segment.kind}) appears on ${containing.length} pages`);
      }
    }
  }
  return { pass: failures.length === 0, failures: failures.slice(0, 20) };
}

export function checkChapterStarts(state, document) {
  const failures = [];
  for (const chapter of document.chapters) {
    const pages = state.pages.filter((page) => page.chapterId === chapter.id);
    if (pages.length === 0) {
      if (chapter.topLevelBlockIds.length > 0) failures.push(`${chapter.id}: no pages`);
      continue;
    }
    if (!pages[0].isChapterStart || Math.abs(pages[0].yStart) > 0.5) {
      failures.push(`${chapter.id}: first page ${pages[0].pageNumber} does not start the chapter at y=0`);
    }
    for (const page of pages.slice(1)) {
      if (page.isChapterStart) failures.push(`${chapter.id}: page ${page.pageNumber} is marked chapter start`);
    }
  }
  return { pass: failures.length === 0, failures };
}

export function checkNoBlankPages(state) {
  const failures = state.pages.filter((page) => page.fragmentCount === 0);
  return { pass: failures.length === 0, blankPages: failures.map((page) => page.pageNumber) };
}

export function checkOverlapsAndGap(state, minimumGap = 16) {
  const groups = new Map();
  for (const block of state.blocks) {
    const list = groups.get(block.chapterId) ?? [];
    list.push(block);
    groups.set(block.chapterId, list);
  }
  const overlaps = [];
  const chapterResults = [];
  let globalMinGap = Number.POSITIVE_INFINITY;
  let globalMinPair = null;
  for (const [chapterId, blocks] of groups) {
    let minGap = Number.POSITIVE_INFINITY;
    let minPair = null;
    const chapterOverlaps = [];
    for (let i = 0; i < blocks.length; i += 1) {
      for (let j = i + 1; j < blocks.length; j += 1) {
        const a = blocks[i];
        const b = blocks[j];
        const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
        const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
        const gap = dx === 0 && dy === 0 ? 0 : Math.hypot(dx, dy);
        if (gap < minGap) {
          minGap = gap;
          minPair = [a.blockId, b.blockId];
        }
        if (dx === 0 && dy === 0) chapterOverlaps.push([a.blockId, b.blockId]);
      }
    }
    if (minGap < globalMinGap) {
      globalMinGap = minGap;
      globalMinPair = minPair;
    }
    overlaps.push(...chapterOverlaps);
    chapterResults.push({
      chapterId,
      blocks: blocks.length,
      minGap: Number.isFinite(minGap) ? Math.round(minGap * 100) / 100 : null,
      minPair,
      overlaps: chapterOverlaps.slice(0, 10),
    });
  }
  const pass =
    overlaps.length === 0 &&
    chapterResults.every((chapter) => chapter.minGap === null || chapter.minGap >= minimumGap);
  return {
    pass,
    overlaps: overlaps.slice(0, 20),
    minGap: Number.isFinite(globalMinGap) ? Math.round(globalMinGap * 100) / 100 : null,
    minPair: globalMinPair,
    chapters: chapterResults,
  };
}

export function checkAnchorAlignment(state, tolerancePx = 2) {
  const failures = [];
  let checked = 0;
  for (const block of state.blocks) {
    if (!block.anchorId || !block.parentBlockId) continue;
    const attachment = state.anchors.find(
      (anchor) => anchor.anchorId === block.anchorId && anchor.blockId === block.parentBlockId,
    );
    if (!attachment) {
      failures.push(`missing anchor attachment ${block.anchorId}`);
      continue;
    }
    if (attachment.state !== 'resolved' || !attachment.rect) continue;
    checked += 1;
    const deltaX = Math.abs(block.x - attachment.rect.x);
    if (deltaX > tolerancePx) {
      failures.push(`${block.blockId}: callout x ${block.x.toFixed(2)} vs anchor x ${attachment.rect.x.toFixed(2)} (Δ${deltaX.toFixed(2)})`);
    }
    if (block.y < attachment.rect.y + attachment.rect.height - 0.5) {
      failures.push(`${block.blockId}: callout top ${block.y.toFixed(2)} is not below anchor bottom ${(attachment.rect.y + attachment.rect.height).toFixed(2)}`);
    }
  }
  return { pass: failures.length === 0, failures, checked };
}

export function checkGeometry(pageGeometry, pdf, toleranceMm = 1.0) {
  const failures = [];
  let checked = 0;
  let maxDelta = 0;
  for (const page of pageGeometry.pages) {
    const pdfPage = pdf.pages[page.pageNumber - 1];
    if (!pdfPage) continue;
    const items = pdf.textItems.filter((item) => item.pageNumber === page.pageNumber);
    for (const fragment of page.fragments) {
      if (!fragment.label || !fragment.labelRect) continue;
      const label = normalizeText(fragment.label);
      if (!label) continue;
      const expectedX = pxToMm(fragment.labelRect.x);
      const expectedTop = pxToMm(fragment.labelRect.y);
      const candidates = items
        .filter((item) => {
          const text = normalizeText(item.text);
          return text === label || text.startsWith(label) || label.startsWith(text);
        })
        .map((item) => {
          const x = (item.x * 25.4) / 72;
          const top = pdfPage.heightMm - (item.y * 25.4) / 72 - (item.height * 25.4) / 72;
          return { ...item, xMm: x, topMm: top, distance: Math.hypot(x - expectedX, top - expectedTop) };
        })
        .sort((a, b) => a.distance - b.distance);
      const match = candidates[0];
      if (!match) {
        failures.push(`page ${page.pageNumber} ${fragment.blockId}: label "${fragment.label}" not found in PDF text`);
        continue;
      }
      checked += 1;
      const deltaX = Math.abs(match.xMm - expectedX);
      const deltaY = Math.abs(match.topMm - expectedTop);
      maxDelta = Math.max(maxDelta, deltaX, deltaY);
      if (deltaX > toleranceMm || deltaY > toleranceMm) {
        failures.push(
          `page ${page.pageNumber} ${fragment.blockId}: label "${fragment.label}" Δx=${deltaX.toFixed(2)}mm Δy=${deltaY.toFixed(2)}mm`,
        );
      }
    }
  }
  return { pass: failures.length === 0, failures, checked, maxDeltaMm: Math.round(maxDelta * 100) / 100 };
}

export function checkImages(document, state, pdf) {
  const failures = [];
  for (const [blockId, block] of Object.entries(document.blocks)) {
    const imageNodes = [];
    const walk = (node) => {
      if (node.type === 'image') imageNodes.push(node);
      for (const child of node.children ?? []) walk(child);
    };
    walk(block.content);
    if (imageNodes.length === 0) continue;
    const firstPage = state.pages.find((page) =>
      page.fragments.some((fragment) => fragment.blockId === blockId),
    );
    if (!firstPage) continue;
    for (const image of imageNodes) {
      const assetId = image.attrs?.assetId;
      const asset = document.assets?.[assetId];
      const pageText = pdf.pages[firstPage.pageNumber - 1]?.text ?? '';
      if (!asset) {
        const alt = image.attrs?.alt ?? assetId ?? 'unknown';
        if (!textContains(pageText, `Missing asset: ${alt}`)) {
          failures.push(`${blockId}: missing-asset placeholder for ${alt} not found on page ${firstPage.pageNumber}`);
        }
        continue;
      }
      if ((pdf.pages[firstPage.pageNumber - 1]?.imageCount ?? 0) < 1) {
        failures.push(`${blockId}: image ${assetId} not embedded on page ${firstPage.pageNumber}`);
      }
    }
  }
  return { pass: failures.length === 0, failures };
}

export function checkTablesCrossPages(document, state) {
  const failures = [];
  const info = [];
  for (const block of state.blocks) {
    const rows = block.segments.filter((segment) => segment.kind === 'table-row');
    if (rows.length === 0) continue;
    const pages = new Set(
      state.pages
        .filter((page) => page.fragments.some((fragment) => fragment.blockId === block.blockId))
        .map((page) => page.pageNumber),
    );
    info.push({ blockId: block.blockId, rows: rows.length, pages: [...pages] });
  }
  return { pass: failures.length === 0, failures, info };
}

export function checkVectorContent(pdf) {
  const totalPaths = pdf.pages.reduce((sum, page) => sum + (page.pathCount ?? 0), 0);
  return { pass: totalPaths > 0, totalPaths };
}
