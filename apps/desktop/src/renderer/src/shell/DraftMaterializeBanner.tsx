/**
 * Draft materialization failure surface (L3).
 *
 * A draft whose bound library is missing (or whose first package write failed)
 * stays in memory with a visible, non-blocking explanation. The editor keeps
 * working; the user can retry after reconnecting the library or choose another
 * library for this note. Nothing is written until materialization succeeds.
 */

import { TriangleAlert } from 'lucide-react';
import type { DocumentRuntime } from '../state/runtime';
import { chooseLibraryForDraft, retryDraftMaterialization } from '../actions';

export function DraftMaterializeBanner({
  runtime,
}: {
  runtime: DocumentRuntime | null;
}): JSX.Element | null {
  if (runtime === null || !runtime.isDraft || runtime.draftError === null) return null;
  const error = runtime.draftError;
  return (
    <div
      className="nf-draft-banner"
      data-draft-materialize-error={error.code}
      role="status"
      aria-live="polite"
    >
      <TriangleAlert size={13} strokeWidth={1.5} className="nf-draft-banner-icon" aria-hidden="true" />
      <div className="nf-draft-banner-copy">
        <p className="nf-draft-banner-title">This note is not saved yet</p>
        <p className="nf-draft-banner-message" data-draft-error-message="true">
          {error.message}
        </p>
      </div>
      <div className="nf-draft-banner-actions">
        <button
          type="button"
          className="nf-text-button"
          data-draft-choose-library="true"
          onClick={() => void chooseLibraryForDraft(runtime)}
        >
          Choose another library…
        </button>
        <button
          type="button"
          className="nf-text-button"
          data-draft-retry="true"
          onClick={() => void retryDraftMaterialization(runtime)}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
