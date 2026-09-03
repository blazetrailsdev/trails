import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { Duration } from "@blazetrails/activesupport";
import { Error as ModelError } from "./error.js";
import { Range } from "@blazetrails/ruby-compat";

describe("Error option value equality", () => {
  const base = {} as never;

  it("compares two separately-constructed equal Ranges as equal", () => {
    const error = new ModelError(base, "name", ":too_long", { count: new Range(5, 20) });

    expect(error.match("name", ":too_long", { count: new Range(5, 20) })).toBe(true);
    expect(error.match("name", ":too_long", { count: new Range(5, 21) })).toBe(false);
    expect(error.match("name", ":too_long", { count: new Range(5, 20, true) })).toBe(false);
    expect(error.strictMatch("name", ":too_long", { count: new Range(5, 20) })).toBe(true);
    expect(
      error.equals(new ModelError(base, "name", ":too_long", { count: new Range(5, 20) })),
    ).toBe(true);
  });

  it("compares two separately-constructed equal Durations as equal", () => {
    const error = new ModelError(base, "startsAt", ":greater_than", { count: Duration.days(2) });

    expect(error.match("startsAt", ":greater_than", { count: Duration.days(2) })).toBe(true);
    expect(error.match("startsAt", ":greater_than", { count: Duration.days(3) })).toBe(false);
    expect(error.strictMatch("startsAt", ":greater_than", { count: Duration.days(2) })).toBe(true);
    expect(
      error.equals(new ModelError(base, "startsAt", ":greater_than", { count: Duration.days(2) })),
    ).toBe(true);
  });

  it("compares two separately-constructed equal Times as equal", () => {
    const at = () => Temporal.Instant.from("2026-08-20T00:00:00Z");
    const error = new ModelError(base, "startsAt", ":greater_than", { count: at() });

    expect(error.match("startsAt", ":greater_than", { count: at() })).toBe(true);
    expect(
      error.match("startsAt", ":greater_than", {
        count: Temporal.Instant.from("2026-08-21T00:00:00Z"),
      }),
    ).toBe(false);
    expect(error.strictMatch("startsAt", ":greater_than", { count: at() })).toBe(true);
    expect(error.equals(new ModelError(base, "startsAt", ":greater_than", { count: at() }))).toBe(
      true,
    );
  });
});
