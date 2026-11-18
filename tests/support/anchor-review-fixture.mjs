/**
 * Review fixture for the anchor-resolution-index batch (plan §6.3).
 *
 * One case per visible change, each with an outgoing primary branch so the
 * anchor is live (not idle):
 *
 * 1. `multi`    — a text anchor whose mark covers two adjacent text nodes: one
 *                 resolved range, two measured wrappers (union box).
 * 2. `formula`  — a repeated formula term: one measured math rect, core says
 *                 ambiguous.
 * 3. `image`    — an image anchor whose selector asset differs from the bound
 *                 image: core says broken/asset-changed, one measured image
 *                 rect.
 * 4. `selector` — a unique quote with no binding: core resolves by quote, the
 *                 page has no wrapper and falls back to the block box.
 * 5. `idle`     — a branchless record with no binding: core says idle.
 *
 * `control` is a plain single-run resolved anchor for comparison.
 */

import { resolve } from 'node:path';

export const FOREST_ASSET = '2492f7a53cb3fced6fd50d12d994a18891e56945d3a508a593678b31992c6f04';
export const CHART_ASSET = '2eef7bac17f03bba7faf2af0674bc36c72f9fd14bbe2cb15b5e790cfa8f8dd98';

export const REVIEW_BLOCK_IDS = {
  multi: 'review-multi',
  formula: 'review-formula',
  image: 'review-image',
  selector: 'review-selector',
  idle: 'review-idle',
  control: 'review-control',
  multiTarget: 'review-multi-target',
  formulaTarget: 'review-formula-target',
  imageTarget: 'review-image-target',
  selectorTarget: 'review-selector-target',
  controlTarget: 'review-control-target',
};

function paragraph(children) {
  return { type: 'paragraph', children };
}

function text(value, anchorIds) {
  const node = { type: 'text', text: value };
  if (anchorIds !== undefined) {
    node.marks = [{ type: 'anchor', attrs: { anchorIds } }];
  }
  return node;
}

export function anchorReviewDocument() {
  const ids = REVIEW_BLOCK_IDS;
  const blocks = {
    [ids.multi]: {
      id: ids.multi,
      label: '1 · Multi-node text',
      content: {
        type: 'doc',
        children: [
          paragraph([
            text('A single anchor covers '),
            text('two adjacent ', ['review-a-multi']),
            text('text runs', ['review-a-multi']),
            text(' and resolves once.'),
          ]),
        ],
      },
    },
    [ids.formula]: {
      id: ids.formula,
      label: '2 · Repeated formula term',
      content: {
        type: 'doc',
        children: [
          paragraph([
            text('The term '),
            { type: 'inlineMath', attrs: { latex: 'x + x', anchorIds: ['review-a-formula'] } },
            text(' appears twice inside one formula.'),
          ]),
        ],
      },
    },
    [ids.image]: {
      id: ids.image,
      label: '3 · Replaced image',
      content: {
        type: 'doc',
        children: [
          {
            type: 'image',
            attrs: {
              assetId: FOREST_ASSET,
              alt: 'Forest plot',
              width: 480,
              height: 270,
              anchorIds: ['review-a-image'],
            },
          },
        ],
      },
    },
    [ids.selector]: {
      id: ids.selector,
      label: '4 · Selector-only anchor',
      content: {
        type: 'doc',
        children: [
          paragraph([
            text('This paragraph contains a unique quote that no mark wraps.'),
          ]),
        ],
      },
    },
    [ids.idle]: {
      id: ids.idle,
      label: '5 · Idle anchor',
      content: {
        type: 'doc',
        children: [paragraph([text('This block has a branchless anchor record.')])],
      },
    },
    [ids.control]: {
      id: ids.control,
      label: 'Control · Resolved',
      content: {
        type: 'doc',
        children: [
          paragraph([
            text('The '),
            text('control', ['review-a-control']),
            text(' anchor resolves by its exact binding.'),
          ]),
        ],
      },
    },
    [ids.multiTarget]: {
      id: ids.multiTarget,
      label: 'Callout · Multi-node',
      content: { type: 'doc', children: [paragraph([text('Callout for the multi-node range.')])] },
    },
    [ids.formulaTarget]: {
      id: ids.formulaTarget,
      label: 'Callout · Ambiguous formula',
      content: { type: 'doc', children: [paragraph([text('Callout for the ambiguous formula term.')])] },
    },
    [ids.imageTarget]: {
      id: ids.imageTarget,
      label: 'Callout · Lost image',
      content: { type: 'doc', children: [paragraph([text('Callout for the lost image region.')])] },
    },
    [ids.selectorTarget]: {
      id: ids.selectorTarget,
      label: 'Callout · Selector-only',
      content: { type: 'doc', children: [paragraph([text('Callout for the selector-resolved quote.')])] },
    },
    [ids.controlTarget]: {
      id: ids.controlTarget,
      label: 'Callout · Control',
      content: { type: 'doc', children: [paragraph([text('Callout for the control anchor.')])] },
    },
  };

  const anchors = {
    'review-a-multi': {
      id: 'review-a-multi',
      blockId: ids.multi,
      kind: 'text',
      selector: {
        kind: 'text',
        quote: 'two adjacent text runs',
        prefix: 'A single anchor covers ',
        suffix: ' and resolves',
        occurrenceHint: 1,
      },
      quote: 'two adjacent text runs',
      occurrenceHint: 1,
    },
    'review-a-formula': {
      id: 'review-a-formula',
      blockId: ids.formula,
      kind: 'formula',
      selector: { kind: 'formula', form: 'term', latex: 'x' },
      quote: 'x',
    },
    'review-a-image': {
      id: 'review-a-image',
      blockId: ids.image,
      kind: 'image',
      selector: {
        kind: 'image',
        assetId: CHART_ASSET,
        rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
        crop: { x: 0, y: 0, width: 1, height: 1 },
        point: false,
        label: 'Old chart',
      },
      quote: 'Old chart',
    },
    'review-a-selector': {
      id: 'review-a-selector',
      blockId: ids.selector,
      kind: 'text',
      selector: { kind: 'text', quote: 'unique quote', prefix: 'a ', suffix: ' that no mark' },
      quote: 'unique quote',
    },
    'review-a-idle': {
      id: 'review-a-idle',
      blockId: ids.idle,
      kind: 'text',
      selector: { kind: 'text', quote: 'branchless anchor record' },
      quote: 'branchless anchor record',
    },
    'review-a-control': {
      id: 'review-a-control',
      blockId: ids.control,
      kind: 'text',
      selector: { kind: 'text', quote: 'control', prefix: 'The ', suffix: ' anchor' },
      quote: 'control',
      occurrenceHint: 1,
    },
  };

  const branches = {
    'review-e-multi': {
      id: 'review-e-multi',
      source: { blockId: ids.multi, anchorId: 'review-a-multi' },
      targetBlockId: ids.multiTarget,
      role: 'primary',
      order: 'a1',
    },
    'review-e-formula': {
      id: 'review-e-formula',
      source: { blockId: ids.formula, anchorId: 'review-a-formula' },
      targetBlockId: ids.formulaTarget,
      role: 'primary',
      order: 'a1',
    },
    'review-e-image': {
      id: 'review-e-image',
      source: { blockId: ids.image, anchorId: 'review-a-image' },
      targetBlockId: ids.imageTarget,
      role: 'primary',
      order: 'a1',
    },
    'review-e-selector': {
      id: 'review-e-selector',
      source: { blockId: ids.selector, anchorId: 'review-a-selector' },
      targetBlockId: ids.selectorTarget,
      role: 'primary',
      order: 'a1',
    },
    'review-e-control': {
      id: 'review-e-control',
      source: { blockId: ids.control, anchorId: 'review-a-control' },
      targetBlockId: ids.controlTarget,
      role: 'primary',
      order: 'a1',
    },
  };

  return {
    schemaVersion: 2,
    id: 'anchor-review',
    title: 'Anchor resolution review',
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z',
    revision: 0,
    chapters: [
      {
        id: 'review-chapter',
        title: 'Anchor resolution · visible cases',
        topLevelBlockIds: [ids.multi, ids.formula, ids.image, ids.selector, ids.idle, ids.control],
      },
    ],
    blocks,
    anchors,
    branches,
    assets: {
      [FOREST_ASSET]: {
        id: FOREST_ASSET,
        path: `assets/${FOREST_ASSET}`,
        mime: 'image/png',
        width: 640,
        height: 360,
        alt: 'Forest plot',
        originalName: 'forest.png',
      },
      [CHART_ASSET]: {
        id: CHART_ASSET,
        path: `assets/${CHART_ASSET}`,
        mime: 'image/png',
        width: 420,
        height: 240,
        alt: 'Replacement chart',
        originalName: 'chart.png',
      },
    },
  };
}

/** Asset source files for `writePagePackage(library, name, document, files)`. */
export const REVIEW_ASSET_FILES = {
  [FOREST_ASSET]: resolve(import.meta.dirname, '../../fixtures/assets/forest.png'),
  [CHART_ASSET]: resolve(import.meta.dirname, '../../fixtures/assets/chart.png'),
};
