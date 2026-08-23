/**
 * Mirrors: active_support/core_ext/object/acts_like.rb
 *
 * Ruby reopens `Object`; TypeScript cannot, so the reopening is a class of the
 * Ruby name whose members take the receiver as the first parameter — the same
 * idiom `core-ext/object/blank.ts` uses for `NilClass`/`String`/`Time`.
 */

import { actsLikeDate, actsLikeTime } from "@blazetrails/date";

/**
 * A JS `Date` is what this port's `Time` arm receives at its boundaries — the
 * one Ruby-`Time`-shaped value `@blazetrails/date` does not construct, so its
 * `actsLikeTime` cannot answer for it and the marker is answered here.
 */
function isJsDate(self: unknown): boolean {
  // boundary: this predicate is keyed on being a JS `Date`.
  return self instanceof Date;
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
        return actsLikeTime(self) || isJsDate(self) || respondTo.call(self, "acts_like_time?");
      case "date":
        return actsLikeDate(self) || respondTo.call(self, "acts_like_date?");
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
