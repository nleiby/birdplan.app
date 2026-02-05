import React from "react";
import FavButton from "components/FavButton";
import MerlinkLink from "components/MerlinLink";
import { useTrip } from "providers/trip";
import { useHotspotTargets } from "providers/hotspot-targets";

type Props = {
  hotspotId: string;
};

type FavDisplay = {
  code: string;
  name: string;
  range: string;
  percent: number | null;
};

export default function HotspotFavs({ hotspotId }: Props) {
  const { trip, targets } = useTrip();
  const { allTargets } = useHotspotTargets();

  const favCodes = trip?.targetStars ?? [];
  if (!favCodes.length) return null;

  const hotspotTarget = allTargets?.find((t) => t.hotspotId === hotspotId);
  const hotspotItems = hotspotTarget?.items ?? [];
  const tripTargetItems = targets?.items ?? [];

  const favsWithDisplay: FavDisplay[] = favCodes
    .map((code) => {
      const atHotspot = hotspotItems.find((it) => it.code === code);
      const atTrip = tripTargetItems.find((it) => it.code === code);
      return {
        code,
        name: atHotspot?.name ?? atTrip?.name ?? code,
        range: atHotspot ? "Trip dates" : "—",
        percent: atHotspot?.percent ?? null,
      };
    })
    .filter((fav) => fav.percent != null && fav.percent > 0);

  if (!favsWithDisplay.length) return null;

  const sortedFavs = [...favsWithDisplay].sort((a, b) => {
    const pa = a.percent ?? 0;
    const pb = b.percent ?? 0;
    return pb - pa;
  });

  return (
    <div className="mt-8 mb-4">
      <h3 className="text-gray-900 text-sm font-bold mb-2">Favorites</h3>
      {sortedFavs.map(({ code, name, range, percent }) => (
        <div
          key={code}
          className="border-t last:border-b border-gray-100 py-1.5 text-gray-500/80 text-[13px] grid gap-2 grid-cols-1 sm:grid-cols-2 mx-1"
        >
          <div className="pt-2 text-gray-900 text-sm">
            <MerlinkLink code={code}>{name}</MerlinkLink>
          </div>
          <div className="flex gap-5">
            <FavButton hotspotId={hotspotId} code={code} name={name} range={range} percent={percent ?? 0} />
            <div className="flex flex-col gap-1 w-full col-span-2">
              <div>
                <span className="text-gray-600 text-[15px] font-bold">
                  {percent != null ? `${percent > 1 ? Math.round(percent) : percent}%` : "—"}{" "}
                  <span className="text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5 text-[10px]">{range}</span>
                </span>{" "}
              </div>
              <div className="w-full bg-gray-200">
                <div
                  className="h-2 bg-[#1c6900]"
                  style={{ width: percent != null ? `${Math.min(100, percent)}%` : "0%" }}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
