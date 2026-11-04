/**
 * Pure helpers for the read-only package recovery surface.
 *
 * The filesystem contract stays in `@noteforest/core/node`; this module only
 * turns an unreadable package into renderer-safe metadata (title fallback,
 * status, and validation details). Keeping it pure makes the fallbacks
 * unit-testable without starting Electron.
 */

import path from 'node:path';
import type { CoreError } from '@noteforest/core';
import type { ReadOnlyReason } from '@noteforest/core/node';
import type { RecoveryStatus } from '../shared/api.js';

/**
 * Best-effort title for a package that did not parse into a document. A
 * readable JSON object with a string title is used (newer-schema and some
 * invalid documents); otherwise the folder name is the honest fallback.
 */
export function recoveryTitle(packagePath: string, rawText: string | null): string {
  if (rawText !== null) {
    try {
      const value = JSON.parse(rawText) as { title?: unknown };
      if (typeof value.title === 'string' && value.title.trim().length > 0) {
        return value.title.trim();
      }
    } catch {
      // Truncated or malformed JSON: the folder name is still useful.
    }
  }
  const folder = path.basename(path.resolve(packagePath));
  return folder.length > 0 ? folder : 'Untitled document';
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
