# Perry — compiling a trails app to a native binary

[Perry](https://www.perryts.com) (`@perryts/perry`) is an ahead-of-time
compiler: it parses TypeScript with SWC, generates machine code with LLVM, and
statically links its own runtime and garbage collector. The output needs no
Node, Bun or Deno on the machine that runs it.

This directory is a **prototype**, not a supported build path. It answers one
question — _how far up a trails application can Perry get today?_ — and it
answers it mechanically, so the answer can be re-checked against a later
Perry.

The application around it is an ordinary `trails new` scaffold with one
`trails g scaffold Trail name:string length:integer` resource. Nothing in
`app/`, `config/` or `db/` is written for Perry, which is the point: the
subject under test is stock trails output.

## Setup

Perry needs clang for codegen. Without it even `hello.ts` fails to link —
the statepoint rewrite needs an assembler:

    brew install llvm                 # or: sudo apt install clang
    export PERRY_LLVM_CLANG=/home/linuxbrew/.linuxbrew/opt/llvm/bin/clang

    npm install -g @perryts/perry
    perry doctor                      # every check must be [OK]

`perry doctor` also warns about a missing `perry.toml`. The prototype does not
carry one: Perry takes an entry `.ts` file and needs no project config, and a
config file would hide which flags the results below actually depend on.

## Working in a fresh checkout or worktree

`examples/*` is a workspace member, so the example resolves `@blazetrails/*`
to `packages/*` in the _same_ checkout and needs their `dist/` built there.
Two traps, both hit while setting this up:

- `pnpm install` runs the example's `prepare`
  (`trails-tsc-views build --views app/views`) before the workspace packages
  are built, and it fails. Install with `--ignore-scripts` first, build the
  packages, then run `prepare` by hand.
- Copying a prebuilt `dist/` from another checkout brings its
  `.tsbuildinfo`, and `tsc` then reports success while emitting nothing. If a
  source change does not show up in `dist/`, delete `dist/` _and_ every
  `*.tsbuildinfo` before rebuilding.

Note that `pnpm --filter @blazetrails/example-perry-native... build` currently
fails in `activesupport` on `src/cache/file-store-atomic-write.trails.test.ts`
(`Property 'on' does not exist on type 'Worker'`). That is pre-existing on
`main` and unrelated to this example.

## The ladder

`perry/ladder/` is a sequence of small programs, each adding one layer of what
a trails app does. They are deliberately boring — the interesting part is the
first one that fails, because that names the layer that blocks a native build.

| Rung                     | What it adds                                                                 |
| ------------------------ | ---------------------------------------------------------------------------- |
| `02-class`               | plain classes, `#private` fields, accessors, static blocks                   |
| `03-proxy`               | a `Proxy` `get` trap falling back to `methodMissing` — the core trails idiom |
| `04-activesupport`       | a leaf import from a `@blazetrails/*` package                                |
| `04a-local-modules`      | control: a 2-module local graph, no package import                           |
| `04b-deep-import`        | control: an activesupport leaf, barrel bypassed                              |
| `04c-ruby-compat`        | real framework code below the activesupport cluster                          |
| `04d-ruby-compat-barrel` | the same function through `ruby-compat`'s barrel                             |
| `05-model`               | an `ActiveRecord` model class definition, no connection                      |
| `06-sqlite`              | `better-sqlite3`, a native N-API addon                                       |
| `07-boot`                | the full framework boot: initializers, autoloading, routes                   |

Every rung is also run under Node, so a row distinguishes "Perry cannot do
this" from "this program was broken anyway".

    PERRY=$(which perry) ./perry/run-ladder.sh

Binaries and the full compiler output land in `tmp/perry/` (git-ignored).

## WebAssembly

Rungs that reach `@blazetrails/nokogiri` pull in `libxml2-wasm`, and an
npm-installed Perry cannot link WebAssembly at all — the reasons are in
[FINDINGS.md](FINDINGS.md) ("Wall 2"), including what building
`libperry_wasm_host.a` from source does and does not fix. There is nothing to
configure here; the rungs that hit it are expected to fail.

## Results

See [FINDINGS.md](FINDINGS.md), and [runtime-graph.md](runtime-graph.md) for
the separate, non-Perry finding about the runtime module graph.

## Memory caps

`run-ladder.sh` runs Perry inside a `systemd-run` scope with `MemoryMax=$MEM`
(default 8G) and `MemorySwapMax=0`. This is load-bearing, not tidiness:
uncapped, a rung that imports a `@blazetrails` package reached 27GB RSS and
exhausted this machine's swap without finishing. A rung reported as `MEM` or
`TIMEOUT` tripped a cap, which is a result and not a harness error.

Raising `MEM` does not rescue those rungs and serialising codegen
(`PERRY_MODULE_JOBS=1 PERRY_CODEGEN_UNIT_JOBS=1`) makes them worse. Both are
measured in [FINDINGS.md](FINDINGS.md) — read it before re-running those
experiments.
