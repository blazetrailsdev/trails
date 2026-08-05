// Ruby's Date/DateTime live in the `date` gem (vendor/date), which is
// implemented in C against its own astronomical calendar core. JS has no such
// core in the language; `Temporal` is the analogue every ported body is written
// against, so this package owns the polyfill and is the single module instance
// every `instanceof Temporal.PlainDate` in the monorepo resolves against.
export { Temporal } from "@js-temporal/polyfill";
