/**
 * Pure helpers for the read-only package recovery surface.
 *
 * The filesystem contract stays in `@noteforest/core/node`; this module only
 * turns an unreadable package into renderer-safe metadata (title fallback,
 * status, and validation details). Keeping it pure makes the fallbacks
 * unit-testable without starting Electron.
 */

import type { CoreError } from '@noteforest/core';
import { packageTitle, type ReadOnlyReason } from '@noteforest/core/node';
import type { RecoveryStatus } from '../shared/api.js';

/**
 * Best-effort title for a package that did not parse into a document. The
 * package/title logic is shared with the repository listing so the library and
 * the recovery surface never disagree.
 */
export function recoveryTitle(packagePath: string, rawText: string | null): string {
  return packageTitle(packagePath, rawText);
}

/** Map the core open reason onto the library/recovery vocabulary. */
export function recoveryStatus(reason: ReadOnlyReason | undefined): RecoveryStatus {
  if (reason === 'newer-schema') return 'newer-schema';
  if (reason === 'missing') return 'missing';
  return 'unreadable';
}

/** Validation issues are the actionable part of an invalid-document reason. */
export function recoveryDetails(errors: readonly CoreError[]): string[] {
  const details = new Set<string>();
  for (const error of errors) {
    for (const issue of error.issues ?? []) {
      details.add(issue.path === undefined ? issue.message : `${issue.path}: ${issue.message}`);
    }
  }
  return [...details];
}
