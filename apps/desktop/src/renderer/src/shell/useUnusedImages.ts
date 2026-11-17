/**
 * The `Unused images` input for the Health sidebar (DR1b).
 *
 * The plan is pure (`lib/unused-images.ts`); the one thing the renderer cannot
 * compute is which asset ids the note's retained backups still name. That scan
 * reads `<appSupport>/backups/<note>` in the main process, so this hook keeps
 * one answer per note and refresh token instead of running it per keystroke.
 *
 * Until the scan for the current note has answered, the plan is empty: a failed
 * or pending scan must never be treated as "no backups", because an asset that
 * a backup still names would then be offered for cleanup.
 */

import { useEffect, useMemo, useState } from 'react';
import type { DocumentRuntime } from '../state/runtime';
import {
  unusedImageViews,
  unusedImagesTotalBytes,
  type UnusedImageView,
} from '../lib/unused-images';

type RetainedScan =
  | { status: 'ready'; packagePath: string; assetIds: string[] }
  | { status: 'failed'; packagePath: string };

export interface UnusedImagesState {
  /** True only when the backup scan for this exact note has answered. */
  ready: boolean;
  items: UnusedImageView[];
  totalBytes: number;
}

const EMPTY: UnusedImagesState = { ready: false, items: [], totalBytes: 0 };

export function useUnusedImages(
  runtime: DocumentRuntime | null,
  checkToken = 0,
): UnusedImagesState {
  const packagePath = runtime === null || runtime.isDraft ? null : runtime.packagePath;
  const [scan, setScan] = useState<RetainedScan | null>(null);

  useEffect(() => {
    if (packagePath === null) {
      setScan(null);
      return undefined;
    }
    let cancelled = false;
    setScan(null);
    void window.noteforest
      .backupAssetIds(packagePath)
      .then((result) => {
        if (cancelled) return;
        setScan(
          result.ok
            ? { status: 'ready', packagePath, assetIds: result.assetIds }
            : { status: 'failed', packagePath },
        );
      })
      .catch(() => {
        if (!cancelled) setScan({ status: 'failed', packagePath });
      });
    return () => {
      cancelled = true;
    };
  }, [packagePath, checkToken]);

  return useMemo(() => {
    if (runtime === null || scan === null || scan.status !== 'ready') return EMPTY;
    if (scan.packagePath !== runtime.packagePath) return EMPTY;
    const items = unusedImageViews(runtime.document, scan.assetIds);
    return { ready: true, items, totalBytes: unusedImagesTotalBytes(items) };
  }, [runtime, runtime?.packagePath, runtime?.version, scan]);
}
