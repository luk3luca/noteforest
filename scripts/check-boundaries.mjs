#!/usr/bin/env node
/**
 * M3i4b - architecture boundary check.
 *
 * Enforces the dependency direction documented in
 * docs/architecture/core-stabilization.md. The rule matrix is:
 *
 *   packages/core    may not import apps/desktop, Electron, React, renderer code,
 *                    or node:fs; node:fs is allowed only under packages/core/src/node.
 *   packages/layout  may not import React, Electron, or apps/desktop.
 *   packages/pdf     may not import React, Electron, or the desktop renderer.
 *   packages/*       may not import apps/desktop (no reverse dependency).
 *   renderer         may not import src/main, Electron, Node built-ins,
 *                    @noteforest/core/node, or @noteforest/pdf/node. The explicit
 *                    src/shared and src/preload contracts are allowed.
 *
 * Imports are parsed with the TypeScript compiler already used by the workspace;
 * there is no extra dependency. The scan is source-only (src/), deterministic, and
 * reports every failing file, line, and import.
 *
 * Add an exception only as an exact { rule, file, import, reason } entry in
 * BOUNDARY_ALLOW_LIST. Unused entries fail the check so the allow-list cannot rot.
 *
 * Usage: node scripts/check-boundaries.mjs [--root <repository-root>]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');

/** Product source roots. Tests and build output are intentionally outside the scan. */
export const SCAN_ROOTS = Object.freeze([
  'apps/desktop/src',
  'packages/core/src',
  'packages/layout/src',
  'packages/pdf/src',
  'packages/api/src',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'out', 'build', 'coverage']);

/** Longest matching prefix wins; the ids are used in rule definitions and reports. */
const ZONE_PREFIXES = Object.freeze([
  ['desktop.renderer', 'apps/desktop/src/renderer/'],
  ['desktop.main', 'apps/desktop/src/main/'],
  ['desktop.preload', 'apps/desktop/src/preload/'],
  ['desktop.shared', 'apps/desktop/src/shared/'],
  ['core', 'packages/core/'],
  ['layout', 'packages/layout/'],
  ['pdf', 'packages/pdf/'],
  ['api', 'packages/api/'],
]);

const PACKAGE_ZONES = Object.freeze(['core', 'layout', 'pdf', 'api']);

/** Mirrors the path aliases in tsconfig.base.json; longest alias must come first. */
const PACKAGE_ALIASES = Object.freeze([
  ['@noteforest/core/node', 'packages/core/src/node'],
  ['@noteforest/core', 'packages/core/src'],
  ['@noteforest/layout', 'packages/layout/src'],
  ['@noteforest/pdf/node', 'packages/pdf/src/node.ts'],
  ['@noteforest/pdf', 'packages/pdf/src'],
  ['@noteforest/api', 'packages/api/src'],
]);

const NODE_BUILTIN_NAMES = new Set(
  builtinModules.map((name) => name.replace(/^node:/, '').split('/')[0]),
);

const REACT_PACKAGE_NAMES = new Set(['react', 'react-dom']);

function isUnder(target, directory) {
  return target !== null && (target === directory || target.startsWith(`${directory}/`));
}

function isDesktopImport(record) {
  return (
    isUnder(record.target, 'apps/desktop') ||
    record.specifier === '@noteforest/desktop' ||
    record.specifier.startsWith('@noteforest/desktop/')
  );
}

function isElectron(specifier) {
  return packageNameOf(specifier) === 'electron';
}

function isNodeBuiltin(specifier) {
  if (specifier.startsWith('node:')) return true;
  return NODE_BUILTIN_NAMES.has(specifier.split('/')[0]);
}

function isNodeFs(specifier) {
  const bare = specifier.replace(/^node:/, '');
  return bare === 'fs' || bare.startsWith('fs/');
}

function isNodeEntrypoint(record) {
  if (
    record.specifier === '@noteforest/core/node' ||
    record.specifier.startsWith('@noteforest/core/node/') ||
    record.specifier === '@noteforest/pdf/node' ||
    record.specifier.startsWith('@noteforest/pdf/node/')
  ) {
    return true;
  }
  return (
    isUnder(record.target, 'packages/core/src/node') ||
    record.target === 'packages/pdf/src/node.ts' ||
    isUnder(record.target, 'packages/pdf/src/node')
  );
}

function isReactSpecifier(specifier) {
  const name = packageNameOf(specifier);
  if (REACT_PACKAGE_NAMES.has(name)) return true;
  if (name.startsWith('@react-')) return true;
  const leaf = name.split('/').pop() ?? name;
  return leaf === 'react' || leaf.startsWith('react-') || leaf.endsWith('-react');
}

function packageNameOf(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}

/**
 * Ordered, first-match-wins rules. A rule targets one or more zones and receives a
 * resolved import record: { file, specifier, target, packageName, line, column }.
 */
export const BOUNDARY_RULES = Object.freeze([
  {
    id: 'renderer/no-main',
    zones: ['desktop.renderer'],
    matches: (record) => isUnder(record.target, 'apps/desktop/src/main'),
    message: 'renderer code must not import Node main-process modules',
  },
  {
    id: 'renderer/no-node-builtin',
    zones: ['desktop.renderer'],
    matches: (record) => isNodeBuiltin(record.specifier),
    message: 'renderer code must not import Node built-ins; use the preload bridge',
  },
  {
    id: 'renderer/no-node-entrypoint',
    zones: ['desktop.renderer'],
    matches: (record) => isNodeEntrypoint(record),
    message:
      'renderer code must not import Node subpath entry points (@noteforest/core/node, @noteforest/pdf/node)',
  },
  {
    id: 'renderer/no-electron',
    zones: ['desktop.renderer'],
    matches: (record) => isElectron(record.specifier),
    message: 'renderer code must not import Electron; use the preload bridge',
  },
  {
    id: 'core/no-renderer',
    zones: ['core'],
    matches: (record) => isUnder(record.target, 'apps/desktop/src/renderer'),
    message: 'packages/core must not import desktop renderer code',
  },
  {
    id: 'core/no-desktop',
    zones: ['core'],
    matches: (record) => isDesktopImport(record),
    message: 'packages/core must not import the desktop app',
  },
  {
    id: 'core/no-electron',
    zones: ['core'],
    matches: (record) => isElectron(record.specifier),
    message: 'packages/core must stay Electron-free',
  },
  {
    id: 'core/no-react',
    zones: ['core'],
    matches: (record) => isReactSpecifier(record.specifier),
    message: 'packages/core must stay React-free',
  },
  {
    id: 'core/no-node-fs',
    zones: ['core'],
    matches: (record) =>
      isNodeFs(record.specifier) && !isUnder(record.file, 'packages/core/src/node'),
    message: 'packages/core may import node:fs only from packages/core/src/node',
  },
  {
    id: 'layout/no-react',
    zones: ['layout'],
    matches: (record) => isReactSpecifier(record.specifier),
    message: 'packages/layout must stay React-free',
  },
  {
    id: 'layout/no-electron',
    zones: ['layout'],
    matches: (record) => isElectron(record.specifier),
    message: 'packages/layout must stay Electron-free',
  },
  {
    id: 'layout/no-desktop',
    zones: ['layout'],
    matches: (record) => isDesktopImport(record),
    message: 'packages/layout must not import the desktop app',
  },
  {
    id: 'pdf/no-renderer',
    zones: ['pdf'],
    matches: (record) => isUnder(record.target, 'apps/desktop/src/renderer'),
    message: 'packages/pdf must not import the desktop renderer',
  },
  {
    id: 'pdf/no-react',
    zones: ['pdf'],
    matches: (record) => isReactSpecifier(record.specifier),
    message: 'packages/pdf must stay React-free',
  },
  {
    id: 'pdf/no-electron',
    zones: ['pdf'],
    matches: (record) => isElectron(record.specifier),
    message: 'packages/pdf must stay Electron-free',
  },
  {
    id: 'packages/no-desktop',
    zones: PACKAGE_ZONES,
    matches: (record) => isDesktopImport(record),
    message: 'packages must not depend on apps/desktop (no reverse dependency)',
  },
]);

/**
 * Exact, documented exceptions. Every entry needs a reason and is matched on
 * rule id + file + import specifier. Unused entries are reported as violations.
 *
 * Example:
 *   {
 *     rule: 'core/no-node-fs',
 *     file: 'packages/core/src/example.ts',
 *     import: 'node:fs',
 *     reason: 'temporary bridge while the Node adapter moves; remove after M3i',
 *   },
 */
export const BOUNDARY_ALLOW_LIST = Object.freeze([]);

function scriptKindFor(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.mts')) return ts.ScriptKind.MTS;
  if (file.endsWith('.cts')) return ts.ScriptKind.CTS;
  return ts.ScriptKind.TS;
}

function zoneOf(file) {
  const resolved = ZONE_PREFIXES.filter(([, prefix]) => file.startsWith(prefix)).sort(
    (left, right) => right[1].length - left[1].length,
  );
  return resolved[0]?.[0] ?? null;
}

function resolveSpecifier(file, specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const relative = specifier.startsWith('/') ? specifier.slice(1) : specifier;
    return {
      target: path.posix.normalize(path.posix.join(path.posix.dirname(file), relative)),
      packageName: null,
    };
  }
  for (const [alias, target] of PACKAGE_ALIASES) {
    if (specifier === alias) return { target, packageName: null };
    if (specifier.startsWith(`${alias}/`)) {
      return { target: `${target}${specifier.slice(alias.length)}`, packageName: null };
    }
  }
  return { target: null, packageName: packageNameOf(specifier) };
}

function extractImports(file, source) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(file),
  );
  const imports = [];

  function addSpecifier(node, kind) {
    if (!node || !ts.isStringLiteralLike(node)) return;
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    imports.push({
      specifier: node.text,
      kind,
      line: position.line + 1,
      column: position.character + 1,
    });
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addSpecifier(node.moduleSpecifier, 'static');
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addSpecifier(node.moduleReference.expression, 'import-equals');
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addSpecifier(node.arguments[0], 'dynamic-import');
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        addSpecifier(node.arguments[0], 'require');
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addSpecifier(node.argument.literal, 'import-type');
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

function collectSourceFile(absoluteDirectory, relativeDirectory, files) {
  let entries;
  try {
    entries = readdirSync(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const relative = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) {
        collectSourceFile(path.join(absoluteDirectory, entry.name), relative, files);
      }
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(relative);
    }
  }
}

function collectSourceFiles(root) {
  const files = [];
  for (const scanRoot of SCAN_ROOTS) {
    collectSourceFile(path.join(root, ...scanRoot.split('/')), scanRoot, files);
  }
  return files.sort();
}

function compareViolations(left, right) {
  return (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.column - right.column ||
    left.rule.localeCompare(right.rule)
  );
}

function formatViolation(violation) {
  if (violation.rule === 'allow-list/unused') {
    return [
      `  ${violation.file}`,
      `    unused allow-list entry for import "${violation.specifier}"`,
      `    ${violation.message}`,
    ].join('\n');
  }
  return [
    `  ${violation.file}:${violation.line}:${violation.column}`,
    `    import "${violation.specifier}" is forbidden [${violation.rule}]`,
    `    ${violation.message}`,
  ].join('\n');
}

/**
 * @typedef {{ rule: string, file: string, import: string, reason: string }} AllowListEntry
 * @typedef {{ rule: string, file: string, specifier: string, line: number, column: number, message: string }} BoundaryViolation
 */

/**
 * Runs the boundary check against a repository root.
 * @param {{ root?: string, allowList?: ReadonlyArray<AllowListEntry> }} [options]
 * @returns {{ filesScanned: number, importsScanned: number, rulesChecked: number, violations: BoundaryViolation[] }}
 */
export function checkBoundaries({ root = REPO_ROOT, allowList = BOUNDARY_ALLOW_LIST } = {}) {
  if (!existsSync(root)) throw new Error(`boundary check root does not exist: ${root}`);
  for (const entry of allowList) {
    if (!entry.reason) {
      throw new Error(`boundary allow-list entry for ${entry.file} is missing a reason`);
    }
  }

  const files = collectSourceFiles(root);
  if (files.length === 0) throw new Error(`no TypeScript sources found under ${root}`);
  const usedAllowList = new Set();
  const violations = [];
  let importsScanned = 0;

  for (const file of files) {
    const zone = zoneOf(file);
    if (!zone) continue;
    const source = readFileSync(path.join(root, ...file.split('/')), 'utf8');
    for (const found of extractImports(file, source)) {
      importsScanned += 1;
      const record = { ...found, file, ...resolveSpecifier(file, found.specifier) };
      const rule = BOUNDARY_RULES.find(
        (candidate) => candidate.zones.includes(zone) && candidate.matches(record),
      );
      if (!rule) continue;
      const exception = allowList.find(
        (entry) =>
          entry.rule === rule.id && entry.file === file && entry.import === record.specifier,
      );
      if (exception) {
        usedAllowList.add(exception);
        continue;
      }
      violations.push({
        rule: rule.id,
        file,
        specifier: record.specifier,
        line: record.line,
        column: record.column,
        message: rule.message,
      });
    }
  }

  for (const entry of allowList) {
    if (!usedAllowList.has(entry)) {
      violations.push({
        rule: 'allow-list/unused',
        file: entry.file,
        specifier: entry.import,
        line: 0,
        column: 0,
        message: `allow-list entry is unused: ${entry.reason}`,
      });
    }
  }

  violations.sort(compareViolations);
  return {
    filesScanned: files.length,
    importsScanned,
    rulesChecked: BOUNDARY_RULES.length,
    violations,
  };
}

function printResult(result) {
  if (result.violations.length === 0) {
    console.log(
      `✔ architecture boundaries: ${result.filesScanned} files, ${result.importsScanned} imports, ${result.rulesChecked} rules`,
    );
    return;
  }
  const label = result.violations.length === 1 ? 'violation' : 'violations';
  console.error(
    `✖ architecture boundaries: ${result.violations.length} ${label} in ${result.filesScanned} files`,
  );
  for (const violation of result.violations) console.error(formatViolation(violation));
  console.error(
    '\nFix the dependency direction, or add an exact { rule, file, import, reason } entry to BOUNDARY_ALLOW_LIST in scripts/check-boundaries.mjs.',
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const rootIndex = process.argv.indexOf('--root');
  const root = rootIndex >= 0 ? process.argv[rootIndex + 1] : REPO_ROOT;
  if (root === undefined) {
    console.error('Usage: node scripts/check-boundaries.mjs [--root <repository-root>]');
    process.exitCode = 2;
  } else {
    try {
      const result = checkBoundaries({ root });
      printResult(result);
      if (result.violations.length > 0) process.exitCode = 1;
    } catch (error) {
      console.error(`✖ architecture boundaries: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 2;
    }
  }
}
