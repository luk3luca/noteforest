# UI test suite runner

`node tests/ui/run.mjs` runs the UI files with one `node --test` process per file
through a small worker pool. It does not build; `npm run test:ui` builds first.

```bash
npm run test:ui                 # build + all suites in tests/ui/suites.mjs
npm run test:ui:core            # shell + settings only (quick loop)
npm run test:ui:shell
npm run test:ui:settings
npm run test:ui:page            # Page/PDF/export/edge suites
npm run test:ui:anchors
npm run test:ui:images
node tests/ui/run.mjs --group core --concurrency 2
node tests/ui/run.mjs --list
```

`verify` now runs `verify:fast`, recovery, then the runner once; it no longer
repeats the per-file command chain in two package scripts. `verify:ui:core` is
the same chain limited to the shell + settings groups.

The suite list and groups live in `tests/ui/suites.mjs` (pure data, imported by
`run.mjs`). `apps/desktop/test/ui-suite-list.test.ts` asserts that list equals
`tests/ui/*.test.mjs` exactly, so adding or removing a suite without updating
`suites.mjs` fails the unit gate.

Each suite owns one evidence directory (`artifacts/ui-batch-a`,
`artifacts/m4e1-settings`, `artifacts/m4d1-page-density`,
`artifacts/m4d2-export-ui`, ...). A `before` hook only deletes its own temp,
output, and screenshot directories, so a parallel run cannot remove another
suite's screenshots.

## Why

Each UI file launches Electron. Before this runner the 43 files ran as a
sequential `&&` chain of 43 `node --test` processes, so the full verify was
dominated by process/app startup. The runner keeps file isolation but runs the
files in a pool, offers surface groups for quick loops, prints one summary line
per suite, and dumps the full TAP output only for a failing suite.

Measured on this 10-core Mac, same build, 43/43 green at every level:

| Workers | UI wall time |
|---:|---:|
| 1 (sequential) | 574.8 s |
| 2 | 292.5 s |
| 3 | 208.3 s |
| 4 | 154.4 s |
| 6 | 119.4 s |
| 8 (default here) | 96.9 s |

The per-file durations shown by the runner are wall time, not just test-body
time; the old chain was ~570 s for the same work. `npm run verify` now takes
about **2.5 min** instead of ~10.5 min on this machine.

The full verify measurements that motivated this (Batch V):

| Part | Time |
|---|---:|
| unit (`vitest`) | ~2.7 s |
| e2e | ~36–44 s |
| recovery | ~18 s |
| UI suites, sequential | ~575 s |
| UI suites, default pool | ~97 s |

The top UI files were Batch V (16.8 s), M3c3b4 (14.8 s), M4c3 (12.7 s),
Batch C (11.0 s), M3c3b3 (10.7 s), Batch A (10.5 s), Batch B (10.3 s),
M4d1 density (10.2 s), and M4d2 export (10.1 s).

## Overlap audit (do not delete without a coverage matrix)

These are **setup/launch overlaps**, not necessarily duplicate assertions. Each
file still has unique behavior coverage; the long-term consolidation candidate
is to share one app/session per surface and move assertions into subtests.

| Surface | Files | Overlap / unique coverage |
|---|---|---|
| Shell | `v0-shell-frame`, `m2-shell`, `m2-view`, `ui-batch-a`, `ui-batch-v` | Titlebar/rail/status (V0), tab ARIA/scroll restore (m2-shell), zoom/fit (m2-view), C header/settings/palette (Batch A), Settings width/toast/tab stress/inset (Batch V). |
| Settings | `m4e1-settings-platform`, `m4d1-page-density`, `r1b-page-settings`, `ui-batch-b`, `ui-settings-advanced`, `ui-editor-shortcuts` | No-document/corrupt/failed write (m4e1), real-DOM density (m4d1), Page setup/override/read-only (r1b/B), advanced typography/layout (C), Editor shortcut search + native Help command + overlay gate (`ui-editor-shortcuts`). |
| Page/edges | `r2a`, `r2b`, `r2e`, `r2d`, `r2f`, `r2g`, `r2i`, `r2j` | Distinct geometry/edge/callout assertions on the same Page surface; best candidate for two shared-app suites. |
| Anchors | 13 `m3*` files | Distinct text/formula/code/reference/repair/outline cases; group by family, not delete. |
| Images | `m3c3b1`–`m3c3b4` | Distinct pipeline, region anchors, integrity, lifecycle; keep separate (high-risk). |
| PDF/export | `m4c1`, `m4c2`, `m4c3`, packaged, `m4d2` | Print parity, job orchestration, 50+ page gate, packaged runtime, export UI; keep separate. |

No suite is removed here: the current overlap is mostly repeated Electron
startup and shared fixtures. A future consolidation should first write a
file → surface/AC matrix and keep every unique assertion.

## Concurrency policy

- Default is `min(8, availableParallelism() - 2)`: 8 workers on this 10-core
  Mac, fewer on smaller machines. Override with `--concurrency N`, the
  `NOTEFOREST_UI_CONCURRENCY` env var, or `--concurrency 1` to bisect a flake.
- Suites use distinct `NOTEFOREST_LIBRARY` / `NOTEFOREST_APP_SUPPORT` roots, so
  there is no shared app-support state. Each file is still one `node --test`
  process; the pool only schedules files.
- The whole matrix above was green at 1, 2, 3, 4, 6, and 8 workers. If a suite
  flakes under load, rerun it with `--concurrency 1` and report the flake; do
  not add retries or fixed sleeps.
- The full verify is still the integration gate; `test:ui:core` is for quick
  loops. A Page/PDF change should run the `page` group plus the affected
  settings/shell suite.
