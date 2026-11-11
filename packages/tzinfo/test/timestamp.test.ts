import { describe, expect, it } from "vitest";
import { DateTime, Time } from "@blazetrails/date";
import { ArgumentError, RangeError, Rational, rbCInteger, rbHash } from "@blazetrails/ruby-compat";
import { Timestamp } from "../lib/index.js";
import { assertEqualWithOffset, assertRaises } from "./test-utils.js";

const R = (n: number, d: number) => new Rational(n, d);

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
