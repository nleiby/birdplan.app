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

## `up/hotspot-modal-itinerary` — ready

**Title:** `feat: add and remove itinerary days from the hotspot modal`

Locations can currently only be scheduled from the itinerary page. This adds a day picker to the hotspot modal, so when you find a hotspot on the map you can put it on a day without navigating away.

The trigger sits with Save / Directions / eBird, and reads "Itinerary" or "On 2 days" depending on state. Inside is a `DropdownMenuCheckboxItem` per day, labelled `Day 2 · Tue, Sep 8`. Checking schedules the hotspot, unchecking removes it — one control for both, which also means the menu doubles as an at-a-glance view of where the hotspot already sits, and the menu stays open so you can set several days in one go.

The control only appears for a saved hotspot on a trip that has dates. Unsaved hotspots are excluded because the itinerary references `trip.hotspots` by id, so scheduling one would render as "Unknown Location"; a trip with no date range has no days to offer.

Notes:

- Days are derived from the trip's date range rather than stored, so I pulled that derivation out of `pages/[tripId]/itinerary.tsx` into `getTripDays()` in `lib/itinerary.ts` and used it in both places. The modal needs it to build the virtual day ids, to send `dayIds` so the server can densify, and to apply the optimistic cache update against a day that may not be persisted yet.
- Verified against a trip with a date range and an **empty** `itinerary` array — the case where every day id is virtual. Adding to `<tripId>-d1` correctly densifies all three days server-side and lands the location on day 2; removing clears it.
- Both mutations go through `useTripMutation` with optimistic `updateCache` plus `reconcile` on the server's returned itinerary. Because the URL contains the day id, each day renders a small component with its own mutations rather than one mutation with a computed URL — happy to restructure if you'd rather see that done differently.

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

- **Unify favorites on `trip.targetStars`?** The model carries both `targetStars` and per-hotspot `hotspot.favs`, with two endpoints and two vocabularies ("Starred" + stars on targets, hearts in the hotspot modal). Worth asking whether consolidating is wanted before touching persisted data.
- **Cross-hotspot target coverage: batch endpoint or client fan-out?** Several features need every saved hotspot's targets at once; `useLocationTargets` is deliberately per-location. A 30-hotspot trip means 30 requests on load. Ask which shape is acceptable before building.
- **Trip-aware target prioritization** — "key targets today", hard-to-find filtering, hotspot importance. A product pitch, not a bug fix; pitch with screenshots before investing in the port.
