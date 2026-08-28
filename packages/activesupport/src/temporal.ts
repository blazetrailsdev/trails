import { Temporal } from "@blazetrails/date";

/**
 * ActiveSupport does not vend `Temporal` — in Rails, ActiveSupport `require`s
 * `date`, it does not define it. Its own files import `Temporal` from
 * `@blazetrails/date` directly, as activemodel, arel and activerecord do.
 *
 * The re-export below is kept for the packages that still reach for
 * `@blazetrails/activesupport/temporal`: actionpack (whose HTTP-header date
 * handling the activesupport-surfaced-deviations bucket owns and which is
 * deliberately not converged here),
 * globalid and trailties. It is a one-line pass-through, not a seam.
 */
export { Temporal };

/**
 * Bridge a JS Date to a Temporal.Instant.
 *
 * @noRailsEquivalent PERMANENT — a JS-`Date` bridge. Ruby has no JS `Date`, so
 * neither Rails nor the ruby/date gem has anything to port here, and
 * `packages/date` holds no opinion about the type.
 */
export function instantFrom(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}
