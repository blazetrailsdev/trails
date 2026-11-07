# Perry native ladder — recommended work after Wall 30

As of 2026-11-07. Companion to [FINDINGS.md](FINDINGS.md), which records the
walls. This file says what to do next and why.

## Recommendation in one paragraph

Give trails a **boot manifest**: `trails build` emits one statically
importable map from each path-loaded application file to a literal
`() => import("./file")` thunk, the AOT entry imports it, and every site that
loads an application file by path consults it before falling back to
`import(url)`. That is Wall 30, and it is a trails change, not a perry one.
Then make a reached deferred import fail loudly, so the next miss is an error
and not an empty route table.

## Where the ladder stands

| Run | Result                                     | Note                               |
| --- | ------------------------------------------ | ---------------------------------- |
| r61 | serves, dies in `ExceptionWrapper`         | wall 29                            |
| r62 | `COMPILE_RC=0` 2103s, `status=404 len=795` | wall 29 fixed; wall 30 = no routes |

The compiled binary boots, listens, accepts, routes through the full Rack
stack and renders a response. The only thing between it and `status=200` is
that the application's own files were never compiled in.

Wall 29 is fixed on perry `c336c1aeb` (branch `wall29-const-alias-rest`, off
`ladder/perry-native`, worktree `/home/dean/github/perry-wall29`, not pushed).
`perrysrc/target/release/perry` is that build; the previous binary is
`perry.pre-wall29`. Note `r61-serve.sh` prints the perrysrc HEAD as "compiler",
which is NOT what the binary was built from.

## Wall 30 — the work

Nine sites load application files by path (table in FINDINGS). Trails already
has both halves of the remedy and connects neither:

- the `X.loadPath["key"]` thunk-registry convention, used for framework files
  and statically resolvable;
- `trails build`'s `.trails/autoload/<tag>/imports.generated.js`, which
  zeitwerk's `require` would prefer over `import(url)` — but nothing assigns
  `loader.imports`, on this branch or on trails `main`.

### Suggested order

1. **Survey on trails `main` first.** This branch is 83 commits behind. Confirm
   the nine sites still exist and that `loader.imports` is still unassigned.
2. **Wire the autoload manifest.** Assign `loader.imports` from the generated
   map at boot. It already exists and is the largest row.
3. **Add the boot manifest** for `config/routes.ts`, `config/routes/*`,
   `config/environments/*`, `config/initializers/*`, `config/*.ts`
   (`configFor`, `database`), `app/helpers/*` and compiled views — keyed by
   absolute path, one helper every site calls.
4. **Make a reached deferred import loud** — likely a perry change (the
   deferred error is not surfacing), worth a 1-module probe before deciding.
5. **Rerun `r61-serve.sh`.** Expect `[08] env=production status=200 len=73`.

Each of 2 and 3 is its own trails PR with tests there; re-vendor separately.

### What not to do

Import `config/routes.ts` statically in the rung. It reaches `status=200` and
leaves environments, initializers and autoloading missing and silent — and it
draws the routes twice once the real fix lands.

## How the time went, so it is not re-spent

- **Read the full syscall trace, not a filtered one.** A `bind|listen|connect`
  strace filter showed `connect` then `exit_group` and read as an early exit.
  The unfiltered trace shows the request served and `[08] ... status=404`
  written; it sat mid-stream, ahead of the buffered `INIT:` flush, so `tail`
  missed it. One probe and one 37-minute compile went to the wrong question.
- **Check the app's log.** `log/production.log` named the defect in one line.
- **`--print-hir` beats reading pipeline code.** For wall 29 it showed I2 and
  I4 with identical call shapes, which moved the search from the call site to
  the alias's value wrapper and disproved the earlier written diagnosis.

## Operational rules (unchanged)

Cap for the heaviest stage (`CAP=32G NEED_GIB=34` for the full rung), pin
`PERRY_CODEGEN_UNIT_JOBS=4`, and run one heavy job at a time, each in its own
`systemd-run --user --scope -p MemoryMax=…`. A full rung recompile is ~35
minutes even when only the compiler changed, because the object cache keys on
it.

## Still open, ranked below Wall 30

| Item                        | State                                                                |
| --------------------------- | -------------------------------------------------------------------- |
| `file:` URL used as a path  | boot opens `<cwd>/file:/…/trailties/dist/templates`; seen in strace  |
| Wall 16                     | unfixed; uncommitted i18n scaffolding in `perry-ladder-keep/`        |
| `d9348c8b6` fate            | no-op for its wall, broke the test build; reverting is a design call |
| `PERRY_DEBUG_CLASS_SYMBOLS` | committed in `5d1fe9b5a`; keep or gate                               |
| Nokogiri fix                | branch-only; reverses #9416's documented decision                    |
