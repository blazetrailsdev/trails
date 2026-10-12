# Can a trails app compile to a native binary with Perry?

Measured 2026-10-11 against **Perry 0.5.1520**, clang 23.1.3, on a 60GB
x86_64 Linux box, against `examples/perry-native` — a stock `trails new`
scaffold plus one `trails g scaffold Trail name:string length:integer`.
Reproduce with `perry/run-ladder.sh`; setup is in [README.md](README.md).

**Real trails framework code does compile and run as a native binary.** A
54-module slice of `@blazetrails/ruby-compat` produces a working 21MB
executable with correct output. The whole application does not, and is blocked
by three distinct walls, all of them Perry's. One of them is a plain Perry bug
worth reporting upstream.

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

## Wall 2: WebAssembly cannot be linked by an npm-installed Perry

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

## Wall 3: module initialization order — a Perry bug, and not workaroundable

`04d-ruby-compat-barrel` compiles **and links** (139 modules, 40MB) and then
dies immediately:

    TypeError: Object.setPrototypeOf called on null or undefined
        at packages/ruby-compat/src/include.ts:1953

That line is `Object.setPrototypeOf(rbCClass, Module)`. `rbCClass` is imported
from `./object.js`, where it is `export const rbCClass = rbDefineClass("Class")`
(`object.ts:236`). It is `undefined` when `include.ts`'s top-level body runs,
so `object.js` had not been evaluated yet. The same code reached directly
(`04c`) works; reached through the barrel (`04d`) it crashes.

### Why it is still Perry's bug, although ruby-compat has cycles

Perry documents the right intent — `init_order.rs` topologically sorts by
import dependency so "a module that imports from another module runs after
that other module's initializer", and "cycles are broken at the back-edge".

`ruby-compat/src` does contain circular value imports: 6 circular groups,
including one of 28 modules (`array`, `hash`, `comparable`, `complex`,
`enumerator`, …) and a 2-module `include ↔ variable` pair. An earlier revision
of this document claimed the graph was acyclic. **That was wrong**, and the
cycle-breaking is the likely mechanism.

But it does not excuse the result, because **`include.ts` and `object.ts` are
in different circular groups** — `include` sits in `{include, variable}`,
`object` in the 28-module group. Condense each group to a node and the
remaining graph is a DAG in which `include`'s group depends on `object`'s. A
valid initialization order therefore exists and is unambiguous for this pair;
Perry did not find it. Breaking a cycle perturbed the order of a module
_outside_ that cycle.

### A workaround was tried and does not work

The obvious nudge — making the barrel force the dependency first, by putting

    import "./object.js";

as the very first statement of `ruby-compat/src/index.ts` — was implemented,
`dist` rebuilt, and `04d` recompiled. **It changes nothing**: still 139
modules, still the same crash at the same line. Perry honours neither the
dependency edge nor an explicit first-statement side-effect import for this
module, which makes the defect sharper and the prospects for a trails-side
workaround correspondingly worse. The experiment was reverted.

The only thing that avoids Wall 3 is not importing through the barrel, which
is what `04c` does. That is available to a diagnostic rung and not to real
application code, which imports `@blazetrails/*` by package name — and it
would buy nothing anyway while Walls 1 and 2 stand.

So: report it upstream. `04d-ruby-compat-barrel` is a 139-module reproducer,
and the one-line barrel experiment above is worth including, since "an
explicit side-effect import does not fix it" narrows the cause considerably.

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

## `perry check` is not evidence

It passes on the full application entry point with `--check-deps --deep-deps`,
including on rungs that cannot compile, and says why itself:

    [OK] Parsing, HIR lowering, and dependency checks passed
         (codegen not verified — run `perry compile` for end-to-end validation)

Treat only `perry compile` — and then running the binary — as a result.

## If someone picks this up

1. **Report Wall 3 upstream first.** It is small, reproducible, needs no trails
   knowledge, and blocks everything above 139 modules regardless of memory.
   `04d-ruby-compat-barrel` is the reproducer.
2. **Ask Perry for a `wasm-host`-enabled runtime in the npm package** (Wall 2),
   or confirm whether eager collection of a const-folded dynamic `import()` is
   intended. Until then, any graph reaching `libxml2-wasm` is unlinkable.
3. **Do not spend more time on the memory knobs.** Serial is worse and a bigger
   cap is not better; both measured above.
4. **Do not trust a green rung that imports a shimmed package** until
   `perry.compilePackages` has compiled the real one and that adapter's own
   tests have run against it.
5. **Nothing here asks trails to change for Perry's sake.** All three walls are
   Perry's and no change in this repo moves them. The separate, real trails
   finding this work turned up — the runtime module graph and `ruby-compat`'s
   barrel — is in [runtime-graph.md](runtime-graph.md) and stands on cold-start
   and bundle-size evidence, not on the native-build story.
