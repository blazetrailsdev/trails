import { Rational } from "@blazetrails/ruby-compat";

function show(label: string, r: Rational): void {
  console.log(`${label} => ${r.numerator.toString()}/${r.denominator.toString()}`);
}

const secs = 1793829332;
const ns = 1793829332030344559n;

console.log("BigInt(1793829332000) =", BigInt(secs * 1000).toString());
console.log("BigInt(1.5e15) =", BigInt(1.5e15).toString());
console.log("isInteger(secs*1000) =", Number.isInteger(secs * 1000));

show("Rational(secs*1000, 1000)", new Rational(secs * 1000, 1000));
show("Rational(ns, 1e9n)", new Rational(ns, 1_000_000_000n));
show("Rational(secs*1000, 1000) [tzinfo:595 shape]", new Rational(secs * 1000, 1000));
show("Rational(0.5, 86400)", new Rational(0.5, 86400));
show("Rational(1793829332030n, 1000n)", new Rational(1793829332030n, 1000n));

const toF = (r: Rational): number => Number(r.numerator) / Number(r.denominator);
console.log("toF(Rational(ns,1e9n)) =", toF(new Rational(ns, 1_000_000_000n)));
console.log("expected approx            = 1793829332.0303446");
