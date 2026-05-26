# Adapter → Connection Collapse Plan

Phases 1–2 are complete. This document tracks the remaining cleanup.

## Shipped

| PR  | Title                                                                                         |
| --- | --------------------------------------------------------------------------------------------- |
| 1a  | #2395 — move arel-visitor wiring to `AbstractAdapter`, remove per-class caching               |
| 1b  | #2401 — migrate `.adapter` call-sites to `.connection`                                        |
| 2a  | #2402 — widen `AbstractAdapter` to superset `DatabaseAdapter`                                 |
| 2b  | #2404 — relocate `adapter.ts` survivors to Rails-natural homes                                |
| —   | #2411 — addIndex return type, `migration-runner.ts` → `migrator.ts`, `InsertAll` shim removal |

Result: `Base.adapter` getter and `_adapter` field deleted. All source call sites use `Base.connection` (pool-based). `DatabaseAdapter` widened to superset `AbstractAdapter` and survivors relocated. A `static get adapter()` compatibility alias bridges ~7000 test sites until Phase G clears them.

## Remaining work

### PR A — Delete `adapter.ts` barrel + `DatabaseAdapter` interface (~150 LOC, bundled)

**Depends on:** Phase G fixture adoption progressing far enough that the ~134 import sites still re-exporting through `adapter.ts` have been rewritten. (Phase G replaces inline `Model.create()` with `useFixtures()` and rewrites `.adapter` → `.connection` in the same pass.)

**Scope:**

- Delete `packages/activerecord/src/adapter.ts`.
- Delete the `DatabaseAdapter` interface entirely — `AbstractAdapter` is the superset per #2402.
- Update `index.ts` re-exports.
- Verify with `grep -rn "from .*['\"]\\./adapter['\"]" packages/activerecord/src/` returning zero non-test hits.

Cross-reference: `docs/activerecord/fixtures-adoption-plan.md` for Phase G sequencing.

### PR B — `schema-ar-models.ts` `set connection()` cleanup (~small)

**Status:** previously blocked on the `set connection()` rename in PR 1a (now landed); re-check whether the cleanup is still needed.

**Scope:**

- Audit `packages/activerecord/src/schema-ar-models.ts` for any remaining `set adapter()` usage.
- Update to `set connection()` if any callers remain.
- If audit shows zero references, close this item as moot.

### PR C — Per-adapter Arel visitor (pre-existing, ~Phase 2 window)

**Status:** flagged in the PR 1a follow-ups; not currently scheduled.

**Scope:**

- `setToSqlVisitor` is currently a global singleton. Rails uses a per-adapter `@visitor` set in `AbstractAdapter#initialize`.
- Already partially addressed in #2395 (wiring moved to `AbstractAdapter` constructor), but the singleton itself remains.
- Replace global singleton with per-adapter visitor instance; update all `setToSqlVisitor`/`toSqlVisitor` consumers.
- Low-risk now (only matters under multi-adapter cross-talk scenarios) but mandatory for full Rails fidelity.

### Long-tail (separate initiative) — Delete `set connection()` + `get adapter()` compat alias

**Out of scope for this plan.** Requires converting ~6900 test sites from `this.adapter = adapter` (a trails-ism in `static {}` blocks) to `establishConnection()` (Rails idiom). The compat alias is consumed by Phase G; the setter removal lands once Phase G is done.

Tracked here for visibility only — open a separate plan when ready.

## Ordering

```
PR A (delete adapter.ts + DatabaseAdapter) ── after Phase G clears barrel imports
PR B (schema-ar-models.ts audit) ── any time
PR C (per-adapter visitor) ── any time, low priority
```

PR B and PR C are independent of each other and of PR A. All branch from `main` (no stacking).

## Post-merge follow-ups

Items surfaced during PRs that land adjacent to this plan. Add to the
appropriate Phase above once ready to schedule; listed here to avoid loss.

**From #2402 (PG addIndex cleanup)**

- [x] ~5 LOC: `addIndex` return type inconsistency on PG adapter — fix return type annotation to match AbstractAdapter.

**From #2401 (set connection() rename)**

- [x] ~16 LOC: rename `migration-runner.ts` → `migrator.ts` to match Rails-natural file layout.
- [ ] ~schema-ar-models.ts: `set connection()` setter in schema-ar-models.ts is blocked on the `set connection()` rename in Phase 1a landing first.
- Discovery: `extend()` overwrites class getters — any future getter that must survive `extend()` needs a post-extend `Object.defineProperty` call. Document this in contributor notes if/when it re-surfaces.

**From #2395 (InsertAll / visitor)**

- [x] ~20 LOC: collapse `InsertAll` constructor overloads to single Rails-canonical `(relation, connection, inserts, options)` signature.
- [ ] Pre-existing: global visitor singleton (`setToSqlVisitor`) vs per-adapter visitor — Rails uses per-adapter. Low-risk now, but flagged for the Phase 2 cleanup window.

**From #2386 (PR 1b first batch)**

- Remaining PR 1b sites not yet migrated: `associations/preloader/association.ts`, `relation/query-methods.ts`, `validations/uniqueness.ts`, `attribute-methods/primary-key.ts`. These are the Phase 1b remainder; tracked here until Phase 1b lands.

**From #2392 (QueryMethods double-fallback removal)**

- No new follow-ups; confirms Phase 1b pattern is safe.

**From #2404 (relocate adapter.ts survivors)**

- [ ] Phase G: delete `adapter.ts` barrel — 134 import sites still re-export through it. Phase G fixture adoption rewrites all imports. No standalone PR needed.
- [ ] ~150 LOC: delete `DatabaseAdapter` interface entirely once barrel is gone — `AbstractAdapter` is the superset per #2402. ~134 files.

## Non-goals (this plan)

- **Deleting `set connection()` and the `get adapter()` compat alias** — see "Long-tail" above.
- Renaming `connection-adapters/` directory or `AbstractAdapter` class (those already match Rails).
- `withConnection { }` block semantics (future pool lifecycle work).
- `connectedTo()` role-switching API (separate initiative).
