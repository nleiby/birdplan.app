const LOW_FREQUENCY = 5;

export function mergeBestFrequency(perHotspot: Map<string, number>[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const hotspot of perHotspot) {
    for (const [code, frequency] of hotspot) {
      best.set(code, Math.max(best.get(code) ?? 0, frequency));
    }
  }
  return best;
}

export function isHardToFind(bestFrequency?: number) {
  return (bestFrequency ?? 0) < LOW_FREQUENCY;
}
