/**
 * Read-only frontmatter block for the flat Markdown schema.
 *
 * The node is atomic and non-selectable: the YAML is chrome, never editable
 * text. A transaction filter restores the rule at the Editor level, so
 * Backspace/Delete or a paste can never remove the prefix. The serializer
 * re-emits `attrs.raw` byte-for-byte before the normalized body.
 *
 * A plain DOM node view is used so the schema module stays usable in Node unit
 * tests (no React/DOM import at module load).
 */

import { Node } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';

export const FRONTMATTER_NODE_NAME = 'frontmatter';

/**
 * Transaction meta that lets the explicit Reload-from-disk path replace the
 * document (including a file whose frontmatter changed or disappeared). A user
 * edit never carries this meta, so the prefix stays immutable.
 */
export const FRONTMATTER_RELOAD_META = 'markdownFrontmatterReload';

const frontmatterKey = new PluginKey('markdownFrontmatterGuard');

export const MarkdownFrontmatterNode = Node.create({
  name: FRONTMATTER_NODE_NAME,
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      raw: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-raw') ?? element.textContent ?? '',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-raw': typeof attributes['raw'] === 'string' ? attributes['raw'] : '',
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-nf-frontmatter]' }, { tag: 'pre[data-nf-frontmatter]' }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const raw = typeof node.attrs['raw'] === 'string' ? node.attrs['raw'] : '';
    // Copy/paste carries the exact raw prefix (never an editable code fence).
    return [
      'pre',
      { ...HTMLAttributes, 'data-nf-frontmatter': 'true', class: 'nf-markdown-frontmatter-raw' },
      raw,
    ];
  },
  addNodeView() {
    return ({ node }: { node: PMNode }) => {
      let current = node;
      const dom = document.createElement('div');
      dom.className = 'nf-markdown-frontmatter';
      dom.dataset['markdownFrontmatter'] = 'true';
      dom.contentEditable = 'false';
      dom.setAttribute('role', 'note');
      dom.setAttribute('aria-label', 'YAML frontmatter, preserved verbatim and read-only');

      const label = document.createElement('div');
      label.className = 'nf-markdown-frontmatter-label';
      label.textContent = 'Frontmatter';

      const note = document.createElement('span');
      note.className = 'nf-markdown-frontmatter-note';
      note.textContent = 'preserved verbatim · read-only';

      const body = document.createElement('pre');
      body.className = 'nf-markdown-frontmatter-body';

      const render = (value: PMNode): void => {
        const raw = typeof value.attrs['raw'] === 'string' ? value.attrs['raw'] : '';
        body.textContent = raw;
      };
      render(current);

      label.append(note);
      dom.append(label, body);
      return {
        dom,
        update: (updated: PMNode) => {
          if (updated.type !== current.type) return false;
          current = updated;
          render(updated);
          return true;
        },
        ignoreMutation: () => true,
        stopEvent: () => false,
      };
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: frontmatterKey,
        // The frontmatter prefix can never be removed or altered by an edit:
        // the first block stays the same raw atom for the whole session.
        filterTransaction: (transaction, state) => {
          if (transaction.getMeta(FRONTMATTER_RELOAD_META) === true) return true;
          const before = state.doc.firstChild;
          if (before === null || before.type.name !== FRONTMATTER_NODE_NAME) return true;
          const after = transaction.doc.firstChild;
          if (after === null || after.type.name !== FRONTMATTER_NODE_NAME) return false;
          return after.attrs['raw'] === before.attrs['raw'];
        },
      }),
    ];
  },
});
