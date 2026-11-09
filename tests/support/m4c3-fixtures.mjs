import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './harness.mjs';
import { pageDocument, textBlock } from './page-fixtures.mjs';

/**
 * M4c3 PDF gate fixtures.
 *
 * The 50+ page base is the committed `long-50-pages.json` layout fixture. Its
 * image records are fixture ids (`imgForest`) with non-content-addressed paths;
 * the real asset protocol requires a SHA-256 id and `assets/<id>` path, so the
 * helper rewrites those records and image nodes to the actual file hashes.
 * The extra chapter adds headings, display KaTeX, image region/point anchors,
 * a wrapped child subtree with trunks, a long anchored continuation, a missing
 * dimensioned image, and a broken anchor.
 */

const FOREST = resolve(root, 'fixtures/assets/forest.png');
const WIDE = resolve(root, 'fixtures/assets/wide.png');
const CHART = resolve(root, 'fixtures/assets/chart.png');

async function hashFile(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function walkContent(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walkContent(child, visit);
}

function paragraph(text) {
  return { type: 'paragraph', children: [{ type: 'text', text }] };
}

function heading(level, text) {
  return { type: 'heading', attrs: { level }, children: [{ type: 'text', text }] };
}

function listItem(text) {
  return { type: 'paragraph', children: [{ type: 'text', text }] };
}

/**
 * Load the committed 50+ page fixture and make its real images usable by the
 * `noteforest-asset:` protocol. Returns the document plus the package asset
 * files (content hash -> source file).
 */
export async function m4c3GateDocument() {
  const base = JSON.parse(await readFile(resolve(root, 'fixtures/long-50-pages.json'), 'utf8'));
  const hashes = {
    imgForest: await hashFile(FOREST),
    imgWide: await hashFile(WIDE),
    imgChart: await hashFile(CHART),
  };
  const sourceFor = {
    [hashes.imgForest]: FOREST,
    [hashes.imgWide]: WIDE,
    [hashes.imgChart]: CHART,
  };
  const oldIds = Object.keys(base.assets);
  for (const block of Object.values(base.blocks)) {
    walkContent(block.content, (node) => {
      if (node.type !== 'image') return;
      const assetId = node.attrs?.assetId;
      if (typeof assetId === 'string' && hashes[assetId] !== undefined) {
        node.attrs.assetId = hashes[assetId];
      }
    });
  }
  const assets = {};
  for (const oldId of oldIds) {
    const record = base.assets[oldId];
    const id = hashes[oldId];
    if (id === undefined) continue;
    assets[id] = {
      id,
      path: `assets/${id}`,
      mime: 'image/png',
      width: record.width,
      height: record.height,
      originalName: record.originalName ?? `${oldId}.png`,
      alt: record.alt ?? '',
    };
  }
  base.assets = assets;

  const forestId = hashes.imgForest;
  const extraChapterId = 'm4c3-ch4';
  const extraTop = [];

  const headingId = 'm4c3-heading';
  base.blocks[headingId] = {
    id: headingId,
    label: 'Gate heading',
    content: {
      type: 'doc',
      children: [
        heading(1, 'Gate heading level one'),
        heading(2, 'Gate heading level two'),
        heading(3, 'Gate heading level three'),
        paragraph(
          'A body paragraph after the headings. It exercises inline code ' +
            '`matrix @ vector` and inline math \\lambda + \\sum_i x_i in the same flow.',
        ),
        {
          type: 'bulletList',
          children: [
            { type: 'listItem', children: [listItem('First bullet item.')] },
            {
              type: 'listItem',
              children: [
                listItem('Second bullet item with a nested list.'),
                {
                  type: 'bulletList',
                  children: [
                    { type: 'listItem', children: [listItem('Nested bullet one.')] },
                    { type: 'listItem', children: [listItem('Nested bullet two.')] },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'orderedList',
          children: [
            { type: 'listItem', children: [listItem('First ordered item.')] },
            { type: 'listItem', children: [listItem('Second ordered item.')] },
          ],
        },
        {
          type: 'blockquote',
          children: [paragraph('A quoted sentence that must survive the page gate.')],
        },
      ],
    },
  };
  extraTop.push(headingId);

  const mathId = 'm4c3-display-math';
  base.blocks[mathId] = {
    id: mathId,
    label: 'Display mathematics',
    content: {
      type: 'doc',
      children: [
        paragraph('A display formula with a sum, a fraction, and a lambda.'),
        {
          type: 'mathBlock',
          attrs: {
            latex: '\\sum_{i=1}^{n} \\frac{\\lambda_i}{2} + \\lambda = \\prod_{j=1}^{m} x_j',
          },
        },
        paragraph('The formula must stay vector text in the PDF, not a raster.'),
      ],
    },
  };
  extraTop.push(mathId);

  const imageId = 'm4c3-image-regions';
  base.blocks[imageId] = {
    id: imageId,
    label: 'Image regions and point',
    content: {
      type: 'doc',
      children: [
        {
          type: 'image',
          attrs: {
            assetId: forestId,
            width: 520,
            height: 292,
            alt: 'Forest plot',
            anchorIds: ['m4c3-img-region-a', 'm4c3-img-region-b', 'm4c3-img-point'],
          },
        },
      ],
    },
  };
  extraTop.push(imageId);
  const imageSelector = (rect, point = false) => ({
    kind: 'image',
    assetId: forestId,
    rect,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    point,
    label: 'Forest plot',
  });
  base.anchors['m4c3-img-region-a'] = {
    id: 'm4c3-img-region-a',
    blockId: imageId,
    kind: 'image',
    selector: imageSelector({ x: 0.08, y: 0.12, width: 0.34, height: 0.4 }),
    quote: 'Forest plot',
  };
  base.anchors['m4c3-img-region-b'] = {
    id: 'm4c3-img-region-b',
    blockId: imageId,
    kind: 'image',
    selector: imageSelector({ x: 0.58, y: 0.1, width: 0.3, height: 0.34 }),
    quote: 'Forest plot',
  };
  base.anchors['m4c3-img-point'] = {
    id: 'm4c3-img-point',
    blockId: imageId,
    kind: 'image',
    selector: imageSelector({ x: 0.62, y: 0.55, width: 0, height: 0 }, true),
    quote: 'Forest plot',
  };

  const imageCalloutA = 'm4c3-image-callout-a';
  const imageCalloutB = 'm4c3-image-callout-b';
  const imageCalloutPoint = 'm4c3-image-callout-point';
  base.blocks[imageCalloutA] = textBlock(
    imageCalloutA,
    'Region A callout',
    'A callout anchored to the first image region.',
  );
  base.blocks[imageCalloutB] = textBlock(
    imageCalloutB,
    'Region B callout',
    'A callout anchored to the second image region.',
  );
  base.blocks[imageCalloutPoint] = textBlock(
    imageCalloutPoint,
    'Point callout',
    'A callout anchored to a point on the image.',
  );
  base.branches['m4c3-branch-img-a'] = {
    id: 'm4c3-branch-img-a',
    source: { blockId: imageId, anchorId: 'm4c3-img-region-a' },
    targetBlockId: imageCalloutA,
    role: 'primary',
    order: 'a',
  };
  base.branches['m4c3-branch-img-b'] = {
    id: 'm4c3-branch-img-b',
    source: { blockId: imageId, anchorId: 'm4c3-img-region-b' },
    targetBlockId: imageCalloutB,
    role: 'primary',
    order: 'b',
  };
  base.branches['m4c3-branch-img-point'] = {
    id: 'm4c3-branch-img-point',
    source: { blockId: imageId, anchorId: 'm4c3-img-point' },
    targetBlockId: imageCalloutPoint,
    role: 'primary',
    order: 'c',
  };

  const wrapRoot = 'm4c3-wrap-root';
  const wrapChild = 'm4c3-wrap-child';
  const wrapGrandchild = 'm4c3-wrap-grandchild';
  const wrapSibling = 'm4c3-wrap-sibling';
  base.blocks[wrapRoot] = textBlock(wrapRoot, 'Wrap root', 'A short root with a wide subtree.');
  base.blocks[wrapChild] = textBlock(
    wrapChild,
    'Wide child',
    'A first child whose card can fit beside the root, but whose whole subtree cannot, so the direct-child group wraps below the root at the child indent and the trunk continues.',
  );
  base.blocks[wrapGrandchild] = textBlock(
    wrapGrandchild,
    'Grandchild',
    'A grandchild that stays beside its own parent after the atomic group wrap.',
  );
  base.blocks[wrapSibling] = textBlock(
    wrapSibling,
    'Wrap sibling',
    'A second direct child that shares the wrapped group.',
  );
  base.branches['m4c3-branch-wrap-child'] = {
    id: 'm4c3-branch-wrap-child',
    source: { blockId: wrapRoot },
    targetBlockId: wrapChild,
    role: 'primary',
    order: 'a',
  };
  base.branches['m4c3-branch-wrap-grandchild'] = {
    id: 'm4c3-branch-wrap-grandchild',
    source: { blockId: wrapChild },
    targetBlockId: wrapGrandchild,
    role: 'primary',
    order: 'a',
  };
  base.branches['m4c3-branch-wrap-sibling'] = {
    id: 'm4c3-branch-wrap-sibling',
    source: { blockId: wrapRoot },
    targetBlockId: wrapSibling,
    role: 'primary',
    order: 'b',
  };
  extraTop.push(wrapRoot);

  const continuationParent = 'm4c3-continuation-parent';
  const continuationChild = 'm4c3-continuation-child';
  base.blocks[continuationParent] = {
    id: continuationParent,
    label: 'Continuation parent',
    content: {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'The ' },
            {
              type: 'text',
              text: 'continuation anchor',
              marks: [{ type: 'anchor', attrs: { anchorIds: ['m4c3-anchor-continuation'] } }],
            },
            { type: 'text', text: ' starts a long anchored branch.' },
          ],
        },
      ],
    },
  };
  base.anchors['m4c3-anchor-continuation'] = {
    id: 'm4c3-anchor-continuation',
    blockId: continuationParent,
    kind: 'text',
    selector: { kind: 'text', quote: 'continuation anchor' },
    quote: 'continuation anchor',
  };
  base.blocks[continuationChild] = {
    id: continuationChild,
    label: 'Long continuation',
    content: {
      type: 'doc',
      children: [
        paragraph('An anchored branch that continues across pages at code-line boundaries.'),
        {
          type: 'codeBlock',
          attrs: {
            language: 'python',
            text: Array.from(
              { length: 64 },
              (_, line) =>
                line % 6 === 0
                  ? `# continuation section ${line / 6 + 1}`
                  : `continuation_${line + 1} = transform(matrix, vector_${line + 1})`,
            ).join('\n'),
          },
        },
      ],
    },
  };
  base.branches['m4c3-branch-continuation'] = {
    id: 'm4c3-branch-continuation',
    source: { blockId: continuationParent, anchorId: 'm4c3-anchor-continuation' },
    targetBlockId: continuationChild,
    role: 'primary',
    order: 'a',
  };
  extraTop.push(continuationParent);

  const brokenParent = 'm4c3-broken-parent';
  const brokenChild = 'm4c3-broken-child';
  base.blocks[brokenParent] = textBlock(
    brokenParent,
    'Broken anchor parent',
    'This block declares an anchor quote that is intentionally absent.',
  );
  base.anchors['m4c3-broken-anchor'] = {
    id: 'm4c3-broken-anchor',
    blockId: brokenParent,
    kind: 'text',
    selector: { kind: 'text', quote: 'missing gate token' },
    quote: 'missing gate token',
  };
  base.blocks[brokenChild] = textBlock(
    brokenChild,
    'Broken anchor branch',
    'The branch survives the broken anchor and exports once with a marker.',
  );
  base.branches['m4c3-branch-broken'] = {
    id: 'm4c3-branch-broken',
    source: { blockId: brokenParent, anchorId: 'm4c3-broken-anchor' },
    targetBlockId: brokenChild,
    role: 'primary',
    order: 'a',
  };
  extraTop.push(brokenParent);

  const missingId = 'm4c3-missing-image';
  base.blocks[missingId] = {
    id: missingId,
    label: 'Missing dimensioned image',
    content: {
      type: 'doc',
      children: [
        {
          type: 'image',
          attrs: {
            assetId: 'm4c3-missing-asset',
            width: 640,
            height: 360,
            alt: 'Missing gate figure',
          },
        },
      ],
    },
  };
  extraTop.push(missingId);

  base.chapters.push({
    id: extraChapterId,
    title: 'Chapter 4 — gate matrix',
    topLevelBlockIds: extraTop,
  });

  // The committed base fixture is ~40 A4 portrait pages under real DOM
  // measurement (the layout fixture's estimated measurement is more compact).
  // Extended notes keep the gate above the mandatory 50-page threshold with
  // real body content rather than padding an existing block.
  const extendedTop = [];
  for (let index = 0; index < 70; index += 1) {
    const id = `m4c3-extended-${String(index + 1).padStart(2, '0')}`;
    const n = index + 1;
    base.blocks[id] = {
      id,
      label: `Extended note ${n}`,
      content: {
        type: 'doc',
        children: [
          paragraph(
            `Extended note ${n}. The gate document keeps a realistic body of study notes so the derived page count stays above fifty under the real DOM measurement. This paragraph carries enough words to wrap across several lines at the resolved A4 content width, and it never relies on a manual break.`,
          ),
          paragraph(
            `The second paragraph of note ${n} discusses eigenvalues, eigenvectors, and the characteristic polynomial. A page break may occur only between these paragraphs or at another safe segment boundary, so no line, formula, image, code line, or table row is cut by the paginator.`,
          ),
          paragraph(
            `The third paragraph of note ${n} closes the topic with a short conclusion. Every block remains atomic where it has no safe internal break, and a block that continues onto the next page carries the shared continuation marker and ghost record.`,
          ),
        ],
      },
    };
    extendedTop.push(id);
  }
  base.chapters.push({
    id: 'm4c3-ch5',
    title: 'Chapter 5 — extended notes',
    topLevelBlockIds: extendedTop,
  });

  return {
    document: base,
    assetFiles: sourceFor,
    forestId,
    extraChapterId,
  };
}

/**
 * A small real-image document for S2-2: the image has declared dimensions, so
 * the measurement preload skips its bytes and only the print settle can see a
 * post-open delete.
 */
export async function m4c3DimensionedImageDocument() {
  const forestId = await hashFile(FOREST);
  const document = pageDocument({
    id: 'm4c3-dimensioned-image',
    title: 'Dimensioned asset',
    chapterTitle: 'Assets',
    blocks: [
      textBlock('intro', 'Intro', 'A paragraph beside a real dimensioned figure.'),
      {
        id: 'figure',
        label: 'Figure',
        content: {
          type: 'doc',
          children: [
            {
              type: 'image',
              attrs: {
                assetId: forestId,
                width: 560,
                height: 315,
                alt: 'Forest plot',
              },
            },
          ],
        },
      },
    ],
  });
  document.assets[forestId] = {
    id: forestId,
    path: `assets/${forestId}`,
    mime: 'image/png',
    width: 640,
    height: 360,
    originalName: 'forest.png',
    alt: 'Forest plot',
  };
  return { document, assetFiles: { [forestId]: FOREST }, forestId };
}

/** The 300-block performance variant (no image bytes needed). */
export async function m4c3Scale300Document() {
  return JSON.parse(await readFile(resolve(root, 'fixtures/scale-300.json'), 'utf8'));
}

/**
 * Small packaged-app smoke document: real image, display KaTeX, code, and a
 * table. It proves the packaged runtime can measure, render, print, and inspect
 * a PDF without the repo's node_modules.
 */
export async function m4c3PackagedSmokeDocument() {
  const forestId = await hashFile(FOREST);
  const document = pageDocument({
    id: 'm4c3-packaged-smoke',
    title: 'Packaged PDF smoke',
    chapterTitle: 'Packaged runtime',
    blocks: [
      textBlock('intro', 'Intro', 'A packaged export with real text and a figure.'),
      {
        id: 'figure',
        label: 'Forest figure',
        content: {
          type: 'doc',
          children: [
            {
              type: 'image',
              attrs: {
                assetId: forestId,
                width: 480,
                height: 270,
                alt: 'Forest plot',
              },
            },
          ],
        },
      },
      {
        id: 'math',
        label: 'Display formula',
        content: {
          type: 'doc',
          children: [
            paragraph('A packaged display formula.'),
            {
              type: 'mathBlock',
              attrs: { latex: '\\sum_{i=1}^{n} \\frac{\\lambda_i}{2}' },
            },
          ],
        },
      },
      {
        id: 'code',
        label: 'Code sample',
        content: {
          type: 'doc',
          children: [
            paragraph('A packaged code sample.'),
            {
              type: 'codeBlock',
              attrs: {
                language: 'python',
                text: Array.from(
                  { length: 12 },
                  (_, line) => `packaged_${line + 1} = transform(matrix, vector_${line + 1})`,
                ).join('\n'),
              },
            },
          ],
        },
      },
      {
        id: 'table',
        label: 'Small table',
        content: {
          type: 'doc',
          children: [
            {
              type: 'table',
              children: [
                {
                  type: 'tableRow',
                  children: [
                    { type: 'tableCell', children: [paragraph('Name')] },
                    { type: 'tableCell', children: [paragraph('Value')] },
                  ],
                },
                {
                  type: 'tableRow',
                  children: [
                    { type: 'tableCell', children: [paragraph('lambda')] },
                    { type: 'tableCell', children: [paragraph('1.25')] },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  });
  document.assets[forestId] = {
    id: forestId,
    path: `assets/${forestId}`,
    mime: 'image/png',
    width: 640,
    height: 360,
    originalName: 'forest.png',
    alt: 'Forest plot',
  };
  return { document, assetFiles: { [forestId]: FOREST }, forestId };
}
