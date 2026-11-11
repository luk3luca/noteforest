import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';

/**
 * UI suite runner.
 *
 * The UI suites each launch Electron. Running them one `node --test` process at
 * a time made the full verify dominated by process/app startup, not assertions.
 * This runner keeps one process per file (test isolation) but runs a small pool
 * in parallel, supports surface groups for quick loops, and prints one line per
 * suite instead of the full TAP stream.
 *
 * Usage:
 *   node tests/ui/run.mjs
 *   node tests/ui/run.mjs --group core
 *   node tests/ui/run.mjs --group shell,settings --concurrency 2
 *   node tests/ui/run.mjs --list
 */

const root = resolve(import.meta.dirname, '../..');
const timeoutMs = Number(process.env.NOTEFOREST_UI_TIMEOUT_MS ?? 10 * 60 * 1000);
// Two cores are left for the browser/OS; the measured curve flattens after 8.
const defaultConcurrency = Math.max(1, Math.min(8, availableParallelism() - 2));

const FILES = [
  'm2-view.test.mjs',
  'm2-shell.test.mjs',
  'v0-shell-frame.test.mjs',
  'm3-anchor-callout-layout.test.mjs',
  'm3-anchor-callout-stacking.test.mjs',
  'm3-anchor-callout-placement-undo.test.mjs',
  'm3-anchor-outline.test.mjs',
  'm3-formula-anchor.test.mjs',
  'm3-formula-term.test.mjs',
  'm3-formula-term-geometry.test.mjs',
  'm3-code-anchor.test.mjs',
  'm3-reference.test.mjs',
  'm3-repair.test.mjs',
  'm3f1-split-merge.test.mjs',
  'm3h3-live-health.test.mjs',
  'm3h5-leaf-delete.test.mjs',
  'm3c3b1-image.test.mjs',
  'm3c3b2-image-anchors.test.mjs',
  'm3c3b3-image-integrity.test.mjs',
  'm3c3b4-image-lifecycle.test.mjs',
  'm4b1-page-view.test.mjs',
  'm4b1a2-read-mode-gating.test.mjs',
  'm4b1b1-page-edit-overlay.test.mjs',
  'r1b-page-settings.test.mjs',
  'r2a-page-arrows-cleanup.test.mjs',
  'r2b-page-packing.test.mjs',
  'r2e-page-tree.test.mjs',
  'r2d-page-edge-style.test.mjs',
  'r2f-page-edge-topology.test.mjs',
  'r2g-page-trunk-continuity.test.mjs',
  'r2i-page-subtree-wrap.test.mjs',
  'r2j-page-callout-modes.test.mjs',
  'm4c1-print-compositor.test.mjs',
  'm4c2-pdf-export.test.mjs',
  'm4c3-pdf-gate.test.mjs',
  'm4c3-packaged-export.test.mjs',
  'm4d2-export-ui.test.mjs',
  'm4d1-page-density.test.mjs',
  'm4e1-settings-platform.test.mjs',
  'ui-batch-a.test.mjs',
  'ui-batch-b.test.mjs',
  'ui-settings-advanced.test.mjs',
  'ui-batch-v.test.mjs',
];

const GROUPS = {
  shell: [
    'm2-view.test.mjs',
    'm2-shell.test.mjs',
    'v0-shell-frame.test.mjs',
    'ui-batch-a.test.mjs',
    'ui-batch-v.test.mjs',
  ],
  settings: [
    'm4e1-settings-platform.test.mjs',
    'm4d1-page-density.test.mjs',
    'r1b-page-settings.test.mjs',
    'ui-batch-b.test.mjs',
    'ui-settings-advanced.test.mjs',
  ],
  anchors: [
    'm3-anchor-callout-layout.test.mjs',
    'm3-anchor-callout-stacking.test.mjs',
    'm3-anchor-callout-placement-undo.test.mjs',
    'm3-anchor-outline.test.mjs',
    'm3-formula-anchor.test.mjs',
    'm3-formula-term.test.mjs',
    'm3-formula-term-geometry.test.mjs',
    'm3-code-anchor.test.mjs',
    'm3-reference.test.mjs',
    'm3-repair.test.mjs',
    'm3f1-split-merge.test.mjs',
    'm3h3-live-health.test.mjs',
    'm3h5-leaf-delete.test.mjs',
  ],
  images: [
    'm3c3b1-image.test.mjs',
    'm3c3b2-image-anchors.test.mjs',
    'm3c3b3-image-integrity.test.mjs',
    'm3c3b4-image-lifecycle.test.mjs',
  ],
  page: [
    'm4b1-page-view.test.mjs',
    'm4b1a2-read-mode-gating.test.mjs',
    'm4b1b1-page-edit-overlay.test.mjs',
    'r2a-page-arrows-cleanup.test.mjs',
    'r2b-page-packing.test.mjs',
    'r2e-page-tree.test.mjs',
    'r2d-page-edge-style.test.mjs',
    'r2f-page-edge-topology.test.mjs',
    'r2g-page-trunk-continuity.test.mjs',
    'r2i-page-subtree-wrap.test.mjs',
    'r2j-page-callout-modes.test.mjs',
    'm4c1-print-compositor.test.mjs',
    'm4c2-pdf-export.test.mjs',
    'm4c3-pdf-gate.test.mjs',
    'm4c3-packaged-export.test.mjs',
    'm4d2-export-ui.test.mjs',
  ],
};

GROUPS.all = FILES;
GROUPS.core = unique([...GROUPS.shell, ...GROUPS.settings]);

function unique(values) {
  return [...new Set(values)];
}

function parseArgs(argv) {
  const options = {
    groups: ['all'],
    concurrency: Number(process.env.NOTEFOREST_UI_CONCURRENCY ?? defaultConcurrency),
    failFast: false,
    verbose: false,
    list: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--group' || arg === '-g') {
      options.groups = (argv[index + 1] ?? 'all').split(',').map((value) => value.trim());
      index += 1;
    } else if (arg === '--concurrency' || arg === '-c') {
      options.concurrency = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--fail-fast') {
      options.failFast = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(options.concurrency) || options.concurrency < 1) {
    throw new Error('concurrency must be a positive integer');
  }
  options.concurrency = Math.min(Math.floor(options.concurrency), 8);
  return options;
}

function selectedFiles(groups) {
  const files = [];
  for (const group of groups) {
    const groupFiles = GROUPS[group];
    if (groupFiles === undefined) {
      throw new Error(`unknown group "${group}"; choose ${Object.keys(GROUPS).join(', ')}`);
    }
    for (const file of groupFiles) {
      if (!files.includes(file)) files.push(file);
    }
  }
  return files;
}

function runOne(file) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    const child = spawn(process.execPath, ['--test', `tests/ui/${file}`], {
      cwd: root,
      env: { ...process.env, NOTEFOREST_UI_RUNNER: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = [];
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (data) => output.push(data));
    child.stderr.on('data', (data) => output.push(data));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolveRun({ file, code: 1, output: `${error.message}\n`, durationMs: Date.now() - started });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolveRun({
        file,
        code: code ?? 1,
        signal,
        output: Buffer.concat(output).toString('utf8'),
        durationMs: Date.now() - started,
      });
    });
  });
}

function printHelp() {
  console.log(`UI suite runner

  node tests/ui/run.mjs [--group all|core|shell|settings|page|anchors|images]
                       [--concurrency 1..8] [--fail-fast] [--verbose] [--list]

Groups overlap by surface; "all" is the unique full list. The runner builds
nothing: run "npm run build" first (test:ui does it).`);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}
if (options.list) {
  for (const [group, files] of Object.entries(GROUPS)) {
    console.log(`${group}: ${files.length}`);
    for (const file of files) console.log(`  ${file}`);
  }
  process.exit(0);
}

const files = selectedFiles(options.groups);
if (files.length === 0) {
  console.error('No UI suites selected.');
  process.exit(1);
}

console.log(
  `UI suites: ${files.length} file(s), groups=${options.groups.join(',')}, concurrency=${options.concurrency}`,
);

let next = 0;
let failed = false;
let passed = 0;
const results = [];
const started = Date.now();

async function worker() {
  while (next < files.length) {
    if (failed && options.failFast) return;
    const file = files[next];
    next += 1;
    const result = await runOne(file);
    results.push(result);
    const seconds = (result.durationMs / 1000).toFixed(1);
    if (result.code === 0) {
      passed += 1;
      console.log(`PASS ${file} (${seconds}s)`);
      if (options.verbose) process.stdout.write(result.output);
    } else {
      failed = true;
      const reason = result.signal === undefined ? `exit ${result.code}` : `signal ${result.signal}`;
      console.log(`FAIL ${file} (${seconds}s, ${reason})`);
      process.stdout.write(result.output);
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(options.concurrency, files.length) }, () => worker()),
);

const failedResults = results.filter((result) => result.code !== 0);
const totalSeconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `UI suites: ${passed}/${files.length} passed, ${failedResults.length} failed, ${totalSeconds}s total`,
);
if (failedResults.length > 0) process.exitCode = 1;
