/**
 * The active Page Read model, exposed for the print surface bridge.
 *
 * Page Read owns the only completed `layoutDocument` + `paginate` run for the
 * mounted document. The print compositor must not measure or paginate again, so
 * the M4c1 test bridge (and the future M4c2 export handoff when it reuses a
 * mounted surface) reads this snapshot instead of reaching into React state.
 *
 * The compositor itself only accepts a `PrintModel`; this registry is input
 * gathering, not a compositor dependency.
 */

import type {
  ContinuousLayout,
  DerivedPage,
  LayoutDefect,
  NoteDocument,
  PageSettings,
} from '@noteforest/layout';

export interface PrintPageModelSnapshot {
  packagePath: string;
  document: NoteDocument;
  layout: ContinuousLayout;
  pages: DerivedPage[];
  defects: LayoutDefect[];
  manualBreakWarnings: LayoutDefect[];
  settings: PageSettings;
  settingsFingerprint: string;
  assetUrls: Readonly<Record<string, string>>;
  failedAssetIds: ReadonlySet<string>;
}

const snapshots = new Map<string, PrintPageModelSnapshot>();

export function registerPrintPageModel(snapshot: PrintPageModelSnapshot): void {
  snapshots.set(snapshot.packagePath, snapshot);
}

export function unregisterPrintPageModel(packagePath: string): void {
  snapshots.delete(packagePath);
}

export function printPageModelSnapshot(packagePath: string): PrintPageModelSnapshot | null {
  return snapshots.get(packagePath) ?? null;
}
