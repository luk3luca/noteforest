/**
 * Durable per-document personal settings (S2-2).
 *
 * Overrides live in `app-support/document-settings.json`, outside the shell
 * session, so closing a tab (or quitting) cannot lose them. Identity is the
 * canonical document id first, with the package path as a fallback for entries
 * created before the document id was known (a legacy session tab, an unreadable
 * package, or a recovery tab).
 *
 * Delete rule: there is no document-delete command in v1. If the user removes a
 * package outside the app, its entry is left as an orphan keyed by the deleted
 * document id. It is never applied to another document: a path fallback only
 * matches entries that have no document id. Orphans are harmless and bounded to
 * documents whose settings the user actually changed; a future library cleanup
 * may prune ids that no scanned document references.
 *
 * This module is pure (no filesystem) so main, renderer tests, and the session
 * migration share exactly one identity rule.
 */

import { normalizePageSettingsOverride, type PageSettingsOverride } from '@noteforest/layout';

export const DOCUMENT_SETTINGS_VERSION = 1;

export interface DocumentSettingsEntry {
  /** Canonical `document.id`; null only for a path-only legacy/unreadable entry. */
  documentId: string | null;
  packagePath: string;
  /** Personal page override; absent means the global settings apply. */
  page?: PageSettingsOverride;
}

export interface DocumentSettingsFile {
  version: number;
  entries: DocumentSettingsEntry[];
}

export interface DocumentIdentity {
  documentId?: string | null;
  packagePath: string;
}

export interface LegacySessionOverride {
  packagePath: string;
  pageSettingsOverride: unknown;
}

export interface DocumentSettingsFileRead {
  entries: DocumentSettingsEntry[];
  /** False when the file was missing/empty; true when entries were normalized. */
  found: boolean;
}

/** Strip a trailing separator so a move/rename comparison is stable. */
export function normalizePackagePath(value: string): string {
  if (value.length <= 1) return value;
  return value.replace(/[\\/]+$/, '');
}

function cleanId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Normalize one stored entry; null when it has no usable key. */
export function normalizeDocumentSettingsEntry(
  input: unknown,
): DocumentSettingsEntry | null {
  if (typeof input !== 'object' || input === null) return null;
  const record = input as Record<string, unknown>;
  const packagePath = record['packagePath'];
  if (typeof packagePath !== 'string' || packagePath.trim().length === 0) return null;
  const page = normalizePageSettingsOverride(record['page']);
  const documentId = cleanId(record['documentId']);
  if (page === undefined && documentId === null) return null;
  return {
    documentId,
    packagePath: normalizePackagePath(packagePath),
    ...(page === undefined ? {} : { page }),
  };
}

/**
 * Normalize a whole file. Duplicate identities keep the last entry (a later
 * write wins); entries are sorted by path for a deterministic file.
 */
export function normalizeDocumentSettingsFile(input: unknown): DocumentSettingsFileRead {
  const list = Array.isArray(input)
    ? input
    : typeof input === 'object' && input !== null && Array.isArray((input as Record<string, unknown>)['entries'])
      ? ((input as Record<string, unknown>)['entries'] as unknown[])
      : null;
  if (list === null) return { entries: [], found: false };
  let entries: DocumentSettingsEntry[] = [];
  let found = false;
  for (const candidate of list) {
    const entry = normalizeDocumentSettingsEntry(candidate);
    if (entry === null) continue;
    found = true;
    entries = upsertDocumentSettingsEntry(entries, entry, entry.page);
  }
  entries.sort((left, right) => left.packagePath.localeCompare(right.packagePath));
  return { entries, found };
}

export function serializeDocumentSettingsFile(
  entries: readonly DocumentSettingsEntry[],
): string {
  const file: DocumentSettingsFile = {
    version: DOCUMENT_SETTINGS_VERSION,
    entries: [...entries].sort((left, right) =>
      left.packagePath.localeCompare(right.packagePath),
    ),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Resolve an entry for one document: the canonical id wins, then a path-only
 * entry. An id-keyed entry never matches by path when the caller has a
 * different id, so a replaced package cannot inherit a deleted document's
 * settings.
 */
export function findDocumentSettingsEntry(
  entries: readonly DocumentSettingsEntry[],
  identity: DocumentIdentity,
): DocumentSettingsEntry | undefined {
  const id = cleanId(identity.documentId);
  if (id !== null) {
    const byId = entries.find((entry) => entry.documentId === id);
    if (byId !== undefined) return byId;
  }
  const packagePath = normalizePackagePath(identity.packagePath);
  return entries.find(
    (entry) =>
      normalizePackagePath(entry.packagePath) === packagePath &&
      (entry.documentId === null || entry.documentId === id),
  );
}

/**
 * Insert/replace/clear one entry. A `null`/empty page removes the entry.
 * Duplicate id or path entries are collapsed so the file cannot keep two
 * override sources for the same document.
 */
export function upsertDocumentSettingsEntry(
  entries: readonly DocumentSettingsEntry[],
  identity: DocumentIdentity,
  page: unknown,
): DocumentSettingsEntry[] {
  const id = cleanId(identity.documentId);
  const packagePath = normalizePackagePath(identity.packagePath);
  const normalized = normalizePageSettingsOverride(page);
  const matches = (entry: DocumentSettingsEntry): boolean =>
    (id !== null && entry.documentId === id) ||
    normalizePackagePath(entry.packagePath) === packagePath;
  const previous = entries.find(matches);
  const next = entries.filter((entry) => !matches(entry));
  if (normalized === undefined) return next;
  next.push({
    documentId: id ?? previous?.documentId ?? null,
    packagePath,
    page: normalized,
  });
  next.sort((left, right) => left.packagePath.localeCompare(right.packagePath));
  return next;
}

/**
 * Re-key an entry when the package was opened from a new path (rename/move).
 * Returns the same array reference when nothing changed.
 */
export function adoptDocumentSettingsEntry(
  entries: readonly DocumentSettingsEntry[],
  identity: DocumentIdentity,
): DocumentSettingsEntry[] {
  const entry = findDocumentSettingsEntry(entries, identity);
  if (entry === undefined) return entries as DocumentSettingsEntry[];
  const id = cleanId(identity.documentId);
  const packagePath = normalizePackagePath(identity.packagePath);
  const nextId = entry.documentId ?? id;
  if (entry.packagePath === packagePath && entry.documentId === nextId) {
    return entries as DocumentSettingsEntry[];
  }
  const next = entries.filter((candidate) => candidate !== entry);
  next.push({ ...entry, documentId: nextId, packagePath });
  next.sort((left, right) => left.packagePath.localeCompare(right.packagePath));
  return next;
}

/**
 * Move legacy session tab overrides into the durable document map.
 *
 * Existing durable entries win, so a migration never overwrites a newer
 * override. The id map comes from the documents opened during bootstrap; a
 * damaged/missing package keeps a path-only entry until it opens again.
 */
export function migrateSessionOverrides(
  entries: readonly DocumentSettingsEntry[],
  legacy: readonly LegacySessionOverride[],
  documentIdByPath: ReadonlyMap<string, string>,
): { entries: DocumentSettingsEntry[]; migrated: number } {
  let next = entries as DocumentSettingsEntry[];
  let migrated = 0;
  for (const tab of legacy) {
    const page = normalizePageSettingsOverride(tab.pageSettingsOverride);
    if (page === undefined) continue;
    const packagePath = normalizePackagePath(tab.packagePath);
    const identity: DocumentIdentity = {
      documentId: documentIdByPath.get(packagePath) ?? documentIdByPath.get(tab.packagePath) ?? null,
      packagePath,
    };
    if (findDocumentSettingsEntry(next, identity) !== undefined) continue;
    next = upsertDocumentSettingsEntry(next, identity, page);
    migrated += 1;
  }
  return { entries: next, migrated };
}
