import { describe, expect, it } from "vitest";
import { DateTime, Time } from "@blazetrails/date";
import { ArgumentError, RangeError, Rational, rbHash } from "@blazetrails/ruby-compat";
import { Timestamp } from "../lib/index.js";

const R = (n: number, d: number) => new Rational(n, d);

function assertEqualWithOffset(expected: Time | DateTime, actual: Time | DateTime) {
  expect(actual).toBeInstanceOf(expected.constructor);
  expect(actual.equals(expected)).toBe(true);
  if (expected instanceof Time) {
    expect((actual as Time).utcOffset).toBe(expected.utcOffset);
  } else {
    expect((actual as DateTime).offset).toEqual(expected.offset);
  }
}

function raises(
  klass: abstract new (...args: never[]) => Error,
  message: string,
  fn: () => unknown,
) {
  let error: unknown;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(klass);
  expect((error as Error).message).toBe(message);
}

describe("TCTimestamp", () => {
  it("initialize timestamp only", () => {
    const t = new Timestamp(1476316800);
    expect(t.value).toBe(1476316800);
    expect(Number.isInteger(t.subSecond)).toBe(true);
    expect(t.subSecond).toBe(0);
    expect(t.utcOffset).toBeNull();
    expect(t.isUtc()).toBeNull();
  });

  it("initialize sub second", () => {
    const t = new Timestamp(1476316800, R(1, 10));
    expect(t.subSecond).toEqual(R(1, 10));
  });

  it("initialize sub second zero", () => {
    const t = new Timestamp(1476316800, 0);
    expect(Number.isInteger(t.subSecond)).toBe(true);
    expect(t.subSecond).toBe(0);
  });

  it("initialize zero utc offset", () => {
    const t = new Timestamp(1476316800, 0, 0);
    expect(t.value).toBe(1476316800);
    expect(t.utcOffset).toBe(0);
    expect(t.isUtc()).toBe(false);
  });

  it("initialize non zero utc offset", () => {
    const t = new Timestamp(1476316800, 0, 3600);
    expect(t.value).toBe(1476316800);
    expect(t.utcOffset).toBe(3600);
    expect(t.isUtc()).toBe(false);
  });

  it("initialize utc", () => {
    const t = new Timestamp(1476316800, 0, "utc");
    expect(t.value).toBe(1476316800);
    expect(t.utcOffset).toBe(0);
    expect(t.isUtc()).toBe(true);
  });

  it("initialize value nil", () => {
    raises(ArgumentError, "value must be an Integer", () => new Timestamp(null as never));
  });

  it("initialize valuenot integer", () => {
    raises(ArgumentError, "value must be an Integer", () => new Timestamp(1476316800.5));
  });

  it("initialize sub second nil", () => {
    raises(
      ArgumentError,
      "sub_second must be a Rational or the Integer 0",
      () => new Timestamp(1476316800, null as never),
    );
  });

  it("initialize sub second not integer or rational", () => {
    raises(
      ArgumentError,
      "sub_second must be a Rational or the Integer 0",
      () => new Timestamp(1476316800, 0.1),
    );
  });

  it("initialize sub second integer not zero", () => {
    raises(
      ArgumentError,
      "sub_second must be a Rational or the Integer 0",
      () => new Timestamp(1476316800, 1),
    );
  });

  it("initialize sub second less than zero", () => {
    raises(
      RangeError,
      "sub_second must be >= 0 and < 1",
      () => new Timestamp(1476316800, R(-1, 10)),
    );
  });

  it("initialize sub second greater than or equal to one", () => {
    raises(RangeError, "sub_second must be >= 0 and < 1", () => new Timestamp(1476316800, R(1, 1)));
  });

  it("initialize utc offset not integer or utc", () => {
    for (const utcOffset of [1.5, "zero"]) {
      raises(
        ArgumentError,
        "utc_offset must be an Integer, :utc or nil",
        () => new Timestamp(1476316800, 0, utcOffset as never),
      );
    }
  });

  const addAndSet = (offset: number | "utc" | null) => {
    const t1 = new Timestamp(1476316800, R(1, 10));
    const t2 = new Timestamp(1476316800, R(1, 10), 0);
    const t3 = new Timestamp(1476316800, R(1, 10), "utc");
    const rs = [
      t1.addAndSetUtcOffset(-1, offset),
      t2.addAndSetUtcOffset(1, offset),
      t3.addAndSetUtcOffset(2, offset),
    ];
    expect(rs.map((r) => r.value)).toEqual([1476316799, 1476316801, 1476316802]);
    for (const r of rs) expect(r.subSecond).toEqual(R(1, 10));
    return rs;
  };

  it("add and set utc offset utc", () => {
    for (const r of addAndSet("utc")) {
      expect(r.utcOffset).toBe(0);
      expect(r.isUtc()).toBe(true);
    }
  });

  it("add and set utc offset zero", () => {
    for (const r of addAndSet(0)) {
      expect(r.utcOffset).toBe(0);
      expect(r.isUtc()).toBe(false);
    }
  });

  it("add and set utc offset non zero", () => {
    for (const r of addAndSet(3600)) {
      expect(r.utcOffset).toBe(3600);
      expect(r.isUtc()).toBe(false);
    }
  });

  it("add and set utc offset unspecified", () => {
    for (const r of addAndSet(null)) {
      expect(r.utcOffset).toBeNull();
      expect(r.isUtc()).toBeNull();
    }
  });

  it("add and set utc offset add zero same offset", () => {
    const t1 = new Timestamp(1476316800, R(1, 10));
    const t2 = new Timestamp(1476316800, R(1, 10), 0);
    const t3 = new Timestamp(1476316800, R(1, 10), "utc");
    expect(t1.addAndSetUtcOffset(0, null)).toBe(t1);
    expect(t2.addAndSetUtcOffset(0, 0)).toBe(t2);
    expect(t3.addAndSetUtcOffset(0, "utc")).toBe(t3);
  });

  it("add and set utc offset seconds nil", () => {
    raises(ArgumentError, "seconds must be an Integer", () =>
      new Timestamp(1476316800).addAndSetUtcOffset(null as never, 0),
    );
  });

  it("add and set utc offset seconds non integer", () => {
    raises(ArgumentError, "seconds must be an Integer", () =>
      new Timestamp(1476316800).addAndSetUtcOffset(1.5, 0),
    );
  });

  it("add and set utc offset utc offset not integer or utc", () => {
    for (const utcOffset of [1.5, "zero"]) {
      raises(ArgumentError, "utc_offset must be an Integer, :utc or nil", () =>
        new Timestamp(1476316800).addAndSetUtcOffset(1, utcOffset as never),
      );
    }
  });

  it("utc from utc", () => {
    const t = new Timestamp(1476316800, 0, "utc");
    expect(t.utc()).toBe(t);
  });

  const utcFrom = (offset: number | null) => {
    const t = new Timestamp(1476316800, 0, offset).utc();
    expect(t.value).toBe(1476316800);
    expect(t.subSecond).toBe(0);
    expect(t.utcOffset).toBe(0);
    expect(t.isUtc()).toBe(true);
  };

  it("utc from zero offset", () => utcFrom(0));

  it("utc from non zero offset", () => utcFrom(3600));

  it("utc from unspecified offset", () => utcFrom(null));

  it("utc sub second", () => {
    const t = new Timestamp(1476316800, R(1, 10), 0).utc();
    expect(t.value).toBe(1476316800);
    expect(t.subSecond).toEqual(R(1, 10));
    expect(t.utcOffset).toBe(0);
    expect(t.isUtc()).toBe(true);
  });

  it("to time", () => {
    assertEqualWithOffset(Time.utc(2016, 10, 13, 0, 0, 1), new Timestamp(1476316801).toTime());
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1, R(100_000, 1) as never),
      new Timestamp(1476316801, R(1, 10)).toTime(),
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 0, 0, 1, 0),
      new Timestamp(1476316801, 0, 0).toTime(),
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 0, 0, R(11, 10) as never, 0),
      new Timestamp(1476316801, R(1, 10), 0).toTime(),
    );
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1),
      new Timestamp(1476316801, 0, "utc").toTime(),
    );
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1, R(100_000, 1) as never),
      new Timestamp(1476316801, R(1, 10), "utc").toTime(),
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 1, 0, 1, 3600),
      new Timestamp(1476316801, 0, 3600).toTime(),
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 1, 0, R(11, 10) as never, 3600),
      new Timestamp(1476316801, R(1, 10), 3600).toTime(),
    );
  });

  it("to datetime", () => {
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 0, 0, 1),
      new Timestamp(1476316801).toDatetime(),
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 0, 0, R(11, 10)),
      new Timestamp(1476316801, R(1, 10)).toDatetime(),
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 0, 0, 1),
      new Timestamp(1476316801, 0, 0).toDatetime(),
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 0, 0, R(11, 10)),
      new Timestamp(1476316801, R(1, 10), 0).toDatetime(),
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 0, 0, 1),
      new Timestamp(1476316801, 0, "utc").toDatetime(),
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 0, 0, R(11, 10)),
      new Timestamp(1476316801, R(1, 10), "utc").toDatetime(),
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 1, 0, 1, R(1, 24)),
      new Timestamp(1476316801, 0, 3600).toDatetime(),
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 1, 0, R(11, 10), R(1, 24)),
      new Timestamp(1476316801, R(1, 10), 3600).toDatetime(),
    );
  });

  it("to i", () => {
    for (const offset of [null, 0, "utc", 3600] as const) {
      expect(new Timestamp(1476316801, 0, offset).toI()).toBe(1476316801);
      expect(new Timestamp(1476316801, R(1, 10), offset).toI()).toBe(1476316801);
    }
  });

  it("to datetime returns gregorian", () => {
    const dt = new Timestamp(-12219379200).toDatetime();
    assertEqualWithOffset(new DateTime(1582, 10, 14, 0, 0, 0, 0, DateTime.GREGORIAN), dt);
    expect(dt.year).toBe(1582);
    expect(dt.month).toBe(10);
    expect(dt.day).toBe(14);
    expect(dt.isGregorian).toBe(true);
  });

  it("strftime", () => {
    const f = "%Y-%m-%d %H:%M:%S.%L %z %%";
    expect(new Timestamp(1476316800, R(1, 10)).strftime(f)).toBe("2016-10-13 00:00:00.100 +0000 %");
    expect(new Timestamp(1476316800, R(1, 10), "utc").strftime(f)).toBe(
      "2016-10-13 00:00:00.100 +0000 %",
    );
    expect(new Timestamp(1476316800, R(1, 10), 0).strftime(f)).toBe(
      "2016-10-13 00:00:00.100 +0000 %",
    );
    expect(new Timestamp(1476316800, R(1, 10), 3600).strftime(f)).toBe(
      "2016-10-13 01:00:00.100 +0100 %",
    );
    expect(new Timestamp(1476316800, R(1, 10), -3600).strftime(f)).toBe(
      "2016-10-12 23:00:00.100 -0100 %",
    );
  });

  it("strftime nil format", () => {
    const t = new Timestamp(1476316800, R(1, 10));
    raises(ArgumentError, "format must be specified", () => t.strftime(null));
  });

  it("to s without offset", () => {
    expect(new Timestamp(1476316800).toString()).toBe("1476316800");
  });

  it("to s utc", () => {
    expect(new Timestamp(1476316800, 0, "utc").toString()).toBe("1476316800 UTC");
  });

  it("to s offset", () => {
    expect(new Timestamp(1476316800, 0, 0).toString()).toBe("1476316800 +00:00");
    expect(new Timestamp(1476316800, 0, 3600).toString()).toBe(
      "1476320400 +01:00 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, -3600).toString()).toBe(
      "1476313200 -01:00 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, 1500).toString()).toBe(
      "1476318300 +00:25 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, -1500).toString()).toBe(
      "1476315300 -00:25 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, 1503).toString()).toBe(
      "1476318303 +00:25:03 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, -1503).toString()).toBe(
      "1476315297 -00:25:03 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, 90000).toString()).toBe(
      "1476406800 +25:00 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, -90000).toString()).toBe(
      "1476226800 -25:00 (1476316800 UTC)",
    );
  });

  it("to s sub second", () => {
    expect(new Timestamp(1476316800, R(2, 10)).toString()).toBe("1476316800 1/5");
  });

  it("to s utc sub second", () => {
    expect(new Timestamp(1476316800, R(2, 10), "utc").toString()).toBe("1476316800 1/5 UTC");
  });

  it("to s offset sub second", () => {
    expect(new Timestamp(1476316800, R(2, 10), 0).toString()).toBe("1476316800 1/5 +00:00");
    expect(new Timestamp(1476316800, R(2, 10), 3600).toString()).toBe(
      "1476320400 1/5 +01:00 (1476316800 1/5 UTC)",
    );
  });

  const a = R(100_000_000, 1_000_000_000);
  const b = R(100_000_001, 1_000_000_000);
  const pairs = (): [Timestamp, Timestamp, number | null][] => [
    [new Timestamp(1476313200), new Timestamp(1476316800), -1],
    [new Timestamp(1476316800), new Timestamp(1476316800), 0],
    [new Timestamp(1476316800), new Timestamp(1476313200), 1],
    [new Timestamp(1476316800, a), new Timestamp(1476316800, b), -1],
    [new Timestamp(1476316800, b), new Timestamp(1476316800, b), 0],
    [new Timestamp(1476316800, b), new Timestamp(1476316800, a), 1],
    [new Timestamp(1476313200, 0, 3600), new Timestamp(1476316800, 0, 0), -1],
    [new Timestamp(1476316800, 0, 3600), new Timestamp(1476316800, 0, 0), 0],
    [new Timestamp(1476316800, 0, 0), new Timestamp(1476313200, 0, 3600), 1],
    [new Timestamp(1476313200, 0, 3600), new Timestamp(1476316800, 0, "utc"), -1],
    [new Timestamp(1476316800, 0, 3600), new Timestamp(1476316800, 0, "utc"), 0],
    [new Timestamp(1476316800, 0, "utc"), new Timestamp(1476313200, 0, 3600), 1],
    [new Timestamp(1476316800, a, 3600), new Timestamp(1476316800, b, 0), -1],
    [new Timestamp(1476316800, b, 3600), new Timestamp(1476316800, b, 0), 0],
    [new Timestamp(1476316800, b, 0), new Timestamp(1476316800, a, 3600), 1],
    [new Timestamp(1476316800, a, 3600), new Timestamp(1476316800, b, "utc"), -1],
    [new Timestamp(1476316800, b, 3600), new Timestamp(1476316800, b, "utc"), 0],
    [new Timestamp(1476316800, b, "utc"), new Timestamp(1476316800, a, 3600), 1],
    [new Timestamp(1476316800), new Timestamp(1476316800, 0, 0), null],
    [new Timestamp(1476316800, 0, 0), new Timestamp(1476316800), null],
    [new Timestamp(1476316800), new Timestamp(1476316800, 0, "utc"), null],
    [new Timestamp(1476316800, 0, "utc"), new Timestamp(1476316800), null],
  ];

  it("compare", () => {
    for (const [x, y, expected] of pairs()) expect(x.compareTo(y)).toBe(expected);
    expect(new Timestamp(1476316800).compareTo({})).toBeNull();
    expect(new Timestamp(1476316800).compareTo(1476316800)).toBeNull();
  });

  it("eql", () => {
    for (const [x, y, expected] of pairs()) expect(x.eql(y)).toBe(expected === 0);
    expect(new Timestamp(1476316800).eql({})).toBe(false);
    expect(new Timestamp(1476316800).eql(1476316800)).toBe(false);
  });

  it("hash", () => {
    expect(new Timestamp(1476316800).hash()).toBe(rbHash([1476316800, 0, false]));
    expect(new Timestamp(1476316800, 0, 0).hash()).toBe(rbHash([1476316800, 0, true]));
    expect(new Timestamp(1476316800, 0, "utc").hash()).toBe(rbHash([1476316800, 0, true]));
    expect(new Timestamp(1476316800, R(0, 1), 0).hash()).toBe(rbHash([1476316800, 0, true]));
    expect(new Timestamp(1476316800, R(1, 10), 3600).hash()).toBe(
      rbHash([1476316800, R(1, 10), true]),
    );
  });

  it("inspect", () => {
    expect(new Timestamp(1476316800, 0, 0).inspect()).toBe(
      "#<TZInfo::Timestamp: @value=1476316800, @sub_second=0, @utc_offset=0, @utc=false>",
    );
    expect(new Timestamp(1476316800, R(0, 1), "utc").inspect()).toBe(
      "#<TZInfo::Timestamp: @value=1476316800, @sub_second=0, @utc_offset=0, @utc=true>",
    );
    expect(new Timestamp(1476316800, R(1, 10), 3600).inspect()).toBe(
      "#<TZInfo::Timestamp: @value=1476316800, @sub_second=1/10, @utc_offset=3600, @utc=false>",
    );
    expect(new Timestamp(1476316800, R(1, 10), null).inspect()).toBe(
      "#<TZInfo::Timestamp: @value=1476316800, @sub_second=1/10, @utc_offset=nil, @utc=nil>",
    );
  });

  const classUtc = (subSecond: number | Rational) => {
    const t = Timestamp.utc(1476316800, subSecond);
    expect(t).toBeInstanceOf(Timestamp);
    expect(t.value).toBe(1476316800);
    expect(t.subSecond).toEqual(subSecond);
    expect(t.utcOffset).toBe(0);
    expect(t.isUtc()).toBe(true);
  };

  it("class utc", () => classUtc(0));

  it("class utc sub second", () => classUtc(R(1, 10)));

  it("class utc value nil", () =>
    raises(ArgumentError, "value must be an Integer", () => Timestamp.utc(null as never)));

  it("class utc value not integer", () =>
    raises(ArgumentError, "value must be an Integer", () => Timestamp.utc(1476316800.1)));

  it("class utc sub second nil", () =>
    raises(ArgumentError, "sub_second must be a Rational or the Integer 0", () =>
      Timestamp.utc(1476316800, null as never),
    ));

  it("class utc sub second not integer or rational", () =>
    raises(ArgumentError, "sub_second must be a Rational or the Integer 0", () =>
      Timestamp.utc(1476316800, 0.1),
    ));

  it("class utc sub second integer not zero", () =>
    raises(ArgumentError, "sub_second must be a Rational or the Integer 0", () =>
      Timestamp.utc(1476316800, 1),
    ));

  it("class utc sub second less than zero", () =>
    raises(RangeError, "sub_second must be >= 0 and < 1", () =>
      Timestamp.utc(1476316800, R(-1, 10)),
    ));

  it("class utc sub second greater than or equal to one", () =>
    raises(RangeError, "sub_second must be >= 0 and < 1", () =>
      Timestamp.utc(1476316800, R(1, 1)),
    ));
});
