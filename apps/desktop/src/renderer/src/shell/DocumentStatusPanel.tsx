/**
 * Detached document status panel (R3, design §5).
 *
 * The stale-lock and generic read-only states are shell chrome, not document
 * content: the panel sits in the main column between the Toolbar and the canvas
 * panel, so the canvas reflows when it appears or disappears and it never
 * scrolls or zooms with the document. It is one component for both states, with
 * a neutral surface and no decorative left stripe; the warning color is limited
 * to the icon and the title.
 *
 * Cancel is not a dismissal: the panel collapses to a 34 px slim bar that keeps
 * the explanation, Take over lock, and Review. Cancel is per document for the
 * session. Generic read-only keeps a Recheck that only reopens the package; it
 * never force-breaks a live lock. Corrupt/missing documents keep the dedicated
 * `RecoverySurface`.
 */

import { useEffect, useRef, useState } from 'react';
import { Lock, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentRuntime } from '../state/runtime';
import { useDocumentStatusStore } from '../state/document-status';
import { useShell } from '../state/shell';

function lockHost(runtime: DocumentRuntime): string {
  return runtime.lock?.host ?? 'unknown';
}

function heartbeatLabel(runtime: DocumentRuntime): string {
  const heartbeat = runtime.lock?.heartbeatAt ?? null;
  return heartbeat === null ? 'unknown' : new Date(heartbeat).toLocaleString();
}

function reasonLabel(reason: string | undefined): string {
  switch (reason) {
    case 'locked':
      return 'open in another window';
    case 'newer-schema':
      return 'from a newer NoteForest';
    case 'corrupt':
      return 'the file couldn’t be read';
    case 'invalid':
      return 'the file is invalid';
    case 'missing':
      return 'the file is missing';
    default:
      return reason === undefined ? 'read-only' : reason.replace(/-/g, ' ');
  }
}

/** PID/host/session/heartbeat for a live or stale lock. Not a takeover action. */
function LockMetadata({ runtime }: { runtime: DocumentRuntime }): JSX.Element | null {
  if (runtime.lock === undefined) return null;
  const corruptLock = runtime.lock.corrupt === true;
  return (
    <dl className="nf-status-meta" data-lock-metadata="true">
      {corruptLock ? (
        <div className="nf-status-meta-wide">
          <dt>Lock file</dt>
          <dd data-lock-corrupt="true">
            The lock file is corrupt and its owner cannot be read.
          </dd>
        </div>
      ) : (
        <>
          <div>
            <dt>PID</dt>
            <dd data-lock-pid="true">{runtime.lock.pid ?? 'unknown'}</dd>
          </div>
          <div>
            <dt>Host</dt>
            <dd data-lock-host="true">{lockHost(runtime)}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd data-lock-session="true">{runtime.lock.sessionId ?? 'unknown'}</dd>
          </div>
          <div>
            <dt>Heartbeat</dt>
            <dd data-lock-heartbeat="true">{heartbeatLabel(runtime)}</dd>
          </div>
        </>
      )}
    </dl>
  );
}

function SlimBar({
  runtime,
  staleLock,
  busy,
  onReview,
  onTakeOver,
  onRecheck,
}: {
  runtime: DocumentRuntime;
  staleLock: boolean;
  busy: boolean;
  onReview?: () => void;
  onTakeOver?: () => void;
  onRecheck?: () => void;
}): JSX.Element {
  return (
    <div
      className="nf-status-slim"
      data-document-status="true"
      data-status-slim="true"
      data-status-kind={staleLock ? 'stale-lock' : 'read-only'}
      aria-live="polite"
    >
      {staleLock ? (
        <Lock size={13} strokeWidth={1.5} className="nf-status-slim-icon" aria-hidden="true" />
      ) : (
        <TriangleAlert
          size={13}
          strokeWidth={1.5}
          className="nf-status-slim-icon"
          aria-hidden="true"
        />
      )}
      <span className="nf-status-slim-label">
        {staleLock ? 'Read-only · stale lock' : 'Read-only'}
      </span>
      {staleLock ? null : (
        <span className="nf-status-slim-reason" data-status-reason="true">
          {reasonLabel(runtime.readOnlyReason)}
        </span>
      )}
      <span className="nf-status-slim-actions">
        {staleLock ? (
          <>
            <button
              type="button"
              className="nf-button nf-button-primary"
              data-stale-lock-action="take-over"
              disabled={busy}
              onClick={onTakeOver}
            >
              {busy ? 'Taking over…' : 'Take over lock'}
            </button>
            <button
              type="button"
              className="nf-button nf-button-quiet"
              data-stale-lock-action="review"
              disabled={busy}
              onClick={onReview}
            >
              Review
            </button>
          </>
        ) : (
          <>
            {runtime.readOnlyReason === 'locked' ? (
              <button
                type="button"
                className="nf-button nf-button-quiet"
                data-status-action="recheck"
                disabled={busy}
                onClick={onRecheck}
              >
                {busy ? 'Rechecking…' : 'Recheck'}
              </button>
            ) : null}
            <details className="nf-status-details nf-status-slim-details" data-status-details="true">
              <summary>Details</summary>
              <div className="nf-status-slim-details-popover">
                <p>
                  This note opened read-only and your file is not being modified. Close the
                  other NoteForest window; if none is open, quit and reopen NoteForest.
                </p>
                <LockMetadata runtime={runtime} />
              </div>
            </details>
          </>
        )}
      </span>
    </div>
  );
}

export function DocumentStatusPanel({
  runtime,
}: {
  runtime: DocumentRuntime | null;
}): JSX.Element | null {
  const packagePath = runtime?.packagePath ?? null;
  const collapsed = useDocumentStatusStore((state) =>
    packagePath === null ? false : state.collapsed[packagePath] === true,
  );
  const setCollapsed = useDocumentStatusStore((state) => state.setCollapsed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const focusedOnce = useRef(false);

  const staleLock = runtime?.readOnlyReason === 'stale-lock';

  // Focus the primary action once, when the state starts blocking an edit. The
  // panel is not a modal and never traps focus; a later Review does not steal it.
  useEffect(() => {
    if (runtime === null || !staleLock || collapsed) return;
    if (focusedOnce.current) return;
    focusedOnce.current = true;
    primaryRef.current?.focus({ preventScroll: true });
  }, [runtime, staleLock, collapsed]);

  useEffect(() => {
    setError(null);
    // A new document starts from the full panel (design §5): the focus-once
    // guard is per document, not per component instance.
    focusedOnce.current = false;
  }, [packagePath]);

  if (runtime === null) return null;
  if (runtime.status === 'editable') return null;

  const cancel = (): void => {
    if (packagePath !== null) setCollapsed(packagePath, true);
    setError(null);
  };

  const takeOver = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await runtime.takeOverLock();
      if (!result.ok) {
        setError(result.message ?? 'Couldn’t take over the lock.');
        return;
      }
      // Refresh the tab identity so the lock icon disappears with the panel.
      useShell.getState().openTab({
        packagePath: runtime.packagePath,
        title: runtime.title,
      });
      toast.success('Lock taken over. You can edit now.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const recheck = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await runtime.reloadFromDisk();
      if (!result.ok) {
        toast.error(result.message ?? 'Couldn’t reopen the note.');
        return;
      }
      if (runtime.readOnlyReason === 'locked') {
        toast.warning('Still read-only. Another window has it open.');
        return;
      }
      if (runtime.status === 'editable') {
        // Refresh the tab identity so the lock icon disappears with the panel.
        useShell.getState().openTab({
          packagePath: runtime.packagePath,
          title: runtime.title,
        });
        toast.success('Reopened. You can edit now.');
      } else {
        toast.info('Still read-only.');
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!staleLock) {
    return (
      <SlimBar
        runtime={runtime}
        staleLock={false}
        busy={busy}
        onRecheck={() => void recheck()}
      />
    );
  }

  if (collapsed) {
    return (
      <SlimBar
        runtime={runtime}
        staleLock
        busy={busy}
        onTakeOver={() => void takeOver()}
        onReview={() => {
          if (packagePath !== null) setCollapsed(packagePath, false);
          setError(null);
        }}
      />
    );
  }

  return (
    <section
      className="nf-status-panel"
      data-document-status="true"
      data-stale-lock-banner="true"
      data-status-kind="stale-lock"
      role="alert"
      aria-label="Read-only: stale document lock"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        cancel();
      }}
    >
      <TriangleAlert
        size={16}
        strokeWidth={1.5}
        className="nf-status-icon"
        aria-hidden="true"
      />
      <div className="nf-status-copy">
        <strong className="nf-status-title">Read-only · stale lock</strong>
        <p className="nf-status-body">
          Another NoteForest window left this note open. Take over only if no other window is
          using it.
        </p>
        <details className="nf-status-details" data-status-details="true">
          <summary>Lock details</summary>
          <LockMetadata runtime={runtime} />
        </details>
        {error === null ? null : (
          <p className="nf-status-error" role="alert" data-stale-lock-error="true">
            {error}
          </p>
        )}
      </div>
      <div className="nf-status-actions">
        <button
          type="button"
          className="nf-button nf-button-primary"
          data-stale-lock-action="take-over"
          ref={primaryRef}
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
          onClick={cancel}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
