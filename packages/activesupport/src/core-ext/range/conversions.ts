import { Temporal } from "@blazetrails/date";

import { Range } from "@blazetrails/ruby-compat/range";
import { toFs as timeToFs } from "../time/conversions.js";
import { toFs as dateToFs } from "../date/conversions.js";

/**
 * `ActiveSupport::RangeWithFormat`
 * (core_ext/range/conversions.rb:5), which Ruby `prepend`s onto `Range`.
 *
 * `to_fs` defines no `super` call, so it is mixed onto `Range` with the
 * settled `this`-typed-function idiom rather than through `prepend()`.
 */

declare module "@blazetrails/ruby-compat/range" {
  interface Range<T> {
    toFs(format?: string): string | undefined;
    toFormattedS(format?: string): string | undefined;
  }
}

/**
 * Ruby's `start.to_fs(:db)` (conversions.rb:12,18,24). Ruby dispatches on the
 * endpoint's own `to_fs`; TS has no open classes, so the dispatch is explicit
 * over the values trails uses for the Ruby endpoint types — `Temporal.PlainDate`
 * for `Date`, `Date`/`Temporal.Instant` for `Time`, everything else `to_s`.
 */
function toFsDb(value: unknown): string {
  if (value instanceof Temporal.PlainDate) return dateToFs(value, "db");
  // boundary: `time-ext.ts`'s `toFs` — the ported `Time#to_fs` — takes a JS Date.
  if (value instanceof Date) return timeToFs(value, "db");
  // boundary: as above, an Instant is bridged to the Date `toFs` accepts.
  if (value instanceof Temporal.Instant) return timeToFs(new Date(value.epochMilliseconds), "db");
  return String(value);
}

export const RANGE_FORMATS: Record<string, (start: unknown, stop: unknown) => string | undefined> =
  {
    db: (start, stop) => {
      if (start != null && stop != null) {
        if (typeof start === "string") return `BETWEEN '${start}' AND '${stop}'`;
        return `BETWEEN '${toFsDb(start)}' AND '${toFsDb(stop)}'`;
      } else if (start != null) {
        if (typeof start === "string") return `>= '${start}'`;
        return `>= '${toFsDb(start)}'`;
      } else if (stop != null) {
        if (typeof stop === "string") return `<= '${stop}'`;
        return `<= '${toFsDb(stop)}'`;
      }
      return undefined;
    },
  };

/**
 * Convert range to a formatted string. See RANGE_FORMATS for predefined formats.
 *
 * This method is aliased to `toFormattedS`.
 *
 *   range = (1..100)           # => 1..100
 *
 *   range.to_s                 # => "1..100"
 *   range.to_fs(:db)           # => "BETWEEN '1' AND '100'"
 *
 *   range = (1..)              # => 1..
 *   range.to_fs(:db)           # => ">= '1'"
 *
 *   range = (..100)            # => ..100
 *   range.to_fs(:db)           # => "<= '100'"
 *
 * == Adding your own range formats to toFs
 * You can add your own formats to the RANGE_FORMATS hash.
 * Use the format name as the hash key and a function.
 *
 *   RANGE_FORMATS.short = (start, stop) => `Between ${start} and ${stop}`;
 *
 * Returns `undefined` for a fully unbounded range under `:db`, as Ruby's
 * formatter returns `nil` when its `if`/`elsif` chain falls through
 * (conversions.rb:20-26).
 */
export function toFs<T>(this: Range<T>, format: string = "default"): string | undefined {
  const formatter = RANGE_FORMATS[format];
  if (formatter) {
    return formatter(this.begin, this.end);
  } else {
    return this.toS();
  }
}

export const toFormattedS = toFs;

Object.assign(Range.prototype, { toFs, toFormattedS });
