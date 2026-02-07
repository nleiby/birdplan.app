/**
 * Inclusive day count for a date range (start and end dates both count).
 * @param startDateStr - ISO date string
 * @param endDateStr - ISO date string
 */
export function daysBetweenInclusive(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1;
}
