/**
 * Flat Markdown guest-file schema.
 *
 * This is the approved flat extension set: StarterKit + link + code block +
 * inline code + math + tables + image. It deliberately contains no forest
 * nodes (`chapter`, `branchBlock`, `blockBody`, `branchChildren`,
 * `calloutLane`), no anchor marks/decorations, and no forest keymap.
 *
 * Node-safe on purpose: the parser and serializer are unit-tested without a
 * DOM, and the renderer adds the React image node view on top of this list.
 */

import { getSchema, type Extensions } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import type { Schema } from '@tiptap/pm/model';
import { CodeBlockKeys, CodeBlockNode } from '../editor/code-block';
import { InlineCodeBacktick } from '../editor/inline-code';
import { ParenOrderedListInput } from '../editor/lists';
import { BlockFormulaNode, InlineFormulaNode } from '../editor/formulas';
import { TableEditing, TableExtensions } from '../editor/tables';

/**
 * Plain inline image node used by the schema and the serializer. The renderer
 * replaces it with the same node plus a React node view; the node name, attrs,
 * and inline placement stay identical.
 */
export const MarkdownImage = Image.configure({
  allowBase64: false,
  inline: true,
});

export interface FlatMarkdownExtensionOptions {
  /** Renderer-provided image extension with the confined-file node view. */
  image?: Extensions[number];
}

export function createFlatMarkdownExtensions(
  options: FlatMarkdownExtensionOptions = {},
): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      link: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      // A guest file shows exactly the blocks it contains; no synthetic
      // trailing paragraph and no forest placeholder.
      trailingNode: false,
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
    ParenOrderedListInput,
    options.image ?? MarkdownImage,
    ...TableExtensions,
    TableEditing,
    InlineFormulaNode,
    BlockFormulaNode,
  ];
}

let cachedSchema: Schema | null = null;

/** The one schema used by the parser, serializer, and mounted editor. */
export function flatMarkdownSchema(): Schema {
  if (cachedSchema === null) {
    cachedSchema = getSchema(createFlatMarkdownExtensions());
  }
  return cachedSchema;
}
