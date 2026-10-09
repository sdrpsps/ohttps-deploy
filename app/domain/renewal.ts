import { isWithinRenewalWindow } from "./certificate";

const DAY_MS = 24 * 60 * 60 * 1000;

export function shouldScheduleSync(input: { expiresAt?: Date | null; lastCheckedAt?: Date | null; now?: Date; renewBeforeDays: number; minimumIntervalSeconds: number }) {
  const now = input.now ?? new Date();
  if (input.expiresAt && !isWithinRenewalWindow(input.expiresAt, now, input.renewBeforeDays * DAY_MS)) return false;
  // A successful check can return the old certificate. Keep checking until renewal.
  // Legacy per-version markers must never suppress future renewal checks.
  return !input.lastCheckedAt || now.getTime() - input.lastCheckedAt.getTime() >= input.minimumIntervalSeconds * 1000;
}
