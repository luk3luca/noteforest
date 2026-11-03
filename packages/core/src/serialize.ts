/**
 * Canonical JSON serialization.
 *
 * Parsing validates but never strips data: unknown fields, unknown content
 * nodes, and unknown marks survive because the parsed JSON object is used
 * directly rather than copied into a closed projection.
 */

import type { CoreError, ValidationReport } from './errors.js';
import { coreError } from './errors.js';
import type { Document } from './types.js';
import { CURRENT_SCHEMA_VERSION } from './types.js';
import { validateDocument } from './validation.js';

export interface ParseSuccess {
  ok: true;
  document: Document;
  report: ValidationReport;
}

export interface ParseFailure {
  ok: false;
  error: CoreError;
  report?: ValidationReport;
}

export type ParseResult = ParseSuccess | ParseFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateParsedValue(value: unknown): ParseResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: coreError('invalid-document', 'document JSON must be an object'),
    };
  }

  const schemaVersion = value['schemaVersion'];
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return {
      ok: false,
      error: coreError(
        'invalid-schema-version',
        'document.schemaVersion must be a positive integer',
        { schemaVersion: schemaVersion === undefined ? null : schemaVersion },
      ),
    };
  }
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: coreError(
        'newer-schema',
        `document schemaVersion ${schemaVersion} is newer than this app supports (${CURRENT_SCHEMA_VERSION}); open read-only`,
        { schemaVersion, supportedSchemaVersion: CURRENT_SCHEMA_VERSION },
      ),
    };
  }

  const report = validateDocument(value);
  if (!report.ok) {
    const error = coreError(
      'invalid-document',
      `document failed validation with ${report.errors.length} error(s)`,
      { errorCount: report.errors.length },
    );
    error.issues = report.errors;
    return { ok: false, error, report };
  }
  return { ok: true, document: value as unknown as Document, report };
}

/** Parse and validate a canonical `document.json` payload. */
export function parseDocumentJson(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    return {
      ok: false,
      error: coreError('malformed-json', 'document.json is not valid JSON', {
        reason: error instanceof Error ? error.message : String(error),
      }),
    };
  }
  return validateParsedValue(value);
}

/** Validate an already-parsed JSON value (e.g. a backup read as JSON). */
export function parseDocumentValue(value: unknown): ParseResult {
  return validateParsedValue(value);
}

export interface StringifyOptions {
  /** Pretty-print with two spaces (default true; canonical files are readable). */
  pretty?: boolean;
}

/** Serialize a document to canonical JSON, keeping unknown data. */
export function stringifyDocument(document: Document, options: StringifyOptions = {}): string {
  const pretty = options.pretty !== false;
  const json = pretty ? JSON.stringify(document, null, 2) : JSON.stringify(document);
  return `${json}\n`;
}
