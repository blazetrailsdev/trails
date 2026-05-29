# `this.adapter = …` non-test audit

Classifies the six non-`*.test.ts` `.ts` files that contain `this.adapter = …`
writes, to separate **D-1 bypass survivors** (test classes extending `Base`
that set `this.adapter` to skip the connection handler — the same pattern
PRs #2587 / #2589 just cleaned up) from **legitimate bound-adapter class
fields** on unrelated abstractions (e.g. `SchemaCreation`, `Registration`,
`MigrationRunner`), which must be left untouched.

## Classification rule

1. Does the containing class extend `Base` (or a `Base` subclass)?
   - **NO** → it's a separate `adapter` field on an unrelated class → **legit**.
   - **YES** → could be a bypass; check further.
2. If extending `Base`, is `this.adapter = …` used to bypass the connection
   handler (rather than a distinct typed field for another concept)?
   - **YES** → bypass survivor; migrate to `Base.connection` per the Phase-3 pattern.
   - **NO** → legit class field.
3. Edge case: a TEST class (extends `Base`, only constructed in tests) is a
   **bypass survivor** — that's exactly what the D-1 sweep targeted.

Litmus reference: `connection-adapters/abstract/schema-statements.ts` uses
`this.adapter` in ~101 places as a constructor-bound reference. It is **not**
a `Base` subclass, so the #2580 codemod correctly skipped it.

## Findings

### 1. `packages/activerecord/src/adapters/postgresql/schema-ar-models.ts`

- **Class(es):** `Thing1`, `Thing2`, `Thing3`, `Thing4`, `Thing5`,
  `SchemaThing`, `Song`, `Album` — all `extends Base`, built by factory
  functions for `schema.test.ts` / `schema-authorization.test.ts`.
- **Sites:** 32, 38, 44, 50, 61, 71, 89, 95 (8 sites)
- **Verdict:** **bypass survivor (needs migration)**
- **Rationale:** These are AR-model test fixtures that extend `Base` and pin
  `this.adapter = adapter` to skip the connection handler (edge case #3) — the
  same bypass shape PRs #2587/#2589 removed, just relocated into a fixture
  builder under `test-helpers`/`adapters`, so it survived the `*.test.ts`
  cleanup wave.

### 2. `packages/activerecord/src/encryption/test-helpers.ts`

- **Class(es):** `EncryptedPost`, `EncryptedBook`, `EncryptedBookWithDowncaseName`,
  `EncryptedBookThatIgnoresCase`, `EncryptedAuthor`, `EncryptedBookWithCustomCompressor`,
  `BookThatWillFailToEncryptName`, `EncryptedTrafficLightWithStoreState`,
  `EncryptedBookWithBinary`, `EncryptedBookWithSerializedFirstBinary`,
  `EncryptedBookWithSerializedSecondBinary`, `EncryptedBookWithBinaryMessagePackSerialized`,
  `MsgPackTextBook`, `UnencryptedBook`, `EncryptedBookWithUniquenessValidation`,
  `EncryptedBookAttribute`, `EncryptedBookNormalizedFirst`, `EncryptedBookNormalizedSecond`,
  plus one anonymous `class extends Base` — all `extends Base`, built by factory
  functions for the encryption test suite.
- **Sites:** 243, 259, 275, 287, 300, 311, 334, 357, 373, 392, 411, 430, 446,
  463, 479, 494, 511, 549, 570 (19 sites)
- **Verdict:** **bypass survivor (needs migration)**
- **Rationale:** Same shape as `schema-ar-models.ts` (edge case #3) — factory-built
  `Base` subclass test fixtures pinning `this.adapter = adapter` to skip the
  connection handler; survived the `*.test.ts` sweep because the fixtures live in
  a `test-helpers` builder rather than a `*.test.ts` file.

### 3. `packages/activerecord/src/type/adapter-specific-registry.ts`

- **Class:** `Registration` (no `extends`; `DecorationRegistration extends Registration`)
- **Sites:** 39
- **Verdict:** **legit class field (leave alone)**
- **Rationale:** `adapter?: string` is the _adapter-name_ a type registration
  is scoped to (e.g. `"postgresql"`), not a `DatabaseAdapter` connection, and
  the class is unrelated to `Base`.

### 4. `packages/activerecord/src/test-helpers/bootstrap-test-handler.ts`

- **Class:** none — the file is module-level functions
  (`bootstrapTestHandler`, `syncHandlerVisitor`).
- **Sites:** none (the only match, line 6, is a JSDoc comment _describing_ the
  `static { this.adapter = X }` bypass it exists to replace).
- **Verdict:** **legit (no write; leave alone)**
- **Rationale:** No `this.adapter` assignment exists; the file is the
  Phase-D handler-bootstrap helper that models migrate _toward_.

### 5. `packages/activerecord/src/migrator.ts`

- **Class:** `MigrationRunner` (no `extends`)
- **Sites:** 25
- **Verdict:** **legit class field (leave alone)** — for _this_ bypass audit.
- **Rationale:** `private adapter: DatabaseAdapter` is a constructor-bound
  reference on a standalone migration runner, not a `Base` subclass bypass.
- **Out-of-scope fidelity note (separate follow-up):** Rails' `Migrator`
  (`migration.rb:1405`) takes **no** adapter — it threads a `connection_pool`
  into `SchemaMigration`/`InternalMetadata` and resolves the live connection
  lazily per-call via `private def connection; DatabaseTasks.migration_connection; end`.
  trails already has the faithful port at `migration.ts` (`class Migrator`
  L2427 + `class MigrationContext` L1623, routing through
  `DatabaseTasks.migrationConnectionPool`). `MigrationRunner` is a redundant,
  non-Rails class (Rails has no `MigrationRunner`) that caches an adapter where
  Rails routes through the handler; the Rails-faithful fix is to consolidate
  callers onto `migration.ts`'s `Migrator`/`MigrationContext` and retire
  `MigrationRunner` — **not** to migrate its adapter field. Tracked separately
  from the 27 bypass-survivor sites.

### 6. `packages/activerecord/src/connection-adapters/abstract/schema-creation.ts`

- **Class:** `SchemaCreation` (no `extends`)
- **Sites:** 47
- **Verdict:** **legit class field (leave alone)**
- **Rationale:** `protected adapter: SchemaQuoter` is the quoter the SQL
  visitor uses; the class is a sibling abstraction to `SchemaStatements`, not a
  `Base` subclass — identical to the litmus-reference case the codemod skipped.

## Summary

| File                                              | Verdict             | Sites |
| ------------------------------------------------- | ------------------- | ----- |
| `adapters/postgresql/schema-ar-models.ts`         | **bypass survivor** | 8     |
| `encryption/test-helpers.ts`                      | **bypass survivor** | 19    |
| `type/adapter-specific-registry.ts`               | legit class field   | 1     |
| `test-helpers/bootstrap-test-handler.ts`          | legit (no write)    | 0     |
| `migrator.ts`                                     | legit class field   | 1     |
| `connection-adapters/abstract/schema-creation.ts` | legit class field   | 1     |

**Bypass-survivor sites remaining after the `*.test.ts` cleanup wave: 27** —
8 in `schema-ar-models.ts` and 19 in `encryption/test-helpers.ts`. Both are
fixture _builders_ (not `*.test.ts` files), so the test-file sweep does not
reach them; each needs a sized follow-up PR to migrate its factory-built
`Base` subclasses off `this.adapter = adapter` onto the `Base.connection`
handler chain (the `bootstrapTestHandler` pattern). **Not migrated here —
doc only.**

The other 4 files (`adapter-specific-registry.ts`, `bootstrap-test-handler.ts`,
`migrator.ts`, `schema-creation.ts`) are legitimate bound-adapter fields on
non-`Base` abstractions (or carry no write at all) and should be **permanently
excluded** from future `this.adapter` bypass audits.
