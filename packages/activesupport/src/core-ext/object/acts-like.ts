/**
 * Mirrors: active_support/core_ext/object/acts_like.rb
 *
 * Ruby reopens `Object`; TypeScript cannot, so the reopening is a class of the
 * Ruby name whose members take the receiver as the first parameter — the same
 * idiom `core-ext/object/blank.ts` uses for `NilClass`/`String`/`Time`.
 */

import { Temporal } from "@blazetrails/date";

/**
 * The receivers that stand in for Ruby's `Time` in this port, so
 * `actsLike(x, "time")` answers `true` for them the way
 * `core_ext/time/acts_like.rb:5-9` (`class Time; def acts_like_time?; true`)
 * and `core_ext/date_time/acts_like.rb:11-13` do for `Time` and `DateTime`.
 * TypeScript cannot reopen `Date` or the `Temporal` types to hang a marker
 * method on them, so the arm answers for them here instead.
 */
function isRubyTime(self: unknown): boolean {
  return (
    // boundary: a JS `Date` is what this port's `Time` arm receives, and this
    // predicate is keyed on being one.
    self instanceof Date ||
    self instanceof Temporal.Instant ||
    self instanceof Temporal.PlainDateTime ||
    self instanceof Temporal.ZonedDateTime
  );
}

/**
 * The receivers that stand in for Ruby's `Date` — `core_ext/date/acts_like.rb:5-9`
 * and `core_ext/date_time/acts_like.rb:6-8`. A `Temporal.Instant` is a moment
 * with no calendar day of its own, so it is not one, exactly as Ruby's `Time`
 * is not a `Date`.
 */
function isRubyDate(self: unknown): boolean {
  return (
    self instanceof Temporal.PlainDate ||
    self instanceof Temporal.PlainDateTime ||
    self instanceof Temporal.ZonedDateTime
  );
}

export class Object {
  /**
   * Provides a way to check whether some class acts like some other class
   * based on the existence of an appropriately-named marker method.
   *
   * Note that the marker method is only expected to exist. It isn't called, so
   * its body or return value are irrelevant.
   */
  static actsLike(self: unknown, duck: string): boolean {
    switch (duck) {
      case "time":
        return isRubyTime(self) || respondTo.call(self, "acts_like_time?");
      case "date":
        return isRubyDate(self) || respondTo.call(self, "acts_like_date?");
      case "string":
        return respondTo.call(self, "acts_like_string?");
      default:
        return respondTo.call(self, `acts_like_${duck}?`);
    }
  }
}

/**
 * Ruby's `respond_to?`, which takes the RUBY method name — so the marker names
 * above read exactly as they do in Rails. The trails spelling of a marker is
 * the conventions-table rename of that name (`acts_like_time?` →
 * `actsLikeTime`, as `TimeWithZone#actsLikeTime` defines it), applied here so
 * the one translation lives in one place.
 */
function respondTo(this: unknown, rubyName: string): boolean {
  if (this == null) return false;
  const tsName = rubyName
    .replace(/\?$/, "")
    .replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  return typeof (this as Record<string, unknown>)[tsName] === "function";
}
