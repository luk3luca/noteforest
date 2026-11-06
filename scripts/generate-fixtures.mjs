#!/usr/bin/env node
/**
 * Generates the Spike 1 fixture suite deterministically.
 *
 * Run with: npm run fixtures
 * The JSON files and PNG assets are checked in; re-running produces identical
 * bytes on the same platform.
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const fixturesDir = resolve(root, 'fixtures');
const assetsDir = resolve(fixturesDir, 'assets');

const PAGE_SETUP = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
};

function text(value, marks) {
  const node = { type: 'text', text: value };
  if (marks) node.marks = marks;
  return node;
}

function anchorText(value, anchorId) {
  return text(value, [{ type: 'anchor', attrs: { anchorId } }]);
}

function anchorTextIds(value, anchorIds) {
  return text(value, [
    { type: 'anchor', attrs: { anchorIds: [...anchorIds].sort() } },
  ]);
}

function withAnchorIds(node, anchorIds) {
  node.attrs = { ...(node.attrs ?? {}), anchorIds: [...anchorIds].sort() };
  return node;
}

function anchorRecord(id, blockId, kind, selector, mirrors = {}) {
  return { id, blockId, kind, selector, ...mirrors };
}

function p(...children) {
  return { type: 'paragraph', children };
}

function heading(level, value) {
  return { type: 'heading', attrs: { level }, children: [text(value)] };
}

function codeInline(value) {
  return text(value, [{ type: 'code' }]);
}

function inlineMath(latex, anchorId) {
  const node = { type: 'inlineMath', attrs: { latex } };
  if (anchorId) node.attrs.anchorId = anchorId;
  return node;
}

function displayMath(latex, anchorId) {
  const node = { type: 'mathBlock', attrs: { latex } };
  if (anchorId) node.attrs.anchorId = anchorId;
  return node;
}

function codeBlock(value, options = {}) {
  const attrs = { text: value, language: options.language ?? 'text' };
  if (options.anchorId) attrs.anchorId = options.anchorId;
  if (options.anchorToken) attrs.anchorToken = options.anchorToken;
  if (options.anchorLine) attrs.anchorLine = options.anchorLine;
  return { type: 'codeBlock', attrs };
}

function bulletList(items) {
  return {
    type: 'bulletList',
    children: items.map((item) => ({
      type: 'listItem',
      children: Array.isArray(item)
        ? [p(...(typeof item[0] === 'string' ? [text(item[0])] : item[0]))]
        : [p(text(item))],
    })),
  };
}

function orderedList(items) {
  return {
    type: 'orderedList',
    attrs: { start: 1 },
    children: items.map((item) => ({
      type: 'listItem',
      children: [p(text(item))],
    })),
  };
}

function blockquote(value) {
  return { type: 'blockquote', children: [p(text(value))] };
}

function table(rows, header = true) {
  return {
    type: 'table',
    attrs: { headerRow: header },
    children: rows.map((cells) => ({
      type: 'tableRow',
      children: cells.map((cell) => ({
        type: 'tableCell',
        children: [p(text(String(cell)))],
      })),
    })),
  };
}

function image(assetId, width, height, alt, anchorId) {
  const attrs = { assetId, width, height, alt };
  if (anchorId) attrs.anchorId = anchorId;
  return { type: 'image', attrs };
}

function doc(...children) {
  return { type: 'doc', children };
}

function block(id, label, content, border = 'subtle') {
  return { id, label, content: doc(...content), border };
}

function branch(id, source, targetBlockId, role, order = 'a1', label) {
  const record = {
    id,
    source,
    targetBlockId,
    role,
    order,
  };
  if (label) record.label = label;
  return record;
}

function anchor(id, blockId, kind, extra = {}) {
  const selector = { kind };
  if (extra.quote !== undefined) selector.quote = extra.quote;
  if (extra.prefix !== undefined) selector.prefix = extra.prefix;
  if (extra.suffix !== undefined) selector.suffix = extra.suffix;
  if (extra.codeToken !== undefined) selector.token = extra.codeToken;
  if (extra.codeLine !== undefined) selector.line = extra.codeLine;
  return { id, blockId, kind, selector, ...extra };
}

function makeDocument({ id, title, blocks, anchors, branches, chapters, manualBreakBeforeBlockIds = [], assets = {} }) {
  return {
    schemaVersion: 1,
    id,
    title,
    createdAt: '2026-11-03T10:00:00Z',
    updatedAt: '2026-11-03T10:04:12Z',
    revision: 1,
    pageSetup: PAGE_SETUP,
    manualBreakBeforeBlockIds,
    blocks: Object.fromEntries(blocks.map((item) => [item.id, item])),
    anchors: Object.fromEntries(anchors.map((item) => [item.id, item])),
    branches: Object.fromEntries(branches.map((item) => [item.id, item])),
    chapters,
    assets,
    annotations: [],
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  'matrix', 'vector', 'basis', 'span', 'kernel', 'image', 'rank', 'nullity',
  'determinant', 'trace', 'characteristic', 'polynomial', 'diagonal', 'symmetric',
  'orthogonal', 'projection', 'subspace', 'linear', 'transformation', 'eigenvalue',
  'eigenvector', 'spectrum', 'singular', 'decomposition', 'factorization', 'norm',
  'convergence', 'iteration', 'gradient', 'hessian', 'jacobian', 'tensor',
];

function sentence(random, count = 10) {
  const words = [];
  for (let i = 0; i < count; i += 1) {
    words.push(WORDS[Math.floor(random() * WORDS.length)]);
  }
  return `${words.join(' ')}.`;
}

const ASSETS = {
  imgForest: {
    id: 'imgForest',
    path: 'assets/forest.png',
    mime: 'image/png',
    alt: 'A forest plot of residuals',
    width: 640,
    height: 360,
  },
  imgWide: {
    id: 'imgWide',
    path: 'assets/wide.png',
    mime: 'image/png',
    alt: 'A very wide spectrum plot',
    width: 1200,
    height: 200,
  },
  imgChart: {
    id: 'imgChart',
    path: 'assets/chart.png',
    mime: 'image/png',
    alt: 'A small chart of eigenvalues',
    width: 420,
    height: 240,
  },
};

// ---------------------------------------------------------------------------
// F1 — golden eigenvalues
// ---------------------------------------------------------------------------
function fixtureF1() {
  const b1 = block('b1', 'Eigenvalues', [
    p(
      text('An '),
      anchorText('eigenvalue', 'a1'),
      text(' is a scalar '),
      inlineMath('\\lambda'),
      text(' such that '),
      inlineMath('Av = \\lambda v'),
      text(' for some nonzero vector '),
      inlineMath('v'),
      text('.'),
    ),
  ]);
  const b2 = block('b2', 'Eigenvector', [
    p(
      text('An eigenvector is a nonzero vector '),
      inlineMath('v'),
      text(' satisfying '),
      inlineMath('Av = \\lambda v'),
      text('.'),
    ),
  ]);
  const b3 = block('b3', 'Eigenvalue equation', [
    p(
      text('The eigenvalue equation is '),
      inlineMath('Av = \\lambda v', 'a2'),
      text(', with '),
      inlineMath('v \\neq 0'),
      text('. It is the bridge between a matrix and its spectrum.'),
    ),
  ]);
  const b4 = block('b4', 'Cayley–Hamilton', [
    p(
      text('Every square matrix satisfies its characteristic polynomial: '),
      inlineMath('p(\\lambda) = \\det(A - \\lambda I)'),
      text('.'),
    ),
  ]);
  const codeLines = [
    'import numpy as np',
    'from numpy.linalg import eig',
    '',
    'def spectrum(matrix, tolerance=1e-9):',
    '    """Return a stable eigenvalue estimate."""',
    '    values, vectors = eig(matrix)',
    '    order = np.argsort(np.abs(values))[::-1]',
    '    return values[order], vectors[:, order]',
    '',
    'A = np.array([[2.0, 1.0], [1.0, 2.0]])',
    'vals = eigvals(A)',
    'vecs = vectors(A)',
    'print(vals)',
    'print(vecs)',
    '',
    'for value in vals:',
    '    print(f"lambda = {value:.6f}")',
    '',
    'def residual(matrix, value, vector):',
    '    return np.linalg.norm(A @ v - value * v)',
    '',
    'def power_iteration(matrix, steps=100):',
    '    vector = np.ones(matrix.shape[0])',
    '    for _ in range(steps):',
    '        vector = matrix @ vector',
    '        vector = vector / np.linalg.norm(vector)',
    '    value = float(vector @ matrix @ vector)',
    '    return value, vector',
    '',
    'value, vector = power_iteration(A)',
    'print(value)',
    'print(vector)',
    '',
    'assert residual(A, value, vector) < 1e-6',
    'assert np.isclose(value, vals[0])',
    'print("ok")',
    '',
    '# Check the trace identity.',
    'same_trace = np.isclose(A.trace(), vals.sum())',
    'print(trace_identity)',
    'print("done")',
  ];
  const b5 = block('b5', 'Computing eigenvalues', [
    p(
      text('A numerical example uses the '),
      codeInline('eigvals'),
      text(' helper and a short power iteration.'),
    ),
    codeBlock(codeLines.join('\n'), {
      language: 'python',
      anchorId: 'a3',
      anchorToken: 'eigvals',
      anchorLine: 11,
    }),
  ]);
  return makeDocument({
    id: 'f1-golden-eigenvalues',
    title: 'Linear algebra — eigenvalues',
    blocks: [b1, b2, b3, b4, b5],
    anchors: [
      anchor('a1', 'b1', 'text', { quote: 'eigenvalue', prefix: 'An ', suffix: ' is' }),
      anchor('a2', 'b3', 'formula', { quote: 'Av = \\lambda v' }),
      anchor('a3', 'b5', 'code', { quote: 'eigvals', codeToken: 'eigvals', codeLine: 11 }),
    ],
    branches: [
      branch('e1', { blockId: 'b1' }, 'b2', 'primary', 'a1'),
      branch('e2', { blockId: 'b1', anchorId: 'a1' }, 'b3', 'primary', 'a1'),
      branch('e3', { blockId: 'b3', anchorId: 'a2' }, 'b5', 'primary', 'a1'),
      branch('e4', { blockId: 'b4' }, 'b3', 'reference', 'a1', 'also uses'),
    ],
    chapters: [{ id: 'ch1', title: 'Eigenvalues', topLevelBlockIds: ['b1', 'b4'] }],
    manualBreakBeforeBlockIds: ['b4'],
    assets: ASSETS,
  });
}

// ---------------------------------------------------------------------------
// F2 — long 50+ page document
// ---------------------------------------------------------------------------
function fixtureF2() {
  const random = mulberry32(0xf00d);
  const blocks = [];
  const anchors = [];
  const branches = [];
  let n = 0;
  const nextId = () => `f2-b${String((n += 1)).padStart(3, '0')}`;
  const chapters = [];

  const standardBlock = (chapter, index) => {
    const id = nextId();
    const parts = [];
    parts.push(
      p(
        text(`${sentence(random, 8)} `),
        text(sentence(random, 7)),
        text(` ${sentence(random, 6)}`),
      ),
    );
    const mode = (chapter * 11 + index) % 7;
    if (mode === 0) {
      parts.push(bulletList([sentence(random, 4), sentence(random, 5), sentence(random, 3)]));
    } else if (mode === 1) {
      parts.push(blockquote(sentence(random, 12)));
    } else if (mode === 2) {
      parts.push(orderedList([sentence(random, 4), sentence(random, 4)]));
    } else if (mode === 3) {
      parts.push(
        p(
          text('Inline math '),
          inlineMath('\\sum_{i=1}^{n} \\lambda_i'),
          text(' and code '),
          codeInline('matrix @ vector'),
          text('.'),
        ),
      );
    }
    blocks.push(block(id, `Topic ${chapter + 1}.${index + 1}`, parts));
    return id;
  };

  for (let chapterIndex = 0; chapterIndex < 3; chapterIndex += 1) {
    const top = [];
    for (let index = 0; index < 72; index += 1) {
      const id = standardBlock(chapterIndex, index);
      top.push(id);
      if (index === 5 && chapterIndex === 0) {
        const parentId = nextId();
        const calloutId = nextId();
        const directId = nextId();
        blocks.push(
          block(parentId, 'Anchored spectrum', [
            p(
              text('The '),
              anchorText('spectrum', `f2-a${chapterIndex}-parent`),
              text(' of a matrix is the multiset of its eigenvalues.'),
            ),
          ]),
        );
        anchors.push(
          anchor(`f2-a${chapterIndex}-parent`, parentId, 'text', { quote: 'spectrum' }),
        );
        const calloutLines = Array.from({ length: 44 }, (_, line) =>
          line % 4 === 0
            ? `# check spectrum line ${line + 1}`
            : `value_${line + 1} = spectrum(matrix_${line + 1}, tolerance=1e-9)`,
        );
        blocks.push(
          block(calloutId, 'Spectrum continuation', [
            p(text('A long anchored branch that must continue at a code-line boundary.')),
            codeBlock(calloutLines.join('\n'), { language: 'python' }),
          ]),
        );
        blocks.push(
          block(directId, 'Direct sibling', [
            p(text('A direct child of the anchored parent; it follows the anchored branch.')),
          ]),
        );
        branches.push(
          branch(`f2-e${chapterIndex}-1`, { blockId: parentId }, directId, 'primary', 'a1'),
          branch(
            `f2-e${chapterIndex}-2`,
            { blockId: parentId, anchorId: `f2-a${chapterIndex}-parent` },
            calloutId,
            'primary',
            'a1',
          ),
        );
        top.push(parentId);
      }
      if (index === 14 && chapterIndex === 0) {
        const id2 = nextId();
        const rows = Array.from({ length: 34 }, (_, row) => [
          `λ${row + 1}`,
          (row + 1) * 0.125,
          `v${row + 1}`,
          sentence(random, 3),
        ]);
        blocks.push(
          block(id2, 'Eigenvalue table (crosses pages)', [
            table([['Eigenvalue', 'Magnitude', 'Vector', 'Note'], ...rows], true),
          ]),
        );
        top.push(id2);
      }
      if (index === 25 && chapterIndex === 1) {
        const id2 = nextId();
        blocks.push(
          block(id2, 'Long code sample', [
            p(text('An 80-line code block. Page breaks may occur only between code lines.')),
            codeBlock(
              Array.from({ length: 80 }, (_, line) =>
                line % 5 === 0
                  ? `# section ${line / 5 + 1}`
                  : `result_${line + 1} = transform(matrix, vector_${line + 1}, tolerance=1e-9)`,
              ).join('\n'),
              { language: 'python' },
            ),
          ]),
        );
        top.push(id2);
      }
      if (index === 35 && chapterIndex === 1) {
        const id2 = nextId();
        blocks.push(
          block(id2, 'Forest plot', [
            p(text('A local image embedded at print resolution.')),
            image('imgForest', 560, 315, 'Forest plot of residuals'),
          ]),
        );
        top.push(id2);
      }
      if (index === 44 && chapterIndex === 2) {
        const parentId = nextId();
        const childId = nextId();
        blocks.push(
          block(parentId, 'Broken anchor parent', [
            p(text('This block declares an anchor that is intentionally absent from its content.')),
            p(text('The branch must still export once, with a visible marker.')),
          ]),
        );
        anchors.push(anchor('f2-broken', parentId, 'text', { quote: 'missing token' }));
        blocks.push(
          block(childId, 'Branch survives a broken anchor', [
            p(text('This branch remains visible after an anchor breaks.')),
          ]),
        );
        branches.push(
          branch(
            `f2-e${chapterIndex}-broken`,
            { blockId: parentId, anchorId: 'f2-broken' },
            childId,
            'primary',
            'a1',
          ),
        );
        top.push(parentId);
      }
      if (index === 50 && chapterIndex === 2) {
        const id2 = nextId();
        blocks.push(
          block(id2, 'Missing asset', [
            p(text('This image points at an asset that is not present; a labeled placeholder is required.')),
            image('missingForest', 640, 360, 'Missing forest plot'),
          ]),
        );
        top.push(id2);
      }
    }
    chapters.push({ id: `f2-ch${chapterIndex + 1}`, title: `Chapter ${chapterIndex + 1}`, topLevelBlockIds: top });
  }

  return makeDocument({
    id: 'f2-long-50-pages',
    title: 'Linear algebra — a long reader',
    blocks,
    anchors,
    branches,
    chapters,
    assets: ASSETS,
  });
}

// ---------------------------------------------------------------------------
// F3 — wide fan
// ---------------------------------------------------------------------------
function fixtureF3() {
  const parent = block('f3-parent', 'Fan', [
    p(text('A short parent with ten children of very different widths.')),
  ]);
  const children = [
    block('f3-c1', 'A', [p(text('Short.'))]),
    block('f3-c2', 'B', [p(text('A medium child with a single sentence.'))]),
    block('f3-c3', 'C', [
      p(
        text(
          'A long child that needs most of the remaining width and therefore wraps below the parent with a visible indent. It keeps a readable measure and does not overlap any sibling subtree.',
        ),
      ),
    ]),
    block('f3-c4', 'D', [
      p(text('Code line:')),
      codeBlock('scores = transform(matrix, vector, tolerance=1e-9)', { language: 'python' }),
    ]),
    block('f3-c5', 'E', [
      table([
        ['a', 'b', 'c', 'd'],
        ['1', '2', '3', '4'],
        ['5', '6', '7', '8'],
        ['9', '10', '11', '12'],
        ['13', '14', '15', '16'],
      ]),
    ]),
    block('f3-c6', 'F', [displayMath('\\sum_{i=1}^{n} \\lambda_i v_i')]),
    block('f3-c7', 'G', [image('imgWide', 520, 110, 'A wide spectrum plot')]),
    block('f3-c8', 'H', [p(text('Another short leaf.'))]),
    block('f3-c9', 'I', [
      p(
        text(
          'A second long leaf that wraps below the parent. Its subtree has one short child, so the adaptive rule has to reserve room for the whole footprint.',
        ),
      ),
    ]),
    block('f3-c10', 'I.1', [p(text('Nested leaf.'))]),
  ];
  const branches = children.map((child, index) =>
    branch(`f3-e${index + 1}`, { blockId: index === 9 ? 'f3-c9' : 'f3-parent' }, child.id, 'primary', `o${String(index + 1).padStart(2, '0')}`),
  );
  // f3-c10 is a child of f3-c9; remove it from the parent fan.
  branches.pop();
  branches.push(branch('f3-e10', { blockId: 'f3-c9' }, 'f3-c10', 'primary', 'a1'));
  return makeDocument({
    id: 'f3-wide-fan',
    title: 'Adaptive fan',
    blocks: [parent, ...children],
    anchors: [],
    branches,
    chapters: [{ id: 'f3-ch1', title: 'Fan', topLevelBlockIds: ['f3-parent'] }],
    assets: ASSETS,
  });
}

// ---------------------------------------------------------------------------
// F4 — deep chain and nested callouts
// ---------------------------------------------------------------------------
function fixtureF4() {
  const b1 = block('f4-b1', 'Depth 0', [p(text('The root of a five-level chain.'))]);
  const b2 = block('f4-b2', 'Depth 1', [
    p(text('Level one contains the '), anchorText('anchor', 'f4-a1'), text(' for a nested callout.')),
    p(text('A second paragraph makes the block tall enough to matter.')),
  ]);
  const b3 = block('f4-b3', 'Depth 2', [p(text('Level two is a direct child.'))]);
  const b4 = block('f4-b4', 'Depth 3', [p(text('Level three continues the chain.'))]);
  const b5 = block('f4-b5', 'Depth 4', [p(text('Level four is the fifth level overall.'))]);
  const c1 = block('f4-c1', 'Nested callout', [
    p(
      text('A callout anchored on '),
      inlineMath('\\lambda', 'f4-a2'),
      text(' in the level-one block.'),
    ),
  ]);
  const c2 = block('f4-c2', 'Deep continuation', [
    p(text('A long callout that begins on page one and continues on page two.')),
    codeBlock(
      Array.from({ length: 52 }, (_, line) =>
        line % 6 === 0 ? `# block ${line / 6 + 1}` : `row_${line + 1} = compute(matrix, ${line + 1})`,
      ).join('\n'),
      { language: 'python' },
    ),
  ]);
  return makeDocument({
    id: 'f4-deep-chain',
    title: 'Deep chain and nested callouts',
    blocks: [b1, b2, b3, b4, b5, c1, c2],
    anchors: [
      anchor('f4-a1', 'f4-b2', 'text', { quote: 'anchor' }),
      anchor('f4-a2', 'f4-c1', 'formula', { quote: '\\lambda' }),
    ],
    branches: [
      branch('f4-e1', { blockId: 'f4-b1' }, 'f4-b2', 'primary', 'a1'),
      branch('f4-e2', { blockId: 'f4-b2' }, 'f4-b3', 'primary', 'a1'),
      branch('f4-e3', { blockId: 'f4-b3' }, 'f4-b4', 'primary', 'a1'),
      branch('f4-e4', { blockId: 'f4-b4' }, 'f4-b5', 'primary', 'a1'),
      branch('f4-e5', { blockId: 'f4-b2', anchorId: 'f4-a1' }, 'f4-c1', 'primary', 'a1'),
      branch('f4-e6', { blockId: 'f4-c1', anchorId: 'f4-a2' }, 'f4-c2', 'primary', 'a1'),
    ],
    chapters: [{ id: 'f4-ch1', title: 'Deep chain', topLevelBlockIds: ['f4-b1'] }],
    assets: ASSETS,
  });
}

// ---------------------------------------------------------------------------
// F5 — shared child and reference cycle
// ---------------------------------------------------------------------------
function fixtureF5() {
  const b1 = block('f5-b1', 'Primary home', [
    p(text('The shared child lives here. Its geometry must not depend on reference edges.')),
  ]);
  const b2 = block('f5-b2', 'Shared child', [
    p(text('This block has one primary home and two incoming reference edges.')),
  ]);
  const b3 = block('f5-b3', 'Shared grandchild', [p(text('A descendant of the shared child.'))]);
  const b4 = block('f5-b4', 'Reference parent', [
    p(text('This top-level block references the shared child. The edge is dashed and does not move it.')),
  ]);
  return makeDocument({
    id: 'f5-shared-child',
    title: 'Shared child and reference cycle',
    blocks: [b1, b2, b3, b4],
    anchors: [],
    branches: [
      branch('f5-e1', { blockId: 'f5-b1' }, 'f5-b2', 'primary', 'a1'),
      branch('f5-e2', { blockId: 'f5-b2' }, 'f5-b3', 'primary', 'a1'),
      branch('f5-e3', { blockId: 'f5-b4' }, 'f5-b2', 'reference', 'a1', 'also uses'),
      branch('f5-e4', { blockId: 'f5-b2' }, 'f5-b4', 'reference', 'a2', 'references back'),
    ],
    chapters: [{ id: 'f5-ch1', title: 'Shared child', topLevelBlockIds: ['f5-b1', 'f5-b4'] }],
    assets: ASSETS,
  });
}

// ---------------------------------------------------------------------------
// F6 — table pagination and a too-tall row
// ---------------------------------------------------------------------------
function fixtureF6() {
  const rows = Array.from({ length: 34 }, (_, row) => [
    `λ${row + 1}`,
    (row + 1) * 0.125,
    `v${row + 1}`,
    `residual ${(1e-9 * (row + 1)).toExponential(2)}`,
  ]);
  const giantCell = Array.from({ length: 140 }, (_, line) =>
    `line ${line + 1}: a single table cell that is taller than the page content area`,
  ).join('\n');
  return makeDocument({
    id: 'f6-tables',
    title: 'Table pagination',
    blocks: [
      block('f6-intro', 'Tables', [
        p(text('The first table crosses a page boundary. The second contains a row taller than the page.')),
      ]),
      block('f6-table', 'Eigenvalue table', [table([['Eigenvalue', 'Magnitude', 'Vector', 'Residual'], ...rows], true)]),
      block('f6-giant', 'Impossible row', [
        table([['Header', 'Value'], ['Oversized row', giantCell]], true),
      ]),
      block('f6-after', 'After the tables', [p(text('A normal block after the table defect.'))]),
    ],
    anchors: [],
    branches: [],
    chapters: [{ id: 'f6-ch1', title: 'Tables', topLevelBlockIds: ['f6-intro', 'f6-table', 'f6-giant', 'f6-after'] }],
    assets: ASSETS,
  });
}

// ---------------------------------------------------------------------------
// F7 — 300-block scale fixture
// ---------------------------------------------------------------------------
function fixtureF7() {
  const random = mulberry32(0x5ca1e);
  const blocks = [];
  const anchors = [];
  const branches = [];
  const chapters = [];
  let blockNumber = 0;
  const nextId = () => `f7-b${String((blockNumber += 1)).padStart(3, '0')}`;

  for (let chapterIndex = 0; chapterIndex < 3; chapterIndex += 1) {
    const top = [];
    for (let topIndex = 0; topIndex < 40; topIndex += 1) {
      const parentId = nextId();
      const hasAnchor = topIndex % 8 === 0;
      const anchorId = `f7-a${chapterIndex}-${topIndex}`;
      const parts = [
        p(
          text(`${sentence(random, 5)} `),
          text(sentence(random, 4)),
        ),
      ];
      if (hasAnchor) {
        parts[0] = p(
          text(`${sentence(random, 3)} `),
          anchorText('anchor', anchorId),
          text(` ${sentence(random, 4)}`),
        );
        anchors.push(anchor(anchorId, parentId, 'text', { quote: 'anchor' }));
      }
      if (topIndex % 6 === 0) {
        parts.push(bulletList([sentence(random, 3), sentence(random, 4)]));
      }
      blocks.push(block(parentId, `Node ${chapterIndex + 1}.${topIndex + 1}`, parts));
      top.push(parentId);

      const childCount = topIndex < 30 ? 2 : 0;
      for (let childIndex = 0; childIndex < childCount; childIndex += 1) {
        const childId = nextId();
        blocks.push(
          block(childId, `Child ${chapterIndex + 1}.${topIndex + 1}.${childIndex + 1}`, [
            p(text(`${sentence(random, 4)} ${sentence(random, 3)}`)),
          ]),
        );
        const isAnchored = hasAnchor && childIndex === 0;
        branches.push(
          branch(
            `f7-e${branches.length + 1}`,
            isAnchored ? { blockId: parentId, anchorId } : { blockId: parentId },
            childId,
            'primary',
            isAnchored ? 'a1' : `o${String(childIndex + 1).padStart(2, '0')}`,
          ),
        );
      }
    }
    chapters.push({ id: `f7-ch${chapterIndex + 1}`, title: `Scale chapter ${chapterIndex + 1}`, topLevelBlockIds: top });
  }
  return makeDocument({
    id: 'f7-scale-300',
    title: 'Scale — 300 blocks',
    blocks,
    anchors,
    branches,
    chapters,
    assets: ASSETS,
  });
}

// ---------------------------------------------------------------------------
// F8 — defects
// ---------------------------------------------------------------------------
function fixtureF8() {
  const longParagraph = Array.from({ length: 90 }, (_, line) =>
    `Sentence ${line + 1}: ${sentence(mulberry32(line + 1), 8)}`,
  ).join(' ');
  return makeDocument({
    id: 'f8-defects',
    title: 'Defects and warnings',
    blocks: [
      block('f8-long', 'No safe break', [p(text(longParagraph))]),
      block('f8-wide', 'Content too wide', [
        p(text('A wide image has no safe horizontal break.')),
        image('imgWide', 1200, 200, 'A 1200 px image on a 642 px page'),
      ]),
      block('f8-long-code', 'Code line too wide', [
        codeBlock(
          'result = transform_matrix_with_a_very_long_name(matrix, vector, tolerance=1e-9, mode="stable", fallback="strict")  # no wrap',
          { language: 'python' },
        ),
      ]),
      block('f8-missing', 'Missing asset', [
        p(text('The asset is absent; the placeholder must be labeled.')),
        image('does-not-exist', 640, 360, 'Missing research image'),
      ]),
      block('f8-normal', 'Still renders', [p(text('A normal block after the defects.'))]),
    ],
    anchors: [],
    branches: [],
    chapters: [
      {
        id: 'f8-ch1',
        title: 'Defects',
        topLevelBlockIds: ['f8-long', 'f8-wide', 'f8-long-code', 'f8-missing', 'f8-normal'],
      },
    ],
    manualBreakBeforeBlockIds: ['does-not-exist', 'f8-orphan'],
    assets: ASSETS,
  });
}

// ---------------------------------------------------------------------------
// F9 — broken and ambiguous anchors
// ---------------------------------------------------------------------------
function fixtureF9() {
  return makeDocument({
    id: 'f9-broken-anchor',
    title: 'Broken and ambiguous anchors',
    blocks: [
      block('f9-b1', 'Anchor host', [
        p(
          text('This paragraph mentions the '),
          anchorText('term', 'f9-a2'),
          text(' twice: '),
          anchorText('term', 'f9-a2'),
          text('. A third anchor has no mark at all.'),
        ),
      ]),
      block('f9-b2', 'Branch from a broken anchor', [
        p(text('This branch survives and is exported exactly once.')),
      ]),
      block('f9-b3', 'Branch from an ambiguous anchor', [
        p(text('This branch is also exported exactly once, from a marked warning point.')),
      ]),
      block('f9-b4', 'Unrelated', [p(text('A normal block after the anchor warnings.'))]),
    ],
    anchors: [
      anchor('f9-a1', 'f9-b1', 'text', { quote: 'missing term' }),
      anchor('f9-a2', 'f9-b1', 'text', { quote: 'term' }),
    ],
    branches: [
      branch('f9-e1', { blockId: 'f9-b1', anchorId: 'f9-a1' }, 'f9-b2', 'primary', 'a1'),
      branch('f9-e2', { blockId: 'f9-b1', anchorId: 'f9-a2' }, 'f9-b3', 'primary', 'a2'),
    ],
    chapters: [{ id: 'f9-ch1', title: 'Anchor states', topLevelBlockIds: ['f9-b1', 'f9-b4'] }],
    assets: ASSETS,
  });
}

// ---------------------------------------------------------------------------
// F10 — canonical M3 anchor kinds (text, whole formula, term, code range)
// ---------------------------------------------------------------------------
function fixtureM3AnchorKinds() {
  const codeText = [
    'const total = sum(matrix, vector);',
    'const scaled = total * 2;',
    'return scaled;',
  ].join('\n');
  const codeQuote = 'sum(matrix, vector)';
  const codeStart = codeText.indexOf(codeQuote);
  const codeEnd = codeStart + codeQuote.length;
  const codePrefix = codeText.slice(Math.max(0, codeStart - 32), codeStart);
  const codeSuffix = codeText.slice(codeEnd, codeEnd + 32);

  const textBlock = block('m3k-text', 'Text anchor', [
    p(
      text('A text anchor binds the word '),
      anchorTextIds('target', ['m3k-a-text']),
      text(' exactly once, even with surrounding prose.'),
    ),
  ]);
  const formulaBlock = block('m3k-formula', 'Formula anchors', [
    p(
      text('The identity '),
      withAnchorIds(inlineMath('a^2 + b^2 = c^2'), ['m3k-a-formula-whole']),
      text(' contains the term '),
      withAnchorIds(inlineMath('a^2 + b^2 = c^2'), ['m3k-a-formula-term']),
      text('.'),
    ),
    p(
      text('A repeated term '),
      withAnchorIds(inlineMath('x + x + x'), ['m3k-a-formula-ambiguous']),
      text(' cannot resolve to one occurrence.'),
    ),
  ]);
  const codeBlockNode = block('m3k-code', 'Code range', [
    p(text('The code anchor covers a range inside one code block.')),
    withAnchorIds(codeBlock(codeText, { language: 'typescript' }), ['m3k-a-code']),
  ]);
  const brokenBlock = block('m3k-broken', 'Broken anchor', [
    p(text('This block declares a quote that is not present in its content.')),
  ]);
  const ambiguousBlock = block('m3k-ambiguous', 'Ambiguous anchor', [
    p(text('repeated repeated repeated')),
  ]);
  const sharedHome = block('m3k-shared-home', 'Shared child home', [
    p(text('The shared child has its primary home here.')),
  ]);
  const shared = block('m3k-shared', 'Shared child', [
    p(text('This child is referenced from another block without moving.')),
  ]);
  const referenceParent = block('m3k-ref-parent', 'Reference parent', [
    p(text('A reference edge to the shared child, and a reference cycle back.')),
  ]);

  return makeDocument({
    id: 'm3-anchor-kinds',
    title: 'M3 anchor kinds — text, formula, code, references',
    blocks: [
      textBlock,
      formulaBlock,
      codeBlockNode,
      brokenBlock,
      ambiguousBlock,
      sharedHome,
      shared,
      referenceParent,
      block('m3k-text-child', 'Text callout', [p(text('A callout from a text anchor.'))]),
      block('m3k-formula-whole-child', 'Whole formula callout', [
        p(text('A callout from a whole-formula anchor.')),
      ]),
      block('m3k-formula-term-child', 'Formula term callout', [
        p(text('A callout from a formula-term anchor.')),
      ]),
      block('m3k-formula-ambiguous-child', 'Ambiguous formula callout', [
        p(text('A callout from an ambiguous formula-term anchor.')),
      ]),
      block('m3k-code-child', 'Code callout', [p(text('A callout from a code range anchor.'))]),
      block('m3k-broken-child', 'Broken anchor callout', [
        p(text('A callout from a broken anchor still exports once.')),
      ]),
      block('m3k-ambiguous-child', 'Ambiguous anchor callout', [
        p(text('A callout from an ambiguous anchor still exports once.')),
      ]),
    ],
    anchors: [
      anchorRecord('m3k-a-text', 'm3k-text', 'text', {
        kind: 'text',
        quote: 'target',
        occurrenceHint: 1,
      }, { quote: 'target', occurrenceHint: 1 }),
      anchorRecord('m3k-a-formula-whole', 'm3k-formula', 'formula', {
        kind: 'formula',
        form: 'whole',
        latex: 'a^2 + b^2 = c^2',
      }, { quote: 'a^2 + b^2 = c^2' }),
      anchorRecord('m3k-a-formula-term', 'm3k-formula', 'formula', {
        kind: 'formula',
        form: 'term',
        latex: 'a^2 + b^2',
        occurrenceHint: 1,
      }, { quote: 'a^2 + b^2', occurrenceHint: 1 }),
      anchorRecord('m3k-a-formula-ambiguous', 'm3k-formula', 'formula', {
        kind: 'formula',
        form: 'term',
        latex: 'x',
        occurrenceHint: 1,
      }, { quote: 'x', occurrenceHint: 1 }),
      anchorRecord('m3k-a-code', 'm3k-code', 'code', {
        kind: 'code',
        form: 'range',
        quote: codeQuote,
        prefix: codePrefix,
        suffix: codeSuffix,
        occurrenceHint: 1,
        startOffset: codeStart,
        endOffset: codeEnd,
        lineStart: 1,
        lineEnd: 1,
      }, { quote: codeQuote, occurrenceHint: 1 }),
      anchorRecord('m3k-a-broken', 'm3k-broken', 'text', {
        kind: 'text',
        quote: 'missing phrase',
      }, { quote: 'missing phrase' }),
      anchorRecord('m3k-a-ambiguous', 'm3k-ambiguous', 'text', {
        kind: 'text',
        quote: 'repeated',
      }, { quote: 'repeated' }),
    ],
    branches: [
      branch('m3k-e-text', { blockId: 'm3k-text', anchorId: 'm3k-a-text' }, 'm3k-text-child', 'primary', 'a1'),
      branch('m3k-e-formula-whole', { blockId: 'm3k-formula', anchorId: 'm3k-a-formula-whole' }, 'm3k-formula-whole-child', 'primary', 'a1'),
      branch('m3k-e-formula-term', { blockId: 'm3k-formula', anchorId: 'm3k-a-formula-term' }, 'm3k-formula-term-child', 'primary', 'a1'),
      branch('m3k-e-formula-ambiguous', { blockId: 'm3k-formula', anchorId: 'm3k-a-formula-ambiguous' }, 'm3k-formula-ambiguous-child', 'primary', 'a1'),
      branch('m3k-e-code', { blockId: 'm3k-code', anchorId: 'm3k-a-code' }, 'm3k-code-child', 'primary', 'a1'),
      branch('m3k-e-broken', { blockId: 'm3k-broken', anchorId: 'm3k-a-broken' }, 'm3k-broken-child', 'primary', 'a1'),
      branch('m3k-e-ambiguous', { blockId: 'm3k-ambiguous', anchorId: 'm3k-a-ambiguous' }, 'm3k-ambiguous-child', 'primary', 'a1'),
      branch('m3k-e-shared', { blockId: 'm3k-shared-home' }, 'm3k-shared', 'primary', 'a1'),
      branch('m3k-ref-to-shared', { blockId: 'm3k-ref-parent' }, 'm3k-shared', 'reference', 'a1', 'see also'),
      branch('m3k-ref-back', { blockId: 'm3k-shared' }, 'm3k-ref-parent', 'reference', 'a1', 'referenced by'),
    ],
    chapters: [
      {
        id: 'm3k-ch1',
        title: 'Anchor kinds',
        topLevelBlockIds: [
          'm3k-text',
          'm3k-formula',
          'm3k-code',
          'm3k-broken',
          'm3k-ambiguous',
          'm3k-shared-home',
          'm3k-ref-parent',
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// F11 — split/merge source with anchor migration
// ---------------------------------------------------------------------------
function fixtureM3SplitMerge() {
  const splitBlock = block('m3s-split', 'Split source', [
    p(
      text('Alpha '),
      anchorTextIds('beta', ['m3s-a-before']),
      text(' '),
      anchorTextIds('gamma ', ['m3s-a-span']),
      anchorTextIds('delta ', ['m3s-a-span', 'm3s-a-after']),
      text('epsilon.'),
    ),
  ]);
  const mergeTarget = block('m3s-merge-target', 'Merge target', [
    p(text('Merge target text.')),
  ]);
  const mergeSource = block('m3s-merge-source', 'Merge source', [
    p(
      text('Please '),
      anchorTextIds('merge me', ['m3s-a-merge']),
      text(' into the target.'),
    ),
  ]);

  return makeDocument({
    id: 'm3-split-merge',
    title: 'M3 split and merge — anchor migration',
    blocks: [
      splitBlock,
      mergeTarget,
      mergeSource,
      block('m3s-after-child', 'After-split callout', [
        p(text('A callout sourced from an anchor after the split.')),
      ]),
      block('m3s-span-child', 'Spanning callout', [
        p(text('A callout sourced from an anchor spanning the split.')),
      ]),
      block('m3s-merge-child', 'Merge callout', [
        p(text('A callout sourced from an anchor that moves on merge.')),
      ]),
    ],
    anchors: [
      anchorRecord('m3s-a-before', 'm3s-split', 'text', {
        kind: 'text',
        quote: 'beta',
      }, { quote: 'beta' }),
      anchorRecord('m3s-a-after', 'm3s-split', 'text', {
        kind: 'text',
        quote: 'delta',
      }, { quote: 'delta' }),
      anchorRecord('m3s-a-span', 'm3s-split', 'text', {
        kind: 'text',
        quote: 'gamma delta',
      }, { quote: 'gamma delta' }),
      anchorRecord('m3s-a-merge', 'm3s-merge-source', 'text', {
        kind: 'text',
        quote: 'merge me',
      }, { quote: 'merge me' }),
    ],
    branches: [
      branch('m3s-e-after', { blockId: 'm3s-split', anchorId: 'm3s-a-after' }, 'm3s-after-child', 'primary', 'a1'),
      branch('m3s-e-span', { blockId: 'm3s-split', anchorId: 'm3s-a-span' }, 'm3s-span-child', 'primary', 'a1'),
      branch('m3s-e-merge', { blockId: 'm3s-merge-source', anchorId: 'm3s-a-merge' }, 'm3s-merge-child', 'primary', 'a1'),
    ],
    chapters: [
      {
        id: 'm3s-ch1',
        title: 'Split and merge',
        topLevelBlockIds: ['m3s-split', 'm3s-merge-target', 'm3s-merge-source'],
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// F12 — formula-term edit source (AC-57: re-resolve around a term)
// ---------------------------------------------------------------------------
function fixtureM3FormulaTermEdit() {
  const termLatex = 'a^2 + b^2';
  return makeDocument({
    id: 'm3-formula-term-edit',
    title: 'M3 formula term edit — re-resolve around the term',
    blocks: [
      block('m3fe-formula', 'Formula term source', [
        p(text('The identity below owns the term anchor.')),
        withAnchorIds(displayMath('a^2 + b^2 = c^2'), ['m3fe-a-term']),
      ]),
      block('m3fe-term-child', 'Formula term callout', [
        p(text('The term callout survives every edit around its term.')),
      ]),
    ],
    anchors: [
      anchorRecord(
        'm3fe-a-term',
        'm3fe-formula',
        'formula',
        {
          kind: 'formula',
          form: 'term',
          latex: termLatex,
          occurrenceHint: 1,
        },
        { quote: termLatex, occurrenceHint: 1 },
      ),
    ],
    branches: [
      branch(
        'm3fe-e-term',
        { blockId: 'm3fe-formula', anchorId: 'm3fe-a-term' },
        'm3fe-term-child',
        'primary',
        'a1',
      ),
    ],
    chapters: [
      {
        id: 'm3fe-ch1',
        title: 'Formula term edits',
        topLevelBlockIds: ['m3fe-formula'],
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// F13 — export manifest with shared child, reference cycle, broken/ambiguous
// ---------------------------------------------------------------------------
function fixtureM3ExportManifest() {
  return makeDocument({
    id: 'm3-export-manifest',
    title: 'M3 export manifest — exactly once',
    blocks: [
      block('m3x-root-a', 'Root A', [
        p(
          text('Root A introduces the '),
          anchorTextIds('callout', ['m3x-a-callout']),
          text(' branch.'),
        ),
      ]),
      block('m3x-callout', 'Anchored callout', [
        p(text('An anchored callout exported once.')),
      ]),
      block('m3x-root-b', 'Root B', [
        p(text('Root B is the primary home of the shared child.')),
      ]),
      block('m3x-shared', 'Shared child', [
        p(text('A shared child referenced from another chapter.')),
      ]),
      block('m3x-broken-host', 'Broken anchor host', [
        p(text('The broken anchor quote is absent from this block.')),
      ]),
      block('m3x-broken-child', 'Broken anchor child', [
        p(text('A branch behind a broken anchor still exports once.')),
      ]),
      block('m3x-ref-parent', 'Reference-only root', [
        p(text('A reference-only root is included via its chapter.')),
      ]),
      block('m3x-ambiguous-host', 'Ambiguous anchor host', [
        p(text('term term term')),
      ]),
      block('m3x-ambiguous-child', 'Ambiguous anchor child', [
        p(text('A branch behind an ambiguous anchor still exports once.')),
      ]),
    ],
    anchors: [
      anchorRecord('m3x-a-callout', 'm3x-root-a', 'text', {
        kind: 'text',
        quote: 'callout',
        prefix: 'the ',
        suffix: ' branch',
        occurrenceHint: 1,
      }, { quote: 'callout', prefix: 'the ', suffix: ' branch', occurrenceHint: 1 }),
      anchorRecord('m3x-a-broken', 'm3x-broken-host', 'text', {
        kind: 'text',
        quote: 'missing phrase',
      }, { quote: 'missing phrase' }),
      anchorRecord('m3x-a-ambiguous', 'm3x-ambiguous-host', 'text', {
        kind: 'text',
        quote: 'term',
      }, { quote: 'term' }),
    ],
    branches: [
      branch('m3x-e-callout', { blockId: 'm3x-root-a', anchorId: 'm3x-a-callout' }, 'm3x-callout', 'primary', 'a1'),
      branch('m3x-e-shared', { blockId: 'm3x-root-b' }, 'm3x-shared', 'primary', 'a1'),
      branch('m3x-e-broken', { blockId: 'm3x-broken-host', anchorId: 'm3x-a-broken' }, 'm3x-broken-child', 'primary', 'a1'),
      branch('m3x-e-ambiguous', { blockId: 'm3x-ambiguous-host', anchorId: 'm3x-a-ambiguous' }, 'm3x-ambiguous-child', 'primary', 'a1'),
      branch('m3x-ref-shared', { blockId: 'm3x-ref-parent' }, 'm3x-shared', 'reference', 'a1', 'see also'),
      branch('m3x-ref-back', { blockId: 'm3x-shared' }, 'm3x-ref-parent', 'reference', 'a1', 'referenced by'),
      branch('m3x-ref-root-a', { blockId: 'm3x-ref-parent' }, 'm3x-root-a', 'reference', 'a2', 'also uses'),
    ],
    chapters: [
      {
        id: 'm3x-ch1',
        title: 'Primary homes',
        topLevelBlockIds: ['m3x-root-a', 'm3x-root-b', 'm3x-broken-host'],
      },
      {
        id: 'm3x-ch2',
        title: 'Empty chapter',
        topLevelBlockIds: [],
      },
      {
        id: 'm3x-ch3',
        title: 'References and ambiguity',
        topLevelBlockIds: ['m3x-ref-parent', 'm3x-ambiguous-host'],
      },
    ],
  });
}

async function makeAssets() {
  await mkdir(assetsDir, { recursive: true });
  {
    const canvas = createCanvas(640, 360);
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 640, 360);
    gradient.addColorStop(0, '#1d3b2a');
    gradient.addColorStop(0.55, '#2f6b4f');
    gradient.addColorStop(1, '#b9d9c0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 640, 360);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 640; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 360);
      ctx.stroke();
    }
    for (let y = 0; y <= 360; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(640, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#f6fbf7';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText('Forest plot', 32, 64);
    ctx.font = '20px sans-serif';
    ctx.fillText('residuals vs fitted values', 32, 100);
    for (let i = 0; i < 34; i += 1) {
      const x = 40 + i * 17.2;
      const y = 250 - Math.sin(i * 0.7) * 58 - (i % 5) * 9;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = i % 3 === 0 ? '#f6fbf7' : '#d7f2df';
      ctx.fill();
    }
    await writeFile(resolve(assetsDir, 'forest.png'), canvas.toBuffer('image/png'));
  }
  {
    const canvas = createCanvas(1200, 200);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f3f0e8';
    ctx.fillRect(0, 0, 1200, 200);
    for (let i = 0; i < 120; i += 1) {
      ctx.fillStyle = `hsl(${(i * 3) % 360} 42% 48%)`;
      ctx.fillRect(i * 10, 200 - (20 + ((i * 37) % 170)), 8, 20 + ((i * 37) % 170));
    }
    ctx.fillStyle = '#222';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Wide spectrum — 1200 px', 20, 32);
    await writeFile(resolve(assetsDir, 'wide.png'), canvas.toBuffer('image/png'));
  }
  {
    const canvas = createCanvas(420, 240);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#eef4ff';
    ctx.fillRect(0, 0, 420, 240);
    ctx.strokeStyle = '#375a9e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= 420; x += 6) {
      const y = 200 - Math.sin(x / 40) * 40 - Math.cos(x / 13) * 10;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#1e335c';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Eigenvalue chart', 20, 36);
    await writeFile(resolve(assetsDir, 'chart.png'), canvas.toBuffer('image/png'));
  }
}

async function main() {
  await makeAssets();
  const golden = fixtureF1();
  const landscape = structuredClone(golden);
  landscape.id = 'f1-landscape-golden';
  landscape.title = 'Linear algebra — eigenvalues (landscape)';
  landscape.pageSetup = { ...landscape.pageSetup, orientation: 'landscape' };
  const fixtures = {
    'golden-eigenvalues.json': golden,
    'landscape-golden.json': landscape,
    'long-50-pages.json': fixtureF2(),
    'wide-fan.json': fixtureF3(),
    'deep-chain.json': fixtureF4(),
    'shared-child.json': fixtureF5(),
    'tables.json': fixtureF6(),
    'scale-300.json': fixtureF7(),
    'defects.json': fixtureF8(),
    'broken-anchor.json': fixtureF9(),
    'm3-anchor-kinds.json': fixtureM3AnchorKinds(),
    'm3-split-merge.json': fixtureM3SplitMerge(),
    'm3-formula-term-edit.json': fixtureM3FormulaTermEdit(),
    'm3-export-manifest.json': fixtureM3ExportManifest(),
  };
  for (const [file, document] of Object.entries(fixtures)) {
    await writeFile(resolve(fixturesDir, file), `${JSON.stringify(document, null, 2)}\n`);
    const blockCount = Object.keys(document.blocks).length;
    const branchCount = Object.keys(document.branches).length;
    console.log(`${file}: ${blockCount} blocks, ${branchCount} branches, ${document.chapters.length} chapters`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
