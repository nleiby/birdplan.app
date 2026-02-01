import React from "react";
import { Day } from "@birdplan/shared";
import { useTrip } from "providers/trip";
import { useHotspotTargets } from "providers/hotspot-targets";
import { useProfile } from "providers/profile";
import { getHotspotSpeciesImportance } from "lib/helpers";
import Icon from "components/Icon";

type Props = {
  day: Day;
};

type ImportantSpecies = {
  code: string;
  name: string;
  bestAtHotspotId: string | undefined;
  isCritical: boolean;
};

function getSpeciesName(code: string, allTargets: { items: { code: string; name: string }[] }[]): string {
  for (const t of allTargets) {
    const item = t.items.find((it) => it.code === code);
    if (item) return item.name;
  }
  return code;
}

export default function DayImportantTargets({ day }: Props) {
  const { trip } = useTrip();
  const { allTargets } = useHotspotTargets();
  const { lifelist } = useProfile();

  const hotspotIds = React.useMemo(
    () =>
      (day.locations ?? [])
        .filter((loc) => loc.type === "hotspot")
        .map((loc) => loc.locationId),
    [day.locations]
  );

  const importantSpecies = React.useMemo(() => {
    if (!allTargets?.length || !hotspotIds.length) return [];

    const byCode = new Map<string, ImportantSpecies>();

    for (const hotspotId of hotspotIds) {
      const importanceMap = getHotspotSpeciesImportance(allTargets, hotspotId);
      for (const [code, imp] of importanceMap) {
        if (!imp.isBestAtThisHotspot && !imp.isCritical) continue;
        const existing = byCode.get(code);
        const bestAtHotspotId = imp.isBestAtThisHotspot ? hotspotId : undefined;
        if (!existing) {
          byCode.set(code, {
            code,
            name: getSpeciesName(code, allTargets),
            bestAtHotspotId: bestAtHotspotId ?? undefined,
            isCritical: imp.isCritical,
          });
        } else {
          byCode.set(code, {
            ...existing,
            bestAtHotspotId: existing.bestAtHotspotId ?? bestAtHotspotId,
            isCritical: existing.isCritical || imp.isCritical,
          });
        }
      }
    }

    return Array.from(byCode.values())
      .filter((s) => !lifelist?.includes(s.code))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allTargets, hotspotIds, lifelist]);

  if (!importantSpecies.length) return null;

  return (
    <div className="mb-4 p-3 bg-amber-50/80 rounded-lg border border-amber-100">
      <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
        <Icon name="star" className="w-4 h-4 text-amber-500" />
        Key targets today
      </h3>
      <ul className="text-sm text-gray-700 space-y-1">
        {importantSpecies.map(({ code, name, bestAtHotspotId, isCritical }) => {
          const hotspot = trip?.hotspots?.find((h) => h.id === bestAtHotspotId);
          const sub = bestAtHotspotId
            ? ` — best at ${hotspot?.name ?? "this hotspot"}`
            : isCritical
              ? " — hard to see elsewhere"
              : "";
          return (
            <li key={code} className="flex items-center gap-1.5">
              <Icon name="star" className="w-3 h-3 text-amber-500 flex-shrink-0" />
              <span>
                {name}
                {sub && <span className="text-gray-500">{sub}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
