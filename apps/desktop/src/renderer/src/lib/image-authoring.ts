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
import { imageAnchorAuthoringGate } from './image';
import type { ImageAuthoringMode } from './image-anchor';

export function beginImageAnchorAuthoring(
  runtime: DocumentRuntime,
  blockId: string,
  path: readonly number[],
  mode: ImageAuthoringMode,
): boolean {
  if (!runtime.editable) {
    toast.error('This note is open read-only.');
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
  const gate = imageAnchorAuthoringGate({
    editable: runtime.editable,
    assetId,
    hasAssetRecord: runtime.document.assets[assetId] !== undefined,
    availability: runtime.assetAvailability,
  });
  if (!gate.allowed) {
    toast.error(
      gate.reason === 'asset-changed'
        ? 'The image asset changed; replace it or reload the document before adding an anchor.'
        : gate.reason === 'asset-missing'
          ? 'The image file is missing; replace it or reload the document before adding an anchor.'
          : 'The image asset is missing; existing branches and anchors are kept.',
    );
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
