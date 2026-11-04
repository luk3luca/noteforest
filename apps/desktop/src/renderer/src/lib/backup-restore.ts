/** Display helpers for the backup restore dialog (pure). */

import type { BackupCandidateView, BackupKind } from '../../../shared/api';

export function backupKindLabel(kind: BackupKind): string {
  switch (kind) {
    case 'autosave':
      return 'Autosave';
    case 'daily':
      return 'Daily';
    case 'pre-migration':
      return 'Pre-migration';
    case 'manual':
      return 'Manual';
    default:
      return 'Backup';
  }
}

/** Local, readable timestamp; malformed values fall back to the raw string. */
export function formatBackupTimestamp(createdAt: string): string {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return createdAt;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function backupMetadataLine(backup: BackupCandidateView): string {
  const blocks = `${backup.blockCount} ${backup.blockCount === 1 ? 'block' : 'blocks'}`;
  return `${backupKindLabel(backup.kind)} · ${formatBackupTimestamp(backup.createdAt)} · revision ${backup.revision} · ${blocks}`;
}
