/**
 * Current-document snapshot for PDF export (M4c2 R2).
 *
 * The snapshot is read from the open runtime, never from `document.json`:
 * unsaved edits, the canonical revision, the resolved personal page lens, and
 * the session asset availability are all in memory. The hidden print window
 * measures this snapshot itself, so an export does not depend on PageView being
 * mounted (Continuous is the default surface).
 */

import type { NoteDocument, PageSettings } from '@noteforest/layout';
import { isCodeFont, pageSettingsFingerprint } from '@noteforest/layout';
import type { ExportSnapshot } from '../../shared/export';
import type { DocumentRuntime } from './state/runtime';
import { useSettingsStore } from './state/settings';
import { toLayoutDocument } from './page/adapter';
import { assetUrlsForRuntime, failedAssetIdsForRuntime } from './page/asset-urls';

export interface ExportSnapshotRuntime {
  packagePath: string;
  document: DocumentRuntime['document'];
  assetAvailability: DocumentRuntime['assetAvailability'];
}

export function createExportSnapshot(
  runtime: ExportSnapshotRuntime,
  resolvedSettings?: PageSettings,
): ExportSnapshot {
  const settings =
    resolvedSettings ??
    useSettingsStore
      .getState()
      .resolvedPageSettings(runtime.packagePath, runtime.document.id);
  const document: NoteDocument = toLayoutDocument(runtime.document);
  const storedCodeFont = useSettingsStore.getState().app.appearance.codeFont;
  const codeFont = isCodeFont(storedCodeFont) ? storedCodeFont : 'jetbrains';
  return {
    packagePath: runtime.packagePath,
    documentId: document.id,
    revision: document.revision ?? null,
    title: document.title,
    document,
    settings,
    // The measured run and the hidden print window must agree on the code
    // font; the fingerprint covers it so a stale export fails loudly (R3).
    settingsFingerprint: pageSettingsFingerprint(settings, codeFont),
    codeFont,
    assetUrls: assetUrlsForRuntime(runtime),
    failedAssetIds: failedAssetIdsForRuntime(runtime),
  };
}
