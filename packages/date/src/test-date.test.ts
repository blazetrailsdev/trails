import { describe, it, expect } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { Date as RubyDate, DateTime as RubyDateTime, dNewByFrags, dtNewByFrags } from "./date.js";
import { Rational } from "@blazetrails/ruby-compat";

function floCmp(a: number, b: unknown): number | null {
  if (Number.isNaN(a)) return null;
  if (typeof b === "number") return a === b ? 0 : a < b ? -1 : 1;
  if (!Number.isFinite(a) && typeof (b as { isInfinite?: unknown }).isInfinite === "function") {
    const i = (b as { isInfinite(): number | null | false }).isInfinite();
    if (i === null || i === false) return a > 0 ? 1 : -1;
    const j = i > 0 ? 1 : i < 0 ? -1 : 0;
    return a > 0 ? (j > 0 ? 0 : 1) : j < 0 ? 0 : -1;
  }
  return null;
}

function spaceship(a: unknown, b: unknown): number | null {
  if (typeof a === "number") return floCmp(a, b);
  return (a as RubyDate).cmp(b);
}

class RubyRange {
  constructor(
    readonly begin: unknown,
    readonly end: unknown,
    readonly exclEnd: boolean,
  ) {}

  cover(val: unknown): boolean {
    const beg = spaceship(this.begin, val);
    if (beg === null || beg > 0) return false;
    const end = spaceship(val, this.end);
    return end !== null && end <= (this.exclEnd ? -1 : 0);
  }
}

class RubyHash {
  readonly #buckets = new Map<number, [RubyDate, number][]>();

  set(key: RubyDate, value: number): void {
    const bucket = this.#buckets.get(key.hash()) ?? [];
    this.#buckets.set(key.hash(), bucket);
    const found = bucket.find(([k]) => k.isEql(key));
    if (found) found[1] = value;
    else bucket.push([key, value]);
  }

  get(key: RubyDate): number | undefined {
    return this.#buckets.get(key.hash())?.find(([k]) => k.isEql(key))?.[1];
  }

  get size(): number {
    let n = 0;
    for (const bucket of this.#buckets.values()) n += bucket.length;
    return n;
  }
}

const Marshal = {
  dump(d: RubyDate): { klass: new () => RubyDate; a: unknown[] } {
    return { klass: d.constructor as new () => RubyDate, a: d.marshalDump() };
  },
  load(s: { klass: new () => RubyDate; a: unknown[] }): RubyDate {
    return new s.klass().marshalLoad(s.a);
  },
};

class DateSub extends RubyDate {}

class DateTimeSub extends RubyDateTime {}

describe("TestDate", () => {
  it("sub", () => {
    const d = new DateSub();
    const dt = new DateTimeSub();

    expect(d).toBeInstanceOf(DateSub);
    expect(dt).toBeInstanceOf(DateTimeSub);

    expect(DateSub.today()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTimeSub.now()).toBeInstanceOf(
      Temporal.Now.zonedDateTimeISO().offsetNanoseconds === 0
        ? Temporal.PlainDateTime
        : Temporal.ZonedDateTime,
    );

    expect(d.toS()).toEqual("-4712-01-01");
    expect(dt.toS()).toEqual("-4712-01-01T00:00:00+00:00");

    let d2 = d.plus(1);
    expect(d2).toBeInstanceOf(DateSub);
    d2 = d.minus(1) as DateSub;
    expect(d2).toBeInstanceOf(DateSub);
    d2 = d.rshift(1);
    expect(d2).toBeInstanceOf(DateSub);
    d2 = d.lshift(1);
    expect(d2).toBeInstanceOf(DateSub);
    d2 = d.succ();
    expect(d2).toBeInstanceOf(DateSub);
    d2 = d.next();
    expect(d2).toBeInstanceOf(DateSub);
    d2 = d.italy();
    expect(d2).toBeInstanceOf(DateSub);
    d2 = d.england();
    expect(d2).toBeInstanceOf(DateSub);
    d2 = d.julian();
    expect(d2).toBeInstanceOf(DateSub);
    d2 = d.gregorian();
    expect(d2).toBeInstanceOf(DateSub);
    let s = Marshal.dump(d);
    d2 = Marshal.load(s) as DateSub;
    expect(d2.equals(d)).toEqual(true);
    expect(d2).toBeInstanceOf(DateSub);

    let dt2 = dt.plus(1);
    expect(dt2).toBeInstanceOf(DateTimeSub);
    dt2 = dt.minus(1) as DateTimeSub;
    expect(dt2).toBeInstanceOf(DateTimeSub);
    dt2 = dt.rshift(1);
    expect(dt2).toBeInstanceOf(DateTimeSub);
    dt2 = dt.lshift(1);
    expect(dt2).toBeInstanceOf(DateTimeSub);
    dt2 = dt.succ();
    expect(dt2).toBeInstanceOf(DateTimeSub);
    dt2 = dt.next();
    expect(dt2).toBeInstanceOf(DateTimeSub);
    dt2 = dt.italy();
    expect(dt2).toBeInstanceOf(DateTimeSub);
    dt2 = dt.england();
    expect(dt2).toBeInstanceOf(DateTimeSub);
    dt2 = dt.julian();
    expect(dt2).toBeInstanceOf(DateTimeSub);
    dt2 = dt.gregorian();
    expect(dt2).toBeInstanceOf(DateTimeSub);
    s = Marshal.dump(dt);
    dt2 = Marshal.load(s) as DateTimeSub;
    expect(dt2.equals(dt)).toEqual(true);
    expect(dt2).toBeInstanceOf(DateTimeSub);
  });

  it("range infinite float", () => {
    const today = new RubyDate(RubyDate.today());
    let r = new RubyRange(today, Number.POSITIVE_INFINITY, true);
    expect(r.begin).toBe(today);
    expect(r.end).toEqual(Number.POSITIVE_INFINITY);
    expect(r.cover(today.plus(1))).toEqual(true);
    expect(r.cover(today.minus(1))).toEqual(false);
    r = new RubyRange(Number.NEGATIVE_INFINITY, today, true);
    expect(r.begin).toEqual(Number.NEGATIVE_INFINITY);
    expect(r.end).toBe(today);
    expect(r.cover(today.plus(1))).toEqual(false);
    expect(r.cover(today.minus(1))).toEqual(true);
  });

  it(" const", () => {
    expect(RubyDate.MONTHNAMES[0]).toBeNull();
    expect(RubyDate.MONTHNAMES[1]).toEqual("January");
    expect(RubyDate.MONTHNAMES.length).toEqual(13);
    expect(RubyDate.DAYNAMES[0]).toEqual("Sunday");
    expect(RubyDate.DAYNAMES.length).toEqual(7);

    expect(RubyDate.ABBR_MONTHNAMES[0]).toBeNull();
    expect(RubyDate.ABBR_MONTHNAMES[1]).toEqual("Jan");
    expect(RubyDate.ABBR_MONTHNAMES.length).toEqual(13);
    expect(RubyDate.ABBR_DAYNAMES[0]).toEqual("Sun");
    expect(RubyDate.ABBR_DAYNAMES.length).toEqual(7);

    expect(Object.isFrozen(RubyDate.MONTHNAMES)).toBeTruthy();
    expect(Object.isFrozen(RubyDate.MONTHNAMES[1])).toBeTruthy();
    expect(Object.isFrozen(RubyDate.DAYNAMES)).toBeTruthy();
    expect(Object.isFrozen(RubyDate.DAYNAMES[0])).toBeTruthy();

    expect(Object.isFrozen(RubyDate.ABBR_MONTHNAMES)).toBeTruthy();
    expect(Object.isFrozen(RubyDate.ABBR_MONTHNAMES[1])).toBeTruthy();
    expect(Object.isFrozen(RubyDate.ABBR_DAYNAMES)).toBeTruthy();
    expect(Object.isFrozen(RubyDate.ABBR_DAYNAMES[0])).toBeTruthy();
  });

  it("eql p", () => {
    const d = dNewByFrags({ jd: 0 });
    const d2 = dNewByFrags({ jd: 0 });
    const dt = dtNewByFrags({ jd: 0 });
    const dt2 = dtNewByFrags({ jd: 0 });

    expect(d.equals(d2)).toEqual(true);
    expect(d.equals(0)).not.toBe(true);

    expect(dt.equals(dt2)).toEqual(true);
    expect(dt.equals(0)).not.toBe(true);

    expect(d.equals(dt)).toEqual(true);
    expect(d2.equals(dt2)).toEqual(true);
  });

  it("hash", () => {
    let h = new RubyHash();
    h.set(new RubyDate(1999, 5, 23), 0);
    h.set(new RubyDate(1999, 5, 24), 1);
    h.set(new RubyDate(1999, 5, 25), 2);
    h.set(new RubyDate(1999, 5, 25), 9);
    expect(h.size).toEqual(3);
    expect(h.get(new RubyDate(1999, 5, 25))).toEqual(9);
    expect(h.get(new RubyDateTime(1999, 5, 25))).toEqual(9);

    h = new RubyHash();
    h.set(new RubyDateTime(1999, 5, 23), 0);
    h.set(new RubyDateTime(1999, 5, 24), 1);
    h.set(new RubyDateTime(1999, 5, 25), 2);
    h.set(new RubyDateTime(1999, 5, 25), 9);
    expect(h.size).toEqual(3);
    expect(h.get(new RubyDate(1999, 5, 25))).toEqual(9);
    expect(h.get(new RubyDateTime(1999, 5, 25))).toEqual(9);

    expect(Object(String(new RubyDate(1999, 5, 25).hash()))).toBeInstanceOf(String);
  });

  it("freeze", () => {
    const d = new RubyDate();
    Object.freeze(d);
    expect(Object.isFrozen(d)).toEqual(true);
    expect(Object(d.yday)).toBeInstanceOf(Number);
    expect(Object(d.toS())).toBeInstanceOf(String);
  });

  it("submillisecond comparison", () => {
    const d1 = new RubyDateTime(2013, 12, 6, 0, 0, new Rational(1, 10000));
    const d2 = new RubyDateTime(2013, 12, 6, 0, 0, new Rational(2, 10000));
    expect(d1.cmp(d2)).toEqual(-1);
    expect(d1.cmp(d1)).toEqual(0);
    expect(d2.cmp(d1)).toEqual(1);
  });

  it("infinity comparison", () => {
    expect(spaceship(Number.POSITIVE_INFINITY, new RubyDate.Infinity())).toEqual(0);
    expect(new RubyDate.Infinity().compareTo(Number.POSITIVE_INFINITY)).toEqual(0);
    expect(spaceship(Number.NEGATIVE_INFINITY, new RubyDate.Infinity().negate())).toEqual(0);
    expect(new RubyDate.Infinity().negate().compareTo(Number.NEGATIVE_INFINITY)).toEqual(0);

    expect(spaceship(Number.POSITIVE_INFINITY, new RubyDate.Infinity().negate())).toEqual(1);
    expect(new RubyDate.Infinity().compareTo(Number.NEGATIVE_INFINITY)).toEqual(1);

    expect(spaceship(Number.NEGATIVE_INFINITY, new RubyDate.Infinity())).toEqual(-1);
    expect(new RubyDate.Infinity().negate().compareTo(Number.POSITIVE_INFINITY)).toEqual(-1);
  });

  it("deconstruct keys", () => {
    const d = new RubyDate(1999, 5, 23);
    expect(d.deconstructKeys(null)).toEqual({ year: 1999, month: 5, day: 23, wday: 0, yday: 143 });
    expect(d.deconstructKeys(["year", "century"])).toEqual({ year: 1999 });
    expect(d.deconstructKeys(["year", "month", "day", "wday", "yday"])).toEqual({
      year: 1999,
      month: 5,
      day: 23,
      wday: 0,
      yday: 143,
    });

    const dt = new RubyDateTime(1999, 5, 23, 4, 20, new Rational(1, 10000));

    expect(dt.deconstructKeys(null)).toEqual({
      year: 1999,
      month: 5,
      day: 23,
      wday: 0,
      yday: 143,
      hour: 4,
      min: 20,
      sec: 0,
      sec_fraction: new Rational(1, 10000),
      zone: "+00:00",
    });

    expect(dt.deconstructKeys(["year", "century"])).toEqual({ year: 1999 });

    expect(
      dt.deconstructKeys([
        "year",
        "month",
        "day",
        "wday",
        "yday",
        "hour",
        "min",
        "sec",
        "sec_fraction",
        "zone",
      ]),
    ).toEqual({
      year: 1999,
      month: 5,
      day: 23,
      wday: 0,
      yday: 143,
      hour: 4,
      min: 20,
      sec: 0,
      sec_fraction: new Rational(1, 10000),
      zone: "+00:00",
    });

    const dtz = dtNewByFrags(RubyDate._parse("3rd Feb 2001 04:05:06+03:30"));
    expect(dtz.deconstructKeys(["zone"])).toEqual({ zone: "+03:30" });
  });
});
