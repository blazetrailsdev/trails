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
| `06d-adapter-read` — adapter reads rows, no model layer           | ok   | _not run_   | 1133 modules collected; see below              |
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
| 06d-adapter-read     | 1133    | never run        | 8.91 GiB | wall 8 cleared; walls 9-11 (sqlite ext)   |

**Nothing fails to compile any more.** Peak is linear at roughly 8 MiB per
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

## Walls 9-11: three sqlite-ext defects, and the mask that hid them

06d-adapter-read is not blocked by another instance of wall 8. It is blocked by
three independent defects in Perry's **own** better-sqlite3 extension, plus a
fourth bug that made all of them illegible. Finding them took eleven refuted
hypotheses, every one of them mine and every one from reading source instead of
running a probe; every confirmed fact below came from a probe with a Node
control on identical source. The ratio is the lesson.

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

### Wall 10 - `stmt.run()` on a row-returning statement returns `undefined`

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

### Wall 11 (the mask) - a leaf class loses its own method, silently

Every failure above reported `TypeError: setQuery is not a function`, with the
real error destroyed. `abstract-adapter.ts:1857` calls `ex.setQuery` after
`ex instanceof StatementInvalid` passes, and the method is absent.

Instrumented at four points, the method is missing **at construction**; the
later `activeRecordError.stack = ...` write is innocent:

```
[m1] in ctor: typeof this.setQuery=undefined proto-has=false
[m3] before stack write: undefined     [m4] after: undefined
```

The prototype chain shows only the leaf affected:

```
node:  StatementInvalid:[constructor,setQuery] -> AdapterError:[constructor,connectionPool] -> ...
perry: StatementInvalid:[constructor]          -> AdapterError:[constructor,connectionPool] -> ...
```

`Object.getPrototypeOf(si) === StatementInvalid.prototype` is `true`, so this is
not a duplicate class and **not** a wall-8 name collision - there is exactly one
`StatementInvalid` in the monorepo. Every other class in the five-deep chain
kept its members. `QueryAborted`, its subclass, inherits the hole.

A minimal five-deep `Error` chain with a `prototype.name` mutation does **not**
reproduce it (`probe/db-read/errchain.ts` matches Node), so chain depth is not
the trigger. The open hypothesis, under test in `probe/db-read/prune.ts`, is
dead-method pruning: `setQuery`'s only call site is a `catch (ex)` receiver
narrowed by `instanceof`, never a statically-typed one.

Nothing upstream matches, across eight search phrasings.

### Corrections to earlier entries in this file

- The `Version`/`Gem::Version` collision was **not** the cause. Renaming the
  ruby-compat class left the error byte-identical.
- But my follow-up claim that "no version query happens on this path" was also
  wrong: `[z0]` shows the failing statement is `SELECT sqlite_version(*)`. The
  version query _is_ the path; the collision just is not why it fails. Markers
  placed inside `getDatabaseVersion`/`queryValue` never fired even so - those
  are mixin functions spliced onto the prototype
  (`abstract/database-statements.ts:1014`), which may be the same
  member-attachment family as wall 11.
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
dispatch path. All eleven match Node exactly.

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

| Issue                                                  | Subject                                                                       | State                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------- |
| [12978](https://github.com/PerryTS/perry/issues/12978) | constraint check compares a type parameter's `TypeVar`, not its instantiation | filed                   |
| [12979](https://github.com/PerryTS/perry/issues/12979) | contributor docs cannot produce a working from-source build                   | filed                   |
| [12990](https://github.com/PerryTS/perry/pull/12990)   | **PR** — lift a TDZ check out of a spread call's member callee                | **merged** `ccad647e7a` |
| [12889](https://github.com/PerryTS/perry/issues/12889) | parentless class emits a `super` construct (pre-existing report we closed)    | **closed** by 13001     |
| [13001](https://github.com/PerryTS/perry/pull/13001)   | **PR** — no live heritage for a class that extends nothing                    | **merged** `71a8beb530` |
| [13009](https://github.com/PerryTS/perry/pull/13009)   | **PR** — three `cargo test` failures on `main` (CI, not our rung)             | **merged** `ce79cdac2f` |
| [13091](https://github.com/PerryTS/perry/pull/13091)   | **PR** — follow an import+export hop when classifying a namespace             | **merged** `22ad61bd`   |

Both re-verified against `main` @ `20fde48d` immediately before filing, and
both duplicate-searched first. 12978's reproducer is the 23-line
`inQueryConnection` case and the warning text is unchanged from 0.5.1520.
