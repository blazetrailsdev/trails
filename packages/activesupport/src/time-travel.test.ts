import { describe, it, expect, afterEach } from "vitest";

import { DateTime, Date as RubyDate, Temporal, Time } from "@blazetrails/date";
import { Rational, RuntimeError } from "@blazetrails/ruby-compat";
import { Duration } from "./duration.js";
import { toFs } from "./core-ext/time/conversions.js";
import { toFs as dateTimeToFs, usec as dateTimeUsec } from "./core-ext/date-time/conversions.js";
import { travelTo, travelBack, travel, freezeTime, unfreezeTime } from "./testing/time-helpers.js";
import { currentTimeInstant, setFrozenInstant, setTimeOffsetNs } from "./time-travel.js";

function instantOf(time: Time): bigint {
  return time.toTime().epochNanoseconds;
}

describe("TimeTravelTest", () => {
  afterEach(() => {
    travelBack();
  });

  it("time helper travel", () => {
    const expectedTime = Time.now().plus(86400);
    travel(Duration.days(1));

    expect(toFs(Time.now(), "db")).toEqual(toFs(expectedTime, "db"));
    expect(RubyDate.today().toString()).toEqual(expectedTime.toDate().toString());
    expect(dateTimeToFs(DateTime.now(), "db")).toEqual(
      dateTimeToFs(expectedTime.toDatetime(), "db"),
    );

    expect(toFs(Time.new(), "db")).toEqual(toFs(expectedTime, "db"));
    expect(toFs(Time.new({ precision: 3 }), "db")).not.toEqual(toFs(expectedTime, "db"));
  });

  it("time helper travel with block", () => {
    const expectedTime = Time.now().plus(86400);

    travel(Duration.days(1), {}, () => {
      expect(toFs(Time.now(), "db")).toEqual(toFs(expectedTime, "db"));
      expect(RubyDate.today().toString()).toEqual(expectedTime.toDate().toString());
      expect(dateTimeToFs(DateTime.now(), "db")).toEqual(
        dateTimeToFs(expectedTime.toDatetime(), "db"),
      );

      expect(toFs(Time.new(), "db")).toEqual(toFs(expectedTime, "db"));
      expect(toFs(Time.new({ precision: 3 }), "db")).not.toEqual(toFs(expectedTime, "db"));
      expect(instantOf(Time.new("2000-12-31 23:59:59.56789", { precision: 3 }))).toEqual(
        instantOf(Time.new("2000-12-31 23:59:59.567")),
      );
    });

    expect(toFs(Time.now(), "db")).not.toEqual(toFs(expectedTime, "db"));
    expect(RubyDate.today().toString()).not.toEqual(expectedTime.toDate().toString());
    expect(dateTimeToFs(DateTime.now(), "db")).not.toEqual(
      dateTimeToFs(expectedTime.toDatetime(), "db"),
    );
    expect(instantOf(Time.new("2000-12-31 23:59:59.56789", { precision: 3 }))).toEqual(
      instantOf(Time.new("2000-12-31 23:59:59.567")),
    );
  });

  it("time helper travel to", () => {
    const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);
    travelTo(expectedTime);

    expect(Time.now().toS()).toEqual(expectedTime.toS());
    expect(Time.new().toS()).toEqual(expectedTime.toS());
    expect(Time.new(2004, 11, 25).toS()).not.toEqual(expectedTime.toS());
    expect(instantOf(Time.new({ precision: 3 }))).not.toEqual(instantOf(expectedTime));
    expect(RubyDate.today().toString()).toEqual(new RubyDate(2004, 11, 24).toDate().toString());
    expect(DateTime.now().toString()).toEqual(expectedTime.toDatetime().toString());
  });

  it("time helper travel to with block", () => {
    const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);

    travelTo(expectedTime, {}, () => {
      expect(Time.now().toS()).toEqual(expectedTime.toS());
      expect(Time.new().toS()).toEqual(expectedTime.toS());
      expect(instantOf(Time.new({ precision: 3 }))).not.toEqual(instantOf(expectedTime));
      expect(Time.new(2004, 11, 25).toS()).not.toEqual(expectedTime.toS());
      expect(RubyDate.today().toString()).toEqual(new RubyDate(2004, 11, 24).toDate().toString());
      expect(DateTime.now().toString()).toEqual(expectedTime.toDatetime().toString());
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
    const expectedTime = Time.utc(2004, 11, 24, 6, 4, 44);

    travelTo("2004-11-24T01:04:44.123-05:00", {}, () => {
      expect(instantOf(Time.now())).toEqual(instantOf(expectedTime));
    });
  });

  it.skip("time helper travel to with separate class");

  it("time helper travel back", () => {
    const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);

    travelTo(expectedTime);
    expect(Time.now().toS()).toEqual(expectedTime.toS());
    expect(Time.new().toS()).toEqual(expectedTime.toS());
    expect(RubyDate.today().toString()).toEqual(new RubyDate(2004, 11, 24).toDate().toString());
    expect(DateTime.now().toString()).toEqual(expectedTime.toDatetime().toString());
    travelBack();

    expect(Time.now().toS()).not.toEqual(expectedTime.toS());
    expect(Time.new().toS()).not.toEqual(expectedTime.toS());
    expect(RubyDate.today().toString()).not.toEqual(new RubyDate(2004, 11, 24).toDate().toString());
    expect(DateTime.now().toString()).not.toEqual(expectedTime.toDatetime().toString());
  });

  it("time helper travel back with block", () => {
    const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);

    travelTo(expectedTime);
    expect(Time.now().toS()).toEqual(expectedTime.toS());
    expect(Time.new().toS()).toEqual(expectedTime.toS());
    expect(RubyDate.today().toString()).toEqual(new RubyDate(2004, 11, 24).toDate().toString());
    expect(DateTime.now().toString()).toEqual(expectedTime.toDatetime().toString());

    travelBack(() => {
      expect(Time.now().toS()).not.toEqual(expectedTime.toS());
      expect(Time.new().toS()).not.toEqual(expectedTime.toS());
      expect(RubyDate.today().toString()).not.toEqual(
        new RubyDate(2004, 11, 24).toDate().toString(),
      );
      expect(DateTime.now().toString()).not.toEqual(expectedTime.toDatetime().toString());
    });

    expect(Time.now().toS()).toEqual(expectedTime.toS());
    expect(Time.new().toS()).toEqual(expectedTime.toS());
    expect(RubyDate.today().toString()).toEqual(new RubyDate(2004, 11, 24).toDate().toString());
    expect(DateTime.now().toString()).toEqual(expectedTime.toDatetime().toString());
  });

  it("time helper travel to with nested calls with blocks", () => {
    const outerExpectedTime = Time.new(2004, 11, 24, 1, 4, 44);
    const innerExpectedTime = Time.new(2004, 10, 24, 1, 4, 44);
    travelTo(outerExpectedTime, {}, () => {
      let e: unknown;
      expect(() => {
        try {
          travelTo(innerExpectedTime, {}, () => {});
        } catch (error) {
          e = error;
          throw error;
        }
      }).toThrow(RuntimeError);
      expect((e as Error).message).toMatch(
        /Calling `travel_to` with a block, when we have previously already made a call to `travel_to`, can lead to confusing time stubbing\./,
      );
    });
  });

  it("time helper travel to with nested calls", () => {
    const outerExpectedTime = Time.new(2004, 11, 24, 1, 4, 44);
    const innerExpectedTime = Time.new(2004, 10, 24, 1, 4, 44);
    travelTo(outerExpectedTime, {}, () => {
      expect(() => {
        travelTo(innerExpectedTime);

        expect(Time.now().toS()).toEqual(innerExpectedTime.toS());
      }).not.toThrow();
    });
  });

  it("time helper travel to with subsequent calls", () => {
    const initialExpectedTime = Time.new(2004, 11, 24, 1, 4, 44);
    const subsequentExpectedTime = Time.new(2004, 10, 24, 1, 4, 44);
    expect(() => {
      travelTo(initialExpectedTime);
      travelTo(subsequentExpectedTime);

      expect(Time.now().toS()).toEqual(subsequentExpectedTime.toS());

      travelBack();
    }).not.toThrow();
  });

  it("time helper travel to with usec", () => {
    const traveledTime = Time.new(2004, 11, 24, 1, 4, 44).plus(new Rational(1, 10));
    const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);

    expect(() => {
      travelTo(traveledTime);

      expect(instantOf(Time.now())).toEqual(instantOf(expectedTime));

      travelBack();
    }).not.toThrow();
  });

  it("time helper with usec true", () => {
    const expectedTime = Time.new(2004, 11, 24, 1, 4, 44).plus(new Rational(1, 10));

    expect(() => {
      travelTo(expectedTime, { withUsec: true });

      expect(Time.now().toF()).toEqual(expectedTime.toF());

      travel(Duration.seconds(0.5), { withUsec: true });

      expect(Time.now().toF()).toEqual(expectedTime.plus(0.5).toF());

      travelBack();
    }).not.toThrow();
  });

  it("time helper travel to with datetime and usec", () => {
    const traveledTime = Time.new("2004-11-24 01:04:44.1 -05:00");
    const expectedTime = Time.utc(2004, 11, 24, 6, 4, 44);

    expect(() => {
      travelTo(traveledTime);

      expect(instantOf(Time.now())).toEqual(instantOf(expectedTime));

      travelBack();
    }).not.toThrow();
  });

  it("time helper travel to with datetime and usec true", () => {
    const traveledTime = Time.new("2004-11-24 01:04:44.1 -05:00");
    const expectedTime = Time.utc(2004, 11, 24, 6, 4, 44).plus(new Rational(1, 10));

    expect(() => {
      travelTo(traveledTime, { withUsec: true });

      expect(instantOf(Time.now())).toEqual(instantOf(expectedTime));

      travelBack();
    }).not.toThrow();
  });

  it("time helper travel to with string and usec", () => {
    const expectedTime = Time.utc(2004, 11, 24, 1, 4, 44);

    expect(() => {
      travelTo("2004-11-24T01:04:44.100Z");

      expect(instantOf(Time.now())).toEqual(instantOf(expectedTime));

      travelBack();
    }).not.toThrow();
  });

  it("time helper travel to with string and usec true", () => {
    const expectedTime = Time.utc(2004, 11, 24, 1, 4, 44).plus(new Rational(1, 10));

    expect(() => {
      travelTo("2004-11-24T01:04:44.100Z", { withUsec: true });

      expect(Time.now().toF()).toEqual(expectedTime.toF());

      travel(Duration.seconds(0.5), { withUsec: true });

      expect(Time.now().toF()).toEqual(expectedTime.plus(0.5).toF());

      travelBack();
    }).not.toThrow();
  });

  it("time helper freeze time with usec true", () => {
    const checks = Array.from({ length: 9 }, () => {
      let usec = 0;
      freezeTime({ withUsec: true }, () => {
        usec = Time.now().usec;
      });
      return usec !== 0;
    });
    expect(checks.some((check) => check)).toBeTruthy();
  });

  it("time helper travel with subsequent block", () => {
    const outerExpectedTime = Time.new(2004, 11, 24, 1, 4, 44);
    const innerExpectedTime = Time.new(2004, 10, 24, 1, 4, 44);
    travelTo(outerExpectedTime);

    expect(Time.now().toS()).toEqual(outerExpectedTime.toS());

    expect(() => {
      travelTo(innerExpectedTime, {}, () => {
        expect(Time.now().toS()).toEqual(innerExpectedTime.toS());
      });
    }).not.toThrow();

    expect(Time.now().toS()).toEqual(outerExpectedTime.toS());
  });

  it("travel to will reset the usec to avoid mysql rounding", () => {
    travelTo(Time.utc(2014, 10, 10, 10, 10, 50, 999999), {}, () => {
      expect(Time.now().sec).toEqual(50);
      expect(Time.now().usec).toEqual(0);
      expect(DateTime.now().second).toEqual(50);
      expect(dateTimeUsec(DateTime.now())).toEqual(0);
    });
  });

  it.skip("time helper travel with time subclass");

  it("time helper freeze time", () => {
    const expectedTime = Time.now();
    freezeTime();

    expect(toFs(Time.now(), "db")).toEqual(toFs(expectedTime, "db"));
  });

  it("time helper freeze time with block", async () => {
    const expectedTime = Time.now();

    freezeTime({}, () => {
      expect(toFs(Time.now(), "db")).toEqual(toFs(expectedTime, "db"));
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(toFs(expectedTime, "db").localeCompare(toFs(Time.now(), "db"))).toBeLessThan(0);
  });

  it("time helper unfreeze time", () => {
    expect(unfreezeTime).toEqual(travelBack);
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
