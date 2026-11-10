# Perry native ladder — recommended work after the first 200

As of 2026-11-10. Companion to [FINDINGS.md](FINDINGS.md), which records the
walls. This file says what to do next and why.

## Recommendation in one paragraph

Rung 08 serves: the compiled binary boots production through
`.trails/entry.generated.js` and answers `/up` with `status=200 len=73` (r79).
The ladder's remaining value is keeping that true. Land trails#9944, rebase
the ladder onto main, and turn r79's command into a repeatable check. Then aim
the same binary at a real application (trailmap) rather than adding rungs:
its walls are the ones users will hit.

## Where the ladder stands

| Run | Result                                  | Note                                 |
| --- | --------------------------------------- | ------------------------------------ |
| r62 | `status=404 len=795`                    | wall 30: application files not built |
| r64 | wall 31 (Proxy in prototype chain)      | wall 30 fixed by the boot file map   |
| r74 | `establishConnection is not a function` | walls 31–35 fixed                    |
| r79 | `[08] env=production status=200 len=73` | walls 36–39 fixed; 2225 modules      |

Every wall from 31 on is in FINDINGS' "Walls 32–39" table. Trails fixes:
#9901 and #9911 (merged), #9944 (draft: Psych's yaml backend). Perry fixes are
local commits on `wall29-const-alias-rest` in `/home/dean/github/perry-wall29`
(fork policy: never pushed): `c336c1aeb` `cef27a740` `aa69722b2` `4a70c0d4e`
`e701a76a1` `b45837a6b` `fbedce6ae` `8bfb521d4`, each with a gap test under
`test-files/`. `perrysrc/target/release` holds that build; the runtime
archives must be rebuilt together (`libperry_stdlib.a` embeds a runtime copy)
and their GC-effects sidecars regenerated.

## Next, in order

1. Merge trails#9944; drop the ladder's cherry-picks that main now carries.
2. Make the r79 run a script with a pass/fail exit, so a regression is a red
   line, not a log read.
3. Compile trailmap with the same perry build and record its walls here.
4. Open perry issues for the two defects left off the ladder's path
   (wpfacts non-convergence; name-keyed parent walks), with the probes.

## Wall 30 — the work (done; kept for the record)

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
