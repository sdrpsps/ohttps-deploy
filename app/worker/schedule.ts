export function nextScanAt(current: number, now: number, intervalMinutes: number) {
  return now >= current ? now + intervalMinutes * 60_000 : current;
}
