import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { isToday, isTomorrow, isYesterday, isPast, isFuture } from "./calculations.js";

/**
 * Rails covers `today?` / `tomorrow?` / `yesterday?` / `past?` / `future?`
 * from `DateExtCalculationsTest` and `TimeExtCalculationsTest`, whose ported
 * names already live in `date-ext.test.ts`. These are the trails-side cases for
 * the mixin's own arm, kept out of the mirrored files so no ported test name is
 * duplicated.
 */
describe("DateAndTime::Calculations predicates (trails)", () => {
  const today = Temporal.Now.plainDateISO();

  it("today? is true only for the current day", () => {
    expect(isToday(today.subtract({ days: 1 }))).toBe(false);
    expect(isToday(today)).toBe(true);
    expect(isToday(today.add({ days: 1 }))).toBe(false);
  });

  it("tomorrow? and yesterday? key off Date.current", () => {
    expect(isTomorrow(today.add({ days: 1 }))).toBe(true);
    expect(isTomorrow(today)).toBe(false);
    expect(isYesterday(today.subtract({ days: 1 }))).toBe(true);
    expect(isYesterday(today)).toBe(false);
  });

  it("past? and future? compare against the class's current", () => {
    expect(isPast(today.subtract({ days: 1 }))).toBe(true);
    expect(isPast(today.add({ days: 1 }))).toBe(false);
    expect(isFuture(today.add({ days: 1 }))).toBe(true);
    expect(isFuture(today.subtract({ days: 1 }))).toBe(false);
    expect(isPast(new Date(Date.now() - 1000))).toBe(true);
    expect(isFuture(new Date(Date.now() + 60_000))).toBe(true);
  });
});
