# A top-level call into a forward-declared function whose body calls `console` gets a garbage argument

Found while chasing wall 25.

## Repro (`repro.ts`, 13 lines)

```ts
const Re = 864e5, ke = 1e8 * Re, Ne = xo(ke), xe = -Ne;
function xo(t: number): number { console.log("   xo received:", t); return t; }
```

| | node | perry |
| --- | --- | --- |
| `ke` | `8640000000000000` | `8640000000000000` |
| `t` inside `xo` | `8640000000000000` | **`6`** |
| `Ne` | `8640000000000000` | **`6`** |

`ke` itself is correct — it prints correctly on the next line. Only the value
the callee *receives* is wrong.

## Both ingredients are necessary (`shape-matrix.ts`)

| shape | perry |
| --- | --- |
| callee calls `console.log`, argument is a variable | **WRONG** (`6`) |
| callee calls `console.log`, argument is a **literal** | OK |
| callee has no call in its body | OK |
| callee calls an ordinary user function | OK |
| in one `const` list, or as separate statements | **WRONG either way** |

So the comma-separated `const` list is NOT the trigger — a separate statement
fails too. The trigger is: a top-level call, a **non-literal** argument, and a
callee whose body calls `console`.

## It is `console` specifically (`callee-body-matrix.ts`)

| call in the callee's body | perry |
| --- | --- |
| `console.log` | **WRONG** (`6`) |
| `console.error` | **WRONG** (`1368582664`) |
| `Math.max`, `String()`, `Number.isInteger`, `JSON.stringify`, `Date.now` | OK |

`console` has its own lowering
(`crates/perry-codegen/src/lower_call/console_promise.rs`), which is where to
look.

## The wrong value is sometimes uninitialized memory

`6` is stable for `console.log`, but `console.error` and the
no-trailing-negate shape give large values that differ **on every run of the
same binary** (`-688915960`, `1368582664`, …). So this reads memory that was
never written, and the stable `6` is luck rather than a fixed wrong answer.

## Why it matters beyond the diagnostic

It silently corrupts a value with no diagnostic, and `console.log` is what
anyone adds to debug. A probe that prints its own input can therefore change
the answer it reports — two of this ladder's measurements were re-run after
this was found, because the instrumentation wrapped a function in a
`console.log` and so could have caused the corruption it observed.
