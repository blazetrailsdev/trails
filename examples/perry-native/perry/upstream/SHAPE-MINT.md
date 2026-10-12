# `static ShapeId refused by the shape mint` when a class is compiled from TypeScript

**Perry `main` @ `d74498b2` (0.5.1659)**, built from source, Linux x86_64,
LLVM 22.1.8. Not specific to the npm build — this is current `main`, and it is
a _different_ bug from the `prototype` one in [ISSUE.md](ISSUE.md) (which
`main` already fixes).

A binary compiles and links, then aborts at startup:

    Perry internal error: the static ShapeId 0x80000631 (proto 0x400000000000000c)
    was refused by the shape mint (it is outside the static band or already names
    other facts in this agent); a static id must name one shape

`static_shape_id_refused_abort`, `crates/perry-runtime/src/object/shapes.rs:1846`.
Deterministic: same id every run for a given input.

## What triggers it

Compiling `@blazetrails/ruby-compat`'s **TypeScript source**. Compiling the
_same code_ as the `tsc` output it ships in `dist/` works. Narrowed to one
construct:

| `packages/ruby-compat/src/include.ts:175`                        | Result         |
| ---------------------------------------------------------------- | -------------- |
| `export class Module<I extends object = Record<never, never>> {` | **aborts**     |
| `export class Module {` (type parameter removed, uses rewritten) | runs correctly |

Nothing else changes — same file, same 137-module graph, same everything.
`dist/include.js` is `tsc`'s erasure of exactly this class and it never aborts,
so the type parameter is changing what Perry derives for this class's shape.

## Reducing it, and why it stops here

Reduction so far, each step verified:

1. 137 modules, trails app entry → aborts.
2. Only `include.ts` left as TypeScript, the other 146 modules replaced by
   their own `dist/*.js` → still aborts. So one TS file is sufficient.
3. Prefix-bisect inside `include.ts`, splicing its type-erased `dist` form for
   the suffix → the trigger is in lines 32-703, the `Module` class.
4. Remove the class's generic type parameter → passes.

**It does not reduce to a small synthetic program.** A bare
`export class Box<I extends object = Record<never, never>> {}` imported and
instantiated compiles and runs fine, as do variants with a constructor
parameter, a getter, no default type argument, and a plain `<T>`.

That is consistent with the error itself rather than a dead end: the message
says a static id "already names other facts", and the surrounding code
documents these ids as _compiler-assigned by content_. A collision needs a
populated shape space, which a two-module program does not have. So the
minimal input is "one real TypeScript class in a graph with enough shapes",
not a handful of lines — a maintainer with the shape-id assignment in view can
likely see it immediately from the construct above.

`crates/perry-runtime` has a `shape-mint-diag` feature intended for exactly
this; a build with it should name both colliding shapes.

## Reproducing

`packages/ruby-compat` is public, so the input is available:

    git clone https://github.com/blazetrailsdev/blazetrails trails
    cd trails && pnpm install --ignore-scripts
    pnpm --filter @blazetrails/ruby-compat build   # produces the dist/ baseline

Then, from a scratch directory, with ruby-compat (its `package.json`, `src/`
and `dist/`) under `node_modules/@blazetrails/ruby-compat`:

    // entry.js
    import { regexpEscape } from "@blazetrails/ruby-compat";
    console.log("ok", regexpEscape("a.b*c"));

    perry compile entry.js -o entry && ./entry

Perry prefers the package's TypeScript `src/` over its `dist/`, which is what
selects the failing path — importing `dist/index.js` by relative path compiles
and runs correctly at the same 137 modules. That asymmetry is itself worth
knowing: for this package, Perry's own source-preference is what breaks it.

## Impact

This is the current blocker on compiling a trails application natively.
`ruby-compat` is the framework's foundation layer, so every trails program
reaches this class. A 54-module slice compiles and runs correctly today; this
abort is what stands between that and the rest.
