import { Trip } from "@birdplan/shared";
import { customAlphabet } from "nanoid";

export { months, fullMonths, formatTime, formatDistance, dateTimeToRelative } from "lib/format";
export {
  calculateSpeciesCoverage,
  isLowCoverageSpecies,
  getHotspotSpeciesImportance,
  getDaySpeciesImportance,
  getBestHotspotsForSpecies,
  getAllHotspotsForSpecies,
  type SpeciesCoverage,
  type HotspotSpeciesImportance,
  type DaySpeciesImportance,
  type BestHotspotRow,
} from "lib/coverage";

export const englishCountries = [
  "US",
  "CA",
  "AU",
  "GB",
  "NZ",
  "IE",
  "GH",
  "SG",
  "BZ",
  "ZA",
  "IN",
  "DM",
  "MT",
  "AG",
  "KE",
  "JM",
  "GD",
  "GY",
  "BW",
  "LR",
  "BB",
  "CM",
  "NG",
  "GM",
  "TT",
  "BS",
];

export const isRegionEnglish = (region: string) => {
  const regionCode = region.split(",")[0];
  const countryCode = regionCode.split("-")[0];
  return englishCountries.includes(countryCode);
};

export function truncate(string: string, length: number): string {
  return string.length > length ? `${string.substring(0, length)}...` : string;
}

export const markerColors = [
  "#bcbcbc",
  "#8f9ca0",
  "#9bc4cf",
  "#aaddeb",
  "#c7e466",
  "#eaeb1f",
  "#fac500",
  "#e57701",
  "#ce0d02",
  "#ad0002",
];

export const getMarkerColor = (count: number) => {
  if (count === 0) return markerColors[0];
  if (count <= 15) return markerColors[1];
  if (count <= 50) return markerColors[2];
  if (count <= 100) return markerColors[3];
  if (count <= 150) return markerColors[4];
  if (count <= 200) return markerColors[5];
  if (count <= 250) return markerColors[6];
  if (count <= 300) return markerColors[7];
  if (count <= 400) return markerColors[8];
  if (count <= 1000) return markerColors[9];
  return markerColors[0];
};

export const getMarkerColorIndex = (count: number) => {
  const color = getMarkerColor(count);
  return markerColors.indexOf(color);
};

export const radiusOptions = [
  { label: "20 mi", value: 20 },
  { label: "50 mi", value: 50 },
  { label: "100 mi", value: 100 },
  { label: "200 mi", value: 200 },
  { label: "300 mi", value: 300 },
  { label: "400 mi", value: 400 },
  { label: "500 mi", value: 500 },
];

export const getLatLngFromBounds = (bounds?: Trip["bounds"]) => {
  if (!bounds) return { lat: null, lng: null };
  const { minX, minY, maxX, maxY } = bounds;
  const lat = (minY + maxY) / 2;
  const lng = (minX + maxX) / 2;
  return { lat, lng };
};

export const nanoId = (length: number = 16) => {
  return customAlphabet("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", length)();
};

//https://decipher.dev/30-seconds-of-typescript/docs/debounce/
export const debounce = (fn: Function, ms = 300) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function (this: any, ...args: any[]) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), ms);
  };
};

export function getRandomItemsFromArray(arr: any[], count: number): any[] {
  const result: string[] = [];

  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * arr.length);
    result.push(arr[randomIndex]);
  }

  return result;
}

export function getGooglePlaceUrl(lat: number, lng: number, placeId?: string) {
  return placeId
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${placeId}`
    : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** Google Maps allows up to 9 waypoints (11 stops total). Returns null if fewer than 2 points. */
export function getGoogleMapsFullDayRouteUrl(
  points: { lat: number; lng: number }[]
): string | null {
  if (points.length < 2) return null;
  const capped = points.slice(0, 11);
  const origin = `${capped[0].lat},${capped[0].lng}`;
  const destination = `${capped[capped.length - 1].lat},${capped[capped.length - 1].lng}`;
  const waypoints =
    capped.length > 2
      ? capped
          .slice(1, -1)
          .map((p) => `${p.lat},${p.lng}`)
          .join("|")
      : undefined;
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Google Static Maps URL for a day's route: path through points + markers. For at-a-glance print overview. */
export function getGoogleStaticMapRouteUrl(
  points: { lat: number; lng: number }[],
  size: { width: number; height: number } = { width: 550, height: 250 }
): string | null {
  if (points.length === 0) return null;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) return null;
  const params = new URLSearchParams();
  params.set("size", `${size.width}x${size.height}`);
  params.set("key", key);
  params.set("scale", "2"); // retina
  const pathSegment = points.map((p) => `${p.lat},${p.lng}`).join("|");
  if (points.length >= 2) {
    params.set("path", `color:0x1e40af|weight:4|${pathSegment}`);
  }
  params.set("markers", pathSegment);
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
