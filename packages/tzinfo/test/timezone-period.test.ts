import { describe, expect, it } from "vitest";
import { ArgumentError, NotImplementedError } from "@blazetrails/ruby-compat";
import { Timestamp, TimezoneOffset, TimezonePeriod, TimezoneTransition } from "../lib/index.js";

class TestTimezonePeriod extends TimezonePeriod {
  readonly #startTransition: TimezoneTransition | null;
  readonly #endTransition: TimezoneTransition | null;

  override get startTransition(): TimezoneTransition | null {
    return this.#startTransition;
  }

  override get endTransition(): TimezoneTransition | null {
    return this.#endTransition;
  }

  constructor(
    startTransition: TimezoneTransition | null,
    endTransition: TimezoneTransition | null,
    offset: TimezoneOffset,
  ) {
    super(offset);
    this.#startTransition = startTransition;
    this.#endTransition = endTransition;
  }
}

function assertEqualWithOffsetAndClass(expected: Timestamp, actual: Timestamp | null) {
  expect(actual).toBeInstanceOf(Timestamp);
  expect(actual!.equals(expected)).toBe(true);
  expect(actual!.utcOffset).toBe(expected.utcOffset);
  expect(actual!.constructor).toBe(expected.constructor);
}

describe("TCTimezonePeriod", () => {
  const std = new TimezoneOffset(-7200, 0, "TEST");
  const dst = new TimezoneOffset(-7200, 3600, "TEST");

  it("initialize", () => {
    const offset = new TimezoneOffset(-7200, 3600, "SPECIAL");
    const p = new TimezonePeriod(offset);
    expect(p.offset).toBe(offset);
  });

  it("initialize nil", () => {
    expect(() => new TimezonePeriod(null)).toThrow(ArgumentError);
    expect(() => new TimezonePeriod(null)).toThrow(/\boffset\b/);
  });

  it("start transition", () => {
    const p = new TimezonePeriod(new TimezoneOffset(-7200, 3600, "SPECIAL"));
    expect(() => p.startTransition).toThrow(NotImplementedError);
    expect(() => p.startTransition).toThrow(/\bstart_transition\b/);
  });

  it("end transition", () => {
    const p = new TimezonePeriod(new TimezoneOffset(-7200, 3600, "SPECIAL"));
    expect(() => p.endTransition).toThrow(NotImplementedError);
    expect(() => p.endTransition).toThrow(/\bend_transition\b/);
  });

  for (const [method, rubyName] of [
    ["baseUtcOffset", "base utc offset"],
    ["utcOffset", "utc offset"],
  ] as const) {
    it(rubyName, () => {
      const p = new TimezonePeriod(new TimezoneOffset(-14400, 3600, "TEST"));
      expect(p[method]).toBe(-14400);
    });
  }

  it("std offset", () => {
    const p = new TimezonePeriod(new TimezoneOffset(-14400, 3600, "TEST"));
    expect(p.stdOffset).toBe(3600);
  });

  for (const method of ["abbreviation", "abbr"] as const) {
    it(method, () => {
      const p = new TimezonePeriod(new TimezoneOffset(-14400, 3600, "TEST"));
      expect(p[method]).toBe("TEST");
    });
  }

  it("zone identifier", () => {
    const p = new TimezonePeriod(new TimezoneOffset(-14400, 3600, "TEST"));
    expect(p.zoneIdentifier).toBe("TEST");
  });

  for (const [method, rubyName] of [
    ["observedUtcOffset", "observed utc offset"],
    ["utcTotalOffset", "utc total offset"],
  ] as const) {
    it(rubyName, () => {
      const p = new TimezonePeriod(new TimezoneOffset(-14400, 3600, "TEST"));
      expect(p[method]).toBe(-10800);
    });
  }

  it("dst", () => {
    const p1 = new TimezonePeriod(new TimezoneOffset(-14400, 3600, "TEST"));
    const p2 = new TimezonePeriod(new TimezoneOffset(-14400, 0, "TEST"));

    expect(p1.isDst()).toBe(true);
    expect(p2.isDst()).toBe(false);
  });

  it("starts at bounded", () => {
    const p = new TestTimezonePeriod(new TimezoneTransition(dst, std, 1136073600), null, dst);

    assertEqualWithOffsetAndClass(Timestamp.utc(1136073600), p.startsAt());
  });

  it("starts at unbounded", () => {
    const p = new TestTimezonePeriod(null, null, dst);

    expect(p.startsAt()).toBeNull();
  });

  it("ends at bounded", () => {
    const p = new TestTimezonePeriod(null, new TimezoneTransition(std, dst, 1136160000), dst);

    assertEqualWithOffsetAndClass(Timestamp.utc(1136160000), p.endsAt());
  });

  it("ends at unbounded", () => {
    const p = new TestTimezonePeriod(null, null, dst);

    expect(p.endsAt()).toBeNull();
  });
});
