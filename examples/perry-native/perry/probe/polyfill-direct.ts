import { Temporal } from "@js-temporal/polyfill/dist/index.esm.js";

function attempt(label: string, fn: () => unknown): void {
  try {
    console.log(`${label} => ${String(fn())}`);
  } catch (e) {
    const err = e as Error;
    console.log(`${label} => THREW ${err.name}: ${err.message}`);
  }
}

attempt("Instant.fromEpochMilliseconds(0)", () => Temporal.Instant.fromEpochMilliseconds(0));
attempt("Instant.fromEpochNanoseconds(0n)", () => Temporal.Instant.fromEpochNanoseconds(0n));
attempt("Instant.fromEpochNanoseconds(1793830019005029000n)", () =>
  Temporal.Instant.fromEpochNanoseconds(1793830019005029000n),
);
attempt("PlainDate.from('1970-01-01')", () => Temporal.PlainDate.from("1970-01-01"));
attempt("Now.instant()", () => Temporal.Now.instant());
