/**
 * Details: the single place for one technical line (docs/design/dialogs.md §3).
 *
 * The short outcome stays in the dialog, banner, or status surface; the path,
 * OS error, or code opens here, is selectable, and is copyable. The disclosure
 * is a native `<details>`/`<summary>`: the summary is the accessible name, the
 * state is not persisted, and `Copy` is only reachable by Tab while open.
 *
 * D25 (`DetailsDialog`) reuses the same code block for a surface that has no
 * persistent place for the disclosure (the toast host opens it in batch C).
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { writeClipboardText } from '../lib/clipboard';
import { Frame } from './DialogFrame';

async function copyValue(value: string): Promise<boolean> {
  const copied = await writeClipboardText(value);
  if (copied) toast.success('Copied');
  return copied;
}

export interface DetailsProps {
  /** One technical line: a path, an OS error, or a code. Never prose. */
  value: string;
}

export function Details({ value }: DetailsProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  return (
    <details className="nf-details" data-details="true">
      <summary>Details</summary>
      <div className="nf-details-body">
        <code
          className="nf-details-value"
          data-details-value="true"
          role="group"
          aria-label="Technical details"
          title={value}
        >
          {value}
        </code>
        <button
          type="button"
          className="nf-button nf-button-quiet nf-details-copy"
          data-details-copy="true"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void copyValue(value).finally(() => setBusy(false));
          }}
        >
          Copy
        </button>
      </div>
    </details>
  );
}

/**
 * D25: `Details`, one copyable line, `Copy` … `Close`. Opened by a toast that
 * has no persistent surface (batch C); the dialog itself is complete here.
 */
export function DetailsDialog({
  value,
  onClose,
}: {
  value: string;
  onClose: () => void;
}): JSX.Element {
  return (
    <Frame
      title="Details"
      navigation={
        <button
          type="button"
          className="nf-button nf-button-quiet"
          data-details-copy="true"
          onClick={() => void copyValue(value)}
        >
          Copy
        </button>
      }
      actions={
        <button type="button" className="nf-button" onClick={onClose}>
          Close
        </button>
      }
    >
      <code
        className="nf-details-value nf-details-value-static"
        data-details-value="true"
        role="group"
        aria-label="Technical details"
        title={value}
      >
        {value}
      </code>
    </Frame>
  );
}
