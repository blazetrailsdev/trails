/**
 * Mirrors: active_support/core_ext/date/acts_like.rb,
 * active_support/core_ext/time/acts_like.rb,
 * active_support/core_ext/date_time/acts_like.rb
 *
 * Rails hangs the `acts_like_date?` / `acts_like_time?` markers by reopening
 * `Date`, `Time` and `DateTime` (`core_ext/date/acts_like.rb:5-9`,
 * `core_ext/time/acts_like.rb:5-9`, `core_ext/date_time/acts_like.rb:6-13`).
 * trails cannot reopen its equivalents: `Date.parse` (`date.ts:6869`) answers a
 * `Temporal.PlainDate` and `DateTime.parse` (`date.ts:9280`) a
 * `Temporal.PlainDateTime | Temporal.ZonedDateTime` — values of a third-party
 * package, never of a class activesupport owns, which is why a marker put on a
 * class at the Rails path (#6465) was inert: nothing constructs one.
 *
 * The markers therefore live here, in the package that constructs the values
 * they describe (RFC 0098, `time-with-zone-residue-structural-blockers`). The
 * alternative — installing them on the `Temporal` polyfill prototypes at import
 * time — was rejected: it is a global side effect on a third-party package, and
 * a `PlainDateTime` is not only ever a `DateTime`. Giving up the Rails file path
 * for these two members is the cost, and it lowers RFC 0098's reachable ceiling
 * by one member.
 */

import { Temporal } from "@js-temporal/polyfill";

import { Time } from "./time.js";

/**
 * Ruby `Date#acts_like_date?` (`core_ext/date/acts_like.rb:7`) and
 * `DateTime#acts_like_date?` (`core_ext/date_time/acts_like.rb:7`), answered on
 * behalf of the values this package builds for those two classes. A
 * `Temporal.Instant` is a moment with no calendar day of its own, so it is not
 * one, exactly as Ruby's `Time` is not a `Date`.
 *
 * @noRailsEquivalent PERMANENT — Rails spells this as a marker method on
 * reopened `Date`/`DateTime`; the values are `Temporal`'s, which TypeScript
 * cannot reopen, so the marker is a predicate over them instead.
 */
export function actsLikeDate(self: unknown): boolean {
  return (
    self instanceof Temporal.PlainDate ||
    self instanceof Temporal.PlainDateTime ||
    self instanceof Temporal.ZonedDateTime
  );
}

/**
 * Ruby `Time#acts_like_time?` (`core_ext/time/acts_like.rb:7`) and
 * `DateTime#acts_like_time?` (`core_ext/date_time/acts_like.rb:12`), answered
 * on behalf of the values this package owns the mapping for: {@link Time},
 * which `Time.now` returns; the `Temporal` values `DateTime.parse` returns; and
 * the JS `Date` trails' boundaries carry a Ruby `Time` in.
 *
 * @noRailsEquivalent PERMANENT — Rails spells this as a marker method on
 * reopened `Time`/`DateTime`; the values are `Temporal`'s, which TypeScript
 * cannot reopen, so the marker is a predicate over them instead.
 */
export function actsLikeTime(self: unknown): boolean {
  return (
    self instanceof Time ||
    // boundary: a JS `Date` is one of the Ruby-`Time`-shaped values this answers for.
    self instanceof globalThis.Date ||
    self instanceof Temporal.Instant ||
    self instanceof Temporal.PlainDateTime ||
    self instanceof Temporal.ZonedDateTime
  );
}
