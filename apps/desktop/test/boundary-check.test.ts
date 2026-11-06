import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error the checker is plain Node ESM outside the desktop TypeScript project
import { checkBoundaries } from '../../../scripts/check-boundaries.mjs';

const roots: string[] = [];

function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'noteforest-boundaries-'));
  roots.push(root);
  for (const [file, source] of Object.entries(files)) {
    const absolute = path.join(root, ...file.split('/'));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return root;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('architecture boundary check', () => {
  it('fails a synthetic forbidden core import and reports file, line, and import', () => {
    const result = checkBoundaries({
      root: workspace({
        'packages/core/src/bad.ts': [
          "import { app } from 'electron';",
          "import fs from 'node:fs';",
          "import { useState } from 'react';",
        ].join('\n'),
      }),
    });

    expect(result.violations.map((violation) => violation.rule)).toEqual([
      'core/no-electron',
      'core/no-node-fs',
      'core/no-react',
    ]);
    expect(result.violations[0]).toMatchObject({
      file: 'packages/core/src/bad.ts',
      specifier: 'electron',
      line: 1,
    });
    expect(result.violations[0]?.column).toBeGreaterThan(0);
  });

  it('passes allowed imports, including the core/node fs exception and shared contracts', () => {
    const result = checkBoundaries({
      root: workspace({
        'packages/core/src/types.ts': 'export interface Document {}',
        'packages/core/src/node/store.ts': "import { promises as fs } from 'node:fs';",
        'packages/core/src/pure.ts': "import type { Document } from './types.js';",
        'packages/layout/src/index.ts': 'export interface Layout {}',
        'packages/pdf/src/print.ts': "import type { Layout } from '@noteforest/layout';",
        'apps/desktop/src/shared/api.ts': 'export interface Api {}',
        'apps/desktop/src/preload/index.ts': "import { contextBridge } from 'electron';",
        'apps/desktop/src/renderer/src/lib/flush.ts':
          "import type { Api } from '../../../shared/api';",
        'apps/desktop/src/renderer/src/App.tsx': "import { useState } from 'react';",
      }),
    });

    expect(result.violations).toEqual([]);
    expect(result.importsScanned).toBe(6);
  });

  it('detects type-only, import-type, and dynamic import specifiers', () => {
    const result = checkBoundaries({
      root: workspace({
        'packages/core/src/bad.ts': [
          "import type { App } from 'electron';",
          "export type Fs = typeof import('node:fs');",
          'export async function load() { return import("react"); }',
        ].join('\n'),
      }),
    });

    expect(result.violations.map((violation) => violation.rule)).toEqual([
      'core/no-electron',
      'core/no-node-fs',
      'core/no-react',
    ]);
  });

  it('fails renderer imports of main, Electron, Node built-ins, and Node entry points', () => {
    const result = checkBoundaries({
      root: workspace({
        'apps/desktop/src/main/library.ts': 'export const library = 1;',
        'apps/desktop/src/renderer/src/bad.ts': [
          "import { app } from 'electron';",
          "import path from 'node:path';",
          "import { library } from '../../main/library';",
          "import type { NodeDocumentRepository } from '@noteforest/core/node';",
        ].join('\n'),
      }),
    });

    expect(result.violations.map((violation) => violation.rule)).toEqual([
      'renderer/no-electron',
      'renderer/no-node-builtin',
      'renderer/no-main',
      'renderer/no-node-entrypoint',
    ]);
  });

  it('fails package reverse dependencies and the pdf renderer edge', () => {
    const result = checkBoundaries({
      root: workspace({
        'apps/desktop/src/main/library.ts': 'export const library = 1;',
        'apps/desktop/src/renderer/src/App.tsx': 'export const App = 1;',
        'packages/api/src/server.ts': "import '../../../apps/desktop/src/renderer/src/App';",
        'packages/pdf/src/print.ts': "import '../../../apps/desktop/src/renderer/src/App';",
        'packages/layout/src/bad.ts': [
          "import { useState } from 'react';",
          "import { app } from 'electron';",
          "import '../../../apps/desktop/src/main/library';",
        ].join('\n'),
        'packages/core/src/bad.ts': "import '../../../apps/desktop/src/renderer/src/App';",
      }),
    });

    const byRule = Object.fromEntries(
      result.violations.map((violation) => [violation.rule, violation]),
    );
    expect(byRule['packages/no-desktop']).toMatchObject({
      file: 'packages/api/src/server.ts',
      specifier: '../../../apps/desktop/src/renderer/src/App',
    });
    expect(byRule['pdf/no-renderer']).toMatchObject({
      file: 'packages/pdf/src/print.ts',
    });
    expect(byRule['layout/no-react']).toMatchObject({ file: 'packages/layout/src/bad.ts' });
    expect(byRule['layout/no-electron']).toMatchObject({ file: 'packages/layout/src/bad.ts' });
    expect(byRule['layout/no-desktop']).toMatchObject({ file: 'packages/layout/src/bad.ts' });
    expect(byRule['core/no-renderer']).toMatchObject({ file: 'packages/core/src/bad.ts' });
  });
});
