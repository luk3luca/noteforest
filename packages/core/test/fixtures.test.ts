/**
 * Every checked-in Spike fixture must remain a valid canonical document.
 *
 * The fixtures are layout/PDF evidence, but they are also read by M4 tooling.
 * This guards the anchor selector shape and any future schema drift.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDocumentJson } from '../src/serialize.js';

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures',
);

async function fixtureFiles(): Promise<string[]> {
  const entries = await fs.readdir(fixturesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
}

describe('checked-in fixtures', () => {
  it('contains at least one JSON fixture', async () => {
    expect((await fixtureFiles()).length).toBeGreaterThan(0);
  });

  it('validates every fixture with the canonical parser', async () => {
    for (const file of await fixtureFiles()) {
      const text = await fs.readFile(path.join(fixturesDir, file), 'utf8');
      const result = parseDocumentJson(text);
      if (!result.ok) {
        const issues = result.report?.errors.map((issue) => `${issue.path}: ${issue.message}`);
        throw new Error(`${file} does not validate:\n${issues?.join('\n') ?? result.error.message}`);
      }
      expect(result.ok, file).toBe(true);
    }
  });
});
