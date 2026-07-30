import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TIMEZONE,
  describeNow,
  describeToday,
  formatDateTime,
  formatTimeOfDay,
  isValidTimeZone,
  isoDate,
  resolveTimeZone,
  utcOffset,
  zoneAbbreviation,
} from "./datetime.ts";

// Mid-summer and mid-winter, so British Summer Time is actually exercised.
const SUMMER = new Date("2026-07-30T16:42:00Z");
const WINTER = new Date("2026-01-15T09:05:00Z");

describe("formatDateTime in UK time", () => {
  test("applies British Summer Time in summer", () => {
    const text = formatDateTime(SUMMER, DEFAULT_TIMEZONE);
    // 16:42 UTC is 17:42 in BST.
    expect(text).toContain("Thursday, 30 July 2026 at 17:42");
    expect(text).toContain("UTC+01:00");
  });

  test("falls back to GMT in winter", () => {
    const text = formatDateTime(WINTER, DEFAULT_TIMEZONE);
    expect(text).toContain("15 January 2026 at 09:05");
    expect(text).toContain("UTC");
    expect(text).not.toContain("UTC+01:00");
  });

  test("uses a 24-hour clock so afternoon is unambiguous", () => {
    expect(formatDateTime(SUMMER, DEFAULT_TIMEZONE)).not.toMatch(/\b(am|pm|AM|PM)\b/);
  });

  test("names the weekday, which is what date arithmetic usually needs", () => {
    expect(formatDateTime(WINTER, DEFAULT_TIMEZONE)).toContain("Thursday");
  });
});

describe("utcOffset", () => {
  test("reports the offset in force at that moment", () => {
    expect(utcOffset(SUMMER, "Europe/London")).toBe("UTC+01:00");
    expect(utcOffset(WINTER, "Europe/London")).toBe("UTC");
  });

  test("handles zones ahead of and behind UTC", () => {
    expect(utcOffset(SUMMER, "Europe/Berlin")).toBe("UTC+02:00");
    expect(utcOffset(SUMMER, "America/New_York")).toBe("UTC-04:00");
    expect(utcOffset(SUMMER, "UTC")).toBe("UTC");
  });
});

describe("zoneAbbreviation", () => {
  test("distinguishes summer from winter in the UK", () => {
    expect(zoneAbbreviation(SUMMER, "Europe/London")).not.toBe(
      zoneAbbreviation(WINTER, "Europe/London"),
    );
  });
});

describe("isoDate", () => {
  test("gives the date in the target zone, not UTC", () => {
    // 23:30 UTC on the 30th is already the 31st in Sydney.
    const lateEvening = new Date("2026-07-30T23:30:00Z");
    expect(isoDate(lateEvening, "Europe/London")).toBe("2026-07-31");
    expect(isoDate(lateEvening, "Australia/Sydney")).toBe("2026-07-31");
    expect(isoDate(lateEvening, "America/Los_Angeles")).toBe("2026-07-30");
  });

  test("zero-pads so the value sorts", () => {
    expect(isoDate(new Date("2026-01-05T12:00:00Z"), "Europe/London")).toBe("2026-01-05");
  });
});

describe("resolveTimeZone", () => {
  test("auto follows the host", () => {
    const resolved = resolveTimeZone("auto");
    expect(isValidTimeZone(resolved)).toBe(true);
  });

  test("an explicit zone is honoured", () => {
    expect(resolveTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });

  test("an unusable zone falls back to UK time rather than throwing", () => {
    expect(resolveTimeZone("Mars/Olympus_Mons")).toBe(DEFAULT_TIMEZONE);
    expect(resolveTimeZone("")).toBe(DEFAULT_TIMEZONE);
  });
});

describe("isValidTimeZone", () => {
  test("accepts real zones and rejects nonsense", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Nowhere/Nothing")).toBe(false);
  });
});

describe("describeNow", () => {
  test("carries the human form, a sortable date, and the zone", () => {
    const text = describeNow(SUMMER, DEFAULT_TIMEZONE);
    expect(text).toContain("Thursday, 30 July 2026 at 17:42");
    expect(text).toContain("2026-07-30");
    expect(text).toContain("Europe/London");
  });

  test("never throws on a bad zone", () => {
    expect(() => describeNow(SUMMER, "not/a/zone")).not.toThrow();
  });
});

/**
 * `describeToday` is the string that goes into the system prompt, which is the
 * prompt prefix a local server caches its KV state against. If it changed with
 * the clock, almost every turn would arrive with a different prefix and force
 * the whole context to be re-encoded before generation could start.
 */
describe("describeToday", () => {
  test("holds steady across a whole day", () => {
    const morning = new Date("2026-07-30T06:00:00Z");
    const evening = new Date("2026-07-30T21:30:00Z");
    expect(describeToday(morning, DEFAULT_TIMEZONE)).toBe(
      describeToday(evening, DEFAULT_TIMEZONE),
    );
  });

  test("carries no time of day at all", () => {
    const text = describeToday(SUMMER, DEFAULT_TIMEZONE);
    expect(text).toContain("Thursday, 30 July 2026");
    expect(text).toContain("2026-07-30");
    expect(text).toContain("Europe/London");
    expect(text).not.toMatch(/\d{2}:\d{2}/);
  });

  test("still turns over at local midnight, not UTC midnight", () => {
    // 23:30 UTC in summer is 00:30 the next day in British Summer Time.
    const lateUtc = new Date("2026-07-30T23:30:00Z");
    expect(describeToday(lateUtc, DEFAULT_TIMEZONE)).toContain("2026-07-31");
  });
});

describe("formatTimeOfDay", () => {
  test("is the part that changes, named with its zone", () => {
    expect(formatTimeOfDay(SUMMER, DEFAULT_TIMEZONE)).toBe("17:42 (BST, UTC+01:00)");
    expect(formatTimeOfDay(WINTER, DEFAULT_TIMEZONE)).toBe("09:05 (GMT, UTC)");
  });
});
