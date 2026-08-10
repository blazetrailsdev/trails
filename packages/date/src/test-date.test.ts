/**
 * Port of ruby/date's `test/date/test_date.rb`.
 *
 * `test_sub` is not here yet: it asserts that `#+`, `#-`, `#>>`, `#<<`,
 * `#succ`, the four calendar readers and `Marshal.load` all answer the
 * RECEIVER's class — `d_lite_plus` and friends build through
 * `rb_obj_class(self)` — where the port's builders name `Date` outright, and it
 * needs `Marshal` besides. It is filed against RFC 0088.
 */

import { describe, it, expect } from "vitest";
import {
  Date as RubyDate,
  DateTime as RubyDateTime,
  Rational,
  dNewByFrags,
  dtNewByFrags,
} from "./date.js";

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

describe("TestDate", () => {
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

    expect(Object.isFrozen(RubyDate.MONTHNAMES)).toEqual(true);
    expect(Object.isFrozen(RubyDate.MONTHNAMES[1])).toEqual(true);
    expect(Object.isFrozen(RubyDate.DAYNAMES)).toEqual(true);
    expect(Object.isFrozen(RubyDate.DAYNAMES[0])).toEqual(true);

    expect(Object.isFrozen(RubyDate.ABBR_MONTHNAMES)).toEqual(true);
    expect(Object.isFrozen(RubyDate.ABBR_MONTHNAMES[1])).toEqual(true);
    expect(Object.isFrozen(RubyDate.ABBR_DAYNAMES)).toEqual(true);
    expect(Object.isFrozen(RubyDate.ABBR_DAYNAMES[0])).toEqual(true);
  });

  it("eql p", () => {
    const d = dNewByFrags({ jd: 0 });
    const d2 = dNewByFrags({ jd: 0 });
    const dt = dtNewByFrags({ jd: 0 });
    const dt2 = dtNewByFrags({ jd: 0 });

    expect(d.equals(d2)).toEqual(true);
    expect(d.equals(0)).toEqual(false);

    expect(dt.equals(dt2)).toEqual(true);
    expect(dt.equals(0)).toEqual(false);

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

    expect(typeof String(new RubyDate(1999, 5, 25).hash())).toEqual("string");
  });

  it("freeze", () => {
    const d = new RubyDate();
    Object.freeze(d);
    expect(Object.isFrozen(d)).toEqual(true);
    expect(Number.isInteger(d.yday)).toEqual(true);
    expect(typeof d.toS()).toEqual("string");
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
