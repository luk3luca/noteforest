# M4b1c1 — page measurement image preload regression

**Role:** Implementer / Builder  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-2c6a9337`  
**Branch:** `t3/m4b1c1-page-image-preload`  
**Base:** `354c3e3` (`docs: fix page measurement image preload 404`, on `cdd7d95` M4b1c merge)  
**Implementation commit:** `e2aeb41`  
**Report commit:** branch head after this file (docs only)  
**Status:** implementation, tests, and all required gates complete; not merged, not pushed

## Summary

The page measurement host no longer requests asset bytes it does not need. The shared page model
(M4b1c) runs for every open document in Continuous; before this fix it preloaded every available
asset URL and also emitted `src` for every image while settling and measuring. A debounced model run
that started while the app was closing then hit the already-closed asset store and logged
`Failed to load resource: … 404`.

Two changes close the regression:

1. `preloadImages` preloads only image nodes that carry an `assetId` and lack a positive `width` or
   `height`. An image with both node attributes renders those attributes, and the replaced element's
   box is fully determined by them, so fetching bytes cannot change the measurement.
2. Measurement markup omits `src` for those same dimensioned images (`requestIntrinsicImages:
   false`). Measurement still renders the identical card `<img>` with `width`/`height`/`alt`/
   `data-asset-id`, but does not start a request during settle, intrinsic, or fixed measurement.
   Page Read rendering is unchanged.

No Page Edit, marker, PDF, image-pipeline, spec, UX, ADR, or plan change. No new dependency.

## Preload set

`imageAssetIdsToPreload(blocks, assetUrls)` walks every content node recursively (paragraph, list,
table cell, blockquote, nested layouts) and returns deduplicated asset ids in document order when:

- `node.type === 'image'`;
- the node has a non-empty `assetId`;
- the node's `width` or `height` is missing, non-numeric, not finite, zero, or negative;
- the id has a non-empty display URL in the resolved asset map.

Consequences:

- image with `width: 640, height: 360` → **no preload** and **no measurement request**;
- image with only `width` or only `height`, or with zero/negative dimensions → **preloaded and
  decoded**, because its rendered aspect ratio depends on the intrinsic image;
- image without `assetId` → never preloaded; it renders the existing missing/unsupported placeholder;
- missing/changed assets are already excluded from `assetUrlsFor`, so they stay placeholders and are
  never requested;
- duplicate references to the same asset are decoded once.

The asset record's `width`/`height` are intentionally not used for the decision: `segments.ts`
renders the **node** attributes, so an asset-only dimension would not reach the HTML and skipping the
preload would depend on an unloaded image's intrinsic size. Those images still preload, preserving
measurement correctness (the brief's stop condition does not apply).

`failedAssetIds`/placeholder behavior is unchanged for every preloaded image: load error or decode
failure still adds the id, deletes the display URL, and Page Read renders the placeholder.

## Abort behavior

`preloadImages` now:

- checks `throwIfAborted` on entry and `isAborted` again before every `img` creation/`src`
  assignment, and after the loop before attaching the wrapper;
- registers an `abort` listener that immediately removes the measurement host and resolves the wait;
- races the image promises against that abort promise and the 4 s image timeout, so an abort returns
  without waiting for the timeout;
- removes the listener in `finally` and leaves `dispose()` safe if it removes the host while a
  preload is still in flight (DOM operations on a detached host are no-ops for requests already
  started; no new `src` is set after abort).

An abort can still only prevent *new* requests; a request already handed to Chromium cannot be
cancelled by this code.

## Why measurement markup also changed

The preload-set restriction alone was not sufficient. After the first implementation, the
m3c3b1 suite still recorded one 404. Instrumentation showed the sequence:

```text
quit starts
  -> a debounced page-model run fires 217 ms later (React does not unmount on app quit)
  -> prepare renders the settle cards
  -> the dimensioned image's <img src=asset> starts a request after the store closed
  -> 404
```

The settle pass, intrinsic measurement, and fixed measurement all emitted `src` for that image, even
though its box came from `width`/`height`. `SegmentOptions.requestIntrinsicImages: false` (set only by
the measurement host's `optionsFor`) omits those `src` attributes. The markup keeps the same
attributes and placeholder semantics. A manual DOM probe confirmed the box is identical:

| Image form | 500 px host, 640×360 attrs | Used size |
|---|---|---|
| `src` omitted | yes | 420 × 236.25 |
| broken `src` | yes | 420 × 236.25 |
| width only, no source | yes | 420 × 20.30 (alt text) |

So a dimensioned image measures exactly as before without any fetch; a width-only image still needs
the preload and keeps its source.

## Before/after pageErrors

Suites were run with the same build flow. Each suite's `after` hook asserts `pageErrors` is empty.

| Suite | Before | After |
|---|---|---|
| `tests/ui/m3c3b1-image.test.mjs` | 1 × `Failed to load resource: the server responded with a status of 404 (Not Found)` | 0 |
| `tests/ui/m3c3b2-image-anchors.test.mjs` | 0 | 0 |
| `tests/ui/m3c3b3-image-integrity.test.mjs` | 0 (the deliberate protocol probe 404 is spliced out by the test) | 0 |
| `tests/ui/m3c3b4-image-lifecycle.test.mjs` | 1 × `Failed to load resource: the server responded with a status of 404 (Not Found)` | 0 |
| `tests/ui/m4b1c-continuous-markers.test.mjs` | not captured before the fix | 0 |

The known Node test-runner harness issue reproduced before the fix: a failing `after` hook reports
`failureType: 'hookFailed'` but the process still exits 0 and `# fail` stays 0. The harness was not
changed in this slice.

After the fix, the full `npm run test:ui` log contains **0** `hookFailed`, **0** `renderer errors`,
and all 22 suites pass.

## Tests and timings

| Check | Result |
|---|---|
| `npm run check:boundaries` | 140 files, 660 imports, 16 rules, pass |
| `npm run typecheck` | desktop node+web, core, layout, pdf: pass |
| Targeted vitest (`page-image-preload`, `page-segments`, `page-model`, `page-markers`) | 4 files / 20 tests / 154 ms |
| `npm test` | 77 files / 773 tests / 2.34 s, pass |
| `npm run test:ui` | 22/22 suites, 0 hook failures, 0 renderer errors |
| `npm run test:recovery:run` | 14 tests / 17.9 s, pass |
| `npm run e2e:critical` | 16 tests / 44.3 s, pass |
| `npm run verify:fast` (final) | boundary + typecheck + 773 unit + build + 16 critical e2e, exit 0 |

UI suite durations from the full `test:ui` run:

| Suite | Duration |
|---|---|
| m3c3b1 image pipeline | 6.57 s |
| m3c3b2 image anchors | 10.27 s |
| m3c3b3 image integrity | 10.78 s |
| m3c3b4 image lifecycle | 14.99 s |
| m4b1 page view core | 6.50 s |
| m4b1c continuous markers | 6.53 s |

New test: `apps/desktop/test/page-image-preload.test.ts` (5 tests):

- an image with both intrinsic dimensions produces an empty preload set;
- only missing/zero dimensions are preloaded (unknown, width-only, height-only, zero height);
- no `assetId`, no URL, and unknown asset ids are excluded;
- nested table/paragraph images are found and duplicate references dedupe;
- measurement markup drops `src` for a dimensioned image while keeping width/height and the same
  attributes; Page Read (option unset) keeps `src`; a width-only image keeps `src`.

The six image-related UI suites above are the end-to-end evidence: their `after` hooks are green.

## Files changed

- `apps/desktop/src/renderer/src/page/measurement.ts`
  — `imageAssetIdsToPreload`, restricted preload, abort gate/listener, measurement-only image option.
- `apps/desktop/src/renderer/src/page/segments.ts`
  — optional `requestIntrinsicImages`; only the measurement host sets it to `false`.
- `apps/desktop/test/page-image-preload.test.ts`
  — focused preload-set and measurement-markup tests.
- `docs/reports/m4b1c1-page-image-preload.md` — this report.

## Risks / open questions

- **Asset-only dimensions are not used.** A node without width/height whose asset record has both is
  still preloaded. This is deliberate (the HTML has no dimensions to render), but it is a redundant
  decode for a legacy/hand-edited package that could later be optimized by projecting asset
  dimensions into the page markup.
- **Known-dimension images are no longer probed by the preload.** If an asset passes the availability
  check but fails at render time, Page Read can show a broken image instead of the preload-derived
  placeholder. Missing/changed assets detected by availability still render placeholders; this only
  affects a late protocol failure between the check and the browser request.
- **Quit still starts a debounced model run.** React does not unmount on app quit, so the last
  revision's timer can fire after the store closes. For dimensioned images it is now harmless (no
  request). A page model containing an image without dimensions could still start a preload after the
  store closes; an app-lifecycle abort (for example a `pagehide`/quit signal into `usePageModel`)
  would close that gap but is outside this slice.
- **Abort does not cancel in-flight requests** started before the signal. It only guarantees no new
  `img.src` is set after abort and no timeout wait.
- **Measurement markup is now request-free for dimensioned images**, so a future change to the page
  CSS that makes `height: auto` depend on the decoded resource (it does not today) would need a new
  measurement strategy. The DOM probe above and the m4b1 page-view image test cover the current
  behavior.
- **`after` hook failures can still exit 0.** The known harness issue was observed and left
  untouched, per the brief; green `pageErrors` were verified by reading the log, not only the exit
  code.

## Not verified

- PDF / `printToPDF` / print compositor and exact Page/PDF image parity (M4c).
- Page Edit (not implemented) and any marker-geometry change (untouched; m4b1c suite is green).
- A real document whose image node has no dimensions but whose asset record does; behavior is
  unchanged (still preloads), but no dedicated UI fixture was added.
- Product-owner visual/VoiceOver pass; no new screenshots were taken because the rendered Page Read
  markup is unchanged.
- 1,000-block page-model performance and memory.
- The m4b1c suite's pre-fix pageErrors baseline was not captured in this worktree.

## Next suggested step

Sentinel review against the M4b1c1 brief, then merge `t3/m4b1c1-page-image-preload` and continue with
M4c (PDF/print compositor over the same shared page model).
