/**
 * Image insertion paths: block-menu picker and paste/drop.
 *
 * Every path copies bytes into the package through the main-process asset
 * store before the canvas changes. The original file is never referenced, and
 * the UI stays responsive while a large image is hashed and written.
 */

import { toast } from 'sonner';
import type { Asset } from '@noteforest/core';
import type { DocumentRuntime } from '../state/runtime';
import { mimeForImageFile } from './image';

function targetBlock(runtime: DocumentRuntime, blockId: string | null): string | null {
  return blockId ?? runtime.selectedBlockId;
}

function beginCopy(count: number): string | number {
  return toast.loading(count === 1 ? 'Copying image…' : `Copying ${count} images…`);
}

async function finishInsert(
  runtime: DocumentRuntime,
  blockId: string,
  asset: Asset,
  toastId: string | number,
): Promise<void> {
  const outcome = await runtime.insertImage(blockId, asset);
  if (!outcome.ok) {
    toast.error(outcome.message ?? 'Could not insert the image.', { id: toastId });
    return;
  }
  toast.success('Image inserted', { id: toastId });
}

/** Native picker path: the main process copies the chosen file into the package. */
export async function insertImageFromDialog(
  runtime: DocumentRuntime,
  blockId: string | null,
): Promise<void> {
  const target = targetBlock(runtime, blockId);
  if (target === null) {
    toast.error('Select a block before inserting an image.');
    return;
  }
  if (!runtime.editable) {
    toast.error('This document is open read-only.');
    return;
  }
  const toastId = beginCopy(1);
  try {
    // The asset bytes live inside the package, so a draft materializes first.
    const prepared = await runtime.ensureMaterialized();
    if (!prepared.ok) {
      toast.error(prepared.message, { id: toastId });
      return;
    }
    const result = await window.noteforest.importImage(runtime.packagePath);
    if (!result.ok) {
      if (result.canceled) toast.dismiss(toastId);
      else toast.error(result.message, { id: toastId });
      return;
    }
    await finishInsert(runtime, target, result.asset, toastId);
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : 'Could not copy the image.',
      { id: toastId },
    );
  }
}

/**
 * Replace the asset behind an existing image node. The old asset record and the
 * old image anchors are never deleted; the anchors become broken because their
 * selector still names the old asset.
 */
export async function replaceImageFromDialog(
  runtime: DocumentRuntime,
  blockId: string,
  path: readonly number[],
): Promise<void> {
  if (!runtime.editable) {
    toast.error('This document is open read-only.');
    return;
  }
  const toastId = beginCopy(1);
  try {
    const prepared = await runtime.ensureMaterialized();
    if (!prepared.ok) {
      toast.error(prepared.message, { id: toastId });
      return;
    }
    const result = await window.noteforest.importImage(runtime.packagePath);
    if (!result.ok) {
      if (result.canceled) toast.dismiss(toastId);
      else toast.error(result.message, { id: toastId });
      return;
    }
    const outcome = await runtime.replaceImage(blockId, path, result.asset);
    if (!outcome.ok) {
      toast.error(outcome.message ?? 'Could not replace the image.', { id: toastId });
      return;
    }
    toast.success('Image replaced', { id: toastId });
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : 'Could not copy the image.',
      { id: toastId },
    );
  }
}

async function imageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    // Fall through to the HTMLImageElement path (for example SVG sources that
    // createImageBitmap refuses); dimensions are optional metadata either way.
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : null,
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

/** Paste/drop path: bytes come from the renderer and are copied by the main process. */
export async function insertImagesFromFiles(
  runtime: DocumentRuntime,
  blockId: string | null,
  files: readonly File[],
): Promise<void> {
  const target = targetBlock(runtime, blockId);
  if (target === null) {
    toast.error('Select a block before inserting an image.');
    return;
  }
  if (!runtime.editable) {
    toast.error('This document is open read-only.');
    return;
  }
  const images = files.filter((file) => mimeForImageFile(file) !== undefined);
  if (images.length === 0) return;
  const toastId = beginCopy(images.length);
  const prepared = await runtime.ensureMaterialized();
  if (!prepared.ok) {
    toast.error(prepared.message, { id: toastId });
    return;
  }
  for (const file of images) {
    const mime = mimeForImageFile(file);
    if (mime === undefined) {
      toast.error('That file type is not a supported image.', { id: toastId });
      return;
    }
    try {
      const dimensions = await imageDimensions(file);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await window.noteforest.importImageBytes(runtime.packagePath, {
        bytes,
        mime,
        originalName: file.name,
        ...(dimensions === null ? {} : dimensions),
      });
      if (!result.ok) {
        toast.error(result.message, { id: toastId });
        return;
      }
      const outcome = await runtime.insertImage(target, result.asset);
      if (!outcome.ok) {
        toast.error(outcome.message ?? 'Could not insert the image.', { id: toastId });
        return;
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not copy the image.',
        { id: toastId },
      );
      return;
    }
  }
  toast.success(images.length === 1 ? 'Image inserted' : `${images.length} images inserted`, {
    id: toastId,
  });
}
