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
export {
  ArgumentError,
  Date,
  DateTime,
  Rational,
  dNewByFrags,
  strftime,
  type DateParts,
  type StrftimeSubject,
} from "./date.js";
export { Time } from "./time.js";
