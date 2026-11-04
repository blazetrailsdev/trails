# Any RegExp panics the runtime in a stdlib-linked binary

**perry 0.5.1663, built from `main` at `a1ae27ee5`** (Linux x86_64, LLVM 22.1.8,
from-source build with all 20 archives and regenerated GC-effects sidecars).

A program that links `perry-stdlib` aborts on its first `RegExp` use:

    thread '<unnamed>' panicked at crates/perry-runtime/src/regex/instance.rs:262:10:
    realm has installed the RegExp intrinsic

`intrinsic_prototype()` reads `RegExp.prototype` out of the global through
`PROTOTYPE_READ` and `.expect()`s it; in a stdlib-linked realm the read returns
`None`.

## The four cases

| link mode | RegExp | result |
| --- | --- | --- |
| runtime-only | top-level literal | **works** (`plain.ts`) |
| with stdlib | none | **works** (`noregex.ts`) |
| with stdlib | top-level literal | panic (`withstdlib.ts`) |
| with stdlib | created inside a function, called after the stdlib call | panic (`lazyregex.ts`) |

So it is not about top-level ordering, and not about the regex being reached
first: the intrinsic is never installed in a stdlib-linked realm.

`plain.ts` and `withstdlib.ts` differ by one `fetch()` call — enough to flip the
link from `Linking (runtime-only)...` to `Linking (with stdlib)...`.

## Reproduce

    perry compile withstdlib.ts -o ws && ./ws     # panics
    perry compile plain.ts      -o p  && ./p      # prints "match: true"

11 lines, no dependencies, no trails code.

## Not the auto-optimized feature set

`PERRY_NO_AUTO_OPTIMIZE=1`, which falls back to the prebuilt full stdlib and
unwind runtime instead of the trimmed rebuild, panics identically. So the
missing intrinsic is not a dropped Cargo feature.

## Suspect

`ef799c0d6` (2026-11-02) "realm intrinsics: one entry per builtin holds its
prototype and constructor" restructured exactly this area and is recent (295
commits before `a1ae27ee5`). Not bisected — stated as a starting point, not a
conclusion. `js_stdlib_init_dispatch` being a warning stub in runtime-only
builds and the real symbol in stdlib builds is the other half worth looking at.

## Why it matters here

It blocks AOT-compiling a trails application outright. The boot graph compiles
and links fine — 1934 modules, 229MB binary — and then aborts before a single
module initialises, because trails uses regular expressions throughout and needs
`fetch` (so stdlib) for `ruby-compat`'s open-uri.
