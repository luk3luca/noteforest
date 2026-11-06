/** Package paths, slug creation, and app-support locations (Node-only). */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DOCUMENT_FILE_NAME = 'document.json';
export const ASSETS_DIR_NAME = 'assets';
export const APP_SUPPORT_DIR_NAME = 'NoteForest';

/** App-managed data root. Override with NOTEFOREST_APP_SUPPORT (tests, CLI). */
export function defaultAppSupportDir(): string {
  const override = process.env['NOTEFOREST_APP_SUPPORT'];
  if (override !== undefined && override.length > 0) return path.resolve(override);
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_SUPPORT_DIR_NAME);
  }
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming');
    return path.join(appData, APP_SUPPORT_DIR_NAME);
  }
  const xdg = process.env['XDG_CONFIG_HOME'] ?? path.join(home, '.config');
  return path.join(xdg, 'noteforest');
}

/** Human-readable folder slug from a document title. */
export function slugifyTitle(title: string): string {
  const normalized = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'untitled';
}

/**
 * Create a new package directory under the library. Uses mkdir (not
 * recursive-only) so two processes cannot pick the same folder.
 */
export async function createUniquePackageDir(
  libraryDir: string,
  title: string,
): Promise<string> {
  const base = slugifyTitle(title);
  await fs.mkdir(libraryDir, { recursive: true });
  for (let attempt = 1; attempt < 10_000; attempt += 1) {
    const name = attempt === 1 ? base : `${base}-${attempt}`;
    const candidate = path.join(libraryDir, name);
    try {
      await fs.mkdir(candidate);
      return candidate;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') continue;
      throw error;
    }
  }
  throw new Error(`Could not allocate a unique package directory for "${title}"`);
}

export function documentJsonPath(packagePath: string): string {
  return path.join(path.resolve(packagePath), DOCUMENT_FILE_NAME);
}

export function assetsDirPath(packagePath: string): string {
  return path.join(path.resolve(packagePath), ASSETS_DIR_NAME);
}

export function defaultBackupsRoot(appSupportDir: string): string {
  return path.join(appSupportDir, 'backups');
}

/**
 * Backup directory keyed by the package path. This stays resolvable when
 * `document.json` is corrupt (the document ID cannot be read in that case).
 */
export function backupsDirForPackage(appSupportDir: string, packagePath: string): string {
  return path.join(
    defaultBackupsRoot(appSupportDir),
    sha256Hex(path.resolve(packagePath)).slice(0, 32),
  );
}

export function locksDir(appSupportDir: string): string {
  return path.join(appSupportDir, 'locks');
}

export function recentManifestPath(appSupportDir: string): string {
  return path.join(appSupportDir, 'recent-documents.json');
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function pathExists(targetPath: string): Promise<boolean> {
  return fs
    .access(targetPath)
    .then(() => true)
    .catch(() => false);
}

/**
 * Best-effort title for a package that did not parse into a document. A
 * readable JSON object with a string title is used (newer-schema and some
 * invalid documents); otherwise the folder name is the honest fallback.
 */
export function packageTitle(packagePath: string, rawText: string | null): string {
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
