import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { getTzByRegion } from "lib/tz";
dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

export const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fullMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "Novermber",
  "December",
];

export const formatTime = (time: number) => {
  const rounded = Math.round(time);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
};

export const formatDistance = (meters: number, metric: boolean) => {
  const distance = metric ? meters / 1000 : meters / 1609;
  const units = metric ? "km" : "mi";
  const rounded =
    distance > 10
      ? Math.round(distance)
      : distance > 1
      ? Math.round(distance * 10) / 10
      : Math.round(distance * 100) / 100;
  return `${rounded} ${units}`;
};

export const dateTimeToRelative = (date: string, regionCode: string, includeAgo?: boolean) => {
  const tz = getTzByRegion(regionCode);
  if (!regionCode || !date) return "";

  const today = dayjs().tz(tz).format("YYYY-MM-DD");
  const yesterday = dayjs().tz(tz).subtract(1, "day").format("YYYY-MM-DD");
  const tomorrow = dayjs().tz(tz).add(1, "day").format("YYYY-MM-DD");
  const dateFormatted = dayjs(date).tz(tz).format("YYYY-MM-DD");
  if (dateFormatted === today || dateFormatted === tomorrow) return "Today";
  if (dateFormatted === yesterday) return "Yesterday";
  const result = dayjs
    .tz(date, tz)
    .fromNow()
    .replace(includeAgo ? "" : " ago", "")
    .replace("an ", "1 ")
    .replace("a ", "1 ");

  return result;
};
