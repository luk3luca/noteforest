import { useState } from 'react';
import { toast } from 'sonner';
import type { DocumentRuntime } from '../state/runtime';
import { useShell } from '../state/shell';

/**
 * Explicit stale-lock consent.
 *
 * Opening a package whose lock looks stale never removes it: the document is
 * read-only and this banner is the only place that offers the destructive
 * "Take over lock" action. Cancel keeps the document read-only and leaves the
 * lock file untouched. Lock metadata is shown so the user can judge whether
 * another session may still be writing the file.
 */
export function StaleLockBanner({ runtime }: { runtime: DocumentRuntime }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceled, setCanceled] = useState(false);
  const lock = runtime.lock;

  const takeOver = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await runtime.takeOverLock();
      if (!result.ok) {
        setError(result.message ?? 'Could not take over the lock.');
        return;
      }
      useShell.getState().openTab({
        packagePath: runtime.packagePath,
        title: runtime.title,
      });
      toast.success('Lock taken over. This document is now editable.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const host = lock?.host ?? 'unknown';
  const heartbeat = lock?.heartbeatAt ?? null;
  const heartbeatLabel =
    heartbeat === null ? 'unknown' : new Date(heartbeat).toLocaleString();

  return (
    <section
      className="nf-stale-lock"
      data-stale-lock-banner="true"
      role="region"
      aria-label="Stale document lock"
    >
      <div className="nf-stale-lock-copy">
        <strong className="nf-stale-lock-title">Read-only · stale lock</strong>
        <p className="nf-stale-lock-text">
          Another NoteForest session left a lock on this document, but its heartbeat is
          stale. Your file has not been modified. Take over only if you are sure no other
          session is still writing it.
        </p>
        <dl className="nf-stale-lock-meta" data-lock-metadata="true">
          {lock?.corrupt === true ? (
            <div className="nf-stale-lock-meta-wide">
              <dt>Lock file</dt>
              <dd data-lock-corrupt="true">
                The lock file is corrupt and its owner cannot be read.
              </dd>
            </div>
          ) : (
            <>
              <div>
                <dt>PID</dt>
                <dd data-lock-pid="true">{lock?.pid ?? 'unknown'}</dd>
              </div>
              <div>
                <dt>Host</dt>
                <dd data-lock-host="true">{host}</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd data-lock-session="true">{lock?.sessionId ?? 'unknown'}</dd>
              </div>
              <div>
                <dt>Heartbeat</dt>
                <dd data-lock-heartbeat="true">{heartbeatLabel}</dd>
              </div>
            </>
          )}
        </dl>
        {canceled ? (
          <p className="nf-stale-lock-note" data-stale-lock-canceled="true">
            Stayed read-only. The stale lock was not changed.
          </p>
        ) : null}
        {error !== null ? (
          <p className="nf-stale-lock-error" role="alert" data-stale-lock-error="true">
            {error}
          </p>
        ) : null}
      </div>
      <div className="nf-stale-lock-actions">
        {canceled ? (
          <button
            type="button"
            className="nf-button"
            data-stale-lock-action="review"
            disabled={busy}
            onClick={() => {
              setCanceled(false);
              setError(null);
            }}
          >
            Review lock
          </button>
        ) : (
          <>
            <button
              type="button"
              className="nf-button nf-button-primary"
              data-stale-lock-action="take-over"
              disabled={busy}
              onClick={() => void takeOver()}
            >
              {busy ? 'Taking over…' : 'Take over lock'}
            </button>
            <button
              type="button"
              className="nf-button"
              data-stale-lock-action="cancel"
              disabled={busy}
              onClick={() => {
                setCanceled(true);
                setError(null);
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </section>
  );
}
