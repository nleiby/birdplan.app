import React from "react";
import { useQuery } from "@tanstack/react-query";
import { EBIRD_BASE_URL } from "lib/config";
import { TargetList } from "@birdplan/shared";

type Obs = {
  id: string;
  lat: number;
  lng: number;
  name: string; // Hotspot name
  isPersonal: boolean;
};

type Props = {
  region?: string;
  code?: string;
  allTargets?: TargetList[];
};

/**
 * Get a color index (0-9) based on frequency percentage.
 * Higher percentages = higher index = warmer colors
 */
function getFrequencyColorIndex(percent: number): number {
  if (percent >= 50) return 9;
  if (percent >= 40) return 8;
  if (percent >= 30) return 7;
  if (percent >= 20) return 6;
  if (percent >= 15) return 5;
  if (percent >= 10) return 4;
  if (percent >= 7) return 3;
  if (percent >= 5) return 2;
  if (percent > 0) return 1;
  return 0;
}

export default function useFetchSpeciesObs({ region, code, allTargets }: Props) {
  const { data } = useQuery<Obs[]>({
    queryKey: [`${EBIRD_BASE_URL}/data/obs/${region}/recent/${code}`, { back: 30, includeProvisional: true }],
    enabled: !!region && !!code,
    meta: {
      errorMessage: "Failed to load observations",
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const obs: Obs[] =
    data?.map(({ lat, lng, locId, locationPrivate, locName }: any) => ({
      lat,
      lng,
      id: locId,
      name: locName,
      isPersonal: locationPrivate,
    })) || [];

  const obsRef = React.useRef<Obs[]>([]);
  obsRef.current = obs;
  const hasFetched = obs.length > 0;

  // Build a map of hotspot ID -> frequency percentage for the selected species
  const frequencyMap = React.useMemo(() => {
    const map = new Map<string, number>();
    if (!allTargets || !code) return map;

    for (const target of allTargets) {
      if (!target.hotspotId) continue;
      const speciesItem = target.items.find((item) => item.code === code);
      if (speciesItem) {
        // Use percent (trip date range) rather than percentYr (all year)
        map.set(target.hotspotId, speciesItem.percent);
      }
    }
    return map;
  }, [allTargets, code]);

  const hasFrequencyData = frequencyMap.size > 0;

  const layer = hasFetched
    ? {
        type: "FeatureCollection",
        features: [
          ...obsRef.current.map((it) => {
            const frequency = frequencyMap.get(it.id) || 0;
            const colorIndex = hasFrequencyData ? getFrequencyColorIndex(frequency) : -1;
            return {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [it.lng, it.lat],
              },
              properties: {
                id: it.id,
                isPersonal: it.isPersonal ? "true" : "false",
                frequency,
                colorIndex,
                hasSavedData: frequencyMap.has(it.id) ? "true" : "false",
              },
            };
          }),
        ],
      }
    : null;

  return { obs, obsLayer: layer, hasFrequencyData };
}
