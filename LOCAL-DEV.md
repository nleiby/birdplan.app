# Running upstream BirdPlan locally

Setup notes for the port working copy (`~/repos/rawcomposition/birdplan.app`), so ported features can actually be exercised before they're submitted.

This matters more than usual here: upstream has **no test suite** — `npm run typecheck` is the only automated correctness gate — and we are not keeping a personal build of the old fork running. Manual verification against a local instance is the entire QA story.

Companion to [PORTING.md](./PORTING.md).

> Keep this file in `~/repos/birdplan.app` (alongside `PORTING.md`), not in the port checkout, or it will show up as an untracked file in every PR branch. If you'd rather have it beside the code, note that upstream's `.gitignore` already ignores `notes.md`, or add it to `.git/info/exclude`.

---

## 1. Prerequisites

- **Node 22** (`.nvmrc`) — `nvm use`
- **`npm ci` at the repo root.** It's an npm workspaces monorepo (`frontend`, `backend`, `shared`); do not install per-workspace.
- **MongoDB** — a local `mongod` or a free Atlas cluster. Mongoose creates collections and indexes on first write, so an empty database is fine.

> **Use a brand-new database.** The fork's data is pre-migration — `Profile`, `Trip.userIds`, `TargetList` — and upstream expects `User`, `Participant`, `Session`. Pointing this at your old data will not work, and this is also why the favorites migration (PORTING.md feature #2) can't be exercised against real trips yet.

## 2. Credentials to obtain

| Credential | Where from | Blocking? |
|---|---|---|
| eBird API key | [ebird.org/api/keygen](https://ebird.org/api/keygen) — free, instant | **Yes** — hotspots, recent species, and the taxonomy endpoint all proxy through it |
| Mapbox tokens | Mapbox account; a public `pk.…` for the client and a token for server-side region images | **Yes** for the client key — no map without it |
| `OPENBIRDING_API_URL` | **Unknown — ask rawcomposition** | Partially — see [§6](#6-what-works-without-openbirding) |
| Resend / DeepL / NTFY / S3 | — | No. All guarded; skip them in dev |

## 3. `backend/.env`

Loaded by `dotenv/config` from the `dev` script. Already gitignored.

```bash
MONGO_URI=mongodb://localhost:27017/birdplan-dev
EBIRD_API_KEY=your_ebird_key
MAPBOX_SERVER_KEY=your_mapbox_token
CORS_ORIGINS=http://localhost:5280
FRONTEND_URL=http://localhost:5280
OPENBIRDING_API_URL=            # ask upstream

# Optional in dev — each is guarded, leave unset:
# RESEND_API_KEY=   DEEPL_KEY=   NTFY_TOPIC=
# S3_KEY_ID=  S3_SECRET=  S3_ENDPOINT=  S3_BUCKET=  S3_PUBLIC_URL=
```

**Leave `NODE_ENV` unset.** `IS_DEV` is `NODE_ENV !== "production"`, and that flag is what makes login work without an email provider (see §5).

`CORS_ORIGINS` looks optional but isn't — if unset, `backend/index.ts` logs `CORS_ORIGINS is not set`, skips the CORS middleware entirely, and every frontend request fails in the browser.

## 4. `frontend/.env`

`frontend/vite-env.d.ts` is the authoritative list, and it's exactly four vars:

```bash
VITE_API_URL=http://localhost:5100/v1
VITE_URL=http://localhost:5280
VITE_MAPBOX_KEY=pk.your_mapbox_public_token
VITE_OPENBIRDING_API_URL=       # ask upstream
```

`VITE_API_URL` is string-concatenated onto URL-shaped React Query keys (`useQuery({ queryKey: ["/trips/123"] })` → `VITE_API_URL + "/trips/123"`), so it needs the `/v1` suffix and **no trailing slash**.

## 5. First run and first login

```bash
npm run dev     # Vite on :5280, Hono on :5100
```

The Vite port is `strictPort: true` — it fails rather than falling back, so free 5280 first.

**Logging in needs no email provider.** `backend/lib/email.ts` short-circuits when `IS_DEV` and prints the message to stdout instead of calling Resend:

1. Go to `http://localhost:5280/signup`, enter any email address.
2. Watch the **backend** console for:
   ```
   📧 [dev] email not sent
     to: you@example.com
     subject: …
     body: …
   ```
3. Read the 6-digit code out of the body and enter it.

Auth is `POST /v1/auth/request-code` → `POST /v1/auth/verify-code`, issuing an opaque session token. Rate limits apply even in dev — 2 code requests per 30s, 5 per hour per email, and 5 wrong-code attempts before lockout. Use a different email address if you lock yourself out.

**Admin dashboard** (`/admin`) is gated on `User.isAdmin`. To test it, flip the flag directly:

```js
db.users.updateOne({ email: "you@example.com" }, { $set: { isAdmin: true } })
```

## 6. What works without OpenBirding

`OPENBIRDING_API_URL` is the one value that can't be inferred from the repo, and it feeds every targets-related surface.

| Works | Blocked |
|---|---|
| Trip CRUD, regions, dates | Targets page (region target list) |
| Map, saved hotspots, custom markers | Species detail page + monthly frequency chart |
| Hotspot modal: stats, recent species, recent checklists | Hotspot modal: targets tab |
| Itinerary: days, stops, reorder, travel times, print | Top Hotspots / hotspot rankings |
| Life lists, participants, sharing | Anything using `useLocationTargets` / `useDownloadTargets` |

That's enough to verify **PRs 2, 3, and 5**. **PR 4** (CSV export) and all of Wave 3 need it.

Given rawcomposition's standing "if you have any ideas you think are worth building into the main app, I'm down for it!" on PR #42, asking how to configure local dev is a natural first contact — and a good opening for the Issue B architecture question.

## 7. No setup required

Things that look like they need seeding but don't:

- **Species images** — `frontend/public/avicommons.json` is committed. `npm run get-avicommons` only refreshes it.
- **Taxonomy** — `backend/routes/taxonomy.ts` proxies eBird live; needs only `EBIRD_API_KEY`.
- **Timezones** — `frontend/timezones.json` and `timezones-flat.json` are committed. `npm run tz-sync-regions` only refreshes them.
- **eBird calls from the client** — routed through `/v1/ebird-proxy`, which injects the key server-side.

---

## 8. Seed a fixture trip

Build this once; it's the fixture for every Wave 1 PR:

1. Create a trip in a region with good eBird coverage.
2. Set a **start and end date** spanning 3+ days (the itinerary is derived from the date range — no dates, no days).
3. Save **5+ hotspots** from the map.
4. Add a **custom marker** or two (lodging, food) — needed to check marker icon rendering.
5. Build **2–3 itinerary days**, at least one with **3+ stops** so travel legs are computed.
6. Leave at least one saved hotspot **off** the itinerary — PR 3's dimmed-icon behavior needs the contrast.

## 9. Smoke test after setup

Confirm the baseline works before changing anything, so a later failure is unambiguously yours:

```bash
npm run lint && npm run typecheck   # exactly what CI runs
```

- [ ] Sign up, log out, log back in with a fresh code
- [ ] Map renders with Mapbox tiles; saved hotspots and markers appear
- [ ] Hotspot modal opens: stats, recent species, recent checklists all populate
- [ ] Itinerary shows derived days; adding a stop recalculates travel time
- [ ] Print view (`Print` button) renders day cards with travel times
- [ ] Species images appear in lists (confirms `avicommons.json` is being served)

## 10. Per-PR verification

### PR 2 — day travel totals + full-route link
Needs a day with 3+ stops.
- [ ] Day total equals the sum of the visible per-leg times
- [ ] Total updates after adding, removing, or reordering a stop
- [ ] A day with one stop shows no total and no route link (`getGoogleMapsFullDayRouteUrl` returns `null` under 2 points)
- [ ] "Drive full route" opens Google Maps with the correct origin, destination, and `waypoints`
- [ ] Behavior with 12+ stops is sane (the 11-stop cap truncates)
- [ ] Total appears in the print view

### PR 3 — saved / on-itinerary affordances
Needs a saved hotspot that is *not* on the itinerary.
- [ ] Saved hotspots show the marker glyph next to the name; unsaved ones don't
- [ ] Hotspots not on the itinerary render in light gray
- [ ] Inline add-location list is alphabetical
- [ ] Locations already on the itinerary are visually distinguished in that list
- [ ] Custom markers keep their own icon colors — regression check on the `color` override, which now takes effect for the first time

The first commit renames `markerColos` → `markerIconColors` and makes `MarkerWithIcon` honor its previously-ignored `color` prop, so re-check every call site for unintended colour changes: `Mapbox.tsx` (hotspot + custom marker), `ItineraryDay.tsx` (stop row + inline add list), `DirectionsButton.tsx`, `Marker.tsx` (header + icon picker), `AddPlace.tsx` (icon picker). Only the itinerary call sites should look different.

### PR 4 — CSV export
**Blocked without OpenBirding.** When unblocked: correct row count vs. the filtered list, threshold applied, quoting correct for species names containing commas, filename sane, empty result handled without downloading a file.

### PR 5 — hotspot modal stays open on marker clicks
**Reproduce on upstream `main` before writing any code** — the fork's fix predates upstream's extraction of `useCloseOnOutsideClick`, and the map code has changed.
1. Open a hotspot modal from a map marker.
2. Click a *different* marker without closing it.
3. Bug: the modal closes. Expected: it stays open and switches hotspots.

If it doesn't reproduce, drop the PR — changing shared outside-click behavior on spec is worse than not sending it.

---

## 11. Troubleshooting

| Symptom | Cause |
|---|---|
| Every API call fails with a CORS error | `CORS_ORIGINS` unset or not exactly `http://localhost:5280` |
| Requests 404 or hit the Vite dev server | `VITE_API_URL` missing the `/v1` suffix, or has a trailing slash |
| No OTP arrives and nothing logs | `NODE_ENV=production` is set — that bypasses the dev console fallback and tries Resend |
| "Too many requests" on login | OTP rate limits (2/30s, 5/hour per email). Use another address |
| Map is blank | `VITE_MAPBOX_KEY` missing or not a public `pk.…` token |
| Hotspots and recent species empty | `EBIRD_API_KEY` missing — check the backend console for proxy errors |
| Targets page empty, no error | `OPENBIRDING_API_URL` unset. Expected until it's sourced |
| Species images missing | `frontend/public/avicommons.json` not being served; re-run `npm run get-avicommons` |
| Itinerary shows no days | Trip has no `startDate`/`endDate` — days are derived from the range |
| Vite won't start | Port 5280 in use; `strictPort: true` means no fallback |
