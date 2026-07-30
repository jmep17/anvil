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

/** `Thursday, 30 July 2026` — the part of "now" that holds for a whole day. */
export function formatDate(now: Date, timeZone: string): string {
  const parts = partsOf(now, resolveTimeZone(timeZone), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${part(parts, "weekday")}, ${part(parts, "day")} ${part(parts, "month")} ${part(parts, "year")}`;
}

/**
 * `17:42 (BST, UTC+01:00)` — the part that changes within a day. Named with
 * the zone so the model never has to work out which abbreviation is in force.
 */
export function formatTimeOfDay(now: Date, timeZone: string): string {
  const zone = resolveTimeZone(timeZone);
  const parts = partsOf(now, zone, { hour: "2-digit", minute: "2-digit", hour12: false });
  const time = `${part(parts, "hour")}:${part(parts, "minute")}`;
  const abbreviation = zoneAbbreviation(now, zone);
  const offset = utcOffset(now, zone);
  const suffix = abbreviation && abbreviation !== offset ? `${abbreviation}, ${offset}` : offset;
  return `${time} (${suffix})`;
}

/**
 * `Thursday, 30 July 2026 at 17:42 (BST, UTC+01:00)` — unambiguous without
 * needing the model to know which abbreviation is in force.
 */
export function formatDateTime(now: Date, timeZone: string): string {
  const zone = resolveTimeZone(timeZone);
  return `${formatDate(now, zone)} at ${formatTimeOfDay(now, zone)}`;
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

/** The full line, for `/status` and anywhere else the whole stamp is wanted. */
export function describeNow(now: Date, timeZone: string): string {
  const zone = resolveTimeZone(timeZone);
  return `${formatDateTime(now, zone)} · ${isoDate(now, zone)} · ${zone}`;
}

/**
 * The line placed in the system prompt. Deliberately date-only.
 *
 * The system prompt is the prompt prefix, and a local inference server caches
 * its KV state only for as long as that prefix is byte-identical. A timestamp
 * accurate to the minute meant almost every turn arrived with a different
 * prefix, forcing the whole context — prompt, tool schemas, conversation — to
 * be re-encoded before a single token could be generated. On a large context
 * window that is minutes of silence per turn. The exact time is appended to
 * the end of the messages instead, where it costs only its own tokens.
 */
export function describeToday(now: Date, timeZone: string): string {
  const zone = resolveTimeZone(timeZone);
  return `${formatDate(now, zone)} · ${isoDate(now, zone)} · ${zone}`;
}
