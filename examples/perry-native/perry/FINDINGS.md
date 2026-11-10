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

| Wall                                       | Status                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — codegen memory                         | **Gone** on `main` @ `e284a293`. Every rung to 1133 modules completes codegen inside 20GB; peak grows ~8 MiB/module, nothing superlinear. See [below](#wall-1-is-gone-the-compiler-now-sees-the-cap).                                                                                   |
| 1b — resolver symlink cycle                | **Fixed upstream** — [PR 12895](https://github.com/PerryTS/perry/pull/12895) merged as `86ab1c0c8f` ([issue 12822](https://github.com/PerryTS/perry/issues/12822)). Unreleased.                                                                                                         |
| 2 — WebAssembly cannot link                | **Gone** from source. An npm-distribution gap, not a capability limit.                                                                                                                                                                                                                  |
| 3a — `importedClass.prototype`             | **Fixed upstream**, unreleased.                                                                                                                                                                                                                                                         |
| 3b — shape-mint abort                      | **Gone** on `main` @ `20fde48d`. Re-verified 2026-10-20: 04d compiles, links and starts. Never filed; nothing to file.                                                                                                                                                                  |
| 3c — init-time hang at 362 modules         | **Fixed upstream** — our patch merged into Perry `main` as `39bea98d` ([PR 12588](https://github.com/PerryTS/perry/pull/12588)).                                                                                                                                                        |
| 4 — TDZ check ate a spread call's receiver | **Fixed upstream** — our patch merged as [PR 12990](https://github.com/PerryTS/perry/pull/12990) (`ccad647e7a`). Unreleased.                                                                                                                                                            |
| 5 — parentless class got a live `super`    | **Fixed upstream** — our patch merged as [PR 13001](https://github.com/PerryTS/perry/pull/13001) (`71a8beb530`), closing [issue 12889](https://github.com/PerryTS/perry/issues/12889). Unreleased.                                                                                      |
| 6 — namespace kind lost over a named hop   | **Fixed by us** — [PR 13091](https://github.com/PerryTS/perry/pull/13091), **merged** `22ad61bd`. Blocked the link of every rung above 429 modules.                                                                                                                                     |
| 7 — static ShapeId refused                 | **Open, pre-existing** — 04-activesupport (429). A/B-confirmed against an unpatched build of the same commit. Not filed yet.                                                                                                                                                            |
| 8 — `defineMethod is not a function`       | **Fixed** — an explicit import lost its class id to a same-named class reached transitively, because codegen binds the name in two maps with opposite tie-breaks. 3-file reproducer. Fix committed on `fix-import-name-collision` @ `43edf8e5`; not pushed or filed. Unblocks 05-model. |

The rung table below was measured on the npm build, so its `MEM` and `RUNTIME`
rows are that build's behaviour; each wall's own section says what changed.

## The ladder

| Rung                                                              | Node | Perry       |                                                                  |
| ----------------------------------------------------------------- | ---- | ----------- | ---------------------------------------------------------------- |
| `02-class` — classes, `#private` fields, accessors, static blocks | ok   | **ok**      | 2s, 17MB                                                         |
| `03-proxy` — `Proxy` `get` trap + `methodMissing`                 | ok   | **ok**      | 2s, 17MB                                                         |
| `04a-local-modules` — control: 2-module local graph, no package   | ok   | **ok**      | 17MB                                                             |
| `04c-ruby-compat` — **real framework code**, foundation layer     | ok   | **ok**      | **54 modules, 21MB, correct output**                             |
| `04d-ruby-compat-barrel` — the same function via the barrel       | ok   | **RUNTIME** | 139 modules, links at 40MB, crashes on startup                   |
| `04b-deep-import` — activesupport leaf, barrel bypassed           | ok   | **MEM**     | 364 modules                                                      |
| `04-activesupport` — one named import from the barrel             | ok   | **MEM**     | 429 modules                                                      |
| `05-model` — an `ActiveRecord` model class, no connection         | ok   | **MEM**     | killed at 12GB after 261s                                        |
| `06-sqlite` — `better-sqlite3`                                    | ok   | **ok\***    | 8s, 30MB — shimmed, see below                                    |
| `06b-crud` — one model, real connection, full CRUD                | ok   | **MEM**     | 891 modules; killed in codegen at 61/891                         |
| `06d-adapter-read` — adapter reads rows, no model layer           | ok   | _not run_   | 1133 modules; walls 8+10+11 fixed, wall 9 open                   |
| `07-boot` — full framework boot                                   | ok   | **MEM**     | killed at 12GB after 689s                                        |
| `08-serve` — `trails server`'s own production path, serving `/up` | ok   | **RUNTIME** | **compiles** in 1065s, 1620 modules, 171MB — throws in `include` |

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
the back-pointer is the scope _directory_, which is the shape pnpm produces:
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

| Attempt         | Collected | Codegen reached | Outcome           |
| --------------- | --------- | --------------- | ----------------- |
| `MemoryMax=12G` | 891       | 44/891 (5%)     | killed after 157s |
| `MemoryMax=28G` | 891       | 61/891 (7%)     | killed after 243s |

Three things that result does establish:

- **Collection is not this rung's wall.** All 891 modules collect, with the
  `node_modules` symlink cycle fully intact. The cycle stops the _whole app_ in
  resolution; a single-model rung never reaches it. Two different walls, and
  both print plausible-looking progress before dying.
- **2.3x the memory cap bought 17 more modules.** That is item 5 above
  confirmed rather than re-opened, so the knobs were not pursued further.
- **Adapter parity remains untested, and is still the open question.** Perry
  reports serving _both_ `better-sqlite3` and `mysql2` from bundled partial
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
9. **Wall 3b, the shape mint, fixed itself — and that is the lesson.**
   Re-verified 2026-10-20 against `main` @ `20fde48d`: `04d-ruby-compat-barrel`
   compiles, links and reaches startup, with no `static ShapeId refused`. The
   abort path still exists (`shapes.rs:2058`) but the guard now carries a
   `semantic_generation >> 32 == 0x8000_0000` carve-out for "a declared
   holder's stable identity". `shapes.rs` was rewritten the week of
   2026-10-14 ("object model step 5"). It was never filed, and it is now
   unfileable — a week of upstream churn closed it.
   **Do not report a Perry runtime bug without first rebuilding current
   `main`.** The write-up in [upstream/SHAPE-MINT.md](upstream/SHAPE-MINT.md)
   is kept only as the record of a bug that was real at 0.5.1659.
10. **Nothing here asks trails to change for Perry's sake.** Every wall is
    Perry's and no change in this repo moves them.

## Dropping the model layer is not a smaller graph

`06d-adapter-read` is the narrowest useful ActiveRecord program: it constructs
`BetterSQLite3Adapter` directly and reads rows with `execute`, `selectRows` and
`selectValue`. No `Base`, no model class, no `Relation`, no scoping, no
delegation, no connection pool. Under Node it is green:

```
[06d] rows=[["Saddle",8],["Ridge",12]] count=2
```

It collects **1133 modules, against 1146 for the full model CRUD of `06b`** —
dropping the entire model layer saves 13 modules, about 1%. Where those 1133
live:

| Package       | Modules |
| ------------- | ------- |
| activerecord  | 316     |
| activesupport | 175     |
| ruby-compat   | 147     |
| arel          | 84      |
| mysql2        | 83      |
| activemodel   | 73      |
| yaml          | 72      |
| iconv-lite    | 22      |
| i18n          | 19      |
| pg            | 19      |
| msgpack       | 14      |
| libxml2-wasm  | 14      |
| @msgpack      | 12      |
| globalid      | 10      |

Two things follow. The foundation — activesupport, ruby-compat, arel and
activemodel, **479 modules** — arrives with any ActiveRecord entry point at all,
so narrowing the API surface cannot shrink it. And a sqlite-only read still
pays for **83 mysql2 modules, 19 pg, 72 yaml and 14 libxml2-wasm**: 188 modules
of drivers and serializers the program never calls, pulled in by the
constant-specifier `loadPath` table (see the dynamic-import measurement above).

The codegen attempt was **not run**, deliberately. The ladder already brackets
the ceiling: `04d-ruby-compat-barrel` links at 139 modules, `04b-deep-import`
dies at 364 and `04-activesupport` at 429. Every ActiveRecord entry point is
3x past the smallest known failure, so a 28GB, four-minute confirmation would
buy no information that the three cheaper rungs do not already give.

**The conclusion for the prototype**: there is no "just load some data"
shortcut. Wall 1 is per-module codegen cost in the foundation layer, and the
foundation is not optional. Three narrowing attempts have now failed in three
different ways — full CRUD (1146 modules), barrel bypass (not a valid program
at all, `Class extends value undefined`), and adapter-only (1133). The open
question is where between 139 and 364 modules the ceiling actually sits, and
that is a Perry-internal threshold to bisect against a synthetic graph, not
something a different trails entry point can route around.

## 04d: the barrel rung boots on unmodified source, after two Perry bugs (both fixed upstream)

With wall 3b gone (above), `04d-ruby-compat-barrel` compiles, links and
reaches startup on `main` @ `20fde48d`, then fails at runtime:

    TypeError: Cannot convert undefined or null to object
        at registerProcessAdapter (<anonymous>)
        at tryAutoRegisterNode (<anonymous>)

**Diagnosed and fixed upstream: [PR 12990](https://github.com/PerryTS/perry/pull/12990),
merged as `ccad647e7a`.** It was not our code's fault. `lift_check`
(`perry-hir/src/lower/module_tdz.rs`) hoists a TDZ check out past the access
that reads a guarded binding — `(check, x).p` becomes `(check, x.p)` — to keep
the access in the shape later passes recognize. It handled `Expr::Call` but
omitted `Expr::CallSpread`, so a spread call kept the check inside its callee:

    CallSpread { callee: Sequence([check, PropertyGet { property: "push" }]), .. }

A `Sequence` evaluates to its last value, so the callee stopped being a member
expression, codegen's member-aware arms in `expr/call_spread.rs` stopped
matching, the call fell through to the closure path with no receiver, and
`array_proto_mutator` threw on `this === undefined`. The runtime guard it hit
is the receiver-less thunk check from #6908, which is correct — the HIR handed
it a receiver that did exist. Hence `arr.push(x)` working while
`arr.push(...xs)` threw, on the same array. The fix is one line, plus a
regression test verified to fail without it.

**This also corrects item 7 below.** The import cycles are implicated after
all — not as a direct cause, but because a cycle is what forces a module-level
binding's TDZ check to survive to runtime, which is the precondition for this
bug. That is also why no synthetic program reproduced it. `registerProcessAdapter`
(`ruby-compat/src/process-adapter.ts:428`) has exactly two calls that can
raise it — `Object.keys(envInternal)` and `Object.entries(envSnapshot)` — so
one of those receives undefined.

Four plausible causes were ruled out before the HIR dump located it. Each was
tested as a synthetic program compiled by the same from-source Perry, against
Node as the control, and Perry matched Node in all four — which is what
eventually forced the move from guessing to `perry compile --print-hir`:

| Hypothesis                                                                                             | Probe                                                               | Result                                                                                  |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Object.create(null)` breaks `Object.keys`/`entries`                                                   | null-prototype object, both calls                                   | **matches Node**                                                                        |
| Perry's `process` is incomplete, so `envSnapshot` is undefined                                         | `process.env`/`argv`/`versions` shape                               | **matches Node** — 64 env keys, argv array, `versions.node=22.0.0`                      |
| `() => ({ ...x })` — a concise arrow body whose object literal holds only a spread — returns undefined | 5 arrow/spread forms, incl. one built in a closure over a parameter | **matches Node**                                                                        |
| Perry does not enforce TDZ, so an uninitialized `const` reads as undefined instead of throwing         | same-module, and a true cross-module import cycle                   | **matches Node** — both raise `ReferenceError: Cannot access 'x' before initialization` |

The last one is worth keeping in mind: Perry enforces temporal dead zones
correctly, across an import cycle, which removes the most attractive
explanation for a foundation-layer initialization failure.

What found it: instrumenting `registerProcessAdapter` statement by statement.
Every value was a valid non-null object or array (`Object.keys` returned 0,
`Object.entries` 64) and the throw landed on `argvInternal.push(...argvSnapshot)`
— a valid array receiver and a valid array argument. `--print-hir` then showed
the `Sequence`-wrapped callee, and the adjacent `PutValueSet` in the same
function threading an explicit `receiver` field made the asymmetry obvious.

### The second bug: a parentless class got a live `super`

**Diagnosed and fixed upstream: [PR 13001](https://github.com/PerryTS/perry/pull/13001),
merged as `71a8beb530`, closing [issue 12889](https://github.com/PerryTS/perry/issues/12889).**

With 12990 applied, 04d got past `registerProcessAdapter` and failed at

    TypeError: Super constructor is not a constructor
        at new RFC3986Parser

on a class with **zero** occurrences of `extends` or `super` in its file
(`ruby-compat/src/uri/rfc3986-parser.ts:116`), constructed as an eager
module-level singleton at `uri/common.ts:13`.

The cause is `requires_live` in `perry-codegen/src/expr/super_constructor.rs`:
it consulted `ctx.imported_class_ctors` **by bare class name** before
establishing that the class is derived at all. `imported_class_ctors` is keyed
by name, not by module, so a type-only import cycle registers an entry under a
name the module itself declares — and a parentless class was then lowered with
live heritage. Here `uri/generic.ts:4` has `import type { RFC3986Parser }` and
`rfc3986-parser.ts:5` has a value import of `./generic.js`, completing the
cycle. The fix returns `false` early when all four heritage slots
(`extends_name`, `extends_expr`, `extends`, `native_extends`) are empty, plus a
regression test verified to fail without it.

It needs both a cycle and a class as the type-only target; inline
`import { type X }` fails identically. Four reductions had failed to reproduce
it before that was understood — a 3-key and a 9-key object literal in a class
field initializer, a plain base class with initializers, and a class
constructed across a value-only import cycle.

Two `perry-hir` tests red in this area on `main` at the time
(`class_member_var_captures::sibling_same_named_class_bindings_construct_their_own_class`,
`issue_11298_class_expr_evaluation_identity::native_module_parent_keeps_the_shared_template`)
turned out to be unrelated; confirmed pre-existing by reverting our fix on the
same base.

### The rung boots on unmodified trails source

With 12990 and 13001 both on `main`, `04d-ruby-compat-barrel` compiles, links
and runs natively against **completely unmodified trails source** — `[04d]
a\.b\*c`, matching Node, at 137 modules. It is the first barrel rung ever to
boot. Both earlier workarounds (the `for`-loop in place of `push(...spread)`,
and moving the `regexp` field initializer into an explicit constructor) are
reverted and **not committed**: each existed only to route around a compiler
defect that is now fixed.

**The lesson, again:** two of the three walls that stopped this rung were
compiler bugs, and the diagnostic that found both was
`perry compile --print-hir` — not reasoning about guards, and not synthetic
reductions, which matched Node in eight of eight attempts across the two bugs.
Instrument, do not infer.

## Wall 1 is gone: the compiler now sees the cap

Re-measured 2026-10-22 on `main` @ `e284a293`, built from source, every rung
under `systemd-run MemoryMax=20G`, peak read from the scope's cgroup
`memory.peak` so it counts `perry` **and** the `clang` children:

| Rung                 | Modules | Before           | Peak now | Now                                       |
| -------------------- | ------- | ---------------- | -------- | ----------------------------------------- |
| 04c-ruby-compat      | 54      | ok               | 0.54 GiB | ok, correct output                        |
| 04d-ruby-compat-barr | 139     | ok (after 2 fix) | 1.58 GiB | ok, correct output                        |
| 04b-deep-import      | 364     | **MEM**          | 3.37 GiB | **ok, correct**                           |
| 04-activesupport     | 429     | **MEM**          | 3.76 GiB | links; wall 7                             |
| 05-model             | ~700    | **MEM** (12GB)   | 8.14 GiB | runs; `[05] Trail function`               |
| 06b-crud             | 891     | **MEM** @ 61/891 | 8.63 GiB | wall 8 cleared; now `establishConnection` |
| 06d-adapter-read     | 1133    | never run        | 8.91 GiB | walls 8+10+11 cleared; wall 9 open        |
| 07-boot              | 1731    | never run        | **MEM**  | OOM @ 12 GiB in whole-program facts       |
| 08-serve             | 1731    | never run        | **MEM**  | same graph, same OOM; node control 200 OK |

**Nothing fails to compile any more below 06d.** 07 and 08 do fail, and not
for a reason the per-module curve predicts: see "Wall 14" below — they are the
first rungs whose graph reaches the CLI, and the CLI reaches vite, rollup and
playwright. Peak is linear at roughly 8 MiB per
module, and parallelism is nearly free: 04b costs 2.87 GiB serial and 3.37 GiB
across 12 module jobs, while taking 703s versus 116s. `PERRY_MODULE_JOBS=1` is
no longer a lever worth pulling.

What changed upstream is `CodegenBudget` (`perry-codegen/src/workers.rs`):
every module job and LLVM unit worker is charged an estimated peak
(320 MiB + 500 B/source-byte + 512 KiB/callable) against a budget sized from
`MemAvailable` **and cgroup v2 headroom**, capped at 3/4 of it, largest module
first. Our harness caps with `systemd-run MemoryMax`, which _is_ that cgroup, so
the compiler now throttles against the limit it used to overrun:

    [perry] codegen: budget: 12 CPU slots (physical cores; 24 hardware threads
    available), 15.0 GiB memory (MemAvailable 42.4 GiB, cgroup headroom
    20.0 GiB); up to 12 module jobs, largest first

The original wall-1 measurement was taken against a compiler that could not see
the cap. **That is the same lesson as wall 3b, now twice: re-measure on current
`main` before reporting a Perry limit.** Knobs worth knowing:
`PERRY_MODULE_JOBS`, `PERRY_CODEGEN_UNIT_JOBS`, `PERRY_CODEGEN_CPU_SLOTS`,
`PERRY_CODEGEN_MEMORY_MB`, and `PERRY_CODEGEN_MEMORY_TRACE=1` for measured
per-module peaks.

`07-boot` is **not** a memory result: it was terminated at 1058s with
`vite/dist/node/chunks/config.js` and `playwright-core/lib/coreBundle.js` still
in LLVM codegen at 9.5 min each. That is the per-function `-O0` superlinearity
of [5391](https://github.com/PerryTS/perry/issues/5391) inside a minified
bundle, plus dev dependencies in the graph — a separate story from framework
code.

Measurement scripts live in the scratchpad (`peak.sh`, `mem-curve.sh`). Two
false starts worth not repeating: `clang` must be on `PATH` or every module
"fails" at 0.17 GiB with _no clang was found_, and `ru_maxrss` would miss the
`clang` children entirely.

## Wall 6: a namespace lost its kind over a named re-export hop

With memory gone, the blocker became a link error, the same symbol on every
rung from 429 modules up:

    undefined reference to `__perry_wrap_perry_fn_packages_activesupport_src_i18n_ts__I18n$info'

**Diagnosed and fixed: [PR 13091](https://github.com/PerryTS/perry/pull/13091).**
The namespace scan in `run_pipeline.rs` follows `export { X } from "m"` and
`export *` barrels, but not `import { X } from "m"; export { X }`, which lowers
to an Import plus `Export::Named`. With that hop between a consumer and an
`Export::NamespaceReExport` origin the scan stops one module short, the local
never enters `namespace_imports`, and `I18n.translate(...)` lowers to
`js_closure_alloc_singleton` over the binding plus `js_method_lookup` — but a
namespace has no value wrapper, only one
`__perry_namespace_value_<prefix>__<ns>:<member>` per member.

Here `activesupport/src/i18n.ts` is `import * as I18n from "@blazetrails/i18n";
export { I18n }` and `activemodel/src/i18n.ts` forwards it by name, which is why
activemodel's module defines all three wrapper symbols and links while
activesupport's defines none. [11275](https://github.com/PerryTS/perry/issues/11275)
fixed kind-preservation for the other two hops; this was the third.

Reduced to four dependency-free files, where the trigger is specifically a
`const` export aliasing a local function (`export const t = translate`);
`export function t(…)` and `export const t = 42` both link.

**How it was found, and what wasted time.** Six synthetic reductions matched
Node before one failed — the same ratio as walls 4 and 5. What worked was
`nm` over the object cache (six objects referencing the symbol, none defining
it), then `PERRY_LLVM_KEEP_IR=1` for both sides of the ABI mismatch, then an
instrumented compiler printing `hir.exports` per module, which showed the two
spellings of one source shape:

    packages_activesupport_src_i18n_ts  exports=[NamespaceReExport { source: "@blazetrails/i18n", name: "I18n" }]
    packages_activemodel_src_i18n_ts    exports=[Named { local: "I18n", exported: "I18n" }]

Two corrections to things stated along the way: the module _is_ compiled (an
earlier grep for `perry_fn_…__<name>` symbols found none and I read that as
absent), and the "bare namespace value" symbol does not exist — every one
carries a `:member` suffix that my regex had truncated at the `.`.

## Walls 7 and 8: what stands past the link

- **Wall 7 — `Perry internal error: the static ShapeId 0x800017d1 (proto
0x4000000000000483) was refused`**, on 04-activesupport (429 modules).
  **Pre-existing**, not ours: an unpatched build of the same commit produces the
  identical ShapeId. It is a deliberate codegen self-check
  (`static_shape_ids_tests.rs:778`), not a crash. Unfiled.
- **Wall 8 — `TypeError: defineMethod is not a function at new Module`**, on
  05-model, 06b-crud and 06d-adapter-read, identical on all three.
  **Root-caused; pre-existing and not ours.** See the section below. It
  reproduces on unpatched upstream `main` @ `cad69fd3` (which contains 13091)
  and reduces to four files with no trails code at all.

### Bug 8 — an explicit import loses its class id to a same-named class

**What breaks.** `packages/activemodel/src/validations.ts:403` does the same
thing ruby-compat's own `Kernel` does — `new Module((mod) => mod.defineMethod(…))`
— and throws `TypeError: defineMethod is not a function at new Module`, while
`Kernel` succeeds earlier in the _same binary_.

**Why.** Three classes are registered under the name `Module`:

```
[mono] prefix="packages_ruby_compat_src_include_ts"                registers id=0xd   name="Module"                   methods=20
[mono] prefix="packages_ruby_compat_src_include_ts"                registers id=0x849 name="Module$Record_never_never" methods=20
[mono] prefix="packages_activesupport_src_core_ext_object_json_ts" registers id=0x4a3 name="Module"                   methods=0
```

The third is **an unrelated class**: `activesupport/src/core-ext/object/json.ts:29`
declares its own `export class Module` holding a single _static_ `asJson`. That
file declares 18 such classes — `Object`, `String`, `Array`, `Hash`, `Time`,
`Date` … — as namespaces for ActiveSupport's JSON encoders.

`validations.ts` imports `Module` only from `@blazetrails/ruby-compat`, and the
one `Module` the activesupport barrel re-exports is _also_ ruby-compat's. json.ts's
`Module` is exported by nothing in the chain. It arrives anyway, because
`run_pipeline.rs:5472` registers every exported class of every module
transitively reachable through an import — `origin_paths` is the imported module
plus every origin in its export map, and the barrel re-exports `asJson` from
json.ts, which drags in all 18. The dedup at `:5510` is by **bare class name**.

Codegen then binds the name first-writer-wins (`codegen/mod.rs:892`,
`or_insert`, deliberate per #665), so whichever entry lands first owns the name:

```
[w8import] consumer="…validations_length_ts" imports name="Module" source_prefix="…core_ext_object_json_ts"  source_class_id=Some(1187) methods=0
[w8import] consumer="…validations_length_ts" imports name="Module" source_prefix="…ruby_compat_src_include_ts" source_class_id=Some(13)   methods=20
[w8import] consumer="…validations_length_ts" class_ids["Module"] = Some(1187)
```

`new Module(...)` stamps 1187, whose method table is empty, so every
`mod.defineMethod(…)` misses every dispatch tower and the catch-all throws. Sister
chunks of the same file that happen to see only the real entry
(`…validations_numericality_ts`) get `Some(13)` and work.

The code anticipates this exact failure one branch earlier: `:5500` skips a
transitively-reached class whose name is a global intrinsic, because
`new Request(...)` was building an exporter's `class Request`. The comment there
asserts "An EXPLICIT `import { Request } from "./mod.js"` is pushed by the
specifier-driven sites above and already wins the name dedup below" — that is the
assumption that fails. Nothing orders the specifier-driven push before the
transitive walk.

**Reproducer** — four files, no trails code, Node prints `thing:x` and Perry
throws. `perry/probe/w8-name-collision/`:

```ts
// real.ts
export class Shared {
  constructor(block?: (s: Shared) => void) {
    if (block !== undefined) block(this);
  }
  defineThing(name: string): string {
    return `thing:${name}`;
  }
}
// decoy.ts — unrelated class of the same name, nobody imports `Shared` from here
export class Shared {
  static asText(v: { name: string }): string {
    return v.name;
  }
}
export function helper(): string {
  return Shared.asText({ name: "decoy" });
}
// consumer.ts
import { helper } from "./decoy.js"; // reaches decoy FIRST
import { Shared } from "./real.js";
export const made = new Shared((s) => {
  console.log("[repro]", s.defineThing("x"));
});
export const helped = helper();
// main.ts
import { made, helped } from "./consumer.js";
console.log("[repro] ok", typeof made, helped);
```

**Import order is the whole trigger.** Swap the two lines in `consumer.ts` so
`./real.js` comes first and it passes. That is why eight earlier synthetic
reductions all passed: they had two modules, never a _third_ declaring an
unrelated same-named class, and they imported the real one first.

**A source-level A/B confirms it** without touching the compiler: rename json.ts's
`Module` and 05-model walks straight past `validations.ts:403` — then dies on
`new Hash`, the identical bug on the next name. `Hash` is declared in three
packages (`ruby-compat/src/hash.ts:1011`, that same json.ts`:150`,
`msgpack/src/core-ext.ts:103`).

**Why it looked like it needed a big graph.** It needs activesupport in the
module set, not a module count: 04b-deep-import at 364 modules does not pull it
in, the 531-module probe does.

**Ordering is not the fix, and finding out why found the real defect.** The
first patch sorted specifier-driven entries ahead of transitively-reached ones.
It fixed the method table and left `new Shared(cb)` binding the _decoy's_
argument-less constructor, silently never calling the callback — a loud
`TypeError` turned into a silently wrong program:

```
Perry: [D] ranCallback false   [D] has method function  [D] direct thing:y
Node:  [D] in-callback thing:x [D] ranCallback true     [D] has method function  [D] direct thing:y
```

The reason is that codegen binds the bare name **twice, with opposite
tie-breaks**: `class_ids` (`codegen/mod.rs:892`, `entry().or_insert()`) is
first-writer-wins, while `imported_class_ctors` (`codegen/mod.rs:2963`, a
`collect()` into a `HashMap` keyed on `effective_name()`) is last-writer-wins.
No ordering of `imported_classes` can satisfy both. The duplicate entry has to
go, not move.

**Fixed.** In the importing module's scope the colliding name cannot refer to
the transitive class at all — the explicit import binds it. So once the import
list is complete, drop any transitively-reached entry whose bare name a
specifier of this module already claims; exactly one entry holds the name and
both maps agree. Transitive entries no specifier claims are untouched, which is
how a class reached only through a re-export barrel still resolves.
`constructor_contracts.rs` is already keyed on `(source_prefix, name)`, so no
ABI resolution changed.

Committed on `fix-import-name-collision` as `43edf8e5`, with
`test-files/test_import_name_collision*.ts` (red before, green after, matching
Node) and a `changelog.d` fragment. PR body drafted; **not pushed and not
filed.** `test_affected_crates.sh --base origin/main`: 5854 passed, 1 failed —
`perry-runtime`'s `every_net_transport_sabotage_makes_its_witness_red`, in a
crate this diff does not touch, passing in isolation twice on this tree.

**What it unblocks.** 05-model now compiles _and runs_ (`[05] Trail function`).
06b-crud and 06d-adapter-read move past wall 8 to new, later failures —
`establishConnection is not a function` and `setQuery is not a function`
respectively. Those are the next walls, not this one; whether they are the same
collision in a shape the fix does not cover (two _transitively_-reached
same-named classes, neither explicitly imported, where the first/last-writer
disagreement survives) is unexamined. `Base` is declared in at least nine
trails packages.

## Walls 9-11: two sqlite-ext defects, and the module bug that hid them

06d-adapter-read is not blocked by another instance of wall 8. It is blocked by
two independent defects in Perry's **own** better-sqlite3 extension, plus a
module-system bug (wall 11) that made both of them illegible. Finding them took
nineteen refuted hypotheses, every one of them mine and nearly every one from
reading source instead of running a probe; every confirmed fact below came from
a probe with a Node control on identical source. The ratio is the lesson - and
the one hypothesis that did land came from a probe that separated a
whole-namespace read from a per-member one.

**It is not N-API interop.** Perry ships `crates/perry-ext-better-sqlite3`, so
`import Database from "better-sqlite3"` never reaches the real addon. The
native-addon issues (#10456-#10461, #9266) are a different subsystem.

### Wall 9 - every property on a Database/Statement reads `undefined`

```
                        node                        perry
stmt.source             "select 1 as one"           undefined
stmt.reader/.readonly   true / true                 undefined
db.name/.open/.memory   ":memory:" / true / true    undefined
typeof stmt.get         "function"                  undefined
Object.keys(stmt)       5 keys                      []
"source" in stmt        true                        false
JSON.stringify(stmt)    full object                 null
```

Repro: `perry/probe/db-read/repro-a.ts` (33 lines, no trails code).

**Cause, and the fix.** `crates/perry-ext-better-sqlite3/src/dispatch_ext.rs:34`
registers `js_register_handle_method_dispatch_extension` and **never the
property counterpart**. Its own module doc states the architecture:

> A call on a statically typed receiver is lowered through the native table
> (`native_table/databases.rs`). A call whose receiver type was erased (`any`,
> an object field, a Map value) reaches the runtime's handle-method dispatch.

So methods have two working paths and properties have none. The runtime already
defines `HandlePropertyDispatchFn`, `HandlePropertySetDispatchFn` and
`HandleOwnPropertyNamesDispatchFn` (`crates/perry-runtime/src/object/class_handles.rs`),
and `perry-ext-ws` registers the property one for its handles (#9324,
`crates/perry-ext-ws/src/lib.rs:256`). `SqliteStmtHandle` already stores `sql`,
which is exactly `source`. This does **not** need the #11919 handle-to-object
conversion.

Note it also breaks method _capture_: `const f = stmt.run` yields `undefined`,
so `typeof x.run === "function"` feature detection fails even though
`stmt.run()` works.

A fourth, smaller gap: the dynamic dispatch claims only `prepare`, `exec`,
`close`, `raw`, `run`, `get`, `all` - so `iterate`, `pluck`, `expand`,
`columns`, `bind` and `safeIntegers` fail on an erased receiver.

### Wall 10 - `stmt.run()` on a row-returning statement returns `undefined` (FIXED upstream)

**Fixed and merged** as [#13335](https://github.com/PerryTS/perry/pull/13335),
`cb85e924`, with `test-files/test_gap_sqlite_run_row_returning.ts`. The merge
also carried a second divergence found while fixing it: `changes` came from the
connection's running counter, so `CREATE TABLE` straight after an `INSERT`
reported `changes: 1` where better-sqlite3 reports `0`. It is now a
`total_changes` delta.

```
const s = db.prepare("select 1 as one");
s.run();   // node: {changes:0,lastInsertRowid:0}   perry: undefined
```

INSERT and DDL are correct (`{changes:1,...}`); only row-returning statements
fail. This is what actually blocks the rung: the adapter's `step()` calls
`run()`, and the statement it runs is **`SELECT sqlite_version(*)`**.

**Cause, and the fix.** `crates/perry-ext-better-sqlite3/src/lib.rs:280`:

```rust
if let Ok(changes) = conn.execute(&stmt.sql, param_refs.as_slice()) {
    ... return result;
}
std::ptr::null_mut()      // swallows the error
```

rusqlite's `Connection::execute` returns `Err(ExecuteReturnedResults)` for a
statement that yields rows. The `if let Ok` discards it and falls through to
`null_mut()`, which arrives in JS as `undefined`. better-sqlite3's `run()`
accepts any statement. The fix is to drain the rows and report
`changes()`/`last_insert_rowid()` instead of treating rows as failure - and,
more generally, not to turn an error into a silent `undefined`. The same
swallow-to-sentinel pattern is everywhere in this ext: `js_sqlite_open` and
`js_sqlite_prepare` return `-1` on failure, `js_sqlite_exec` returns `0`, and
`nanbox_handle_inline` maps only `0` to `null` - so a failed open or prepare
produces a valid-looking, unusable handle.

### Wall 11 (the mask) - ROOT-CAUSED AND FIXED: a module that namespace-imports itself

Every failure above reported `TypeError: setQuery is not a function`, with the
real error destroyed. `abstract-adapter.ts:1857` calls `ex.setQuery` after
`ex instanceof StatementInvalid` passes, and the method is absent - missing
already **at construction**, so the later `activeRecordError.stack = ...` write
is innocent:

```
[m1] in ctor: typeof this.setQuery=undefined proto-has=false
node:  StatementInvalid:[constructor,setQuery] -> AdapterError:[constructor,connectionPool] -> ...
perry: StatementInvalid:[constructor]          -> AdapterError:[constructor,connectionPool] -> ...
```

**The cause is a self-referential namespace import.** A module that does

```ts
import * as Mod from "./this-module.js"; // its own path
```

bound the **whole-namespace value** to `undefined` during its own
initialisation - silently, exit 0, no diagnostic. Two causes, one per half of
the module lifecycle, and both had to be fixed:

1. `@__perry_ns_<prefix>` was emitted only for a module that **another** module
   namespace-imports, or that is a dynamic-import target. A self-importing
   module got no namespace global at all.
2. The namespace populator ran at the **tail** of `__init`, after the body that
   reads it.

Per-member reads (`Mod.f()`) always worked, which is why this hid for so long:
only the whole value was wrong - and the whole value is exactly what a mixin
helper needs, because it enumerates the namespace it is handed.

`activesupport/src/core-ext/date-and-time/calculations.ts:9` self-imports, and
line 487 does `include(RubyTime, DateAndTimeCalculations)`. ruby-compat's
`include` calls `Object.getOwnPropertyNames(mod)`, so it threw at module-init
time and `import { include } from "@blazetrails/activesupport"` - two lines -
aborted any program:

```
TypeError: Cannot convert undefined or null to object
    at include (<anonymous>)
```

Because trails installs prototype members **through**
`include(Class, moduleNamespace)`, this is also the whole of wall 11's original
silent symptom: handed an undefined namespace, `include` installed nothing, so
`StatementInvalid.prototype.setQuery` never existed. **The two symptoms were
always one bug**, differing only in whether the caller checked its argument.
With the fix, `[k2] typeof setQuery = function` and
`[k4] SI.prototype names = ["constructor","setQuery"]`.

Minimisation: 1134 modules (direct import) -> 462 (4 local files + the real
`include`) -> 459 (two lines) -> **1 module, 3 lines**.

Fixed upstream in [PR 13436](https://github.com/PerryTS/perry/pull/13436),
with `test-files/test_gap_self_namespace_import.ts`. It is the static-import
counterpart of #10160, which fixed the same populator-ordering bug for
_dynamic_ imports. Verified red/green by rebuilding with the patch reverted,
not by inference; a whole-namespace read of _another_ module is unchanged.

The nine self-imports in trails need no change - the pattern is valid ESM and
the compiler now supports it.

### Corrections to earlier entries in this file

- The `Version`/`Gem::Version` collision was **not** the cause. Renaming the
  ruby-compat class left the error byte-identical.
- But my follow-up claim that "no version query happens on this path" was also
  wrong: `[z0]` shows the failing statement is `SELECT sqlite_version(*)`. The
  version query _is_ the path; the collision just is not why it fails. Markers
  placed inside `getDatabaseVersion`/`queryValue` never fired even so - those
  are mixin functions spliced onto the prototype
  (`abstract/database-statements.ts:1014`) - and that guess was right: they are
  spliced by `include`, which wall 11 handed an `undefined` namespace, so they
  were never attached at all.
- A sqlite handle is **not** a primitive. `typeof` is `object`, and a property
  write persists per-instance across a function boundary and an array
  round-trip, so `ReceiverKind::Number`/`can_own_properties` is irrelevant. The
  writes land in the handle's property bag
  (`crates/perry-runtime/src/object/handle_expando.rs`).
- A narrow fix **does** exist for wall 9; my earlier "only #11919 can fix this"
  was wrong twice over.

### Refuted hypotheses, recorded so no one re-walks them

`Version` name collision; N-API addon interop; handle-is-a-primitive;
`can_own_properties`; spread-into-native-table; deep `Error` chain +
`prototype.name` mutation; class-field receiver; field x spread crossed;
large-graph scale; `.stack` write forcing a shape transition; static-vs-dynamic
dispatch path; dead-method pruning; module cycles (4-module cycle, `.js`
specifiers, mixed `.js`/`.ts` spellings, the heritage-cast shape); upstream
#12818/#12957/#12958 as the same family. All match Node exactly.

**Module count was never the trigger.** The earlier "fails at >=533 modules"
framing in this file was wrong, and is retracted: 1,205 generated real modules
built around a working case solve facts in 0.8s and run correctly. Count was a
proxy for "large enough to contain activesupport", and activesupport is where
the self-import lives. The mixed-`.js`/`.ts` cycle probe did reproduce Node's
TDZ `ReferenceError` exactly - that is parity, not a defect.

### RETRACTED - the "no facts" abort path is not unsound at scale

This file previously recorded a separate bug here: that
`PERRY_FACTS_MAX_WORK=1` turned two working programs into crashing ones, with

```
TypeError: Cannot convert undefined or null to object
    at include (<anonymous>)
```

and concluded "a program that runs with facts must not stop running without
them: the bound is a performance valve, and taking it changes behaviour."

**That was a mis-attribution, and it is retracted.** The crash signature is
wall 11's - the self-referential namespace import - and whole-program facts
were only masking it. Re-run on the [PR 13436](https://github.com/PerryTS/perry/pull/13436)
build with the bound still at `PERRY_FACTS_MAX_WORK=1`:

| program                          | modules | facts aborted, before    | facts aborted, after                    |
| -------------------------------- | ------- | ------------------------ | --------------------------------------- |
| `probe/db-read/errors-direct.ts` | 533     | **crashes** at `include` | runs, `RUN_RC=0`, correct               |
| `probe/db-read/protomiss.ts`     | 1147    | **crashes** at `include` | runs, `RUN_RC=0`, `setQuery = function` |

`crates/perry/src/commands/compile/program_facts.rs:101-116` and
`perry-wpfacts/src/lib.rs:455` - "Over budget: claim nothing (sound), keep the
shapes for the dump" - behave as documented. Aborting facts remains the
workaround for the wpfacts cost below, and it now produces a working binary:
1.5s at 533 modules and 4.6s at 1147, against 948.4s for a full solve.

The lesson for this file: a crash that appears only in one configuration is
evidence about masking, not about that configuration being unsound.

### Separate bug - an unresolved relative import compiles, runs, and binds a boolean

`perry/probe/db-read/repro-unresolved.ts`, six lines, no dependencies:

```ts
import { Thing } from "./definitely-does-not-exist.ts";
const t = new Thing();
```

|                      | node                                   | perry                    |
| -------------------- | -------------------------------------- | ------------------------ |
| load                 | `ERR_MODULE_NOT_FOUND`, refuses to run | compiles, `COMPILE_RC=0` |
| `new Thing()`        | never reached                          | succeeds                 |
| `t instanceof Thing` | -                                      | **false**                |
| prototype            | -                                      | bare `Object.prototype`  |
| `typeof Thing`       | -                                      | **`"boolean"`**          |
| process exit         | non-zero                               | **0**                    |

Perry prints exactly one warning (`Could not resolve import ...`) among 18
lines of output, then builds a program that exits 0 - so CI passes.

`crates/perry/src/commands/compile/collect_modules.rs:1906` already
hard-errors this case for `import * as X` (#629), on the grounds that an empty
namespace stub is "worse than a compile-time failure because the user has no
idea their namespace is empty", but keeps warn-and-continue for named imports
because "those produce more pointed runtime errors at the actual missing
binding". The table above is the counter-example: there is no pointed error,
the binding is a boolean, `instanceof` lies, and the process succeeds.

**Proposed fix**: gate on the specifier's shape rather than the import kind -
hard-error whenever `resolve::attempted_relative_import_path(...)` returns
`Some`, i.e. a relative specifier absent from disk, which nothing in stdlib, an
ext, `compilePackages` or a global can ever back. Bare specifiers keep
warn-and-continue, since those may legitimately resolve to non-file backing.

This also explains the `betterSqlite3Driver`-is-a-boolean observation from
earlier in this investigation: that probe used a subpath Node could not resolve
either, so the import was simply unresolved. It was not evidence about handles.

It cost two probe cycles here, because a bad import looks exactly like a
catastrophic codegen bug. When writing a probe: check `[ -f ]` on a relative
import first, require the Node control to succeed before reading the Perry
side, and read the compiler's warnings rather than only lines matching
`^Error`.

### Separate bug - `in` disagrees with `Object.keys` on a handle

```
stmt[k] = 42;            // k computed, write persists
Object.keys(stmt)        // ["probeField"]
k in stmt                // false   <- node: true
```

Plain objects and class instances are correct in Perry, so this is specific to
handle-backed objects: the own-property-names path consults the handle property
bag and the `in` operator does not.

### Upstream filings from this round

| Issue                                                  | Subject                                                                             | State                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------- |
| [12978](https://github.com/PerryTS/perry/issues/12978) | constraint check compares a type parameter's `TypeVar`, not its instantiation       | filed                   |
| [12979](https://github.com/PerryTS/perry/issues/12979) | contributor docs cannot produce a working from-source build                         | filed                   |
| [12990](https://github.com/PerryTS/perry/pull/12990)   | **PR** — lift a TDZ check out of a spread call's member callee                      | **merged** `ccad647e7a` |
| [12889](https://github.com/PerryTS/perry/issues/12889) | parentless class emits a `super` construct (pre-existing report we closed)          | **closed** by 13001     |
| [13001](https://github.com/PerryTS/perry/pull/13001)   | **PR** — no live heritage for a class that extends nothing                          | **merged** `71a8beb530` |
| [13009](https://github.com/PerryTS/perry/pull/13009)   | **PR** — three `cargo test` failures on `main` (CI, not our rung)                   | **merged** `ce79cdac2f` |
| [13091](https://github.com/PerryTS/perry/pull/13091)   | **PR** — follow an import+export hop when classifying a namespace                   | **merged** `22ad61bd`   |
| [13436](https://github.com/PerryTS/perry/pull/13436)   | **PR** — a module that namespace-imports itself sees its own namespace (wall 11)    | **draft**               |
| [12818](https://github.com/PerryTS/perry/issues/12818) | verified fixed on `34099d2c`/0.5.1663; its own repro passes — maintainers can close | to comment              |
| [12957](https://github.com/PerryTS/perry/issues/12957) | verified fixed on `34099d2c`                                                        | to comment              |
| [12958](https://github.com/PerryTS/perry/issues/12958) | verified fixed on `34099d2c`                                                        | to comment              |

Both re-verified against `main` @ `20fde48d` immediately before filing, and
both duplicate-searched first. 12978's reproducer is the 23-line
`inQueryConnection` case and the warning text is unchanged from 0.5.1520.

## The serve rung compiles (2026-10-31)

`08-serve` compiles and links with the full graph, including the generator
subtree. First time any trails server has become a binary:

| measurement       | value       |
| ----------------- | ----------- |
| compile           | RC=0, 1301s |
| modules           | 1937        |
| binary            | 235 MB      |
| playwright / vite | 0 / 0       |

Toolchain: trails main with #9495 and #9545, Perry main at `b28eca785` with
#13622 (wall 15) and #13501. Node control: `status=200 len=73`, a real
`HealthController#show` render, with `SECRET_KEY_BASE_DUMMY=1` — the Rails
escape hatch `application.ts:171` honours, so the rung needs no invented
config.

**The OOM was a budget probe, not a graph size.** At 36 GiB the same compile was
SIGKILLed at 35% of codegen. `CodegenBudget::for_this_machine`
(`perry-codegen/src/workers.rs:275`) sizes the budget from `MemAvailable` plus
cgroup headroom, and over-scheduled against a 36 GiB cap on a box where other
work held 47 GiB. Pinning `PERRY_CODEGEN_MEMORY_MB=18000` compiled the identical
1937-module graph in 1301s. Any ladder run on a shared box should pin it.

**The generator subtree costs +317 modules** (1620 → 1937) and is reached by two
const-folded dynamic imports: `engine.ts:227` → `generators.js:340` →
`generators/base.ts`. Both are correct Rails parity —
`Engine#loadGenerators` mirrors `railties/lib/rails/engine.rb:476`'s
`load_generators`, which also requires lazily inside the method — so there is
nothing to fix in trails. Perry const-folds the specifier and registers a hard
edge, exactly as it does for playwright in wall 14, and
`--strict-dynamic-import` does not help because it only covers specifiers that
do NOT resolve. Keeping a Rails-faithful lazy boundary out of a binary needs a
Perry-side lever that does not exist today.

## Wall 16: a namespace member is read in TDZ from a constructor

The 1937-module binary runs and throws:

```text
ReferenceError: Cannot access '_allocation' before initialization
    at new Base (<anonymous>)
```

`packages/activerecord/src/core.ts:736` is
`export const _allocation: { klass: unknown } = { klass: null }`, and
`packages/activerecord/src/base.ts:1336`, inside the `Base` constructor, reads
`_Core._allocation.klass` through the namespace import at `base.ts:270`.

There is **no cycle**: `core.ts:141` imports `Base` as `import type`, which is
erased, so `core.ts` is an ordinary dependency of `base.ts` and should be
initialized first. A `Base` is nevertheless constructed before `core.ts`'s
top-level `const` is initialized.

This is the same family as wall 15 and arguably #13622 working: the namespace
object is now populated early with getter-backed live bindings, so the getter
reports TDZ honestly instead of handing back `undefined`. The remaining defect
is the initialization order itself. Next measurement: a `PERRY_DEBUG_INIT`
build (compile-time flag) to show where `core.ts` lands relative to the first
`new Base`.

## Wall 15: a module that imports itself gets `undefined`, not a namespace object

`08-serve`'s binary compiles and then throws:

```
TypeError: Cannot convert undefined or null to object
    at include (<anonymous>)
```

`include` was instrumented temporarily to print its arguments (reverted
afterwards). `klass` is a healthy class; the **module argument is `undefined`**.
The call site is
`packages/activesupport/src/core-ext/date-and-time/calculations.ts:487`,
`include(RubyTime, DateAndTimeCalculations)`, and line 9 of that same file is:

```ts
import * as DateAndTimeCalculations from "./calculations.js";
```

The module imports **itself** as a namespace object. That is legal ESM: the
namespace object is created before the module is evaluated, so top-level code
at line 487 sees it populated. Perry evaluates it to `undefined`.

Reduced to a two-line fixture (one file, no framework):

| expression           | Node           | Perry       |
| -------------------- | -------------- | ----------- |
| `typeof Self`        | `object`       | `object`    |
| `Self === undefined` | `false`        | **`true`**  |
| `typeof Self.mixin`  | `function`     | `undefined` |
| `Object.keys(Self)`  | `marker,mixin` | **throws**  |

`typeof` says `object` while the value is `undefined`, so `typeof` is folded
from the binding's declared kind at compile time while the runtime slot never
receives a namespace object. The fix belongs in Perry: construct and populate
the namespace object for a self-referential import (a cycle of length one)
before evaluating the module body.

**Two corrections to earlier readings of this wall, both recorded because the
wrong ones were plausible:**

- The call site is **not** `activerecord/src/type/time.ts:39`
  (`include(Time, Timezone)`). That was picked by grepping for `include(Time`
  and matched a different `Time`. The init chain shows no activerecord module
  runs at all.
- There is **no import cycle through `active-record.js`**, which an earlier
  draft of this section claimed. `active-record.ts`'s value imports are
  `namespaces.js`, `marshalling.js` and `migration/default-strategy.js`.
- `PERRY_DEBUG_INIT` is a **compile-time** variable
  (`perry-codegen/src/codegen/entry.rs:425`), not a runtime one, and its
  `INIT:` lines interleave with unbuffered stderr — the error text lands
  spliced into the middle of an unrelated module name, and init lines continue
  after it. The position of the throw in that stream does not identify the
  module that threw.

It is **pre-existing and unrelated to the wall 14 cuts**: the 533-module
`probe/db-read/errors-direct.ts` fixture reproduces it, and predates them.

## Wall 14: a production server binary contains vite, rollup and playwright

**Fixed in trails by #9495** (`997845bfb3`, merged 2026-10-30), from RFC 0061
story `keep-playwright-and-vite-out-of-a-production-boot`. That change carries
the two cuts below plus the pieces this prototype left open: an `exports` map on
`@blazetrails/actionpack` (so the `./system-testing` subpath resolves), a
`production-boot.trails.test.ts` asserting the graph, an entry-import TDZ guard,
and regenerated `class-paths` parity manifests.

The measurements that motivated it, from the prototype of the same two cuts:

| measurement | before                      | barrel cut only | both cuts       |
| ----------- | --------------------------- | --------------- | --------------- |
| compile     | OOM @12 GiB; TIMEOUT @60min | 1 module failed | **RC=0, 1065s** |
| modules     | 1720                        | 1713            | 1620            |
| playwright  | 570 warnings, 43min stall   | **0**           | **0**           |
| vite        | present                     | 145 mentions    | **0**           |
| peak RSS    | 20.0 GiB                    | 10.6 GiB        | —               |

The cuts:

1. **`system-testing` off the `action-dispatch` barrel.** `driver.ts` imports
   playwright. The import is _already_ lazy (`await import(PLAYWRIGHT_MODULE)`),
   and that does not matter: Perry const-folds the specifier and registers it as
   an import edge (`perry-hir/src/dynamic_import.rs`), so playwright joins the
   graph of anything that can reach the file. The barrel was the only importer
   of `system-test-case.js`, and nothing in the repo imported `SystemTestCase`,
   `Driver`, `DrivenByOptions` or `ServedByOptions` from it.

2. **The `trailties` entry split.** `"."` was `./dist/cli.js`, so every app's
   `config/application.ts:1` reached commander, every command, the generators,
   and — via `commands/server.ts` → `server/dev-server.ts:2` — vite and rollup.
   `"."` is now the runtime surface (`Trails`, `Application`, `Engine`,
   `Trailtie`, exactly what `cli.ts:19-22` re-exported) and the CLI moved to
   `"./cli"`.

**Cost is not module count.** The first cut removed only 7 of 1720 modules and
bought 43 minutes of codegen and ~10 GiB of RSS, because
`playwright-core/lib/coreBundle.js` was a single enormous bundled file (5.16 GiB
in the facts profile). An earlier reading of this wall dismissed the entry split
as "62 of 1731 modules, 3.6%, not worth it" — that used the wrong metric, and
the measurement above overturns it.

**What the cuts did not fix.** The binary compiles and then throws
`TypeError: Cannot convert undefined or null to object at include` — the same
failure the 533-module `probe/db-read/errors-direct.ts` fixture produces, so it
is pre-existing and not a consequence of the cuts. Compilation also reports
`unimplemented API buffer.hasOwnProperty` in `safer-buffer/safer.js:130` as a
_deferred_ runtime error, latent behind the `include` one;
`--strict-unimplemented` turns that class into a compile-time error.

**Open packaging question.** `@blazetrails/actionpack` has `main` and no
`exports` map, so the new `@blazetrails/actionpack/system-testing` subpath does
not resolve as written — it needs an `exports` map, which would change
deep-import behaviour for existing consumers. That decision is not made here.

`07-boot` and `08-serve` are the first rungs that fail to compile at all since
wall 1 was fixed, and the per-module memory curve does not explain them. The
budget line names the problem:

```
[perry] codegen: largest module estimate 5.16 GiB
        (node_modules/.pnpm/playwright-core@1.60.0/.../coreBundle.js);
        total 570.8 GiB over 1731 modules
Found 1731 module(s): 1731 native, 0 JavaScript
COMPILE_RC=137      # OOM-killed at MemoryMax=12G, in whole-program facts
```

1133 modules at `06d`, 1731 at `07`. The 598 new ones are vite (167 on its
own, and the graph carries **two** pnpm copies, `@types+node@22` and
`@types+node@25`), rollup, playwright-core, commander, and the generators.
None of them run in a production server.

### Why `env=production` does not help

It is the right runtime branch and it is already written. `trailties`
`commands/server.ts`:

```ts
if (options.environment !== "development" || !(await hasViteConfig(root))) {
  const server = await Handler.Node.run(railsApp, { Port: port, Host: host(options) });
  …
  return;                     // vite is never constructed
}
const server = new DevServer({ … });
```

Outside development the server is `http.createServer` + `listen` and a rack
callable, nothing more. `08-serve` is exactly that path and under Node it
serves a real request in both environments:

```
[08] env=development port=3178 status=200 len=73
[08] env=production  port=3178 status=200 len=73
Processing by HealthController#show as */*
Completed 200 OK in 8ms (Views: 4.7ms | ActiveRecord: 0.0ms (0 queries, 0 cached))
```

But a conditional is a runtime construct and the module graph is computed at
compile time. A binary contains what the graph **reaches**, not what the taken
branch executes. No `if` can shrink it.

### How vite is reached: the package entry is the CLI

```
config/application.ts:1   import { Application } from "@blazetrails/trailties"
trailties package.json    "." → "./dist/cli.js"
cli.ts:5                  import { serverCommand } from "./commands/server.js"
commands/server.ts:8      import { DevServer } from "../server/dev-server.js"
server/dev-server.ts:2    import { createServer } from "vite"
```

Every trails application reaches the CLI on the first line of its config,
because that is what the package's main export is. `trails new` writes that
line. Playwright arrives the same way through
`actionpack/src/action-dispatch/index.ts` → `system-test-case` → the driver.

### Two fixes that do not work, both measured

**Making the import lazy does nothing.** Moving `DevServer` to
`const { DevServer } = await import("../server/dev-server.js")` below the
production `return` left the graph byte-identical: 1731 modules, vite still
present. `perry-hir/src/dynamic_import.rs` says why by design — it const-folds
an `import()` path to a finite set of module sources and registers **each as
an import edge**; a path it cannot fold is a _compile error_, not an exclusion.
There is no "might never load" in an AOT build. Playwright is the independent
proof: its import is already correctly dynamic (`driver.ts:30`,
`await import(PLAYWRIGHT_MODULE)`) and it is still the largest module in the
graph. Reverted — under Node it buys only import time, and vite is a runtime
`dependency` of trailties (`^7.0.0`), not a devDependency, so it does not even
buy deploy-install safety.

**`--define` does not prune the dead branch's edge.** On
`if (INCLUDE_DEV) { await import("vite") }`:

| build                        | modules | vite in graph |
| ---------------------------- | ------- | ------------- |
| `--define INCLUDE_DEV=false` | 167     | yes           |
| `--define INCLUDE_DEV=true`  | 167     | yes           |

The define substitutes the value; the edge survives regardless. (A first run
of this experiment appeared to prove the opposite — 1 module with the branch
off. The `true` control also reported 1 module, which showed vite had simply
not resolved in that scratch directory and the result was worthless. The
control is what caught it; without it this file would now claim `--define` is
the answer.)

### So the fix is structural, in trails

Reachability is the only lever, so the entry must not reach the CLI:

- **Split the `trailties` package entry.** `"."` exports the runtime surface
  (`Application`, `Trails`); `"./cli"` exports the CLI. No application changes
  a line — the specifier simply stops meaning "the command-line interface" —
  and the commands, generators, dev server, vite and rollup leave every app's
  graph at once.
- **Same treatment for system testing**, so a production boot does not reach
  `action-dispatch/index.ts`'s system-test surface and through it playwright.

Both are framework changes and belong in trails, not in an application or a
Perry flag. Neither is filed yet.

## Wall 16, measured: the init chain and the throw are not in the same frame (2026-11-01)

`PERRY_DEBUG_INIT=1` is a compile-time flag, so this cost a second full build
of `08-serve`: `COMPILE_RC=0`, 1795s, the same 1937 modules, same 235 MB.
Running it with stdout and stderr in separate files — not a pipe, which is what
made wall 15 hard to read — gives a clean trace: 249 `INIT:` lines on stdout, 2
lines on stderr.

Three facts come out of it:

- **activerecord never initializes.** Zero `INIT: packages_activerecord_*`
  lines, yet the stderr frame is `at new Base` reading `_allocation`, which only
  `activerecord/src/core.ts:736` defines. Its constructor ran against a module
  that had not been initialized.
- **The chain stops at `packages_i18n_src_backend_simple_ts`.** `INIT:` is
  printed _before_ the initializer is dispatched (`perry-codegen/src/codegen/entry.rs:418-425`,
  "print the next initializer before dispatching it"), and the order of the
  `INIT:` constants in the binary matches the runtime order exactly, so the next
  module in the chain, `packages_i18n_src_config_ts`, never ran.
- **The throw is not `simple.ts`'s own code.** The obvious reading — that
  `simple.ts:120`'s mixin loop, `new (Base as unknown as new () => Base)()`, is
  the `new Base` in the frame — is wrong, and a smaller graph proves it: a probe
  importing only `packages/i18n/src/backend/simple.js` compiles to 202 modules
  and exits 0, initializing `simple.ts` normally. i18n's `Base`
  (`i18n/src/backend/base.ts:192 export abstract class Base`) has no connection
  to activerecord's.

So the code that threw was running _between_ two module initializers, not
inside one. That points at a microtask or async continuation — the boot's own
`await` chain — being drained during the eager init chain, far ahead of the
modules it depends on. That is the hypothesis to test next, and it is a much
worse defect than an ordering mistake inside the chain.

Four hypotheses were refuted before this one, all of them variants of "two
classes named `Base` collide" (the graph has ~20): a minimal two-module
collision, instantiating an `abstract` class through a cast, 24 same-named
`Base` classes to put `layout_ordinals` under pressure, and the real 202-module
i18n subgraph. All four compile and run clean. The name is not the mechanism.

## Wall 17, ROOT-CAUSED: `Error().stack` carries no source positions (2026-11-02)

Not an init-ordering bug at all — the first wall on this ladder that is not.
A native backtrace (`PERRY_KEEP_SYMBOLS=1`, then gdb breaking on the
`#[no_mangle]` `js_throw_type_error_property_access`) names what `at <anonymous>`
hid:

```
PROP=path
#1  js_object_get_field_nonptr
#2  Delegation.generate                  at delegation.ts:100
#3  delegate                             at module-ext.ts:19
#10 controller_helper init_body          at controller-helper.ts:67
#16 run_path_initializer  #19 main       at 08-serve.ts:39
```

`activesupport/src/delegation.ts:100` is the throw:

```ts
location ||= callerLocations(1, 1)[0];
const [file, line] = [location.path, location.lineno];
```

`callerLocations` (`activesupport/src/deprecation.ts:124`) installs a
V8-specific `Error.prepareStackTrace` hook and parses `new Error().stack` for
`(file:line:col)`. A 1-module probe (`perry/probe/stack-positions.ts`) measures
all of it against Node:

|                                         | Node                                 | perry            |
| --------------------------------------- | ------------------------------------ | ---------------- |
| `prepareStackTrace` invoked             | true                                 | **false**        |
| callSites handed to the hook            | 4                                    | never called     |
| `.stack` is the hook's return           | true                                 | **false**        |
| frame lines                             | 5                                    | **2**            |
| lines matching `callerLocations`' regex | 4                                    | **0**            |
| frame text                              | `at <anonymous> (/…/probe.ts:23:15)` | `at <anonymous>` |

Three independent deficiencies, each sufficient on its own:

1. **`Error.prepareStackTrace` is settable but never invoked.** #2904 (closed)
   made the statics exist, which is why `callerLocations` gets as far as the
   regex instead of throwing on assignment. Nothing calls the hook.
2. **Frame text carries no file, line or column.** The regex cannot match.
3. **There is only one frame.** `lineCount=2` is the message plus a single
   `at <anonymous>`, so `callerLocations(1, 1)` — which asks for the _caller_ —
   has no caller frame to return even if 1 and 2 were fixed.

**`--debug-symbols` does not fix it**, and that is worth recording because the
flag looked promising: `object_cache.rs:431` says it flips per-call
`js_set_call_location` emission. A full `--debug-symbols` build still dies at
the same 416 modules with the same `PROP=path`. What it does buy is DWARF line
info on the _native_ frames — the `delegation.ts:100` / `controller-helper.ts:67`
positions above come from that build. Native line info and JS-visible stack
positions are separate mechanisms in perry.

This is a perry runtime gap, not an init defect, and it will hit any trails code
that introspects its caller — `delegate` is just the first one the boot reaches.
It is also the same deficiency that made walls 15 and 16 so expensive to read:
every perry trace in this file says `at <anonymous>` or
`at new Base (<anonymous>)` because there are no positions to print.

### The three i18n call sites are reverted

Getting init past wall 16 needed `simple.ts:120`, `chain.ts:142` and
`key-value.ts:181` patched. Those edits are **measurement scaffolding, not a
fix** — the defect is perry's, and per CLAUDE.md a framework bug is fixed in the
framework, not worked around in application or package source. They are
reverted; the diff is kept at
`scratchpad/wall16-i18n-scaffolding.patch` for whoever reproduces this. Wall 17
also reproduces without them, in the 1107-module probe below.

## Wall 17 (first sighting): activerecord's own init fails in a mid-sized graph

A probe importing i18n's `simple.js` _and_ `@blazetrails/activerecord` compiles
to 1107 modules (1001s) and fails differently:

```
TypeError: Cannot read properties of undefined (reading 'path')
    at <anonymous>
```

754 `INIT:` lines, 193 of them activerecord's, with `simple.ts` at 205 and
`core.ts` at 676 — both fine. The chain dies dispatching
`associations/has_many_through_association.ts`. This is a second, independent
init defect, and it is the cheaper one to chase: 1107 modules instead of 1937.

Note what it also proves: `simple.ts` initialized at 205 while activerecord was
still uninitialized, without throwing. That is the measurement that rules
`simple.ts:120` out as wall 16's cause.

## Wall 16, SOLVED: a top-level `new` through a constructor-type cast (2026-11-02)

Three patched call sites take the eager init chain from 249 modules to 494 and
make the `_allocation` TDZ `ReferenceError` disappear entirely. The trigger is
this idiom, at **module top level**:

```ts
for (const source of [Base.prototype, new (Base as unknown as new () => Base)()]) {
```

The boot graph has exactly three of them — `i18n/src/backend/simple.ts:120`,
`chain.ts:142` and `key-value.ts:181` — and they fail in chain order, one at a
time. The measurements, each a full 1937-module build:

| change                          | `INIT:` lines | stderr                                                            |
| ------------------------------- | ------------- | ----------------------------------------------------------------- |
| none                            | 249           | `Cannot access '_allocation' before initialization` at `new Base` |
| `simple.ts` → concrete subclass | 251           | same error, now at `chain.ts`                                     |
| `chain.ts` + `key-value.ts` too | **494**       | wall 17's `reading 'path'` instead                                |

Replacing the cast with `class _Probe extends Base {}` and `new _Probe()` is
what fixes each site. **i18n's `Base` has no abstract members**, so that
subclass runs the byte-identical constructor — which is the whole argument: the
same constructor body throws when reached through the cast and succeeds through
a direct class reference, so the constructor's contents are not the defect. A
probe confirmed the binding resolves sanely at the site
(`Base.name=Base probe.name=_KeyValueProbe proto=true`), so this is not a
mis-resolved class either; it is how the `new` is lowered when its callee is a
cast to an anonymous constructor type.

The other `as unknown as new () =>` sites in the repo
(`activerecord/src/migration.ts:340`, `activesupport/src/current-attributes.ts:123`,
`trailties/src/trailtie.ts:69`) sit inside methods, never run during init, and
never appeared. Top-level position is part of the trigger.

**Caveat, stated because it is not yet excluded:** adding a class declaration
also perturbs codegen. "The cast is the trigger" is strongly supported by the
three-for-three chain-order behaviour, but it has not been isolated from that
perturbation. A minimal repro built from the shape is the next step, and it is
what an upstream filing needs.

### Corrections to the two sections above

- **`simple.ts:120` was never ruled out.** The entry above says the 202-module
  and 1107-module probes rule it out, because `simple.ts` initializes there
  without throwing. Patching that exact line in the full graph moved the
  frontier, so the probes' negative result was **graph-size dependent, not a
  refutation**. A site that is harmless in a 1107-module graph and fatal in a
  1937-module one is evidence about position, not about innocence.
- **The microtask/async-continuation hypothesis is superseded.** The reasoning
  was that the throw ran "between two module initializers" and so had to come
  from a drained continuation. It did not: it ran inside the dispatch of the
  module whose `INIT:` line was printed last, from a top-level `new` in that
  module. `INIT:` is printed before dispatch, which is what made the throw look
  like it came from between frames.
- **"The name is not the mechanism" stands**, but the rename experiment that
  appeared to prove it was not a clean test: it renamed the declaration while
  keeping `export { I18nBackendBase as Base }`, so the binding at the
  construction site was still spelled `Base`. The claim survives on the probe
  evidence above, not on that experiment.

Wall 16 took six experiments, five of which were wrong, and every wrong one
reasoned from the shape of the code instead of changing one variable and
measuring. The one that worked changed a single call site.

## Walls 18-20, all FIXED: three unrelated lowering defects (2026-11-03)

With wall 17's `callerLocations` fallback in place the eager chain reached 416
and then hit three more defects in a row. All three are now fixed in trails, and
two of them have 1-module minimal repros under `perry/probe/`.

| wall | init lines after the fix | error it threw                                                                   |
| ---- | ------------------------ | -------------------------------------------------------------------------------- |
| 18   | 514 -> 545 -> **842**    | `TypeError: Cannot convert undefined or null to object` in `rbModAppendFeatures` |
| 19   | **869**                  | `ReferenceError: Base64 is not defined`                                          |
| 20   | (next build)             | `TypeError: Cannot set properties of undefined (setting 'withRouting')`          |

### Wall 18 - a mixin namespace read while its module was half-built

`include(Document, Searchable)` at `nokogiri/src/html5/document.ts:95` received
`undefined`. Measured, not guessed: a `console.log` at `rbModAppendFeatures`'
entry printed `WALL18: appendFeatures got mod=undefined for klass=Document`
exactly once.

`xml/searchable.ts` sat inside an **8-module** strongly-connected component, so
whichever of its five `include(X, Searchable)` consumers initialised first could
read its namespace mid-build. Three shapes were refuted with probes first (6-10s
each): a plain 2-module cycle, a 3-module cycle with a separate importer, and
the namespace of an in-progress module - perry handles all three correctly, and
on the third it is _more_ permissive than Node, which throws a TDZ
`ReferenceError`.

What found the cut was a Tarjan SCC pass over nokogiri's runtime imports (type-only
imports excluded). `searchable.ts`'s only out-edge into the knot was
`xpath-context.ts`, and the failing reads were all of _searchable's_ namespace,
so the knot never needed untangling - one edge did. `NodeSet` and `XPathContext`
are now resolved through a late-binding holder (`xml/node-set-ctor.ts`) at query
time, which is always after boot.

Two wrong turns worth recording: the first fix cut only `searchable ->
node-set`, which moved the frontier 31 modules and failed again because the
cycle was two levels deep; and making `searchable.ts`'s import of
`xpath-context.js` type-only orphaned that module entirely (nothing else
imported it at runtime), so it never registered and every css/xpath query threw.
The five consumers now load it for its side effect.

### Wall 19 - a named class expression's own name is not bound in its body

`rack-session/src/cookie.ts` had `static Base64 = class Base64 { static Marshal
= class Marshal extends Base64 {} ... }`. Per spec a named class expression
binds its name inside its own body; perry does not create that binding.

`perry/probe/named-class-expr.ts` (15 lines) and
`perry/probe/named-class-decl.ts` isolate it exactly:

| shape                                                                     | Node  | perry              |
| ------------------------------------------------------------------------- | ----- | ------------------ |
| `class Base64 {}` **declaration**, self-reference in a static initialiser | works | **works**          |
| `= class Base64 {}` **expression**, same self-reference                   | works | **ReferenceError** |

Fixed by hoisting to a module-level declaration, keeping the name `Base64` so
`.name` and the `Rack::Session::Cookie::Base64` class path are unchanged
(verified at runtime).

### Wall 20 - a top-level namespace colliding with a nested one

`actionpack/src/action-dispatch/testing/assertions/routing.ts` declared a
top-level `ClassMethods` (RoutingAssertions') and a nested
`WithIntegrationRouting.ClassMethods` in the same module. Narrowed with three
probes:

- nested `Outer.ClassMethods` alone - fine
- `A.ClassMethods` and `B.ClassMethods` in different outers - fine
- a top-level `ClassMethods` **plus** a nested one - **throws**

`perry/probe/ns-collide.ts` is the 16-line repro. Declaration merging (the same
top-level namespace twice) is also fine - `perry/probe/ns-merge.ts`.
`WithIntegrationRouting` moved to its own module and is re-exported, a shape
verified on both runtimes before the change.

### The tree is now clean of both lowering shapes

A scan of every non-test, non-generated `.ts` in `packages/` finds **no**
remaining instance of wall 19's shape (a named class expression subclassed by
its own members) or wall 20's (a top-level namespace name reused nested). Both
fixes were complete rather than one-site patches, so the next wall is a new
shape.

### Method, since it changed the cost per wall

Wall 16 took six experiments and hours of full builds. Walls 19 and 20 took one
probe cycle each, because:

- `PERRY_KEEP_SYMBOLS=1` plus a gdb breakpoint on a `#[no_mangle]` runtime throw
  (`js_typeerror_new`, `js_throw_type_error_property_access`) names the frame
  that `at <anonymous>` hides. **The last `INIT:` line is not the throwing
  module** - it prints before dispatch, and a deferred module prints nothing, so
  wall 18's real thrower was four nested `init_evaluate` frames below the last
  printed line.
- A 1-module probe compiles in ~6s against ~15-25min for the ladder. Kill
  hypotheses with probes; use the ladder only to confirm.
- When probes will not reproduce it, instrument the real graph. One
  `console.log` at the suspect function's entry beat further shape-guessing.

### Build environment: the memory limit is the cgroup, not the machine

Four builds were OOM-killed while `free` still showed 20-30GB available. Every
session of this user shares `user-1000.slice`, whose `memory.max` is **48GiB**;
with a neighbouring session holding ~20GB, perry's ~11.5GB peak exceeds the
slice and the kernel kills perry:

```
Memory cgroup out of memory: Killed process (perry) anon-rss:11445972kB
```

`PERRY_CODEGEN_MEMORY_MB` is a **scheduling hint, not a ceiling** - set to 6000,
perry still reached 11.4GB, so lowering it does not help. `MemoryMax=` on the
build's own scope is not the operative limit either. Gate on slice headroom
(`memory.max - memory.current` >= ~18GiB) instead of `free`.

## A bare import that cannot be resolved compiles anyway

Found by accident while building the probes above, and filable on its own.
`@blazetrails/i18n` is not resolvable from `examples/perry-native` (it is not in
that `node_modules`; only 11 `@blazetrails/*` packages are). Node refuses it
outright. `perry compile` reports `Found 1 module`, exits 0, writes a 6.2 MB
binary, and that binary prints `typeof I18n` as `"boolean"`.

An unresolvable bare specifier should be a compile error, not a silent bogus
value — and silently compiling one module instead of several hundred is exactly
the failure that looks like a passing rung.

**Filed and narrowed (2026-11-02).** Most of this is already #11576, which
hard-errors a _value-used_ named or default import of an uninstalled bare
package and _deliberately_ keeps `typeof`-only and type-only uses compiling —
which is exactly what the headline probe above does, so that probe is not a new
defect. The one real gap was `new`: constructing such an import compiled
silently, because `Expr::New`/`JsNew` fed only the generic reference set and
never the called-or-constructed set that #11576's preflight checks. Fixed in
PerryTS/perry#13667 (`bootstrap/named_exports.rs`, 4 tests).

Its CI is red and that red is **inherited, not caused**: main's own CI run at
the PR's merge-base `1cb8838a0` fails the same job set, the `perry --bin perry`
suite gives an identical `1350 passed; 12 failed` with the PR's code absent,
and `cargo fmt --check` under the pinned `nightly-2026-10-04` rustfmt reports
231 diff hunks at that commit. Of those 12 failures only one is a root —
`gc_diagnostic_knobs_set_while_compiling_install_the_gc_diagnostics` panics
while holding the process-environment lock, and the other 11 are `PoisonError`
cascades from `test_env_lock.rs:29`.

## Wall 21, SOLVED, and four findings retracted (2026-11-03)

**Measured against perry 0.5.1663, built from `main` at `a1ae27ee5`.** Recording
the compiler commit because the lack of one caused everything below.

### Wall 21: a private field cannot be installed on a constructor-returned Proxy

`StringInquirer`'s constructor ends in `return new Proxy(this, {...})`. A base
constructor that returns an object makes that object the `this` of every derived
constructor, so `EnvironmentInquirer`'s `#local` was being installed on the
Proxy. Perry refuses: `TypeError: Cannot initialize #local on this object`. V8
permits it, which is why it shipped, so **no test can assert the failure on
Node** and the fix is not Node-observable.

Fixed by deriving instead of storing -- `#local` was a pure function of an
immutable string, so there was nothing to keep:

```ts
"local?"(): boolean { return isIn(String(this), LOCAL_ENVIRONMENTS); }
```

`String(this)` resolves through the get trap's existing `bind(target)` branch.
Two single-file probes settle it, both run on 0.5.1663: `privfield-proxy2.ts`
reproduces the TypeError, `derive-proxy.ts` prints output identical to Node.
This is the first wall whose fix was verified _before_ a full build rather than
after -- the probe pair cost 7 minutes against ~25 for a ladder build.

20 other sites use the constructor-returned-Proxy idiom and are latent; only a
class that installs a private field after `super()` breaks. `setproto-proxy.ts`
proves the alternative (installing the handler in the prototype chain, as
`activerecord/src/base.ts:2023` already does) works under Perry, despite
`docs/typescript-parity-gaps.md:51` listing Proxy as "Missing".

### Retracted: the compiler pin invalidated four findings

FINDINGS' header names `d74498b2` (0.5.1659) as the compiler. I rebuilt against
it after a session scratchpad wipe destroyed the previous checkout and binary.
**It is 2614 commits behind main.** The wiped binary's version was never
recorded and was certainly far newer. Four findings came from that stale build
and do not survive re-validation on main:

| claimed                                                        | actual on 0.5.1663                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| node_modules symlink cycle OOMs resolution before module #1    | fixed upstream; the cycle restored, main collects 1351 modules and never OOMs                                |
| `export import YAML = Psych` is not surfaced as a named export | works; identical to the rewrite (`typeof YAML = object`, `has loadTags = true`). The trails fix was reverted |
| whole-program lowering needs >40GB, OOM even at 1x1 jobs       | artifact of the stale compiler                                                                               |
| codegen unit sizing is the lever for that OOM                  | never reached per-unit codegen at all                                                                        |

The symlink cycle was real on 0.5.1659 and the analysis is kept for diagnosing
an old compiler: Tarjan over the `packages/*/node_modules/@blazetrails/*` graph
finds exactly two cyclic components, `{actionpack, actionview, trails-tsc}` and
`{activestorage, trailties}`, and one cut edge per component suffices. **Do not
spot-check legs** -- checking two of them is what led me to call the graph
acyclic while `actionview <-> actionpack` sat outside my sample.

Two environment facts the wipe also took, both easy to lose again: the
`scripts/gc_call_effects/sidecars.sh` step is **mandatory** after building the
compiler (without it every real compile refuses to start, while hello-world
still works, so the toolchain looks healthy), and it needs
`LIBRARY_PATH=/home/linuxbrew/.linuxbrew/lib` or `perry-gc-effects` fails to
link on `-lzstd`. `w8env.sh`, the wall-16 scaffolding patch and the build
scripts now live in `/home/dean/github/blazetrailsdev/perry-ladder-keep/`, and
the compiler checkout in `/home/dean/github/perrysrc`, outside any scratchpad.

### Wall 22: an unused optional peer dependency is pulled into the AOT graph

    Error: Failed to parse .../react-native/index.js:
    Parse error: Expected("from", "typeOf")

The chain is trails' own
`activerecord/src/connection-adapters/expo-sqlite-adapter.ts` ->
`sqlite/expo-sqlite.ts` -> `expo-modules-core/src/requireNativeModule.ts` ->
`react-native/index.js`, whose Flow syntax perry's parser rejects.

**trails is already written correctly here**, which is the point of the entry.
`activerecord/src/namespaces.ts:31` imports the adapter as `import type`
(erased) and line 114 reaches it through a _dynamic_ `import()`, as does
`trailties/src/database.ts:300`. `expo-sqlite` is a **peerDependency** of
activerecord -- the app's choice to supply. Node never loads any of it in
production. Being lazy is simply not enough for AOT, which must compile
everything reachable, and pnpm has the package hoisted whether the app wants it
or not. So there is nothing to fix in `packages/` and this must not be worked
around there.

Perry does **not** require the package to exist: `dyn-missing.ts` shows a
dynamic import of a nonexistent package compiles cleanly and fails at runtime,
as it should. The route past this wall is therefore to keep the unused peer
dependency out of the example app's resolution, not to change activerecord.

## Wall 22, SOLVED, and the four preconditions a measurement needs (2026-11-04)

**Compiler: perry 0.5.1663, built from `main` at `a1ae27ee5`.**

### Wall 22: the expo-sqlite adapter is now opt-in

Fixed in trails#9724. `expo-sqlite` is an optional peerDependency, and trails
already reached its adapter correctly — `import type` plus a dynamic `import()`
— so Node never loads it in production. That is not enough for AOT: a literal
specifier in a dynamic `import()` is a **static edge** to a compiler that must
emit everything reachable. Two sites carried one (`activerecord`'s
`namespaces.ts` autoload map and `trailties/src/database.ts`), and the compile
walked into `expo-sqlite` → `expo-modules-core` → `react-native/index.js`, whose
Flow syntax the parser rejects.

The adapter now requires an explicit import; `register("expo-sqlite", …)` stays
so a misconfigured app still gets an actionable error naming the import, and
trailties resolves the class through `ConnectionAdapters.resolve`. Result:
react-native leaves the graph entirely and the boot graph grows **1874 → 1934
modules**, with `dynamic reach: 0 dynamic edges`.

Generalised into tasks RFC 0221 as a rule, with a sweep of all 20 optional peer
dependencies: two literal-specifier sites remain (`import("vitest")` and
`import("vite")` in actionpack's system-testing code) and both are latent — not
reachable from `08-serve.ts` today.

### Only three packages are read from `dist`; the rest from `src`

Measured from `-v` collect records: **`ruby-compat` (224 modules), `trailties`
(16) and `tse-compiler` (6)** resolve to `dist`. Every other `@blazetrails`
package is read from `src` — `activesupport` 190, `activerecord` 317,
`actionpack` 151, `actionview` 123, `i18n` 20, `nokogiri` 30, `rack-session` 7.

This matters because **an edit to one of those three is invisible to the compile
with no error and no warning.** It cost a wrong conclusion here: the expo fix
looked like it had failed when the compile had never seen it —
`trailties/dist/database.js` was four days old, and the only clue was a
`stage=resolve-import module=.../dist/database.js` record. It also means the
walls fixed in src-resolved packages (16–21) were measured against the edits, and
are not in doubt.

`perry-ladder-keep/check-dist-fresh.sh` guards the three. Note it must compare
against the newest file _inside_ `dist`, not the `dist` directory's own mtime:
`tsc` leaves the directory alone when it only rewrites existing files, so a
directory test reports "stale" forever.

### A from-source compiler needs three more build steps than the docs imply

Each of these fails in a way that looks like something else:

1. **Sidecars.** `scripts/gc_call_effects/sidecars.sh $PSRC/target/release` is
   mandatory, or every real compile refuses to start ("every runtime archive
   must carry a sidecar computed from its bytes"). A hello-world still compiles,
   so the toolchain looks healthy — a four-test validation suite ran and was
   silently void for this reason.
2. **`LIBRARY_PATH=/home/linuxbrew/.linuxbrew/lib`**, or `perry-gc-effects`
   fails to link on `-lzstd`: brew's llvm@22 links brew's zstd, and rust-lld
   does not search there.
3. **The ext archives**, one discovered per failed compile (~17 min each at this
   graph size). `perry target add --ext` cannot help — a from-source build has
   no trusted CLI update keys, so self-update is disabled. Build all 16 at once:
   `cargo build --release $(ls -d crates/perry-ext-* | sed 's|crates/|-p |')`.
   Then `perry-wasm-host` and `perry-component-host` as well; the `perry-ui-*`
   crates are platform targets a server app does not need.

### Do not pin the compiler to the commit this file's header names

`d74498b2` is **2614 commits** behind main. Pinning to it for reproducibility
produced four findings that do not survive re-validation (see the retraction
table in the previous entry), including a trails fix that was committed and
reverted. The binary used by the earlier runs came from a scratchpad that was
wiped, so its version was never recorded — which is the actual lesson: **record
the compiler commit in every entry.** This file now does.

## Wall 23, SOLVED, and the first full boot measurement (2026-11-04)

**Compiler: perry 0.5.1663 from `main` at `a1ae27ee5`, plus a 19-line local
patch (below).** With walls 16-23 all addressed, the boot graph compiles, links
and _runs_:

|                     |                                               |
| ------------------- | --------------------------------------------- |
| compile + link      | 1934 modules, 225,909,032-byte binary, 1384s  |
| `INIT:` lines       | **1318** of 1934                              |
| activerecord inits  | 232                                           |
| last module reached | `examples/perry-native/config/environment.ts` |

Execution is now inside **the application's own config**, past the whole
framework. (Not comparable to the earlier 1355/1939: different compiler,
different graph -- expo left it -- and that number was measured on a binary
whose compiler commit was never recorded.)

### Wall 23: the intrinsic atom is in the image twice

Any `RegExp` in a stdlib-linked binary aborted the process:

    panicked at crates/perry-runtime/src/regex/instance.rs:262:
    realm has installed the RegExp intrinsic

`IntrinsicPrivateReadSite::read` finds `RegExp.prototype` by **atom pointer
identity** (`STRING_TAG | self.atom.string as u64`). The atom's `ImageString`
lives in the `perry_strings` link section with `#[used(linker)]`, and
`perry-stdlib` statically embeds its own copy of `perry-runtime` -- so linking
`libperry_runtime.a` _and_ `libperry_stdlib.a` puts that string in the binary
twice. Counted in the two probe binaries: **1** copy runtime-only (works), **2**
with stdlib (panics). The key recorded on the global object and the word the
read site compares are then different pointers, the layout probe misses, and
`.expect()` aborts. The archives share **8967** strong symbols; perry's
`strip-dedup` addresses 20, all `js_ws_*` stubs.

Ruled out with tests, not reasoning: a stale `~/.cache/perry/libs` (moved aside,
identical panic), the auto-optimized feature set (`PERRY_NO_AUTO_OPTIMIZE=1`,
identical), and the runtime's `stdlib` feature being behavioural (it gates one
module, `stdlib_stubs`).

**Unblocked by patching the read** to retry with the agent's interned atom for
the same spelling when the pointer probe misses -- the hash is identical either
way. 19 lines in `private_storage_cache.rs`; all four regex probes pass after
it. The cleaner fix is upstream's to pick: do not link `libperry_runtime.a` when
`libperry_stdlib.a` is linked, since stdlib already contains the runtime and
that is the source of all 8967 collisions. Write-up and repro in
`upstream/regexp-intrinsic-stdlib/`.

The mechanism dates to `0ce7ab212` (2026-10-16, "intrinsic private reads compare
a static atom"), 2366 commits before HEAD. Released prebuilt archives contain
**zero** copies of the spelling -- they predate it -- so only a from-source or
post-release build hits this.

### Wall 24: a date/time value out of range in message_pack registration

    RangeError: date/time value is outside of supported range
        at fromEpochNanoseconds -> at -> atWithCoercion
        at active_support/message_pack -> rbEnsure -> withWarnings -> silenceWarnings

The suspect is `core-ext/time/calculations.ts:41`, where `current()` does
`RubyTime.at(new Rational(currentTimeInstant().epochNanoseconds, 1_000_000_000n))`.

**perry's native `Temporal` is not at fault** -- measured directly:
`Temporal.Now.instant().epochNanoseconds` is `1793829332030344559` (19 digits,
correct magnitude) and `Temporal.Instant.fromEpochNanoseconds` round-trips it.
Node has no global `Temporal`, so trails uses `@blazetrails/date`'s own
implementation; that, or the `Rational` arithmetic feeding it, is where to look.
The next probe is the `Rational(ns, 1e9)` -> `Time.at` path against both
runtimes.

Note this is the first wall to present as an ordinary JavaScript exception with a
named stack rather than a runtime panic or a silent stall, which makes it far
cheaper to chase than walls 16-23 were.

## Wall 24 — FIXED and verified (compiler a1ae27ee5, trails c576e7f9f2)

An override of `toString` on `class X extends Array` was not dispatched;
`Array.prototype.toString` ran instead, which per spec delegates to the
receiver's `join`. JSBI is `class JSBI extends Array`, so every JSBI value
stringified as its internal digit array, and `@js-temporal/polyfill`'s range
checks — built on JSBI — failed, taking down every `Time.at` / `Time.now` and
with them `config/environment.ts`.

Root cause: `crates/perry-runtime/src/value/to_string_array.rs`. Both sites
that decide which `toString` an array receiver runs asked
`builtin_prototype_value("Array")` for the method, so they saw only the
intrinsic `Array.prototype`. They detect a global monkey-patch — what they were
written for — and are blind to a subclass override and to an own property.

Fix: resolve the key on the receiver's own chain first via `js_get_property`,
falling back to the intrinsic lookup, returning `None` for the installed noop
thunk. 68 lines, saved as `perry-ladder-keep/wall24-array-tostring.patch`.
`array_prototype_to_string` is deliberately NOT patched: it is the generic
algorithm reached by `Array.prototype.toString.call(arr)`, and consulting the
receiver there would recurse forever.

Verified, all against node:

- all 7 call forms return the override (`array-subclass-tostring/forms.ts`)
- 5 regressions match: a plain array still joins; a subclass with no override
  joins; `Array.prototype.toString.call(m)` joins and does not recurse;
  `Object.prototype.toString.call(m)` is `[object Array]`; a global
  monkey-patch still wins
- standalone `jsbi@4.3.2` agrees with node on 9 operations, including the
  two values that were wrong before (`8640000000000000000000` and
  `3600000000000`)

It does NOT clear the ladder. `Time.at` still throws, for an unrelated reason
recorded as wall 25 (`upstream/temporal-range-limit/`): the polyfill's epoch
range limit measures `837292312000000` instead of `8640000000000000000000`.
Wall 24 was _a_ cause of that `RangeError`, not the only one.

### Two probe hazards worth re-reading before measuring

- A bare `jsbi` import does not resolve from `examples/perry-native`, and
  perry compiles it anyway — `Found 1 module`, no diagnostic — with every
  call returning `0`. The first wall-24 verification run "measured" exactly
  this and looked like a failure. Always check `Found N module`.
- `pnpm install` restores the two cycle-closing symlinks
  (`actionview -> actionpack`, `trailties -> activestorage`) that make module
  resolution OOM at 40GB. It did so three times in one session. Re-cut them
  after every install; `r46-postmerge.sh` aborts if they are back.

## Wall 25 — trigger minimized (compiler a1ae27ee5)

The garbage epoch bound is not a Temporal, JSBI or BigInt defect. It is a
9-line codegen bug, `upstream/toplevel-arg-over-int31/`:

    const o = { m(): void {} };
    const v = 65536 * 65536;
    console.log(v);        // 4294967296  correct
    console.log(probe(v)); // 0           WRONG
    function probe(t: number): number { o.m(); return t; }

Three conditions, each necessary and established by its own matrix:

1. the call site is at **module top level** (inside a function it is correct);
2. the argument is a **variable** whose value was **computed** and exceeds
   2^31−1 — the boundary is signed-int32 (`46340*46340` passes,
   `46341*46341` fails), the stored constant reads back correctly, and the same
   expression passed **inline** as a literal argument is correct;
3. the **callee's body makes a dynamic method call** — a local object's method,
   `console.log`, or a method on an imported default. A free function call is
   safe, and so are `Math.max`, `String`, `Number.isInteger`,
   `JSON.stringify` and `Date.now`, which are folded and emit no dynamic call.

The polyfill satisfies all three: `Ne=xo(ke)` at top level, `ke = 1e8*864e5`
= 8.64e15, and `xo` calling `e.BigInt`/`e.multiply` on the imported jsbi.

Four earlier repro attempts failed because their callees used
`Number.isInteger` or a bare `return t` — neither emits condition 3. The
earlier `console.log` filing was this same bug seen through one instance, and
is superseded.

Method note: the wrong value is often unwritten memory and differs per run of
the same binary, and **adding a `console.log` to a function introduces
condition 3**. Instrumentation must capture values and print them afterwards,
never print from inside the wrapped callee.

## Perry fixes live on a fork branch, and nothing is filed until the ladder clears

Every perry-side fix the ladder needs is a commit on `ladder/perry-native` in
the perry checkout, branched from `a1ae27ee5`. Nothing goes upstream until the
graph boots end to end; then the whole stack goes up together.

| commit      | wall                                          | crate         |
| ----------- | --------------------------------------------- | ------------- |
| `8f3abf116` | 23 — RegExp aborts a stdlib-linked binary     | perry-runtime |
| `a12e09d30` | 24 — `toString` override on an Array subclass | perry-runtime |
| `64e6fadb8` | 25 — out-of-range i32 constant arithmetic     | perry-codegen |
| `73b556b1e` | — LLVM unit workers ignore the cgroup cap     | perry-codegen |

The `perry/upstream/` directories stay as they are: they are the written-up
reproductions and measurement matrices, which are what makes the eventual
filing possible. They are no longer queued to be sent.

Two consequences for the runner scripts:

- **A precondition that asserts a fix is an uncommitted diff inverts the
  moment that fix is committed.** r46–r48 aborted unless
  `git diff --quiet` _failed_ on the wall-23 file. `r49-fork.sh` checks the
  branch name and greps the commit subjects over `a1ae27ee5..HEAD` instead.
- Patch copies under `perry-ladder-keep/` are now duplicates of commits.
  They stay as a recovery path if the branch is ever lost, but the branch is
  the source of truth.

## Wall 25's fix exposed a second defect: the compile OOMs on the merged graph

The merge took the graph from 1934 to **2300 modules**, and the compile was
OOM-killed at a 40G cgroup cap (2019s) and again at 44G (1666s) — _sooner_
with more memory, which is what says the worker count scales with something
other than the cap. Tarjan over the 216 workspace symlinks reports no cycles,
so the module growth is real and not a reintroduced resolution cycle.

`unit_workers()` returned the budget's CPU slots and read no memory figure at
all, so 12 physical cores meant 12 LLVM unit workers at ~1-2 GiB each
regardless of the cap. `PERRY_CODEGEN_MEMORY_MB` sets the budget's _memory_,
which that path never consulted — so lowering it changes nothing, and raising
the cap only lets the overcommit run longer. Fixed in `73b556b1e`.

**Raising the memory cap is the wrong first move when a compile OOMs.** Check
what the worker count is actually derived from first; here more memory made it
fail faster.

## The upstream fixes retired the stubs, and the measurement is what proves it

Trails main brought #9742 (dev toolchain off the production server graph),
plus #9747 (vite/vitest off statically-resolvable edges) and #9759
(colocated tests excluded from every package's published build). Those are
the real remedies for what r51's five `--module-alias` stubs were papering
over.

| run     | stubs    | modules  | outcome                    |
| ------- | -------- | -------- | -------------------------- |
| pre-fix | none     | ~2300    | OOM at `stage=lower`       |
| r51–r56 | five     | 2102     | compiles                   |
| r58     | **none** | **1962** | compiles and links, 201 MB |

The upstream fixes do not merely substitute for the stubs — they cut 140
modules _below_ what the stubs achieved, because a stub only hides a module the
graph still reaches. The stubs are deleted in `3e21597afa`.

**#9759 pays off only after a clean `dist`.** `tsc` does not delete the output
of a file it no longer compiles, so 2790 stale `*.test.js` sat in the dists
after the merge, and perry resolves those packages from `dist`, not `src`. The
exclusion buys nothing until the dists are wiped and rebuilt.

Two more things the merge moved. The hand-maintained list of dist-resolved
packages was wrong twice in one sitting (#9727 put rackup on trailties' build
path, #9763 put actionmailer on it); `tsc --build` over the root project graph
orders by dependency and removes the list entirely. And `pnpm install`
**recreates** the `@blazetrails` symlinks, so the cycle check has to run every
time — by Tarjan over the whole graph (`find-link-cycles.py`), not by
spot-checking the two legs that were known on 2026-11-04, since a newly added
package can close a cycle no hardcoded list mentions.

## A cold object cache, not the cap, is what OOMs a 1962-module codegen

r57 was killed at `stage=codegen` 1905/1962 against a 28G scope cap, where r56
had survived the same 28G with _more_ modules (2102). The difference is the
object cache: wiping every `dist` for #9759 changed every source hash, so r56
was mostly cache hits that never entered an LLVM worker and r57 was the first
genuinely cold codegen. r58 pinned `PERRY_CODEGEN_UNIT_JOBS=4` and compiled
clean at a _lower_ 22G cap — the pin, not a bigger cap, is the fix for a cold
run. (The pin is read before the cgroup budget, so it overrides the sizing from
`73b556b1e`. That is deliberate here; it is the same override that silently
defeated that fix in r49.)

Read `stage=` before touching any of this. r57 at `stage=codegen` is the LLVM
unit-worker phase where job counts and caps genuinely apply — unlike the
earlier OOMs at `stage=lower`, where they were irrelevant and the real cause
was the TypeScript compiler sitting in the graph.

## Wall 27: `FileStore` gets `undefined`, and it is perry-specific

Boot reaches 1339 init lines, past `config/environment.ts`, then:

    ArgumentError: wrong number of arguments (given 0, expected 1)
        at new FileStore / at lookupStore / at lookupStore

**That message is a hardcoded string**, not a count —
`activesupport/src/cache/file-store.ts:62` only tests `cachePath === undefined`.
The one established fact is that `cachePath` arrives `undefined`; the stack
trace says less than it appears to. Two `lookupStore` frames means the
`Array.isArray` recursion at `cache.ts:36` ran, so the config arrived in array
form.

**Running the ladder entrypoint under `tsx` is the cheapest thing that
localises this**, and it should come before writing any probe. Node boots clean
through cache setup to the last line of `08-serve.ts` and never raises this, so
the defect is in the compile, not in trails. Three perry probes all match Node
and clear their patterns: a conditional multi-spread `new`, `extractOptionsBang`
with a string last element, and a class-field template-literal array.

**There is no small repro for this wall.** Every route to `Application.config`
drags the framework in: a probe importing `Application` resolves 1768 modules
against the ladder's 1962, the same trap as the `db.js` repro that came out at
2112 — _more_ than the ladder. Check `Found N module` before trusting a probe
to be cheap. The loop that works is instrumentation inside the real binary,
which is what cracked the `db.js` symbol bug.

## Wall 28 — `Handler.Node` is undefined, and `/up` routed at `rails/health`

Both reproduced under `tsx`, so neither was the compiler's. The oracle found
each in one command; no probe was built.

`Handler.Node` is a type-only `declare static` (rackup `handler.ts:13`). The
runtime value is assigned by a side effect at the bottom of `handler/node.ts`,
and the only thing that loads that file is the dynamic `import()` in
`Handler.loadPath`, reached through `Handler.get("node")`. A rung that imports
`{ Handler }` alone gets `undefined` while TypeScript still types the call as
safe. The rung now imports `handler/node.js` for its side effect, which keeps
it on the direct path with 0 dynamic edges. Routing through `Handler.get` is
the deployed path but adds this graph's first dynamic edge — a separate rung.

The app's `routes.ts` still carried `rails/health#show`; the framework's
generator template emits `trails/health#show`. Stale app output, not a
framework bug.

## Wall 29 — a `const`-aliased rest-param export loses its rest bundling

A compiled request raised `TypeError: Cannot read properties of undefined
(reading 'includes')` in `ExceptionWrapper.get unwrappedException`.
`wrapperExceptions` is a cattr installed by `cattrAccessor.call(this, ...)` in
a static block, and under perry `cattrAccessor` installed NOTHING — no
prototype getter, no static accessor, and no exception.

Instrumenting `mattrAccessor` printed the answer:

    [mattrAccessor] entry syms="attr" len=4

`syms` is a rest parameter, so it must be an array. It was bound to the bare
string `"attr"`, and `len=4` is that string's CHARACTER COUNT — the same
signature as wall 27's `params=98`. `extractOptionsBang` then finds no hash,
`names` is empty, the loop runs zero times, and nothing is installed silently.

Minimal repro is 2 modules (`perry/probes/rest-imported.ts`). All three
conditions are required:

- the callee is a `const` alias of a function (`export const a = f`)
- it is imported across a module boundary
- it is invoked through `Function.prototype.call`

Imported function + `.call` works. Alias + direct call works. Only the
combination fails.

**Fixed in perry `c336c1aeb`** (fork branch `wall29-const-alias-rest`, off
`ladder/perry-native`), with `test-files/test_gap_const_alias_rest_call.ts`.

Root cause: the alias-wrapper fact table in `perry-codegen`'s
`codegen/artifacts.rs`. HIR records `export const alias = fn` as
`Export::Named { local: alias, exported: alias }` plus an `exported_functions`
entry, and `export_value_wrappers.rs` emits a forwarding
`__perry_wrap_<src>__alias` for every `exported_functions` entry. But the loop
that gives an alias wrapper its rest / synthetic-`arguments` facts (the
#5134-followup) only walked RENAMED `Export::Named` entries (`local !=
exported`). The const alias's wrapper therefore carried no rest index, and a
consumer that took the alias as a VALUE (`.call`, `.apply`) dispatched
positionally. A direct call never touches the wrapper, which is why it worked.
`.apply` was broken identically; the probe never tried it.

The first diagnosis, recorded here and in RECOMMENDED-WORK.md, blamed
`exported_func_has_rest` in `run_pipeline.rs`. That was wrong: line 1908
already copies `has_rest` to the alias through `exported_functions`. What
settled it was `--print-hir` on the 2-module probe, which showed I2 and I4 with
the IDENTICAL `PropertyGet { ExternFuncRef, "call" }` shape, so the difference
had to be in what the alias NAME resolves to as a value, not in the call site.

Verified: the 2-module probe matches tsx; `perry-codegen` 2720 passed / 0
failed / 1 ignored (the baseline); `cattr-mechanism.ts` (385 modules) reads
`["installed"]` with `M4 true`; `08-serve` compiles in 2103s and serves.

### Three hypotheses this cost, all killed at 1 module

Checking `Found N module` before trusting a probe's cost paid for itself.

- `declare` instance field shadowing the prototype getter with `undefined`.
  Perry matches the oracle exactly, including `own property? : false`.
- mixed spread + trailing argument (`f.call(this, ...names, options)`)
  mis-lowered. The most convincing theory — same `call_spread.rs` path as
  wall 27, and an empty `names` explains the silent no-op perfectly. All six
  forms matched.
- `pop()`/`length` wrong on a rest array built by wall 27's `js_array_slice`
  lowering. All three forms matched.

### `@blazetrails/activesupport/<subpath>` resolves from dist, not src

The first instrumentation printed nothing under `tsx`. activesupport's
`exports` maps `./*` to `./dist/*.js`, so Node runs `dist` while perry
compiles `src`. Only the BARE specifier reaches `src`. The hazard is general:
the oracle and the compiler can read different files, which makes a tsx
comparison meaningless without anything looking wrong. Check the `exports` map
before trusting a subpath comparison, and rebuild the dist or instrument the
file the oracle actually loads.

## Wall 30 — `/up` is 404: path-loaded application files are never compiled

With wall 29 fixed, `08-serve` serves:

    [08] env=production port=3178 status=404 len=795

against `status=200 len=73` under `tsx`. `log/production.log` says
`ActionController::RoutingError (No route matches [GET] "/up")`. The binary has
no routes at all.

`RoutesReloader#loadPaths` loads `config/routes.ts` with
`import(pathToFileURL(path).href + "?load=N")`. Perry cannot resolve a runtime
URL, so it compiles that site to a deferred runtime error, and
`config/routes.ts` is not among the 1962 modules. The error is reached at boot
and surfaces nowhere — boot completes and serves an empty route table. That
silence is a defect of its own, separate from the missing file.

### It is a class, not a routes bug

The compile log lists every deferred site. Of the fifteen, these load the
APPLICATION's own files by path and are reached by a production boot or
request:

| Site                                                  | Loads                          |
| ----------------------------------------------------- | ------------------------------ |
| `trailties` `application/routes-reloader` `loadPaths` | `config/routes.ts`             |
| `trailties` `engine` `load_environment_config`        | `config/environments/<env>.ts` |
| `trailties` `engine` `loadConfigInitializer`          | `config/initializers/*.ts`     |
| `trailties` `application` `configFor`                 | `config/<name>.ts`             |
| `trailties` `database`                                | `config/database.ts`           |
| `trailties` `trailties/action-controller`             | `app/helpers/*`                |
| `actionpack` `routing/mapper` `drawRoutes`            | `config/routes/<name>.ts`      |
| `actionview` `template`                               | compiled `.trails/views/*.js`  |
| `zeitwerk` `core-ext/kernel` `require`                | every autoloaded `app/` file   |

So rung 07's "initializers, autoloading, routes" was never true under perry:
the environment file, the initializers and every autoloaded constant are
missing the same way. Nothing failed because each miss is silent.

### Trails already has the mechanism, twice, and wires neither

- `X.loadPath["key"]` registries of literal `() => import("./file")` thunks —
  `ConnectionAdapters`, `Transformers`, `GlobalID`, `ActiveSupport`,
  `Handler`. Statically resolvable, which is why none of them shows up above.
- `trails build` writes `.trails/autoload/<tag>/imports.generated.js`, the same
  thunk map for every autoloadable constant, and zeitwerk's `require` prefers
  `loader.imports[cpath]` over `import(url)`. But nothing assigns
  `loader.imports` — on this branch or on trails `main` (`a7270c9593`) — so the
  manifest is written and never read.

The fix belongs in trails: one boot manifest that `trails build` emits for an
application's path-loaded files, keyed by absolute path, imported statically by
the AOT entry, and consulted by each site above before it falls back to
`import(url)`. Patching the rung to import `config/routes.ts` statically would
reach `status=200` and leave every other row broken and still silent.

Probes: `serve-handler.ts` (217 modules, rackup alone) and `serve-booted.ts`
(1962) both serve under perry, which is what cleared the server, the event loop
and `fetch`. An early read of a filtered strace blamed an early exit; the
`[08]` line was there all along, written before the buffered `INIT:` flush.

### Wall 30 is fixed by the boot file map (r64)

RFC 0224 landed on trails `main` (#9871: `trails build` writes
`.trails/boot.generated.js`, and `.trails/entry.generated.js` imports it before
`config/environment.ts`). Rungs 07 and 08 now import the generated entry, and
`run-ladder.sh` runs `trails build` first. Under `tsx`, rung 08 still answers
`[08] env=production port=3178 status=200 len=73`.

Under perry, r64 (compiler `84bc3026b`, trails `38657dc16b`) compiles 2151
modules in 2125s to a 215 MB binary. Boot now gets past the generated entry —
`INIT: examples_perry_native__trails_boot_generated_js` is reached — and stops
at wall 31, so the 200 is not confirmed natively yet.

Two notes from the merge that brought #9871 in:

- `config/storage.ts` is required now, as `config/storage.yml` is in Rails
  (`activestorage/lib/active_storage/engine.rb`, `active_storage.services`).
  The file added is the `trails new` template.
- The merge added the symlink cycle `trailties -> actionmailbox`.
  `perry-ladder-keep/cut-symlinks.txt` now cuts it, along with the two edges it
  already listed. `all.ts` loads both engines through computed specifiers, so
  perry logs `Could not resolve import` for them, and `rbFRequire` treats that
  as a `LoadError`.

## Wall 31 — a Proxy in the prototype chain is never consulted

    RangeError: Maximum call stack size exceeded
        at get (<anonymous>)
        at Configuration.appGenerators (<anonymous>)
        at trails/test_unit/railtie (<anonymous>)

#9791 (RFC 0221) moved `method_missing` traps off returned Proxies and into the
prototype chain. `Generators.prototype`'s parent is now a `Proxy`, so
`TestUnitRailtie`'s `c.testFramework(...)` resolves through that Proxy's `get`
trap.

`perry/probes/proxy-in-proto-chain.ts` is a 1-module repro of that shape:

| runtime | output                                     |
| ------- | ------------------------------------------ |
| `tsx`   | `own=true traps=1 r=["testFramework",1,0]` |
| perry   | `own=true traps=0 r={}`                    |

Perry never calls the trap for a name the instance does not have, and calling
the result returns `{}`. This is perry-specific. The returned-Proxy shape
`Configuration` still uses (`perry/probes/proxy-reflect-receiver.ts`) behaves
the same under both runtimes. The probe does not yet show how the miss becomes
recursion in the real `Generators`. That is the next step, and the fix belongs
in perry: a `Proxy` in the prototype chain gets `[[Get]]` / `[[Set]]` like any
other prototype.

### Wall 31 is fixed in perry (r65)

The trap is now consulted with the outermost receiver: when
`class_instance_property_value` finds a Proxy holder in the chain it calls
`proxy_get_with_receiver(proxy, key, outer)`, `outer` taken from the
accessor-receiver override. Perry commit `cef27a740` (local, fork policy),
probe `test-files/test_gap_proxy_proto_method_call_receiver.ts`. A coherent
rebuild matters here: `libperry_stdlib.a` embeds its own runtime copy, so a
runtime-only rebuild left r65 crashing exactly as before.

## Walls 32–39, to the first 200 (r66–r79)

| wall | symptom                                                         | cause                                                                                                                                    | fix                                                           |
| ---- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 32   | static method through a Proxy parent answers the wrong receiver | `class_prototype_get` had no Proxy branch                                                                                                | perry `aa69722b2`                                             |
| 33   | `new` with spread of an imported class builds the wrong object  | `callee_is_generic_construct_shape` ignored imported classes                                                                             | perry `4a70c0d4e`                                             |
| 34   | `/up` 404 again: `app/helpers` never compiled                   | `BOOT_PATHS` lacked helpers                                                                                                              | trails#9901                                                   |
| 35   | database config / `configFor` / storage config read by path     | config reads bypassed the compiled-file map                                                                                              | trails#9911 (`loadIseqEval`)                                  |
| 36   | `establishConnection is not a function`                         | a cyclic barrel's eager namespace mints `ConnectionHandler`'s prototype before its declaration registers; methods never installed        | perry `e701a76a1`                                             |
| 36b  | `super.has`, `instanceof Map` false on such a class             | the same early prototype was born linked to `Object.prototype`                                                                           | perry `b45837a6b`                                             |
| 37   | `Cannot read private member #identhash`                         | an imported `Hash extends Map` resolved its parent to ruby-compat's own `class Map` (Concurrent.Map): wrong layout, `new.target` unbound | perry `fbedce6ae`                                             |
| 38   | `LoadError: cannot load such file -- yaml`                      | Psych resolves yaml through `createRequire`, absent natively                                                                             | trails#9944 (`ruby-compat/psych-yaml`, imported by the build) |
| 39   | `isEos is not a function`                                       | `static Scanner = class Scanner {}` deduped onto the outer `Scanner`                                                                     | perry `8bfb521d4`                                             |

r79: `[08] env=production port=3178 status=200 len=73`, 2225 modules, 2245 s
compile. The `yaml` import adds 73 modules; `r61-serve.sh`'s cap is now 2300.

### Left open, off the ladder's path

- **wpfacts does not converge** on `ruby-compat/lib/string/encode.ts` in
  sub-programs (two units oscillate past 32768 rounds; the full program
  converges). Probes that pull ruby-compat need `PERRY_PROGRAM_FACTS=0`.
- **Name-keyed parent walks.** About a dozen codegen sites walk
  `extends_name` through `ctx.classes` by name (`dynamic_dispatch.rs`,
  `static_dispatch.rs`, `number_string.rs`, `new_alloc.rs`,
  `new_error_init.rs`, `type_analysis/predicates.rs`, ...). Wall 37 fixed the
  two the crash went through; the rest can still confuse a builtin parent with
  a same-named class.
