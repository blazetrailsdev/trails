# Can a trails app compile to a native binary with Perry?

Measured 2026-10-11 against **Perry 0.5.1520**, clang 23.1.3, on a 60GB
x86_64 Linux box, against `examples/perry-native` — a stock `trails new`
scaffold plus one `trails g scaffold Trail name:string length:integer`.
Reproduce with `perry/run-ladder.sh`; setup is in [README.md](README.md).

**Short answer: no, and there are two separate walls. Neither is a missing
language feature, and the second one cannot be fixed from this repo at all.**

## The ladder

| Rung                                                                    | Node | Perry        |                            |
| ----------------------------------------------------------------------- | ---- | ------------ | -------------------------- |
| `02-class` — classes, `#private` fields, accessors, static blocks       | ok   | **ok**       | 2s, 17MB                   |
| `03-proxy` — `Proxy` `get` trap + `methodMissing`                       | ok   | **ok**       | 2s, 17MB                   |
| `04-activesupport` — one named import from `@blazetrails/activesupport` | ok   | **MEM**      | killed at 12GB after 86s   |
| `05-model` — an `ActiveRecord` model class, no connection               | ok   | **MEM**      | killed at 12GB after 261s  |
| `06-sqlite` — `better-sqlite3`                                          | ok   | **ok\***     | 8s, 30MB — but see below   |
| `04a-local-modules` — control: multi-file graph, no package import      | ok   | **ok**       | 17MB                       |
| `04b-deep-import` — control: bypasses the package barrel                | ok   | not measured | needs wall 2 cleared first |
| `07-boot` — full framework boot                                         | ok   | **MEM**      | killed at 12GB after 689s  |

Every rung runs correctly under Node, so each `MEM` is Perry's ceiling and not
a broken program.

## What works, including what the docs say should not

perryts.com lists `Proxy` among the unsupported dynamic patterns. It is the
most load-bearing idiom in trails — 39 non-test source files across every core
package construct one — so it looked like the project-ending blocker. It is
not. Rung `03` compiles a `get` trap with a `methodMissing` fallback and the
binary prints the right answer, including for a property that exists only
through the trap. Static blocks, `#private` fields and accessor pairs survive
too, which matters because `abstractClass` assignment and
`ApplicationRecord`'s shape depend on them.

The language subset is not what blocks trails.

## Wall 1: peak codegen memory

`04-activesupport` imports exactly two functions, `camelize` and `underscore`.
Perry reports:

    Found 429 module(s): 429 native, 0 JavaScript

The module _count_ is the problem, not module graphs as such: the
`04a-local-modules` control compiles a two-file local graph to a working 17MB
binary. 429 modules for two functions, because `@blazetrails/activesupport`'s entry
point re-exports 145 names and its `dist/` is 574 files. Perry has no
tree-shake step ahead of codegen, so one named import is a whole-package
compile.

Uncapped, that rung reached **27GB RSS**, exhausted this machine's 15GB of
swap, and had not finished after 11 minutes. That is why `run-ladder.sh` caps
Perry, and why the cap is not optional — uncapped it takes the machine down
rather than reporting a result.

**Raising the cap does not help, and the progress counter does not mean what it
looks like.** The same rung was killed at:

| Cap  | Killed at                        |
| ---- | -------------------------------- |
| 12GB | `modules finished 420/429 (98%)` |
| 20GB | `modules finished 252/429 (59%)` |

More headroom, _less_ apparent progress. So "98%" is not "nearly succeeded" —
peak memory is spent inside the oversized-module LLVM phase, which that
counter does not track, and where the kill lands varies run to run. Any
estimate of "how close is this" from that counter is worthless.

**Serializing codegen makes it worse, not better.** Perry logs

    [perry] codegen: 2 oversized module(s) will run exclusively to cap peak memory

and exposes `PERRY_MODULE_JOBS` x `PERRY_CODEGEN_UNIT_JOBS` (2x2 by default),
so turning both to 1 was the obvious first experiment. With `MemoryMax=24G` —
twice the parallel run's cap — it was OOM-killed at **29%**, stuck on
`packages/activesupport/src/core-ext/object/json.ts`, a 333-line file. Serial
codegen puts one module in one unit, and that module alone does not fit in
24GB. Parallel mode splits it across units and gets further. The knob is the
wrong lever.

## Wall 2: Perry's npm build cannot link WebAssembly

This is the one that matters, and the memory wall was hiding it.

A narrower entry point into the same package family — importing only
`activesupport/dist/core-ext/object/json.js` — **completes codegen**: 364
modules, 100%, 7.3 minutes, inside a 20GB cap. It then fails at the link step:

    Error: WebAssembly.* used but libperry_wasm_host.a not found.
    Build it with: cargo build --release -p perry-wasm-host

`libperry_wasm_host.a` is not in the `@perryts/perry` npm package. The
instruction is to build it from a Perry source checkout, which the npm
distribution does not include. So this is not something trails can fix, work
around, or configure — any trails graph reaching WebAssembly cannot be linked
by an npm-installed Perry at all.

### Where the WebAssembly comes from, and why it is not a trails bug

The chain is:

    activesupport (barrel) → xml-mini/nokogiri.ts → @blazetrails/nokogiri
                           → libxml2-wasm → WebAssembly

It is worth being precise about the last hop, because it looks like a trails
defect and is not one. `@blazetrails/nokogiri` is an **optional** peer
dependency of activesupport, and activesupport loads it the correct way — a
lazy dynamic import, guarded, with a real error message if it is absent
(`packages/activesupport/src/xml-mini/nokogiri.ts:46`):

    nokogiri = (await import(NOKOGIRI_PACKAGE)) as unknown as NokogiriModule;

Perry const-folds that specifier and collects the target eagerly, so an
optional backend nothing calls is pulled into the compilation unit and drags
`libxml2-wasm` with it. Under Node the import never runs unless you ask for
the Nokogiri XML backend.

So trails is doing the right thing and Perry is over-collecting. Changing
trails to satisfy Perry here would mean making a correctly-lazy optional
dependency less lazy, which is a regression for every other consumer. **Do not
do that.**

## The SQLite result is weaker than it looks

Rung `06` is green, and it would be easy to read that as "the database driver
works". It does not mean that. At `-vv`:

    note: serving `better-sqlite3` from the bundled native binding
    `perry-ext-better-sqlite3` (a partial drop-in), ignoring your installed
    `node_modules/better-sqlite3`

Perry substitutes its own partial reimplementation and never compiles the
installed driver — which is also why this rung finds 1 module instead of
hundreds, and why it is the only package-importing rung that passes.

And it is not one package. All five Perry substitutes here are load-bearing
for trails:

| Shimmed package  | What trails uses it for                              |
| ---------------- | ---------------------------------------------------- |
| `better-sqlite3` | the SQLite adapter — the scaffold's default database |
| `pg`             | the PostgreSQL adapter                               |
| `mysql2`         | the MySQL adapter                                    |
| `commander`      | the `trails` CLI's argument parsing                  |
| `dayjs`          | `@blazetrails/date`                                  |

A native build of a trails app therefore replaces **all three database
adapters**, the CLI's argument parser and the date library with partial
drop-ins, silently. A green compile says nothing about whether any of them
behaves the way ActiveRecord expects. Auditing that list is probably more work
than either wall above.

## `perry check` is not evidence

`perry check` passes on the full application entry point, with
`--check-deps --deep-deps`, including on rungs that cannot compile:

    All checks passed! - 1 file(s) checked
    [OK] Parsing, HIR lowering, and dependency checks passed
         (codegen not verified — run `perry compile` for end-to-end validation)

Its own last line says why. Treat only `perry compile` as a result.

## If someone picks this up

1. **Wall 2 first, because it is upstream and absolute.** Either get a
   `libperry_wasm_host.a` (build Perry from source, or ask the project to ship
   it in the npm package), or confirm from Perry's side whether the eager
   collection of a const-folded dynamic `import()` is intended. Until one of
   those moves, the memory work buys nothing — a graph that compiles still
   will not link.
2. **Do not spend more time on the parallelism knobs.** Measured: serial is
   worse, and a bigger cap is not better.
3. **If Wall 2 clears, attack the 429.** `04b-deep-import` imports the
   defining module instead of the barrel and measures how much of that graph
   the barrel is responsible for. If most of it is, the lever is subpath
   exports for the hot leaves on the trails side, which would cut compile cost
   for every AOT consumer and not just Perry. Measure before touching any
   package's `exports` map.
4. **Do not trust a green rung that imports a shimmed package** until
   `perry.compilePackages` has compiled the real one and that adapter's own
   tests have run against it.
5. **Nothing here asks trails to change.** No framework defect was found by
   this work. The barrel-export question in (3) is an unmeasured performance
   lever, not a bug, and the nokogiri chain is explicitly Perry's to fix.
