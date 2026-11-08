/** Typed error and diagnostics vocabulary shared by the pure and Node layers. */

export type ValidationSeverity = 'error' | 'warning';

export type ValidationCode =
  | 'invalid-shape'
  | 'invalid-schema-version'
  | 'missing-field'
  | 'duplicate-id'
  | 'map-key-mismatch'
  | 'invalid-content'
  | 'invalid-timestamp'
  | 'invalid-revision'
  | 'unknown-block'
  | 'block-in-two-chapters'
  | 'duplicate-top-level-entry'
  | 'top-level-block-has-parent'
  | 'unassigned-block'
  | 'dangling-parent'
  | 'multiple-primary-parents'
  | 'primary-cycle'
  | 'dangling-source'
  | 'dangling-target'
  | 'dangling-anchor'
  | 'self-branch'
  | 'duplicate-branch'
  | 'duplicate-branch-order'
  | 'invalid-branch'
  | 'invalid-anchor-selector'
  | 'anchor-kind-mismatch'
  | 'duplicate-anchor-binding'
  | 'anchor-not-contiguous'
  | 'anchor-crosses-barrier'
  | 'anchor-without-record'
  | 'anchor-binding-wrong-block'
  | 'anchor-selector-mismatch'
  | 'anchor-legacy-conflict'
  | 'unsupported-anchor-kind'
  | 'invalid-asset-path'
  | 'unsupported-m2-feature';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: ValidationCode;
  message: string;
  /** JSON-ish path such as `blocks.b3.content` or `chapters[0]`. */
  path?: string;
  /** Offending entity IDs, newest first, for recovery UI. */
  ids?: string[];
}

export interface ValidationReport {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: {
    blocks: number;
    chapters: number;
    branches: number;
    anchors: number;
    assets: number;
  };
}

export type CoreErrorCode =
  | 'malformed-json'
  | 'newer-schema'
  | 'invalid-schema-version'
  | 'invalid-document'
  | 'io-error'
  | 'not-found'
  | 'read-only'
  | 'document-locked'
  | 'stale-lock'
  | 'lock-lost'
  | 'external-modification'
  | 'revision-conflict'
  | 'invalid-command'
  | 'backup-failed'
  | 'recovery-failed'
  | 'unsupported';

export interface CoreError {
  code: CoreErrorCode;
  message: string;
  details?: Record<string, unknown>;
  issues?: ValidationIssue[];
}

export function coreError(
  code: CoreErrorCode,
  message: string,
  details?: Record<string, unknown>,
): CoreError {
  return details === undefined ? { code, message } : { code, message, details };
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export function isValidationError(issue: ValidationIssue): boolean {
  return issue.severity === 'error';
}

export function formatIssues(issues: readonly ValidationIssue[], limit = 20): string {
  const shown = issues.slice(0, limit).map((issue) => `${issue.code}: ${issue.message}`);
  if (issues.length > limit) shown.push(`… and ${issues.length - limit} more`);
  return shown.join('; ');
}
