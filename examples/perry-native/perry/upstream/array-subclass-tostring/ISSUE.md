# A `toString` override on a class extending Array is not dispatched

**perry 0.5.1663 from `main` at `a1ae27ee5`** (Linux x86_64, LLVM 22.1.8).

`class Mine extends Array { toString() { … } }` — calling `.toString()` on an
instance runs **`Array.prototype.toString`**, not the override. 19 lines, no
dependencies (`repro.ts`):

| expression | node | perry |
| --- | --- | --- |
| `String(m)` | `OVERRIDE` | `1,2,3` |
| `m.toString()` | `OVERRIDE` | `1,2,3` |
| `` `${m}` `` | `OVERRIDE` | `1,2,3` |
| `m.describe()` (another override) | `described` | `described` |
| `m.length` | `3` | `3` |
| `m instanceof Array` | `true` | `true` |
| `hasOwnProperty(Mine.prototype,"toString")` | `true` | `true` |
| `Mine.prototype.toString.call(m)` | `OVERRIDE` | `OVERRIDE` |

So the override is present on the prototype and works when called directly —
only the **dispatch** at `m.toString()` skips it. Other overrides on the same
class dispatch correctly, so this is not about subclassing in general.

## It is Array-specific, and it really is reaching the builtin

`scope.ts` adds a `join` override alongside `toString`. perry then answers
`m.toString()` with **`JOIN-OVERRIDE`** — which is `Array.prototype.toString`
behaving exactly to spec (it does `Get(array, "join")` and calls it). That
confirms the builtin is being entered instead of the override. The same file
shows `Map`, `Error` and plain-class subclasses all dispatching their
`toString` correctly:

| receiver | node | perry |
| --- | --- | --- |
| `class extends Array` | `ARR-OVERRIDE` | **`JOIN-OVERRIDE`** |
| `class extends Map` | `MAP-OVERRIDE` | `MAP-OVERRIDE` |
| `class extends Error` | `ERR-OVERRIDE` | `ERR-OVERRIDE` |
| plain `class` | `PLAIN-OVERRIDE` | `PLAIN-OVERRIDE` |

A plain property read of the method (`(m as {toString: () => string}).toString()`)
is also wrong, so it is not only the ToPrimitive path.

## Reproduce

    perry compile repro.ts -o repro && ./repro      # prints 1,2,3
    perry compile scope.ts -o scope && ./scope      # prints JOIN-OVERRIDE

## Why it matters

It silently corrupts arbitrary-precision arithmetic in any program that uses
`jsbi`, because **JSBI is `class JSBI extends Array`** and its `toString(radix)`
is an override. With it bypassed, a JSBI value stringifies as its internal digit
array:

| JSBI 4.3.2 call | node | perry |
| --- | --- | --- |
| `BigInt(0).toString()` | `0` | *(empty string)* |
| `BigInt("8640000000000000000000").toString()` | `8640000000000000000000` | `788529152,5815621,7494` |
| `multiply(BigInt(3600), BigInt(1e9)).toString()` | `3600000000000` | `817405952,3352` |

`@js-temporal/polyfill@0.5.1` is built on `jsbi`, so **every** Temporal
construction fails its range check:

    Temporal.Instant.fromEpochMilliseconds(0)
      => RangeError: date/time value is outside of supported range
    Temporal.PlainDate.from("1970-01-01")
      => RangeError: date/time value is outside of supported range

That is wall 24 of the trails ladder: the boot graph reaches the application's
own `config/environment.ts` (1318 of 1934 modules initialised) and dies there,
because `Time.at` and `Time.now` go through the polyfill.

Note the failure mode is a *wrong value*, not a crash — a program doing BigInt
arithmetic through jsbi gets silently incorrect numbers. The RangeError here is
luck: the polyfill happens to range-check its input.

## Ruled out while finding this

Each tested and eliminated, in case they look suspicious: `&&` returning a
boolean instead of the operand; BigInt beyond 64 bits (`2n**100n` and
`8640000000000000000000n` are exact); `Rational`/`floatToR` in trails
(byte-identical on both runtimes); `performance.timeOrigin` and
`performance.now()` (correct, 19-digit `systemEpochNs()`); and perry's own
*native* `Temporal`, which is fine — the polyfill is what trails imports.

## Aside: an unresolvable bare import compiles to a silent stub

Found while building these probes, and worth its own look. `import JSBI from
"jsbi"` from a directory where the package does not resolve compiles with
`Found 1 module` and **no diagnostic**; every call on the import then returns
`0` at runtime. Node refuses the same program outright
(`ERR_MODULE_NOT_FOUND`). Two of my probes looked like they ran and were
measuring nothing.

## Root cause

`crates/perry-runtime/src/value/to_string_array.rs`. Both entry points that
resolve which `toString` an array receiver should run ask for it on the
**intrinsic** prototype:

```rust
let proto = crate::object::builtin_prototype_value("Array");
```

- `array_prototype_to_string_override` — `String(arr)`, `` `${arr}` ``
- `call_array_prototype_to_string_method` — a source-level `arr.toString()`

So both see only `Array.prototype`. They detect a global monkey-patch of
`Array.prototype.toString` (which is what they were written for, test262
`S15.5.1.1_A1_T8`) and are blind to the two chains that shadow it: a
`class X extends Array` whose override lives on `X.prototype`, and an own
`toString` on the array itself.

The file header states the assumption behind this:

> Arrays are `GC_TYPE_ARRAY`, not `ObjectHeader`s, so unlike ordinary objects
> their `toString` can't be looked up as an "own/inherited field" on the array
> value itself.

That is true of a raw `ObjectHeader` field read, but not of property lookup in
general: `js_get_property` does resolve a `GC_TYPE_ARRAY` receiver's chain.
The sibling function `array_prototype_to_string` in the same file already
depends on exactly that for its live `join` lookup.

## What the measurements eliminate

The property **lookup** is correct; only the **call** diverges:

| form | node | perry |
| --- | --- | --- |
| `a.toString` (read) | the override | **the override** |
| `Reflect.get(a, "toString")` | the override | **the override** |
| `a.toString()` | `OVERRIDE` | `1,2,3` |
| `(a.toString)()` | `OVERRIDE` | `1,2,3` |
| `String(a)` / `` `${a}` `` | `OVERRIDE` | `1,2,3` |
| `f.call(a)` (extracted) | `OVERRIDE` | `OVERRIDE` |
| `a + ""` | `OVERRIDE` | `OVERRIDE` |

`a + ""` passing proves runtime `ToPrimitive` is correct; `f.call(a)` passing
proves the closure and `this`-binding are correct. Only the two resolution
sites above are wrong. `forms.ts` is this table.

Ruled out by measurement, each with its own probe:

- **the codegen method-site fast path** — `PERRY_METHOD_SITE=0` does not change
  the result.
- **an HIR fold** — `--print-hir` keeps the call as a generic
  `Call { callee: PropertyGet { property: "toString" } }`; nothing folds it.
- **own-property storage on an array** — `Object.defineProperty(c, "zzz", …)`
  reads back `42`, and an own `toString` reads back as its own function. The
  value is stored and found; it is simply not the one called.

## Fix

Resolve `toString` on the receiver's own chain first, and fall back to the
intrinsic lookup. `receiver_chain_to_string_method` returns `None` for the
installed noop thunk, which keeps a plain array on the hardcoded `join(",")`
path and keeps `array_prototype_to_string` (the generic algorithm, reached by
`Array.prototype.toString.call(arr)`) free to run on an array receiver without
re-entering an override — which would otherwise recurse forever.
