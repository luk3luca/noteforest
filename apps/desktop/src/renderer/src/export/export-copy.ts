/**
 * Export sheet copy (docs/design/copy-plan.md A-22).
 *
 * Pure maps so the failed state's short sentence and the warning row labels are
 * unit-tested without Electron. The raw message and the code live in Details.
 */

import type { ExportFailureCode, ExportWarning } from '../../../shared/export';

const WARNING_GROUPS: Record<ExportWarning['kind'], string> = {
  'blocking-defect': 'Layout defects',
  'page-overflow': 'Page overflow',
  'manual-break': 'Manual breaks',
  anchor: 'Anchors',
  asset: 'Images and assets',
  'layout-warning': 'Layout warnings',
  render: 'Rendering',
  validation: 'Validation',
};

/**
 * 18 codes map to 12 short sentences: the code itself joins Details, so the
 * body stays one line. Grouping is confirmed (copy-plan A-22.14).
 */
export function exportFailureMessage(code: ExportFailureCode | undefined): string {
  switch (code) {
    case 'invalid-input':
    case 'document-not-open':
      return 'The export didn’t start.';
    case 'output-exists':
      return 'A file already exists there.';
    case 'snapshot-failed':
    case 'snapshot-timeout':
      return 'The note couldn’t be read in time.';
    case 'document-mismatch':
    case 'settings-mismatch':
      return 'The PDF didn’t match the note, so the export stopped.';
    case 'empty-document':
      return 'The note has no pages to export.';
    case 'model-error':
    case 'model-mismatch':
      return 'The pages couldn’t be laid out.';
    case 'render-error':
    case 'print-failed':
    case 'window-failed':
      return 'The PDF couldn’t be printed.';
    case 'preflight-blocked':
      return 'A layout problem would break the PDF.';
    case 'validation-failed':
      return 'The PDF failed its checks.';
    case 'write-failed':
      return 'The file couldn’t be written.';
    case 'cancelled':
      return 'The export was cancelled.';
    default:
      return 'The export stopped unexpectedly.';
  }
}

export function warningGroupLabel(warning: ExportWarning): string {
  return WARNING_GROUPS[warning.kind] ?? warning.kind;
}

/** `{blockTitle} · {group}` / `Page {n} · {group}`; never the message. */
export function warningRowLabel(warning: ExportWarning): string {
  const group = warningGroupLabel(warning);
  if (warning.blockTitle !== undefined) return `${warning.blockTitle} · ${group}`;
  if (warning.pageNumber !== undefined) return `Page ${warning.pageNumber} · ${group}`;
  return group;
}

/** One Details block: every message, newline-joined, never prose. */
export function warningDetailsValue(warnings: readonly ExportWarning[]): string {
  return warnings.map((warning) => warning.message).join('\n');
}
