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

### Bug 3b — `static ShapeId refused by the shape mint` (live, unreported)

With 3a fixed, the 137-module barrel rung gets further and then aborts at
startup with an explicit internal-invariant failure:

    Perry internal error: the static ShapeId 0x80000505 (proto 0x400000000000000c)
    was refused by the shape mint (it is outside the static band or already names
    other facts in this agent); a static id must name one shape

Deterministic across runs. Current state on `main` (0.5.1659), by graph size:

| Rung                           | Modules | Result on `main`                                  |
| ------------------------------ | ------- | ------------------------------------------------- |
| `04c-ruby-compat`              | 54      | compiles, runs correctly                          |
| `inc-only` (deep `include.js`) | 58      | **now** compiles and runs correctly (3a fixed it) |
| `04d-ruby-compat-barrel`       | 137     | compiles and links, aborts on the shape mint      |

So Wall 3 is two bugs deep: fixing the first revealed the second. 3b is a
genuine candidate to report — it is Perry's own invariant check firing, not a
misuse — but it has not been minimized, so it is not filed. Reproduce with
`04d-ruby-compat-barrel` against a from-source `main`.

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

1. **Do not file Wall 3a — already fixed on `main`, just unreleased.** Verified
   by building the compiler from source. What would help is asking the Perry
   project to cut a release past 0.5.1520 (2026-09-11); until then a
   from-source build is the only way to get it.
2. **Wall 3b, the shape mint, is the live one.** Deterministic, and it is
   Perry's own invariant check firing rather than a misuse. Reproducible with
   `04d-ruby-compat-barrel` against a from-source `main`. Minimize it before
   filing, the way 3a was cut to six lines — a 137-module reproducer that needs
   a trails checkout is not something a compiler maintainer can act on.
3. **Ask Perry for a `wasm-host`-enabled runtime in the npm package** (Wall 2),
   or confirm whether eager collection of a const-folded dynamic `import()` is
   intended. Until then any graph reaching `libxml2-wasm` is unlinkable.
4. **Do not spend more time on the memory knobs.** Serial is worse and a bigger
   cap is not better; both measured above.
5. **Do not trust a green rung that imports a shimmed package** until
   `perry.compilePackages` has compiled the real one and that adapter's own
   tests have run against it.
6. **ruby-compat's circular imports are worth a look on their own.** Six
   circular groups, one of 28 modules, found while diagnosing Wall 3. They are
   not the cause of any Perry failure here, but circular value imports in the
   foundation layer are a genuine code-quality question and they pair with the
   module graph measured in [runtime-graph.md](runtime-graph.md).
7. **Nothing here asks trails to change for Perry's sake.** Every wall is
   Perry's and no change in this repo moves them.
