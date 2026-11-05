import { Mark, Node, mergeAttributes } from '@tiptap/core';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Mathematics } from '@tiptap/extension-mathematics';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { normalizeAnchorIds } from '@noteforest/core';
import {
  BlockBodyView,
  BlockView,
  BranchChildrenView,
  CalloutLaneView,
  ChapterView,
} from './views/BlockViews';

const lowlight = createLowlight(common);

function anchorIdsFromElement(element: HTMLElement): string[] {
  const raw = element.getAttribute('data-anchor-ids') ?? element.getAttribute('data-anchor-id') ?? '';
  return normalizeAnchorIds(raw.split(',').map((value) => value.trim()));
}

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
      anchorId: { default: null },
      anchorQuote: { default: null },
      anchorState: { default: null },
      calloutBranchId: { default: null },
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
      anchorId: { default: null },
      anchorQuote: { default: null },
      anchorState: { default: null },
      calloutBranchId: { default: null },
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

export function createEditorExtensions() {
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
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'plaintext' }),
    Image.configure({ allowBase64: true, inline: false }),
    TableKit.configure({ table: { resizable: false } }),
    Mathematics.configure({
      katexOptions: { throwOnError: false },
      inlineOptions: {
        onClick: (node, pos) => {
          window.dispatchEvent(
            new CustomEvent('nf:edit-math', {
              detail: { kind: 'inline', latex: String(node.attrs['latex'] ?? ''), pos },
            }),
          );
        },
      },
      blockOptions: {
        onClick: (node, pos) => {
          window.dispatchEvent(
            new CustomEvent('nf:edit-math', {
              detail: { kind: 'block', latex: String(node.attrs['latex'] ?? ''), pos },
            }),
          );
        },
      },
    }),
    Placeholder.configure({
      placeholder: 'Type something, or press /',
      showOnlyWhenEditable: true,
      includeChildren: true,
    }),
    AnchorMark,
    ChapterNode,
    BlockNode,
    BlockBodyNode,
    BranchChildrenNode,
    CalloutLaneNode,
  ];
}
