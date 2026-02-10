import React from "react";
import { Header, Body } from "providers/modals";
import { useTrip } from "providers/trip";
import MarkerWithIcon from "components/MarkerWithIcon";
import { useModal } from "providers/modals";
import useTripMutation from "hooks/useTripMutation";
import { nanoId } from "lib/helpers";
import { MarkerIconT, markerIconColors } from "lib/icons";
import clsx from "clsx";

type Props = {
  dayId: string;
  insertAfterId?: string | null;
};

const nameCompare = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

type AddLocationPayload = { type: "hotspot" | "marker"; locationId: string; id: string; insertAfterId?: string | null };

type LocationEntry = { id: string; type: "hotspot" | "marker"; locationId: string };

function insertLocationAt<T extends LocationEntry>(
  locations: T[],
  newEntry: LocationEntry,
  insertAfterId: string | null | undefined
): (T | LocationEntry)[] {
  if (insertAfterId === null) {
    return [newEntry, ...locations];
  }
  if (typeof insertAfterId === "string") {
    const idx = locations.findIndex((loc) => loc.id === insertAfterId);
    if (idx === -1) return [...locations, newEntry];
    return [...locations.slice(0, idx + 1), newEntry, ...locations.slice(idx + 1)];
  }
  return [...locations, newEntry];
}

export default function AddItineraryLocation({ dayId, insertAfterId }: Props) {
  const { close } = useModal();
  const { trip } = useTrip();

  const addDayMutation = useTripMutation<AddLocationPayload>({
    url: `/trips/${trip?._id}/itinerary/${dayId}/add-location`,
    method: "POST",
    mutationKey: [`/trips/${trip?._id}/itinerary/${dayId}/add-location`],
    updateCache: (old, input) => {
      const { insertAfterId: _ins, ...rest } = input;
      const locationEntry: LocationEntry = { type: rest.type, locationId: rest.locationId, id: rest.id };
      const position = _ins !== undefined ? _ins : insertAfterId;
      return {
        ...old,
        itinerary:
          old.itinerary?.map((it) =>
            it.id === dayId
              ? { ...it, locations: insertLocationAt(it.locations || [], locationEntry, position) }
              : it
          ) || [],
      };
    },
  });

  const sortedMarkers = React.useMemo(
    () => [...(trip?.markers ?? [])].sort(nameCompare),
    [trip?.markers]
  );
  const sortedHotspots = React.useMemo(
    () => [...(trip?.hotspots ?? [])].sort(nameCompare),
    [trip?.hotspots]
  );
  const locationIdsOnItinerary = React.useMemo(
    () =>
      new Set(
        trip?.itinerary?.flatMap((d) => d.locations?.map((l) => l.locationId) ?? []) ?? []
      ),
    [trip?.itinerary]
  );

  return (
    <>
      <Header>Add Location</Header>
      <Body>
        {!!trip?.hotspots?.length || !!trip?.markers?.length ? (
          <ul className="flex flex-col space-y-1">
            {sortedMarkers.map((marker) => (
              <li key={marker.id}>
                <button
                  className="flex items-center gap-2 text-sm cursor-pointer text-gray-700 w-full"
                  onClick={() => {
                    addDayMutation.mutate({
                      type: "marker",
                      locationId: marker.id,
                      id: nanoId(6),
                      ...(insertAfterId !== undefined && { insertAfterId }),
                    });
                    close();
                  }}
                >
                  <MarkerWithIcon
                    showStroke={false}
                    icon={marker.icon as MarkerIconT}
                    className="inline-block scale-75 flex-shrink-0"
                  />
                  <span className="truncate">{marker.name}</span>
                </button>
              </li>
            ))}
            {sortedHotspots.map((hotspot) => {
              const isOnItinerary = locationIdsOnItinerary.has(hotspot.id);
              return (
                <li key={hotspot.id}>
                  <button
                    className={clsx(
                      "flex items-center gap-2 text-sm cursor-pointer py-0.5 text-gray-700 w-full rounded",
                      isOnItinerary && "bg-sky-50"
                    )}
                    onClick={() => {
                      addDayMutation.mutate({
                        type: "hotspot",
                        locationId: hotspot.id,
                        id: nanoId(6),
                        ...(insertAfterId !== undefined && { insertAfterId }),
                      });
                      close();
                    }}
                  >
                    <MarkerWithIcon
                      showStroke={false}
                      icon="hotspot"
                      color={isOnItinerary ? undefined : markerIconColors.lightGray}
                      className="inline-block scale-75 flex-shrink-0"
                    />
                    <span className="truncate">{hotspot.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-center text-gray-500">You have not saved any hotspots or custom markers yet.</div>
        )}
      </Body>
    </>
  );
}
