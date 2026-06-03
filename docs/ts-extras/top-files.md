# Top-25 drill-down

Per-file assessment for the highest-novel files in the audit (snapshot:
2026-05-15, against `main`). Counts are `novel / moved`. Verdicts:

- **PRUNE** — extras are mostly genuine drift; worth a follow-up PR to
  `@internal`-tag or `_`-prefix.
- **ARCH** — extras are an intentional architectural divergence (often
  `method_missing` → explicit dispatch). Document & leave.
- **NOISE** — extras are dominated by barrel re-exports or
  language-idiom Symbols; filter from future runs.
- **MIXED** — needs per-symbol triage.

| #   | Novel / Moved | Package       | TS file                                                | Verdict | Notes                                                                                                                                                                                                                                                                                |
| --- | ------------: | ------------- | ------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   |     145 / 438 | activerecord  | `connection-adapters.ts`                               | NOISE   | Barrel of every adapter symbol — re-exports inflate both columns. Filter with `--exclude-glob`.                                                                                                                                                                                      |
| 2   |     133 / 223 | activerecord  | `base.ts`                                              | NOISE   | Same as #1 — barrel that re-exports core, scoping, associations, etc.                                                                                                                                                                                                                |
| 3   |      67 / 122 | activerecord  | `connection-adapters/postgresql-adapter.ts`            | MIXED   | `addPgDecoders/addPgEncoders` (PG-specific, legit), `addIndexOpclass` (PG-only Rails-private — could `_`-prefix), `NATIVE_DATABASE_TYPES` (intentional public const).                                                                                                                |
| 4   |       67 / 19 | activerecord  | `connection-adapters/abstract-adapter.ts`              | PRUNE   | `arelVisitor`, `buildStatementPool`, `affectedRows`, `attemptConfigureConnection` — most are Rails-private. Good candidate for an `@internal`/`_`-prefix sweep.                                                                                                                      |
| 5   |        47 / 1 | activerecord  | `relation/query-methods.ts`                            | PRUNE   | `arelColumn*` family (8 names) — Arel-helpers extracted from inline. Either keep+document or hide.                                                                                                                                                                                   |
| 6   |       44 / 16 | activerecord  | `migration/command-recorder.ts`                        | ARCH    | `invert*` enumeration explained in [patterns.md §2](patterns.md). `method_missing` divergence — intentional.                                                                                                                                                                         |
| 7   |        44 / 0 | activerecord  | `relation/finder-methods.ts`                           | PRUNE   | Pure novel: `findOne`, `findSome`, `findNth*`, `findTake*`, `perform*` — all Rails-private finders promoted. Strongest single prune target.                                                                                                                                          |
| 8   |        43 / 1 | activerecord  | `connection-adapters/abstract/schema-statements.ts`    | PRUNE   | `addColumnForAlter`, `addIndexForAlter`, `addTimestampsForAlter` etc. — bulk-alter primitives Rails keeps private.                                                                                                                                                                   |
| 9   |       40 / 79 | activerecord  | `associations.ts`                                      | NOISE   | Barrel of every association class + a few `_`-promotions.                                                                                                                                                                                                                            |
| 10  |       40 / 28 | activerecord  | `connection-adapters/abstract-mysql-adapter.ts`        | ARCH    | `ER_*` MySQL error-code constants (24 of them). Rails uses `Mysql2::Error::ER_*` constants directly; trails re-exposes for portable error handling. Intentional.                                                                                                                     |
| 11  |       39 / 57 | activerecord  | `migration.ts`                                         | MIXED   | `RELEASE_LOCK_FAILED_MESSAGE`, `VERSION` (constants, OK); `buildWatcher`, `checkProtectedEnvironments` (Rails-private — prune).                                                                                                                                                      |
| 12  |       37 / 72 | activemodel   | `model.ts`                                             | ARCH    | `afterCreate`, `afterDestroy`, `afterFind` etc. — Rails generates these via `define_callbacks`; trails declares them as explicit class methods so the type system sees them. Same divergence as #6.                                                                                  |
| 13  |       31 / 82 | activerecord  | `inheritance.ts`                                       | NOISE   | Most extras live on `Base` / barrels; misattributed by the manifest because `Base` includes `Inheritance`.                                                                                                                                                                           |
| 14  |       31 / 17 | activerecord  | `relation.ts`                                          | MIXED   | `[Symbol.asyncIterator]` (legit TS idiom); `arelColumn*` cluster again; `defineProcedures` (private?).                                                                                                                                                                               |
| 15  |        30 / 8 | activerecord  | `connection-adapters/postgresql/schema-statements.ts`  | PRUNE   | Same pattern as #8 (`addColumnForAlter`, PG-flavor).                                                                                                                                                                                                                                 |
| 16  |       28 / 16 | activerecord  | `connection-adapters/postgresql/schema-definitions.ts` | ARCH    | `bigserial`, `bit`, `bitVarying`, `box`, `cidr`, `inet`, `interval`, `jsonb`, etc. — PG-specific column-type DSL methods. Rails generates these via metaprogramming; trails enumerates. Intentional.                                                                                 |
| 17  |       24 / 16 | activesupport | `time-with-zone.ts`                                    | ARCH    | `compareTo`, `day`, `getTime`, `hour`, `isFriday` etc. — Temporal/Date API surface that has no Ruby `TimeWithZone` equivalent (Ruby uses `<=>`, day-of-week predicates, etc.). Intentional JS-idiomatic API.                                                                         |
| 18  |        24 / 4 | activerecord  | `tasks/database-tasks.ts`                              | PRUNE   | `classForAdapter`, `clearRegisteredTasks`, `databaseAdapterFor`, `dumpSchemaAfterMigration` — Rails-private rake-task helpers. Prune.                                                                                                                                                |
| 19  |        24 / 0 | activerecord  | `autosave-association.ts`                              | PRUNE   | Pure novel — `autosave*` and `validate*` cluster. Also contains the **`is_recordChanged`** snake-case bug (line 897). High-priority cleanup.                                                                                                                                         |
| 20  |       23 / 10 | activerecord  | `connection-adapters/abstract/database-statements.ts`  | PRUNE   | Same pattern as #4 — Rails-private adapter helpers exposed.                                                                                                                                                                                                                          |
| 21  |       21 / 11 | arel          | `attributes/attribute.ts`                              | ARCH    | `[ATTRIBUTE_BRAND]` (nominal type discriminant), `abs`, `bitwiseAnd`, `bitwiseNot`, `bitwiseOr` — Arel predicate/factory methods. Mixed: bitwise\* are real Rails methods (`bitwise_and`) that the audit didn't match because of a missing predication mixin wiring; abs is genuine. |
| 22  |        21 / 0 | activerecord  | `relation/calculations.ts`                             | PRUNE   | Pure novel — `executeGroupedCalculation`, `executeSimpleCalculation`, `performCount`, `performMaximum`, etc. Mirror of #7's pattern.                                                                                                                                                 |
| 23  |       19 / 18 | activesupport | `logger.ts`                                            | ARCH    | `DEBUG`, `ERROR`, `FATAL`, `INFO`, `UNKNOWN`, `WARN` constants — Ruby `Logger` exposes these as integer constants (`Logger::DEBUG`); trails re-exports for compat. Intentional.                                                                                                      |
| 24  |        19 / 8 | activerecord  | `schema-dumper.ts`                                     | MIXED   | Constants (`DEFAULT_DATETIME_PRECISION`) OK; `checkParts`, `cleanDefault`, `cleanRawPgExpression` are Rails-private.                                                                                                                                                                 |
| 25  |       18 / 53 | activerecord  | `connection-adapters/sqlite3-adapter.ts`               | PRUNE   | `arelVisitor`, `buildStatementPool`, `configureConnection` again — same Rails-private adapter pattern as #4.                                                                                                                                                                         |

## Suggested follow-up PRs

Ranked by signal-to-noise (prune candidates only):

1. **Adapter Rails-private sweep** (#4, #15, #20, #25): `@internal`-tag
   the adapter helpers Rails marks `private`. One sweep across abstract +
   PG + sqlite3 + abstract-mysql adapters covers ~150 names.
2. **Relation finder/calculation privates** (#7, #22, #5): `findNth*`,
   `findOne`, `findSome`, `performCount`, `executeGroupedCalculation`,
   `arelColumn*` — most are Rails-private and have no test-only public
   reason. ~80 names.
3. **Autosave-association cleanup** (#19): one focused PR including
   the `is_recordChanged` snake-case fix and `_`-prefix on the
   `validate*`/`autosave*` family.
4. **Migration tasks/protected-env** (#11, #18): `buildWatcher`,
   `classForAdapter`, `dumpSchemaAfterMigration`. ~10 names.

## Architecture-divergence notes (no fix needed)

- `migration/command-recorder.ts` (#6) — explicit `invert*` enumeration.
- `model.ts` (#12) — explicit `afterCreate`/`afterUpdate`/... methods.
- `postgresql/schema-definitions.ts` (#16) — explicit PG column-type DSL.
- `connection-adapters/abstract-mysql-adapter.ts` (#10) — re-exported
  `ER_*` MySQL error-code constants.
- `time-with-zone.ts` (#17) — JS-idiomatic Temporal/Date API.
- `logger.ts` (#23) — re-exported severity constants.
- All Symbol-keyed properties everywhere (`[Symbol.iterator]`,
  `[Symbol.asyncIterator]`, brand symbols).
