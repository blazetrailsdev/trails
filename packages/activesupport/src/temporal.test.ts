import { describe, it, expect } from "vitest";
import { Temporal, isTemporal } from "./temporal.js";

describe("isTemporal", () => {
  it("is true for each of the five Temporal date/time types", () => {
    expect(isTemporal(Temporal.Instant.from("2026-04-26T14:23:55Z"))).toBe(true);
    expect(isTemporal(Temporal.PlainDateTime.from("2026-04-26T14:23:55"))).toBe(true);
    expect(isTemporal(Temporal.PlainDate.from("2026-04-26"))).toBe(true);
    expect(isTemporal(Temporal.PlainTime.from("14:23:55"))).toBe(true);
    expect(isTemporal(Temporal.ZonedDateTime.from("2026-04-26T14:23:55Z[UTC]"))).toBe(true);
  });

  it("is false for non-Temporal values", () => {
    expect(isTemporal(new Date())).toBe(false);
    expect(isTemporal("2026-04-26")).toBe(false);
    expect(isTemporal(null)).toBe(false);
    expect(isTemporal(undefined)).toBe(false);
    expect(isTemporal({ toISOString: () => "x" })).toBe(false);
  });
});
