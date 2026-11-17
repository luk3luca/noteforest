import { Mark, Node, mergeAttributes } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { StarterKit } from '@tiptap/starter-kit';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { normalizeAnchorIds } from '@noteforest/core';
import { anchorIdsAttribute, anchorIdsFromElement } from './anchor-attrs';
import {
  BlockBodyView,
  BlockView,
  BranchChildrenView,
  CalloutLaneView,
  ChapterView,
} from './views/BlockViews';
import { ImageNodeView } from './views/ImageNodeView';
import { CodeBlockKeys, CodeBlockNode } from './code-block';
import { InlineCodeBacktick } from './inline-code';
import { ParenOrderedListInput } from './lists';
import { BlockFormulaNode, InlineFormulaNode } from './formulas';
import { TableEditing, TableExtensions } from './tables';
import { FindHighlightExtension } from './find-decorations';
import { HighlightMark } from './highlight-mark';

/**
 * M3c3b1: canonical image nodes carry `assetId`, not a display path. The
 * editor projection injects `src` (a renderer-safe `noteforest-asset://` URL)
 * and a view-only `missing` flag; both are stripped before the content is
 * written back to the canonical document.
 */
const CanonicalImage = Image.extend({
  addAttributes() {
    const parent = (this.parent?.() ?? {}) as Record<string, unknown>;
    return {
      ...parent,
      assetId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-asset-id'),
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes['assetId'] === 'string' && attributes['assetId'].length > 0
            ? { 'data-asset-id': attributes['assetId'] }
            : {},
      },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = Number(element.getAttribute('width'));
          return Number.isInteger(value) && value > 0 ? value : null;
        },
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes['width'] === 'number' ? { width: attributes['width'] } : {},
      },
      height: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = Number(element.getAttribute('height'));
          return Number.isInteger(value) && value > 0 ? value : null;
        },
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes['height'] === 'number' ? { height: attributes['height'] } : {},
      },
      missing: {
        default: false,
        rendered: false,
        parseHTML: () => false,
      },
      /**
       * Editor-only source id while a cross-document paste copies the bytes into
       * the destination package. It is never written to canonical content.
       */
      clipboardAssetId: {
        default: null,
        rendered: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-nf-copy-asset'),
      },
      /**
       * Canonical placeholder reason for an image whose bytes could not be
       * copied from another document. It is optional metadata on the image node
       * (unknown attributes are preserved by the content model) and keeps the
       * labeled placeholder after reload without a dangling `assetId`.
       */
      unavailable: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-nf-unavailable'),
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes['unavailable'] === 'string' && attributes['unavailable'].length > 0
            ? { 'data-nf-unavailable': attributes['unavailable'] }
            : {},
      },
      anchorIds: anchorIdsAttribute(),
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
}).configure({ allowBase64: false, inline: false });

/**
 * Text-anchor binding mark (ADR-0005 §1).
 *
 * One mark per text node carries the sorted `anchorIds` array; overlapping
 * anchors share it. The end is non-inclusive so typing at the right boundary
 * does not silently grow the range. This is a semantic mark: it is not a
 * formatting toggle and must survive `unsetAllMarks`.
 */
export const AnchorMark = Mark.create({
  name: 'anchor',
  inclusive: false,
  keepOnSplit: true,
  clearable: false,
  addAttributes() {
    return {
      anchorIds: {
        default: [],
        parseHTML: (element) => anchorIdsFromElement(element),
        renderHTML: (attributes) => ({
          'data-anchor-ids': normalizeAnchorIds(
            Array.isArray(attributes['anchorIds'])
              ? (attributes['anchorIds'] as string[])
              : [],
          ).join(','),
        }),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-anchor-mark]',
        getAttrs: (element) => {
          const ids = anchorIdsFromElement(element as HTMLElement);
          return ids.length === 0 ? false : { anchorIds: ids };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'nf-anchor-mark',
        'data-anchor-mark': 'true',
      }),
      0,
    ];
  },
});

/**
 * Wrapper nodes. `chapter` and `blockBody` are in the ProseMirror `block`
 * group; branch blocks live in their own `branch` group so a block body can
 * never swallow another block.
 */
export const ChapterNode = Node.create({
  name: 'chapter',
  group: 'block',
  // Empty chapters are valid: a legacy chapter keeps its title and an
  // "Add top-level block" row instead of being dropped by the adapter.
  content: 'branch*',
  defining: true,
  isolating: true,
  selectable: false,
  addAttributes() {
    return {
      chapterId: { default: null },
      title: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'section[data-chapter-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { 'data-chapter-id': '' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ChapterView);
  },
});

export const BlockNode = Node.create({
  name: 'branchBlock',
  group: 'branch',
  // The callout lane is an editor projection between the parent card and the
  // direct-child group. It never reaches the canonical document.
  content: 'blockBody calloutLane? branchChildren?',
  defining: true,
  isolating: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      blockId: { default: null },
      depth: { default: 0 },
      topLevel: { default: false },
      collapsed: { default: false },
      label: { default: null },
      border: { default: null },
      callout: { default: false },
      belowRow: { default: false },
      rowKind: { default: null },
      anchorId: { default: null },
      anchorKind: { default: null },
      anchorQuote: { default: null },
      anchorState: { default: null },
      calloutBranchId: { default: null },
      calloutParentId: { default: null },
      hasCallouts: { default: false },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-block-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-block-id': '' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BlockView);
  },
});

export const BlockBodyNode = Node.create({
  name: 'blockBody',
  group: 'block',
  content: 'block+',
  defining: false,
  isolating: false,
  selectable: false,
  addAttributes() {
    return {
      blockId: { default: null },
      depth: { default: 0 },
      topLevel: { default: false },
      collapsed: { default: false },
      childCount: { default: 0 },
      callout: { default: false },
      belowRow: { default: false },
      rowKind: { default: null },
      anchorId: { default: null },
      anchorKind: { default: null },
      anchorQuote: { default: null },
      anchorState: { default: null },
      calloutBranchId: { default: null },
      calloutParentId: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-block-body]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-block-body': '' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BlockBodyView);
  },
});

export const BranchChildrenNode = Node.create({
  name: 'branchChildren',
  group: 'branch',
  content: 'branch+',
  defining: false,
  isolating: true,
  selectable: false,
  addAttributes() {
    return {
      parentId: { default: null },
      depth: { default: 0 },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-branch-children]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-branch-children': '' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BranchChildrenView);
  },
});

export const CalloutLaneNode = Node.create({
  name: 'calloutLane',
  // Named only by `branchBlock.content`; a chapter or branch group can never
  // own a lane directly.
  content: 'branch+',
  defining: false,
  isolating: true,
  selectable: false,
  addAttributes() {
    return {
      parentId: { default: null },
      depth: { default: 0 },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-callout-lane]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout-lane': '' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutLaneView);
  },
});

export interface EditorExtensionOptions {
  /** Placeholder copy; the Page Edit overlay names its block instead. */
  placeholder?: string;
}

export function createEditorExtensions(options: EditorExtensionOptions = {}) {
  return [
    StarterKit.configure({
      codeBlock: false,
      link: false,
      heading: { levels: [1, 2, 3] },
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    CodeBlockNode,
    CodeBlockKeys,
    InlineCodeBacktick,
    // `1) ` typed lists; the `1. ` marker stays with StarterKit's orderedList.
    ParenOrderedListInput,
    CanonicalImage,
    ...TableExtensions,
    TableEditing,
    InlineFormulaNode,
    BlockFormulaNode,
    Placeholder.configure({
      placeholder: options.placeholder ?? 'Type something, or press /',
      showOnlyWhenEditable: true,
      includeChildren: true,
    }),
    AnchorMark,
    // A stored inline text mark (F4b). It must be in the schema the Page Edit
    // overlay also mounts, or ProseMirror drops it on the first edit.
    HighlightMark,
    ChapterNode,
    BlockNode,
    BlockBodyNode,
    BranchChildrenNode,
    CalloutLaneNode,
    FindHighlightExtension,
  ];
}
