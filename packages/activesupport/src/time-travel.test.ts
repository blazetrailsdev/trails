import { describe, it, expect, afterEach } from "vitest";

import { travelTo, travelBack, travel, freezeTime, currentTime } from "./testing-helpers.js";

describe("TimeTravelTest", () => {
  afterEach(() => {
    travelBack();
  });

  it("time helper travel", () => {
    const before = Date.now();
    travel(24 * 60 * 60 * 1000); // 1 day
    const after = currentTime().getTime();
    expect(after - before).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 100);
  });

  it("time helper travel with block", () => {
    let inside: Date | null = null;
    travel(1000, () => {
      inside = currentTime();
    });
    expect(inside).not.toBeNull();
  });

  it("time helper travel to", () => {
    travelTo(new Date("2030-01-01T00:00:00Z"));
    expect(currentTime().getUTCFullYear()).toBe(2030);
  });

  it("time helper travel to with block", () => {
    let inside: Date | null = null;
    travelTo(new Date("2032-06-15T12:00:00Z"), () => {
      inside = currentTime();
    });
    expect(inside!.getUTCFullYear()).toBe(2032);
  });

  it.skip("time helper travel to with time zone");
  it.skip("time helper travel to with different system and application time zones");
  it.skip("time helper travel to with string for time zone");

  it("time helper travel to with string and milliseconds", () => {
    const target = new Date("2033-03-15T10:30:00Z");
    travelTo(target);
    expect(currentTime().getUTCFullYear()).toBe(2033);
    expect(currentTime().getUTCMonth()).toBe(2); // March = 2
  });

  it.skip("time helper travel to with separate class");

  it("time helper travel back", () => {
    const before = new Date();
    travelTo(new Date("2050-01-01"));
    travelBack();
    expect(Math.abs(currentTime().getTime() - before.getTime())).toBeLessThan(5000);
  });

  it("time helper travel back with block", () => {
    travelTo(new Date("2040-01-01"), () => {
      expect(currentTime().getUTCFullYear()).toBe(2040);
    });
    expect(currentTime().getUTCFullYear()).not.toBe(2040);
  });

  it("time helper travel to with nested calls with blocks", () => {
    travelTo(new Date("2035-01-01"), () => {
      expect(currentTime().getUTCFullYear()).toBe(2035);
      travelTo(new Date("2036-01-01"), () => {
        expect(currentTime().getUTCFullYear()).toBe(2036);
      });
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

  it.skip("time helper travel to with usec");
  it.skip("time helper with usec true");
  it.skip("time helper travel to with datetime and usec");
  it.skip("time helper travel to with datetime and usec true");
  it.skip("time helper travel to with string and usec");
  it.skip("time helper travel to with string and usec true");
  it.skip("time helper freeze time with usec true");

  it("time helper travel with subsequent block", () => {
    const results: number[] = [];
    travelTo(new Date("2041-01-01"), () => {
      results.push(currentTime().getUTCFullYear());
    });
    travelTo(new Date("2042-01-01"), () => {
      results.push(currentTime().getUTCFullYear());
    });
    expect(results).toEqual([2041, 2042]);
  });

  it.skip("travel to will reset the usec to avoid mysql rounding");
  it.skip("time helper travel with time subclass");

  it("time helper freeze time", () => {
    freezeTime();
    const t1 = currentTime().getTime();
    const t2 = currentTime().getTime();
    expect(Math.abs(t2 - t1)).toBeLessThan(10);
  });

  it("time helper freeze time with block", () => {
    let frozen: Date | null = null;
    freezeTime(() => {
      frozen = currentTime();
    });
    expect(frozen).not.toBeNull();
  });

  it("time helper unfreeze time", () => {
    freezeTime();
    travelBack();
    expect(Math.abs(currentTime().getTime() - Date.now())).toBeLessThan(100);
  });
});
