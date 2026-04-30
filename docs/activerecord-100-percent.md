# ActiveRecord: Road to 100%

Current: **3074/3398 methods (90.5%)** public-only;
**3683/5111 (72.1%)** with privates included. **199/205 inheritance**.

```bash
pnpm run api:compare -- --package activerecord
pnpm run api:compare -- --package activerecord --missing      # missing methods per file
pnpm run api:compare -- --package activerecord --inheritance  # inheritance mismatches
```

## How to work on this

Each area below is independent. Pick an area, work in a worktree, submit a PR.

**Before starting**: read the Rails source for the feature you're implementing.

**Measuring progress**: `api:compare` matches individual public methods against
Rails source. Methods must live in the file api:compare expects (matching the
Rails module structure).

---

## Infrastructure concerns

These affect multiple files and need dedicated work before more methods can
be properly wired up.

### Wire module methods onto Base

Methods in `persistence.ts`, `core.ts`, `model-schema.ts`, `scoping.ts` are
exported as standalone functions but not yet mixed onto `Base` as static/instance
methods. `api:compare` finds them in the correct files, but they're not callable
at runtime (e.g., `User.build()`, `User.currentRole()`).

**Fix:** Use the `include()` pattern from `@blazetrails/activesupport` to mix
class methods onto `Base`, similar to how `Relation` includes its modules.

### TypeCaster::Map

`core.ts#typeCaster` currently returns an ad-hoc object that reads from
`_attributeDefinitions`. Rails returns `TypeCaster::Map.new(self)`, a proper
class that delegates to the full type system and memoizes per class.

**Fix:** Implement `TypeCaster::Map` and memoize per class.

### Reflection foreignKey + CPK

`foreignKey` derivation does not yet handle composite primary keys or
`queryConstraints`. Associations with CPK will report incorrect foreign
keys in reflection.

---

## Remaining module files

Files with methods still missing. Run `api:compare --missing` to see per-method gaps.

| File     | Matched | Missing | %   |
| -------- | ------- | ------- | --- |
| store.rb | 8       | 4       | 67% |

## Bigger gaps (not in scope yet)

| Area         | Notes                                                          |
| ------------ | -------------------------------------------------------------- |
| Associations | Builders, preloader, and join_dependency still have major gaps |
| Migration    | Command recorder, schema migration                             |
| Fixtures     | fixture_set/\* still mostly unimplemented                      |

---

## Dependency audit — reimplementations to migrate

Where the package reimplements functionality inline instead of using
sibling packages, or builds SQL via string interpolation instead of
Arel AST nodes. Snapshot 2026-04-30 — most of the original audit has
been executed.

### Raw SQL strings instead of Arel

**`base.ts:2466` — empty-row INSERT** (used when `create` runs with no
attribute writers):

```typescript
sql = `INSERT INTO "${table.name}" ${emptyValue}`;
```

Should route through `InsertManager` like the non-empty branch on the
next line. The hard-coded `"…"` identifier quoting is also a dialect
parity gap — should use the adapter's `quoteTableName`.

**Infrastructure files (lower priority — not on the hot path):**
`schema-migration.ts:47` (CREATE TABLE), `migration-runner.ts:37,45,63,85`
(schema_migrations CREATE/SELECT/INSERT/DELETE),
`internal-metadata.ts:88` (CREATE TABLE). Rails uses Arel for these
too; deferred because they touch bookkeeping tables, not user data.

### ActiveSupport utilities not yet used

Verified by grep against `packages/activerecord/src/`:

| Utility                     | Notes                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `TimeWithZone`              | Temporal migration replaced most of what Rails uses TimeWithZone for; revisit only if a specific feature needs it.                       |
| `MessageEncryptor`          | `encryption/` has its own crypto. Rails delegates to ActiveSupport — refactor, not net new code.                                         |
| `CurrentAttributes`         | Rails uses this for request-scoped state (`Current.user`, etc.). Likely belongs to actionpack/trailties wiring rather than activerecord. |
| `MemoryStore` / `FileStore` | Query cache uses an inline Map. Could swap to `ActiveSupport::Cache` stores once the cache API stabilizes.                               |
| `BroadcastLogger`           | Multi-destination logging not yet wired.                                                                                                 |

`HashWithIndifferentAccess`, `Notifications`, `Duration`,
`MessageVerifier`, `Logger`, and the inflectors are all in use.

### ActiveModel integration

Solid — verified status:

- **Validators** extend activemodel base classes (`PresenceValidator`,
  `AbsenceValidator`, `LengthValidator`, `NumericalityValidator`,
  `EachValidator`).
- **Type system** shared with activemodel (`Type`, `ValueType`,
  `StringType`, `IntegerType`, `BooleanType`, etc.).
- **Callbacks** delegate to activemodel. `Base extends Model` provides
  the callback chain; `callbacks.ts` registers AR-specific callbacks
  on top.
- **Dirty tracking** delegates to activemodel.
  `attribute-methods/dirty.ts` adds persistence-aware methods reading
  from activemodel's `previousChanges` / `changes`.
- **Errors** — `errors.ts` defines AR-specific error classes
  (`RecordNotFound`, `RecordInvalid`, `StatementInvalid`); distinct from
  `ActiveModel::Errors`. Matches Rails.
- **`ActiveModel::Attribute`** — arel depends on activemodel (#626);
  `Arel::Nodes.buildQuoted` routes `ActiveModel::Attribute` instances
  through `BindParam`, matching Rails' `visit_ActiveModel_Attribute → add_bind`.

### Priority

1. Empty-row INSERT in `base.ts` — small, mechanical migration to
   `InsertManager`. Folds in the dialect-parity quoting fix.
2. Cache stores swap — query cache → `ActiveSupport::Cache::MemoryStore`
   once any consumer needs Rails-shaped cache semantics.
3. `CurrentAttributes` — pick up when actionpack request scoping
   lands.
4. `MessageEncryptor` rebase for `encryption/` — defer until encryption
   gets its next round of work.
5. Infrastructure raw SQL — last; cosmetic until parity-tested.
