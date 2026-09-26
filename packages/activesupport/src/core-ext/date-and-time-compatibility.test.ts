import { beforeEach, describe, expect, it } from "vitest";
import { Temporal, Time as RubyTime, resetLocalTimeZoneId } from "@blazetrails/date";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../values/time-zone.js";
import { toTime } from "./time/compatibility.js";
import { toTime as stringToTime } from "./string/conversions.js";
import { toTimePreservesTimezone, setToTimePreservesTimezone } from "../active-support.js";
import { deprecator } from "../deprecator.js";
import { assertDeprecated, assertNotDeprecated } from "../testing/deprecation.js";
import { assertNotPredicate, assertPredicate } from "../testing/assertions.js";

function withEnvTz<T>(newTz: string, fn: () => T): T {
  const oldTz = process.env.TZ;
  process.env.TZ = newTz;
  resetLocalTimeZoneId();
  try {
    return fn();
  } finally {
    if (oldTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = oldTz;
    }
    resetLocalTimeZoneId();
  }
}

async function withPreserveTimezone<T>(
  value: boolean | string | null,
  fn: () => T | Promise<T>,
): Promise<T> {
  const oldPreserveTz = deprecator().silence(() => toTimePreservesTimezone());

  deprecator().silence(() => setToTimePreservesTimezone(value));

  try {
    return await fn();
  } finally {
    deprecator().silence(() => setToTimePreservesTimezone(oldPreserveTz));
  }
}

function utcOffset(time: RubyTime | Temporal.ZonedDateTime): number {
  return time instanceof RubyTime ? time.utcOffset : Number(time.offsetNanoseconds) / 1_000_000_000;
}

function getutc(time: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
  return time.withTimeZone("UTC");
}

describe("DateAndTimeCompatibilityTest", () => {
  let utcTime: RubyTime;
  let dateTime: Temporal.ZonedDateTime;
  const utcOffsetValue = 3600;
  const systemOffset = -14400;
  const systemDstOffset = -18000;
  let zone: TimeZone;

  beforeEach(() => {
    utcTime = RubyTime.utc(2016, 4, 23, 14, 11, 12);
    dateTime = Temporal.PlainDateTime.from("2016-04-23T14:11:12").toZonedDateTime("UTC");
    zone = TimeZone.find("London")!;
  });

  it("time to time preserves timezone", async () => {
    await withPreserveTimezone(true, () =>
      withEnvTz("US/Eastern", () => {
        const source = new RubyTime(2016, 4, 23, 15, 11, 12, 3600);
        const time = source.toTime();

        expect(time).toBeInstanceOf(RubyTime);
        expect(getutc(time.toZonedDateTime()).epochNanoseconds).toEqual(
          utcTime.toZonedDateTime().epochNanoseconds,
        );
        expect(utcOffset(time)).toEqual(utcOffsetValue);
        expect(time).toBe(source);
      }),
    );
  });

  it("time to time does not preserve time zone", async () => {
    await withPreserveTimezone(false, () =>
      withEnvTz("US/Eastern", () => {
        const source = new RubyTime(2016, 4, 23, 15, 11, 12, 3600);
        const time = source.toTime();

        expect(time).toBeInstanceOf(RubyTime);
        expect(getutc(time.toZonedDateTime()).epochNanoseconds).toEqual(
          utcTime.toZonedDateTime().epochNanoseconds,
        );
        expect(utcOffset(time)).toEqual(systemOffset);
        expect(time).not.toBe(source);
      }),
    );
  });

  it("time to time on utc value without preserve configured", async () => {
    await withPreserveTimezone(null, async () => {
      await withEnvTz("US/Eastern", async () => {
        const source = new RubyTime(2016, 4, 23, 15, 11, 12);
        const baseTime = source.toTime();

        const utcTimeValue = baseTime.getutc();
        const convertedTime: RubyTime = await assertDeprecated(deprecator(), () =>
          utcTimeValue.toTime(),
        );

        expect(baseTime.toZonedDateTime().epochNanoseconds).toEqual(
          source.toZonedDateTime().epochNanoseconds,
        );
        expect(convertedTime.toZonedDateTime().epochNanoseconds).toEqual(
          source.toZonedDateTime().epochNanoseconds,
        );
        expect(utcOffset(baseTime)).toEqual(systemOffset);
        expect(utcOffset(convertedTime)).toEqual(systemOffset);
      });
    });

    await withPreserveTimezone(null, async () => {
      await withEnvTz("US/Eastern", async () => {
        const source = new RubyTime(2016, 11, 23, 15, 11, 12);
        const baseTime = source.toTime();

        const utcTimeValue = baseTime.getutc();
        const convertedTime: RubyTime = await assertDeprecated(deprecator(), () =>
          utcTimeValue.toTime(),
        );

        expect(baseTime.toZonedDateTime().epochNanoseconds).toEqual(
          source.toZonedDateTime().epochNanoseconds,
        );
        expect(convertedTime.toZonedDateTime().epochNanoseconds).toEqual(
          source.toZonedDateTime().epochNanoseconds,
        );
        expect(utcOffset(baseTime)).toEqual(systemDstOffset);
        expect(utcOffset(convertedTime)).toEqual(systemDstOffset);
      });
    });
  });

  it("time to time on offset value without preserve configured", async () => {
    await withPreserveTimezone(null, async () => {
      await withEnvTz("US/Eastern", async () => {
        const foreignTime = new RubyTime(2016, 4, 23, 15, 11, 12, "-0700");
        const convertedTime: RubyTime = await assertDeprecated(deprecator(), () =>
          foreignTime.toTime(),
        );

        expect(convertedTime.toZonedDateTime().epochNanoseconds).toEqual(
          foreignTime.toZonedDateTime().epochNanoseconds,
        );
        expect(utcOffset(convertedTime)).toEqual(systemOffset);
        expect(utcOffset(foreignTime)).not.toEqual(utcOffset(convertedTime));
      });
    });

    await withPreserveTimezone(null, async () => {
      await withEnvTz("US/Eastern", async () => {
        const foreignTime = new RubyTime(2016, 11, 23, 15, 11, 12, "-0700");
        const convertedTime: RubyTime = await assertDeprecated(deprecator(), () =>
          foreignTime.toTime(),
        );

        expect(convertedTime.toZonedDateTime().epochNanoseconds).toEqual(
          foreignTime.toZonedDateTime().epochNanoseconds,
        );
        expect(utcOffset(convertedTime)).toEqual(systemDstOffset);
        expect(utcOffset(foreignTime)).not.toEqual(utcOffset(convertedTime));
      });
    });
  });

  it("time to time on tzinfo value without preserve configured", async () => {
    const foreignZone = TimeZone.find("America/Phoenix")!;

    await withPreserveTimezone(null, async () => {
      await withEnvTz("US/Eastern", async () => {
        const foreignTime = foreignZone.tzinfo.utcToLocal(
          new RubyTime(2016, 4, 23, 15, 11, 12, "-0700"),
        );
        const convertedTime: Temporal.ZonedDateTime = await assertDeprecated(deprecator(), () =>
          toTime(foreignTime),
        );

        expect(convertedTime.epochNanoseconds).toEqual(foreignTime.epochNanoseconds);
        expect(utcOffset(convertedTime)).toEqual(systemOffset);
        expect(utcOffset(foreignTime)).not.toEqual(utcOffset(convertedTime));
      });
    });

    await withPreserveTimezone(null, async () => {
      await withEnvTz("US/Eastern", async () => {
        const foreignTime = foreignZone.tzinfo.utcToLocal(
          new RubyTime(2016, 11, 23, 15, 11, 12, "-0700"),
        );
        const convertedTime: Temporal.ZonedDateTime = await assertDeprecated(deprecator(), () =>
          toTime(foreignTime),
        );

        expect(convertedTime.epochNanoseconds).toEqual(foreignTime.epochNanoseconds);
        expect(utcOffset(convertedTime)).toEqual(systemDstOffset);
        expect(utcOffset(foreignTime)).not.toEqual(utcOffset(convertedTime));
      });
    });
  });

  it("time to time frozen preserves timezone", async () => {
    await withPreserveTimezone(true, () =>
      withEnvTz("US/Eastern", () => {
        const source = Object.freeze(new RubyTime(2016, 4, 23, 15, 11, 12, 3600)) as RubyTime;
        const time = source.toTime();

        expect(time).toBeInstanceOf(RubyTime);
        expect(getutc(time.toZonedDateTime()).epochNanoseconds).toEqual(
          utcTime.toZonedDateTime().epochNanoseconds,
        );
        expect(utcOffset(time)).toEqual(utcOffsetValue);
        expect(time).toBe(source);
        assertPredicate(time, (t) => Object.isFrozen(t));
      }),
    );
  });

  it("time to time frozen does not preserve time zone", async () => {
    await withPreserveTimezone(false, () =>
      withEnvTz("US/Eastern", () => {
        const source = Object.freeze(new RubyTime(2016, 4, 23, 15, 11, 12, 3600)) as RubyTime;
        const time = source.toTime();

        expect(time).toBeInstanceOf(RubyTime);
        expect(getutc(time.toZonedDateTime()).epochNanoseconds).toEqual(
          utcTime.toZonedDateTime().epochNanoseconds,
        );
        expect(utcOffset(time)).toEqual(systemOffset);
        expect(time).not.toBe(source);
        assertNotPredicate(time, (t) => Object.isFrozen(t));
      }),
    );
  });

  it("datetime to time preserves timezone", async () => {
    await withPreserveTimezone(true, () =>
      withEnvTz("US/Eastern", () => {
        const source = Temporal.PlainDateTime.from("2016-04-23T15:11:12").toZonedDateTime("+01:00");
        const time = toTime(source);

        expect(time).toBeInstanceOf(Temporal.ZonedDateTime);
        expect(getutc(time).epochNanoseconds).toEqual(utcTime.toZonedDateTime().epochNanoseconds);
        expect(utcOffset(time)).toEqual(utcOffsetValue);
      }),
    );
  });

  it("datetime to time does not preserve time zone", async () => {
    await withPreserveTimezone(false, () =>
      withEnvTz("US/Eastern", () => {
        const source = Temporal.PlainDateTime.from("2016-04-23T15:11:12").toZonedDateTime("+01:00");
        const time = toTime(source);

        expect(time).toBeInstanceOf(Temporal.ZonedDateTime);
        expect(getutc(time).epochNanoseconds).toEqual(utcTime.toZonedDateTime().epochNanoseconds);
        expect(utcOffset(time)).toEqual(systemOffset);
      }),
    );
  });

  it("datetime to time frozen preserves timezone", async () => {
    await withPreserveTimezone(true, () =>
      withEnvTz("US/Eastern", () => {
        const source = Object.freeze(
          Temporal.PlainDateTime.from("2016-04-23T15:11:12").toZonedDateTime("+01:00"),
        );
        const time = toTime(source);

        expect(time).toBeInstanceOf(Temporal.ZonedDateTime);
        expect(getutc(time).epochNanoseconds).toEqual(utcTime.toZonedDateTime().epochNanoseconds);
        expect(utcOffset(time)).toEqual(utcOffsetValue);
        assertNotPredicate(time, (t) => Object.isFrozen(t));
      }),
    );
  });

  it("datetime to time frozen does not preserve time zone", async () => {
    await withPreserveTimezone(false, () =>
      withEnvTz("US/Eastern", () => {
        const source = Object.freeze(
          Temporal.PlainDateTime.from("2016-04-23T15:11:12").toZonedDateTime("+01:00"),
        );
        const time = toTime(source);

        expect(time).toBeInstanceOf(Temporal.ZonedDateTime);
        expect(getutc(time).epochNanoseconds).toEqual(utcTime.toZonedDateTime().epochNanoseconds);
        expect(utcOffset(time)).toEqual(systemOffset);
        assertNotPredicate(time, (t) => Object.isFrozen(t));
      }),
    );
  });

  it("twz to time preserves timezone", async () => {
    await withPreserveTimezone(true, () =>
      withEnvTz("US/Eastern", () => {
        let source = new TimeWithZone(utcTime.toZonedDateTime().toInstant(), zone);
        let time = source.toTime();

        expect(time).toBeInstanceOf(RubyTime);
        expect(time.getutc().toZonedDateTime().epochNanoseconds).toEqual(
          utcTime.toZonedDateTime().epochNanoseconds,
        );
        expect(time.getutc()).toBeInstanceOf(RubyTime);
        expect(utcOffset(time)).toEqual(utcOffsetValue);

        source = new TimeWithZone(dateTime.toInstant(), zone);
        time = source.toTime();

        expect(time).toBeInstanceOf(RubyTime);
        expect(time.getutc().toZonedDateTime().epochNanoseconds).toEqual(dateTime.epochNanoseconds);
        expect(time.getutc()).toBeInstanceOf(RubyTime);
        expect(utcOffset(time)).toEqual(utcOffsetValue);
      }),
    );
  });

  it("twz to time does not preserve time zone", async () => {
    await withPreserveTimezone(false, () =>
      withEnvTz("US/Eastern", () => {
        let source = new TimeWithZone(utcTime.toZonedDateTime().toInstant(), zone);
        let time = source.toTime();

        expect(time).toBeInstanceOf(RubyTime);
        expect(time.getutc().toZonedDateTime().epochNanoseconds).toEqual(
          utcTime.toZonedDateTime().epochNanoseconds,
        );
        expect(time.getutc()).toBeInstanceOf(RubyTime);
        expect(utcOffset(time)).toEqual(systemOffset);

        source = new TimeWithZone(dateTime.toInstant(), zone);
        time = source.toTime();

        expect(time).toBeInstanceOf(RubyTime);
        expect(time.getutc().toZonedDateTime().epochNanoseconds).toEqual(dateTime.epochNanoseconds);
        expect(time.getutc()).toBeInstanceOf(RubyTime);
        expect(utcOffset(time)).toEqual(systemOffset);
      }),
    );
  });

  it("twz to time frozen preserves timezone", async () => {
    await withPreserveTimezone(true, () =>
      withEnvTz("US/Eastern", () => {
        let source = new TimeWithZone(utcTime.toZonedDateTime().toInstant(), zone).freeze();
        let time = source.toTime();

        expect(time).toBeInstanceOf(RubyTime);
        expect(time.getutc().toZonedDateTime().epochNanoseconds).toEqual(
          utcTime.toZonedDateTime().epochNanoseconds,
        );
        expect(time.getutc()).toBeInstanceOf(RubyTime);
        expect(utcOffset(time)).toEqual(utcOffsetValue);
        assertNotPredicate(time, (t) => Object.isFrozen(t));

        source = new TimeWithZone(dateTime.toInstant(), zone).freeze();
        time = source.toTime();

        expect(time).toBeInstanceOf(RubyTime);
        expect(time.getutc().toZonedDateTime().epochNanoseconds).toEqual(dateTime.epochNanoseconds);
        expect(time.getutc()).toBeInstanceOf(RubyTime);
        expect(utcOffset(time)).toEqual(utcOffsetValue);
        assertNotPredicate(time, (t) => Object.isFrozen(t));
      }),
    );
  });

  it("twz to time frozen does not preserve time zone", async () => {
    await withPreserveTimezone(false, () =>
      withEnvTz("US/Eastern", () => {
        let source = new TimeWithZone(utcTime.toZonedDateTime().toInstant(), zone).freeze();
        let time = source.toTime();

        expect(time).toBeInstanceOf(RubyTime);
        expect(time.getutc().toZonedDateTime().epochNanoseconds).toEqual(
          utcTime.toZonedDateTime().epochNanoseconds,
        );
        expect(time.getutc()).toBeInstanceOf(RubyTime);
        expect(utcOffset(time)).toEqual(systemOffset);
        assertNotPredicate(time, (t) => Object.isFrozen(t));

        source = new TimeWithZone(dateTime.toInstant(), zone).freeze();
        time = source.toTime();

        expect(time).toBeInstanceOf(RubyTime);
        expect(time.getutc().toZonedDateTime().epochNanoseconds).toEqual(dateTime.epochNanoseconds);
        expect(time.getutc()).toBeInstanceOf(RubyTime);
        expect(utcOffset(time)).toEqual(systemOffset);
        assertNotPredicate(time, (t) => Object.isFrozen(t));
      }),
    );
  });

  it("string to time preserves timezone", async () => {
    await withPreserveTimezone(true, () =>
      withEnvTz("US/Eastern", () => {
        const source = "2016-04-23T15:11:12+01:00";
        const time = stringToTime(source)!;

        expect(time).toBeInstanceOf(Temporal.ZonedDateTime);
        expect(getutc(time).epochNanoseconds).toEqual(utcTime.toZonedDateTime().epochNanoseconds);
        expect(utcOffset(time)).toEqual(utcOffsetValue);
      }),
    );
  });

  it("string to time does not preserve time zone", async () => {
    await withPreserveTimezone(false, () =>
      withEnvTz("US/Eastern", () => {
        const source = "2016-04-23T15:11:12+01:00";
        const time = stringToTime(source)!;

        expect(time).toBeInstanceOf(Temporal.ZonedDateTime);
        expect(getutc(time).epochNanoseconds).toEqual(utcTime.toZonedDateTime().epochNanoseconds);
        expect(utcOffset(time)).toEqual(systemOffset);
      }),
    );
  });

  it("string to time frozen preserves timezone", async () => {
    await withPreserveTimezone(true, () =>
      withEnvTz("US/Eastern", () => {
        const source = "2016-04-23T15:11:12+01:00";
        const time = stringToTime(source)!;

        expect(time).toBeInstanceOf(Temporal.ZonedDateTime);
        expect(getutc(time).epochNanoseconds).toEqual(utcTime.toZonedDateTime().epochNanoseconds);
        expect(utcOffset(time)).toEqual(utcOffsetValue);
        assertNotPredicate(time, (t) => Object.isFrozen(t));
      }),
    );
  });

  it("string to time frozen does not preserve time zone", async () => {
    await withPreserveTimezone(false, () =>
      withEnvTz("US/Eastern", () => {
        const source = "2016-04-23T15:11:12+01:00";
        const time = stringToTime(source)!;

        expect(time).toBeInstanceOf(Temporal.ZonedDateTime);
        expect(getutc(time).epochNanoseconds).toEqual(utcTime.toZonedDateTime().epochNanoseconds);
        expect(utcOffset(time)).toEqual(systemOffset);
        assertNotPredicate(time, (t) => Object.isFrozen(t));
      }),
    );
  });

  it("to time preserves timezone is deprecated", async () => {
    const currentPreserveTz = deprecator().silence(() => toTimePreservesTimezone());

    try {
      await assertNotDeprecated(deprecator(), () => toTimePreservesTimezone());

      await assertDeprecated(deprecator(), () => setToTimePreservesTimezone(":offset"));

      await assertDeprecated(deprecator(), () => setToTimePreservesTimezone(false));

      await assertDeprecated(deprecator(), () => setToTimePreservesTimezone(null));

      await assertDeprecated(deprecator(), () => expect(toTimePreservesTimezone()).toEqual(false));

      await assertNotDeprecated(deprecator(), () => toTimePreservesTimezone());
    } finally {
      deprecator().silence(() => setToTimePreservesTimezone(currentPreserveTz));
    }
  });

  it("to time preserves timezone supports new values", async () => {
    const currentPreserveTz = deprecator().silence(() => toTimePreservesTimezone());

    try {
      await assertNotDeprecated(deprecator(), () => toTimePreservesTimezone());

      await assertNotDeprecated(deprecator(), () => setToTimePreservesTimezone(":zone"));

      await assertDeprecated(deprecator(), () => setToTimePreservesTimezone(":offset"));

      await assertDeprecated(deprecator(), () => setToTimePreservesTimezone(true));

      await assertDeprecated(deprecator(), () => setToTimePreservesTimezone("offset"));

      await assertDeprecated(deprecator(), () => setToTimePreservesTimezone(":foo"));
    } finally {
      deprecator().silence(() => setToTimePreservesTimezone(currentPreserveTz));
    }
  });
});
