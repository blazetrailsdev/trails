import { ArgumentError, Rational, rbPlus } from "@blazetrails/ruby-compat";
import { Time } from "@blazetrails/date";
import { describe, expect, it } from "vitest";
import {
  DataTimezone,
  Timestamp,
  TimezoneInfo,
  type TimezonePeriod,
  type TimezoneTransition,
} from "../lib/index.js";
import { assertEqualWithOffset, assertRaises, timeTypesHelpers } from "./support/test-utils.js";

type Arg = Time;

class TestTimezoneInfo extends TimezoneInfo {
  timestamp: Timestamp | null = null;
  localTimestamp: Timestamp | null = null;
  toTimestamp: Timestamp | null = null;
  fromTimestamp: Timestamp | null = null;
  readonly #periodForResult: unknown;
  readonly #periodsForLocalResult: unknown[];
  readonly #transitionsUpToResult: unknown;

  constructor(
    identifier: string,
    periodForResult: unknown,
    periodsForLocalResult: unknown[] | null,
    transitionsUpToResult: unknown,
  ) {
    super(identifier);
    this.#periodForResult = periodForResult;
    this.#periodsForLocalResult = periodsForLocalResult ?? [];
    this.#transitionsUpToResult = transitionsUpToResult;
  }

  periodFor(timestamp: Timestamp): TimezonePeriod {
    if (timestamp == null) throw new ArgumentError("timestamp must be specified");
    if (timestamp.utcOffset == null) {
      throw new ArgumentError("timestamp must have a specified utc_offset");
    }

    this.timestamp = timestamp;
    return this.#periodForResult as TimezonePeriod;
  }

  periodsForLocal(localTimestamp: Timestamp): TimezonePeriod[] {
    if (localTimestamp == null) throw new ArgumentError("local_timestamp must be specified");
    if (localTimestamp.utcOffset != null) {
      throw new ArgumentError("local_timestamp must have an unspecified utc_offset");
    }

    this.localTimestamp = localTimestamp;
    return this.#periodsForLocalResult as TimezonePeriod[];
  }

  transitionsUpTo(
    toTimestamp: Timestamp,
    fromTimestamp: Timestamp | null = null,
  ): TimezoneTransition[] {
    if (toTimestamp == null) throw new ArgumentError("to_timestamp must be specified");
    if (toTimestamp.utcOffset == null) {
      throw new ArgumentError("to_timestamp must have a specified utc_offset");
    }

    if (fromTimestamp != null) {
      if (fromTimestamp.utcOffset == null) {
        throw new ArgumentError("from_timestamp must have a specified utc_offset");
      }
      if (toTimestamp.compareTo(fromTimestamp)! <= 0) {
        throw new ArgumentError("to_timestamp must be greater than from_timestamp");
      }
    }

    this.toTimestamp = toTimestamp;
    this.fromTimestamp = fromTimestamp;
    return this.#transitionsUpToResult as TimezoneTransition[];
  }
}

const r = new Rational(1, 10);

describe("TCDataTimezone", () => {
  it("identifier", () => {
    const tz = new DataTimezone(new TestTimezoneInfo("Test/Zone", null, [], []));
    expect(tz.identifier).toBe("Test/Zone");
  });

  it("period for", () => {
    timeTypesHelpers("utc", (h) => {
      const period = {};
      const tti = new TestTimezoneInfo("Test/Zone", period, [], []);
      const tz = new DataTimezone(tti);

      expect(tz.periodFor(h.time(2006, 6, 27, 22, 50, 12, r, "utc") as Arg)).toBe(period);
      assertEqualWithOffset(Timestamp.create(2006, 6, 27, 22, 50, 12, r, "utc"), tti.timestamp!);
    });
  });

  it("period for zero offset", () => {
    timeTypesHelpers((h) => {
      const period = {};
      const tti = new TestTimezoneInfo("Test/Zone", period, [], []);
      const tz = new DataTimezone(tti);

      expect(tz.periodFor(h.time(2006, 6, 27, 22, 50, 12, r, 0) as Arg)).toBe(period);
      assertEqualWithOffset(
        Timestamp.create(2006, 6, 27, 22, 50, 12, r, h.expectedZeroOffset()),
        tti.timestamp!,
      );
    });
  });

  it("period for offset", () => {
    timeTypesHelpers("offset", (h) => {
      const period = {};
      const tti = new TestTimezoneInfo("Test/Zone", period, [], []);
      const tz = new DataTimezone(tti);

      expect(tz.periodFor(h.time(2006, 6, 27, 22, 50, 12, r, 3600) as Arg)).toBe(period);
      assertEqualWithOffset(Timestamp.create(2006, 6, 27, 22, 50, 12, r, 3600), tti.timestamp!);
    });
  });

  it("period for unspecified", () => {
    timeTypesHelpers("unspecified_offset", (h) => {
      const tti = new TestTimezoneInfo("Test/Zone", {}, [], []);
      const tz = new DataTimezone(tti);
      const t = h.time(2006, 6, 27, 22, 50, 12, r) as Arg;

      const error = assertRaises(ArgumentError, () => tz.periodFor(t));
      expect(error.message).toMatch(/\btime\b/);
    });
  });

  it("period for nil", () => {
    const tti = new TestTimezoneInfo("Test/Zone", {}, [], []);
    const tz = new DataTimezone(tti);

    const error = assertRaises(ArgumentError, () => tz.periodFor(null as unknown as Arg));
    expect(error.message).toMatch(/\btime\b/);
  });

  it("period for unsupported value", () => {
    const tti = new TestTimezoneInfo("Test/Zone", {}, [], []);
    const tz = new DataTimezone(tti);
    const t = Time.utc(2006, 6, 27, 22, 50, 12).toI();

    const error = assertRaises(ArgumentError, () => tz.periodFor(t as unknown as Arg));
    expect(error.message).toMatch(/\bInteger\b/);
  });

  it("periods for local unspecified", () => {
    timeTypesHelpers("unspecified_offset", (h) => {
      const periods = [{}, {}];
      const tti = new TestTimezoneInfo("Test/Zone", null, periods, []);
      const tz = new DataTimezone(tti);

      expect(tz.periodsForLocal(h.time(2006, 6, 27, 22, 50, 12, r) as Arg)).toBe(periods);
      assertEqualWithOffset(Timestamp.create(2006, 6, 27, 22, 50, 12, r), tti.localTimestamp!);
    });
  });

  it("periods for local utc", () => {
    timeTypesHelpers("utc", (h) => {
      const periods = [{}, {}];
      const tti = new TestTimezoneInfo("Test/Zone", null, periods, []);
      const tz = new DataTimezone(tti);

      expect(tz.periodsForLocal(h.time(2006, 6, 27, 22, 50, 12, r, "utc") as Arg)).toBe(periods);
      assertEqualWithOffset(Timestamp.create(2006, 6, 27, 22, 50, 12, r), tti.localTimestamp!);
    });
  });

  it("periods for local zero offset", () => {
    timeTypesHelpers((h) => {
      const periods = [{}, {}];
      const tti = new TestTimezoneInfo("Test/Zone", null, periods, []);
      const tz = new DataTimezone(tti);

      expect(tz.periodsForLocal(h.time(2006, 6, 27, 22, 50, 12, r, 0) as Arg)).toBe(periods);
      assertEqualWithOffset(Timestamp.create(2006, 6, 27, 22, 50, 12, r), tti.localTimestamp!);
    });
  });

  it("periods for local with offset", () => {
    timeTypesHelpers("offset", (h) => {
      const periods = [{}, {}];
      const tti = new TestTimezoneInfo("Test/Zone", null, periods, []);
      const tz = new DataTimezone(tti);

      expect(tz.periodsForLocal(h.time(2006, 6, 27, 22, 50, 12, r, 3600) as Arg)).toBe(periods);
      assertEqualWithOffset(Timestamp.create(2006, 6, 27, 22, 50, 12, r), tti.localTimestamp!);
    });
  });

  it("periods for local not found", () => {
    const periods: unknown[] = [];
    const tti = new TestTimezoneInfo("Test/Zone", null, periods, []);
    const tz = new DataTimezone(tti);

    const t = Time.utc(2006, 6, 27, 22, 50, rbPlus(12, r) as Rational);
    expect(tz.periodsForLocal(t)).toBe(periods);
    assertEqualWithOffset(new Timestamp(t.toI(), r), tti.localTimestamp!);
  });

  it("periods for local nil", () => {
    const tti = new TestTimezoneInfo("Test/Zone", {}, [], []);
    const tz = new DataTimezone(tti);

    const error = assertRaises(ArgumentError, () => tz.periodsForLocal(null as unknown as Arg));
    expect(error.message).toMatch(/\blocal_time\b/);
  });

  it("periods for local unsupported", () => {
    const tti = new TestTimezoneInfo("Test/Zone", {}, [], []);
    const tz = new DataTimezone(tti);
    const t = Time.utc(2006, 6, 27, 22, 50, 12).toI();

    const error = assertRaises(ArgumentError, () => tz.periodsForLocal(t as unknown as Arg));
    expect(error.message).toMatch(/\bInteger\b/);
  });

  it("transitions up to utc", () => {
    timeTypesHelpers("utc", (h) => {
      const transitions = [{}, {}];
      const tti = new TestTimezoneInfo("Test/Zone", null, null, transitions);
      const tz = new DataTimezone(tti);

      expect(
        tz.transitionsUpTo(
          h.time(2013, 1, 1, 0, 0, 0, r, "utc") as Arg,
          h.time(2012, 1, 1, 0, 0, 0, r, "utc") as Arg,
        ),
      ).toBe(transitions);
      assertEqualWithOffset(Timestamp.create(2013, 1, 1, 0, 0, 0, r, "utc"), tti.toTimestamp!);
      assertEqualWithOffset(Timestamp.create(2012, 1, 1, 0, 0, 0, r, "utc"), tti.fromTimestamp!);
    });
  });

  it("transitions up to zero offset", () => {
    timeTypesHelpers((h) => {
      const transitions = [{}, {}];
      const tti = new TestTimezoneInfo("Test/Zone", null, null, transitions);
      const tz = new DataTimezone(tti);

      expect(
        tz.transitionsUpTo(
          h.time(2013, 1, 1, 0, 0, 0, r, 0) as Arg,
          h.time(2012, 1, 1, 0, 0, 0, r, 0) as Arg,
        ),
      ).toBe(transitions);
      assertEqualWithOffset(
        Timestamp.create(2013, 1, 1, 0, 0, 0, r, h.expectedZeroOffset()),
        tti.toTimestamp!,
      );
      assertEqualWithOffset(
        Timestamp.create(2012, 1, 1, 0, 0, 0, r, h.expectedZeroOffset()),
        tti.fromTimestamp!,
      );
    });
  });

  it("transitions up to offset", () => {
    timeTypesHelpers("offset", (h) => {
      const transitions = [{}, {}];
      const tti = new TestTimezoneInfo("Test/Zone", null, null, transitions);
      const tz = new DataTimezone(tti);

      expect(
        tz.transitionsUpTo(
          h.time(2013, 1, 1, 0, 0, 0, r, -3600) as Arg,
          h.time(2012, 1, 1, 0, 0, 0, r, 3600) as Arg,
        ),
      ).toBe(transitions);
      assertEqualWithOffset(Timestamp.create(2013, 1, 1, 0, 0, 0, r, -3600), tti.toTimestamp!);
      assertEqualWithOffset(Timestamp.create(2012, 1, 1, 0, 0, 0, r, 3600), tti.fromTimestamp!);
    });
  });

  it("transitions up to utc to not greater than utc from", () => {
    timeTypesHelpers((h) => {
      const tti = new TestTimezoneInfo("Test/Zone", null, null, null);
      const tz = new DataTimezone(tti);

      const to = h.time(2013, 1, 1, 0, 0, 0, 0, 0) as Arg;
      const from = h.time(2013, 1, 1, 0, 0, 0, 0, 0) as Arg;

      const error = assertRaises(ArgumentError, () => tz.transitionsUpTo(to, from));
      expect(error.message).toBe("to must be greater than from");
    });
  });

  it("transitions up to unspecified from", () => {
    timeTypesHelpers("unspecified_offset", (h) => {
      const tti = new TestTimezoneInfo("Test/Zone", null, null, null);
      const tz = new DataTimezone(tti);

      const to = h.time(2013, 1, 1, 0, 0, 0, r, 0) as Arg;
      const from = h.time(2012, 1, 1, 0, 0, 0, r) as Arg;

      const error = assertRaises(ArgumentError, () => tz.transitionsUpTo(to, from));
      expect(error.message).toBe("from must have a specified utc_offset");
    });
  });

  it("transitions up to unspecified to", () => {
    timeTypesHelpers("unspecified_offset", (h) => {
      const tti = new TestTimezoneInfo("Test/Zone", null, null, null);
      const tz = new DataTimezone(tti);

      const to = h.time(2013, 1, 1, 0, 0, 0, r) as Arg;

      const error = assertRaises(ArgumentError, () => tz.transitionsUpTo(to));
      expect(error.message).toBe("to must have a specified utc_offset");
    });
  });

  it("transitions up to nil from", () => {
    const transitions = [{}, {}];
    const tti = new TestTimezoneInfo("Test/Zone", null, null, transitions);
    const tz = new DataTimezone(tti);

    const to = Time.utc(2013, 1, 1, 0, 0, r);
    expect(tz.transitionsUpTo(to)).toBe(transitions);
    assertEqualWithOffset(new Timestamp(to.toI(), r, "utc"), tti.toTimestamp!);
    expect(tti.fromTimestamp).toBeNull();
  });

  it("transitions up to nil to", () => {
    const tti = new TestTimezoneInfo("Test/Zone", null, null, null);
    const tz = new DataTimezone(tti);

    const error = assertRaises(ArgumentError, () => tz.transitionsUpTo(null as unknown as Arg));
    expect(error.message).toBe("to must be specified");
  });

  it("transitions up to unsupported to", () => {
    const tti = new TestTimezoneInfo("Test/Zone", null, null, null);
    const tz = new DataTimezone(tti);
    const to = Time.utc(2013, 1, 1, 0, 0, 0).toI();

    const error = assertRaises(ArgumentError, () => tz.transitionsUpTo(to as unknown as Arg));
    expect(error.message).toMatch(/\bInteger\b/);
  });

  it("transitions up to unsupported from", () => {
    const tti = new TestTimezoneInfo("Test/Zone", null, null, null);
    const tz = new DataTimezone(tti);
    const to = Time.utc(2013, 1, 1, 0, 0, 0);
    const from = Time.utc(2012, 1, 1, 0, 0, 0).toI();

    const error = assertRaises(ArgumentError, () => tz.transitionsUpTo(to, from as unknown as Arg));
    expect(error.message).toMatch(/\bInteger\b/);
  });

  it("canonical identifier", () => {
    const tz = new DataTimezone(new TestTimezoneInfo("Test/Zone", null, [], []));
    expect(tz.canonicalIdentifier).toBe("Test/Zone");
  });

  it("canonical zone", () => {
    const tz = new DataTimezone(new TestTimezoneInfo("Test/Zone", null, [], []));
    expect(tz.canonicalZone()).toBe(tz);
  });

  it("inspect", () => {
    const tz = new DataTimezone(new TestTimezoneInfo("Test/Zone", null, [], []));
    expect(tz.inspect()).toBe("#<TZInfo::DataTimezone: Test/Zone>");
  });
});
