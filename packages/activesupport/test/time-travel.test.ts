import { describe, it, expect, afterEach, vi } from "vitest";

import { DateTime, Date as RubyDate, Time } from "@blazetrails/date";
import { TimeZone } from "../lib/values/time-zone.js";
import type { TimeWithZone } from "../lib/time-with-zone.js";
import { setZone, zone } from "../lib/time-zone-config.js";
import { Rational, RuntimeError } from "@blazetrails/ruby-compat";
import { Duration } from "../lib/duration.js";
import { toFs } from "../lib/core-ext/time/conversions.js";
import {
  toFs as dateTimeToFs,
  usec as dateTimeUsec,
} from "../lib/core-ext/date-time/conversions.js";
import { advance as dateTimeAdvance } from "../lib/core-ext/date-time/calculations.js";
import {
  travelTo,
  travelBack,
  travel,
  freezeTime,
  unfreezeTime,
} from "../lib/testing/time-helpers.js";
import { currentTimeInstant, setFrozenInstant, setTimeOffsetNs } from "../lib/time-travel.js";
import { withEnvTz } from "../lib/time-zone-test-helpers.js";
import { utcOffset as dateTimeUtcOffset } from "../lib/core-ext/date-time/calculations.js";
import { TimeHelpers } from "../lib/testing/time-helpers.js";
import { include, type Included } from "@blazetrails/ruby-compat/include";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
interface TravelClass extends Included<typeof TimeHelpers> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class TravelClass {
  travelToNoBlock(date: Temporal.PlainDate): void {
    this.travelTo(date);
  }

  travelToBlock(date: Temporal.PlainDate): void {
    this.travelTo(date, {}, () => {});
  }
}
include(TravelClass, TimeHelpers);

function withTzDefault<T>(tz: TimeZone | null, fn: () => T): T {
  const oldTz = zone();
  setZone(tz);
  try {
    return fn();
  } finally {
    setZone(oldTz);
  }
}

function sleep(seconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

function instantOf(time: Time): bigint {
  return time.toZonedDateTime().epochNanoseconds;
}

describe("TimeTravelTest", () => {
  afterEach(() => {
    travelBack();
  });

  it("time helper travel", () => {
    const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
    try {
      const expectedTime = Time.now().plus(86400);
      travel(Duration.days(1));

      expect(toFs(Time.now(), "db")).toEqual(toFs(expectedTime, "db"));
      expect(RubyDate.today().toString()).toEqual(expectedTime.toDate().toString());
      expect(dateTimeToFs(DateTime.now(), "db")).toEqual(
        dateTimeToFs(expectedTime.toDatetime(), "db"),
      );

      expect(toFs(Time.new(), "db")).toEqual(toFs(expectedTime, "db"));
      expect(toFs(Time.new({ precision: 3 }), "db")).not.toEqual(toFs(expectedTime, "db"));
    } finally {
      travelBack();
      now.mockRestore();
    }
  });

  it("time helper travel with block", () => {
    const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
    try {
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
    } finally {
      now.mockRestore();
    }
  });

  it("time helper travel to", () => {
    const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
    try {
      const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);
      travelTo(expectedTime);

      expect(Time.now().toS()).toEqual(expectedTime.toS());
      expect(Time.new().toS()).toEqual(expectedTime.toS());
      expect(Time.new(2004, 11, 25).toS()).not.toEqual(expectedTime.toS());
      expect(instantOf(Time.new({ precision: 3 }))).not.toEqual(instantOf(expectedTime));
      expect(RubyDate.today().toString()).toEqual(new RubyDate(2004, 11, 24).toDate().toString());
      expect(DateTime.now().toS()).toEqual(expectedTime.toDatetime().toS());
    } finally {
      travelBack();
      now.mockRestore();
    }
  });

  it("time helper travel to with block", () => {
    const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
    try {
      const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);

      travelTo(expectedTime, {}, () => {
        expect(Time.now().toS()).toEqual(expectedTime.toS());
        expect(Time.new().toS()).toEqual(expectedTime.toS());
        expect(instantOf(Time.new({ precision: 3 }))).not.toEqual(instantOf(expectedTime));
        expect(Time.new(2004, 11, 25).toS()).not.toEqual(expectedTime.toS());
        expect(RubyDate.today().toString()).toEqual(new RubyDate(2004, 11, 24).toDate().toString());
        expect(DateTime.now().toS()).toEqual(expectedTime.toDatetime().toS());
      });

      expect(Time.now().toS()).not.toEqual(expectedTime.toS());
      expect(Time.new().toS()).not.toEqual(expectedTime.toS());
      expect(RubyDate.today().toString()).not.toEqual(
        new RubyDate(2004, 11, 24).toDate().toString(),
      );
      expect(DateTime.now().toS()).not.toEqual(expectedTime.toDatetime().toS());
    } finally {
      now.mockRestore();
    }
  });

  it("time helper travel to with time zone", () => {
    withEnvTz("US/Eastern", () => {
      withTzDefault(TimeZone.find("UTC"), () => {
        const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
        try {
          const expectedTime = Duration.minutes(5).ago();

          travelTo(Duration.minutes(5).ago(), {}, () => {
            expect((zone() as TimeZone).now().toFs("db")).toEqual(
              (expectedTime as TimeWithZone).toFs("db"),
            );
          });
        } finally {
          now.mockRestore();
        }
      });
    });
  });
  it("time helper travel to with different system and application time zones", () => {
    withEnvTz("US/Eastern", () => {
      const expectedTimeIn2021 = Time.new(2021);

      withTzDefault(TimeZone.find("Ekaterinburg"), () => {
        const destinationTime = Time.new(2023, 12, 1, 5, 6, 7, 5 * 3600);

        const expectedUtcOffset = -5 * 3600;
        const expectedTime = Time.new(2023, 11, 30, 19, 6, 7, expectedUtcOffset);
        const expectedDatetime = DateTime.civil(2023, 11, 30, 19, 6, 7, new Rational(-5, 24));
        const expectedDate = new RubyDate(2023, 11, 30);

        travelTo(destinationTime, {}, () => {
          expect(Time.now()).toEqual(expectedTime);
          expect(toFs(Time.now(), "db")).toEqual(toFs(expectedTime, "db"));
          expect(Time.now().utcOffset).toEqual(expectedUtcOffset);

          expect(DateTime.now()).toEqual(expectedDatetime);
          expect(dateTimeToFs(DateTime.now(), "db")).toEqual(dateTimeToFs(expectedDatetime, "db"));
          expect(dateTimeUtcOffset(DateTime.now())).toEqual(expectedUtcOffset);

          expect(RubyDate.today().toString()).toEqual(expectedDate.toDate().toString());

          expect(Time.new()).toEqual(expectedTime);
          expect(toFs(Time.new(), "db")).toEqual(toFs(expectedTime, "db"));
          expect(Time.new().utcOffset).toEqual(expectedUtcOffset);

          expect(Time.new(2021)).toEqual(expectedTimeIn2021);
          expect(toFs(Time.new(2021), "db")).toEqual(toFs(expectedTimeIn2021, "db"));
          expect(Time.new(2021).utcOffset).toEqual(expectedTimeIn2021.utcOffset);
        });
      });
    });
  });
  it("time helper travel to with string for time zone", () => {
    withEnvTz("US/Eastern", () => {
      withTzDefault(TimeZone.find("UTC"), () => {
        const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
        try {
          const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);

          travelTo("2004-11-24 01:04:44", {}, () => {
            expect((zone() as TimeZone).now().toFs("db")).toEqual(toFs(expectedTime, "db"));
          });
        } finally {
          now.mockRestore();
        }
      });
    });
  });

  it("time helper travel to with string and milliseconds", () => {
    withEnvTz("US/Eastern", () => {
      withTzDefault(TimeZone.find("UTC"), () => {
        const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
        try {
          const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);

          travelTo("2004-11-24T01:04:44.123-05:00", {}, () => {
            expect((zone() as TimeZone).now().toF()).toEqual(expectedTime.toF());
          });
        } finally {
          now.mockRestore();
        }
      });
    });
  });

  it("time helper travel to with separate class", () => {
    const travelObject = new TravelClass();
    const date1 = new RubyDate(2004, 11, 24).toDate();
    const date2 = new RubyDate(2005, 11, 24).toDate();

    const now = Time.now();
    const stub = vi.spyOn(Time, "now").mockReturnValue(now);
    try {
      travelTo(date1, {}, () => {
        travelObject.travelToNoBlock(date2);
      });
      expect(Time.now()).toEqual(now);

      travelTo(date1, {}, () => {
        travelObject.travelToNoBlock(date2);
        expect(RubyDate.today().toString()).toEqual(date2.toString());
      });
      expect(Time.now()).toEqual(now);

      travelTo(date1, {}, () => {
        travelObject.travelToBlock(date2);
        expect(RubyDate.today().toString()).toEqual(date1.toString());
      });
      expect(Time.now()).toEqual(now);
    } finally {
      stub.mockRestore();
    }
  });

  it("time helper travel back", () => {
    const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
    try {
      const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);

      travelTo(expectedTime);
      expect(Time.now().toS()).toEqual(expectedTime.toS());
      expect(Time.new().toS()).toEqual(expectedTime.toS());
      expect(RubyDate.today().toString()).toEqual(new RubyDate(2004, 11, 24).toDate().toString());
      expect(DateTime.now().toS()).toEqual(expectedTime.toDatetime().toS());
      travelBack();

      expect(Time.now().toS()).not.toEqual(expectedTime.toS());
      expect(Time.new().toS()).not.toEqual(expectedTime.toS());
      expect(RubyDate.today().toString()).not.toEqual(
        new RubyDate(2004, 11, 24).toDate().toString(),
      );
      expect(DateTime.now().toS()).not.toEqual(expectedTime.toDatetime().toS());
    } finally {
      travelBack();
      now.mockRestore();
    }
  });

  it("time helper travel back with block", () => {
    const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
    try {
      const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);

      travelTo(expectedTime);
      expect(Time.now().toS()).toEqual(expectedTime.toS());
      expect(Time.new().toS()).toEqual(expectedTime.toS());
      expect(RubyDate.today().toString()).toEqual(new RubyDate(2004, 11, 24).toDate().toString());
      expect(DateTime.now().toS()).toEqual(expectedTime.toDatetime().toS());

      travelBack(() => {
        expect(Time.now().toS()).not.toEqual(expectedTime.toS());
        expect(Time.new().toS()).not.toEqual(expectedTime.toS());
        expect(RubyDate.today().toString()).not.toEqual(
          new RubyDate(2004, 11, 24).toDate().toString(),
        );
        expect(DateTime.now().toS()).not.toEqual(expectedTime.toDatetime().toS());
      });

      expect(Time.now().toS()).toEqual(expectedTime.toS());
      expect(Time.new().toS()).toEqual(expectedTime.toS());
      expect(RubyDate.today().toString()).toEqual(new RubyDate(2004, 11, 24).toDate().toString());
      expect(DateTime.now().toS()).toEqual(expectedTime.toDatetime().toS());
    } finally {
      travelBack();
      now.mockRestore();
    }
  });

  it("time helper travel to with nested calls with blocks", () => {
    const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
    try {
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
    } finally {
      now.mockRestore();
    }
  });

  it("time helper travel to with nested calls", () => {
    const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
    try {
      const outerExpectedTime = Time.new(2004, 11, 24, 1, 4, 44);
      const innerExpectedTime = Time.new(2004, 10, 24, 1, 4, 44);
      travelTo(outerExpectedTime, {}, () => {
        expect(() => {
          travelTo(innerExpectedTime);

          expect(Time.now().toS()).toEqual(innerExpectedTime.toS());
        }).not.toThrow();
      });
    } finally {
      now.mockRestore();
    }
  });

  it("time helper travel to with subsequent calls", () => {
    const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
    try {
      const initialExpectedTime = Time.new(2004, 11, 24, 1, 4, 44);
      const subsequentExpectedTime = Time.new(2004, 10, 24, 1, 4, 44);
      expect(() => {
        travelTo(initialExpectedTime);
        travelTo(subsequentExpectedTime);

        expect(Time.now().toS()).toEqual(subsequentExpectedTime.toS());

        travelBack();
      }).not.toThrow();
    } finally {
      travelBack();
      now.mockRestore();
    }
  });

  it("time helper travel to with usec", () => {
    const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
    try {
      const traveledTime = Time.new(2004, 11, 24, 1, 4, 44).plus(new Rational(1, 10));
      const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);

      expect(() => {
        travelTo(traveledTime);

        expect(instantOf(Time.now())).toEqual(instantOf(expectedTime));

        travelBack();
      }).not.toThrow();
    } finally {
      travelBack();
      now.mockRestore();
    }
  });

  it("time helper with usec true", () => {
    const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
    try {
      const expectedTime = Time.new(2004, 11, 24, 1, 4, 44).plus(new Rational(1, 10));

      expect(() => {
        travelTo(expectedTime, { withUsec: true });

        expect(Time.now().toF()).toEqual(expectedTime.toF());

        travel(0.5, { withUsec: true });

        expect(Time.now().toF()).toEqual(expectedTime.plus(0.5).toF());

        travelBack();
      }).not.toThrow();
    } finally {
      travelBack();
      now.mockRestore();
    }
  });

  it("time helper travel to with datetime and usec", () => {
    withEnvTz("US/Eastern", () => {
      withTzDefault(TimeZone.find("UTC"), () => {
        const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
        try {
          const durationUsec = Duration.seconds(0.1);
          const traveledTime = dateTimeAdvance(DateTime.iso8601("2004-11-24T01:04:44.000-05:00"), {
            seconds: durationUsec.inSeconds(),
          });
          const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);

          expect(() => {
            travelTo(traveledTime);

            expect((zone() as TimeZone).now().toF()).toEqual(expectedTime.toF());

            travelBack();
          }).not.toThrow();
        } finally {
          travelBack();
          now.mockRestore();
        }
      });
    });
  });

  it("time helper travel to with datetime and usec true", () => {
    withEnvTz("US/Eastern", () => {
      withTzDefault(TimeZone.find("UTC"), () => {
        const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
        try {
          const durationUsec = Duration.seconds(0.1);
          const traveledTime = dateTimeAdvance(DateTime.iso8601("2004-11-24T01:04:44.000-05:00"), {
            seconds: durationUsec.inSeconds(),
          });
          const expectedTime = durationUsec.since(Time.new(2004, 11, 24, 1, 4, 44));

          expect(() => {
            travelTo(traveledTime, { withUsec: true });

            expect(instantOf(Time.now())).toEqual(instantOf(expectedTime));

            travelBack();
          }).not.toThrow();
        } finally {
          travelBack();
          now.mockRestore();
        }
      });
    });
  });

  it("time helper travel to with string and usec", () => {
    withTzDefault(TimeZone.find("UTC"), () => {
      const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
      try {
        const traveledTime = Time.new(2004, 11, 24, 1, 4, 44).plus(new Rational(1, 10));
        const expectedTime = Time.new(2004, 11, 24, 1, 4, 44);

        expect(() => {
          travelTo(traveledTime.iso8601(3));

          expect(instantOf(Time.now())).toEqual(instantOf(expectedTime));

          travelBack();
        }).not.toThrow();
      } finally {
        travelBack();
        now.mockRestore();
      }
    });
  });

  it("time helper travel to with string and usec true", () => {
    withTzDefault(TimeZone.find("UTC"), () => {
      const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
      try {
        const expectedTime = Time.new(2004, 11, 24, 1, 4, 44).plus(new Rational(1, 10));

        expect(() => {
          travelTo(expectedTime.iso8601(3), { withUsec: true });

          expect(Time.now().toF()).toEqual(expectedTime.toF());

          travel(0.5, { withUsec: true });

          expect(Time.now().toF()).toEqual(expectedTime.plus(0.5).toF());

          travelBack();
        }).not.toThrow();
      } finally {
        travelBack();
        now.mockRestore();
      }
    });
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
    const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
    try {
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
    } finally {
      travelBack();
      now.mockRestore();
    }
  });

  it("travel to will reset the usec to avoid mysql rounding", () => {
    const now = vi.spyOn(Time, "now").mockReturnValue(Time.now());
    try {
      travelTo(Time.utc(2014, 10, 10, 10, 10, 50, 999999), {}, () => {
        expect(Time.now().sec).toEqual(50);
        expect(Time.now().usec).toEqual(0);
        expect(DateTime.now().second).toEqual(50);
        expect(dateTimeUsec(DateTime.now())).toEqual(0);
      });
    } finally {
      now.mockRestore();
    }
  });

  // BLOCKED: date-time-now-and-date-today-allocate-receiver-subclass
  it.skip("time helper travel with time subclass");

  it("time helper freeze time", () => {
    const expectedTime = Time.now();
    freezeTime();
    sleep(1);

    expect(toFs(Time.now(), "db")).toEqual(toFs(expectedTime, "db"));
  });

  it("time helper freeze time with block", () => {
    const expectedTime = Time.now();

    freezeTime({}, () => {
      sleep(1);

      expect(toFs(Time.now(), "db")).toEqual(toFs(expectedTime, "db"));
    });

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
