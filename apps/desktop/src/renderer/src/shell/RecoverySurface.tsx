import { useEffect, useState } from 'react';
import { FolderOpen, RefreshCw, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import type { BackupCandidateView } from '../../../shared/api';
import { closeTab, openPath } from '../actions';
import { backupMetadataLine } from '../lib/backup-restore';
import { tabElementId, tabPanelElementId } from '../lib/tab-ids';
import {
  recoveryDescription,
  recoveryHeadline,
  recoveryStatusLabel,
} from '../lib/recovery';
import { registerRuntime } from '../state/registry';
import { useShell, type RecoveryTabInfo } from '../state/shell';

type BackupListState =
  | { status: 'loading' }
  | { status: 'ready'; backups: BackupCandidateView[] }
  | { status: 'error'; message: string };

type RecoveryAction = 'restore' | 'retry' | 'reveal' | null;

/**
 * Read-only package recovery tab.
 *
 * It is reachable for corrupt, missing, and newer-schema packages. It never
 * constructs a document runtime, never writes the original package, and reuses
 * the main-process backup listing/restore path (the restore always creates a
 * new copy).
 */
export function RecoverySurface({
  packagePath,
  title,
  recovery,
}: {
  packagePath: string;
  title: string;
  recovery: RecoveryTabInfo;
}): JSX.Element {
  const [list, setList] = useState<BackupListState>({ status: 'loading' });
  const [reloadSeq, setReloadSeq] = useState(0);
  const [busy, setBusy] = useState<RecoveryAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setList({ status: 'loading' });
    void window.noteforest
      .listBackups(packagePath)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setList({ status: 'error', message: result.message });
          return;
        }
        setList({ status: 'ready', backups: result.backups });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setList({
          status: 'error',
          message: cause instanceof Error ? cause.message : String(cause),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [packagePath, reloadSeq]);

  const usable = list.status === 'ready' ? list.backups.filter((backup) => backup.valid) : [];
  const disabled = busy !== null;

  const restoreNewest = async (): Promise<void> => {
    setBusy('restore');
    setError(null);
    setNote(null);
    try {
      const result = await window.noteforest.restoreNewestBackup(packagePath);
      if (!result.ok) {
        if (result.canceled !== true) {
          setError(result.message ?? 'Could not restore a backup.');
        }
        return;
      }
      const shell = useShell.getState();
      shell.setLibrary(result.library);
      if (result.snapshot !== undefined) {
        registerRuntime(result.snapshot, undefined, undefined);
        shell.openTab({
          packagePath: result.snapshot.packagePath,
          title: result.snapshot.document.title,
        });
        toast.success('Restored the newest backup as a new copy and opened it.');
      } else {
        toast.success(`Restored the newest backup to ${result.packagePath}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const retry = async (): Promise<void> => {
    setBusy('retry');
    setError(null);
    setNote(null);
    try {
      await openPath(packagePath);
      const tab = useShell
        .getState()
        .tabs.find((candidate) => candidate.packagePath === packagePath);
      if (tab?.recovery !== undefined) {
        setError(`Still unavailable: ${tab.recovery.reason}`);
      } else if (tab?.missing === true) {
        setError('Still unavailable: the document folder is missing.');
      } else {
        setNote('The document opened.');
      }
      setReloadSeq((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const reveal = async (): Promise<void> => {
    setBusy('reveal');
    setError(null);
    try {
      const result = await window.noteforest.revealDocument(packagePath);
      if (!result.ok) setError(result.message ?? 'Could not reveal the document.');
    } finally {
      setBusy(null);
    }
  };

  const removeTab = (): void => {
    void closeTab(packagePath);
  };

  return (
    <section
      className="nf-recovery"
      id={tabPanelElementId(packagePath)}
      role="tabpanel"
      aria-labelledby={tabElementId(packagePath)}
      data-recovery-surface="true"
      data-recovery-status={recovery.status}
    >
      <header className="nf-recovery-head">
        <div className="nf-recovery-heading">
          <span className="nf-recovery-eyebrow">Read-only recovery</span>
          <h1 className="nf-recovery-title">{recoveryHeadline(recovery.status)}</h1>
          <p className="nf-recovery-subtitle">{title}</p>
          <p className="nf-recovery-copy">{recoveryDescription(recovery.status)}</p>
        </div>
        <span className="nf-recovery-pill" data-recovery-readonly="true">
          Read-only · no overwrite
        </span>
      </header>

      <dl className="nf-recovery-meta">
        <div>
          <dt>Status</dt>
          <dd data-recovery-status-label="true">{recoveryStatusLabel(recovery.status)}</dd>
        </div>
        <div className="nf-recovery-meta-wide">
          <dt>Folder</dt>
          <dd>
            <code data-recovery-path="true">{packagePath}</code>
          </dd>
        </div>
        <div className="nf-recovery-meta-wide">
          <dt>Reason</dt>
          <dd data-recovery-reason="true">{recovery.reason}</dd>
        </div>
      </dl>

      {recovery.details.length > 0 ? (
        <details className="nf-recovery-details" data-recovery-details="true">
          <summary>Validation details ({recovery.details.length})</summary>
          <ul>
            {recovery.details.slice(0, 20).map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {recovery.warnings.length > 0 ? (
        <details className="nf-recovery-details">
          <summary>Warnings ({recovery.warnings.length})</summary>
          <ul>
            {recovery.warnings.slice(0, 20).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <section className="nf-recovery-backups" aria-label="Backups">
        <div className="nf-recovery-section-head">
          <h2>Backups</h2>
          <span>Newest first · restoring always creates a new copy</span>
        </div>

        {list.status === 'loading' ? <p className="nf-dialog-text">Reading backups…</p> : null}

        {list.status === 'error' ? (
          <p className="nf-dialog-text nf-dialog-error" role="alert" data-recovery-backups-error="true">
            {list.message}
          </p>
        ) : null}

        {list.status === 'ready' && list.backups.length === 0 ? (
          <div className="nf-backup-empty" data-recovery-empty="true">
            <p className="nf-backup-empty-title">No usable backups</p>
            <p className="nf-dialog-note">
              NoteForest has no backup for this document yet. The original folder is unchanged;
              restore it from another copy or a filesystem backup.
            </p>
          </div>
        ) : null}

        {list.status === 'ready' && list.backups.length > 0 ? (
          <div className="nf-recovery-backup-list">
            {usable.length === 0 ? (
              <div className="nf-backup-empty" data-recovery-empty="true">
                <p className="nf-backup-empty-title">No usable backups</p>
                <p className="nf-dialog-note">
                  Every backup listed below is invalid. The original folder is unchanged.
                </p>
              </div>
            ) : null}
            {list.backups.map((backup) => (
              <div
                key={backup.sourcePath}
                className={`nf-recovery-backup${backup.valid ? '' : ' nf-recovery-backup-invalid'}`}
                data-recovery-backup="true"
                data-backup-valid={backup.valid ? 'true' : 'false'}
                data-backup-kind={backup.kind}
                data-backup-created={backup.createdAt}
                data-backup-source={backup.sourcePath}
              >
                <span className="nf-backup-title">
                  {backup.title.length > 0 ? backup.title : 'Untitled'}
                </span>
                <span className="nf-backup-meta">{backupMetadataLine(backup)}</span>
                {backup.valid ? null : (
                  <span className="nf-backup-invalid">
                    Unusable: {backup.error ?? 'invalid backup'}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : null}

        <div className="nf-recovery-actions">
          <button
            type="button"
            className="nf-button nf-button-primary"
            data-recovery-action="restore-newest"
            disabled={disabled || usable.length === 0}
            title={
              usable.length === 0
                ? 'There is no valid backup to restore.'
                : 'Restore the newest valid backup as a new copy.'
            }
            onClick={() => void restoreNewest()}
          >
            <RotateCcw size={13} strokeWidth={1.5} aria-hidden="true" />
            {busy === 'restore' ? 'Restoring…' : 'Restore newest valid backup'}
          </button>
          {recovery.status === 'missing' ? (
            <>
              <button
                type="button"
                className="nf-button"
                data-recovery-action="retry"
                disabled={disabled}
                onClick={() => void retry()}
              >
                <RefreshCw size={13} strokeWidth={1.5} aria-hidden="true" />
                {busy === 'retry' ? 'Retrying…' : 'Retry'}
              </button>
              <button
                type="button"
                className="nf-button"
                data-recovery-action="remove"
                disabled={disabled}
                title="Close this tab. The folder on disk is not deleted."
                onClick={removeTab}
              >
                <X size={13} strokeWidth={1.5} aria-hidden="true" />
                Remove tab
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="nf-button"
            data-recovery-action="reveal"
            disabled={disabled}
            onClick={() => void reveal()}
          >
            <FolderOpen size={13} strokeWidth={1.5} aria-hidden="true" />
            {busy === 'reveal' ? 'Revealing…' : 'Reveal in Finder'}
          </button>
          <button
            type="button"
            className="nf-button"
            data-recovery-action="close"
            disabled={disabled}
            onClick={removeTab}
          >
            Close tab
          </button>
        </div>

        {note !== null ? (
          <p className="nf-dialog-text" role="status" data-recovery-note="true">
            {note}
          </p>
        ) : null}
        {error !== null ? (
          <p className="nf-dialog-text nf-dialog-error" role="alert" data-recovery-error="true">
            {error}
          </p>
        ) : null}
      </section>
    </section>
  );
}
