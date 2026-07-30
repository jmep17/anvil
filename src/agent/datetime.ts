/**
 * The model has no clock and its training cutoff is not "now", so the current
 * date and time go into the system prompt on every turn.
 */

/** UK time, which follows GMT/BST automatically. */
export const DEFAULT_TIMEZONE = "Europe/London";

/** True when the IANA zone is one this runtime can actually format. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the configured zone to one that can be formatted. `auto` follows the
 * host; an unusable value falls back rather than throwing mid-turn.
 */
export function resolveTimeZone(configured: string): string {
  if (configured === "auto") {
    const host = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return host && isValidTimeZone(host) ? host : "UTC";
  }
  return isValidTimeZone(configured) ? configured : DEFAULT_TIMEZONE;
}

function partsOf(now: Date, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, ...options }).formatToParts(now);
}

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

/** `UTC+01:00`, or `UTC` when there is no offset. */
export function utcOffset(now: Date, timeZone: string): string {
  const value = part(
    partsOf(now, timeZone, { timeZoneName: "longOffset" }),
    "timeZoneName",
  );
  // Intl renders these as GMT / GMT+01:00.
  const normalized = value.replace(/^GMT/, "UTC");
  return normalized === "UTC" || normalized === "" ? "UTC" : normalized;
}

/** `BST`, `GMT`, `CEST` — the abbreviation people actually say. */
export function zoneAbbreviation(now: Date, timeZone: string): string {
  return part(partsOf(now, timeZone, { timeZoneName: "short" }), "timeZoneName");
}

/**
 * `Thursday, 30 July 2026 at 17:42 (BST, UTC+01:00)` — unambiguous without
 * needing the model to know which abbreviation is in force.
 */
export function formatDateTime(now: Date, timeZone: string): string {
  const zone = resolveTimeZone(timeZone);
  const parts = partsOf(now, zone, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const date = `${part(parts, "weekday")}, ${part(parts, "day")} ${part(parts, "month")} ${part(parts, "year")}`;
  const time = `${part(parts, "hour")}:${part(parts, "minute")}`;
  const abbreviation = zoneAbbreviation(now, zone);
  const offset = utcOffset(now, zone);
  const suffix = abbreviation && abbreviation !== offset ? `${abbreviation}, ${offset}` : offset;

  return `${date} at ${time} (${suffix})`;
}

/** `2026-07-30` in the given zone, for anything that wants a bare date. */
export function isoDate(now: Date, timeZone: string): string {
  const parts = partsOf(now, resolveTimeZone(timeZone), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

/** The full line placed in the system prompt. */
export function describeNow(now: Date, timeZone: string): string {
  const zone = resolveTimeZone(timeZone);
  return `${formatDateTime(now, zone)} · ${isoDate(now, zone)} · ${zone}`;
}
