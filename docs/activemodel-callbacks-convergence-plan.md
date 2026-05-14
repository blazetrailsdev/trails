# activemodel → activesupport callbacks convergence plan

## The divergence

Rails layers `ActiveModel::Callbacks` on top of `ActiveSupport::Callbacks`:
`activemodel/lib/active_model/callbacks.rb:68` does `include ActiveSupport::Callbacks`,
and `define_model_callbacks` is a ~30-line wrapper over `define_callbacks`.

In trails, the two packages have **independent** callback engines:

- `packages/activesupport/src/callbacks.ts` — 950 lines, full engine with
  `CallTemplate` hierarchy, `CallbackSequence`, terminator/scope/around-chain.
- `packages/activemodel/src/callbacks.ts` — 617 lines, its own
  `defineModelCallbacks`/`runCallbacks`. Imports only `ArgumentError` from
  `./attribute-assignment.js`; no activesupport dependency.

The goal of this plan is to converge on the Rails shape: a single engine
in activesupport, with activemodel reduced to a wrapper.

## Gap analysis

activesupport's engine is **not** a strict superset of activemodel's. Three
features exist in activemodel but not in activesupport:

1. **Async/Promise propagation.** activemodel's `runCallbacks`
   (`packages/activemodel/src/callbacks.ts:403-615`) handles thenables
   throughout the chain; `_invoke` in activesupport is sync-only. Includes
   a `strict: "sync"` escape hatch and a `swallowRejection` helper for
   clean teardown.
2. **`CallbackObject` dispatch.** activemodel's `resolveCallback`
   (`packages/activemodel/src/callbacks.ts:172-190`) accepts an object with
   `beforeEvent`/`afterEvent` methods. activesupport's `CallTemplate` only
   handles functions and method-name strings.
3. **`on:` option for commit/rollback scoping.** activemodel's `_shouldRun`
   reads `record._transactionAction`. This is actually a layering bug —
   Rails defines `on:` in `activerecord/lib/active_record/transactions.rb:304-319`,
   where `set_callback` is overridden to transform `on:` into an `if:`
   lambda _before_ calling super. activesupport's engine never sees `on:`.

## Plan

Four PRs. Each must stay under the 300 LOC ceiling per `CLAUDE.md`.

### PR 1 — Async propagation in activesupport (in flight)

Port async + `strict: "sync"` from activemodel's engine into
`packages/activesupport/src/callbacks.ts`. Sync chains stay sync; if any
callback or block returns a thenable, the chain returns a Promise. Strict
mode throws when async sneaks onto a chain declared sync.

Activemodel's engine is **not** touched in this PR — purely additive on
activesupport's side.

Rails fidelity note: async support is a trails-specific extension (JS
drivers are async). It will not appear in
`scripts/api-compare/.rails-source/activesupport/lib/active_support/callbacks.rb`.

Branch: `feat/activesupport-callbacks-async`.

### PR 2 — `CallbackObject` dispatch in activesupport

Extend activesupport's `CallTemplate` hierarchy to accept an object with
`beforeEvent`/`afterEvent` methods, mirroring activemodel's `resolveCallback`.
Again, activemodel's engine is unchanged.

### PR 3 — Move `on:` from activemodel to activerecord

Fix the layering bug. Override `setCallback` in activerecord's transactions
module to synthesize `on:` into an `if:` predicate that closes over
`record._transactionAction` — matching `activerecord/lib/active_record/transactions.rb:304-319`.
Remove `on:` awareness from activemodel's `_shouldRun`.

This PR is independently valuable even without PRs 1, 2, or 4 — it fixes
a real Rails fidelity bug today.

### PR 4 — Shrink activemodel to a Rails-shaped wrapper (#1509 ✅)

Merged as a `_callbackChain` **bridge** rather than a full migration:
activemodel's public surface now matches Rails (`defineModelCallbacks`
delegates), but ~73 internal call sites in `model.ts`, AR `base.ts`,
AR `callbacks.ts`, AR `inheritance.ts` still go through the bridge
class. activesupport's `setCallback` / `runCallbacks` aren't used at
those call sites yet. Tests pass; the bridge is correct but is an extra
indirection layer.

The bridge also surfaced (does not introduce) a pre-existing Rails
fidelity gap: AR `base.ts` splits save as `runBefore("save")` → DB
write → `runAfter("save")`. Rails runs `run_callbacks(:save) { create
or update }` as a unified block — so `aroundSave` callbacks that try
to wrap the DB write currently wrap a no-op. See PR 6 below.

### PR 5 — Migrate `model.ts` static methods to activesupport API (#1514 ✅)

Migrated `model.ts` register/run paths onto activesupport's Symbol-keyed
chain storage (`getCallbackChains` for COW writes; `peekCallbackChain`
for read-only run paths). The `CallbackChain` bridge survives as a
read-through adapter for AR call sites. Added a `_ensureOwnCallbacks()`
no-op shim on `Model` for `transactions.ts:277` (PR 7 removes both the
shim and the call site).

### PR 6 — Migrate AR run paths (~150 LOC)

Migrate AR `base.ts` run-path call sites — `_callbackChain.runBefore` /
`runAfter` / `runCallbacks` at lines 2191, 2192, 2259, 2295, 2410, 2420,
2433, 2452, 2632 — to use activesupport's `runCallbacks` directly.
**Unify the split `runBefore("save")` + `runAfter("save")` into a single
`runCallbacks(this, "save", () => { create/update })`** — fixes the
pre-existing Rails fidelity gap where `aroundSave` silently wraps a
no-op instead of the DB write.

### PR 7 — Migrate AR register paths + retire the bridge (~100 LOC)

Migrate `activerecord/src/callbacks.ts` register path,
`transactions.ts` register + `_ensureOwnCallbacks` call,
`inheritance.ts`, `timestamp.ts`. Delete the `CallbackChain` bridge
class from `packages/activemodel/src/callbacks.ts`. Remove the
`_ensureOwnCallbacks` no-op shim from `Model`. Remove `getCallbackChains`
and `peekCallbackChain` `@internal` barrel exports from activesupport
once no AR caller remains. Update the `_callbackChain` clone comment in
`activerecord/src/encryption.ts:284`.

Validation (PRs 4–7):

- `pnpm test --filter @blazetrails/activemodel` stays green.
- `pnpm test --filter @blazetrails/activerecord` stays green (this is the
  real regression net — AR exercises callbacks heavily through persistence,
  transactions, validations).
- `pnpm run api:compare` — activemodel/callbacks.rb should still match.

## Risks

- **Around-callback halting semantics** differ subtly between the two
  engines. Port carefully and add cross-engine equivalence tests in PR 1.
- **Per-instance vs per-class state.** activemodel uses
  `this._callbackChain.clone()` on subclass writes (line 390–394);
  activesupport uses a Symbol-keyed Map for copy-on-write. Verify subclass
  isolation behaves identically before PR 4.
- **Promise rejection ordering** under `strict: "sync"` — the
  `swallowRejection` pattern exists specifically to avoid dangling
  unhandled-rejection warnings. PR 1 must include a test for this.

## Non-goals

- No public API rename. `defineModelCallbacks` keeps its name.
- No removal of activemodel's `callbacks.ts` until PR 4.
- No changes to activerecord's transaction lifecycle beyond the `on:`
  relocation in PR 3.
