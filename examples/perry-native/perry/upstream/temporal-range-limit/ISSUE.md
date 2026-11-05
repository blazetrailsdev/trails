# Wall 25 — the Temporal polyfill's epoch limit is uninitialized memory

Found by fixing wall 24. The array-subclass `toString` patch makes JSBI
correct, but `Time.at` still throws, so wall 24 was *a* cause of the ladder's
`RangeError` and not the only one.

## What is actually wrong

`@js-temporal/polyfill@0.5.1` holds its epoch bounds in two module-level
constants and checks them in:

```js
function Fr(t){if(e.lessThan(t,xe)||e.greaterThan(t,Ne))
  throw new RangeError("date/time value is outside of supported range")}
```

`observe-limit.ts` wraps `JSBI.lessThan`/`greaterThan` and reads the real
operands. Three runs of the **same binary**:

| run | `xe` | `Ne` |
| --- | --- | --- |
| 1 | `175631752000000` | `-175631752000000` |
| 2 | `1079504264000000` | `-1079504264000000` |
| 3 | `1951919496000000` | `-1951919496000000` |
| expected | `-8640000000000000000000` | `+8640000000000000000000` |

So `Ne` is **negative**, ~7 orders of magnitude too small, and **different on
every run of the same binary**. It is uninitialized memory, not a miscomputed
constant. `xe = unaryMinus(Ne)`, so one bad `Ne` explains the sign swap too.

Every observed value is an integer times `1e6`, which fits
`Ne = multiply(BigInt(ke), c)` with `c = BigInt(1e6)` correct and `ke`
garbage. `ke = 1e8 * Re`, and the garbage always divides cleanly by `1e8`
(`1.20066624`, `18.31390488`, `4.52456024`), so what is read as garbage is the
operand, not the multiplication: `1e8 * 864e5` evaluated in the same program
is correct.

## Ruled out, each by measurement

- **JSBI.** After the wall-24 patch the standalone `jsbi@4.3.2` matches node on
  `BigInt(string)`, `BigInt(8.64e15)` (the `__fromDouble` path), `multiply`,
  `divide`, `remainder`, `lessThan`, `greaterThan`, `unaryMinus`, `toNumber`.
- **The comparison and the limit arithmetic.** `replicate-check.ts` computes
  `Ne` and runs `Fr`'s exact comparison in its own module, against the same
  JSBI instance the polyfill imports: it gets `8640000000000000000000` and
  says IN for every value the polyfill rejects.
- **Native `BigInt`.** `native-bigint.ts`: `toString()`, `toString(10)`,
  `toString(16)`, division, comparison, `Number()` all match. `Lo`, the
  polyfill's converter, is `JSBI.BigInt(v.toString(10))`, which is correct.
- **Literal vs computed bigints** — identical, and `===` agrees.
- **Typed-array aliasing**, which `__fromDouble` uses — same int pair as node.
- **Float multiplication** — `1e8 * 864e5`, `1e9 * 1e9` etc. all exact.
- **jsbi's static tables being unassigned at polyfill init** — a 3-module
  repro of that shape initializes them correctly and gets the right answer.
- **A large `const` declarator list** — 400 declarators with the same
  dependency chain is correct.

## Three of my own earlier claims, retracted

- **"The limit is `837292312000000`."** Wrong. That came from bisecting, which
  assumes the accepted set is an interval. It is not: a later scan found
  values both above and below that point accepted, and three bisections over
  different ranges returned three different "limits". The limit is not a
  threshold at all — it is garbage that varies per run.
- **"The polyfill bundles its own JSBI that differs from the standalone."**
  Wrong. It does `import e from "jsbi"` and declares no class; it is the same
  instance, which is what makes `replicate-check.ts` a valid comparison.
- **"The behaviour is deterministic."** Wrong, and wrongly reasoned: I called
  the range check 12 times inside one process, but `Ne` is computed once at
  module init, so stability within a run was guaranteed and proved nothing.
  Re-running the same binary shows a different value every time.

A further caution: the first version of `observe-limit.ts` called
`console.log` inside its wrapper, and `toplevel-call-garbage-arg/` shows that
a callee containing a `console` call can itself receive a garbage argument.
The table above was re-measured with the wrappers storing values and printing
them afterwards, so the instrumentation cannot be the cause.

## Trigger — minimized, in `../toplevel-arg-over-int31/`

No longer open. The mechanism is a 9-line defect with three conditions, all of
which this module satisfies:

1. the call is at **module top level** — `Ne=xo(ke)`;
2. the argument is a **variable holding a computed value above 2^31−1** —
   `ke = 1e8 * Re` is `8.64e15` (the constant itself reads back correctly; only
   passing it corrupts);
3. the **callee makes a dynamic method call** — `xo` calls `e.BigInt(t)` and
   `e.multiply(...)` on the imported `jsbi` default.

Remove any one and the value arrives intact. That is why four earlier attempts
to reproduce this failed: every test callee used `Number.isInteger` or a bare
`return t`, and neither emits the dynamic method call condition 3 needs —
`Math.max`, `String`, `JSON.stringify` and `Date.now` are folded and are all
safe in that position.

## Two unrelated defects found while probing

- **`BigInt.asIntN` returns 0.** `BigInt.asIntN(64, 1793829332000000000n)` is
  `0` on perry. The polyfill's ESM build never calls it, so it is not this
  wall.
- **`Intl` era parsing.** Once a small instant passes the range check it fails
  in formatting: `Unknown era 00 in "1/1/1970, 00:00:00 AD`. So a wall sits
  behind this one.
