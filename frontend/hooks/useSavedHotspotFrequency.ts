import { useQueries } from "@tanstack/react-query";
import { OPENBIRDING_API_URL } from "lib/config";
import { computeFrequency, getMonthRange } from "lib/targets";
import { mergeBestFrequency } from "lib/coverage";
import { useTrip } from "hooks/useTrip";
import type { OpenBirdingLocationResponse } from "@birdplan/shared";

export default function useSavedHotspotFrequency(enabled: boolean) {
  const { trip } = useTrip();
  const hotspotIds = trip?.hotspots.map((it) => it.id) ?? [];
  const months = trip ? getMonthRange(trip.startMonth, trip.endMonth) : [];

  const results = useQueries({
    queries: hotspotIds.map((id) => ({
      queryKey: [`${OPENBIRDING_API_URL}/api/v1/targets/location/${id}`],
      enabled: enabled && !!OPENBIRDING_API_URL,
      staleTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
    })),
  });

  const perHotspot = results.flatMap(({ data }) => {
    const response = data as OpenBirdingLocationResponse | undefined;
    if (!response) return [];
    return [new Map(response.items.map((it) => [it.code, computeFrequency(it.obs, response.samples, months)]))];
  });

  return {
    bestFrequency: mergeBestFrequency(perHotspot),
    isLoading: results.some((it) => it.isLoading),
  };
}
