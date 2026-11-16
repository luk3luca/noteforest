import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentRuntime } from '../state/runtime';
import { registerRuntime } from '../state/registry';
import { useShell } from '../state/shell';
import {
  canOverwriteExternal,
  saveFailureHeadline,
  saveFailureHint,
} from '../lib/save-failure';
import { Details } from './Details';
import { errorToast } from '../lib/toast-details';

type BusyAction = 'retry' | 'copy' | 'reveal' | null;

/**
 * Persistent, document-level save-failure surface (R4).
 *
 * Shell chrome next to DraftMaterializeBanner/DocumentStatusPanel, never inside
 * the editor canvas. The R3 neutral panel geometry: one border, `--surface-1`,
 * an icon and title, body copy, and actions on the right. There is no colored
 * left stripe and no danger title bar; the warning/danger color is limited to
 * the icon and title. The package path lives in Details, never as a primary
 * monospace line.
 *
 * A draft fails through DraftMaterializeBanner only. While `runtime.isDraft`
 * this surface is suppressed so a materialization failure never shows a second
 * banner or the raw `draft:<id>` key. It is not a toast: it stays until the
 * save succeeds, the user reloads from disk, overwrites an external
 * modification, or copies the document elsewhere.
 */
export function SaveFailureBanner({
  runtime,
}: {
  runtime: DocumentRuntime | null;
}): JSX.Element | null {
  const [busy, setBusy] = useState<BusyAction>(null);
  const failure = runtime?.saveFailure ?? null;
  if (runtime === null || failure === null || runtime.isDraft) return null;

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
          errorToast(result.message ?? 'Couldn’t save a copy.', result.details);
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
        toast.success('Saved a copy.');
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
      if (!result.ok) errorToast(result.message ?? 'Couldn’t reveal the note.', result.details);
    } finally {
      setBusy(null);
    }
  };

  const disabled = busy !== null;
  // External modification is recoverable and uses the warning tone; write,
  // permission, lock, and integrity failures use the danger tone. Either way
  // the color stays on the icon/title, never on a stripe.
  const tone = failure.code === 'external-modification' ? 'warning' : 'danger';
  // One Details per surface: the failure value and the package path join with
  // ` · ` (dialogs.md §3.4).
  const detailsValue = `${failure.message} · ${runtime.packagePath}`;
  return (
    <section
      className="nf-save-failure"
      role="alert"
      aria-live="assertive"
      data-save-failure="true"
      data-save-failure-code={failure.code}
      data-save-failure-tone={tone}
    >
      <TriangleAlert
        size={16}
        strokeWidth={1.5}
        className="nf-save-failure-icon"
        aria-hidden="true"
      />
      <div className="nf-save-failure-copy">
        <strong className="nf-save-failure-title">{saveFailureHeadline(failure.code)}</strong>
        <p className="nf-save-failure-hint">{saveFailureHint(failure.code)}</p>
        <p className="nf-save-failure-paused">Autosave is paused.</p>
        <Details value={detailsValue} />
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
      </div>
    </section>
  );
}
