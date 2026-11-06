/**
 * View helpers for starting/stopping image region authoring.
 *
 * The document never changes until the user chooses "Branch from region" on
 * the pending selection: opening the authoring surface and cancelling are pure
 * UI state.
 */

import { toast } from 'sonner';
import { getNodeAtPath, imageAssetId } from '@noteforest/core';
import type { DocumentRuntime } from '../state/runtime';
import {
  clearEditorImageAuthoring,
  setEditorImageAuthoring,
} from '../editor/editor-ui';
import type { ImageAuthoringMode } from './image-anchor';

export function beginImageAnchorAuthoring(
  runtime: DocumentRuntime,
  blockId: string,
  path: readonly number[],
  mode: ImageAuthoringMode,
): boolean {
  if (!runtime.editable) {
    toast.error('This document is open read-only.');
    return false;
  }
  const block = runtime.document.blocks[blockId];
  if (block === undefined) {
    toast.error('The image block no longer exists.');
    return false;
  }
  const node = getNodeAtPath(block.content, path);
  const assetId = node === null ? null : imageAssetId(node);
  if (node === null || node.type !== 'image' || assetId === null) {
    toast.error('This block no longer contains the image.');
    return false;
  }
  if (runtime.document.assets[assetId] === undefined) {
    toast.error('The image asset is missing; existing branches and anchors are kept.');
    return false;
  }
  const editor = runtime.editor;
  if (editor === null) return false;
  runtime.selectBlock(blockId);
  setEditorImageAuthoring(editor, {
    blockId,
    path: [...path],
    mode,
  });
  return true;
}

export function cancelImageAnchorAuthoring(runtime: DocumentRuntime): void {
  const editor = runtime.editor;
  if (editor !== null) clearEditorImageAuthoring(editor);
}
