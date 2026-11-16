/**
 * Backup listing and safe restore helpers for the save-failure surface.
 *
 * The filesystem work stays in `@noteforest/core/node` (`inspectRecoveryCandidates`
 * and `restoreCandidateToPackage`). This module only filters/maps candidates,
 * allocates a unique default copy name, and enforces the destination rules so
 * the renderer can never read an arbitrary path or overwrite a package.
 */

import path from 'node:path';
import type { RecoveryCandidate, RecoveryCandidateKind } from '@noteforest/core/node';
import type { BackupCandidateView, BackupKind } from '../shared/api.js';

const BACKUP_KINDS: readonly BackupKind[] = [
  'autosave',
  'daily',
  'pre-migration',
  'manual',
];

export function isBackupKind(kind: RecoveryCandidateKind): kind is BackupKind {
  return (BACKUP_KINDS as readonly string[]).includes(kind);
}

function compareNewestFirst(
  left: BackupCandidateView,
  right: BackupCandidateView,
): number {
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? 1 : -1;
  if (left.revision !== right.revision) return right.revision - left.revision;
  return left.sourcePath < right.sourcePath ? 1 : -1;
}

/**
 * Map core recovery candidates to the renderer contract. Temporary files and
 * the canonical document are not backups and are dropped; invalid backups stay
 * in the list (disabled) so the UI can explain why they cannot be restored.
 */
export function backupCandidates(
  candidates: readonly RecoveryCandidate[],
): BackupCandidateView[] {
  const backups: BackupCandidateView[] = [];
  for (const candidate of candidates) {
    if (!isBackupKind(candidate.kind)) continue;
    backups.push({
      sourcePath: candidate.path,
      kind: candidate.kind,
      createdAt: candidate.createdAt,
      revision: candidate.revision ?? 0,
      blockCount: candidate.blockCount ?? 0,
      title: candidate.title ?? 'Untitled',
      bytes: candidate.bytes,
      valid: candidate.valid,
      ...(candidate.error === undefined ? {} : { error: candidate.error.message }),
    });
  }
  return backups.sort(compareNewestFirst);
}

/** The restorable subset, still newest first. */
export function usableBackups(
  backups: readonly BackupCandidateView[],
): BackupCandidateView[] {
  return backups.filter((backup) => backup.valid);
}

/** `YYYY-MM-DD HH-mm-ss`, UTC, filesystem-safe on macOS and Windows. */
export function restoreStamp(now: Date): string {
  const iso = now.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19).replace(/:/g, '-')}`;
}

/**
 * Allocate `<library>/<folder> restored <timestamp>` and add ` 2`, ` 3`, … when
 * the name is already taken. The caller supplies the existence check so this
 * stays pure for tests.
 */
export async function uniqueRestoreDestination(
  libraryDir: string,
  packagePath: string,
  now: Date,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const folder = path.basename(path.resolve(packagePath)) || 'document';
  const base = `${folder} restored ${restoreStamp(now)}`;
  for (let attempt = 1; attempt < 10_000; attempt += 1) {
    const suffix = attempt === 1 ? '' : ` ${attempt}`;
    const candidate = path.join(path.resolve(libraryDir), `${base}${suffix}`);
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Could not allocate a unique restore folder for "${folder}"`);
}

export function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
}

export type RestoreDestinationProblemCode =
  | 'outside-library'
  | 'invalid-destination'
  | 'same-package'
  | 'exists';

export interface RestoreDestinationProblem {
  code: RestoreDestinationProblemCode;
  message: string;
}

/**
 * Closed destination rules, evaluated before any write:
 * - inside the configured library,
 * - a folder below the library root, not the root itself,
 * - never the source package or a folder inside it,
 * - never a package that already has a `document.json`.
 */
export function restoreDestinationProblem(input: {
  destination: string;
  libraryDir: string;
  sourcePackagePath: string;
  documentExists: boolean;
}): RestoreDestinationProblem | null {
  const destination = path.resolve(input.destination);
  const source = path.resolve(input.sourcePackagePath);
  const library = path.resolve(input.libraryDir);
  if (!isPathInside(library, destination)) {
    return {
      code: 'outside-library',
      message: 'Choose a destination inside the NoteForest library.',
    };
  }
  if (destination === library) {
    return {
      code: 'invalid-destination',
      message: 'Choose a folder for the restored copy, not the library root.',
    };
  }
  if (destination === source || isPathInside(source, destination)) {
    return {
      code: 'same-package',
      message: 'Choose a new folder. A restore never replaces the current note.',
    };
  }
  if (path.dirname(destination) !== library) {
    return {
      code: 'invalid-destination',
      message: 'Choose a folder directly inside the NoteForest library.',
    };
  }
  if (input.documentExists) {
    return {
      code: 'exists',
      message: 'A note already exists there. Choose a new folder.',
    };
  }
  return null;
}
