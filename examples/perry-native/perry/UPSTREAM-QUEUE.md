# Pushing the ladder's compiler fixes upstream to Perry

The ladder fixed 24 Perry defects on local branches. This is the triage of
which ones go upstream, in what order, and what each one still needs. Written
2026-11-12, against upstream `main` at `9a4e97fc3`.

The verdicts below are not a reading of the commits — they come from rebasing
all 24 onto current upstream `main` and recording what happened. Re-run that
rebase before acting on this document if upstream has moved much: two commits
are already superseded, and more will be the longer this waits.

## Where the work lives

| Branch                    | Where                            | Holds                                             |
| ------------------------- | -------------------------------- | ------------------------------------------------- |
| `wall29-const-alias-rest` | `/home/dean/github/perry-wall29` | All 24 commits. The compiler that passes rung 09. |
| `ladder/perry-native`     | `/home/dean/github/perrysrc`     | The first 8 only. Behind; do not build from it.   |

`wall29-const-alias-rest` is the branch of record. Upstream is `origin`
(`PerryTS/perry`) — there is no fork remote, so pushing means branches and PRs
against that repo.

## One blocker applies to every fixture-bearing commit

Upstream renamed `test-files/` to `tests/fixtures/programs/`. All 16 ready
commits add fixtures under the old path, so **each one conflicts on file
location alone**, before any logic is considered. The rebase reports it as
`CONFLICT (file location)` and names the destination. It is pure relocation.

Do this once, as the first step of each PR, rather than discovering it 16
times.

## Tier 1 — push these: 16 commits, fix plus regression test

Grouped as they should be submitted. Upstream will not want one 16-commit
drop; each group is a coherent PR with its own story.

### PR 1 — rest and `arguments` ABI (4 commits)

`c336c1aeb` record rest facts on const-alias export wrappers
`25bf95dbf` a cross-module call bundles both a rest param and a synthesized arguments (38 tests)
`f6b235383` re-exports carry the synthesized-arguments and rest-and-arguments flags
`8188c3aee` keep `this` for a spread call to an imported class's static method

Start here. It is the group the ladder leaned on hardest, it carries the most
tests by far, and its failure mode states precisely: a callee's rest parameter
binds to a bare argument instead of an array, so `.length` reads as that
value's character count. `plain_params` in `fn_info.rs` explains why a missing
rest fact is fatal rather than merely wrong — without the bit the info reads as
plain and callers pass registers raw.

### PR 2 — prototype and class linkage (5 commits)

`b45837a6b` link a prototype minted before its parent edge registers
`e701a76a1` install declared methods on a prototype minted before its declaration registers
`fbedce6ae` a builtin parent never resolves to an importer's same-named class (9 tests)
`8bfb521d4` a class expression nested in a same-named class declaration gets its own class
`4a70c0d4e` `new` on an imported class with a spread argument keeps the spread

### PR 3 — Proxy receivers (2 commits)

`cef27a740` a fused method call that reaches a prototype-chain Proxy passes the instance as receiver
`aa69722b2` a static read that reaches a Proxy in the constructor chain passes the class as receiver

### PR 4 — runtime semantics (3 commits)

`3c1820598` an explicit `.toString()` returns the method's result unchanged
`f3b624000` `OrdinaryHasInstance` no longer consults C's own `@@hasInstance`
`ca3ce0fec` en-US `DateTimeFormat` places the era after the date

### PR 5 — stdlib and extensions (2 commits)

`27ad40594` dispatch `createCipheriv`/`createDecipheriv` on a crypto namespace value
`ea206949d` bind BigInt params as INTEGER and box integer cells as numbers

## Tier 2 — drop: superseded upstream

Both conflicted in the rebase against upstream work that is strictly more
general. Do not submit these, and do not carry them forward on a rebase.

**`64e6fadb8`** int32 arithmetic that folds out of range is not int32-producing.
Upstream now admits int-producing arithmetic only when the exact result is
proven inside i32, through a new `collectors/exact_i32_range.rs`. Ours folded
only fully-literal subtrees; theirs covers that case and more.

**`5ed63b85d`** bundle a rest param for any arity when all args come from a
spread. Upstream rewrote the path: it computes an ABI tuple from
`(has_rest, has_arguments)` and dispatches to a shared
`lower_function_spread_call(ctx, fname, args, fixed, rest, arguments)`. That is
this fix generalized to rest _and_ `arguments`.

Worth recording plainly: `5ed63b85d` was wall 27, verified at length here over
a full 1962-module compile. Upstream reached the same conclusion independently
and in a better shape. The ladder's value was finding the defect, not fixing it.

## Tier 3 — real fixes, no tests: do not offer as-is

**`8f3abf116`** a private-storage IC miss stops panicking a stdlib-linked binary.
**`a12e09d30`** a `toString` override on an Array subclass is dispatched.

Each needs a fixture and a test in the Tier-1 shape before it is worth a
reviewer's time.

**`d9348c8b6` + `5d1fe9b5a`** cross-module static symbol mangling. These are
one fix in two parts and cannot be split: `method_registry.rs:313` mangles
through `ImportedClass::source_class_name`, which `d9348c8b6` adds and
`5d1fe9b5a` builds on.

Two things to settle before these move:

- `d9348c8b6` was written for a wall it turned out not to fix, and it broke the
  perry-codegen test build for days (repaired in `84bc3026b`). It is
  load-bearing _now_ only because `5d1fe9b5a` built on it. Whether the pair
  fixes a defect upstream can reproduce is **unverified**. It needs a failing
  test first; if none can be written, it should be reverted rather than pushed.
- `5d1fe9b5a` commits `PERRY_DEBUG_CLASS_SYMBOLS` instrumentation
  (`method_registry.rs:202`). Gate it or remove it.

## Tier 4 — keep local, never push

**`73b556b1e`** LLVM unit worker count respects the cgroup memory limit.
Written for this 32G machine. Upstream has its own sizing, and
`PERRY_CODEGEN_UNIT_JOBS` overrides this anyway — which is how it silently
defeated itself in r49.

**`84bc3026b`** repair the perry-codegen test build and the budget fixture.
Repairs a build that only `d9348c8b6` broke, plus a fixture that only
`73b556b1e` needs. Meaningless upstream without both.

## Running order

1. Rebase `wall29-const-alias-rest` onto current `origin/main`, skipping
   `64e6fadb8` and `5ed63b85d`, dropping the Tier-4 pair.
2. Relocate fixtures to `tests/fixtures/programs/`.
3. `cargo test` the whole workspace. It must be clean _before_ the first PR —
   a broken test build hides later failures, which is exactly how the budget
   fixture failure stayed invisible for days.
4. Open PR 1. Wait for its review shape before firing the other four: upstream
   may want a different grouping, and finding that out once is cheaper than
   five times.
5. Rebuild the local compiler from whatever lands, and re-run rung 09. The
   ladder is the integration test for all of this.
