/**
 * Backup snapshots outside the document package (Node-only).
 *
 * Layout: `<appSupport>/backups/<documentId>/<kind>-<timestamp>-r<revision>.json`.
 * Backups contain `document.json` only; assets are content-addressed and shared.
 * Defaults follow spec §10.4: 20 autosave snapshots, 7 daily snapshots, and
 * pre-migration snapshots for at least 7 days. The autosave floor is 10.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.js';

export type BackupKind = 'autosave' | 'daily' | 'pre-migration' | 'manual';

export const BACKUP_KINDS: readonly BackupKind[] = [
  'autosave',
  'daily',
  'pre-migration',
  'manual',
];

export interface BackupRetention {
  autosaveMax: number;
  dailyMax: number;
  preMigrationMaxAgeMs: number;
}

export const MINIMUM_AUTOSAVE_BACKUPS = 10;
export const DEFAULT_BACKUP_RETENTION: BackupRetention = {
  autosaveMax: 20,
  dailyMax: 7,
  preMigrationMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
};

export interface BackupRecord {
  path: string;
  kind: BackupKind;
  createdAt: string;
  revision: number;
  bytes: number;
}

const FILENAME_PATTERN =
  /^(autosave|daily|pre-migration|manual)-(\d{8}T\d{9}Z)-r(\d{10})(?:-(\d+))?\.json$/;

function stampFor(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 19).replace(/[-:]/g, '')}${iso.slice(20, 23)}Z`;
}

function dateFromStamp(stamp: string): string | null {
  // YYYYMMDDTHHmmssSSSZ
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/.exec(stamp);
  if (match === null) return null;
  const [, year, month, day, hour, minute, second, millisecond] = match;
  const time = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond),
  );
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function parseFilename(filename: string): {
  kind: BackupKind;
  stamp: string;
  revision: number;
} | null {
  const match = FILENAME_PATTERN.exec(filename);
  if (match === null) return null;
  const [, kind, stamp, revision] = match;
  if (kind === undefined || stamp === undefined || revision === undefined) return null;
  return {
    kind: kind as BackupKind,
    stamp,
    revision: Number(revision),
  };
}

export class BackupManager {
  readonly rootDir: string;

  readonly retention: BackupRetention;

  constructor(rootDir: string, retention: Partial<BackupRetention> = {}) {
    this.rootDir = path.resolve(rootDir);
    this.retention = {
      autosaveMax: Math.max(
        MINIMUM_AUTOSAVE_BACKUPS,
        retention.autosaveMax ?? DEFAULT_BACKUP_RETENTION.autosaveMax,
      ),
      dailyMax: Math.max(1, retention.dailyMax ?? DEFAULT_BACKUP_RETENTION.dailyMax),
      preMigrationMaxAgeMs: Math.max(
        0,
        retention.preMigrationMaxAgeMs ?? DEFAULT_BACKUP_RETENTION.preMigrationMaxAgeMs,
      ),
    };
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  async create(
    raw: string | Uint8Array,
    meta: { kind: BackupKind; revision: number; now?: Date },
  ): Promise<BackupRecord> {
    await this.ensureDir();
    const now = meta.now ?? new Date();
    const stamp = stampFor(now);
    const revision = Math.max(0, Math.trunc(meta.revision));
    const base = `${meta.kind}-${stamp}-r${String(revision).padStart(10, '0')}`;
    for (let suffix = 0; suffix < 1000; suffix += 1) {
      const filename = suffix === 0 ? `${base}.json` : `${base}-${suffix}.json`;
      const target = path.join(this.rootDir, filename);
      try {
        await fs.access(target);
        continue;
      } catch {
        // Free name.
      }
      const bytes = typeof raw === 'string' ? Buffer.byteLength(raw, 'utf8') : raw.byteLength;
      await writeFileAtomic(target, raw);
      return {
        path: target,
        kind: meta.kind,
        createdAt: dateFromStamp(stamp) ?? now.toISOString(),
        revision,
        bytes,
      };
    }
    throw new Error(`Could not allocate a backup filename in ${this.rootDir}`);
  }

  async list(): Promise<BackupRecord[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.rootDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const records: BackupRecord[] = [];
    for (const filename of entries) {
      const parsed = parseFilename(filename);
      if (parsed === null) continue;
      const filePath = path.join(this.rootDir, filename);
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      records.push({
        path: filePath,
        kind: parsed.kind,
        createdAt: dateFromStamp(parsed.stamp) ?? stat.mtime.toISOString(),
        revision: parsed.revision,
        bytes: stat.size,
      });
    }
    records.sort((left, right) => {
      if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? 1 : -1;
      if (left.revision !== right.revision) return right.revision - left.revision;
      return left.path < right.path ? 1 : -1;
    });
    return records;
  }

  async newest(kind?: BackupKind): Promise<BackupRecord | null> {
    const records = await this.list();
    return records.find((record) => kind === undefined || record.kind === kind) ?? null;
  }

  async hasDailyBackup(now: Date = new Date()): Promise<boolean> {
    const day = stampFor(now).slice(0, 8);
    const records = await this.list();
    return records.some((record) => record.kind === 'daily' && stampFor(new Date(record.createdAt)).slice(0, 8) === day);
  }

  /** Rotate backups. Returns removed paths. Never removes manual backups. */
  async rotate(now: Date = new Date()): Promise<string[]> {
    const records = await this.list();
    const removed: string[] = [];

    const autosaves = records.filter((record) => record.kind === 'autosave');
    for (const record of autosaves.slice(this.retention.autosaveMax)) {
      removed.push(record.path);
    }

    const dailies = records.filter((record) => record.kind === 'daily');
    for (const record of dailies.slice(this.retention.dailyMax)) {
      removed.push(record.path);
    }

    const cutoff = now.getTime() - this.retention.preMigrationMaxAgeMs;
    for (const record of records) {
      if (record.kind !== 'pre-migration') continue;
      if (Date.parse(record.createdAt) < cutoff) removed.push(record.path);
    }

    for (const filePath of removed) {
      await fs.unlink(filePath).catch(() => undefined);
    }
    return removed;
  }
}
