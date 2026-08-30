/**
 * Port of Ruby's date gem.
 *
 * Ruby's `Date` / `DateTime` are implemented in C against the gem's own
 * astronomical calendar core. JS has no such core in the language; `Temporal`
 * is the analogue every ported body is written against, so this package owns
 * `@js-temporal/polyfill` outright and is the single module instance every
 * `instanceof Temporal.PlainDate` in the monorepo resolves against — a second
 * copy would make that test false for a valid value and drop
 * `AbstractAdapter#quote` into its `can't quote` TypeError.
 */
export { Temporal } from "@js-temporal/polyfill";
/**
 * Shim: `Rational` is Ruby core, not the date gem, and lives in
 * `@blazetrails/ruby-compat` (RFC 0129). Re-exported here so
 * `@blazetrails/date`'s public surface is unchanged while its consumers move.
 */
export { Rational } from "@blazetrails/ruby-compat";
export { actsLikeDate, actsLikeTime } from "./acts-like.js";
export {
  ArgumentError,
  Date,
  DateTime,
  cCivilToJd,
  dNewByFrags,
  dtNewByFrags,
  strftime,
  type DateParts,
  type StrftimeSubject,
} from "./date.js";
export { Time, resetLocalTimeZoneId } from "./time.js";
export { tzdataIsdst } from "./tzdata-isdst.js";
