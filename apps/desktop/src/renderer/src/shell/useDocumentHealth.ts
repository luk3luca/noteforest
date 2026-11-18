/**
 * One audit input for the shell's health surfaces (badge, status bar, list,
 * modal). The audit itself stays in `lib/document-health.ts`; this module only
 * keeps one result per runtime revision so four consumers cannot run four
 * audits per keystroke and cannot drift.
 */

import { useMemo } from 'react';
import type { AssetAvailabilityIndex } from '@noteforest/core';
import type { DocumentRuntime } from '../state/runtime';
import {
  auditDocumentHealth,
  type DocumentHealthReport,
} from '../lib/document-health';

interface AuditEntry {
  version: number;
  availability: AssetAvailabilityIndex | undefined;
  report: DocumentHealthReport;
}

const cache = new WeakMap<DocumentRuntime, AuditEntry>();

/**
 * The audit for one runtime at its current revision. `runtime.version` advances
 * on content, asset, collapse and view notifications; the collapsed set itself
 * is mutated in place, so the revision is its change key.
 */
export function documentHealthReport(runtime: DocumentRuntime): DocumentHealthReport {
  const cached = cache.get(runtime);
  if (
    cached !== undefined &&
    cached.version === runtime.version &&
    cached.availability === runtime.assetAvailability
  ) {
    return cached.report;
  }
  const report = auditDocumentHealth(runtime.document, {
    ...(runtime.assetAvailability === undefined
      ? {}
      : { assetAvailability: runtime.assetAvailability }),
    collapsedBlockIds: runtime.collapsed,
    anchorIndex: runtime.anchorIndex,
  });
  cache.set(runtime, {
    version: runtime.version,
    availability: runtime.assetAvailability,
    report,
  });
  return report;
}

export function useDocumentHealthReport(
  runtime: DocumentRuntime | null,
  checkToken = 0,
): DocumentHealthReport | null {
  return useMemo(
    () => (runtime === null ? null : documentHealthReport(runtime)),
    // The token only forces the memo to re-read; the revision cache still
    // guarantees identical inputs produce the identical report.
    [runtime, runtime?.version, runtime?.assetAvailability, checkToken],
  );
}
