import { Day } from "@birdplan/shared";
import { HOTSPOT_TARGET_CUTOFF } from "lib/config";

export type SpeciesCoverage = {
  code: string;
  maxPercent: number;
  maxPercentYr: number;
  maxObservations: number;
  maxObservationsYr: number;
  bestHotspotId: string | undefined;
  weightedAvgPercent: number;
  totalChecklists: number;
  hotspotCount: number;
};

type TargetItem = {
  code: string;
  name: string;
  percent: number;
  percentYr: number;
};

type HotspotTargetData = {
  hotspotId?: string;
  items: TargetItem[];
  N: number;
  yrN: number;
};

/**
 * Calculate the best hotspot coverage for each species across all saved hotspots.
 * Returns a map of species code to their coverage stats.
 *
 * @param allTargets - Array of hotspot target data
 * @param topN - Number of top hotspots to use for weighted average (default: 5)
 */
export function calculateSpeciesCoverage(
  allTargets: HotspotTargetData[],
  topN: number = 5
): Map<string, SpeciesCoverage> {
  // First pass: collect all hotspot data for each species
  const speciesHotspots = new Map<string, Array<{ percent: number; N: number; hotspotId: string }>>();

  for (const target of allTargets) {
    if (!target.hotspotId) continue;

    for (const item of target.items) {
      if (!speciesHotspots.has(item.code)) {
        speciesHotspots.set(item.code, []);
      }
      speciesHotspots.get(item.code)!.push({
        percent: item.percent,
        N: target.N,
        hotspotId: target.hotspotId,
      });
    }
  }

  // Second pass: calculate stats for each species
  const coverageMap = new Map<string, SpeciesCoverage>();

  for (const [code, hotspots] of speciesHotspots) {
    // Sort by percentage descending to get top hotspots
    const sortedHotspots = hotspots.sort((a, b) => b.percent - a.percent);
    const topHotspots = sortedHotspots.slice(0, topN);

    // Calculate weighted average using number of checklists as weight
    let totalWeightedPercent = 0;
    let totalChecklists = 0;

    for (const hs of topHotspots) {
      totalWeightedPercent += hs.percent * hs.N;
      totalChecklists += hs.N;
    }

    const weightedAvgPercent = totalChecklists > 0 ? totalWeightedPercent / totalChecklists : 0;

    // Find max values from all hotspots (not just top N)
    const best = sortedHotspots[0];
    let maxObservations = 0;
    let maxObservationsYr = 0;
    let maxPercentYr = 0;

    // Re-scan for year-based stats
    for (const target of allTargets) {
      if (!target.hotspotId) continue;
      const item = target.items.find((it) => it.code === code);
      if (item) {
        const obsYr = (item.percentYr * target.yrN) / 100;
        if (obsYr > maxObservationsYr) maxObservationsYr = obsYr;
        if (item.percentYr > maxPercentYr) maxPercentYr = item.percentYr;
        const obs = (item.percent * target.N) / 100;
        if (obs > maxObservations) maxObservations = obs;
      }
    }

    coverageMap.set(code, {
      code,
      maxPercent: best?.percent || 0,
      maxPercentYr,
      maxObservations,
      maxObservationsYr,
      bestHotspotId: best?.hotspotId,
      weightedAvgPercent: Math.round(weightedAvgPercent * 10) / 10, // Round to 1 decimal
      totalChecklists,
      hotspotCount: topHotspots.length,
    });
  }

  return coverageMap;
}

/**
 * Check if a species has low coverage (hard to find) at all saved hotspots.
 * @param coverage - The coverage stats for the species
 * @param percentThreshold - Max percentage threshold (default 15%)
 * @param observationsThreshold - Max observations threshold (default 10)
 */
export function isLowCoverageSpecies(
  coverage: SpeciesCoverage | undefined,
  percentThreshold: number = 15,
  observationsThreshold: number = 10
): boolean {
  if (!coverage) return true; // Species not found at any hotspot
  return coverage.maxPercent < percentThreshold || coverage.maxObservations < observationsThreshold;
}

export type HotspotSpeciesImportance = {
  isBestAtThisHotspot: boolean;
  isCritical: boolean;
};

/**
 * For a given hotspot, which target species are "important" there (trip dates only).
 * Best = this hotspot is the best place for that species; Critical = hard to see at other saved hotspots.
 */
export function getHotspotSpeciesImportance(
  allTargets: HotspotTargetData[],
  hotspotId: string
): Map<string, HotspotSpeciesImportance> {
  const coverage = calculateSpeciesCoverage(allTargets);
  const hotspotTarget = allTargets.find((t) => t.hotspotId === hotspotId);
  const result = new Map<string, HotspotSpeciesImportance>();

  if (!hotspotTarget?.items?.length) return result;

  for (const item of hotspotTarget.items) {
    const cov = coverage.get(item.code);
    result.set(item.code, {
      isBestAtThisHotspot: cov?.bestHotspotId === hotspotId,
      isCritical: isLowCoverageSpecies(cov),
    });
  }

  return result;
}

const BEST_DAY_MIN_LEAD_PERCENT = 5;

export type DaySpeciesImportance = {
  isBestDay: boolean;
  isSubstantiallyBetterDay: boolean;
};

/**
 * Per-day, per-species importance for "Key targets today".
 * A species on a day is important when this day is the best chance on the trip and substantially better than other days.
 */
export function getDaySpeciesImportance(
  allTargets: HotspotTargetData[],
  itinerary: Day[]
): Map<number, Map<string, DaySpeciesImportance>> {
  const result = new Map<number, Map<string, DaySpeciesImportance>>();

  if (!allTargets?.length || !itinerary?.length) return result;

  // Best percent for each (speciesCode, dayIndex)
  const speciesCodes = new Set<string>();
  for (const t of allTargets) {
    for (const item of t.items ?? []) speciesCodes.add(item.code);
  }

  const getPercent = (hotspotId: string, code: string): number =>
    allTargets.find((t) => t.hotspotId === hotspotId)?.items.find((it) => it.code === code)?.percent ?? 0;

  for (const code of speciesCodes) {
    const dayBestPercents: { dayIndex: number; bestPercent: number }[] = [];
    for (let dayIndex = 0; dayIndex < itinerary.length; dayIndex++) {
      const day = itinerary[dayIndex];
      const hotspotIds = (day.locations ?? [])
        .filter((loc) => loc.type === "hotspot")
        .map((loc) => loc.locationId);
      let bestPercent = 0;
      for (const hid of hotspotIds) {
        const p = getPercent(hid, code);
        if (p > bestPercent) bestPercent = p;
      }
      dayBestPercents.push({ dayIndex, bestPercent });
    }
    const sorted = [...dayBestPercents].sort((a, b) => b.bestPercent - a.bestPercent);
    const top = sorted[0];
    if (!top || top.bestPercent === 0) continue;
    const secondBestPercent = sorted[1]?.bestPercent ?? 0;
    const isSubstantiallyBetter = top.bestPercent - secondBestPercent >= BEST_DAY_MIN_LEAD_PERCENT;

    for (const { dayIndex, bestPercent } of dayBestPercents) {
      if (bestPercent === 0) continue;
      if (!result.has(dayIndex)) result.set(dayIndex, new Map());
      result.get(dayIndex)!.set(code, {
        isBestDay: dayIndex === top.dayIndex,
        isSubstantiallyBetterDay: dayIndex === top.dayIndex && isSubstantiallyBetter,
      });
    }
  }

  return result;
}

export type BestHotspotRow = {
  hotspotId: string;
  hotspotName: string;
  percent: number;
  N: number;
};

/**
 * Best saved hotspots for a species (trip dates only).
 * Returns ranked list of hotspots where species is >= cutoff, sorted by percent descending.
 */
export function getBestHotspotsForSpecies(
  speciesCode: string,
  allTargets: HotspotTargetData[],
  locationIds: string[],
  hotspots: { id: string; name: string }[]
): BestHotspotRow[] {
  return allTargets
    .filter(
      (t) =>
        t.hotspotId &&
        locationIds.includes(t.hotspotId) &&
        (t.items.find((it) => it.code === speciesCode)?.percent ?? 0) >= HOTSPOT_TARGET_CUTOFF
    )
    .map((t) => {
      const item = t.items.find((it) => it.code === speciesCode);
      const hotspot = hotspots.find((h) => h.id === t.hotspotId);
      return {
        hotspotId: t.hotspotId!,
        hotspotName: hotspot?.name ?? "Hotspot",
        percent: item?.percent ?? 0,
        N: t.N,
      };
    })
    .sort((a, b) => b.percent - a.percent);
}

/**
 * All saved hotspots where a species appears (trip dates only), any frequency.
 * Used for hover fallback when species is below 5% at every hotspot.
 */
export function getAllHotspotsForSpecies(
  speciesCode: string,
  allTargets: HotspotTargetData[],
  locationIds: string[],
  hotspots: { id: string; name: string }[]
): BestHotspotRow[] {
  return allTargets
    .filter(
      (t) =>
        t.hotspotId &&
        locationIds.includes(t.hotspotId) &&
        (t.items.find((it) => it.code === speciesCode)?.percent ?? 0) > 0
    )
    .map((t) => {
      const item = t.items.find((it) => it.code === speciesCode);
      const hotspot = hotspots.find((h) => h.id === t.hotspotId);
      return {
        hotspotId: t.hotspotId!,
        hotspotName: hotspot?.name ?? "Hotspot",
        percent: item?.percent ?? 0,
        N: t.N,
      };
    })
    .sort((a, b) => b.percent - a.percent);
}
