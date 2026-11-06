import {
  Mark,
  Node,
  mergeAttributes,
  type Editor,
  type NodeViewRenderer,
} from '@tiptap/core';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
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
import { ImageNodeView } from './views/ImageNodeView';

const lowlight = createLowlight(common);

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
      anchorIds: formulaAnchorIdsAttr(),
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
}).configure({ allowBase64: false, inline: false });

function anchorIdsFromElement(element: HTMLElement): string[] {
  const raw = element.getAttribute('data-anchor-ids') ?? element.getAttribute('data-anchor-id') ?? '';
  return normalizeAnchorIds(raw.split(',').map((value) => value.trim()));
}

function formulaAnchorIdsAttr(): Record<string, unknown> {
  return {
    default: [],
    parseHTML: (element: HTMLElement) => anchorIdsFromElement(element),
    renderHTML: (attributes: Record<string, unknown>) => {
      const ids = normalizeAnchorIds(
        Array.isArray(attributes['anchorIds']) ? (attributes['anchorIds'] as string[]) : [],
      );
      return ids.length === 0 ? {} : { 'data-anchor-ids': ids.join(',') };
    },
  };
}

/**
 * M3c1: whole-formula anchors bind through `attrs.anchorIds` on the formula
 * node (ADR-0005 §1). The math nodes keep their KaTeX node view; this wrapper
 * adds the canonical attribute and a DOM marker source. A plain click selects
 * the whole formula (NodeSelection); a double click keeps opening the existing
 * formula editor.
 */
function createFormulaNodeView(
  parentRenderer: NodeViewRenderer,
  editor: Editor,
): NodeViewRenderer {
  return (props) => {
    const view = parentRenderer(props);
    const dom = view.dom as HTMLElement;
    const syncAnchorAttributes = (node: ProseMirrorNode): void => {
      const ids = normalizeAnchorIds(
        Array.isArray(node.attrs['anchorIds']) ? (node.attrs['anchorIds'] as string[]) : [],
      );
      if (ids.length > 0) {
        dom.setAttribute('data-anchor-ids', ids.join(','));
        dom.classList.add('nf-formula-anchor');
      } else {
        dom.removeAttribute('data-anchor-ids');
        dom.classList.remove('nf-formula-anchor');
      }
      dom.setAttribute('data-anchor-kind', 'formula');
    };
    syncAnchorAttributes(props.node);
    const handleClick = (event: MouseEvent): void => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const pos = props.getPos();
      if (typeof pos !== 'number') return;
      if (event.detail >= 2) {
        window.dispatchEvent(
          new CustomEvent('nf:edit-math', {
            detail: {
              kind: props.node.type.name === 'blockMath' ? 'block' : 'inline',
              latex: String(props.node.attrs['latex'] ?? ''),
              pos,
            },
          }),
        );
        return;
      }
      const selection = NodeSelection.create(editor.state.doc, pos);
      editor.view.dispatch(editor.state.tr.setSelection(selection));
      editor.view.focus();
    };
    dom.addEventListener('click', handleClick);
    const destroy = view.destroy?.bind(view);
    return {
      ...view,
      destroy() {
        dom.removeEventListener('click', handleClick);
        destroy?.();
      },
    };
  };
}

function extendFormulaNode<T extends Node>(extension: T): T {
  return extension.extend({
    addAttributes() {
      const parent = (this.parent?.() ?? {}) as Record<string, unknown>;
      return {
        ...parent,
        anchorIds: formulaAnchorIdsAttr(),
      };
    },
    addNodeView() {
      const parentRenderer = this.parent?.() ?? null;
      if (parentRenderer === null) return null;
      return createFormulaNodeView(parentRenderer, this.editor);
    },
  }) as T;
}

/**
 * M3c3a: code anchors bind through `attrs.anchorIds` on the codeBlock node
 * (ADR-0005 §1). The codeBlock keeps its native editable `<pre><code>` render;
 * only the atomic attribute and the code DOM marker source are added.
 */
function extendCodeBlock<T extends Node>(extension: T): T {
  return extension.extend({
    addAttributes() {
      const parent = (this.parent?.() ?? {}) as Record<string, unknown>;
      return {
        ...parent,
        anchorIds: formulaAnchorIdsAttr(),
      };
    },
  }) as T;
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
    extendCodeBlock(CodeBlockLowlight).configure({
      lowlight,
      defaultLanguage: 'plaintext',
      HTMLAttributes: { 'data-anchor-kind': 'code' },
    }),
    CanonicalImage,
    TableKit.configure({ table: { resizable: false } }),
    extendFormulaNode(BlockMath).configure({
      katexOptions: { throwOnError: false },
    }),
    extendFormulaNode(InlineMath).configure({
      katexOptions: { throwOnError: false },
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
