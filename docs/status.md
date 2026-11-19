# Status

**Release:** 0.1.2, 19 November 2026.

- Tag `v0.1.2` at `2f4b3a9`; dmg `dist/NoteForest-0.1.2-arm64.dmg`.
- Install: NoteForest was running when the dmg was built; quit it and run `npm run install:local`
  (or install the dmg) to replace `/Applications/NoteForest.app`.
- Distribution: local unsigned build, ad-hoc signed by the `afterPack` hook. No Developer ID, no
  notarization, no auto-update.
- Repo: public on GitHub, MIT. Bundle id `com.github.luk3luca.noteforest`.
- Verified at release: full `npm run verify` green — 184 unit files / 1,930 tests, e2e 16,
  recovery 14, UI 71/71 at concurrency 4 (364.6 s).
- Shipped: long inline-formula card growth, the visual-line/atom arrow boundary, Page selection ink,
  and the Library header refresh.
- Open gate: the product owner's visual, VoiceOver and PDF pass on the installed app.

## 0.1.1 — 19 November 2026

**Release:** 0.1.1, 19 November 2026.

- Tag `v0.1.1` at `c2bdf55`; dmg `dist/NoteForest-0.1.1-arm64.dmg`.
- Install: NoteForest was running when the dmg was built; quit it and run `npm run install:local`
  (or install the dmg) to replace `/Applications/NoteForest.app`.
- Distribution: local unsigned build, ad-hoc signed by the `afterPack` hook. No Developer ID, no
  notarization, no auto-update.
- Repo: public on GitHub, MIT. Bundle id `com.github.luk3luca.noteforest`.
- Verified at release: full `npm run verify` green — 183 unit files / 1,909 tests, e2e 16,
  recovery 14, UI 71/71 at concurrency 4.
- Shipped: anchor resolution index, three Page vertical gaps, table-cell marks/formulas with GFM
  round-trip, heading and formula toggles, HTML math paste.
- Two legacy UI assertions were updated at integration: the stacked callout lane (38) and the guest
  `.md` heading marker strip. Test-only; the product behavior is the ratified one.
- Open gate: the product owner's visual, VoiceOver and PDF pass on the installed app.

## 0.1.0 — 18 November 2026

**Release:** 0.1.0, 18 November 2026.

- Tag `v0.1.0` at `00a6e6c`; packaging, icon and dev-isolation commits follow it on `main`.
- dmg: `dist/NoteForest-0.1.0-arm64.dmg`, installed at `/Applications/NoteForest.app`.
- Distribution: local unsigned build, ad-hoc signed by the `afterPack` hook. No Developer ID, no
  notarization, no auto-update.
- Repo: public on GitHub, MIT. Bundle id `com.github.luk3luca.noteforest`.

**Verified at release:** full `npm run verify` green — 171 unit files / 1,756 tests, e2e 16,
recovery 14, UI 69/69 at concurrency 4. The packaged smoke opened a fixture, rendered Page Read,
and exported a 2-page PDF with real text and no missing glyphs.

**Post-release (18 November 2026):** the command-surface refactor is merged (`fba93d4`): one command
manifest, four adapters, one owner per chord, the 120 ms throttle gone. Full verify green — 174 unit
files / 1,795 tests, e2e 16, UI **70/70** at concurrency 4. The workspace versions and the lockfile were
synced (`11591b1`); a clean `npm ci` from a fresh archive now installs and typechecks.

**Test-surface extraction (18 November 2026):** the `window.__noteforestTest` bridge moved from
`App.tsx` to `renderer/src/test-surface.ts` (`826ced1`); `App.tsx` is 391 lines, the interface is
unchanged and all 70 UI suites pass. Full verify green.

**Dependency audit (18 November 2026):** 6 moderate advisories, all in electron-builder's build
toolchain (`@electron/universal`, `app-builder-lib`, `dmg-builder`, `minimatch`); `npm audit
--omit=dev` is clean. Upgrade electron-builder with the next packaging change.

**Open gate:** the product owner's visual, VoiceOver and PDF pass on the installed app, plus the manual
chord pass for the command surface (menu open, after refocusing).

**Dev isolation:** `npm run dev` uses the "NoteForest Dev" app-support folder and library, so dev
work never touches the installed app's data.

**Distribution note:** a downloaded dmg needs right-click → Open on another Mac. Publishing signed
binaries or auto-update would need a Developer ID (paid), which is not planned.
