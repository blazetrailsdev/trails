# Adapter Access Cleanup Plan

Goal: eliminate raw `._adapter` field reads and construction-time adapter
caching. Every site should resolve the adapter through the class getter
(`Model.adapter` → pool checkout) at point-of-use, matching Rails'
`klass.connection` semantics.

**Why now:** Raw field reads bypass the pool getter, which means they return
`null` if the getter was never called (silent bug in lazy-init paths), and
construction-time caching freezes a stale adapter reference across
`connectedTo()` role switches. Both are latent correctness issues that will
surface as pool/multi-DB support matures. Cleaning these up also removes
`as any` casts that hide type errors.

**Done-when:** `grep -rn '\._adapter\b' packages/activerecord/src/ | grep -v test | grep -v '__'`
returns only `base.ts` (the backing field), `connection-handling.ts` (the
teardown path), and adapter-internal files (migration, schema-migration,
internal-metadata). No `as any` casts remain for adapter access.

Three PRs, each ~150–250 LOC.

---

## PR 1 — Leaf bypasses: raw field reads + fallback chains

Bundle of all sites that read `._adapter` directly or use fallback chains
instead of the getter. No behavioral change — every site already has a
working getter path; these just remove the bypass/fallback.

**Scope:**

| Site                         | File                                    | Pattern                                        | Fix                                                             |
| ---------------------------- | --------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| Relation arel-visitor        | `relation.ts`                           | `(this._modelClass as any)._adapter`           | `this._modelClass.adapter` — remove `as any` casts              |
| Preloader cache key          | `associations/preloader/association.ts` | `klass._adapter`                               | `klass.adapter` — local variable for repeated access            |
| QueryMethods column matcher  | `relation/query-methods.ts`             | `.adapter ?? ._adapter` double-fallback        | Single `host._modelClass.adapter`; fix host type constraint     |
| Uniqueness validator         | `validations/uniqueness.ts`             | `klass.adapter ?? klass.connection ?? null`    | Single `klass.adapter` call; delete dead fallback               |
| primary-key quotedPrimaryKey | `attribute-methods/primary-key.ts`      | `{ adapter?: DatabaseAdapter }` in `this` type | Remove from host type; resolve via `this.adapter` (Base getter) |

**Type fixes:** Where `as any` casts exist because the type doesn't expose
`.adapter`, widen the constraint to `typeof Base` (or the appropriate
connection-owning interface). This may touch type declarations in
`relation.ts` and `query-methods.ts`.

**Verify:** `pnpm vitest run packages/activerecord/src/relation.test.ts packages/activerecord/src/associations/nested-through-preloader.test.ts packages/activerecord/src/validations.test.ts`

**LOC estimate:** ~150

---

## PR 2 — InsertAll: lazy connection resolution

`InsertAll` stores `model.adapter` at construction time and reuses it across
all operations. If the connection swaps between construction and execution
(e.g., `connected_to` role switching), the stored reference is stale.

**Fix:**

- Store the model class ref (`this._model: typeof Base`) instead of the adapter.
- Add `private get _connection() { return this._model.adapter; }`.
- Replace all `this._connection` reads (~15 sites) with the getter.
- Delete the `connection` constructor parameter.

**Verify:** `pnpm vitest run packages/activerecord/src/insert-all.test.ts`

**LOC estimate:** ~100

---

## PR 3 — JoinDependency: lazy connection resolution

Same pattern as PR 2. `JoinDependency` resolves and freezes an adapter at
construction for quoting. Rails' `JoinDependency` calls `connection` at the
point of use (within `make_constraints` / `build_join_tree`).

**Fix:**

- Store `this._baseModel: typeof Base` instead of `this._adapter`.
- Add `private get _adapter() { return this._baseModel.adapter; }`.
- Remove `_resolveAdapter` static helper.
- All existing `this._adapter` usage sites (~8) continue working via the
  getter with no call-site changes.

**Verify:** `pnpm vitest run packages/activerecord/src/associations/join-dependency-quoting.test.ts packages/activerecord/src/associations/join-dependency-through-aliasing.test.ts`

**LOC estimate:** ~80

---

## Ordering

PR 1 first (no structural change, just resolution-path cleanup). PRs 2–3 are
independent of each other and can ship in parallel after PR 1.

## Non-goals (this plan)

- Renaming `adapter` → `connection` across the codebase (separate initiative)
- Removing `Base.adapter = X` setter (Phase D epic scope)
- Adding `withConnection { }` block semantics (future pool lifecycle work)
