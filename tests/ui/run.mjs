import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { formatSuiteResult, GROUPS, SERIAL_FILES } from './suites.mjs';

/**
 * UI suite runner.
 *
 * The UI suites each launch Electron. Running them one `node --test` process at
 * a time made the full verify dominated by process/app startup, not assertions.
 * This runner keeps one process per file (test isolation) but runs a small pool
 * in parallel, supports surface groups for quick loops, and prints one line per
 * suite instead of the full TAP stream.
 *
 * The suite list lives in `suites.mjs` (pure data) so a meta-test can prove it
 * equals `tests/ui/*.test.mjs` exactly.
 *
 * Usage:
 *   node tests/ui/run.mjs
 *   node tests/ui/run.mjs --group core
 *   node tests/ui/run.mjs --group shell,settings --concurrency 2
 *   node tests/ui/run.mjs --list
 */

const root = resolve(import.meta.dirname, '../..');
const timeoutMs = Number(process.env.NOTEFOREST_UI_TIMEOUT_MS ?? 10 * 60 * 1000);
// Encode the concurrency that was fully green on the 10-core dev machine
// (14 Nov 2026). The machine default (8 = cores - 2) times out; DoD §3.5 names
// the measured gate parameter. Override with NOTEFOREST_UI_CONCURRENCY.
const defaultConcurrency = 4;

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
    const detached = process.platform !== 'win32';
    const child = spawn(process.execPath, ['--test', `tests/ui/${file}`], {
      cwd: root,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      // A suite owns a process group so a timeout can kill Electron children,
      // not just the node --test parent. A leaked app keeps its userData
      // single-instance lock and makes the next run of the same suite hang.
      detached,
    });
    const output = [];
    let timedOut = false;
    const killTree = () => {
      if (detached) {
        try {
          process.kill(-(child.pid ?? 0), 'SIGKILL');
          return;
        } catch {
          // Fall through to the direct child kill.
        }
      }
      try {
        child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);
    child.stdout.on('data', (data) => output.push(data));
    child.stderr.on('data', (data) => output.push(data));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolveRun({
        file,
        code: 1,
        timedOut,
        timeoutMs,
        output: `${error.message}\n`,
        durationMs: Date.now() - started,
      });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      // A suite that exits normally should have closed its Electron apps; kill
      // any descendant left behind so the next run never inherits a stale lock.
      killTree();
      resolveRun({
        file,
        // A killed child reports a null code; the timeout is still a failure.
        code: timedOut ? 1 : code ?? 1,
        signal,
        timedOut,
        timeoutMs,
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

const parallelFiles = files.filter((file) => !SERIAL_FILES.has(file));
const serialFiles = files.filter((file) => SERIAL_FILES.has(file));
if (serialFiles.length > 0) {
  console.log(
    `UI serial: ${serialFiles.length} suite(s) after the pool (${serialFiles.join(', ')})`,
  );
}

let next = 0;
let failed = false;
let passed = 0;
const results = [];
const started = Date.now();

async function runFile(file) {
  const result = await runOne(file);
  results.push(result);
  console.log(formatSuiteResult(result));
  if (result.code === 0) {
    passed += 1;
    if (options.verbose) process.stdout.write(result.output);
  } else {
    failed = true;
    process.stdout.write(result.output);
  }
  return result;
}

async function worker() {
  while (next < parallelFiles.length) {
    if (failed && options.failFast) return;
    const file = parallelFiles[next];
    next += 1;
    await runFile(file);
  }
}

await Promise.all(
  Array.from(
    { length: Math.min(options.concurrency, parallelFiles.length) },
    () => worker(),
  ),
);

for (const file of serialFiles) {
  if (failed && options.failFast) break;
  await runFile(file);
}

const failedResults = results.filter((result) => result.code !== 0);
const totalSeconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `UI suites: ${passed}/${files.length} passed, ${failedResults.length} failed, ${totalSeconds}s total`,
);
if (failedResults.length > 0) process.exitCode = 1;
