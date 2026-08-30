/**
 * Port of ruby/date's `test/date/test_date.rb`.
 */

import { describe, it, expect } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { Date as RubyDate, DateTime as RubyDateTime, dNewByFrags, dtNewByFrags } from "./date.js";
import { Rational } from "@blazetrails/ruby-compat";

/**
 * Ruby's `Float#<=>` (`ruby/numeric.c` `flo_cmp`, not vendored), which is the
 * receiver of half of `test_infinity_comparison`'s assertions and of the
 * `-Float::INFINITY` end of `test_range_infinite_float`'s second Range. JS has
 * no `<=>` on a `number`, so the C's dispatch is spelled here: an infinite
 * receiver asks the operand for `infinite?` and answers from the two signs,
 * which is the protocol `Date::Infinity#infinite?` and `Date#infinite?` exist
 * to serve. Anything else is a plain double comparison.
 */
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

/** Ruby's `<=>` over the operands these tests put on either side of one. */
function spaceship(a: unknown, b: unknown): number | null {
  if (typeof a === "number") return floCmp(a, b);
  return (a as RubyDate).cmp(b);
}

/**
 * Ruby's `Range#cover?` (`ruby/range.c` `r_cover_p` over `r_less`) for the
 * `begin...end` Ranges `test_range_infinite_float` builds, one endpoint of
 * which is a `Float` rather than a `Date`. JS has no Range literal, so the
 * exclusive-end Range and the one method the test calls on it are spelled out.
 */
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

/**
 * Ruby's `Hash` for the `Date` keys `test_hash` puts in one: a Hash buckets by
 * `#hash` and settles a collision with `#eql?`, which is the pair the test is
 * about, and a JS `Map` is identity-keyed instead. Only the three operations
 * the test performs are here.
 */
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

/**
 * Ruby's `Marshal.dump` / `Marshal.load` over the two `Date#marshal_dump` /
 * `Date#marshal_load` (`date_core.c:7529-7625`) hooks `test_sub` round-trips a
 * date through. JS has no `Marshal`, so the two calls the test makes are
 * spelled here: `dump` is the hook's Array under the receiver's class, and
 * `load` is what `Marshal` does with it — allocate an instance of that class
 * and send it `marshal_load`. Ruby's allocator does not run `initialize`;
 * TS cannot allocate without a constructor, so the no-argument one runs and
 * `marshalLoad` overwrites every field it set.
 */
const Marshal = {
  dump(d: RubyDate): { klass: new () => RubyDate; a: unknown[] } {
    return { klass: d.constructor as new () => RubyDate, a: d.marshalDump() };
  },
  load(s: { klass: new () => RubyDate; a: unknown[] }): RubyDate {
    return new s.klass().marshalLoad(s.a);
  },
};

/** ruby/date `test/date/test_date.rb:8`. */
class DateSub extends RubyDate {}

/** ruby/date `test/date/test_date.rb:11`. */
class DateTimeSub extends RubyDateTime {}

describe("TestDate", () => {
  /**
   * ruby/date `test/date/test_date.rb:46-107`.
   *
   * `assert_instance_of(DateSub, DateSub.today)` and its `DateTimeSub.now`
   * sibling (`:53-54`) assert the class the port cannot answer there: the
   * mapping table RFC 0088 commits to (`README.md:110-122`, "Temporal is the
   * default return type") has the two statics answer a `Temporal.PlainDate` /
   * `Temporal.ZonedDateTime` rather than a gem-shaped instance, so there is no
   * receiver class for them to carry and the two lines assert what the port
   * does answer instead. Every other assertion is here verbatim.
   */
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

  it("const", () => {
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

    // A JS string primitive is not `instanceof String`; `Object()` boxes it to
    // the one the Ruby `assert_instance_of(String, ...)` names.
    expect(Object(String(new RubyDate(1999, 5, 25).hash()))).toBeInstanceOf(String);
  });

  it("freeze", () => {
    const d = new RubyDate();
    Object.freeze(d);
    expect(Object.isFrozen(d)).toEqual(true);
    // See `hash` above: a JS number/string primitive is boxed to the class the
    // Ruby `assert_instance_of` names.
    expect(Object(d.yday)).toBeInstanceOf(Number);
    expect(Object(d.toS())).toBeInstanceOf(String);
  });

  it("submillisecond comparison", () => {
    const d1 = new RubyDateTime(2013, 12, 6, 0, 0, new Rational(1, 10000));
    const d2 = new RubyDateTime(2013, 12, 6, 0, 0, new Rational(2, 10000));
    // d1 is 0.0001s earlier than d2
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
