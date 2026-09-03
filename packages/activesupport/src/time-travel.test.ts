import { describe, it, expect, afterEach } from "vitest";

import { DateTime, Date as RubyDate, Temporal, Time } from "@blazetrails/date";
import { travelTo, travelBack, travel, freezeTime } from "./testing/time-helpers.js";
import {
  currentTime,
  currentTimeInstant,
  setFrozenInstant,
  setTimeOffsetNs,
} from "./time-travel.js";

function instantOf(time: Time): bigint {
  return time.toTime().epochNanoseconds;
}

describe("TimeTravelTest", () => {
  afterEach(() => {
    travelBack();
  });

  it("time helper travel", () => {
    const before = Date.now();
    travel(24 * 60 * 60 * 1000);
    const after = currentTime().getTime();
    expect(after - before).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
  });

  it("time helper travel with block", () => {
    let inside: Date | null = null;
    travel(1000, {}, () => {
      inside = currentTime();
      expect(instantOf(Time.new("2000-12-31 23:59:59.56789", { precision: 3 }))).toBe(
        instantOf(Time.new("2000-12-31 23:59:59.567")),
      );
    });
    expect(inside).not.toBeNull();
    expect(instantOf(Time.new("2000-12-31 23:59:59.56789", { precision: 3 }))).toBe(
      instantOf(Time.new("2000-12-31 23:59:59.567")),
    );
  });

  it("time helper travel to", () => {
    const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);
    travelTo(expectedTime);

    expect(Time.now().toS()).toEqual(expectedTime.toS());
    expect(Time.new().toS()).toEqual(expectedTime.toS());
    expect(Time.new(2004, 11, 25).toS()).not.toEqual(expectedTime.toS());
    expect(Time.new({ precision: 3 }).toS()).not.toEqual(expectedTime.toS());
    expect(RubyDate.today().toString()).toEqual(new RubyDate(2004, 11, 24).toDate().toString());
    expect(DateTime.now().toString()).toEqual(expectedTime.toDatetime().toString());
    expect(currentTime().getUTCFullYear()).toBe(2004);
  });

  it("time helper travel to with block", () => {
    const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);

    travelTo(expectedTime, {}, () => {
      expect(Time.now().toS()).toEqual(expectedTime.toS());
      expect(Time.new().toS()).toEqual(expectedTime.toS());
      expect(Time.new({ precision: 3 }).toS()).not.toEqual(expectedTime.toS());
      expect(Time.new(2004, 11, 25).toS()).not.toEqual(expectedTime.toS());
      expect(RubyDate.today().toString()).toEqual(new RubyDate(2004, 11, 24).toDate().toString());
      expect(DateTime.now().toString()).toEqual(expectedTime.toDatetime().toString());
      expect(currentTime().getUTCFullYear()).toBe(2004);
    });

    expect(Time.now().toS()).not.toEqual(expectedTime.toS());
    expect(Time.new().toS()).not.toEqual(expectedTime.toS());
    expect(RubyDate.today().toString()).not.toEqual(new RubyDate(2004, 11, 24).toDate().toString());
    expect(DateTime.now().toString()).not.toEqual(expectedTime.toDatetime().toString());
  });

  it.skip("time helper travel to with time zone");
  it.skip("time helper travel to with different system and application time zones");
  it.skip("time helper travel to with string for time zone");

  it("time helper travel to with string and milliseconds", () => {
    const target = new Date("2033-03-15T10:30:00Z");
    travelTo(target);
    expect(currentTime().getUTCFullYear()).toBe(2033);
    expect(currentTime().getUTCMonth()).toBe(2);
  });

  it.skip("time helper travel to with separate class");

  it("time helper travel back", () => {
    const before = new Date();
    travelTo(new Date("2050-01-01"));
    travelBack();
    expect(Math.abs(currentTime().getTime() - before.getTime())).toBeLessThan(5000);
  });

  it("time helper travel back with block", () => {
    travelTo(new Date("2040-01-01"), {}, () => {
      expect(currentTime().getUTCFullYear()).toBe(2040);
    });
    expect(currentTime().getUTCFullYear()).not.toBe(2040);
  });

  it("time helper travel to with nested calls with blocks", () => {
    travelTo(new Date("2035-01-01"), {}, () => {
      expect(currentTime().getUTCFullYear()).toBe(2035);
      expect(() => travelTo(new Date("2036-01-01"), {}, () => {})).toThrow(
        /Calling `travel_to` with a block, when we have previously already made a call to `travel_to`, can lead to confusing time stubbing\./,
      );
    });
  });

  it("time helper travel to with nested calls", () => {
    travelTo(new Date("2037-01-01"));
    expect(currentTime().getUTCFullYear()).toBe(2037);
    travelTo(new Date("2038-01-01"));
    expect(currentTime().getUTCFullYear()).toBe(2038);
  });

  it("time helper travel to with subsequent calls", () => {
    travelTo(new Date("2035-01-01"));
    expect(currentTime().getUTCFullYear()).toBe(2035);
    travelTo(new Date("2036-01-01"));
    expect(currentTime().getUTCFullYear()).toBe(2036);
  });

  it("time helper travel to with usec", () => {
    const target = new Date(2004, 10, 24, 1, 4, 44, 100);
    travelTo(target);
    expect(currentTime().getFullYear()).toBe(2004);
    expect(currentTime().getMilliseconds()).toBe(0);
  });

  it("time helper with usec true", () => {
    const target = new Date(2004, 10, 24, 1, 4, 44, 250);
    travelTo(target, { withUsec: true });
    expect(currentTime().getMilliseconds()).toBe(250);
  });

  it("time helper travel to with datetime and usec", () => {
    const target = new Date(2004, 10, 24, 1, 4, 44, 100);
    travelTo(target);
    expect(currentTime().getSeconds()).toBe(44);
    expect(currentTime().getMilliseconds()).toBe(0);
  });

  it("time helper travel to with datetime and usec true", () => {
    const target = new Date(2004, 10, 24, 1, 4, 44, 333);
    travelTo(target, { withUsec: true });
    expect(currentTime().getMilliseconds()).toBe(333);
  });

  it("time helper travel to with string and usec", () => {
    const target = new Date("2004-11-24T01:04:44.100Z");
    travelTo(target);
    expect(currentTime().getUTCMilliseconds()).toBe(0);
  });

  it("time helper travel to with string and usec true", () => {
    const target = new Date("2004-11-24T01:04:44.500Z");
    travelTo(target, { withUsec: true });
    expect(currentTime().getUTCMilliseconds()).toBe(500);
  });

  it("time helper freeze time with usec true", () => {
    freezeTime();
    const t = currentTime();
    expect(t instanceof Date).toBe(true);
  });

  it("time helper travel with subsequent block", () => {
    const results: number[] = [];
    travelTo(new Date("2041-01-01"), {}, () => {
      results.push(currentTime().getUTCFullYear());
    });
    travelTo(new Date("2042-01-01"), {}, () => {
      results.push(currentTime().getUTCFullYear());
    });
    expect(results).toEqual([2041, 2042]);
  });

  it("travel to will reset the usec to avoid mysql rounding", () => {
    const target = new Date(2004, 10, 24, 1, 4, 44, 500);
    travelTo(target);
    expect(currentTime().getFullYear()).toBe(2004);
    expect(currentTime().getSeconds()).toBe(44);
    expect(currentTime().getMilliseconds()).toBeLessThanOrEqual(500);
  });

  it("time helper travel with time subclass", () => {
    travelTo(new Date("2035-01-01T00:00:00Z"));
    expect(currentTime().getUTCFullYear()).toBe(2035);
  });

  it("time helper freeze time", () => {
    freezeTime();
    const t1 = currentTime().getTime();
    const t2 = currentTime().getTime();
    expect(Math.abs(t2 - t1)).toBeLessThan(10);
  });

  it("time helper freeze time with block", () => {
    let frozen: Date | null = null;
    freezeTime({}, () => {
      frozen = currentTime();
    });
    expect(frozen).not.toBeNull();
  });

  it("time helper unfreeze time", () => {
    freezeTime();
    travelBack();
    expect(Math.abs(currentTime().getTime() - Date.now())).toBeLessThan(100);
  });

  it("currentTimeInstant returns Temporal.Instant", () => {
    expect(currentTimeInstant()).toBeInstanceOf(Temporal.Instant);
  });

  it("currentTimeInstant respects frozen instant at nanosecond precision", () => {
    const baseMs = Date.UTC(2030, 0, 1, 0, 0, 0);
    const baseNs = BigInt(baseMs) * 1_000_000n + 123_456n;
    const frozen = Temporal.Instant.fromEpochNanoseconds(baseNs);
    setFrozenInstant(frozen);
    try {
      expect(currentTimeInstant().epochNanoseconds).toBe(baseNs);
    } finally {
      setFrozenInstant(null);
    }
  });

  it("currentTimeInstant respects nanosecond time offset", () => {
    const offsetNs = 365n * 24n * 3600n * 1_000_000_000n + 42n;
    const before = Temporal.Now.instant().epochNanoseconds;
    setTimeOffsetNs(offsetNs);
    try {
      const traveled = currentTimeInstant().epochNanoseconds;
      const drift = traveled - before - offsetNs;
      expect(drift).toBeGreaterThanOrEqual(-1_000_000_000n);
      expect(drift).toBeLessThanOrEqual(1_000_000_000n);
    } finally {
      setTimeOffsetNs(0n);
    }
  });
});
