/**
 * Recursive library (vault) scan.
 *
 * One library is a tree of folders, note packages (a folder with
 * `document.json`) and Markdown guest files. The scan is read-only: it never
 * takes a lock, never writes, and never follows a symlink.
 *
 * Node rules (design `docs/design/vault-library.md`):
 * - **Folder**: any directory without `document.json`; empty folders are kept.
 *   A folder is never reported as a missing note.
 * - **Note**: a directory with a readable `document.json`; a damaged package
 *   stays a note row with `unreadable`/`newer-schema`.
 * - **Missing note**: a folder that looks like a package (contains `assets/`
 *   or a `.noteforest` marker) but has no `document.json`. It is kept visible
 *   as a note row so the recovery/cleanup actions still work.
 * - **Markdown guest**: a `.md`/`.markdown`/… file; no document id, revision,
 *   blocks, or chapters.
 * - **Ignored**: hidden entries, `assets/` and `*.assets/` folders, `.md.bak`
 *   and other backup files/folders, images and every other file, symlinks.
 *
 * Ordering is deterministic: folders, then notes, then Markdown; inside one
 * kind a case-insensitive name, with the absolute path as the tie-break.
 */

import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import { documentJsonPath, packageTitle } from './paths.js';
import { parseDocumentJson } from '../serialize.js';
import { documentStats } from '../types.js';
import { isMarkdownFileName } from '../markdown.js';

/** Maximum folder nesting below the library root (depth 1 = root child). */
export const VAULT_DEFAULT_MAX_DEPTH = 8;

/** Hard cap on visited directory entries, for a pathological tree. */
export const VAULT_DEFAULT_MAX_ENTRIES = 4000;

export const VAULT_MARKER_NAME = '.noteforest';
export const VAULT_ASSETS_DIR = 'assets';

export type VaultNodeKind = 'folder' | 'note' | 'markdown';

export type VaultRowStatus = 'ok' | 'missing' | 'unreadable' | 'newer-schema';

/** Read-only summary of one note package or Markdown guest file. */
export interface VaultDocumentRow {
  /** Absolute path: the package folder, or the `.md` file itself. */
  path: string;
  /** Display title: document title, or the Markdown file basename. */
  title: string;
  kind: 'note' | 'markdown';
  status: VaultRowStatus;
  /** Human reason for a non-ok status; absent for ok rows. */
  reason?: string;
  documentId: string | null;
  revision: number | null;
  updatedAt: string;
  /** Always 0 for a Markdown row. */
  blockCount: number;
  /** Always 0 for a Markdown row. */
  chapterCount: number;
}

export interface VaultFolderNode {
  kind: 'folder';
  path: string;
  name: string;
  /** Root-relative path, slash separated; never empty for a node. */
  relativePath: string;
  children: VaultNode[];
  /** The OS refused to list the folder; it stays a folder. */
  warning?: string;
}

export interface VaultNoteNode {
  kind: 'note';
  path: string;
  name: string;
  relativePath: string;
  row: VaultDocumentRow;
}

export interface VaultMarkdownNode {
  kind: 'markdown';
  path: string;
  name: string;
  relativePath: string;
  row: VaultDocumentRow;
}

export type VaultNode = VaultFolderNode | VaultNoteNode | VaultMarkdownNode;

export interface VaultScanOptions {
  maxDepth?: number;
  maxEntries?: number;
}

export interface VaultScan {
  libraryPath: string;
  /** Root children, already in their final order. */
  nodes: VaultNode[];
  /** Every note and Markdown row, in tree order. */
  documents: VaultDocumentRow[];
  warnings: string[];
}

interface ScanState {
  root: string;
  maxDepth: number;
  maxEntries: number;
  visited: number;
  warnings: string[];
  depthWarned: boolean;
  entryWarned: boolean;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error);
}

/** `assets`, `x.assets`: an asset folder is never a node and never scanned. */
export function isVaultAssetDirName(name: string): boolean {
  return name === VAULT_ASSETS_DIR || name.toLowerCase().endsWith('.assets');
}

/**
 * Backup folders never appear. Note backups live in app-support, not in the
 * vault; the names below only guard against leftovers.
 */
export function isVaultBackupName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === 'backups' ||
    lower === 'backup' ||
    lower.endsWith('.bak') ||
    lower.endsWith('.backup') ||
    lower.endsWith('.backups')
  );
}

/** Markdown guest files only; `.md.bak` and other files are not nodes. */
export function isVaultMarkdownName(name: string): boolean {
  if (isVaultBackupName(name)) return false;
  return isMarkdownFileName(name);
}

function rank(kind: VaultNodeKind): number {
  return kind === 'folder' ? 0 : kind === 'note' ? 1 : 2;
}

/** Pure comparator so unit tests can pin the order without the filesystem. */
export function compareVaultNodes(left: VaultNode, right: VaultNode): number {
  const byKind = rank(left.kind) - rank(right.kind);
  if (byKind !== 0) return byKind;
  const leftName = left.name.toLowerCase();
  const rightName = right.name.toLowerCase();
  if (leftName !== rightName) return leftName < rightName ? -1 : 1;
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

async function lstatOrNull(target: string): Promise<Awaited<ReturnType<typeof fs.lstat>> | null> {
  try {
    return await fs.lstat(target);
  } catch {
    return null;
  }
}

async function hasDocumentJson(folder: string): Promise<boolean> {
  const stats = await lstatOrNull(documentJsonPath(folder));
  return stats !== null && stats.isFile() && !stats.isSymbolicLink();
}

/**
 * A folder that looks like a package but has no `document.json`: it is a
 * missing note, not an arbitrary folder.
 */
async function looksLikePackage(folder: string): Promise<boolean> {
  const assets = await lstatOrNull(path.join(folder, VAULT_ASSETS_DIR));
  if (assets !== null && assets.isDirectory() && !assets.isSymbolicLink()) return true;
  return (await lstatOrNull(path.join(folder, VAULT_MARKER_NAME))) !== null;
}

function folderMtimeIso(stats: { mtime: Date } | null): string {
  return (stats?.mtime ?? new Date(0)).toISOString();
}

async function noteRow(packagePath: string): Promise<VaultDocumentRow | null> {
  let text: string;
  try {
    text = await fs.readFile(documentJsonPath(packagePath), 'utf8');
  } catch (error) {
    return null;
  }
  const folderStats = await fs.stat(packagePath).catch(() => null);
  const updatedAt = folderMtimeIso(folderStats);
  const parsed = parseDocumentJson(text);
  if (!parsed.ok) {
    return {
      path: packagePath,
      title: packageTitle(packagePath, text),
      kind: 'note',
      status: parsed.error.code === 'newer-schema' ? 'newer-schema' : 'unreadable',
      reason: parsed.error.message,
      documentId: null,
      revision: null,
      updatedAt,
      blockCount: 0,
      chapterCount: 0,
    };
  }
  const stats = documentStats(parsed.document);
  return {
    path: packagePath,
    title: parsed.document.title,
    kind: 'note',
    status: 'ok',
    documentId: parsed.document.id,
    revision: parsed.document.revision,
    updatedAt: parsed.document.updatedAt,
    blockCount: stats.blocks,
    chapterCount: stats.chapters,
  };
}

async function missingNoteRow(packagePath: string): Promise<VaultDocumentRow> {
  const folderStats = await fs.stat(packagePath).catch(() => null);
  return {
    path: packagePath,
    title: packageTitle(packagePath, null),
    kind: 'note',
    status: 'missing',
    reason: 'document.json is missing from this folder',
    documentId: null,
    revision: null,
    updatedAt: folderMtimeIso(folderStats),
    blockCount: 0,
    chapterCount: 0,
  };
}

async function markdownRow(filePath: string, name: string): Promise<VaultDocumentRow> {
  let updatedAt = new Date(0).toISOString();
  let status: VaultRowStatus = 'ok';
  let reason: string | undefined;
  try {
    const stats = await fs.stat(filePath);
    updatedAt = stats.mtime.toISOString();
    if (!stats.isFile()) {
      status = 'unreadable';
      reason = 'this entry is not a file';
    }
  } catch (error) {
    status = 'unreadable';
    reason = `could not read this Markdown file: ${messageOf(error)}`;
  }
  return {
    path: filePath,
    title: name,
    kind: 'markdown',
    status,
    ...(reason === undefined ? {} : { reason }),
    documentId: null,
    revision: null,
    updatedAt,
    blockCount: 0,
    chapterCount: 0,
  };
}

function relativeOf(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

async function scanFolder(
  dir: string,
  depth: number,
  state: ScanState,
): Promise<VaultNode[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    state.warnings.push(`Could not read the folder ${dir}: ${messageOf(error)}`);
    return [];
  }

  const nodes: VaultNode[] = [];
  for (const entry of entries) {
    if (state.visited >= state.maxEntries) {
      if (!state.entryWarned) {
        state.entryWarned = true;
        state.warnings.push(
          `The library has more than ${state.maxEntries} entries; the scan stopped early.`,
        );
      }
      break;
    }
    state.visited += 1;
    // Hidden entries and symlinks are never nodes; a symlink is never followed.
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isVaultAssetDirName(entry.name) || isVaultBackupName(entry.name)) continue;
      const row = (await hasDocumentJson(full)) ? await noteRow(full) : null;
      if (row !== null) {
        nodes.push({
          kind: 'note',
          path: full,
          name: entry.name,
          relativePath: relativeOf(state.root, full),
          row,
        });
        continue;
      }
      if (await looksLikePackage(full)) {
        const missingRow = await missingNoteRow(full);
        nodes.push({
          kind: 'note',
          path: full,
          name: entry.name,
          relativePath: relativeOf(state.root, full),
          row: missingRow,
        });
        continue;
      }
      if (depth + 1 > state.maxDepth) {
        if (!state.depthWarned) {
          state.depthWarned = true;
          state.warnings.push(
            `Folders nested deeper than ${state.maxDepth} levels are not scanned.`,
          );
        }
        nodes.push({
          kind: 'folder',
          path: full,
          name: entry.name,
          relativePath: relativeOf(state.root, full),
          children: [],
          warning: `Folders nested deeper than ${state.maxDepth} levels are not scanned.`,
        });
        continue;
      }
      const warningBefore = state.warnings.length;
      const children = await scanFolder(full, depth + 1, state);
      const warning =
        state.warnings.length > warningBefore
          ? state.warnings.slice(warningBefore).join(' ')
          : undefined;
      nodes.push({
        kind: 'folder',
        path: full,
        name: entry.name,
        relativePath: relativeOf(state.root, full),
        children,
        ...(warning === undefined ? {} : { warning }),
      });
      continue;
    }

    if (!entry.isFile()) continue;
    if (isVaultBackupName(entry.name)) continue;
    if (!isVaultMarkdownName(entry.name)) continue;
    const row = await markdownRow(full, entry.name);
    nodes.push({
      kind: 'markdown',
      path: full,
      name: entry.name,
      relativePath: relativeOf(state.root, full),
      row,
    });
  }

  nodes.sort(compareVaultNodes);
  return nodes;
}

/**
 * Scan one library root.
 *
 * The root itself is not a node: `nodes` are its children. A missing or
 * unreadable root produces a warning and no nodes; the caller decides whether
 * that is the library "missing" state.
 */
export async function scanVaultTree(
  libraryDir: string,
  options: VaultScanOptions = {},
): Promise<VaultScan> {
  const root = path.resolve(libraryDir);
  const state: ScanState = {
    root,
    maxDepth: options.maxDepth ?? VAULT_DEFAULT_MAX_DEPTH,
    maxEntries: options.maxEntries ?? VAULT_DEFAULT_MAX_ENTRIES,
    visited: 0,
    warnings: [],
    depthWarned: false,
    entryWarned: false,
  };
  const rootStats = await lstatOrNull(root);
  if (rootStats === null || !rootStats.isDirectory()) {
    state.warnings.push(`Library not found: ${root}`);
    return { libraryPath: root, nodes: [], documents: [], warnings: state.warnings };
  }
  const nodes = await scanFolder(root, 0, state);
  // Flatten after ordering so `documents` is exactly the tree order.
  const documents: VaultDocumentRow[] = [];
  const collect = (items: VaultNode[]): void => {
    for (const item of items) {
      if (item.kind === 'folder') collect(item.children);
      else documents.push(item.row);
    }
  };
  collect(nodes);
  return {
    libraryPath: root,
    nodes,
    documents,
    warnings: state.warnings,
  };
}
