/**
 * Toast + Details (docs/design/dialogs.md §3.3, decision 6.1).
 *
 * A toast is one line. When the failure carries a technical value, the toast
 * adds exactly one `Details` action that opens D25 (one copyable line, `Copy`,
 * `Close`). There is no inline disclosure inside a toast: it would disappear
 * with the toast.
 */

import { toast, type ExternalToast } from 'sonner';
import { useShell } from '../state/shell';

/** Open D25 with one technical line. The only toast Details trigger. */
export function openDetailsDialog(value: string): void {
  useShell.getState().openDialog({ kind: 'details', value });
}

/**
 * Add the optional `Details` action. No details, no action: a toast never shows
 * an empty disclosure.
 */
export function withDetailsOptions(
  details: string | undefined,
  options?: ExternalToast,
): ExternalToast | undefined {
  if (details === undefined || details.length === 0) return options;
  return {
    ...options,
    action: {
      label: 'Details',
      onClick: () => openDetailsDialog(details),
    },
  };
}

/** One short error line plus, when present, the `Details` action. */
export function errorToast(
  message: string,
  details?: string,
  options?: ExternalToast,
): void {
  toast.error(message, withDetailsOptions(details, options));
}
