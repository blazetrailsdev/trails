import { Temporal } from "@js-temporal/polyfill";

function attempt(label: string, fn: () => unknown): void {
  try {
    console.log(`${label} => ${String(fn())}`);
  } catch (e) {
    const err = e as Error;
    console.log(`${label} => THREW ${err.name}: ${err.message}`);
  }
}

const ns = 1793830019005029000n;
attempt("Now.timeZoneId()", () => Temporal.Now.timeZoneId());
attempt("Instant.fromEpochNanoseconds(ns)", () => Temporal.Instant.fromEpochNanoseconds(ns));
attempt("...toZonedDateTimeISO('UTC')", () =>
  Temporal.Instant.fromEpochNanoseconds(ns).toZonedDateTimeISO("UTC"),
);
attempt("Instant.fromEpochMilliseconds(Date.now())", () =>
  Temporal.Instant.fromEpochMilliseconds(Date.now()),
);
attempt("Now.instant()", () => Temporal.Now.instant());
attempt("PlainDate.from('1970-01-01')", () => Temporal.PlainDate.from("1970-01-01"));
