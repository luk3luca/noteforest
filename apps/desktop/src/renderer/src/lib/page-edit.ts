/**
 * Pure helpers for the Page Edit single-block overlay.
 *
 * The overlay uses the same content adapter as the continuous editor: the
 * block body is projected to ProseMirror JSON on open, and the edited document
 * is converted back to canonical content on commit. Keeping this module pure
 * makes the round trip testable without a DOM or a second editor.
 */

import type { ContentNode } from '@noteforest/core';
import { pmToContent, withBody, type PMNode } from './adapter';

/**
 * Turn the overlay's ProseMirror document JSON into canonical block content.
 * The original content root is preserved so unknown root fields survive; only
 * `children` is replaced by the edited body.
 */
export function blockContentFromEditorJson(
  base: ContentNode,
  documentJson: PMNode,
): ContentNode {
  const children = Array.isArray(documentJson.content)
    ? documentJson.content.map((node) => pmToContent(node))
    : [];
  return withBody(base, { type: 'doc', children });
}

function isEmptyInline(node: PMNode): boolean {
  if (node.type === 'text') return (node.text ?? '').length === 0;
  if (node.type === 'hardBreak') return true;
  // An atomic inline node (math, image, unsupported) is content even when it
  // has no children.
  return false;
}

/**
 * True when the overlay document has no content at all: only empty paragraphs
 * (and optional empty inline nodes such as a hard break). Used only for the
 * documented Esc rule; a block the user emptied is still committed because the
 * document changed.
 */
export function editorJsonIsEmpty(documentJson: PMNode): boolean {
  const content = documentJson.content ?? [];
  return content.every(
    (node) => node.type === 'paragraph' && (node.content ?? []).every((child) => isEmptyInline(child)),
  );
}
