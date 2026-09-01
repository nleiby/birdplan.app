# PR bodies

Draft text for each upstream PR, keyed by branch. Lives in `/plans`, which is gitignored — it will never show up in `git status` or a PR diff.

Open with `gh pr create --repo rawcomposition/birdplan.app --base main --head nleiby:<branch>`.

---

## `up/dev-setup-fixes` — not submitting

> Dropped: placeholder env values work around both. The `VITE_OPENBIRDING_API_URL` half is still a real production-path bug if you ever want to revisit it.

**Title:** `fix: run without OpenBirding and Resend configured`

Two things blocked me from running the app locally. Both are one-liners.

**1. Queries lose the API base URL when `VITE_OPENBIRDING_API_URL` is unset** (`frontend/main.tsx`)

The global `queryFn` computes:

```js
const isApiRoute = url.startsWith("/") && !url.startsWith(import.meta.env.VITE_OPENBIRDING_API_URL || "");
```

When the variable is unset or empty this falls back to `""`, and `url.startsWith("")` is always `true` — so `isApiRoute` is always `false`, every query skips the `VITE_API_URL` prefix, and requests go to the dev server as relative paths and come back as `index.html`.

The symptom is confusing: login works fine (`lib/http.ts` prefixes unconditionally), but no data loads anywhere and nothing errors usefully.

Fixed by only applying the exclusion when the variable is actually set. Checked against unset, empty, configured, an absolute OpenBirding URL, and OpenBirding configured as a relative path — behaviour is unchanged in every case where it's configured.

**2. The server can't start without `RESEND_API_KEY`** (`backend/lib/email.ts`)

`new Resend(process.env.RESEND_API_KEY)` runs at module load, outside the `IS_DEV` guard, and the constructor throws on a falsy key. `sendEmail` already logs to the console instead of sending in dev, so the intent is clearly that dev works without an email provider — but the module can't even load. Now constructed lazily on first send.

One tradeoff worth your call: this moves a missing-key failure in production from boot time to first send. If you'd rather keep failing fast, an explicit startup check would be clearer than the implicit one this replaces — happy to do that instead.

---

## `up/travel-totals` — submitted as PR #59

**Title:** `feat: show total travel time and a full-route directions link per itinerary day`

Adds two things to each itinerary day header:

- **Total travel time and distance**, summed from the day's legs — `Monday, March 3 · 1 hr 20 min travel · 45 mi`. Uses the existing `formatTime` / `formatDistance`, so it reads identically to the per-leg times above it. Only counts legs that are actually displayed (skips deleted ones), so the total always matches what's on screen.
- **A "Drive route" action** linking the whole day in Google Maps, in the `CardAction` slot. `TravelTime` already links single legs this way; this is the same idea for the day.

The total prints; the link is `print:hidden`. Given you just put travel times on printed itineraries, a day total seemed like the missing summary line — happy to drop it from print if you'd rather keep that view lean.

Two notes:

- Google's Maps URL API caps at 9 waypoints (11 stops), so `getGoogleDrivingRouteUrl` truncates past that. A 14-stop day would silently get a route covering the first 11. Rare, but it's a silent partial result — let me know if you'd prefer to hide the link instead.
- I pulled the location lookup out into a local `findLocation` since it's now needed twice in the component.

---

## `up/hotspot-modal-itinerary` — submitted as PR #60

**Title:** `feat: add and remove itinerary days from the hotspot modal`

Locations can currently only be scheduled from the itinerary page. This adds a day picker to the hotspot modal, so when you find a hotspot on the map you can put it on a day without navigating away.

The trigger sits with Save / Directions, and reads "Itinerary" when unscheduled or the scheduled date when it is — "Nov 14", or "Nov 14 +2" if it appears on more than one day. Inside is a `DropdownMenuCheckboxItem` per day, labelled `Day 2 · Tue, Sep 8`. Checking schedules the hotspot, unchecking removes it — one control for both, which also means the menu doubles as an at-a-glance view of where the hotspot already sits, and the menu stays open so you can set several days in one go.

The control only appears for a saved hotspot on a trip that has dates. Unsaved hotspots are excluded because the itinerary references `trip.hotspots` by id, so scheduling one would render as "Unknown Location"; a trip with no date range has no days to offer.

Notes:

- Days are derived from the trip's date range rather than stored, so I pulled that derivation out of `pages/[tripId]/itinerary.tsx` into `getTripDays()` in `lib/itinerary.ts` and used it in both places. The modal needs it to build the virtual day ids, to send `dayIds` so the server can densify, and to apply the optimistic cache update against a day that may not be persisted yet.
- Verified against a trip with a date range and an **empty** `itinerary` array — the case where every day id is virtual. Adding to `<tripId>-d1` correctly densifies all three days server-side and lands the location on day 2; removing clears it.
- Both mutations go through `useTripMutation` with optimistic `updateCache` plus `reconcile` on the server's returned itinerary. Because the URL contains the day id, each day renders a small component with its own mutations rather than one mutation with a computed URL — happy to restructure if you'd rather see that done differently.

---

## `up/ebird-link-in-stats` — ready (follow-up to PR #60 review)

**Title:** `fix: make room in the hotspot modal action row`

Two commits, both responding to the review note that the action row collapses once the itinerary control is present.

**1. Move the eBird link into the stats row.** The row had grown to five controls — Save, Itinerary, Directions, eBird, kebab — roughly 440px against a ~340px modal on mobile, so flex shrank everything. The eBird link is the one item that isn't a trip action, and the species / checklists / last-checklist row it now sits in is exactly the data it sources. Right-aligned on that row, so it costs no vertical space and nothing else moves. Action row is back to three controls, fewer than before the itinerary work. `HotspotStats` is only used by this modal, so nothing else is affected. Also added the `alt` the image was missing.

**2. Show the scheduled date instead of a day count.** "On 1 day" doesn't tell you anything you'd act on; the date does. The trigger now reads `Nov 14`, or `Nov 14 +2` when the hotspot is on more than one day, and falls back to `Day 3` if the trip has no start date. `aria-label` included, since a bare date is ambiguous without the calendar icon.

Happy to reverse either if you'd rather solve the row differently — putting Itinerary in the kebab instead would also work.

---

## `up/species-map-hide-personal` — ready

**Title:** `feat: add a toggle to hide personal locations on the species map`

Recent-observation results mix eBird hotspots with birders' private locations. Personal locations can't be visited or saved to a trip, so when you're scanning the map for somewhere to go they're noise. This adds a map button to hide them; default is unchanged (shown).

Notes:

- The preference lives in a small persisted zustand store rather than page state, because `SpeciesMapOverlay` is used by both the targets page and the species detail page. That way `useFetchSpeciesObs` reads it directly and neither page changes at all — same shape as `useTargetView` reading `useTargetPreferencesStore`.
- The toggle renders even for species with no personal-location reports, where it does nothing. Making it conditional means surfacing a `hasPersonal` flag through both pages, which seemed worse than an occasionally-inert button — happy to do it if you disagree.

---

## `up/hotspot-map-density` — ready

**Title:** `feat: reduce hotspot clutter on the trip map`

At region zoom the hotspot layer is close to unreadable: `/region/:region/hotspots` returns every hotspot in the region uncapped, and each renders at a fixed 7–8px with a 0.75px stroke regardless of zoom, so a 12-species pullout is as visually loud as a 300-species reserve.

**Size now carries signal.** `circle-radius` is a zoom interpolation whose stops are species-count interpolations — roughly 1.5–3.5px at zoom 6, 3–6px at 10, 4.5–9px at 14. Stroke thins from 0.75 to 0.3 when zoomed out; at a 1.5px radius a dark ring is most of the dot.

**A minimum-checklists filter**, defaulting to 1. It's a Mapbox layer `filter`, so changing it is instant with no refetch, and the control only appears when the hotspot layer is on. Required adding `species` and `checklists` to the layer properties — `buildHotspotsLayer` emitted only `shade` and `id`, though the endpoint was already returning both.

Notes:

- Includes a one-line fix to `getMarkerColor`: counts above 1000 fell through to `markerColors[0]`, the "no species" gray, so the very best hotspots rendered as if empty. That matters more now that radius keys off the same count. Happy to split it out.
- The default of 1 filters very little — zero-checklist hotspots are rare — so nearly all the relief comes from the size scaling. If it's still too dense, defaulting to 10+ is the real lever, but that hides enough that it should probably show a count of what's filtered.
- Filter state sits in `useTripUiStore` beside `showAllHotspots` and `showSatellite`, so it's per-session rather than persisted, matching those.

---

## `up/month-typo` — ready

**Title:** `fix: correct November spelling in the month list`

> ⚠️ **User-visible typo.** `fullMonths` in `lib/helpers.ts` spells November as "Novermber". It surfaces in two places: the monthly frequency chart tooltip on the species page, and the trip date-range label whenever a trip starts and ends in November (`formatMonthRange` returns the full month name when start and end match).

One word. Kept on its own branch since it's unrelated to anything else in flight.

---

## `up/species-map-frequency` — ready

**Title:** `feat: add a trip-dates mode to the species map`

The species map plots eBird reports from the last 30 days — "where has this been seen lately," not "where will I find it on my trip." Out of season those diverge completely: a hotspot where the species is reliable during your trip months shows nothing if nobody reported it in the last month.

Adds a **Trip dates** mode (default) plotting hotspots ranked by frequency for the trip's months, via the same `POST /api/v1/hotspots/species/:code` the species detail page already uses. **Recent sightings** stays available from a toggle, unchanged. Saved hotspots render as the trip map's star marker in both modes, tinted by frequency in trip dates.

**Fixes a latent bug along the way:** saved hotspots were never guaranteed to appear on this map. The region ranking returns the top 500 hotspots for the whole region, which rarely includes a particular trip's hotspots — for a NYC trip in New York State, none of the five saved hotspots were in the result. They're now fetched by id in a second query, so they always show.

Decisions worth flagging:

- **A toggle, not a replacement.** The two modes answer different questions — planning vs. birding today. Defaulting to trip dates because the app is a trip planner; happy to flip that.
- **One colour scale per mode.** An earlier pass shaded recent sightings by recency *and* saved hotspots by frequency; two scales on one ramp were unreadable.
- **Ranks by `best`, not `frequency`.** Sorting by frequency returned 500 hotspots all at exactly 100%, on sample sizes around 20 checklists — statistically meaningless, and it made every dot the same colour. `best` weights sample size and gives a real spread (56–100%, median 79% for a common species). Colour thresholds were stretched to match: 5/10/20/40/60/80 rather than 10/15/20/30/40/50.
- **Top Hotspots on the species page now defaults to the trip's months** rather than all year, matching the map.
- **The overlay owns its data.** It already had `trip` and `selectedSpecies`, so it now runs both queries and handles clicks itself. `targets.tsx` drops ~29 lines and no longer fetches observations.
- **Two toggles present in both modes** — saved-only, and hide personal locations (disabled in trip dates, where every point is a public hotspot). Saved-only defaults off, since the point of the map is finding somewhere new.
- Wires up `MarkerWithIcon`'s `color` prop, which was declared but never destructured, to tint saved markers by frequency.
- Closing the info card no longer closes the map, so there's a dedicated close control; Escape still closes the map. Controls sit top-left on desktop like the trip map's.
- Menu label changed from "Recent Reports Map" to "Show on Map".

---

## `up/saved-hotspot-affordances` — draft

**Title:** `feat: distinguish saved hotspots and itinerary stops in the location list`

Makes it visible at a glance which locations are already in your plan: a marker glyph next to saved hotspot names, a dimmed icon for hotspots not on the itinerary, alphabetical ordering in the add-location list, and a marker on entries already added.

First commit is groundwork: `MarkerWithIcon` declares a `color` prop that's never destructured, so callers passing it are silently ignored — this wires it up, exports the marker palette as `markerIconColors` (currently the private, slightly misspelled `markerColos`), and adds a light gray. Nothing passes `color` today, so if you'd rather remove the prop than use it, say the word and I'll restructure.

`SpeciesHotspotList` already carries a `saved` flag for the same concept — glad to reuse whatever visual language you prefer rather than introducing a second one.

---

## `up/hotspot-modal-outside-click` — draft, only if it reproduces

**Title:** `fix: keep the hotspot modal open when clicking map markers`

Clicking a different map marker while a hotspot modal is open closes the modal instead of switching to the new hotspot. Adds `.mapboxgl-map` to the outside-click guard in `useCloseOnOutsideClick`.

> Reproduce on current `main` before opening — this came from a fork that predates the extraction of `useCloseOnOutsideClick`, and the map code has changed since. If it doesn't reproduce, drop it.

---

## `up/targets-csv-export` — on hold

> Deprioritized as a power-user feature; may never be built.

**Title:** `feat: export the target list as CSV`

Adds a "Download targets" item to the existing kebab menu on the targets page, with a minimum-frequency threshold. Follows `useDownloadGroupLifelist` and reuses `papaparse` / `lib/lifelistCsv.ts` rather than hand-rolling CSV.

> Blocked until `OPENBIRDING_API_URL` is available locally — can't exercise the targets page without it.

---

## Issues to open before the Wave 2 / Wave 3 PRs

Full drafts in `scratch.md` at the repo root.

- **Unify favorites on `trip.targetStars`?** The model carries both `targetStars` and per-hotspot `hotspot.favs`, with two endpoints and two vocabularies ("Starred" + stars on targets, hearts in the hotspot modal). Worth asking whether consolidating is wanted before touching persisted data.
- **Cross-hotspot target coverage: batch endpoint or client fan-out?** Several features need every saved hotspot's targets at once; `useLocationTargets` is deliberately per-location. A 30-hotspot trip means 30 requests on load. Ask which shape is acceptable before building.
- **Trip-aware target prioritization** — "key targets today", hard-to-find filtering, hotspot importance. A product pitch, not a bug fix; pitch with screenshots before investing in the port.
