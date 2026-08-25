# Scratch

## Issue draft — cross-hotspot target data

Not submitted. Open with:

```bash
gh issue create --repo rawcomposition/birdplan.app \
  --title "Target species across all saved hotspots — is there a batched shape you'd want?" \
  --body-file -
```

**Title:** `Target species across all saved hotspots — is there a batched shape you'd want?`

**Body:**

I'd like to build a few features that need target frequencies for *every* saved hotspot on a trip at once, and I'd rather ask about the data-access shape before writing anything, since the current design looks deliberate.

The kind of thing I mean:

- Flagging which target species a given hotspot is the *best* place for on this trip, vs. which are hard to find at any of your saved hotspots
- A per-day "key targets" summary on the itinerary — species where today is meaningfully your best chance
- Sorting/filtering the targets list by frequency across your saved hotspots rather than region-wide

All three need the same thing: for each saved hotspot, the target list. What exists today, as far as I can tell:

- `useLocationTargets(locationId)` → `GET /api/v1/targets/location/:id`, one location per call, 24h `staleTime`
- `useDownloadTargets` → `GET /api/v1/targets/region/:region?months=…`, region-wide
- The species detail page → `POST /api/v1/hotspots/species/:speciesCode` with `{ locationIds, months, minObservations, sortBy }`

That third one already does batch over saved hotspots — it's just the other pivot (one species across many locations, where I need many species across many locations). Since it accepts a `locationIds` array, I'm guessing a transpose may already exist or be cheap to add.

So, three questions:

1. **Is there a location-targets equivalent that takes multiple `locationIds` in one request?** If so I'll use it and there's nothing to discuss.
2. **If not, would a client-side fan-out be acceptable?** `useQueries` over `trip.hotspots`, so a 30-hotspot trip issues 30 requests on first load. The 24h `staleTime` plus the IndexedDB-persisted cache means it's mostly a first-visit cost, but it's still 30 requests, and I notice the `TargetList` model and its bulk trip endpoint were deliberately removed — so I assume moving away from bulk fetching was a choice, and I don't want to quietly undo it.
3. **Or would you rather these features stay narrower?** Some of them work per-species using the existing `hotspots/species` endpoint (one request per species of interest, scoped to `locationIds`), which needs no API change at all — it just doesn't scale to "all targets," only to a starred subset or a single day's hotspots.

Happy to go whichever way you prefer, including "not this." Mainly want to avoid building against a shape you'd reject.

---

## Later issue sketches

Both depend on the answer above. Send the batching question alone first — three issues at once from an outside contributor reads as a roadmap rather than a question.

### Favorites on `trip.targetStars` vs `hotspot.favs`

**Title:** `Consolidate favorites on trip.targetStars?`

The `Trip` model carries both `targetStars` (used by the targets page, via `targets/add-star` / `remove-star`) and per-hotspot `hotspot.favs` (used by the hotspot modal, via `add-species-fav` / `remove-species-fav`), with two different vocabularies in the UI — "Starred" with star icons on the targets page, hearts in the hotspot modal. Is consolidating on `targetStars` something you'd want? And if so, should existing `favs` be migrated, or left to decay? Asking before touching persisted data.

### Trip-aware target prioritization (product pitch)

**Title:** `Surfacing "key targets" per hotspot and per itinerary day`

A pitch, not a bug report — worth screenshots from the running fork. One feature with three surfaces: importance markers in the hotspot target list ("best here" / "hard to see elsewhere"), a per-day "key targets today" block on the itinerary, and a "hard to find" filter on the targets page. If the direction isn't wanted, that saves the largest port in the backlog.
