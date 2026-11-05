# A top-level call corrupts an argument above 2^31 when the callee makes a method call

This is wall 25's trigger, minimized. It was first filed as a `console.log`
defect; `console.log` turned out to be one instance of the real condition (a
dynamic method call in the callee), so that document is superseded by this one.

## Repro (`repro.ts`, 9 lines)

```ts
const o = { m(): void {} };
const v = 65536 * 65536;
console.log("v        :", v);        // 4294967296  — correct
console.log("probe(v) :", probe(v)); // 0           — WRONG
function probe(t: number): number { o.m(); return t; }
```

## Three conditions, all required

### 1. The call site is at module top level

| call site | perry |
| --- | --- |
| top level | **WRONG** |
| inside a function | OK |

### 2. The argument is a variable holding a value above 2^31−1

`isolate-site.ts` shows the constant itself is **not** corrupted — only
passing it is:

| | perry |
| --- | --- |
| `v` printed directly, twice | `4294967296` OK |
| `v + 0`, and a copy `const w = v` | OK |
| `probe(65536 * 65536)` — expression **inline** as the argument | OK |
| `probe(v)` / `probe(w)` — the **variable** | **`0`** |

The boundary is signed-int32 range, not 2^32 (`boundary.ts`):

| expression | product | perry |
| --- | --- | --- |
| `46340 * 46340` | 2147395600 (< 2^31) | OK |
| `2147483647 * 1` | 2^31−1 | OK |
| `46341 * 46341` | 2147488281 (> 2^31) | **WRONG** |
| `65535 * 65535` | 4294836225 | **WRONG** |
| `65536 * 65536` | 2^32 | **WRONG** |
| `1e8 * 864e5` | 8.64e15 | **WRONG** |

A large value that was never computed by an arithmetic expression is fine:
`const v = 8640000000000000`, `1 * 8640000000000000` and `2 * 4320000000000000`
all pass. So the condition is a *computed* result that leaves int31, not the
magnitude of the value as stored.

### 3. The callee's body contains a dynamic method call

`callee-call-kind.ts` and `callee-body-matrix.ts`:

| call in the callee's body | perry |
| --- | --- |
| `o.m()` on a local object | **WRONG** |
| `console.log(...)` / `console.error(...)` | **WRONG** |
| `importedDefault.method(...)` (e.g. `JSBI.BigInt`) | **WRONG** |
| a plain free function call | OK |
| `Math.max`, `String()`, `Number.isInteger`, `JSON.stringify`, `Date.now` | OK |

The intrinsics are presumably folded and never emit a real dynamic call, which
is what makes them safe. Nothing about imports is special — a local object
literal is enough.

## Why this is wall 25

`@js-temporal/polyfill` hits all three at once:

```js
Re=864e5, ke=1e8*Re, Ne=xo(ke), xe=e.unaryMinus(Ne)   // top level
function xo(t){ if(!Number.isInteger(t)) throw ...; return e.multiply(e.BigInt(t),c) }
```

`ke` is `8.64e15`, computed and far above 2^31; `Ne=xo(ke)` is a top-level
call; and `xo` calls `e.BigInt` / `e.multiply`, methods on the imported `jsbi`
default. So `xo` receives garbage, `Ne` becomes a garbage epoch bound, and
every `Time.at` / `Time.now` throws `RangeError`.

It also explains why four earlier attempts to reproduce wall 25 failed: each
test callee used `Number.isInteger` or a bare `return t`, and neither emits the
dynamic method call condition 3 requires.

## The wrong value is sometimes unwritten memory

Some shapes give a stable wrong answer (`0`, `4`, `6`); others differ on every
run of the same binary (`33554946`, `887095464`, `-1385888768`, and the
polyfill's bound across three runs). So this reads memory that was never
written, and a stable wrong answer is luck rather than a fixed truncation.

That also makes it dangerous to instrument: adding a `console.log` to a
function introduces condition 3. An early measurement here wrapped a function
in a `console.log` and so could have caused the corruption it was reporting;
the wall-25 numbers were re-taken with wrappers that store values and print
them after the fact.
