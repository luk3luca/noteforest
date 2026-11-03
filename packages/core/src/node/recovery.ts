/**
 * Recovery inspection (Node-only).
 *
 * Crash recovery order per spec §10.4: newest temporary file, newest valid
 * backup, then the canonical file. This module never overwrites anything:
 * inspection is read-only, and restoring always writes a new copy unless the
 * caller explicitly asks to overwrite an existing package.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BackupKind } from './backups.js';
import { BackupManager } from './backups.js';
import type { AtomicWriteHooks } from './atomic.js';
import { writeFileAtomic } from './atomic.js';
import {
  backupsDirForPackage,
  defaultAppSupportDir,
  documentJsonPath,
  assetsDirPath,
} from './paths.js';
import type { CoreError } from '../errors.js';
import { coreError, errorMessage } from '../errors.js';
import { parseDocumentJson } from '../serialize.js';
import type { Document } from '../types.js';

export type RecoveryCandidateKind = 'temp' | 'canonical' | BackupKind;

export interface RecoveryCandidate {
  kind: RecoveryCandidateKind;
  path: string;
  valid: boolean;
  createdAt: string;
  bytes: number;
  revision?: number;
  blockCount?: number;
  title?: string;
  updatedAt?: string;
  error?: CoreError;
}

export interface RecoveryOptions {
  appSupportDir?: string;
  backupsDir?: string;
  /** Include the canonical document.json in the list (default true). */
  includeCanonical?: boolean;
  /** Maximum backup candidates to inspect (default 50). */
  maxBackups?: number;
}

function tempFilePattern(filename: string): boolean {
  return /^\.?document\.json\..*\.tmp$/.test(filename);
}

async function candidateFromText(
  kind: RecoveryCandidateKind,
  filePath: string,
  text: string,
  createdAt: string,
): Promise<RecoveryCandidate> {
  const parsed = parseDocumentJson(text);
  const base: RecoveryCandidate = {
    kind,
    path: filePath,
    valid: parsed.ok,
    createdAt,
    bytes: Buffer.byteLength(text, 'utf8'),
  };
  if (parsed.ok) {
    base.revision = parsed.document.revision;
    base.blockCount = Object.keys(parsed.document.blocks).length;
    base.title = parsed.document.title;
    base.updatedAt = parsed.document.updatedAt;
  } else {
    base.error = parsed.error;
  }
  return base;
}

export async function inspectRecoveryCandidates(
  packagePath: string,
  options: RecoveryOptions = {},
): Promise<RecoveryCandidate[]> {
  const resolved = path.resolve(packagePath);
  const appSupportDir = options.appSupportDir ?? defaultAppSupportDir();
  const backupsDir =
    options.backupsDir ?? backupsDirForPackage(appSupportDir, resolved);
  const candidates: RecoveryCandidate[] = [];

  // 1. Temporary files left by a crash during save.
  try {
    const entries = await fs.readdir(resolved);
    const temps: Array<{ filename: string; mtimeMs: number }> = [];
    for (const filename of entries) {
      if (!tempFilePattern(filename)) continue;
      try {
        const stat = await fs.stat(path.join(resolved, filename));
        if (stat.isFile()) temps.push({ filename, mtimeMs: stat.mtimeMs });
      } catch {
        // Skip files that vanished during inspection.
      }
    }
    temps.sort((left, right) => right.mtimeMs - left.mtimeMs);
    for (const temp of temps) {
      const filePath = path.join(resolved, temp.filename);
      let stat;
      let text: string;
      try {
        stat = await fs.stat(filePath);
        if (!stat.isFile()) continue;
        text = await fs.readFile(filePath, 'utf8');
      } catch {
        continue;
      }
      candidates.push(
        await candidateFromText('temp', filePath, text, stat.mtime.toISOString()),
      );
    }
  } catch {
    // Package directory missing; backup inspection may still help.
  }

  // 2. Backups, newest first.
  const manager = new BackupManager(backupsDir);
  const backups = await manager.list();
  const maxBackups = Math.max(0, options.maxBackups ?? 50);
  for (const backup of backups.slice(0, maxBackups)) {
    let text: string;
    try {
      text = await fs.readFile(backup.path, 'utf8');
    } catch (error) {
      candidates.push({
        kind: backup.kind,
        path: backup.path,
        valid: false,
        createdAt: backup.createdAt,
        bytes: backup.bytes,
        error: coreError('io-error', `could not read backup: ${errorMessage(error)}`),
      });
      continue;
    }
    candidates.push(
      await candidateFromText(backup.kind, backup.path, text, backup.createdAt),
    );
  }

  // 3. Canonical file last.
  if (options.includeCanonical !== false) {
    const documentPath = documentJsonPath(resolved);
    try {
      const stat = await fs.stat(documentPath);
      const text = await fs.readFile(documentPath, 'utf8');
      candidates.push(
        await candidateFromText('canonical', documentPath, text, stat.mtime.toISOString()),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        candidates.push({
          kind: 'canonical',
          path: documentPath,
          valid: false,
          createdAt: new Date().toISOString(),
          bytes: 0,
          error: coreError('io-error', `could not read canonical document: ${errorMessage(error)}`),
        });
      }
    }
  }

  return candidates;
}

export interface RecoveryFound {
  status: 'found';
  candidate: RecoveryCandidate;
  document: Document;
}

export interface RecoveryNotFound {
  status: 'none';
  candidates: RecoveryCandidate[];
}

export type RecoveryResult = RecoveryFound | RecoveryNotFound;

/**
 * Find the newest valid recovery source. Temp files and backups only; a valid
 * canonical file is not a "recovery" (it is already the document).
 */
export async function findNewestValidRecovery(
  packagePath: string,
  options: RecoveryOptions = {},
): Promise<RecoveryResult> {
  const candidates = await inspectRecoveryCandidates(packagePath, {
    ...options,
    includeCanonical: false,
  });
  for (const candidate of candidates) {
    if (!candidate.valid) continue;
    try {
      const text = await fs.readFile(candidate.path, 'utf8');
      const parsed = parseDocumentJson(text);
      if (!parsed.ok) continue;
      return { status: 'found', candidate, document: parsed.document };
    } catch {
      continue;
    }
  }
  return { status: 'none', candidates };
}

export interface RestoreOptions {
  /** Allow replacing an existing `document.json` in the target package. */
  overwrite?: boolean;
  /** Atomic-write hooks (fault injection in tests). */
  hooks?: AtomicWriteHooks;
}

export interface RestoreSuccess {
  ok: true;
  document: Document;
  targetPackagePath: string;
  sourcePath: string;
}

export interface RestoreFailure {
  ok: false;
  error: CoreError;
}

/**
 * Restore a candidate into a package directory, writing a new copy.
 * Refuses to overwrite an existing document.json unless `overwrite: true`.
 */
export async function restoreCandidateToPackage(
  sourcePath: string,
  targetPackagePath: string,
  options: RestoreOptions = {},
): Promise<RestoreSuccess | RestoreFailure> {
  let text: string;
  try {
    text = await fs.readFile(sourcePath, 'utf8');
  } catch (error) {
    return { ok: false, error: coreError('io-error', `could not read recovery candidate: ${errorMessage(error)}`) };
  }
  const parsed = parseDocumentJson(text);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const target = path.resolve(targetPackagePath);
  const targetDocument = documentJsonPath(target);
  try {
    await fs.mkdir(assetsDirPath(target), { recursive: true });
  } catch (error) {
    return { ok: false, error: coreError('io-error', `could not create recovery package: ${errorMessage(error)}`) };
  }
  if (options.overwrite !== true) {
    try {
      await fs.access(targetDocument);
      return {
        ok: false,
        error: coreError('recovery-failed', 'target package already has document.json; explicit overwrite required', {
          path: targetDocument,
        }),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return {
          ok: false,
          error: coreError('io-error', `could not inspect target package: ${errorMessage(error)}`, {
            path: targetDocument,
          }),
        };
      }
      // Free target.
    }
  }
  try {
    await writeFileAtomic(targetDocument, text, {
      ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
    });
    return {
      ok: true,
      document: parsed.document,
      targetPackagePath: target,
      sourcePath: path.resolve(sourcePath),
    };
  } catch (error) {
    return { ok: false, error: coreError('io-error', `could not write recovered document: ${errorMessage(error)}`) };
  }
}
