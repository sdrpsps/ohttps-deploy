import { isWithinRenewalWindow } from "./certificate";

const DAY_MS = 24 * 60 * 60 * 1000;

export function shouldScheduleSync(input: { expiresAt?: Date | null; lastCheckedAt?: Date | null; now?: Date; renewBeforeDays: number; minimumIntervalSeconds: number; syncedForCurrentVersion?: boolean }) {
  const now = input.now ?? new Date();
  if (!input.expiresAt || !isWithinRenewalWindow(input.expiresAt, now, input.renewBeforeDays * DAY_MS)) return false;
  if (input.syncedForCurrentVersion) return false;
  return !input.lastCheckedAt || now.getTime() - input.lastCheckedAt.getTime() >= input.minimumIntervalSeconds * 1000;
}
