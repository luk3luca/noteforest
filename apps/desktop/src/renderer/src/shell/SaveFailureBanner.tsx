import { useState } from 'react';
import { toast } from 'sonner';
import type { DocumentRuntime } from '../state/runtime';
import { registerRuntime } from '../state/registry';
import { useShell } from '../state/shell';
import {
  canOverwriteExternal,
  saveFailureHeadline,
  saveFailureHint,
} from '../lib/save-failure';

type BusyAction = 'retry' | 'copy' | 'reveal' | null;

/**
 * Persistent, document-level save-failure surface.
 *
 * It is intentionally not a toast: it stays until the save succeeds, the user
 * reloads from disk, overwrites an external modification, or copies the
 * document elsewhere. Overwrite is rendered only for `external-modification`
 * and always opens an explicit, Cancel-default confirmation.
 */
export function SaveFailureBanner({ runtime }: { runtime: DocumentRuntime }): JSX.Element | null {
  const [busy, setBusy] = useState<BusyAction>(null);
  const failure = runtime.saveFailure;
  if (failure === null) return null;

  const retry = async (): Promise<void> => {
    setBusy('retry');
    try {
      await runtime.retrySave();
    } finally {
      setBusy(null);
    }
  };

  const saveCopy = async (): Promise<void> => {
    setBusy('copy');
    try {
      const result = await runtime.saveCopy();
      if (!result.ok) {
        if (result.canceled !== true) {
          toast.error(result.message ?? 'Could not save a copy.');
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
        toast.success('Saved a copy and opened it.');
      } else {
        toast.success(`Saved a copy to ${result.packagePath}`);
      }
    } finally {
      setBusy(null);
    }
  };

  const reload = (): void => {
    useShell.getState().openDialog({ kind: 'reload-from-disk', packagePath: runtime.packagePath });
  };

  const overwrite = (): void => {
    useShell.getState().openDialog({ kind: 'overwrite-external', packagePath: runtime.packagePath });
  };

  const restoreBackup = (): void => {
    useShell.getState().openDialog({ kind: 'restore-backup', packagePath: runtime.packagePath });
  };

  const reveal = async (): Promise<void> => {
    setBusy('reveal');
    try {
      const result = await window.noteforest.revealDocument(runtime.packagePath);
      if (!result.ok) toast.error(result.message ?? 'Could not reveal the document.');
    } finally {
      setBusy(null);
    }
  };

  const disabled = busy !== null;
  return (
    <section
      className="nf-save-failure"
      role="alert"
      aria-live="assertive"
      data-save-failure="true"
      data-save-failure-code={failure.code}
    >
      <div className="nf-save-failure-copy">
        <strong className="nf-save-failure-title">{saveFailureHeadline(failure.code)}</strong>
        <p className="nf-save-failure-hint">
          {saveFailureHint(failure.code)} Autosave is paused.
        </p>
        <p className="nf-save-failure-message">{failure.message}</p>
        <code className="nf-save-failure-path">{runtime.packagePath}</code>
      </div>
      <div className="nf-save-failure-actions">
        <button
          type="button"
          className="nf-button nf-button-primary"
          data-save-action="retry"
          disabled={disabled}
          onClick={() => void retry()}
        >
          {busy === 'retry' ? 'Retrying…' : 'Retry'}
        </button>
        <button
          type="button"
          className="nf-button"
          data-save-action="restore-backup"
          disabled={disabled}
          onClick={restoreBackup}
        >
          Restore backup…
        </button>
        {canOverwriteExternal(failure.code) ? (
          <button
            type="button"
            className="nf-button nf-button-danger"
            data-save-action="overwrite"
            disabled={disabled}
            onClick={overwrite}
          >
            Overwrite…
          </button>
        ) : null}
        <button
          type="button"
          className="nf-button"
          data-save-action="save-copy"
          disabled={disabled}
          onClick={() => void saveCopy()}
        >
          {busy === 'copy' ? 'Saving…' : 'Save a copy…'}
        </button>
        <button
          type="button"
          className="nf-button"
          data-save-action="reload"
          disabled={disabled}
          onClick={reload}
        >
          Reload from disk…
        </button>
        <button
          type="button"
          className="nf-button"
          data-save-action="reveal"
          disabled={disabled}
          onClick={() => void reveal()}
        >
          {busy === 'reveal' ? 'Revealing…' : 'Reveal in Finder'}
        </button>
      </div>
    </section>
  );
}
