# Status

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

**Open gate:** the product owner's visual, VoiceOver and PDF pass on the installed app, plus the manual
chord pass for the command surface (menu open, after refocusing).

**Dev isolation:** `npm run dev` uses the "NoteForest Dev" app-support folder and library, so dev
work never touches the installed app's data.

**Distribution note:** a downloaded dmg needs right-click → Open on another Mac. Publishing signed
binaries or auto-update would need a Developer ID (paid), which is not planned.
