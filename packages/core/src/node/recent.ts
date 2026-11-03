/**
 * Recent-documents manifest (Node-only, app support, outside the package).
 *
 * Atomic writes; corrupt manifests are ignored (returned empty with a warning)
 * rather than blocking the app. Entries are deduplicated by resolved package
 * path and ordered newest-first.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.js';
import { defaultAppSupportDir, recentManifestPath } from './paths.js';

export const RECENT_MANIFEST_VERSION = 1;
export const DEFAULT_RECENT_LIMIT = 50;

export interface RecentDocumentEntry {
  documentId: string;
  title: string;
  path: string;
  lastOpenedAt: string;
}

export interface RecentDocumentsManifest {
  version: number;
  items: RecentDocumentEntry[];
}

export interface RecentReadResult {
  manifest: RecentDocumentsManifest;
  warnings: string[];
}

function emptyManifest(): RecentDocumentsManifest {
  return { version: RECENT_MANIFEST_VERSION, items: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseManifest(text: string): RecentDocumentsManifest {
  const value = JSON.parse(text) as unknown;
  if (!isRecord(value) || !Array.isArray(value['items'])) {
    throw new Error('recent manifest is not an object with an items array');
  }
  const items: RecentDocumentEntry[] = [];
  for (const raw of value['items']) {
    if (!isRecord(raw)) continue;
    const documentId = raw['documentId'];
    const title = raw['title'];
    const itemPath = raw['path'];
    const lastOpenedAt = raw['lastOpenedAt'];
    if (
      typeof documentId !== 'string' ||
      typeof title !== 'string' ||
      typeof itemPath !== 'string' ||
      typeof lastOpenedAt !== 'string'
    ) {
      continue;
    }
    items.push({ documentId, title, path: itemPath, lastOpenedAt });
  }
  return { version: RECENT_MANIFEST_VERSION, items };
}

export async function readRecentDocuments(
  appSupportDir: string = defaultAppSupportDir(),
): Promise<RecentReadResult> {
  const manifestPath = recentManifestPath(appSupportDir);
  let text: string;
  try {
    text = await fs.readFile(manifestPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { manifest: emptyManifest(), warnings: [] };
    return {
      manifest: emptyManifest(),
      warnings: [`could not read recent documents: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
  try {
    const manifest = parseManifest(text);
    return { manifest, warnings: [] };
  } catch (error) {
    return {
      manifest: emptyManifest(),
      warnings: [
        `recent documents manifest is corrupt and was ignored: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
}

async function writeManifest(
  appSupportDir: string,
  manifest: RecentDocumentsManifest,
): Promise<void> {
  const manifestPath = recentManifestPath(appSupportDir);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFileAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

export interface RecordRecentOptions {
  appSupportDir?: string;
  limit?: number;
  now?: () => string;
}

export async function recordRecentDocument(
  entry: {
    documentId: string;
    title: string;
    path: string;
  },
  options: RecordRecentOptions = {},
): Promise<RecentDocumentsManifest> {
  const appSupportDir = options.appSupportDir ?? defaultAppSupportDir();
  const limit = Math.max(1, options.limit ?? DEFAULT_RECENT_LIMIT);
  const now = options.now?.() ?? new Date().toISOString();
  const resolvedPath = path.resolve(entry.path);
  const { manifest } = await readRecentDocuments(appSupportDir);
  const items = manifest.items.filter((item) => path.resolve(item.path) !== resolvedPath);
  items.unshift({
    documentId: entry.documentId,
    title: entry.title,
    path: resolvedPath,
    lastOpenedAt: now,
  });
  const next: RecentDocumentsManifest = {
    version: RECENT_MANIFEST_VERSION,
    items: items.slice(0, limit),
  };
  await writeManifest(appSupportDir, next);
  return next;
}

export async function removeRecentDocument(
  packagePath: string,
  appSupportDir: string = defaultAppSupportDir(),
): Promise<RecentDocumentsManifest> {
  const resolvedPath = path.resolve(packagePath);
  const { manifest } = await readRecentDocuments(appSupportDir);
  const next: RecentDocumentsManifest = {
    version: RECENT_MANIFEST_VERSION,
    items: manifest.items.filter((item) => path.resolve(item.path) !== resolvedPath),
  };
  await writeManifest(appSupportDir, next);
  return next;
}
