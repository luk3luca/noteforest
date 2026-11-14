/**
 * Write identity for Page settings edits (UI Sentinel F2).
 *
 * A debounced or immediate Page settings write is started on one layer of one
 * document. `scopeRef`/`packagePathRef` describe the *current* Settings view,
 * which may change while a commit is awaiting or a debounce is pending. This
 * module captures the identity once and answers whether that identity is still
 * writable, so a tab or document change can never retarget the write.
 */

import { isDraftKey } from '../../../shared/drafts';

export type PageSettingsWriteScope = 'global' | 'document';

export interface PageSettingsWriteTarget {
  scope: PageSettingsWriteScope;
  /** Document the edit was made on; null when no document was open. */
  packagePath: string | null;
  /** Canonical document id captured with the path. */
  documentId: string | null;
}

/** Visible state when the target document closed before the write ran. */
export const PAGE_SETTINGS_TARGET_CLOSED_MESSAGE =
  'The document closed before this change was saved. Nothing was written.';

/** Snapshot the layer/document identity at the moment an edit starts. */
export function capturePageSettingsTarget(
  scope: PageSettingsWriteScope,
  packagePath: string | null,
  documentId: string | null,
): PageSettingsWriteTarget {
  return { scope, packagePath, documentId };
}

/**
 * A global target is always writable. A document-scoped target is gone when no
 * document was captured or the captured document is no longer open; writing
 * then would either fail half-way or land on whatever document is active now.
 */
export function pageSettingsTargetIsGone(
  target: PageSettingsWriteTarget,
  isOpen: (packagePath: string) => boolean,
): boolean {
  if (target.scope !== 'document') return false;
  if (target.packagePath === null) return true;
  return !isOpen(target.packagePath);
}

/** The identity-relevant view of one open document runtime. */
export interface PageSettingsRuntimeIdentity {
  packagePath: string;
  isDraft: boolean;
}

/** Open-runtime lookups used to resolve a captured draft target (R2). */
export interface PageSettingsRuntimeLookup {
  /** Runtime for one document key (a package path or a `draft:<id>` key). */
  forPath: (packagePath: string) => PageSettingsRuntimeIdentity | null;
  /** Runtime for one canonical document id; null when absent or ambiguous. */
  forDocumentId: (documentId: string) => PageSettingsRuntimeIdentity | null;
}

/**
 * Resolve a captured draft target to the open materialized runtime of the same
 * document (R2).
 *
 * A pending debounced write can run during the pre-execute flush and
 * materialize the draft, so the captured `draft:<id>` key no longer maps to a
 * runtime. The document id does not change on materialization, so the same
 * document is found by id before the target-gone check. Only a **draft** key is
 * retargeted: a captured package path that closed must still be reported, never
 * rebound to another open document (the F2 cross-document defect).
 *
 * Returns null when the target needs no retarget or the same-id runtime is
 * absent, still a draft, or ambiguous.
 */
export function resolveMaterializedPageSettingsTarget(
  target: PageSettingsWriteTarget,
  lookup: PageSettingsRuntimeLookup,
): PageSettingsWriteTarget | null {
  if (target.scope !== 'document') return null;
  const path = target.packagePath;
  if (path === null || target.documentId === null) return null;
  if (!isDraftKey(path)) return null;
  if (lookup.forPath(path) !== null) return null;
  const runtime = lookup.forDocumentId(target.documentId);
  if (runtime === null || runtime.isDraft) return null;
  if (runtime.packagePath === path) return null;
  return { ...target, packagePath: runtime.packagePath };
}

/** One immediate Page settings action (size, orientation, preset, reset, …). */
export interface ImmediatePageSettingsWrite<T> {
  captureTarget: () => T;
  /** Flushes debounced edits; it can await a Page Edit commit and settings IPC. */
  flushPending: () => Promise<boolean>;
  execute: (target: T) => Promise<boolean>;
}

/**
 * Run one immediate Page settings write bound to the identity captured when it
 * starts.
 *
 * The capture must happen **before** `flushPending`: the flush can await a Page
 * Edit commit and the settings IPC, and a tab/layer change in that window must
 * not retarget the immediate write to another document. Capturing after the
 * flush is exactly the cross-document F2 defect this helper prevents.
 */
export async function runImmediatePageSettingsWrite<T>(
  write: ImmediatePageSettingsWrite<T>,
): Promise<boolean> {
  const target = write.captureTarget();
  const flushed = await write.flushPending();
  if (!flushed) return false;
  return write.execute(target);
}
