# Wall 25 — Temporal's epoch range limit is ~10.3 million times too small

Found by fixing wall 24. The array-subclass `toString` patch makes JSBI
correct, but `Time.at` still throws, so wall 24 was *a* cause of the ladder's
`RangeError` and not the only one.

## Symptom

`@js-temporal/polyfill@0.5.1` rejects any instant past ~1996-07-xx:

    Temporal.Instant.fromEpochNanoseconds(1793829332000000000n)
    RangeError: date/time value is outside of supported range

## Measurement

`limit-bisect.ts` bisects the highest accepted epoch-nanosecond value:

| | highest accepted |
| --- | --- |
| node | `8639999999999999999999` |
| perry | `837292312000000` |
| spec limit (`Ne`) | `8640000000000000000000` |

A factor of about `1.03e7`. The polyfill computes that limit as
`JSBI.multiply(JSBI.BigInt(1e8 * 86400000), JSBI.BigInt(1e6))` — 8.64e15 ns/ms
scaled by 1e6 — inside `function Fr(t)`:

```js
function Fr(t){if(e.lessThan(t,xe)||e.greaterThan(t,Ne))
  throw new RangeError("date/time value is outside of supported range")}
```

## Not the cause (each measured)

- **JSBI itself.** After the wall-24 patch, the standalone `jsbi@4.3.2` agrees
  with node on all of: `BigInt(string)`, `BigInt(8.64e15)` (the `__fromDouble`
  path), `multiply`, `divide`, `remainder`, `lessThan`, `greaterThan`,
  `unaryMinus` and `toNumber`. `jsbi-fromdouble.ts` computes the limit itself
  and gets `8640000000000000000000`, correct. So the standalone package is
  right and the polyfill's bundled copy is not.
- **Native `BigInt`.** `native-bigint.ts`: `toString()`, `toString(10)`,
  `toString(16)`, `toString(2)`, division, comparison and `Number()` all
  match. The conversion the polyfill uses is `BigInt.toString(10)`, which is
  correct.
- **Typed-array aliasing.** `__fromDouble` reads a double through overlaid
  `Float64Array`/`Int32Array` views; perry returns the same int pair as node
  and the same big-endian answer.
- **An uninitialised limit.** A zero `Ne` would reject every positive value;
  `per-value.ts` shows `0n`, `1n`, `-1n` and `1000000000n` all pass the range
  check. The limit is wrong, not absent.
- **A 30-bit digit truncation.** JSBI stores 30-bit digits, so the obvious
  guess is that one digit survived: `8640000000000000 mod 2^30` is `47972352`,
  but the observed limit over 1e6 is `837292312`. They do not match, so this
  is NOT a single-digit truncation. The real mechanism is still unidentified.

## Also found, separately

Two independent defects turned up while probing and are not this wall:

- **`BigInt.asIntN` returns 0.** `BigInt.asIntN(64, 1793829332000000000n)` is
  `0` on perry, correct on node. The polyfill's ESM build never calls it, so it
  is not the cause here, but it is wrong.
- **`Intl` era parsing.** Once a small instant passes the range check it
  fails in formatting: `Unknown era 00 in "1/1/1970, 00:00:00 AD`. So even
  with the range check fixed, `Instant.toString()` has a wall behind it.
