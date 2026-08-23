# Porting fork features onto upstream `rawcomposition/birdplan.app`

**Date:** 2026-08-23
**Fork:** `nleiby/birdplan.app` @ `b6a30e0` — 37 feature commits (52 incl. merges), 28 files, +1,870 / −269
**Upstream:** `rawcomposition/birdplan.app` @ `3da94bc` — 246 commits (228 non-merge), 309 files, +19,871 / −13,526
**Common ancestor:** `7497116` "fix: render single day in ItineraryDay instead of mapping all itinerary days" (2026-02-01)

Two questions, answered in order:

1. **[Porting](#part-1--porting)** — what does it take to re-land each fork feature on upstream's current code?
2. **[Upstreaming](#part-2--upstreaming)** — which of those should be offered back to the maintainer, bundled how, and in what order?

Different answers. Some features that are easy to port are bad PRs, because they reverse a decision the maintainer made deliberately. Some that are hard to port are good PRs, because there's no upstream equivalent.

---

# Part 1 — Porting

## Recommendation: yes, start from upstream

Rebasing or merging the fork onto upstream is not viable:

- Upstream migrated **Next.js → Vite + React Router** (`main.tsx`, `router.tsx`, `RootLayout.tsx`; `_app.tsx`/`_document.tsx`/`next.config.js` deleted). Every fork file under `frontend/pages/` uses `next/router`.
- Upstream replaced **React context providers → zustand stores**. The fork's features read from `providers/trip`, `providers/profile`, `providers/hotspot-targets` — all three files are deleted upstream.
- Upstream **removed Firebase entirely** (auth → email OTP + magic links + sessions; storage → Cloudflare R2). `backend/lib/firebaseAdmin.ts`, `frontend/lib/firebase.ts` and every Google/email-password hook are gone.
- Upstream moved to **Tailwind v4 + shadcn/ui** (Base UI, not Radix), dropped `@headlessui`, and added an ESLint rule banning raw palette classes. The fork's UI code uses `@headlessui` `Menu`/`Transition` and literal `text-sky-600`/`bg-amber-50` classes throughout.
- **The targets data model was replaced.** `backend/models/TargetList.ts`, the `TargetList` type, and the bulk `/trips/:tripId/all-hotspot-targets` endpoint are all gone. Targets now come live from the OpenBirding API, per-location on demand, in a new shape.

Of the 28 files the fork touched, 6 no longer exist upstream, and the 22 survivors were substantially rewritten (`TargetRow.tsx` +115/−236, `ItineraryDay.tsx` +273/−123, `targets.tsx` +238/−170, `backend/routes/trips/[tripId]/index.ts` +195/−99, `shared/types.ts` +280/−49). Conflict resolution would mean hand-rewriting each hunk anyway — with none of the safety of doing it deliberately.

**So: reset onto upstream `main` and re-land features one at a time.**

Setup note: `refs/remotes/upstreamlocal/main` has been fetched into this repo from the local upstream clone, so you can diff both trees without leaving the fork:

```
git fetch /Users/nick.leiby/repos/rawcomposition/birdplan.app main:refs/remotes/upstreamlocal/main
git diff 7497116..HEAD -- <path>              # what the fork changed
git show upstreamlocal/main:<path>            # what upstream has now
```

## House rules — apply to every port, not just to PRs

Upstream ships `CLAUDE.md`, `DESIGN.md`, a CI workflow (`npm run lint` + `npm run typecheck` on every push, no test suite), and `.claude/skills/review-pr/SKILL.md` — an automated multi-agent code review fanned out across auth/ownership, security, races, API patterns, shared types, performance, frontend data, React style, error UX, type correctness, and comments, with an adversarial verification pass. That skill is effectively a published rubric.

**Four rules the fork breaks in nearly every file.** These change how each feature gets written, not just how it gets submitted:

| Rule | Where the fork breaks it |
|---|---|
| **No code comments.** "Code should be self-explanatory — do not write code comments." Reserved for upstream-bug hacks, non-obvious regex, undocumented workarounds. Stated in `CLAUDE.md` and repeated three times in the review skill. | Commit `8ce5ffc` *added docstrings as a feature*. `coverage.ts` — the single most-documented file in the fork — `DayImportantTargets.tsx`, `Mapbox.tsx`, and the backend routes are all JSDoc'd. **Strip every comment.** |
| **Prefer derivation, lazy init, and custom hooks over `useEffect`/`useMemo`.** Flagged as a "STRONG project rule" and priority #8 in the review rubric. | `DayImportantTargets` has six `React.useMemo`s; `useFetchSpeciesObs`, `targets.tsx` sorting, and `AddItineraryLocation` add more. Most are cheap derivations that don't need memoizing; the genuinely expensive ones belong in a custom hook. |
| **Trip mutations go through `useTripMutation`** with an `updateCache(old, input)` reducer. Manual `setQueryData` that bypasses it is priority #7. | "Add to itinerary" in `Hotspot.tsx` hand-rolls TanStack `useMutation` with its own `onMutate`/`onError`/`onSettled` optimistic cache. |
| **No raw palette classes** (ESLint guardrail, `e99e922`) — semantic tokens only. | `text-sky-600`, `bg-amber-50/80`, `text-pink-700`, `bg-[#1c6900]`, `text-[#c2410d]` throughout. CI will fail. |

Also: React Query keys are URL-shaped; backend imports need `.js` extensions (NodeNext ESM); protected handlers call `authenticate(c)` explicitly (there is no middleware) and gate ownership with `isTripEditor`; prefer atomic Mongo operators over read-modify-write; and any `shared/types.ts` change is reviewed against both persisted Mongo data and the IndexedDB-persisted React Query cache (`QUERY_CACHE_BUSTER`).

## The one blocker that gates half the work

Six fork features depend on having **every saved hotspot's target list loaded at once**. At the fork point that came free: target lists were stored in Mongo (`TargetList`) and the trip page bulk-loaded them via `/trips/:tripId/all-hotspot-targets` into `providers/hotspot-targets`.

Upstream deleted all of that. Now:

| | fork point | upstream today |
|---|---|---|
| Storage | `TargetList` docs in Mongo | none — live API |
| Access | one bulk request per trip | `useLocationTargets(locationId)`, one request per hotspot, 24h `staleTime` |
| Item shape | `{code, name, percent, percentYr}` + list-level `N`, `yrN` | `{code, name, obs: number[]}` + response-level `samples: number[]` |
| Frequency | precomputed `percent` | `computeFrequency(obs, samples, months)` in `frontend/lib/targets.ts` |

**Prerequisite task:** a `useAllHotspotTargets(trip)` hook that fans `useLocationTargets` out over `trip.hotspots` with `useQueries`, plus an adapter producing the shape `lib/coverage.ts` already expects:

```ts
{ hotspotId, items: [{ code, name, percent }], N }
// percent = computeFrequency(obs, samples, getMonthRange(trip.startMonth, trip.endMonth))
// N       = sum of samples over that month range
// percentYr / yrN = same over all 12 months
```

Done this way, `lib/coverage.ts` ports essentially unchanged and features 10–15 unlock together.

**Design risk to settle before building it:** upstream deliberately went from bulk-stored to on-demand-per-location. A fan-out over a 30-hotspot trip is 30 OpenBirding requests on page load. That may be exactly what they were avoiding. Decide whether to (a) cap the fan-out and load lazily/incrementally, (b) ask rawcomposition whether a batch endpoint is welcome, or (c) scope the coverage features to the hotspots on the current itinerary day only. **This is the highest-leverage decision in the whole effort** — see [Issue B](#issue-b--cross-hotspot-target-coverage-batch-endpoint-or-client-fan-out).

---

## Tier 1 — clean ports, no prerequisites

Land these first. Each is independently shippable.

### 1. Trip-wide favorites (unify on `trip.targetStars`)
**Fork:** `3ea6080`, `d46f410`, `8f3daf2` · `FavButton.tsx`, `HotspotFavs.tsx`, `RecentSpeciesList.tsx`, `TargetRow.tsx` · **Upstream: PR 7 (Wave 2)**
**Portability: high.** Upstream already has `targetStars` on `Trip`, the `PATCH targets/add-star` / `remove-star` endpoints, and heart icons in `FavButton`. What it has *not* done is unify: the hotspot modal still reads and writes per-hotspot `hotspot.favs`, while the targets page reads `targetStars` and calls the filter "Starred" with star icons.
**Changes:** collapse `FavButton` props to `{code, ariaLabel}` and point its mutations at `targets/add-star`/`remove-star`; build `HotspotFavs` from `trip.targetStars`, sourcing name/frequency from `useLocationTargets(hotspotId)` (single-location — already exists upstream, **not** blocked on the fan-out); switch `RecentSpeciesList`'s heart source to `trip.targetStars`.
**Decide separately:** upstream says "Starred" with star icons; the fork says "Favorites" with hearts. Keep the vocabulary change out of the data-source change — bundling them gives one change two ways to be rejected.
**Watch:** the fork filtered favorites with no data at the current hotspot down to `percent > 0`, dropping them from the list entirely. Upstream's frequency is monthly-array-derived, so re-check that filter rather than copying it.

### 2. Favorites migration
**Fork:** `3ea6080` · `PATCH /trips/:tripId/migrate-favs-to-stars` · **Upstream: PR 6 (Wave 2)**
**Portability: high — but change its shape.** The fork built a permanent authenticated route for a one-time job. Upstream has `backend/scripts/` for exactly this (`get-avicommons`, `tz-sync-regions`, run via `tsx`, wired to root npm scripts, reusing the backend's `.env`, models, and `@birdplan/shared` alias). **Make it a script**: no `authenticate(c)`, no `isTripEditor`, no permanent endpoint surface, and it can sweep all trips in one bulk write.
**If you keep it as a route anyway:** authorization becomes `isTripEditor(tripId, session.userId)` — `trip.userIds` no longer exists, participants are a separate collection.
**Keep:** idempotency via `$addToSet` with `$each`, and the migrated/added counts. Still meaningful — upstream kept `HotspotFav` and `hotspot.favs` in the model, so real trips have data to migrate.

### 3. KML/GeoJSON export: favorites from `targetStars`
**Fork:** `3ea6080` · `backend/lib/utils.ts` · **Upstream: PR 8 (Wave 2)**
**Portability: high — easier than the original.** Upstream already refactored `tripToGeoJson(trip, hotspotTargets)` to take a `Record<hotspotId, items[]>` instead of resolving `it.targetsId` against a `TargetList[]`. The whole fork change reduces to `favsToHtml(it.favs)` → `favsToHtml(trip.targetStars, hotspotTargets[it.id])`.
**Watch:** upstream's items are `{name, frequency, code}`, not `{name, percent, range}`. Adjust the formatting in `favsToHtml`.

### 4. Total travel time + "Drive full route" link
**Fork:** `a04a535`, `1449967` · `getGoogleMapsFullDayRouteUrl` in `lib/helpers.ts`, `ItineraryDay.tsx` · **Upstream: PR 2 (Wave 1)**
**Portability: high.** `getGoogleMapsFullDayRouteUrl` is a pure function (11-stop Google Maps cap, waypoints joined with `|`) — copy as-is into upstream `lib/helpers.ts`. The per-leg reduce over `locations[].travel` works against upstream's unchanged `travel` shape; upstream already renders per-leg times via `components/TravelTime`.
**Bonus:** upstream ships travel times on the print view (`8ae525f`). A day total belongs there too.
**Prep:** name the 11-stop cap as a constant (`GOOGLE_MAPS_MAX_STOPS`) rather than commenting it; derive the total inline — it's a reduce over a handful of items, no `useMemo`; place it in their `CardHeader`, not the fork's flex row; semantic tokens, not `text-[#c2410d]`.

### 5. Saved-hotspot marker icon + `MarkerWithIcon` color prop
**Fork:** `5c47e7c`, `54ab31e`, `e236c89`, `f7b2e1b`, `2a677ef` · `MarkerWithIcon.tsx`, `lib/icons.ts` · **Upstream: PR 1 + PR 3 (Wave 1)**
**Portability: high.** `lib/icons.ts` and `MarkerWithIcon` both survive upstream (upstream added lucide *alongside* the custom `Icon`, it didn't replace it). Port: rename `markerColos` → exported `markerIconColors` (also fixes the typo), add `lightGray`, add the optional `color` override prop, show the marker glyph next to saved hotspot names, and use light gray for hotspots not on the itinerary.
**Split for upstreaming:** the rename + `color` prop is a pure enabling refactor (PR 1); the visual usages are the behavior change (PR 3).
**Synergy:** upstream's `SpeciesHotspotList` already carries a `saved: boolean` per row — same concept, different surface. Consider unifying rather than adding a second visual language for "saved".

### 6. CSV export of the target list
**Fork:** `4e50be2` · `targets.tsx` (+157, self-contained) · **Upstream: PR 4 (Wave 1)**
**Portability: high for the default scope, deferred for the other.** Upstream already has the right hosts: the kebab `OptionsMenu` on the targets page (currently one item) and `useDownloadGroupLifelist` as a pattern to copy exactly (query → build CSV → Blob → `link.click()` → `revokeObjectURL`).
**Do not port the fork's CSV code.** It hand-rolls `escapeCsvField`/`buildExportCsv`. Upstream already depends on `papaparse` and has `lib/lifelistCsv.ts` with a `lifelistToCsv` counterpart — use `Papa.unparse` and mirror that module. Also drop the `@headlessui` `Menu`/`Transition` popover; that dependency is gone.
**Split it:** "Target species only" works off `regionData.items[].frequency` and ships now. "All species at trip hotspots" needs coverage data — defer to Tier 3.

### 7. Small fixes worth carrying
- **Keep the hotspot modal open on map marker clicks** (`7e99c87`) — the fork added `.mapboxgl-map` to the outside-click guard. Upstream extracted this into `hooks/useCloseOnOutsideClick.ts`; **verify the bug still reproduces** before changing shared behavior. (**Upstream: PR 5**, only if it repros.)
- **Tooltips on map buttons** (`e00723d`) — the fork added a native `title` to `MapButton`. Upstream now has `components/ui/tooltip`; use that instead.
- **"Hotspot colors show all-time species counts" map hint** (`2a677ef`) — one JSX block, no dependencies.
- **Sort the add-location list by name, highlight hotspots already on the itinerary** (`2a677ef`) — the `AddItineraryLocation` modal is **deleted** upstream; the equivalent is the inline add inside `ItineraryDay.tsx` (~line 290). Re-apply there. (Folds into **PR 3**.)

---

## Tier 2 — needs redesign against upstream's UI

### 8. "Add to itinerary" from the hotspot modal
**Fork:** `2856289`, `77074c3`, `c4ca4a5` · `frontend/modals/Hotspot.tsx` (+~60) · **Upstream: PR 10 (Wave 2)**
**Portability: medium. High user value — upstream has no equivalent** (today you can only add locations from the itinerary page). The endpoint exists: `POST /trips/:id/itinerary/:dayId/add-location`.
**Two rewrites are mandatory.** (1) Replace the hand-rolled TanStack `useMutation` + manual `setQueryData` with `useTripMutation`, which already does optimistic updates and rollback. (2) Days are now **derived from `trip.startDate`/`endDate`, not stored** — `trip.itinerary` is sparse and back-filled server-side by `densifyItinerary(itinerary, dayIds)`. The fork's `trip.itinerary.map((day, index) => ...)` would silently skip every unpersisted day. Replicate the `renderDays`/`dayIds` derivation from upstream `frontend/pages/[tripId]/itinerary.tsx:20-25` and pass `dayIds` in the mutation body.

### 9. Species observation map: recency coloring
**Fork:** `5642389` (recency half) · `useFetchSpeciesObs.ts`, `Mapbox.tsx` · **Upstream: PR 9 (Wave 2)**
**Portability: medium, and it stands alone.** The recency half needs only eBird observations — no target data — so it ships without the prerequisite. Upstream even added `obsDt` to its `Obs` type already (for "Show last seen"), so the input is there.
**Port:** per-location days-ago derivation and `getSightingColorIndex`, emitting a `colorIndex` property on each GeoJSON feature; the Mapbox `circle-color`/`circle-radius`/`circle-opacity` match expressions; the recency legend.
**Simplify before porting.** The fork aggregates `reportCount`/`totalCount` per location and then never meaningfully uses them, because — as its own comment notes — the eBird endpoint returns one entry per location. Delete that aggregation. Move the remaining derivation out of `useMemo` into the hook body.
**Must change:** the map moved into `components/SpeciesMapOverlay`, not an inline `<MapBox>` on the targets page. Legend colors from semantic tokens (the ESLint rule will reject `bg-[#555]`).
**Defer:** the frequency half (`getFrequencyColorIndex`, `hasFrequencyData`, saved-vs-unsaved dual legend, the cyan `#0891b2` selected-hotspot halo) to Tier 3.

---

## Tier 3 — blocked on the prerequisite hook

All of these need `useAllHotspotTargets`. Build the hook + adapter once, then land them in this order.

### 10. `lib/coverage.ts`
**Fork:** `a503463` (+284, no UI) · **Upstream: PR 12 (Wave 3)**
**Portability: medium — pure functions, mechanical port.** `calculateSpeciesCoverage`, `isLowCoverageSpecies`, `getHotspotSpeciesImportance`, `getDaySpeciesImportance`, `getBestHotspotsForSpecies`, `getAllHotspotsForSpecies`. Zero React, zero UI. Once the adapter emits `{hotspotId, items, N, yrN}`, this compiles nearly as-is.
**Strip the JSDoc** — this is the most heavily documented file in the fork and upstream bans comments. The function names carry the meaning; where they don't, rename rather than annotate.
**Opportunity:** upstream's monthly `obs[]`/`samples[]` are *richer* than the old flat `percent`. `getDaySpeciesImportance` currently compares whole-trip frequencies across days; with monthly data it could compare each day's actual month. Worth doing at port time rather than retrofitting.
**Drop:** `getBestHotspotsForSpecies` / `getAllHotspotsForSpecies` and `BestTargetHotspots.tsx`. Upstream's species detail page (`pages/[tripId]/targets/[speciesCode].tsx` + `SpeciesHotspotList` over OpenBirding hotspot rankings) already answers "where do I find this bird", globally rather than only across saved hotspots — a strictly better answer. Keep only the "restrict to my saved hotspots" idea, as a filter on their list.

### 11. Targets page: weighted %, sorting, "Hard to find"
**Fork:** `cb1d96d` · `targets.tsx`, `TargetRow.tsx` · **Upstream: PR 12 (filter) + PR 16 (column/sort)**
**Portability: medium, with a real design conflict.** Upstream's columns are `# / Image / Species / Notes / Frequency / Chart / Last seen`, where **Frequency is region-level** from OpenBirding and Chart is a `MonthlyFrequencyChart`. The fork *replaced* the percent cell with a weighted average across the user's top-5 saved hotspots.
**Don't overwrite their column** — those numbers mean different things. Add a separate column, or a toggle, and label it.
**Sorting:** upstream has no sort controls at all. Clickable headers with an asc/desc indicator port cleanly; use their token classes and consider their `SegmentedControl`.
**"Hard to find" filter:** maps directly onto their `FilterChip` (as `showStarred`/`showMutual` already do). The `<15% or <10 observations` thresholds need re-derivation from `obs`/`samples`.
**Also:** the fork made map-marker clicks on the targets page prefer a saved hotspot over a raw observation — small, worth keeping.

### 12. Hotspot modal: per-species importance stars
**Fork:** `312f089` · `HotspotTargets.tsx`, `HotspotTargetRow.tsx` · **Upstream: PR 13 (Wave 3)**
**Portability: medium.** "Best here" / "hard to see elsewhere" markers with explanatory tooltips. `HotspotTargets` was rewritten upstream (+57/−115) and `HotspotTargetRow` (+35/−37), so re-apply by hand, not by patch.
**Conflict:** the fork flipped the default view from "All Year" to trip dates (`view = "obs"`) and relabelled it. Upstream went the *other* way on purpose — `220be50` "Default target species hotspot list to 'all'", plus the month toggle in `cb085c1`. Their call; keep it out of this change.

### 13. `DayImportantTargets` — "Key targets today"
**Fork:** `56215fc`, `a242bf2`, `991d343`, `794afa2`, `8385ca9`, `e429f38` · `DayImportantTargets.tsx` (+223) · **Upstream: PR 14 (Wave 3)**
**Portability: medium-high effort, the largest single port.** Per-day "key targets" with one-best-hotspot-per-species dedup, a `BEST_DAY_MIN_LEAD_PERCENT = 5` threshold over the next-best day, collapsed 4-species preview, and a hover panel of best saved hotspots.
**Must change:** (a) needs coverage across all itinerary hotspots — the prerequisite; (b) `dayIndex` is now a prop, not derived via `findIndex` (upstream's `acc4d7e` did exactly this refactor) and days can be virtual, so `trip.itinerary.findIndex(...)` is wrong; (c) `lifelist` now comes from `useTargetView`/`useTripLifelist` and is group-aware (`groupLifelist` / `unionLifelist` / `viewerLifelist`) — decide which list "key targets" filters against on a group trip; (d) the hover panel should be `components/ui/tooltip` and the block a `Card`, not `bg-amber-50/80` with a hand-rolled `group-hover` div; (e) **six `useMemo`s** — most are cheap derivations, and the expensive coverage call belongs in the shared hook.
**Fits well:** upstream added a print view. "Key targets today" per day is an obvious print-view win.

### 14. Frequency half of the species heatmap
See #9. Needs saved-hotspot frequencies: `getFrequencyColorIndex`, `hasFrequencyData`, the saved-vs-unsaved dual legend, and the cyan selected-hotspot halo that keeps the selection distinguishable from frequency colors. **Upstream: PR 15 (Wave 3).**

### 15. CSV export, "all species at trip hotspots" scope
See #6. Needs the coverage map to enumerate species across saved hotspots with a weighted percent. **Upstream: Wave 3.**

---

## Do not port

| Fork work | Why |
|---|---|
| Firebase project/bucket via env, non-fatal upload errors (`523bf57`) | Firebase deleted upstream. R2 config is already fully env-driven (`S3_KEY_ID`, `S3_SECRET`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_PUBLIC_URL`) with a `hasS3Config` guard — the fork's concern is solved better. |
| Trip start/end dates, itinerary day init, delete guardrails (`68d7669`, `e9a0a2f`, `PATCH /set-date-range`, `shared/dateUtils.ts`) | Superseded. Upstream has `endDate` on `Trip`, `TripDatesInput`, `PATCH /trips/:id/dates`, `validateTripDates`, and derives days from the range with `densifyItinerary` — so shortening a trip can't orphan stored days and the guardrail is unnecessary. Their model is cleaner; adopt it. |
| eBird/Merlin links on species names (`1f58be1`, `6f0b1ed`) | `components/MerlinLink.tsx` is deleted and there is no `merlinbirdid://` link left anywhere in upstream's frontend. Species names now navigate to the species detail page (`navigate('/:tripId/targets/:code')`), which itself links out to the eBird map. Link there instead. |
| `helpers.ts` → `format.ts` + `shared/dateUtils.ts` split, docstrings (`8ce5ffc`, `29acd38`) | Directly violates the no-comments rule, and upstream ran its own decomposition pass — `lib/helpers.ts` (+117), plus new `formStyles.ts`, `enums.ts`, `itinerary.ts`, `targets.ts`, `region.ts`, `utils.ts`, and `DESIGN.md`/`CLAUDE.md`. |
| `shared/index.ts`: `./types.js` → `./types` | Upstream still exports `./types.js`. Build-config detail; leave alone. |
| Sticky itinerary edit button (`0aeba94`) | The itinerary header was fully redesigned (`2a25764`). Re-add as a one-line `sticky` if you still want it — don't port the diff. |
| `BestTargetHotspots.tsx` | Deleted upstream; superseded by the species detail page's Top Hotspots list. See #10. |
| Sort/show hotspot percentages in `HotspotTargets` (`9f9c897`) | `HotspotTargets` was rewritten with its own sorting and `FrequencyBar` display. Diff the two before assuming anything is missing. |

---

# Part 2 — Upstreaming

## What the maintainer's repo tells us about review

Beyond the rubric in [House rules](#house-rules--apply-to-every-port-not-just-to-prs): there is no `CONTRIBUTING.md` and no PR template, but the history is its own signal — 246 commits of small, single-purpose changes, several rounds of "Code review fixes", and two large speculative features *reverted* (`c50fc04` reverted the Overview home page; `60bb20b` pulled trip documents out to a branch). This maintainer ships small and is willing to back out big bets. Match that cadence: one behavior change per PR, under ~200 lines, no drive-by refactors.

## Open issues before writing code

Three things need the owner's opinion first. Sending a PR for any of them cold means either a rejected PR or a large rewrite.

### Issue A — "Unify favorites on `trip.targetStars`?"
The `Trip` model already carries both `targetStars` (targets page) and per-hotspot `hotspot.favs` (hotspot modal), with two endpoints and two vocabularies. Ask whether consolidating is wanted, and whether legacy `favs` should be migrated or left to decay. Cheap to ask, and it unblocks a clean three-PR sequence. Don't send the migration cold — it touches persisted data.

### Issue B — "Cross-hotspot target coverage: batch endpoint or client fan-out?"
The architectural blocker above. Frame it as a question about their intent, with the three options (capped lazy client fan-out / a batch OpenBirding proxy endpoint / scope to the current day only) and the request-count math for a 30-hotspot trip. **Their answer determines whether ~40% of the fork's value is upstreamable at all.** Ask first — longest lead time.

### Issue C — "Trip-aware target prioritization" (product pitch)
"Key targets today", hard-to-find filtering, and hotspot importance markers are a coherent product idea, not a bug fix. Pitch it with screenshots from the running fork, framed as one feature with three surfaces. If the answer is "not the direction I want", you've saved the largest single port in the backlog. Depends on Issue B either way.

## Wave 1 — send now, no product opinion required

Five PRs. Each is a pure addition or an unambiguous fix, well under 200 lines, and needs no decision from the owner. PR 1 is deliberately trivial as an icebreaker that establishes you follow the conventions.

| PR | Title | Files | Ports feature |
|---|---|---|---|
| **1** | `refactor: export marker icon colors, allow per-instance override` | `lib/icons.ts`, `MarkerWithIcon.tsx` (~15 lines) | #5 (enabling half) |
| **2** | `feat: show total travel time and a full-route directions link per itinerary day` | `lib/helpers.ts`, `ItineraryDay.tsx` (~50) | #4 |
| **3** | `feat: distinguish saved hotspots and itinerary stops in the location list` | `ItineraryDay.tsx`, `Hotspot.tsx` (~40) | #5 (visual half) + #7 sort/highlight |
| **4** | `feat: export the target list as CSV` | new `hooks/useDownloadTargetsCsv.ts`, `targets.tsx` (~70) | #6 (region scope only) |
| **5** | `fix: keep the hotspot modal open when clicking map markers` | `hooks/useCloseOnOutsideClick.ts` (~2) | #7 — **only if it still repros** |

**PR 1 first:** ~15 lines, zero risk, mechanical, and it fixes a typo. It proves out the review loop and lands the primitive PR 3 depends on.
**PR 3 groups four one-liners** that are individually too small to justify a review round-trip and are all the same idea — *make it obvious which locations are already in your plan*. Mention that `SpeciesHotspotList` already carries a `saved` flag and offer to reuse whatever visual language they prefer.
**Conflict:** PRs 2 and 3 both touch `ItineraryDay.tsx`. Land 2, then rebase 3.
**Skip:** the `title` attribute on `MapButton` (use `ui/tooltip` inside another PR) and the map hint text (a copy choice — let it ride along or drop it).

## Wave 2 — after Issue A / Issue C responses

| PR | Title | Ports feature | Note |
|---|---|---|---|
| **6** | `chore: script to migrate hotspot favorites to trip targetStars` | #2 | As a `backend/scripts/` script, not a route — see #2 |
| **7** | `feat: read favorites from trip.targetStars in the hotspot modal` | #1 | Vocabulary change goes in a separate cosmetic PR |
| **8** | `feat: export favorites from targetStars in the KML/GeoJSON download` | #3 | Backend-only, no auth surface |
| **9** | `feat: color species observations by recency on the map` | #9 | Not blocked on Issue B |
| **10** | `feat: add a hotspot to an itinerary day from the hotspot modal` | #8 | Send last — most likely to attract design feedback |

## Wave 3 — gated on Issue B

Do not start until the fan-out question is answered. If the answer is no, these stay in the fork permanently.

| PR | Content | Note |
|---|---|---|
| **11** | Batched or capped target loading — infrastructure only, no UI | Must land alone and first, in whatever shape Issue B settles on |
| **12** | `lib/coverage.ts` + the "Hard to find" `FilterChip` | **Pair the library with its smallest consumer.** 284 lines of pure functions with no caller reads as dead code |
| **13** | Hotspot modal importance markers | Small once 12 lands |
| **14** | "Key targets today" per itinerary day | Largest feature; needs Issue C buy-in and group-lifelist semantics settled. Offer it for the print view |
| **15** | Frequency-based observation coloring | Extends PR 9 |
| **16** | Weighted-percent column + sortable headers | **Most contentious — send last, or not at all.** Additional column or toggle, never a replacement |

## Never send upstream

Everything in [Do not port](#do-not-port), plus:

- **Default view flips** — trip dates as the default in the hotspot target list and hotspots view. Upstream went the other way deliberately (`220be50`, `cb085c1`). A PR reversing it reads as not having read the history.

---

## Combined sequence

1. Reset a working branch to upstream `main`.
2. **Open Issues A, B, C** — B first, it has the longest lead time and gates the most work.
3. **Port and submit Wave 1** (features #4, #5, #6, #7) — independent, each a reviewable PR.
4. **Port Tier 2 / submit Wave 2** (features #1, #2, #3, #8, #9) as the issue responses land.
5. Once Issue B is settled: build `useAllHotspotTargets` + the adapter, then **Tier 3 / Wave 3** — coverage (#10) → targets filters and columns (#11) → hotspot importance (#12) → key targets (#13) → frequency heatmap (#14) → CSV all-species scope (#15).

Anything the maintainer declines still lands in the fork — the port work isn't wasted, it just doesn't get upstream review.

## Per-PR checklist

```bash
npm run lint        # catches raw palette classes
npm run typecheck   # the correctness gate — no test suite
```

- [ ] Every comment removed unless it documents an upstream bug, non-obvious regex, or a workaround
- [ ] No new `useEffect`/`useMemo` that could be plain derivation, lazy init, or a custom hook
- [ ] Trip mutations use `useTripMutation` with an `updateCache` reducer — no manual `setQueryData`
- [ ] Query keys are URL-shaped
- [ ] Semantic tokens, not raw palette classes; existing `components/ui/*` primitives before new markup
- [ ] Backend: `authenticate(c)` on protected handlers, `connect()` before DB access, `HTTPException` for errors, `.js` import extensions, atomic operators over read-modify-write
- [ ] `shared/types.ts` changes are additive; if a response shape changed, flag whether `QUERY_CACHE_BUSTER` needs a bump
- [ ] Under ~200 lines, one behavior change, no drive-by refactors

In the PR body: link the issue when the PR answers one, and say plainly that the feature has been running in a fork. A maintainer who has already reverted two large features will weigh "in use, here's a screenshot" more heavily than a description.
