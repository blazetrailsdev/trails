import { Rational } from "@blazetrails/ruby-compat";
import { Time } from "@blazetrails/date";

function attempt(label: string, fn: () => unknown): void {
  try {
    console.log(`${label} => ${String(fn())}`);
  } catch (e) {
    const err = e as Error;
    console.log(`${label} => THREW ${err.name}: ${err.message}`);
  }
}

const ns = 1793829332030344559n;
attempt("Time.at(Rational(ns, 1e9n))", () => Time.at(new Rational(ns, 1_000_000_000n)));
attempt("Time.at(1793829332)", () => Time.at(1793829332));
attempt("Time.at(Rational(1793829332000, 1000))", () => Time.at(new Rational(1793829332000, 1000)));
attempt("Time.now()", () => (Time as unknown as { now: () => unknown }).now());
