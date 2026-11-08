/**
 * Ordered schema migrations for the canonical document format.
 *
 * `document.schemaVersion` names the on-disk format. A migration is a pure,
 * single-step transform from one version to the next; the registry must be
 * contiguous from version 1 to the current version. The current format is v2
 * (ADR-0008), so one product migration exists.
 *
 * This module is pure TypeScript: no Node, DOM, React, or filesystem imports.
 * Validation still happens after migration in `serialize.ts`; a migration must
 * never validate, strip unknown fields, or write to disk.
 */

import type { CoreError, ValidationIssue } from './errors.js';
import { coreError } from './errors.js';
import type { Document, JsonObject } from './types.js';
import { CURRENT_SCHEMA_VERSION } from './types.js';

/**
 * One ordered schema step.
 *
 * `migrate` must return a new document object, must set `schemaVersion` to
 * `to`, and must not mutate its input. Unknown fields and unknown content
 * nodes are preserved, as everywhere else in the model.
 */
export interface SchemaMigration {
  readonly from: number;
  readonly to: number;
  /** Short human description used in migration reports. */
  readonly description: string;
  migrate(value: Readonly<JsonObject>): JsonObject;
}

/**
 * Product migration registry.
 *
 * v1 → v2 (ADR-0008): the canonical document is a continuous canvas. Page
 * setup, manual page breaks, and view state are personal settings, so the
 * three known legacy fields are removed. No settings are seeded and every
 * other unknown field is preserved verbatim.
 */
export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = Object.freeze([
  {
    from: 1,
    to: 2,
    description: 'remove canonical page setup, manual breaks, and view state',
    migrate(value) {
      const next: JsonObject = { ...value, schemaVersion: 2 };
      delete next['pageSetup'];
      delete next['manualBreakBeforeBlockIds'];
      delete next['viewState'];
      return next;
    },
  },
]);

export interface MigrationOptions {
  /** Defaults to `SCHEMA_MIGRATIONS`. Synthetic registries are test-only. */
  registry?: readonly SchemaMigration[];
  /** Defaults to `CURRENT_SCHEMA_VERSION`. Overridden only by tests/fixtures. */
  targetVersion?: number;
}

export interface AppliedMigration {
  from: number;
  to: number;
  description: string;
}

export interface MigrationSuccess {
  status: 'current' | 'migrated';
  document: Document;
  fromVersion: number;
  toVersion: number;
  applied: AppliedMigration[];
}

export interface MigrationNewer {
  status: 'newer';
  error: CoreError;
  schemaVersion: number;
  supportedVersion: number;
}

export interface MigrationInvalid {
  status: 'invalid';
  error: CoreError;
  issues?: ValidationIssue[];
}

export interface MigrationInvalidRegistry {
  status: 'invalid-registry';
  error: CoreError;
  problems: string[];
}

export type MigrationResult =
  | MigrationSuccess
  | MigrationNewer
  | MigrationInvalid
  | MigrationInvalidRegistry;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * Check that `registry` is an ordered, gap-free chain from version 1 to
 * `targetVersion`. Returns human-readable problems; an empty list is valid.
 */
export function validateMigrationRegistry(
  registry: readonly SchemaMigration[],
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): string[] {
  const problems: string[] = [];
  if (!isVersion(targetVersion)) {
    problems.push(`target version must be a positive integer, got ${String(targetVersion)}`);
    return problems;
  }

  let expected = 1;
  const seenFrom = new Set<number>();
  for (const [index, migration] of registry.entries()) {
    const label = `migration[${index}]`;
    if (!isVersion(migration.from) || !isVersion(migration.to)) {
      problems.push(`${label} versions must be positive integers`);
      continue;
    }
    if (migration.to <= migration.from) {
      problems.push(`${label} ${migration.from}->${migration.to} must move forward`);
    }
    if (seenFrom.has(migration.from)) {
      problems.push(`${label} starts at ${migration.from} more than once`);
    }
    seenFrom.add(migration.from);
    if (migration.from !== expected) {
      problems.push(`${label} starts at ${migration.from}, expected ${expected}`);
    }
    expected = migration.to;
  }

  if (problems.length === 0 && expected !== targetVersion) {
    problems.push(
      `registry ends at version ${expected}, but the current version is ${targetVersion}`,
    );
  }
  return problems;
}

/**
 * Upgrade a parsed document value to `targetVersion`.
 *
 * - `current`: already at the target; the value is returned unchanged.
 * - `migrated`: every step ran in order; the returned document is a clone.
 * - `newer`: the value is newer than this app; never migrate or downgrade.
 * - `invalid`: the value cannot be a document (bad version/shape).
 * - `invalid-registry`: the migration chain is missing or malformed.
 *
 * The input object is never mutated, including on failure. Callers that need a
 * validated document run `validateDocument` afterwards (see `serialize.ts`).
 */
export function migrateDocument(
  value: unknown,
  options: MigrationOptions = {},
): MigrationResult {
  if (!isRecord(value)) {
    return {
      status: 'invalid',
      error: coreError('invalid-document', 'document JSON must be an object'),
    };
  }

  const targetVersion = options.targetVersion ?? CURRENT_SCHEMA_VERSION;
  const schemaVersion = value['schemaVersion'];
  if (!isVersion(schemaVersion)) {
    return {
      status: 'invalid',
      error: coreError(
        'invalid-schema-version',
        'document.schemaVersion must be a positive integer',
        { schemaVersion: schemaVersion === undefined ? null : schemaVersion },
      ),
    };
  }
  if (schemaVersion > targetVersion) {
    return {
      status: 'newer',
      schemaVersion,
      supportedVersion: targetVersion,
      error: coreError(
        'newer-schema',
        `document schemaVersion ${schemaVersion} is newer than this app supports (${targetVersion}); open read-only`,
        { schemaVersion, supportedSchemaVersion: targetVersion },
      ),
    };
  }
  if (schemaVersion === targetVersion) {
    return {
      status: 'current',
      document: value as unknown as Document,
      fromVersion: schemaVersion,
      toVersion: schemaVersion,
      applied: [],
    };
  }

  const registry = options.registry ?? SCHEMA_MIGRATIONS;
  const problems = validateMigrationRegistry(registry, targetVersion);
  if (problems.length > 0) {
    return {
      status: 'invalid-registry',
      problems,
      error: coreError(
        'unsupported',
        `no valid migration path from schemaVersion ${schemaVersion} to ${targetVersion}`,
        { schemaVersion, targetVersion, problems },
      ),
    };
  }

  // Guard the caller's object even if a migration accidentally mutates.
  let working: unknown;
  try {
    working = structuredClone(value);
  } catch (error) {
    return {
      status: 'invalid',
      error: coreError('invalid-document', 'document contains values that cannot be migrated', {
        reason: error instanceof Error ? error.message : String(error),
      }),
    };
  }
  let version = schemaVersion;
  const applied: AppliedMigration[] = [];

  while (version < targetVersion) {
    const migration = registry.find((candidate) => candidate.from === version);
    if (migration === undefined) {
      return {
        status: 'invalid-registry',
        problems: [`no migration registered from version ${version}`],
        error: coreError(
          'unsupported',
          `no migration registered from schemaVersion ${version}`,
          { schemaVersion, targetVersion },
        ),
      };
    }
    const next = migration.migrate(working as JsonObject);
    if (!isRecord(next)) {
      return {
        status: 'invalid-registry',
        problems: [`migration ${migration.from}->${migration.to} returned a non-object`],
        error: coreError(
          'unsupported',
          `migration ${migration.from}->${migration.to} did not produce a document object`,
          { schemaVersion, targetVersion },
        ),
      };
    }
    if (next['schemaVersion'] !== migration.to) {
      return {
        status: 'invalid-registry',
        problems: [
          `migration ${migration.from}->${migration.to} produced schemaVersion ${String(
            next['schemaVersion'],
          )}`,
        ],
        error: coreError(
          'unsupported',
          `migration ${migration.from}->${migration.to} did not set schemaVersion ${migration.to}`,
          { schemaVersion, targetVersion },
        ),
      };
    }
    applied.push({
      from: migration.from,
      to: migration.to,
      description: migration.description,
    });
    working = next;
    version = migration.to;
  }

  return {
    status: 'migrated',
    document: working as unknown as Document,
    fromVersion: schemaVersion,
    toVersion: version,
    applied,
  };
}
