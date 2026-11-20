import { describe, expect, it } from "vitest";
import { Date, DateTime, Time } from "@blazetrails/date";
import {
  ArgumentError,
  RangeError,
  Rational,
  rbCInteger,
  rbDbl2num,
  rbHash,
  rbObjClassname,
} from "@blazetrails/ruby-compat";
import { Timestamp } from "../lib/index.js";
import {
  TIME_SUPPORTS_DISTINCT_UTC,
  TimeLike,
  TimeLikeWithOffset,
  assertEqualWithOffset,
  assertRaises,
} from "./test-utils.js";

const R = (n: number, d: number) => new Rational(n, d);

class TestTimestampSubclass extends Timestamp {}

function forTest(args: [unknown, ...unknown[]], block: (t: Timestamp) => void) {
  const t = Timestamp.for(...(args as [unknown]));
  expect(t).toBeInstanceOf(Timestamp);
  block(t as Timestamp);

  let blockCalled = 0;
  const blockResult = Timestamp.for(args[0], (args[1] ?? "preserve") as "preserve", (t2) => {
    blockCalled += 1;
    expect(t2).toBeInstanceOf(Timestamp);
    block(t2);
    return t2;
  });

  expect(blockCalled).toEqual(1);

  let expectedClass: abstract new (...a: never[]) => unknown;
  if (args[0] instanceof TestTimestampSubclass) {
    expectedClass = Timestamp;
  } else if (args[0] instanceof TimeLike) {
    expectedClass = Time;
  } else {
    expectedClass = (args[0] as object).constructor as typeof Timestamp;
  }

  expect(blockResult).toBeInstanceOf(expectedClass);
}

function forRaisesTest(exception: typeof ArgumentError, message: string, ...args: unknown[]) {
  let error = assertRaises(exception, () => Timestamp.for(...(args as [unknown])));
  expect(error.message).toEqual(message);

  error = assertRaises(exception, () =>
    Timestamp.for(args[0], (args[1] ?? "preserve") as "preserve", () => {
      expect.unreachable("block should not have been called");
    }),
  );
  expect(error.message).toEqual(message);
}

function forBlockInvalidResultTest(blockResult: unknown) {
  let blockCalled = false;
  const error = assertRaises(ArgumentError, () =>
    Timestamp.for(new Timestamp(1476316800), () => {
      blockCalled = true;
      return blockResult;
    }),
  );
  expect(error.message).toEqual("block must return a Timestamp");
  expect(blockCalled).toBeTruthy();
}

describe("TCTimestamp", () => {
  it("initialize timestamp only", () => {
    const t = new Timestamp(1476316800);
    expect(t.value).toEqual(1476316800);
    expect(t.subSecond).toBeInstanceOf(rbCInteger);
    expect(t.subSecond).toEqual(0);
    expect(t.utcOffset).toBeNull();
    expect(t.isUtc()).toBeNull();
  });

  it("initialize sub second", () => {
    const t = new Timestamp(1476316800, R(1, 10));
    expect(t.subSecond).toEqual(R(1, 10));
  });

  it("initialize sub second zero", () => {
    const t = new Timestamp(1476316800, 0);
    expect(t.subSecond).toBeInstanceOf(rbCInteger);
    expect(t.subSecond).toEqual(0);
  });

  it("initialize zero utc offset", () => {
    const t = new Timestamp(1476316800, 0, 0);
    expect(t.value).toEqual(1476316800);
    expect(t.utcOffset).toEqual(0);
    expect(t.isUtc()).toEqual(false);
  });

  it("initialize non zero utc offset", () => {
    const t = new Timestamp(1476316800, 0, 3600);
    expect(t.value).toEqual(1476316800);
    expect(t.utcOffset).toEqual(3600);
    expect(t.isUtc()).toEqual(false);
  });

  it("initialize utc", () => {
    const t = new Timestamp(1476316800, 0, "utc");
    expect(t.value).toEqual(1476316800);
    expect(t.utcOffset).toEqual(0);
    expect(t.isUtc()).toEqual(true);
  });

  it("initialize value nil", () => {
    const error = assertRaises(ArgumentError, () => new Timestamp(null as never));
    expect(error.message).toEqual("value must be an Integer");
  });

  it("initialize valuenot integer", () => {
    const error = assertRaises(ArgumentError, () => new Timestamp(1476316800.5));
    expect(error.message).toEqual("value must be an Integer");
  });

  it("initialize sub second nil", () => {
    const error = assertRaises(ArgumentError, () => new Timestamp(1476316800, null as never));
    expect(error.message).toEqual("sub_second must be a Rational or the Integer 0");
  });

  it("initialize sub second not integer or rational", () => {
    const error = assertRaises(ArgumentError, () => new Timestamp(1476316800, 0.1));
    expect(error.message).toEqual("sub_second must be a Rational or the Integer 0");
  });

  it("initialize sub second integer not zero", () => {
    const error = assertRaises(ArgumentError, () => new Timestamp(1476316800, 1));
    expect(error.message).toEqual("sub_second must be a Rational or the Integer 0");
  });

  it("initialize sub second less than zero", () => {
    const error = assertRaises(RangeError, () => new Timestamp(1476316800, R(-1, 10)));
    expect(error.message).toEqual("sub_second must be >= 0 and < 1");
  });

  it("initialize sub second greater than or equal to one", () => {
    const error = assertRaises(RangeError, () => new Timestamp(1476316800, R(1, 1)));
    expect(error.message).toEqual("sub_second must be >= 0 and < 1");
  });

  it("initialize utc offset not integer or utc", () => {
    for (const utcOffset of [1.5, "zero"]) {
      const error = assertRaises(
        ArgumentError,
        () => new Timestamp(1476316800, 0, utcOffset as never),
      );
      expect(error.message).toEqual("utc_offset must be an Integer, :utc or nil");
    }
  });

  it("add and set utc offset utc", () => {
    const t1 = new Timestamp(1476316800, R(1, 10));
    const t2 = new Timestamp(1476316800, R(1, 10), 0);
    const t3 = new Timestamp(1476316800, R(1, 10), "utc");

    const r1 = t1.addAndSetUtcOffset(-1, "utc");
    const r2 = t2.addAndSetUtcOffset(1, "utc");
    const r3 = t3.addAndSetUtcOffset(2, "utc");

    expect(r1.value).toEqual(1476316799);
    expect(r2.value).toEqual(1476316801);
    expect(r3.value).toEqual(1476316802);

    expect(r1.subSecond).toEqual(R(1, 10));
    expect(r2.subSecond).toEqual(R(1, 10));
    expect(r3.subSecond).toEqual(R(1, 10));

    expect(r1.utcOffset).toEqual(0);
    expect(r2.utcOffset).toEqual(0);
    expect(r3.utcOffset).toEqual(0);

    expect(r1.isUtc()).toEqual(true);
    expect(r2.isUtc()).toEqual(true);
    expect(r3.isUtc()).toEqual(true);
  });

  it("add and set utc offset zero", () => {
    const t1 = new Timestamp(1476316800, R(1, 10));
    const t2 = new Timestamp(1476316800, R(1, 10), 0);
    const t3 = new Timestamp(1476316800, R(1, 10), "utc");

    const r1 = t1.addAndSetUtcOffset(-1, 0);
    const r2 = t2.addAndSetUtcOffset(1, 0);
    const r3 = t3.addAndSetUtcOffset(2, 0);

    expect(r1.value).toEqual(1476316799);
    expect(r2.value).toEqual(1476316801);
    expect(r3.value).toEqual(1476316802);

    expect(r1.subSecond).toEqual(R(1, 10));
    expect(r2.subSecond).toEqual(R(1, 10));
    expect(r3.subSecond).toEqual(R(1, 10));

    expect(r1.utcOffset).toEqual(0);
    expect(r2.utcOffset).toEqual(0);
    expect(r3.utcOffset).toEqual(0);

    expect(r1.isUtc()).toEqual(false);
    expect(r2.isUtc()).toEqual(false);
    expect(r3.isUtc()).toEqual(false);
  });

  it("add and set utc offset non zero", () => {
    const t1 = new Timestamp(1476316800, R(1, 10));
    const t2 = new Timestamp(1476316800, R(1, 10), 0);
    const t3 = new Timestamp(1476316800, R(1, 10), "utc");

    const r1 = t1.addAndSetUtcOffset(-1, 3600);
    const r2 = t2.addAndSetUtcOffset(1, 3600);
    const r3 = t3.addAndSetUtcOffset(2, 3600);

    expect(r1.value).toEqual(1476316799);
    expect(r2.value).toEqual(1476316801);
    expect(r3.value).toEqual(1476316802);

    expect(r1.subSecond).toEqual(R(1, 10));
    expect(r2.subSecond).toEqual(R(1, 10));
    expect(r3.subSecond).toEqual(R(1, 10));

    expect(r1.utcOffset).toEqual(3600);
    expect(r2.utcOffset).toEqual(3600);
    expect(r3.utcOffset).toEqual(3600);

    expect(r1.isUtc()).toEqual(false);
    expect(r2.isUtc()).toEqual(false);
    expect(r3.isUtc()).toEqual(false);
  });

  it("add and set utc offset unspecified", () => {
    const t1 = new Timestamp(1476316800, R(1, 10));
    const t2 = new Timestamp(1476316800, R(1, 10), 0);
    const t3 = new Timestamp(1476316800, R(1, 10), "utc");

    const r1 = t1.addAndSetUtcOffset(-1, null);
    const r2 = t2.addAndSetUtcOffset(1, null);
    const r3 = t3.addAndSetUtcOffset(2, null);

    expect(r1.value).toEqual(1476316799);
    expect(r2.value).toEqual(1476316801);
    expect(r3.value).toEqual(1476316802);

    expect(r1.subSecond).toEqual(R(1, 10));
    expect(r2.subSecond).toEqual(R(1, 10));
    expect(r3.subSecond).toEqual(R(1, 10));

    expect(r1.utcOffset).toBeNull();
    expect(r2.utcOffset).toBeNull();
    expect(r3.utcOffset).toBeNull();

    expect(r1.isUtc()).toBeNull();
    expect(r2.isUtc()).toBeNull();
    expect(r3.isUtc()).toBeNull();
  });

  it("add and set utc offset add zero same offset", () => {
    const t1 = new Timestamp(1476316800, R(1, 10));
    const t2 = new Timestamp(1476316800, R(1, 10), 0);
    const t3 = new Timestamp(1476316800, R(1, 10), "utc");

    const r1 = t1.addAndSetUtcOffset(0, null);
    const r2 = t2.addAndSetUtcOffset(0, 0);
    const r3 = t3.addAndSetUtcOffset(0, "utc");

    expect(r1).toBe(t1);
    expect(r2).toBe(t2);
    expect(r3).toBe(t3);
  });

  it("add and set utc offset seconds nil", () => {
    const error = assertRaises(ArgumentError, () =>
      new Timestamp(1476316800).addAndSetUtcOffset(null as never, 0),
    );
    expect(error.message).toEqual("seconds must be an Integer");
  });

  it("add and set utc offset seconds non integer", () => {
    const error = assertRaises(ArgumentError, () =>
      new Timestamp(1476316800).addAndSetUtcOffset(1.5, 0),
    );
    expect(error.message).toEqual("seconds must be an Integer");
  });

  it("add and set utc offset utc offset not integer or utc", () => {
    for (const utcOffset of [1.5, "zero"]) {
      const error = assertRaises(ArgumentError, () =>
        new Timestamp(1476316800).addAndSetUtcOffset(1, utcOffset as never),
      );
      expect(error.message).toEqual("utc_offset must be an Integer, :utc or nil");
    }
  });

  it("utc from utc", () => {
    const t = new Timestamp(1476316800, 0, "utc");
    expect(t.utc()).toBe(t);
  });

  it("utc from zero offset", () => {
    const t = new Timestamp(1476316800, 0, 0).utc();
    expect(t.value).toEqual(1476316800);
    expect(t.subSecond).toEqual(0);
    expect(t.utcOffset).toEqual(0);
    expect(t.isUtc()).toEqual(true);
  });

  it("utc from non zero offset", () => {
    const t = new Timestamp(1476316800, 0, 3600).utc();
    expect(t.value).toEqual(1476316800);
    expect(t.subSecond).toEqual(0);
    expect(t.utcOffset).toEqual(0);
    expect(t.isUtc()).toEqual(true);
  });

  it("utc from unspecified offset", () => {
    const t = new Timestamp(1476316800, 0).utc();
    expect(t.value).toEqual(1476316800);
    expect(t.subSecond).toEqual(0);
    expect(t.utcOffset).toEqual(0);
    expect(t.isUtc()).toEqual(true);
  });

  it("utc sub second", () => {
    const t = new Timestamp(1476316800, R(1, 10), 0).utc();
    expect(t.value).toEqual(1476316800);
    expect(t.subSecond).toEqual(R(1, 10));
    expect(t.utcOffset).toEqual(0);
    expect(t.isUtc()).toEqual(true);
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
    expect(new Timestamp(1476316801).toI()).toEqual(1476316801);
    expect(new Timestamp(1476316801, R(1, 10)).toI()).toEqual(1476316801);
    expect(new Timestamp(1476316801, 0, 0).toI()).toEqual(1476316801);
    expect(new Timestamp(1476316801, R(1, 10), 0).toI()).toEqual(1476316801);
    expect(new Timestamp(1476316801, 0, "utc").toI()).toEqual(1476316801);
    expect(new Timestamp(1476316801, R(1, 10), "utc").toI()).toEqual(1476316801);
    expect(new Timestamp(1476316801, 0, 3600).toI()).toEqual(1476316801);
    expect(new Timestamp(1476316801, R(1, 10), 3600).toI()).toEqual(1476316801);
  });

  it("to datetime returns gregorian", () => {
    const dt = new Timestamp(-12219379200).toDatetime();
    assertEqualWithOffset(new DateTime(1582, 10, 14, 0, 0, 0, 0, DateTime.GREGORIAN), dt);
    expect(dt.year).toBe(1582);
    expect(dt.month).toBe(10);
    expect(dt.day).toBe(14);
    expect(dt.isGregorian).toBeTruthy();
  });

  it("strftime", () => {
    expect(new Timestamp(1476316800, R(1, 10)).strftime("%Y-%m-%d %H:%M:%S.%L %z %%")).toEqual(
      "2016-10-13 00:00:00.100 +0000 %",
    );
    expect(
      new Timestamp(1476316800, R(1, 10), "utc").strftime("%Y-%m-%d %H:%M:%S.%L %z %%"),
    ).toEqual("2016-10-13 00:00:00.100 +0000 %");
    expect(new Timestamp(1476316800, R(1, 10), 0).strftime("%Y-%m-%d %H:%M:%S.%L %z %%")).toEqual(
      "2016-10-13 00:00:00.100 +0000 %",
    );
    expect(
      new Timestamp(1476316800, R(1, 10), 3600).strftime("%Y-%m-%d %H:%M:%S.%L %z %%"),
    ).toEqual("2016-10-13 01:00:00.100 +0100 %");
    expect(
      new Timestamp(1476316800, R(1, 10), -3600).strftime("%Y-%m-%d %H:%M:%S.%L %z %%"),
    ).toEqual("2016-10-12 23:00:00.100 -0100 %");
  });

  it("strftime nil format", () => {
    const t = new Timestamp(1476316800, R(1, 10));
    const error = assertRaises(ArgumentError, () => t.strftime(null as never));
    expect(error.message).toEqual("format must be specified");
  });

  it("to s without offset", () => {
    expect(new Timestamp(1476316800).toString()).toEqual("1476316800");
  });

  it("to s utc", () => {
    expect(new Timestamp(1476316800, 0, "utc").toString()).toEqual("1476316800 UTC");
  });

  it("to s offset", () => {
    expect(new Timestamp(1476316800, 0, 0).toString()).toEqual("1476316800 +00:00");
    expect(new Timestamp(1476316800, 0, 3600).toString()).toEqual(
      "1476320400 +01:00 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, -3600).toString()).toEqual(
      "1476313200 -01:00 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, 1500).toString()).toEqual(
      "1476318300 +00:25 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, -1500).toString()).toEqual(
      "1476315300 -00:25 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, 1503).toString()).toEqual(
      "1476318303 +00:25:03 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, -1503).toString()).toEqual(
      "1476315297 -00:25:03 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, 90000).toString()).toEqual(
      "1476406800 +25:00 (1476316800 UTC)",
    );
    expect(new Timestamp(1476316800, 0, -90000).toString()).toEqual(
      "1476226800 -25:00 (1476316800 UTC)",
    );
  });

  it("to s sub second", () => {
    expect(new Timestamp(1476316800, R(2, 10)).toString()).toEqual("1476316800 1/5");
  });

  it("to s utc sub second", () => {
    expect(new Timestamp(1476316800, R(2, 10), "utc").toString()).toEqual("1476316800 1/5 UTC");
  });

  it("to s offset sub second", () => {
    expect(new Timestamp(1476316800, R(2, 10), 0).toString()).toEqual("1476316800 1/5 +00:00");
    expect(new Timestamp(1476316800, R(2, 10), 3600).toString()).toEqual(
      "1476320400 1/5 +01:00 (1476316800 1/5 UTC)",
    );
  });

  it("compare", () => {
    expect(new Timestamp(1476313200).compareTo(new Timestamp(1476316800))).toEqual(-1);
    expect(new Timestamp(1476316800).compareTo(new Timestamp(1476316800))).toEqual(0);
    expect(new Timestamp(1476316800).compareTo(new Timestamp(1476313200))).toEqual(1);

    expect(
      new Timestamp(1476316800, R(100000000, 1000000000)).compareTo(
        new Timestamp(1476316800, R(100000001, 1000000000)),
      ),
    ).toEqual(-1);
    expect(
      new Timestamp(1476316800, R(100000001, 1000000000)).compareTo(
        new Timestamp(1476316800, R(100000001, 1000000000)),
      ),
    ).toEqual(0);
    expect(
      new Timestamp(1476316800, R(100000001, 1000000000)).compareTo(
        new Timestamp(1476316800, R(100000000, 1000000000)),
      ),
    ).toEqual(1);

    expect(new Timestamp(1476313200, 0, 3600).compareTo(new Timestamp(1476316800, 0, 0))).toEqual(
      -1,
    );
    expect(new Timestamp(1476316800, 0, 3600).compareTo(new Timestamp(1476316800, 0, 0))).toEqual(
      0,
    );
    expect(new Timestamp(1476316800, 0, 0).compareTo(new Timestamp(1476313200, 0, 3600))).toEqual(
      1,
    );

    expect(
      new Timestamp(1476313200, 0, 3600).compareTo(new Timestamp(1476316800, 0, "utc")),
    ).toEqual(-1);
    expect(
      new Timestamp(1476316800, 0, 3600).compareTo(new Timestamp(1476316800, 0, "utc")),
    ).toEqual(0);
    expect(
      new Timestamp(1476316800, 0, "utc").compareTo(new Timestamp(1476313200, 0, 3600)),
    ).toEqual(1);

    expect(
      new Timestamp(1476316800, R(100000000, 1000000000), 3600).compareTo(
        new Timestamp(1476316800, R(100000001, 1000000000), 0),
      ),
    ).toEqual(-1);
    expect(
      new Timestamp(1476316800, R(100000001, 1000000000), 3600).compareTo(
        new Timestamp(1476316800, R(100000001, 1000000000), 0),
      ),
    ).toEqual(0);
    expect(
      new Timestamp(1476316800, R(100000001, 1000000000), 0).compareTo(
        new Timestamp(1476316800, R(100000000, 1000000000), 3600),
      ),
    ).toEqual(1);

    expect(
      new Timestamp(1476316800, R(100000000, 1000000000), 3600).compareTo(
        new Timestamp(1476316800, R(100000001, 1000000000), "utc"),
      ),
    ).toEqual(-1);
    expect(
      new Timestamp(1476316800, R(100000001, 1000000000), 3600).compareTo(
        new Timestamp(1476316800, R(100000001, 1000000000), "utc"),
      ),
    ).toEqual(0);
    expect(
      new Timestamp(1476316800, R(100000001, 1000000000), "utc").compareTo(
        new Timestamp(1476316800, R(100000000, 1000000000), 3600),
      ),
    ).toEqual(1);

    expect(new Timestamp(1476316800).compareTo(new Timestamp(1476316800, 0, 0))).toBeNull();
    expect(new Timestamp(1476316800, 0, 0).compareTo(new Timestamp(1476316800))).toBeNull();

    expect(new Timestamp(1476316800).compareTo(new Timestamp(1476316800, 0, "utc"))).toBeNull();
    expect(new Timestamp(1476316800, 0, "utc").compareTo(new Timestamp(1476316800))).toBeNull();

    expect(new Timestamp(1476316800).compareTo(new (class Object {})())).toBeNull();
    expect(new Timestamp(1476316800).compareTo(1476316800)).toBeNull();
  });

  it("eql", () => {
    expect(new Timestamp(1476313200).eql(new Timestamp(1476316800))).toEqual(false);
    expect(new Timestamp(1476316800).eql(new Timestamp(1476316800))).toEqual(true);
    expect(new Timestamp(1476316800).eql(new Timestamp(1476313200))).toEqual(false);

    expect(
      new Timestamp(1476316800, R(100000000, 1000000000)).eql(
        new Timestamp(1476316800, R(100000001, 1000000000)),
      ),
    ).toEqual(false);
    expect(
      new Timestamp(1476316800, R(100000001, 1000000000)).eql(
        new Timestamp(1476316800, R(100000001, 1000000000)),
      ),
    ).toEqual(true);
    expect(
      new Timestamp(1476316800, R(100000001, 1000000000)).eql(
        new Timestamp(1476316800, R(100000000, 1000000000)),
      ),
    ).toEqual(false);

    expect(new Timestamp(1476313200, 0, 3600).eql(new Timestamp(1476316800, 0, 0))).toEqual(false);
    expect(new Timestamp(1476316800, 0, 3600).eql(new Timestamp(1476316800, 0, 0))).toEqual(true);
    expect(new Timestamp(1476316800, 0, 0).eql(new Timestamp(1476313200, 0, 3600))).toEqual(false);

    expect(new Timestamp(1476313200, 0, 3600).eql(new Timestamp(1476316800, 0, "utc"))).toEqual(
      false,
    );
    expect(new Timestamp(1476316800, 0, 3600).eql(new Timestamp(1476316800, 0, "utc"))).toEqual(
      true,
    );
    expect(new Timestamp(1476316800, 0, "utc").eql(new Timestamp(1476313200, 0, 3600))).toEqual(
      false,
    );

    expect(
      new Timestamp(1476316800, R(100000000, 1000000000), 3600).eql(
        new Timestamp(1476316800, R(100000001, 1000000000), 0),
      ),
    ).toEqual(false);
    expect(
      new Timestamp(1476316800, R(100000001, 1000000000), 3600).eql(
        new Timestamp(1476316800, R(100000001, 1000000000), 0),
      ),
    ).toEqual(true);
    expect(
      new Timestamp(1476316800, R(100000001, 1000000000), 0).eql(
        new Timestamp(1476316800, R(100000000, 1000000000), 3600),
      ),
    ).toEqual(false);

    expect(
      new Timestamp(1476316800, R(100000000, 1000000000), 3600).eql(
        new Timestamp(1476316800, R(100000001, 1000000000), "utc"),
      ),
    ).toEqual(false);
    expect(
      new Timestamp(1476316800, R(100000001, 1000000000), 3600).eql(
        new Timestamp(1476316800, R(100000001, 1000000000), "utc"),
      ),
    ).toEqual(true);
    expect(
      new Timestamp(1476316800, R(100000001, 1000000000), "utc").eql(
        new Timestamp(1476316800, R(100000000, 1000000000), 3600),
      ),
    ).toEqual(false);

    expect(new Timestamp(1476316800).eql(new Timestamp(1476316800, 0, 0))).toEqual(false);
    expect(new Timestamp(1476316800, 0, 0).eql(new Timestamp(1476316800))).toEqual(false);

    expect(new Timestamp(1476316800).eql(new Timestamp(1476316800, 0, "utc"))).toEqual(false);
    expect(new Timestamp(1476316800, 0, "utc").eql(new Timestamp(1476316800))).toEqual(false);

    expect(new Timestamp(1476316800).eql(new (class Object {})())).toEqual(false);
    expect(new Timestamp(1476316800).eql(1476316800)).toEqual(false);
  });

  it("hash", () => {
    expect(new Timestamp(1476316800).hash()).toEqual(rbHash([1476316800, 0, false]));
    expect(new Timestamp(1476316800, 0, 0).hash()).toEqual(rbHash([1476316800, 0, true]));
    expect(new Timestamp(1476316800, 0, "utc").hash()).toEqual(rbHash([1476316800, 0, true]));
    expect(new Timestamp(1476316800, R(0, 1), 0).hash()).toEqual(rbHash([1476316800, 0, true]));
    expect(new Timestamp(1476316800, R(1, 10), 3600).hash()).toEqual(
      rbHash([1476316800, R(1, 10), true]),
    );
  });

  it("inspect", () => {
    expect(new Timestamp(1476316800, 0, 0).inspect()).toEqual(
      "#<TZInfo::Timestamp: @value=1476316800, @sub_second=0, @utc_offset=0, @utc=false>",
    );
    expect(new Timestamp(1476316800, R(0, 1), "utc").inspect()).toEqual(
      "#<TZInfo::Timestamp: @value=1476316800, @sub_second=0, @utc_offset=0, @utc=true>",
    );
    expect(new Timestamp(1476316800, R(1, 10), 3600).inspect()).toEqual(
      "#<TZInfo::Timestamp: @value=1476316800, @sub_second=1/10, @utc_offset=3600, @utc=false>",
    );
    expect(new Timestamp(1476316800, R(1, 10), null).inspect()).toEqual(
      "#<TZInfo::Timestamp: @value=1476316800, @sub_second=1/10, @utc_offset=nil, @utc=nil>",
    );
  });

  it("create unspecified offset", () => {
    const t = Timestamp.create(2018, 1, 10, 12, 0, 0, 0, null);
    expect(t.value).toEqual(1515585600);
    expect(t.utcOffset).toBeNull();
    expect(t.isUtc()).toBeNull();
  });

  it("create utc", () => {
    const t = Timestamp.create(2018, 1, 10, 12, 0, 0, 0, "utc");
    expect(t.value).toEqual(1515585600);
    expect(t.utcOffset).toEqual(0);
    expect(t.isUtc()).toEqual(true);
  });

  it("create zero offset", () => {
    const t = Timestamp.create(2018, 1, 10, 12, 0, 0, 0, 0);
    expect(t.value).toEqual(1515585600);
    expect(t.utcOffset).toEqual(0);
    expect(t.isUtc()).toEqual(false);
  });

  it("create local offset positive", () => {
    const t = Timestamp.create(2018, 1, 10, 12, 0, 0, 0, 3600);
    expect(t.value).toEqual(1515582000);
    expect(t.utcOffset).toEqual(3600);
    expect(t.isUtc()).toEqual(false);
  });

  it("create local offset negative", () => {
    const t = Timestamp.create(2018, 1, 10, 12, 0, 0, 0, -3600);
    expect(t.value).toEqual(1515589200);
    expect(t.utcOffset).toEqual(-3600);
    expect(t.isUtc()).toEqual(false);
  });

  it("create local offset zero sub second", () => {
    const t = Timestamp.create(2018, 1, 10, 12, 0, 0, 0);
    expect(t.value).toEqual(1515585600);
    expect(t.subSecond).toEqual(0);
  });

  it("create local offset non zero sub second", () => {
    const t = Timestamp.create(2018, 1, 10, 12, 0, 0, R(1, 10));
    expect(t.value).toEqual(1515585600);
    expect(t.subSecond).toEqual(R(1, 10));
  });

  it("create valid", () => {
    expect(Timestamp.create(-450, 7, 21, 17, 53, 47).value).toEqual(-76350405973);
    expect(Timestamp.create(-1, 1, 1, 0, 0, 0).value).toEqual(-62198755200);
    expect(Timestamp.create(0, 3, 1, 0, 0, 0).value).toEqual(-62162035200);
    expect(Timestamp.create(1969, 12, 31, 23, 59, 59).value).toEqual(-1);
    expect(Timestamp.create(1970, 1, 1, 0, 0, 0).value).toEqual(0);
    expect(Timestamp.create(1970, 1, 1, 0, 0, 1).value).toEqual(1);
    expect(Timestamp.create(1970, 1, 1, 13, 17, 23).value).toEqual(47843);
    expect(Timestamp.create(2000, 2, 29, 0, 0, 0).value).toEqual(951782400);
    expect(Timestamp.create(2000, 3, 1, 0, 0, 0).value).toEqual(951868800);
    expect(Timestamp.create(2000, 4, 1, 0, 0, 0).value).toEqual(954547200);
    expect(Timestamp.create(2000, 5, 1, 0, 0, 0).value).toEqual(957139200);
    expect(Timestamp.create(2000, 6, 1, 0, 0, 0).value).toEqual(959817600);
    expect(Timestamp.create(2000, 7, 1, 0, 0, 0).value).toEqual(962409600);
    expect(Timestamp.create(2000, 8, 1, 0, 0, 0).value).toEqual(965088000);
    expect(Timestamp.create(2000, 9, 1, 0, 0, 0).value).toEqual(967766400);
    expect(Timestamp.create(2000, 10, 1, 0, 0, 0).value).toEqual(970358400);
    expect(Timestamp.create(2000, 11, 1, 0, 0, 0).value).toEqual(973036800);
    expect(Timestamp.create(2000, 12, 1, 0, 0, 0).value).toEqual(975628800);
    expect(Timestamp.create(2001, 1, 1, 0, 0, 0).value).toEqual(978307200);
    expect(Timestamp.create(2001, 2, 1, 0, 0, 0).value).toEqual(980985600);
    expect(Timestamp.create(2001, 3, 1, 0, 0, 0).value).toEqual(983404800);
    expect(Timestamp.create(2100, 2, 28, 0, 0, 0).value).toEqual(4107456000);
    expect(Timestamp.create(2100, 3, 1, 0, 0, 0).value).toEqual(4107542400);
  });

  it("create invalid days for specific month", () => {
    expect(Timestamp.create(2018, 2, 29).value).toEqual(1519862400);
    expect(Timestamp.create(2018, 4, 31).value).toEqual(1525132800);
  });

  it("create month out of range", () => {
    for (const month of [0, 13]) {
      const error = assertRaises(RangeError, () => Timestamp.create(2018, month));
      expect(error.message).toEqual("month must be between 1 and 12");
    }
  });

  it("create day out of range", () => {
    for (const day of [0, 32]) {
      const error = assertRaises(RangeError, () => Timestamp.create(2018, 1, day));
      expect(error.message).toEqual("day must be between 1 and 31");
    }
  });

  it("create hour out of range", () => {
    for (const hour of [-1, 24]) {
      const error = assertRaises(RangeError, () => Timestamp.create(2018, 1, 1, hour));
      expect(error.message).toEqual("hour must be between 0 and 23");
    }
  });

  it("create minute out of range", () => {
    for (const minute of [-1, 60]) {
      const error = assertRaises(RangeError, () => Timestamp.create(2018, 1, 1, 0, minute));
      expect(error.message).toEqual("minute must be between 0 and 59");
    }
  });

  it("create second out of range", () => {
    for (const second of [-1, 60]) {
      const error = assertRaises(RangeError, () => Timestamp.create(2018, 1, 1, 0, 0, second));
      expect(error.message).toEqual("second must be between 0 and 59");
    }
  });

  it("create year not integer", () => {
    const error = assertRaises(ArgumentError, () => Timestamp.create(rbDbl2num(2018)));
    expect(error.message).toEqual("year must be an Integer");
  });

  it("create month not integer", () => {
    const error = assertRaises(ArgumentError, () => Timestamp.create(2018, rbDbl2num(1)));
    expect(error.message).toEqual("month must be an Integer");
  });

  it("create day not integer", () => {
    const error = assertRaises(ArgumentError, () => Timestamp.create(2018, 1, rbDbl2num(1)));
    expect(error.message).toEqual("day must be an Integer");
  });

  it("create hour not integer", () => {
    const error = assertRaises(ArgumentError, () => Timestamp.create(2018, 1, 1, rbDbl2num(0)));
    expect(error.message).toEqual("hour must be an Integer");
  });

  it("create minute not integer", () => {
    const error = assertRaises(ArgumentError, () => Timestamp.create(2018, 1, 1, 0, rbDbl2num(0)));
    expect(error.message).toEqual("minute must be an Integer");
  });

  it("create second not integer", () => {
    const error = assertRaises(ArgumentError, () =>
      Timestamp.create(2018, 1, 1, 0, 0, rbDbl2num(0)),
    );
    expect(error.message).toEqual("second must be an Integer");
  });

  it("create sub second not zero integer or rational", () => {
    for (const subSecond of [null, 0.1, 1] as never[]) {
      const error = assertRaises(ArgumentError, () =>
        Timestamp.create(2018, 1, 1, 0, 0, 0, subSecond),
      );
      expect(error.message).toEqual("sub_second must be a Rational or the Integer 0");
    }
  });

  it("create sub second out of range", () => {
    for (const subSecond of [R(-1, 10), R(1, 1)]) {
      const error = assertRaises(RangeError, () =>
        Timestamp.create(2018, 1, 1, 0, 0, 0, subSecond),
      );
      expect(error.message).toEqual("sub_second must be >= 0 and < 1");
    }
  });

  it("create utc offset not integer or utc", () => {
    for (const utcOffset of [rbDbl2num(1), "zero"] as never[]) {
      const error = assertRaises(ArgumentError, () =>
        Timestamp.create(2018, 1, 1, 0, 0, 0, 0, utcOffset),
      );
      expect(error.message).toEqual("utc_offset must be an Integer, :utc or nil");
    }
  });

  it("for timestamp ignore offset utc", () => {
    forTest([new Timestamp(1476316800, 0, "utc"), "ignore"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.subSecond).toEqual(0);
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for timestamp ignore offset with zero offset", () => {
    forTest([new Timestamp(1476316800, 0, 0), "ignore"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.subSecond).toEqual(0);
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for timestamp ignore offset with offset", () => {
    forTest([new Timestamp(1476316800, 0, 3600), "ignore"], (t) => {
      expect(t.value).toEqual(1476320400);
      expect(t.subSecond).toEqual(0);
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for timestamp ignore offset sub second", () => {
    forTest([new Timestamp(1476316800, R(1, 10), 3600), "ignore"], (t) => {
      expect(t.value).toEqual(1476320400);
      expect(t.subSecond).toEqual(R(1, 10));
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for timestamp ignore offset no offset", () => {
    const orig = new Timestamp(1476316800);
    forTest([orig, "ignore"], (t) => expect(t).toBe(orig));
  });

  it("for timestamp ignore offset subclass no offset", () => {
    forTest([new TestTimestampSubclass(1476316800, R(1, 10)), "ignore"], (t) => {
      expect(t.constructor).toEqual(Timestamp);
      expect(t.value).toEqual(1476316800);
      expect(t.subSecond).toEqual(R(1, 10));
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for timestamp treat offset as utc utc", () => {
    const orig = new Timestamp(1476316800, 0, "utc");
    forTest([orig, "treatAsUtc"], (t) => expect(t).toBe(orig));
  });

  it("for timestamp treat offset as utc with zero offset", () => {
    forTest([new Timestamp(1476316800, 0, 0), "treatAsUtc"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.subSecond).toEqual(0);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for timestamp treat offset as utc with offset", () => {
    forTest([new Timestamp(1476316800, 0, 3600), "treatAsUtc"], (t) => {
      expect(t.value).toEqual(1476320400);
      expect(t.subSecond).toEqual(0);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for timestamp treat offset as utc sub second", () => {
    forTest([new Timestamp(1476316800, R(1, 10), 3600), "treatAsUtc"], (t) => {
      expect(t.value).toEqual(1476320400);
      expect(t.subSecond).toEqual(R(1, 10));
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for timestamp treat offset as utc no offset", () => {
    forTest([new Timestamp(1476316800), "treatAsUtc"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.subSecond).toEqual(0);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for timestamp treat offset as utc subclass utc", () => {
    forTest([new TestTimestampSubclass(1476316800, R(1, 10), "utc"), "treatAsUtc"], (t) => {
      expect(t.constructor).toEqual(Timestamp);
      expect(t.value).toEqual(1476316800);
      expect(t.subSecond).toEqual(R(1, 10));
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for timestamp preserve offset utc", () => {
    const orig = new Timestamp(1476316800, 0, "utc");
    forTest([orig, "preserve"], (t) => expect(t).toBe(orig));
  });

  it("for timestamp preserve offset with zero offset", () => {
    const orig = new Timestamp(1476316800, 0, 0);
    forTest([orig, "preserve"], (t) => expect(t).toBe(orig));
  });

  it("for timestamp preserve offset with offset", () => {
    const orig = new Timestamp(1476316800, 0, 3600);
    forTest([orig, "preserve"], (t) => expect(t).toBe(orig));
  });

  it("for timestamp preserve offset by default with offset", () => {
    const orig = new Timestamp(1476316800, 0, 3600);
    forTest([orig], (t) => expect(t).toBe(orig));
  });

  it("for timestamp preserve offset no offset", () => {
    const orig = new Timestamp(1476316800);
    forTest([orig, "preserve"], (t) => expect(t).toBe(orig));
  });

  it("for timestamp preserve offset sub second", () => {
    const orig = new Timestamp(1476316800, R(1, 10), 0);
    forTest([orig, "preserve"], (t) => expect(t).toBe(orig));
  });

  it("for timestamp preserve offset subclass utc", () => {
    forTest([new TestTimestampSubclass(1476316800, R(1, 10), "utc")], (t) => {
      expect(t.constructor).toEqual(Timestamp);
      expect(t.value).toEqual(1476316800);
      expect(t.subSecond).toEqual(R(1, 10));
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for timestamp preserve offset subclass with zero offset", () => {
    forTest([new TestTimestampSubclass(1476316800, R(1, 10), 0)], (t) => {
      expect(t.constructor).toEqual(Timestamp);
      expect(t.value).toEqual(1476316800);
      expect(t.subSecond).toEqual(R(1, 10));
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(false);
    });
  });

  it("for timestamp preserve offset subclass with offset", () => {
    forTest([new TestTimestampSubclass(1476316800, R(1, 10), 3600)], (t) => {
      expect(t.constructor).toEqual(Timestamp);
      expect(t.value).toEqual(1476316800);
      expect(t.subSecond).toEqual(R(1, 10));
      expect(t.utcOffset).toEqual(3600);
      expect(t.isUtc()).toEqual(false);
    });
  });

  it("for timestamp preserve offset subclass no offset", () => {
    forTest([new TestTimestampSubclass(1476316800, R(1, 10))], (t) => {
      expect(t.constructor).toEqual(Timestamp);
      expect(t.value).toEqual(1476316800);
      expect(t.subSecond).toEqual(R(1, 10));
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for time ignore offset utc", () => {
    forTest([Time.utc(2016, 10, 13, 0, 0, 0), "ignore"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for time ignore offset with zero offset", () => {
    forTest([Time.new(2016, 10, 13, 0, 0, 0, 0), "ignore"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for time ignore offset with offset", () => {
    forTest([Time.new(2016, 10, 13, 0, 0, 0, 3600), "ignore"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for time treat offset as utc utc", () => {
    forTest([Time.utc(2016, 10, 13, 0, 0, 0), "treatAsUtc"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for time treat offset as utc with zero offset", () => {
    forTest([Time.new(2016, 10, 13, 0, 0, 0, 0), "treatAsUtc"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for time treat offset as utc with offset", () => {
    forTest([Time.new(2016, 10, 13, 0, 0, 0, 3600), "treatAsUtc"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for time preserve offset utc", () => {
    forTest([Time.utc(2016, 10, 13, 0, 0, 0), "preserve"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for time preserve offset zero offset", () => {
    forTest([Time.new(2016, 10, 13, 0, 0, 0, 0), "preserve"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(!TIME_SUPPORTS_DISTINCT_UTC);
    });
  });

  it("for time preserve offset with offset", () => {
    forTest([Time.new(2016, 10, 13, 1, 0, 0, 3600), "preserve"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(3600);
      expect(t.isUtc()).toEqual(false);
    });
  });

  it("for time preserve offset by default with offset", () => {
    forTest([Time.new(2016, 10, 13, 1, 0, 0, 3600)], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(3600);
      expect(t.isUtc()).toEqual(false);
    });
  });

  it("for time zero sub second", () => {
    forTest([Time.utc(2016, 10, 13, 0, 0, 1)], (t) => {
      expect(t.value).toEqual(1476316801);
      expect(t.subSecond).toEqual(0);
    });
  });

  it("for time sub second", () => {
    forTest([Time.utc(2016, 10, 13, 0, 0, 1, R(100000, 1) as never)], (t) => {
      expect(t.value).toEqual(1476316801);
      expect(t.subSecond).toEqual(R(1, 10));
    });
  });

  it("for datetime ignore offset utc", () => {
    forTest([new DateTime(2016, 10, 13, 0, 0, 0), "ignore"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for datetime ignore offset with offset", () => {
    forTest([new DateTime(2016, 10, 13, 0, 0, 0, R(1, 24)), "ignore"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for datetime treat offset as utc utc", () => {
    forTest([new DateTime(2016, 10, 13, 0, 0, 0), "treatAsUtc"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for datetime treat offset as utc with offset", () => {
    forTest([new DateTime(2016, 10, 13, 0, 0, 0, R(1, 24)), "treatAsUtc"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for datetime preserve offset with zero offset", () => {
    forTest([new DateTime(2016, 10, 13, 0, 0, 0), "preserve"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(false);
    });
  });

  it("for datetime preserve offset with offset", () => {
    forTest([new DateTime(2016, 10, 13, 1, 0, 0, R(1, 24)), "preserve"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(3600);
      expect(t.isUtc()).toEqual(false);
    });
  });

  it("for datetime preserve offset by default with offset", () => {
    forTest([new DateTime(2016, 10, 13, 1, 0, 0, R(1, 24))], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(3600);
      expect(t.isUtc()).toEqual(false);
    });
  });

  it("for datetime zero sub second", () => {
    forTest([new DateTime(2016, 10, 13, 0, 0, 1)], (t) => {
      expect(t.value).toEqual(1476316801);
      expect(t.subSecond).toEqual(0);
    });
  });

  it("for datetime sub second", () => {
    forTest([new DateTime(2016, 10, 13, 0, 0, R(11, 10))], (t) => {
      expect(t.value).toEqual(1476316801);
      expect(t.subSecond).toEqual(R(1, 10));
    });
  });

  it("for datetime julian", () => {
    forTest([new DateTime(1582, 10, 4, 0, 0, 0, 0, Date.ITALY)], (t) => {
      expect(t.value).toEqual(-12219379200);
    });
  });

  it("for datetime gregorian", () => {
    forTest([new DateTime(1582, 10, 14, 0, 0, 0, 0, Date.GREGORIAN)], (t) => {
      expect(t.value).toEqual(-12219379200);
    });
  });

  it("for time like ignore offset", () => {
    forTest([new TimeLike(1476316800, 0), "ignore"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for time like treat offset as utc", () => {
    forTest([new TimeLike(1476316800, 0), "treatAsUtc"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for time like preserve offset", () => {
    forTest([new TimeLike(1476316800, 0), "preserve"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(false);
    });
  });

  it("for time like preserve offset by default", () => {
    forTest([new TimeLike(1476316800, 0)], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(false);
    });
  });

  it("for time like zero sub second", () => {
    forTest([new TimeLike(1476316801, 0)], (t) => {
      expect(t.value).toEqual(1476316801);
      expect(t.subSecond).toEqual(0);
    });
  });

  it("for time like rational sub second", () => {
    forTest([new TimeLike(1476316801, R(1, 10))], (t) => {
      expect(t.value).toEqual(1476316801);
      expect(t.subSecond).toEqual(R(1, 10));
    });
  });

  it("for time like float sub second", () => {
    forTest([new TimeLike(1476316801, 0.1)], (t) => {
      expect(t.value).toEqual(1476316801);
      expect(t.subSecond).toBeInstanceOf(Rational);
      expect(t.subSecond).toEqual(new Rational(0.1, 1));
    });
  });

  it("for time like nil sub second", () => {
    forTest([new TimeLike(1476316801, null)], (t) => {
      expect(t.value).toEqual(1476316801);
      expect(t.subSecond).toEqual(0);
    });
  });

  it("for time like with offset ignore offset with zero offset", () => {
    forTest([new TimeLikeWithOffset(1476316800, 0, 0), "ignore"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for time like with offset ignore offset with offset", () => {
    forTest([new TimeLikeWithOffset(1476316800, 0, 3600), "ignore"], (t) => {
      expect(t.value).toEqual(1476320400);
      expect(t.utcOffset).toBeNull();
      expect(t.isUtc()).toBeNull();
    });
  });

  it("for time like with offset treat offset as utc with zero offset", () => {
    forTest([new TimeLikeWithOffset(1476316800, 0, 0), "treatAsUtc"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for time like with offset treat offset as utc with offset", () => {
    forTest([new TimeLikeWithOffset(1476316800, 0, 3600), "treatAsUtc"], (t) => {
      expect(t.value).toEqual(1476320400);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(true);
    });
  });

  it("for time like with offset preserve offset zero offset", () => {
    forTest([new TimeLikeWithOffset(1476316800, 0, 0), "preserve"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
      expect(t.isUtc()).toEqual(false);
    });
  });

  it("for time like with offset preserve offset with offset", () => {
    forTest([new TimeLikeWithOffset(1476316800, 0, 3600), "preserve"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(3600);
      expect(t.isUtc()).toEqual(false);
    });
  });

  it("for time like with offset preserve offset by default with offset", () => {
    forTest([new TimeLikeWithOffset(1476316800, 0, 3600)], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(3600);
      expect(t.isUtc()).toEqual(false);
    });
  });

  it("for time like with offset preserve float offset", () => {
    forTest([new TimeLikeWithOffset(1476316800, 0, 3600.1), "preserve"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toBeInstanceOf(rbCInteger);
      expect(t.utcOffset).toEqual(3600);
    });
  });

  it("for time like with offset preserve nil offset", () => {
    forTest([new TimeLikeWithOffset(1476316800, 0, null), "preserve"], (t) => {
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toBeInstanceOf(rbCInteger);
      expect(t.utcOffset).toEqual(0);
    });
  });

  it("for time like with offset treat float offset as utc", () => {
    forTest([new TimeLikeWithOffset(1476316800, 0, 3600.1), "treatAsUtc"], (t) => {
      expect(t.value).toBeInstanceOf(rbCInteger);
      expect(t.value).toEqual(1476320400);
      expect(t.utcOffset).toEqual(0);
    });
  });

  it("for time like with offset treat nil offset as utc", () => {
    forTest([new TimeLikeWithOffset(1476316800, 0, null), "treatAsUtc"], (t) => {
      expect(t.value).toBeInstanceOf(rbCInteger);
      expect(t.value).toEqual(1476316800);
      expect(t.utcOffset).toEqual(0);
    });
  });

  it("for nil value", () => {
    forRaisesTest(ArgumentError, "value must be specified", null);
  });

  it("for invalid value", () => {
    forRaisesTest(ArgumentError, "Object values are not supported", new (class Object {})());
    forRaisesTest(
      ArgumentError,
      `${rbObjClassname(Time.utc(2016, 10, 13, 0, 0, 0).toI())} values are not supported`,
      Time.utc(2016, 10, 13, 0, 0, 0).toI(),
    );
  });

  it("for invalid offset", () => {
    forRaisesTest(
      ArgumentError,
      "offset must be :preserve, :ignore or :treat_as_utc",
      Time.utc(2016, 10, 13, 0, 0, 0),
      "invalid",
    );
  });

  it("for time like to i returns nil", () => {
    forRaisesTest(ArgumentError, "value must be an Integer", new TimeLike(null, 0));
  });

  it("for time like to i returns non integer", () => {
    forRaisesTest(ArgumentError, "value must be an Integer", new TimeLike(1476316800.1, 0));
  });

  it("for time like subsec out of range", () => {
    for (const subsec of [R(-1, 10), 1]) {
      forRaisesTest(
        RangeError,
        "sub_second must be >= 0 and < 1",
        new TimeLike(1476316800, subsec),
      );
    }
  });

  it("for block result timestamp", () => {
    const blockResult = new Timestamp(1476316801);
    expect(Timestamp.for(new Timestamp(1476316800), () => blockResult)).toBe(blockResult);
  });

  it("for block result to time for time", () => {
    const input = Time.utc(2016, 10, 13, 0, 0, 0);
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1),
      Timestamp.for(input, () => new Timestamp(1476316801)) as Time,
    );
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1, R(100000, 1) as never),
      Timestamp.for(input, () => new Timestamp(1476316801, R(1, 10))) as Time,
    );
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1),
      Timestamp.for(input, () => new Timestamp(1476316801, 0, "utc")) as Time,
    );
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1, R(100000, 1) as never),
      Timestamp.for(input, () => new Timestamp(1476316801, R(1, 10), "utc")) as Time,
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 0, 0, 1, 0),
      Timestamp.for(input, () => new Timestamp(1476316801, 0, 0)) as Time,
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 0, 0, R(11, 10) as never, 0),
      Timestamp.for(input, () => new Timestamp(1476316801, R(1, 10), 0)) as Time,
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 1, 0, 1, 3600),
      Timestamp.for(input, () => new Timestamp(1476316801, 0, 3600)) as Time,
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 1, 0, R(11, 10) as never, 3600),
      Timestamp.for(input, () => new Timestamp(1476316801, R(1, 10), 3600)) as Time,
    );
  });

  it("for block result to time for time like", () => {
    const input = new TimeLike(1476316800, 0);
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1),
      Timestamp.for(input, () => new Timestamp(1476316801)) as Time,
    );
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1, R(100000, 1) as never),
      Timestamp.for(input, () => new Timestamp(1476316801, R(1, 10))) as Time,
    );
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1),
      Timestamp.for(input, () => new Timestamp(1476316801, 0, "utc")) as Time,
    );
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1, R(100000, 1) as never),
      Timestamp.for(input, () => new Timestamp(1476316801, R(1, 10), "utc")) as Time,
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 0, 0, 1, 0),
      Timestamp.for(input, () => new Timestamp(1476316801, 0, 0)) as Time,
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 0, 0, R(11, 10) as never, 0),
      Timestamp.for(input, () => new Timestamp(1476316801, R(1, 10), 0)) as Time,
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 1, 0, 1, 3600),
      Timestamp.for(input, () => new Timestamp(1476316801, 0, 3600)) as Time,
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 1, 0, R(11, 10) as never, 3600),
      Timestamp.for(input, () => new Timestamp(1476316801, R(1, 10), 3600)) as Time,
    );
  });

  it("for block result to time for time like with offset", () => {
    const input = new TimeLikeWithOffset(1476316800, 0, 3600);
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1),
      Timestamp.for(input, () => new Timestamp(1476316801)) as Time,
    );
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1, R(100000, 1) as never),
      Timestamp.for(input, () => new Timestamp(1476316801, R(1, 10))) as Time,
    );
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1),
      Timestamp.for(input, () => new Timestamp(1476316801, 0, "utc")) as Time,
    );
    assertEqualWithOffset(
      Time.utc(2016, 10, 13, 0, 0, 1, R(100000, 1) as never),
      Timestamp.for(input, () => new Timestamp(1476316801, R(1, 10), "utc")) as Time,
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 0, 0, 1, 0),
      Timestamp.for(input, () => new Timestamp(1476316801, 0, 0)) as Time,
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 0, 0, R(11, 10) as never, 0),
      Timestamp.for(input, () => new Timestamp(1476316801, R(1, 10), 0)) as Time,
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 1, 0, 1, 3600),
      Timestamp.for(input, () => new Timestamp(1476316801, 0, 3600)) as Time,
    );
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 1, 0, R(11, 10) as never, 3600),
      Timestamp.for(input, () => new Timestamp(1476316801, R(1, 10), 3600)) as Time,
    );
  });

  it("for block result to datetime", () => {
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 0, 0, 1),
      Timestamp.for(
        new DateTime(2016, 10, 13, 0, 0, 0),
        () => new Timestamp(1476316801),
      ) as DateTime,
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 0, 0, R(11, 10)),
      Timestamp.for(
        new DateTime(2016, 10, 13, 0, 0, 0),
        () => new Timestamp(1476316801, R(1, 10)),
      ) as DateTime,
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 0, 0, 1),
      Timestamp.for(
        new DateTime(2016, 10, 13, 0, 0, 0),
        () => new Timestamp(1476316801, 0, "utc"),
      ) as DateTime,
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 0, 0, R(11, 10)),
      Timestamp.for(
        new DateTime(2016, 10, 13, 0, 0, 0),
        () => new Timestamp(1476316801, R(1, 10), "utc"),
      ) as DateTime,
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 0, 0, 1),
      Timestamp.for(
        new DateTime(2016, 10, 13, 0, 0, 0),
        () => new Timestamp(1476316801, 0, 0),
      ) as DateTime,
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 0, 0, R(11, 10)),
      Timestamp.for(
        new DateTime(2016, 10, 13, 0, 0, 0),
        () => new Timestamp(1476316801, R(1, 10), 0),
      ) as DateTime,
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 1, 0, 1, R(1, 24)),
      Timestamp.for(
        new DateTime(2016, 10, 13, 0, 0, 0),
        () => new Timestamp(1476316801, 0, 3600),
      ) as DateTime,
    );
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 1, 0, R(11, 10), R(1, 24)),
      Timestamp.for(
        new DateTime(2016, 10, 13, 0, 0, 0),
        () => new Timestamp(1476316801, R(1, 10), 3600),
      ) as DateTime,
    );
  });

  it("for block result to datetime is gregorian", () => {
    const dt = Timestamp.for(
      new DateTime(2016, 10, 13, 0, 0, 0),
      () => new Timestamp(-12219379200),
    ) as DateTime;

    assertEqualWithOffset(new DateTime(1582, 10, 14, 0, 0, 0, 0, Date.GREGORIAN), dt);
    expect(dt.year).toEqual(1582);
    expect(dt.month).toEqual(10);
    expect(dt.day).toEqual(14);
    expect(dt.isGregorian).toBeTruthy();
  });

  it("for block result timestamp subclass", () => {
    const blockResult = new TestTimestampSubclass(1476316801);
    expect(Timestamp.for(new Timestamp(1476316800), () => blockResult)).toBe(blockResult);
  });

  it("for block result to time subclass", () => {
    assertEqualWithOffset(
      Time.new(2016, 10, 13, 1, 0, R(11, 10) as never, 3600),
      Timestamp.for(
        Time.utc(2016, 10, 13, 0, 0, 0),
        () => new TestTimestampSubclass(1476316801, R(1, 10), 3600),
      ) as Time,
    );
  });

  it("for block result to datetime subclass", () => {
    assertEqualWithOffset(
      new DateTime(2016, 10, 13, 1, 0, R(11, 10), R(1, 24)),
      Timestamp.for(
        new DateTime(2016, 10, 13, 0, 0, 0),
        () => new TestTimestampSubclass(1476316801, R(1, 10), 3600),
      ) as DateTime,
    );
  });

  it("for block result nil", () => {
    forBlockInvalidResultTest(null);
  });

  it("for block result non timestamp", () => {
    forBlockInvalidResultTest(Time.utc(2016, 10, 13, 0, 0, 0));
  });

  it("class utc", () => {
    const t = Timestamp.utc(1476316800);
    expect(t).toBeInstanceOf(Timestamp);
    expect(t.value).toEqual(1476316800);
    expect(t.subSecond).toEqual(0);
    expect(t.utcOffset).toEqual(0);
    expect(t.isUtc()).toEqual(true);
  });

  it("class utc sub second", () => {
    const t = Timestamp.utc(1476316800, R(1, 10));
    expect(t).toBeInstanceOf(Timestamp);
    expect(t.value).toEqual(1476316800);
    expect(t.subSecond).toEqual(R(1, 10));
    expect(t.utcOffset).toEqual(0);
    expect(t.isUtc()).toEqual(true);
  });

  it("class utc value nil", () => {
    const error = assertRaises(ArgumentError, () => Timestamp.utc(null as never));
    expect(error.message).toEqual("value must be an Integer");
  });

  it("class utc value not integer", () => {
    const error = assertRaises(ArgumentError, () => Timestamp.utc(1476316800.1));
    expect(error.message).toEqual("value must be an Integer");
  });

  it("class utc sub second nil", () => {
    const error = assertRaises(ArgumentError, () => Timestamp.utc(1476316800, null as never));
    expect(error.message).toEqual("sub_second must be a Rational or the Integer 0");
  });

  it("class utc sub second not integer or rational", () => {
    const error = assertRaises(ArgumentError, () => Timestamp.utc(1476316800, 0.1));
    expect(error.message).toEqual("sub_second must be a Rational or the Integer 0");
  });

  it("class utc sub second integer not zero", () => {
    const error = assertRaises(ArgumentError, () => Timestamp.utc(1476316800, 1));
    expect(error.message).toEqual("sub_second must be a Rational or the Integer 0");
  });

  it("class utc sub second less than zero", () => {
    const error = assertRaises(RangeError, () => Timestamp.utc(1476316800, R(-1, 10)));
    expect(error.message).toEqual("sub_second must be >= 0 and < 1");
  });

  it("class utc sub second greater than or equal to one", () => {
    const error = assertRaises(RangeError, () => Timestamp.utc(1476316800, R(1, 1)));
    expect(error.message).toEqual("sub_second must be >= 0 and < 1");
  });
});
