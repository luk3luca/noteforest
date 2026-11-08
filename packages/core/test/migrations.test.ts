import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SchemaMigration } from '../src/migrations.js';
import {
  SCHEMA_MIGRATIONS,
  migrateDocument,
  validateMigrationRegistry,
} from '../src/migrations.js';
import { parseDocumentJson, stringifyDocument } from '../src/serialize.js';
import type { JsonObject } from '../src/types.js';
import { CURRENT_SCHEMA_VERSION } from '../src/types.js';

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/schema',
);

async function fixture(name: string): Promise<string> {
  return fs.readFile(path.join(fixturesDir, name), 'utf8');
}

function parseObject(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

/** Two synthetic steps used only to exercise the framework, not the product. */
const TEST_REGISTRY: readonly SchemaMigration[] = [
  {
    from: 1,
    to: 2,
    description: 'add a v2 marker',
    migrate(value) {
      return { ...value, schemaVersion: 2, addedByV2: true };
    },
  },
  {
    from: 2,
    to: 3,
    description: 'carry the v2 marker into v3',
    migrate(value) {
      return {
        ...value,
        schemaVersion: 3,
        addedByV3: value['addedByV2'] === true,
      };
    },
  },
];

describe('schema migration registry', () => {
  it('is a contiguous v1→v2 product migration', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
    expect(SCHEMA_MIGRATIONS.map((migration) => [migration.from, migration.to])).toEqual([
      [1, 2],
    ]);
    expect(validateMigrationRegistry(SCHEMA_MIGRATIONS, CURRENT_SCHEMA_VERSION)).toEqual([]);
  });

  it('accepts a contiguous chain and rejects gaps, duplicates, and backwards steps', () => {
    expect(validateMigrationRegistry(TEST_REGISTRY, 3)).toEqual([]);

    expect(validateMigrationRegistry([], 2)).toEqual([
      'registry ends at version 1, but the current version is 2',
    ]);

    const gap: SchemaMigration[] = [
      { from: 2, to: 3, description: 'gap', migrate: (value) => ({ ...value, schemaVersion: 3 }) },
    ];
    expect(validateMigrationRegistry(gap, 3).length).toBeGreaterThan(0);

    const duplicate: SchemaMigration[] = [
      { from: 1, to: 2, description: 'one', migrate: (value) => ({ ...value, schemaVersion: 2 }) },
      { from: 1, to: 2, description: 'two', migrate: (value) => ({ ...value, schemaVersion: 2 }) },
    ];
    expect(validateMigrationRegistry(duplicate, 2).length).toBeGreaterThan(0);

    const backwards: SchemaMigration[] = [
      { from: 1, to: 1, description: 'no move', migrate: (value) => ({ ...value }) },
    ];
    expect(validateMigrationRegistry(backwards, 1).length).toBeGreaterThan(0);
  });
});

describe('migrateDocument', () => {
  it('migrates the v1 fixture to v2, strips legacy page fields, and preserves unknown fields', async () => {
    const value = parseObject(await fixture('v1.json'));
    const before = structuredClone(value);

    const result = migrateDocument(value);
    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') return;
    expect(result.document).not.toBe(value);
    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(2);
    expect(result.applied).toEqual([
      {
        from: 1,
        to: 2,
        description: 'remove canonical page setup, manual breaks, and view state',
      },
    ]);
    expect(result.document.schemaVersion).toBe(2);
    expect(result.document).not.toHaveProperty('pageSetup');
    expect(result.document).not.toHaveProperty('manualBreakBeforeBlockIds');
    expect(result.document).not.toHaveProperty('viewState');
    expect(result.document['futureRootField']).toEqual({ keep: true });
    expect(result.document['extensions']).toEqual({ fixture: 'schema-v1' });
    expect(result.document['blocks']).toEqual(before['blocks']);
    expect(value).toEqual(before);
  });

  it('parses v1 with one reported migration and is idempotent at v2', async () => {
    const text = await fixture('v1.json');
    const first = parseDocumentJson(text);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.migratedFrom).toBe(1);
    expect(first.migrationsApplied).toEqual([
      '1->2: remove canonical page setup, manual breaks, and view state',
    ]);
    expect(first.document.schemaVersion).toBe(2);

    const again = parseDocumentJson(stringifyDocument(first.document));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.document).toEqual(first.document);
    expect(again.migratedFrom).toBeUndefined();
    expect(again.document.schemaVersion).toBe(2);
  });

  it('treats the checked-in v2 fixture as current and never mutates it', async () => {
    const value = parseObject(await fixture('v2.json'));
    const before = structuredClone(value);

    const result = migrateDocument(value);
    expect(result.status).toBe('current');
    if (result.status !== 'current') return;
    expect(result.document).toBe(value);
    expect(result.fromVersion).toBe(2);
    expect(result.toVersion).toBe(2);
    expect(result.applied).toEqual([]);
    expect(value).toEqual(before);
  });

  it('rejects an unknown newer document read-only without touching it', async () => {
    const value = parseObject(await fixture('v3-newer.json'));
    const before = structuredClone(value);

    const result = migrateDocument(value);
    expect(result.status).toBe('newer');
    if (result.status !== 'newer') return;
    expect(result.error.code).toBe('newer-schema');
    expect(result.schemaVersion).toBe(3);
    expect(result.supportedVersion).toBe(2);
    expect(result.error.message).toMatch(/newer than this app supports/);
    expect(value).toEqual(before);

    const parsed = parseDocumentJson(await fixture('v3-newer.json'));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('newer-schema');
  });

  it('rejects invalid schema versions and non-object values', () => {
    for (const schemaVersion of [0, -1, 1.5, '1', null]) {
      const result = migrateDocument({ schemaVersion });
      expect(result.status).toBe('invalid');
      if (result.status !== 'invalid') continue;
      expect(result.error.code).toBe('invalid-schema-version');
    }

    for (const value of [null, [], 'document', 42]) {
      const result = migrateDocument(value);
      expect(result.status).toBe('invalid');
      if (result.status !== 'invalid') continue;
      expect(result.error.code).toBe('invalid-document');
    }
  });

  it('applies a synthetic chain in order, preserves unknown fields, and clones input', () => {
    const input: JsonObject = {
      schemaVersion: 1,
      title: 'Original',
      unknown: { keep: true },
    };
    const before = structuredClone(input);

    const result = migrateDocument(input, { registry: TEST_REGISTRY, targetVersion: 3 });
    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') return;

    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(3);
    expect(result.applied).toEqual([
      { from: 1, to: 2, description: 'add a v2 marker' },
      { from: 2, to: 3, description: 'carry the v2 marker into v3' },
    ]);
    expect(result.document.schemaVersion).toBe(3);
    expect(result.document['addedByV2']).toBe(true);
    expect(result.document['addedByV3']).toBe(true);
    expect(result.document['unknown']).toEqual({ keep: true });
    expect(input).toEqual(before);

    const again = migrateDocument(result.document, {
      registry: TEST_REGISTRY,
      targetVersion: 3,
    });
    expect(again.status).toBe('current');
    if (again.status !== 'current') return;
    expect(again.applied).toEqual([]);
    expect(again.document).toEqual(result.document);
  });

  it('protects the caller even when a migration mutates its argument', () => {
    const mutating: readonly SchemaMigration[] = [
      {
        from: 1,
        to: 2,
        description: 'mutating test step',
        migrate(value) {
          (value as JsonObject)['title'] = 'mutated';
          return { ...value, schemaVersion: 2 };
        },
      },
    ];
    const input: JsonObject = { schemaVersion: 1, title: 'Original' };

    const result = migrateDocument(input, { registry: mutating, targetVersion: 2 });
    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') return;
    expect(result.document.title).toBe('mutated');
    expect(input['title']).toBe('Original');
  });

  it('fails safely when the value cannot be cloned for migration', () => {
    const input = { schemaVersion: 1, fn: () => undefined } as unknown as JsonObject;
    const result = migrateDocument(input, { registry: TEST_REGISTRY, targetVersion: 3 });
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.error.code).toBe('invalid-document');
  });

  it('fails safely when the registry has no path or a step is wrong', () => {
    const input: JsonObject = { schemaVersion: 1, title: 'Original' };
    const before = structuredClone(input);

    const missing = migrateDocument(input, { registry: [], targetVersion: 2 });
    expect(missing.status).toBe('invalid-registry');
    if (missing.status !== 'invalid-registry') return;
    expect(missing.error.code).toBe('unsupported');
    expect(missing.problems.length).toBeGreaterThan(0);
    expect(input).toEqual(before);

    const wrongVersion: readonly SchemaMigration[] = [
      {
        from: 1,
        to: 2,
        description: 'forgets to bump the version',
        migrate: (value) => ({ ...value }),
      },
    ];
    const wrong = migrateDocument(input, { registry: wrongVersion, targetVersion: 2 });
    expect(wrong.status).toBe('invalid-registry');
    if (wrong.status !== 'invalid-registry') return;
    expect(wrong.problems[0]).toMatch(/produced schemaVersion 1/);
    expect(input).toEqual(before);

    const nonObject: readonly SchemaMigration[] = [
      {
        from: 1,
        to: 2,
        description: 'returns a string',
        migrate: () => 'not a document' as unknown as JsonObject,
      },
    ];
    const invalid = migrateDocument(input, { registry: nonObject, targetVersion: 2 });
    expect(invalid.status).toBe('invalid-registry');
    if (invalid.status !== 'invalid-registry') return;
    expect(invalid.problems[0]).toMatch(/non-object/);
    expect(input).toEqual(before);
  });
});
