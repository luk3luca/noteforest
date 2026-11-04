/**
 * "Save a copy" for a document package (Node-only).
 *
 * This is not a second save path for the open document: the source package is
 * never written. The in-memory canonical document is serialized into a new
 * package directory, atomically, together with a copy of its assets. It exists
 * so a failed save can still rescue the user's current content.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AtomicWriteHooks } from './atomic.js';
import { writeFileAtomic } from './atomic.js';
import { assetsDirPath, documentJsonPath } from './paths.js';
import type { CoreError } from '../errors.js';
import { coreError, errorMessage } from '../errors.js';
import { stringifyDocument } from '../serialize.js';
import type { Document } from '../types.js';
import { validateDocument } from '../validation.js';

export interface CopyDocumentPackageInput {
  /** Package the content and assets come from. Read only. */
  sourcePackagePath: string;
  /** New package directory. Must not already contain a document.json. */
  targetPackagePath: string;
  /** Canonical in-memory document to write. */
  document: Document;
  hooks?: AtomicWriteHooks;
}

export interface CopyDocumentPackageSuccess {
  ok: true;
  packagePath: string;
  documentPath: string;
  assetsCopied: boolean;
}

export interface CopyDocumentPackageFailure {
  ok: false;
  error: CoreError;
}

export type CopyDocumentPackageResult =
  | CopyDocumentPackageSuccess
  | CopyDocumentPackageFailure;

/**
 * Write `document` plus the source package's assets into `targetPackagePath`.
 *
 * - Refuses to overwrite an existing `document.json`.
 * - Refuses an invalid document, so the copy is always openable.
 * - Missing source assets are not an error (a document may have none).
 */
export async function writeDocumentPackageCopy(
  input: CopyDocumentPackageInput,
): Promise<CopyDocumentPackageResult> {
  const source = path.resolve(input.sourcePackagePath);
  const target = path.resolve(input.targetPackagePath);
  if (source === target) {
    return {
      ok: false,
      error: coreError('recovery-failed', 'A copy cannot overwrite the document it came from.', {
        path: target,
      }),
    };
  }

  const report = validateDocument(input.document);
  if (!report.ok) {
    return {
      ok: false,
      error: coreError('invalid-document', 'Refusing to write an invalid document copy.', {
        errorCount: report.errors.length,
      }),
    };
  }

  const targetDocument = documentJsonPath(target);
  try {
    await fs.access(targetDocument);
    return {
      ok: false,
      error: coreError(
        'recovery-failed',
        'A document already exists at the chosen location; choose another name.',
        { path: targetDocument },
      ),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return {
        ok: false,
        error: coreError('io-error', `could not inspect the copy location: ${errorMessage(error)}`, {
          path: target,
        }),
      };
    }
  }

  let assetsCopied = false;
  try {
    await fs.mkdir(assetsDirPath(target), { recursive: true });
    const sourceAssets = assetsDirPath(source);
    try {
      await fs.access(sourceAssets);
      await fs.cp(sourceAssets, assetsDirPath(target), {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
      assetsCopied = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    await writeFileAtomic(targetDocument, stringifyDocument(input.document), {
      ...(input.hooks === undefined ? {} : { hooks: input.hooks }),
    });
    return { ok: true, packagePath: target, documentPath: targetDocument, assetsCopied };
  } catch (error) {
    return {
      ok: false,
      error: coreError('io-error', `could not write the document copy: ${errorMessage(error)}`, {
        path: target,
      }),
    };
  }
}
