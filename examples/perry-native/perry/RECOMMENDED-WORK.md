# Perry native ladder — recommended work after Wall 29

As of 2026-11-06. Companion to [FINDINGS.md](FINDINGS.md), which records the
walls themselves. This file records what to do next and why, including the
investigation that got here, so the next session does not re-derive it.

## Recommendation in one paragraph

Fix `exported_func_has_rest` in perry's `run_pipeline.rs` so that an
`export const alias = someFn` propagates the aliased function's rest-parameter
facts to the alias name. That is Wall 29, it has a 2-module repro, and it is
the only thing standing between the current binary and a compiled trails
application that answers an HTTP request end to end. Everything else on this
branch is lower value.

## Where the ladder stands

r61 compiled the `08-serve` rung clean and the binary boots, initializes the
Node handler and serves. The remaining failure is in the error-reporting path,
which only became reachable once the application actually served traffic.

| Run       | Result                            | Note                                                |
| --------- | --------------------------------- | --------------------------------------------------- |
| r58       | first stub-free binary            | 1962 modules, 1715s                                 |
| r60       | OOM at `Linking (with stdlib)`    | all 1962 modules of codegen finished first          |
| r60 (32G) | `COMPILE_RC=0`, 1662s             | wall 27 confirmed dead in the full program          |
| r61       | `COMPILE_RC=0`, 2087s, `RUN_RC=0` | 1340 init lines, serves, dies in `ExceptionWrapper` |

Under `tsx` the same rung reports `env=production status=200`, so the oracle is
green and every remaining difference is the compiler's.

Commits that landed, newest first:

| Commit       | Repo   | What                                                         |
| ------------ | ------ | ------------------------------------------------------------ |
| `b398c603ba` | trails | FINDINGS for walls 28 and 29, probes                         |
| `c9f60b2771` | trails | `Handler.Node` side-effect import, `/up` → `trails/health`   |
| `84bc3026b`  | perry  | repaired the perry-codegen test build and the budget fixture |
| `5ed63b85d`  | perry  | wall 27: bundle a rest param for any arity                   |

### Two operational rules that cost real time to learn

**Cap for the heaviest stage, and pin jobs only at codegen.** Codegen wants
`PERRY_CODEGEN_UNIT_JOBS=4` at 22G; raising the cap there does not help,
because the worker count scales off the budget. The LINK is a single process,
so the job pin does nothing and the cap IS the fix — it needs 32G with symbols
OFF. `r61-serve.sh` now defaults to `CAP=32G NEED_GIB=34`. An earlier header
in that script blamed the heavy link on `PERRY_KEEP_SYMBOLS=1`; that was wrong,
and the corrected reasoning is in the script.

**Strict serialization.** systemd-oomd killed the entire `user@1000.service`
(tmux included) at 11:31 on 2026-11-05 when a `cargo test` ran beside a perry
compile. Run one heavy job at a time, each in its own
`systemd-run --user --scope -p MemoryMax=…`. When a capped Rust build is killed
with a small `anon-rss` in the kernel log, the cap was reached by cargo's
parallelism summing across jobs — lower `-j`, do not raise the ceiling.

## Wall 29 — the defect

A compiled request raises:

```
TypeError: Cannot read properties of undefined (reading 'includes')
    at get unwrappedException
    at ExceptionWrapper.computeStatusCode
    at new ExceptionWrapper
```

`wrapperExceptions` is a cattr installed by `cattrAccessor.call(this, …)` in a
static block. Under perry `cattrAccessor` installs **nothing** — no prototype
getter, no static accessor, and no exception. Instrumenting `mattrAccessor`
printed the whole answer in one line:

```
[mattrAccessor] entry syms="attr" len=4
```

`syms` is a rest parameter, so it must be an array. It is bound to the bare
string `"attr"`, and `len=4` is that string's **character count** — the same
signature as wall 27's `params=98`, which was a path's length. Downstream,
`extractOptionsBang` finds no options hash, `names` is empty, the install loop
runs zero times, and the failure surfaces hundreds of frames later.

### The three conditions, all required

`perry/probes/rest-imported.ts` reproduces it in **2 modules**:

| Probe | Shape                            | Result                       |
| ----- | -------------------------------- | ---------------------------- |
| I2    | imported function, `.call`       | correct                      |
| I3    | `const` alias, direct call       | correct                      |
| I4    | `const` alias, imported, `.call` | `len=4 isArr=false v="attr"` |

Only the combination fails. That is why it survived this long: each condition
alone is exercised constantly.

### Root cause

`exported_func_has_rest` in
`crates/perry/src/commands/compile/run_pipeline.rs` is populated from:

- function declarations — lines 1883 and 1964, both keyed on a declaration's
  own `params.last().is_some_and(|p| p.is_rest)`
- re-export chains — around line 2580

`export const cattrAccessor = mattrAccessor` is none of those. The alias name
is therefore never recorded, so the propagation at lines 5496-5501 has nothing
to copy, `imported_func_has_rest` misses the alias, and the cross-module call
site reads `has_rest = false` at `extern_func.rs:1475` and skips bundling. The
direct-call path resolves the alias by another route, which is exactly why only
`.call` shows the defect.

## How it was found

The order mattered more than the cleverness, and three of four hypotheses were
wrong.

**The tsx oracle first, before any probe.** Wall 28 was two defects and the
oracle killed both in one command each by failing identically under Node:
`Handler.Node` undefined (a type-only `declare static` whose runtime value only
a dynamic import installs) and `/up` routed at `rails/health#show`. Neither was
the compiler's. One command beat three probes.

**Then probes, with the module count checked first.** Every hypothesis below
cost one compile because the probe was genuinely small — and `Found N module`
was read before trusting that.

| Hypothesis                                                                  | Why it was plausible                                                                      | Verdict                                                            |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `declare` instance field shadows the prototype getter with `undefined`      | the classic TS footgun `declare` exists to avoid                                          | wrong — 1 module, matches oracle including `own property? : false` |
| mixed spread + trailing arg (`f.call(this, ...names, options)`) mis-lowered | same `call_spread.rs` path as wall 27; an empty `names` explains the silent no-op exactly | wrong — 1 module, all six forms match                              |
| `pop()`/`length` wrong on a rest array built by wall 27's `js_array_slice`  | wall 27's own fix built those arrays                                                      | wrong — 1 module, all three forms match                            |
| cross-module `const` alias loses `has_rest`                                 | —                                                                                         | **confirmed, 2 modules**                                           |

The second was the convincing one and still wrong. Worth remembering: a theory
that explains the symptom perfectly is not thereby true.

**Then instrumentation, once guessing had failed twice.** The 385-module
`cattr-mechanism.ts` repro plus four `console.error` lines in `mattrAccessor`
and `mattrReader` produced the character-count tell immediately. Reverted after
measuring (original kept at `/tmp/claude-1000/w29/module-ext.ts.orig`).

### A hazard that nearly invalidated the whole comparison

The first instrumentation printed nothing under `tsx`. activesupport's
`package.json` maps `./*` to `./dist/*.js`, so **Node runs `dist` while perry
compiles `src`** for subpath imports; only the bare specifier reaches `src`. I
had been asserting the opposite. The general danger is that the oracle and the
compiler can read two different files with nothing looking wrong, which makes a
tsx comparison meaningless. Check the `exports` map before trusting a subpath
comparison.

## Recommended fix

In `run_pipeline.rs`, when an exported `const` is initialized to a plain
identifier naming a function in the same module, record the alias under the
same facts as the target.

Three things must move together, not just `has_rest`:

1. `exported_func_has_rest`
2. `exported_func_param_counts` — `has_rest` without the arity gives a bundling
   site the wrong `declared_count`, and wall 27 showed what a wrong
   `declared_count` does: elements silently dropped, `undefined` passed
3. `exported_func_synthetic_arguments` — the `arguments` + `...rest` arm in
   `func_ref.rs` keys off it, and a mismatch picks the wrong dispatch arm

The propagation block at lines 5486-5505 already handles exactly this shape for
import renaming (`local_name != exported_name`), so it is the model to follow
rather than a new mechanism.

Prefer fixing the export analysis over patching the call site. Teaching
`extern_func.rs` to chase aliases would fix `.call` and leave every other
consumer of `imported_func_has_rest` — `call_spread.rs:596`,
`static_method.rs:712` — still wrong for the same input.

## Verification plan

In order, and serialized:

1. `perry/probes/rest-imported.ts` — 2 modules. I4 and I5 must match the tsx
   oracle. Fastest possible signal.
2. `cargo test --release -p perry-codegen -j 4` in a 26G scope. This touches
   the signature tables that every cross-module call reads, so the suite is not
   optional. Baseline is **2720 passed, 0 failed, 1 ignored** plus 72 across
   the crate's other targets. Do not pipe cargo's output through `tail` — that
   is how `d9348c8b6`'s broken test build went unnoticed for a day.
3. `perry/probes/cattr-mechanism.ts` — 385 modules. `M1`/`M2` must read
   `["installed"]` and `M4` must be `true`.
4. `r61-serve.sh` alone. Expect `[08] env=production status=200 len=73`, which
   would make this a compiled trails application answering an HTTP request.

## Risks

- The change is in a 6000-line pipeline whose maps are read by four lowering
  sites. The failure mode of getting it half right is silent wrong codegen, not
  a compile error — which is this bug's entire character.
- An alias can point at an import, a re-export, or another alias. Resolve one
  hop only unless a test demands more; a fixed point here is a separate change.
- `d9348c8b6` is still carried and is worth deciding separately: it is a no-op
  for the db.js wall it was written for, and it broke the test build. Its
  `source_class_name` field is read by `method_registry.rs` (~285) and
  `run_pipeline.rs` (368, 419), so reverting is a design decision.

## Deliberately not done

- **The perry fix itself.** It wants fresh context, not the end of a long
  session, given that the last change on this path needed a 2720-test run to
  prove it had not regressed.
- **Routing the rung through `Handler.get("node")`.** That is the deployed
  path, but it adds this graph's first dynamic edge and the wall-22 "0 dynamic
  edges" measurement depends on there being none. Changing what rung 08
  measures in order to fix it is worse than keeping 08 honest. Dynamic handler
  resolution under AOT deserves its own rung.
- **Pushing or upstreaming anything on `ladder/perry-native`.** Per the fork
  policy.

## Still open, ranked below Wall 29

| Item                        | State                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Wall 16                     | unfixed; carried as an uncommitted i18n scaffolding patch in `perry-ladder-keep/`; `r43-wall16-recheck.sh` written, never run |
| `d9348c8b6` fate            | see Risks                                                                                                                     |
| `PERRY_DEBUG_CLASS_SYMBOLS` | instrumentation committed in `5d1fe9b5a`; decide whether to keep or gate                                                      |
| Nokogiri fix                | branch-only; reverses #9416's documented decision                                                                             |
