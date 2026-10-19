# Can a trails app compile to a native binary with Perry?

Measured 2026-10-11 against **Perry 0.5.1520**, clang 23.1.3, on a 60GB
x86_64 Linux box, against `examples/perry-native` — a stock `trails new`
scaffold plus one `trails g scaffold Trail name:string length:integer`.
Reproduce with `perry/run-ladder.sh`; setup is in [README.md](README.md).

Measured against **Perry 0.5.1520** (the published npm build) and re-verified
against **`main` @ `d74498b2` (0.5.1659)** built from source, clang 23.1.3 /
LLVM 22.1.8, on a 60GB x86_64 Linux box.

**Short answer: no. Three of the five walls are down — one of them by a patch
written here — and the one left standing is memory at application scale.**

Real trails framework code compiles and runs natively: a 54-module slice of
`@blazetrails/ruby-compat` gives a working 21MB executable, and with the 3c
fix a **362-module** activesupport subgraph — WebAssembly and all — compiles,
links and **runs** as a 69MB executable.

The application itself did not — and the reason first recorded here was wrong.
Node loads 1,283 modules to boot it, and Perry does exhaust a 32GB cap after
~50 minutes before codegen begins, but **not because of the module count**. The
cap goes in package _resolution_, to a `node_modules` symlink cycle. Remove the
cycle and the same app reaches `codegen: modules finished 1713/1713 (100%)`.
See [the correction](#correction-the-32gb-wall-is-resolution-not-module-count).

Status of each wall after re-verification:

| Wall                               | Status                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — codegen memory                 | 362 modules fit in 20GB. **Still the live blocker**, and the only one: the app's 32GB exhaustion was misattributed to it — see the correction. |
| 1b — resolver symlink cycle        | **Fixed upstream** — [PR 12895](https://github.com/PerryTS/perry/pull/12895) merged as `86ab1c0c8f` ([issue 12822](https://github.com/PerryTS/perry/issues/12822)). Unreleased. |
| 2 — WebAssembly cannot link        | **Gone** from source. An npm-distribution gap, not a capability limit.                                                               |
| 3a — `importedClass.prototype`     | **Fixed upstream**, unreleased.                                                                                                      |
| 3b — shape-mint abort              | Live. Triggered by compiling TypeScript _source_; avoidable by compiling the `dist` JS published packages ship.                      |
| 3c — init-time hang at 362 modules | **Fixed upstream** — our patch merged into Perry `main` as `39bea98d` ([PR 12588](https://github.com/PerryTS/perry/pull/12588)).     |

The rung table below was measured on the npm build, so its `MEM` and `RUNTIME`
rows are that build's behaviour; each wall's own section says what changed.

## The ladder

| Rung                                                              | Node | Perry       |                                                |
| ----------------------------------------------------------------- | ---- | ----------- | ---------------------------------------------- |
| `02-class` — classes, `#private` fields, accessors, static blocks | ok   | **ok**      | 2s, 17MB                                       |
| `03-proxy` — `Proxy` `get` trap + `methodMissing`                 | ok   | **ok**      | 2s, 17MB                                       |
| `04a-local-modules` — control: 2-module local graph, no package   | ok   | **ok**      | 17MB                                           |
| `04c-ruby-compat` — **real framework code**, foundation layer     | ok   | **ok**      | **54 modules, 21MB, correct output**           |
| `04d-ruby-compat-barrel` — the same function via the barrel       | ok   | **RUNTIME** | 139 modules, links at 40MB, crashes on startup |
| `04b-deep-import` — activesupport leaf, barrel bypassed           | ok   | **MEM**     | 364 modules                                    |
| `04-activesupport` — one named import from the barrel             | ok   | **MEM**     | 429 modules                                    |
| `05-model` — an `ActiveRecord` model class, no connection         | ok   | **MEM**     | killed at 12GB after 261s                      |
| `06-sqlite` — `better-sqlite3`                                    | ok   | **ok\***    | 8s, 30MB — shimmed, see below                  |
| `06b-crud` — one model, real connection, full CRUD                | ok   | **MEM**     | 891 modules; killed in codegen at 61/891       |
| `07-boot` — full framework boot                                   | ok   | **MEM**     | killed at 12GB after 689s                      |

Every rung runs correctly under Node, so no failure here is a broken program.
Rungs are listed by module count, which is the axis that matters.

## What works

perryts.com lists `Proxy` among the unsupported dynamic patterns. It is the
most load-bearing idiom in trails — 39 non-test source files construct one —
so it looked like the project-ending blocker. It is not: rung `03` compiles a
`get` trap with a `methodMissing` fallback and gets the right answer, including
for a property that exists only through the trap. Static blocks, `#private`
fields and accessor pairs survive too.

More to the point, `04c` takes **actual framework source** —
`ruby-compat/dist/regexp.js`, the Ruby-compatibility layer everything in trails
sits on — and produces a 21MB binary that prints the correct
`regexpEscape("a.b*c")`. The language subset is not the obstacle. Scale is.

## Wall 1: peak codegen memory

`04-activesupport` imports two functions, `camelize` and `underscore`, and
Perry collects **429 modules**: the barrel re-exports 145 names and there is no
tree-shake ahead of codegen. Uncapped it reached 27GB RSS, exhausted 15GB of
swap and had not finished after 11 minutes, which is why `run-ladder.sh` caps
Perry and why the cap is not optional.

Both obvious escapes were measured and **both fail**:

| Attempt                                                          | Result                    |
| ---------------------------------------------------------------- | ------------------------- |
| `MemoryMax=12G`, default 2x2 parallelism                         | killed at `420/429 (98%)` |
| `MemoryMax=20G`, default parallelism                             | killed at `252/429 (59%)` |
| `MemoryMax=24G`, `PERRY_MODULE_JOBS=1 PERRY_CODEGEN_UNIT_JOBS=1` | killed at `29%`           |

More headroom gave _less_ apparent progress, so the progress counter does not
measure nearness to success — peak memory is spent inside the oversized-module
LLVM phase, which it does not track. Serialising is worse, not better: one
module (`activesupport/src/core-ext/object/json.ts`, 333 lines) does not fit in
24GB as a single codegen unit, while parallel mode splits it and gets further.

The practical ceiling sits between **139 modules (links)** and **364 (does
not)**.

## Wall 2: WebAssembly — an npm-distribution problem, not a capability one

**Update (from-source Perry `main`): this wall is GONE.** With compiler,
runtime and `perry-wasm-host` all built from the same checkout and
`PERRY_WORKSPACE_ROOT` set, a 362-module activesupport subgraph that reaches
`libxml2-wasm` reports `Using wasmi WebAssembly host runtime` and **links** —
a 69MB executable. Nothing about WebAssembly is beyond Perry; the wall was
entirely that the npm package ships no `wasm-host` runtime and the commit it
was built from is not public. The account below is what that looked like from
the npm build, and is kept because anyone using the published Perry will hit
exactly it.

This is structural, and it took building Perry from source to establish how
deep it goes.

The trigger is `activesupport → xml-mini/nokogiri.ts → @blazetrails/nokogiri →
libxml2-wasm → WebAssembly`, and the first error is:

    Error: WebAssembly.* used but libperry_wasm_host.a not found.
    Build it with: cargo build --release -p perry-wasm-host

That archive is genuinely absent: `@perryts/perry-linux-x64` ships exactly four
static libs — `runtime`, `runtime_abort`, `stdlib`, `ui_gtk4`. `--enable-wasm-runtime`
does not help. So:

1.  **Built it.** Cloned `PerryTS/perry` at tag `v0.5.1520` and ran
    `cargo build --release -p perry-wasm-host` (small, wasmi only, 82s). The
    pinned toolchain is a dated nightly for a `-Z use-sync-unwind` flag that only
    refines unwind tables into a compact form, so stable Rust with
    `RUSTFLAGS="-C force-unwind-tables=yes -C force-frame-pointers=yes"` builds
    it fine. Supplying it via `PERRY_LIB_DIR` gets Perry to report
    `Using wasmi WebAssembly host runtime`.
2.  **Then the runtime is wrong.** Linking now fails on `undefined reference to
js_webassembly_instantiate` / `js_webassembly_module_new`. Those symbols live
    in `perry-runtime` built with its `wasm-host` feature, and the shipped
    `libperry_runtime.a` was not.
3.  **And the runtime cannot be rebuilt.** `PERRY_WORKSPACE_ROOT` makes Perry
    rebuild runtime+stdlib, which it then rejects:

        library build: v0.5.1520 (commit 381045a8735f)
        Perry build:   v0.5.1520 (source 85ccd72f8e53)

    The npm binary was built from commit `85ccd72f8e53`, which **is not in the
    public repository** (`git fetch` of it fails; tag `v0.5.1520` is a different
    commit). The compiler accepts no runtime from any other commit.

So an npm-installed Perry cannot link a WebAssembly-reaching graph at all, and
no configuration or local build closes the gap. Clearing it needs either a
runtime shipped with `wasm-host` enabled, or building the whole compiler from
source — which pins LLVM and is a much larger undertaking than it sounds.

### Why this is not a trails bug

`@blazetrails/nokogiri` is an **optional** peer dependency and activesupport
loads it the correct way — a lazy, guarded dynamic import with a real error
message if absent (`xml-mini/nokogiri.ts:46`). Under Node it never loads unless
you ask for the Nokogiri XML backend.

Perry const-folds the specifier and collects the target eagerly. Measured
directly:

| Import form                                | Modules collected |
| ------------------------------------------ | ----------------- |
| `import { x } from "./target.js"`          | 4                 |
| `await import(SPEC)` — const specifier     | **4, identical**  |
| `await import(spec)` — computed at runtime | 1                 |

And the one form that escapes collection is not a workaround — the binary says
so itself:

    Error [ERR_MODULE_NOT_FOUND]: dynamic import() of a runtime-computed path
    cannot run in an ahead-of-time compiled binary

Hiding an import does not defer its cost, it deletes the capability. **No
import-graph change in trails can reduce Perry's module count**, so do not make
a correctly-lazy dependency less lazy to suit it.

## Wall 3: two bugs deep, both Perry's, neither ours to fix

Reduced, diagnosed, and then verified against a from-source Perry. The
verification mattered: it overturned the first diagnosis twice.

### Bug 3a — `importedClassExpression.prototype` reads `undefined` (FIXED upstream)

Not an init-order bug, which is what this document first claimed.
`PERRY_DEBUG_INIT` and `perry compile -v` both show the order is correct
(`object.js` initialises before `include.js`). The crash was a wrong property
read, reduced to six lines of plain JavaScript in
[upstream/](upstream/ISSUE.md):

    // a.js
    export const K = class {};
    export class D {}
    // b.js
    typeof K.prototype      // node: object | perry 0.5.1520: undefined
    typeof alias.prototype  // node: object | perry 0.5.1520: object
    typeof D.prototype      // node: object | perry 0.5.1520: object

Three conditions are each necessary: a class _expression_, read _directly_ on
the import binding, _across_ a module boundary. It is exactly `rbDefineClass`'s
shape.

**Already fixed on Perry `main`.** Built from source at `d74498b2` (0.5.1659):
the reproducer passes. Confirmed side by side in one shell — npm 0.5.1520 says
`undefined`, source 0.5.1659 says `object`. So nothing to file and nothing to
patch; what is missing is a _release_. `perry update --check-only` still
answers "up to date (v0.5.1520)" (published 2026-09-11).

That fix is real and it moves us: the 58-module `include.js` rung, which
crashed under the npm build, now compiles **and runs correctly** from source.

### Bug 3b — `static ShapeId refused by the shape mint` (live, narrowed)

With 3a fixed, the 137-module barrel rung gets further and aborts at startup
on Perry's own invariant check:

    Perry internal error: the static ShapeId 0x80000631 (proto 0x400000000000000c)
    was refused by the shape mint (it is outside the static band or already names
    other facts in this agent); a static id must name one shape

Narrowed to a single construct — the write-up is
[upstream/SHAPE-MINT.md](upstream/SHAPE-MINT.md):

| `ruby-compat/src/include.ts:175`                                 | Result         |
| ---------------------------------------------------------------- | -------------- |
| `export class Module<I extends object = Record<never, never>> {` | **aborts**     |
| `export class Module {`                                          | runs correctly |

The trigger is compiling the package's **TypeScript source**. The `tsc` output
of the same class, which ruby-compat ships in `dist/`, never aborts — and
Perry prefers `src/` over `dist/` on its own, which is what selects the
failing path. Importing `dist/index.js` by relative path compiles and runs at
the same 137 modules.

It does **not** reduce to a small synthetic program: a bare
`export class Box<I extends object = Record<never, never>> {}` is fine, as are
variants with a constructor parameter, a getter, no default type argument, or
a plain `<T>`. That is consistent with the error rather than a dead end —
these static ids are compiler-assigned _by content_, so a collision needs a
populated shape space that a two-module program has not got.

Current state on `main` (0.5.1659) by graph size:

| Rung                           | Modules | Result                               |
| ------------------------------ | ------- | ------------------------------------ |
| `04c-ruby-compat`              | 54      | compiles, runs correctly             |
| `inc-only` (deep `include.js`) | 58      | **now** runs correctly (3a fixed it) |
| `04d-ruby-compat-barrel`       | 137     | aborts on the shape mint             |

### Reproducing any of this needs a from-source Perry

Verifying 3a and finding 3b both required building the compiler. Recorded
because it is not obvious:

- `brew install llvm@22` — Perry links LLVM **22** statically
  (`LLVM_SYS_221_PREFIX`); the 23 that `brew install llvm` gives is the wrong
  one. `brew install libffi` too, or the final link fails on `-lffi`, and
  `cmake` for `perry-stdlib`.
- The pinned toolchain is a dated nightly. For the whole compiler use it; the
  small `perry-wasm-host` crate alone builds on stable with
  `RUSTFLAGS="-C force-unwind-tables=yes -C force-frame-pointers=yes"`,
  because the pinned `-Z use-sync-unwind` only compacts unwind tables.
- `cargo build --release -p perry -p perry-runtime-static`, then point
  `PERRY_WORKSPACE_ROOT` at the checkout so runtime and stdlib are rebuilt to
  match. Version skew is refused outright: the compiler compares its own source
  commit against the archive's.

### Bug 3c — module namespace objects have a non-null prototype (minimized)

With Wall 2 cleared and 3b side-stepped (that probe imports `dist` JS, not
TypeScript source), the largest graph yet **compiles and links**: 362 modules,
69MB, inside a 20GB cap. It then never starts — it spins at ~100% of one core
with no output.

Minimized to two files of plain JavaScript and no trails code at all —
[upstream/namespace-prototype/](upstream/namespace-prototype/ISSUE.md):

    // mod.js
    export function a() {}
    // probe.js
    import * as Mod from "./mod.js";
    Object.getPrototypeOf(Mod)   // node: null | perry: [object Module]

ECMA-262 gives module namespace exotic objects a `[[Prototype]]` of `null`, so
a prototype-chain walk over an `import * as X` binding terminates after one
step. Under Perry it never terminates: every `getPrototypeOf` returns a
further non-null `[object Module]`, and the chain is unbounded rather than
cyclic (`getPrototypeOf(Mod) !== Mod`).

**Any code that walks an object's prototype chain hangs when handed a module
namespace.** That is exactly what the trails graph does.
`PERRY_DEBUG_INIT=1` placed the stall at
`activesupport/dist/namespaces.js`, whose top-level code is

    import * as Autoload from "./dependencies/autoload.js";
    extend(ActiveSupport, Autoload);

`extend` is ruby-compat's Ruby `Object#extend`, which traverses the prototype
chain of the module handed to it. Node finishes instantly; Perry does not
finish.

The reduction ran 362-module app → `namespaces.js` → `extend(target,
namespace)` (59 modules) → two files, zero dependencies.

**A fix is written, and it is now merged upstream** (Perry `main` `39bea98d`,
[PR 12588](https://github.com/PerryTS/perry/pull/12588), merged verbatim) — [upstream/namespace-prototype/fix.patch](upstream/namespace-prototype/fix.patch),
12 added lines in `js_finalize_namespace`, the one chokepoint both namespace
paths pass through. It marks the namespace `OBJ_FLAG_NULL_PROTO`, which is
already the proof `Object.getPrototypeOf` reads to answer `null`; no other
change was needed. With it, built from source at `main` `d74498b2`:

| Case                                       | Before                        | After                                 |
| ------------------------------------------ | ----------------------------- | ------------------------------------- |
| the 2-file reproducer                      | never terminates              | **1 step, `null`, identical to Node** |
| `extend(target, namespace)`, 59 modules    | hangs                         | **runs**                              |
| `activesupport/namespaces.js`, 359 modules | hangs                         | **runs**                              |
| the 362-module WebAssembly probe           | hangs at 172/362 initializers | **runs**                              |
| 54-module `ruby-compat` rung (control)     | ran                           | **still runs**                        |

No regressions: `cargo test -p perry-runtime` serially, patched vs pristine,
gives identical results on the `namespace`, `prototype` and `shape` filters
(29/0, 244/1, 557/4), and every failure is a pre-existing
`object::shape_store::tests::function_*` unrelated to namespaces.

## The full application: 1,283 modules, and it does not compile

Tested 2026-10-12 with the from-source Perry carrying the 3c fix, against a
**dist-only** install of this app — the shape a real trails app has, built by
[dist-tree.sh](dist-tree.sh) and verified booting under Node first
(`[07] booted env=development routes=4`). Dist-only matters: it is what
published trails packages ship, and it side-steps 3b, which only fires when
Perry compiles a package's TypeScript `src/`.

Node loads **1,283 modules** to boot the app. Perry never got past collecting
them:

|                |                                                   |
| -------------- | ------------------------------------------------- |
| cap            | `MemoryMax=32G`, swap off                         |
| outcome        | killed at the cap after ~50 minutes               |
| stage reached  | **`Collecting modules…`** — codegen never started |
| RSS trajectory | 11GB @ 20min → 16.6 @ 30 → 22.2 @ 39 → 27.8 @ 49  |

At the time this was read as Wall 1 returning at application scale, in a worse
place than before — 32GB spent in module _collection_, single-threaded, with
none of the parallelism knobs codegen offers. **That reading was wrong, and the
next section retracts it.**

### Correction: the 32GB wall is resolution, not module count

Retracted 2026-10-18, superseding the paragraph above and the two claims
earlier in this file. Recorded in full in tasks RFC 0192.

The cap is exhausted in package **resolution**, before the first module is
collected. In a pnpm workspace each `node_modules/@blazetrails/<pkg>/node_modules/@blazetrails`
is a symlink back to `node_modules/@blazetrails`, so the resolver walks the
scope into itself without bound: 6.5M `openat` calls and paths up to ~1,800
characters. `Collecting modules…` is simply the stage label on screen while
that happens.

Delete the 19 back-pointing scope symlinks and the same application collects
**1,713 modules** and reaches `codegen: modules finished 1713/1713 (100%)`. So
module count was never the blocker, and the 3.5x-the-362-module-subgraph
framing below it was measuring the wrong thing.

This is a Perry resolver bug and it affects any pnpm workspace, not just this
one. **Filed and fixed upstream**: [issue 12822](https://github.com/PerryTS/perry/issues/12822)
(reported independently by @lws2004 a day before our own duplicate, closed as
[12893](https://github.com/PerryTS/perry/issues/12893)), fixed by
[PR 12895](https://github.com/PerryTS/perry/pull/12895), merged into Perry
`main` as `86ab1c0c8f`.

`collect_packages_in_node_modules` recursed into every nested `node_modules`
with no visited set and never canonicalized the symlinked spelling, so a cycle
re-entered the same physical directory forever. The fix threads a set of
canonical paths through the recursion. A two-package reproducer is enough when
the back-pointer is the scope *directory*, which is the shape pnpm produces:
before the fix it issued 73,578 `openat` calls in 25s and never terminated;
after it, the same tree resolves in under a second.

So this wall is gone at source, but not yet in a release — npm `latest` is
still 0.5.1520 (2026-09-11). Until a release carries `86ab1c0c8f`, reproducing
the full-app collection needs either a from-source Perry or the symlink
deletion above.

## The SQLite result is weaker than it looks

Rung `06` is green, but at `-vv`:

    note: serving `better-sqlite3` from the bundled native binding
    `perry-ext-better-sqlite3` (a partial drop-in), ignoring your installed
    `node_modules/better-sqlite3`

Perry substitutes its own partial reimplementation — which is also why this
rung finds 1 module and is the only package-importing rung that passes. All
five substitutions are load-bearing for trails:

| Shimmed package  | What trails uses it for                              |
| ---------------- | ---------------------------------------------------- |
| `better-sqlite3` | the SQLite adapter — the scaffold's default database |
| `pg`             | the PostgreSQL adapter                               |
| `mysql2`         | the MySQL adapter                                    |
| `commander`      | the `trails` CLI's argument parsing                  |
| `dayjs`          | `@blazetrails/date`                                  |

A native build replaces **all three database adapters**, the CLI's parser and
the date library with partial drop-ins, silently. A green compile says nothing
about whether any of them behaves as ActiveRecord expects.

## CRUD never ran natively, and the reason is not the adapter

Asked 2026-10-18. `06-sqlite` passing is not evidence that ActiveRecord works
over Perry's SQLite drop-in: that rung drives `better-sqlite3` directly, in a
one-module binary, with no framework in it. `06b-crud` asks the real question —
`create`, `find`, `update`, `destroy` on a model, over a connection the adapter
opened — and the answer is that it cannot be compiled.

| Attempt            | Collected | Codegen reached | Outcome                 |
| ------------------ | --------- | --------------- | ----------------------- |
| `MemoryMax=12G`    | 891       | 44/891 (5%)     | killed after 157s       |
| `MemoryMax=28G`    | 891       | 61/891 (7%)     | killed after 243s       |

Three things that result does establish:

- **Collection is not this rung's wall.** All 891 modules collect, with the
  `node_modules` symlink cycle fully intact. The cycle stops the *whole app* in
  resolution; a single-model rung never reaches it. Two different walls, and
  both print plausible-looking progress before dying.
- **2.3x the memory cap bought 17 more modules.** That is item 5 above
  confirmed rather than re-opened, so the knobs were not pursued further.
- **Adapter parity remains untested, and is still the open question.** Perry
  reports serving *both* `better-sqlite3` and `mysql2` from bundled partial
  drop-ins for this rung. If the rung ever links, the CRUD it performs runs
  against `perry-ext-better-sqlite3`, which is exactly the comparison wanted —
  prepared-statement semantics, type coercion, `lastInsertRowid`, transactions.
  Nothing here has compared them yet.

Two incidental findings from the same logs, neither chased:

- ActiveRecord trips a Perry type-constraint check: `Constraint violation in
  function 'inQueryConnection': TypeMismatch { type_param: "F", ... }`. It is a
  warning, not a failure, and the compile continued past it.
- The 891 modules include `libxml2-wasm`, `libsql`, `mysql2`, `pg` and the
  Temporal polyfill, reached through the `activerecord` barrel — so the rung
  pays for four database drivers to use one. That is the same barrel-breadth
  problem RFC 0192 measures on the Node side, showing up as codegen cost.

The caps are also not reproducible against a fixed compiler: npm
`@perryts/perry` is still 0.5.1520 (2026-09-11), which predates both the 3a
prototype fix and the merged 3c namespace fix, so these numbers come from a
build with two known bugs in it. They bound the memory question, not the
correctness one.

## `perry check` is not evidence

It passes on the full application entry point with `--check-deps --deep-deps`,
including on rungs that cannot compile, and says why itself:

    [OK] Parsing, HIR lowering, and dependency checks passed
         (codegen not verified — run `perry compile` for end-to-end validation)

Treat only `perry compile` — and then running the binary — as a result.

## If someone picks this up

1. **3c is done.** The fix from this work is merged into Perry `main` as
   `39bea98d` ([PR 12588](https://github.com/PerryTS/perry/pull/12588),
   [issue 12587](https://github.com/PerryTS/perry/issues/12587) closed), and
   re-verified against a pristine upstream build. It will reach us in the next
   Perry release; until then a from-source build carries it.
2. **Do not file Wall 3a — already fixed on `main`, just unreleased.** Verified
   by building the compiler from source. What would help is asking the Perry
   project to cut a release past 0.5.1520 (2026-09-11); until then a
   from-source build is the only way to get it.
3. **Wall 3b, the shape mint, is the live one.** Deterministic, and it is
   Perry's own invariant check firing rather than a misuse. Reproducible with
   `04d-ruby-compat-barrel` against a from-source `main`. Minimize it before
   filing, the way 3a was cut to six lines — a 137-module reproducer that needs
   a trails checkout is not something a compiler maintainer can act on.
4. **Ask Perry for a `wasm-host`-enabled runtime in the npm package** (Wall 2).
   Until then any graph reaching `libxml2-wasm` is unlinkable. The second half
   of this item — whether eager collection of a const-folded dynamic `import()`
   is intended — has since been **answered by measurement**: Perry collects a
   constant `await import()` exactly as it collects a static import (4 modules
   against 4), and only a runtime-computed specifier escapes collection (1).
   Deferral is a runtime property; collection is static. So a lazy import table
   defers for Node and changes nothing for Perry.
5. **Do not spend more time on the memory knobs.** Serial is worse and a bigger
   cap is not better; both measured above.
6. **Do not trust a green rung that imports a shimmed package** until
   `perry.compilePackages` has compiled the real one and that adapter's own
   tests have run against it.
7. **ruby-compat's circular imports are worth a look on their own.** Six
   circular groups covering 40 module files, the largest a 29-module strongly
   connected component (Tarjan over relative value imports; `src` and `dist`
   agree). An earlier count of 28 here was superseded by that measurement. They are
   not the cause of any Perry failure here, but circular value imports in the
   foundation layer are a genuine code-quality question and they pair with the
   module graph measured in [runtime-graph.md](runtime-graph.md).
8. **The resolver symlink cycle is fixed upstream — do not re-diagnose it.**
   See the correction above: issue 12822, PR 12895, merged as `86ab1c0c8f`.
   Unreleased as of 2026-10-19, so a published Perry still hits it.
9. **Wall 3b, the shape mint, is now the only live bug with a reproducer and
   no filing.** Narrowed in [upstream/SHAPE-MINT.md](upstream/SHAPE-MINT.md)
   and re-verified on from-source `main` (0.5.1662); still unfiled.
10. **Nothing here asks trails to change for Perry's sake.** Every wall is
   Perry's and no change in this repo moves them.
