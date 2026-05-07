# ActiveRecord API Parity Plan: 74.1% → 100%

> **Sizing pass (consolidated 2026-05-03):** Every PR targets ~250 LOC (range 220–290) within the 300-LOC hard ceiling from CLAUDE.md. Sub-180 LOC PRs from the prior revision were folded into thematically adjacent work to avoid review-cycle overhead. Consolidations applied:
>
> - **Wave 1**: PRs 1+2+3 → single PR 1 (base types + adapter registry + deduplicable, ~260)
> - **Wave 0**: M3+M4 → M3 (~220)
> - **PR 9 + 9b**: mysql schema_creation + explain_pretty_printer (~260)
> - **PR 17 + 18 (old)**: sqlite + mysql database_statements (~280)
> - **PR 19 + 20 (old)**: mysql2 + pg database_statements (split as 18/18b)
> - **PR 28 + 34**: attributes.rb + aggregations.rb (~250)
> - **PR 32 + 33**: locking/optimistic + counter_cache (~240)
> - **PR 35 + 36**: core.rb + model_schema.rb (~280, may split)
> - **PR 47**: default_strategy folded into PR 45
> - **PR 48 + 49 (old)**: database_configurations + url_resolver (~300)
> - **PR 53 + 54 (old)**: railtie cluster + query_assertions (~290)
> - **PR 55 + 57 (old)**: enum + reflection (~260)
> - **PR 58 + 59 + tail of 52**: long-tail 1-missers + pg quoting (~270)
> - **PR 38b**: extended with inheritance.rb finisher (~240)

## Open PRs in flight (refreshed 2026-05-03)

`gh pr list --state open --limit 50` returns:

| #           | Title                                                      | Branch                         | Status |
| ----------- | ---------------------------------------------------------- | ------------------------------ | ------ |
| #1144 (E4)  | encryptable-record + encrypted-attribute-type to 100%      | enc-privates-4                 | OPEN   |
| #1143 (E3)  | encryption.ts + encryptor private methods to 100%          | enc-privates-3                 | OPEN   |
| #1142 (E2)  | encryption serializer/query/filter private methods to 100% | enc-privates-2                 | OPEN   |
| #1139 (B)   | abstract schema_creation + schema_dumper to 100%           | feat/abstract-adapters-B       | OPEN   |
| #1136 (P25) | drop AM uuid/json/array, consolidate to AR PG OIDs         | worktree-refactor+oid-layering | OPEN   |
| #281        | add Frontiers sandbox + marketing website                  | worktree-frontiers             | DRAFT  |

**E1 (#1140) is not in the open list — assumed merged.** Verify with `gh pr view 1140` before starting Wave 9.

**Net effect of in-flight PRs:**

- Wave 2 PRs 5 + 7 are covered by #1139 (pending merge). After merge, schema_creation and schema_dumper move to 100%.
- Wave 9 (encryption) is ~70% covered by E2/E3/E4. After those merge, remaining encryption work is **~27 methods** across 10 files: `encryption.ts` (11), `encryption/config.ts` (2), `encryption/cipher/aes256-gcm.ts` (2), `encryption/context.ts` (2), `encryption/key-generator.ts` (2), `encryption/key-provider.ts` (1), `encryption/message.ts` (1), `encryption/properties.ts` (1), `encryption/scheme.ts` (4), `encryption/derived-secret-key-provider.ts` (1). See PR 43 for the consolidated list.
- #1136 touches the type registry — verify interaction with Wave 1 PR 2 before starting.

---

## Headline Numbers

**Current state: 3767/5082 methods matched (74.1%)** (confirmed by fresh run 2026-05-03)

- Files at 100%: 165/275
- Files partial (1–99%): 100/275
- Files at 0%: 10/275 (`attribute-assignment.ts`, `mysql2/database-statements.ts`, `deprecator.ts`, all 4 middleware files, `migration/join-table.ts`, `railtie.ts`, `railties/job-runtime.ts`, `migration/default-strategy.ts`)
- Total missing: 1315
- Total misplaced: 176 (exist in TS but wrong file per Rails layout)
- Inheritance parity: 198/204 (97.1%)

**Rails source root:** `scripts/api-compare/.rails-source/activerecord/lib/active_record/` (abbreviated as `$AR/` below)

**TS source root:** `packages/activerecord/src/` (abbreviated as `$TS/` below)

### Methods gap by cluster

| Cluster                             | Rails file                                                                   | Missing | TS%             |
| ----------------------------------- | ---------------------------------------------------------------------------- | ------- | --------------- |
| abstract_adapter.rb                 | `$AR/connection_adapters/abstract_adapter.rb` (1234 LOC)                     | 306     | 34%             |
| base.rb                             | `$AR/base.rb` (338 LOC)                                                      | 165     | 40%             |
| relation.rb                         | `$AR/relation.rb` (1502 LOC)                                                 | 82      | 73%             |
| encryption (18 files)               | `$AR/encryption/`                                                            | 94      | varies          |
| abstract schema (4 files)           | abstract/schema\_{statements,definitions,creation,dumper}                    | 81      | varies          |
| migration + command_recorder        | `$AR/migration.rb` (1621 LOC) + `command_recorder.rb` (409 LOC)              | 53      | 68%/42%         |
| adapter variants (4 files)          | abstract_mysql, mysql2, pg, sqlite3 adapters                                 | 65      | 76%/64%/82%/75% |
| db_statements (5 adapters)          | per-adapter database_statements.rb                                           | 45      | 40–56%          |
| autosave + nested_attrs + timestamp | 3 files                                                                      | 42      | 34%/14%/31%     |
| schema mysql (4 files)              | mysql/{schema_creation,schema_dumper,schema_statements,explain_pp}           | 42      | 0%/0%/38%/20%   |
| schema pg (4 files)                 | pg/{schema_creation,schema_dumper,schema_statements,quoting}                 | 46      | 14%/0%/83%/71%  |
| attribute_methods.rb                | `$AR/attribute_methods.rb` (547 LOC)                                         | 31      | 56%             |
| middleware (4 files)                | `$AR/middleware/`                                                            | 35      | 0%              |
| schema sqlite (4+ files)            | sqlite3/{schema_creation,schema_definitions,schema_dumper,schema_statements} | 21      | 0%/60%/0%/50%   |
| tasks (4 files)                     | `$AR/tasks/`                                                                 | 25      | 71–83%          |
| misc small files                    | see PR 52                                                                    | ~57     | varies          |

> The 306 count on `abstract_adapter.rb` is inflated — most of those methods belong to Rails sub-files already decomposed into separate TS files. After Waves 2–5, the true residual for `abstract-adapter.ts` itself is ~40–60 methods (PR 25).

---

## Misplaced Methods (Wave 0 — pure moves)

**Correction from original plan:** The relation sub-files (`relation/finder-methods.ts`, `relation/query-methods.ts`, `relation/calculations.ts`, `relation/batches.ts`, `relation/spawn-methods.ts`, `relation/delegation.ts`) are **already at 100%** per the api:compare output. Wave 0 M1 "move 88 methods to relation sub-files" is not necessary for those — those moves have already happened. The 82 remaining missing methods in `relation.ts` are genuine missing privates (PR 37), not misplaced ones.

**What remains misplaced (verified against api:compare misplaced count of 176):**

| PR  | Source file                                                         | Destination                                                                                                                                                                                   | Sample misplaced methods                                                                                                                                                                                          | Count |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| M2  | `$TS/base.ts` (3148 LOC)                                            | `$TS/core.ts`, `$TS/model-schema.ts`, `$TS/persistence.ts`, `$TS/attribute-methods.ts`, `$TS/scoping/default.ts`, `$TS/scoping/named.ts`, `$TS/autosave-association.ts`, `$TS/no-touching.ts` | `id`, `touch`, `reload`, `save`, `save!`, `destroy`, `_touchRow`, `_updateRecord`, `_createRecord`, `initInternals`, `attributeMethodsGenerated?`, `scopeAttributes?`, `ignoreDefaultScope?`, `isScopeAttributes` | ~65   |
| M3  | `$TS/connection-adapters/abstract-adapter.ts` (1270 LOC)            | `$TS/connection-adapters/abstract/database-statements.ts`, `$TS/connection-adapters/mysql/database-statements.ts`                                                                             | `initialize`, `resetTransaction`, `isWriteQuery`, `buildExplainClause`, `selectAll`                                                                                                                               | ~12   |
| M4  | `$TS/connection-adapters/abstract/schema-definitions.ts` (1352 LOC) | mysql/schema-definitions, pg/schema-definitions                                                                                                                                               | `newColumnDefinition`, `aliasedTypes`, `primaryKey`                                                                                                                                                               | ~6    |

**M1 is removed** — its premise was incorrect. The 82 missing privates in `relation.ts` go into PR 37.

---

## Required Cross-Cutting Refactors (ordered)

**R1. `abstract_adapter.rb` decomposition** — `$TS/abstract-adapter.ts` (1270 LOC) vs `$AR/connection_adapters/abstract_adapter.rb` (1234 LOC). Rails distributes 306 missing methods across sub-files. The TS monolith maps to separate files but each sub-file still missing methods. Prerequisite for all Waves 2–5.

**R2. `performQuery` / `castResult` / `affectedRows` protocol** — Lines 400–460 of `$AR/connection_adapters/abstract/database_statements.rb` define the Rails 7.2 unified query execution hook. All 5 adapter database_statements files miss at least `performQuery` and `castResult`. Inner loop of every query path. Must land (PR 4) before PR 17–20.

**R3. `buildFixtureSql` / `insertFixturesSet` pipeline** — Missing from `abstract/database_statements.rb`. Part of PR 4's 13 missing methods. Needed for fixture loading tests.

**R4. Schema dumper base infrastructure** — `$AR/connection_adapters/abstract/schema_dumper.rb` (106 LOC) at 7% — only `create` matched. 13 methods missing. Every adapter-specific schema dumper overrides these. PR 7 (covered by #1139) must land before PRs 10, 13, 15.

**R5. `schemaCreation` visitor methods** — `$AR/connection_adapters/abstract/schema_creation.rb` (189 LOC) at 52%. All adapter-specific schema_creation files super-call these visitors. PR 5 (covered by #1139) must land before PRs 9, 12, 15.

**R6. `type/time.rb` and `type/unsigned_integer.rb`** — Both at 0%, scaffolds exist (`$TS/type/time.ts`, `$TS/type/unsigned-integer.ts`) but all methods missing. Rails source: `$AR/type/time.rb` (35 LOC), `$AR/type/unsigned_integer.rb` (16 LOC). Used by adapter type-map registrations. PR 1.

**R7. `migration/join_table.rb` (0%, 2 methods)** — `$AR/migration/join_table.rb` (16 LOC). `findJoinTableName` + `joinTableName`. Called inside `migration/command_recorder.rb`. File scaffold missing — must create `$TS/migration/join-table.ts`. Blocks PR 45.

**R8. `connection_url_resolver.rb` at 14%** — `$AR/database_configurations/connection_url_resolver.rb` (107 LOC), only 1 matched. Blocks `resolveConfigForConnection` in `connection-handling.ts` and multi-DB wiring. PR 48.

---

## Full PR Plan

Rails source paths use `$AR/` = `scripts/api-compare/.rails-source/activerecord/lib/active_record/`.
TS paths use `$TS/` = `packages/activerecord/src/`.

---

### Wave 0 — Misplaced-method cleanup (pure moves)

**PR M2 — Move base.ts module methods to correct files** ✅ #1151 #1152 #1156 #1157

**PR M3 — Move adapter-layer misplaced methods (combined)** ✅ #1161

---

### Wave 1 — Base type infrastructure

**PR 1 — Base types + adapter-specific registry (combined)** _(~260 net LOC)_ ✅ #1147

---

### Wave 2 — Abstract adapter decomposition

**PR 4 — `abstract/database_statements.rb` impl half** ✅ #1154

**PR 5 — `abstract/schema_creation.rb`** ✅ #1139

**PR 6 — `abstract/schema_definitions.rb`** ✅ #1174

**PR 7 — `abstract/schema_dumper.rb`** ✅ #1139

**PR 8 — `abstract/schema_statements.rb` privates (part A)** ✅ #1165

**PR 8b — `abstract/schema_statements.rb` privates (part B)** ✅ #1175

---

### Wave 3 — Adapter-specific schema files

**PR 9 — `mysql/schema_creation.rb` + `mysql/explain_pretty_printer.rb` (combined)** ✅ #1167

**PR 10 — `mysql/schema_dumper.rb` (0%)** ✅ #1179

**PR 11 — `mysql/schema_statements.rb`** ✅ #1182

**PR 12 — `postgresql/schema_creation.rb` (14%)** ✅ #1169

**PR 13 — `postgresql/schema_dumper.rb` (0%)** ✅ #1178

**PR 14 — `postgresql/schema_statements.rb` (83%)** ✅ #1183

**PR 15 — `sqlite3/schema_creation.rb` + `schema_definitions.rb` + `schema_dumper.rb`** ✅ #1184

**PR 16 — `sqlite3/schema_statements.rb` (50%)** ✅ #1191

---

### Wave 4 — Database statements per adapter

**PR 17 — sqlite3 + mysql `database_statements.rb` (combined)** ✅ #1231

**PR 18 — mysql2 + postgresql `database_statements.rb` (combined)** _(~320 net LOC — over hard limit, see split note)_

- Rails: `mysql2/database_statements.rb` (142 LOC), `postgresql/database_statements.rb` (231 LOC)
- TS: `$TS/connection-adapters/mysql2/database-statements.ts` (13%, 7 missing — **directory must be created**), `$TS/connection-adapters/postgresql/database-statements.ts` (54%, 11 missing)
- mysql2 missing (7): `performQuery`, `castResult`, `affectedRows`, `executeAndFreeResult`, `writeQuery?`, `defaultInsertValue`, `getReadFlags`
- pg missing (11): `performQuery`, `castResult`, `affectedRows`, `execNoCache`, `execCache`, `executeAndClear`, `getLastColumn`, `returnStringValuesWithin`, `queryTypemapForColumn`, `defaultInsertValue`, `buildTruncateStatement`
- **Split** to honor 300 LOC ceiling:
  - PR 18: mysql2 (~140) + pg perform_query/cast_result/affected_rows core (~80) → ~220
  - PR 18b: pg `execNoCache`, `execCache`, `executeAndClear`, `getLastColumn`, `returnStringValuesWithin`, `queryTypemapForColumn`, `defaultInsertValue`, `buildTruncateStatement` (~180)
- Dependencies: PR 4, PR 17 (for cross-adapter consistency)

> **PR 20 (postgresql/database_statements.rb) folded into PR 18 / PR 18b** — see Wave 4 PR 18 above. Listed here previously as a separate entry; that was a stale duplicate from the pre-consolidation revision.

---

### Wave 5 — Adapter classes

**PR 21 — `abstract_mysql_adapter.rb` (76%)** ✅ #1186 (first split, 12/22)

**PR 22 — `mysql2_adapter.rb` (64%) + `mysql2_adapter` test parity** ✅ #1233

**PR 23 — `postgresql_adapter.rb` (82%)** ✅ #1199 (first split) + #1242 (PR 23b)

**PR 24 — `sqlite3_adapter.rb`** ✅ #1195 (first split) + #1232 (PR 24b lifecycle/type-map)

---

### Wave 6 — abstract_adapter.rb residual

**PR 25 — `abstract_adapter.rb` core privates** ✅ #1235 (first split, 13/27)

---

### Wave 7 — Core AR model files

**PR 26 — `attribute_assignment.rb` (0%)** ✅ #1180

**PR 27 — `attribute_methods.rb`** ✅ #1185

**PR 28 — `attributes.rb` + `aggregations.rb` (combined)** ✅ #1237

**PR 29 — `timestamp.rb` (31%)** ✅ #1229

**PR 30 — `autosave_association.rb` (34%)** ✅ #1239

**PR 31 — `nested_attributes.rb` (14%)**

- Rails: `$AR/nested_attributes.rb` (633 LOC)
- TS: `$TS/nested-attributes.ts` (343 LOC, 2 matched, 12 missing, 14%)
- Missing (12): `assignNestedAttributesForCollectionAssociation`, `assignNestedAttributesForOneToOneAssociation`, `assignToOrMarkForDestruction`, `existingRecord?`, `shouldDeleteRecord?`, `shouldDestroyRecord?`, `callRejectIfProc`, `rejectNewRecord?`, `hasDestroyFlag?`, `missingDestroyFlag?`, `raiseNestedAttributesRecordNotFoundError`, `allowDestroyForNestedAttributes?`
- LOC: Rails 633 LOC → ~250 net
- Dependencies: PR 30

**PR 32 — `locking/optimistic.rb` + `counter_cache.rb` (combined)** ✅ #1230

**PR 35 — `core.rb` + `model_schema.rb` (combined)** _(~280 net LOC)_

- Rails: `$AR/core.rb` (894 LOC), `$AR/model_schema.rb` (633 LOC)
- TS: `$TS/core.ts` (85%, 8 missing), `$TS/model-schema.ts` (82%, 7 missing)
- core missing (8): `initializeFindByCache`, `find`, `findBy`, `findBy!`, `initializeGeneratedModules`, `generatedAssociationMethods`, `filterAttributes`, `inspectionFilter`
- model_schema missing (7): `derivedJoinTableName`, `tableExists?`, `attributesBuilder`, `columnTypes`, `_defaultAttributes`, `contentColumns`, `columnsHash`
- Plus accept 7 + 11 misplaced moves landed by PR M2
- LOC: ~160 + ~180 → split if it grows past 300:
  - PR 35: core.rb (~160)
  - PR 35b: model_schema.rb (~180)
- Dependencies: PR M2, PR 28
- Rationale: both are core class-level setup; pairing them lets the find/findBy cache live alongside columnsHash without an artificial split.

**PR 37 — `relation.rb` QueryMethods bang mutations** ✅ #1263

- Rails: `$AR/relation.rb` (1502 LOC)
- TS: `$TS/relation.ts`
- Added 40 explicit instance methods (bang mutations + `isNullRelation` + `constructJoinDependency` + `asyncBang`) that delegate to existing `QueryMethodBangs` functions, making them visible to api:compare.
- Removed `include(Relation, QueryMethodBangs)` and `Included<typeof QueryMethodBangs>` in favour of direct class declarations.
- relation.rb: 182/308 (59%) → 227/308 (74%)
- **Root cause of plan mismatch**: Groups A, C, and the 5 public methods (findOrCreateBy etc.) were already matched as of api:compare run. The actual missing 126 methods are those from included Ruby modules (QueryMethods, FinderMethods, Calculations, Batches) that live in TS sub-files invisible to the extractor.
- **Remaining 81 missing** (verify with fresh api:compare):
  - ~20 calculation privates (from `relation/calculations.rb`) — some may need class-level delegation in relation.ts
  - ~14 finder privates (`findWithIds`, `findOne`, etc.) — exist as file-level functions in finder-methods.ts
  - ~30 build helpers (`buildArel`, `buildJoins`, etc.) — exist in query-methods.ts but not in QueryMethodBangs const
  - ~10 batch helpers (`ensureValidOptionsForBatchingBang`, etc.)
  - ~7 other (explain, async)
- Split for remaining:
  - PR 37b (~25): calculation privates + `ensureValidOptionsForBatchingBang` + `async`
  - PR 37c (~25): build helpers (`buildArel`, `buildJoins`, `buildSelect`, `buildFrom`, etc.)
  - PR 37d (~31): finder privates + remaining
- Dependencies: complete

---

### Wave 8 — base.rb wiring

**PR 38 — base.rb wiring part 1**

- Rails: `$AR/base.rb` (338 LOC — mostly `include` and `extend` calls that wire modules)
- TS: `$TS/base.ts` (3148 LOC)
- Wire: `attributeAssignment` (PR 26), `timestamp` (PR 29), `autosaveAssociation` (PR 30), `nestedAttributes` (PR 31), `counterCache` (in PR 32 combined), `aggregations` (in PR 28 combined), `locking/optimistic` (in PR 32 combined)
- LOC: ~150 net (ensure each module's `include()` / class decorators properly merge)
- Dependencies: PRs 26, 27, 28, 29, 30, 31, 32, 37 (PRs 33 and 34 from the prior revision were folded into PR 32 and PR 28 respectively)
- Risk: Wave 8 also depends on PR 37 (relation.rb) — the original plan omitted this dependency.

**PR 38b — base.rb wiring part 2 + `inheritance.rb` finisher** _(~240 net LOC)_

- Wire: encryption hooks (Wave 9), middleware hooks (PR 50), `insertAll` privates (PR 56), `delegatedType`, `enum`, `explain`
- Plus: complete `$AR/inheritance.rb` (95% → 100%, 1 missing: `findSubclass`) and add full Rails-mirrored test cases for STI subclass routing
- LOC: ~120 wiring + ~120 inheritance/STI tests → ~240
- Dependencies: PR 38, Wave 9 PRs

---

### Wave 9 — Encryption (18 files, ~94 missing)

**Status**: E1 (#1140, assumed merged), E2 (#1142), E3 (#1143), E4 (#1144) in flight. After E2/E3/E4 merge, remaining gap is ~16 methods.

**PR 39 — `encryptor.rb` (35%)** _(covered by E3)_

**PR 40 — `message_serializer.rb` + `message_pack_message_serializer.rb`** _(covered by E2)_

**PR 41 — `encrypted_attribute_type.rb` (45%)** _(covered by E4)_

**PR 42 — `encryptable_record.rb` (30%)** _(covered by E4)_

**PR 43 — Remaining encryption small files**

- After E1–E4 merge, remaining work across:

| File                                        | TS path                                         | Missing |
| ------------------------------------------- | ----------------------------------------------- | ------- |
| `encryption.rb`                             | `$TS/encryption.ts`                             | 11      |
| `encryption/config.rb`                      | `$TS/encryption/config.ts`                      | 2       |
| `encryption/cipher/aes256_gcm.rb`           | `$TS/encryption/cipher/aes256-gcm.ts`           | 2       |
| `encryption/context.rb`                     | `$TS/encryption/context.ts`                     | 2       |
| `encryption/key_generator.rb`               | `$TS/encryption/key-generator.ts`               | 2       |
| `encryption/key_provider.rb`                | `$TS/encryption/key-provider.ts`                | 1       |
| `encryption/message.rb`                     | `$TS/encryption/message.ts`                     | 1       |
| `encryption/properties.rb`                  | `$TS/encryption/properties.ts`                  | 1       |
| `encryption/scheme.rb`                      | `$TS/encryption/scheme.ts`                      | 4       |
| `encryption/derived_secret_key_provider.rb` | `$TS/encryption/derived-secret-key-provider.ts` | 1       |

> **Removed from this list (already covered by E2 #1142):** `encryption/auto_filtered_parameters.rb`, `encryption/envelope_encryption_key_provider.rb`, `encryption/extended_deterministic_queries.rb`. Verify each is at 100% on `api:compare` after E2 lands; if any regressions appear, restore here.

- ~27 methods across 10 files, ~180 net LOC
- Dependencies: PRs 39–42 (E1–E4 stack)

---

### Wave 10 — Migration cluster

**PR 44 — `migration/join_table.rb` (0%)** ✅ #1188

**PR 45 — `migration/command_recorder.rb` (42%)** ✅ #1236

**PR 46 — `migration.rb` (68%)**

- Rails: `$AR/migration.rb` (1621 LOC)
- TS: `$TS/migration.ts` (2357 LOC, 66 matched, 31 missing, 68%)
- Note: TS is already 736 LOC larger than Rails source. High risk of method name drift — run `grep "def " $AR/migration.rb` against `grep "^\s*\w\+(" $TS/migration.ts` before assuming all 31 are truly missing.
- Missing (31, grouped):
  - Migrator lifecycle (10): `runWithoutLock`, `buildWatcher`, `nearestDelegate`, `checkAllPending!`, `loadSchemaIfPending!`, `maintainTestSchema!`, `methodMissing`, `checkPendingMigrations`, `executeBlock`, `compatibleTableDefinition`
  - Advisory lock (6): `withAdvisoryLock`, `advisoryLockName`, `acquireAdvisoryLock`, `releaseAdvisoryLock`, `advisoryLockEnabled?`, `advisoryLockSql`
  - Schema/env helpers (8): `migrationFilesToRunFor`, `migrateWithoutLock`, `runningRollback?`, `runningUp?`, `runningDown?`, `migratable?`, `filterTargetVersion`, `currentVersion`
  - Misc (7): remaining from `grep "def " $AR/migration.rb`
- Split:
  - PR 46 (16): Migrator lifecycle + advisory lock
  - PR 46b (15): Schema/env helpers + misc
- LOC: ~280 net each
- Dependencies: PR 45

> **PR 47 (default_strategy.rb, 1 missing) folded into PR 45.** Too small to ship alone; the `connection` method is referenced by `command_recorder` invert dispatch.

---

### Wave 11 — Mid-tier (database_configurations, middleware, tasks, misc)

**PR 48 — `database_configurations.rb` + `connection_url_resolver.rb` (combined)** _(~300 net LOC — at hard ceiling)_

- Rails: `$AR/database_configurations.rb` (309 LOC), `$AR/database_configurations/connection_url_resolver.rb` (107 LOC)
- TS: `$TS/database-configurations.ts` (50%, 11 missing), `$TS/database-configurations/connection-url-resolver.ts` (14%, 6 missing)
- database_configurations missing (11): `resolve`, `resolveConfigForConnection`, `findDbConfig`, `configs`, `primaryConfig?`, `replicaConfig?`, `hasPrimaryConfig?`, `hasMultipleDatabases?`, `hasMultipleRoles?`, `shards`, `shardNames`
- connection_url_resolver missing (6): `resolve`, `resolveUrl`, `userInfo`, `databaseFromPath`, `schemeToAdapter`, `normalizeUrl`
- LOC: ~200 + ~100 → ~300 (right at hard ceiling — split if any test add pushes over)
- Dependencies: none
- Rationale: resolver is called from database_configurations.resolve; landing together avoids a stub layer.

**PR 50 — Middleware cluster (4 files at 0%)**

- Rails sources:
  - `$AR/middleware/database_selector.rb` (87 LOC) — 0%, 6 missing
  - `$AR/middleware/database_selector/resolver.rb` (92 LOC) — 0%, 15 missing
  - `$AR/middleware/database_selector/resolver/session.rb` (48 LOC) — 0%, 8 missing
  - `$AR/middleware/shard_selector.rb` (62 LOC) — 0%, 6 missing
- TS targets: **directory `$TS/middleware/` does not exist — must be created** along with all 4 files
- Missing (35 total):
  - `database-selector.ts` (6): `initialize`, `call`, `select_database`, `update_last_write_timestamp`, `read_from_primary?`, `instrumenter`
  - `database-selector/resolver.ts` (15): `initialize`, `call`, `read`, `write`, `readPrimary?`, `readReplica?`, `preventWritesToPrimary?`, `requiresPrimary?`, `send_request_to_primary?`, `updateLastWriteTimestamp`, `potentialWriteOperation?`, `savedRecentWrite?`, `recentWrite?`, `secondsSinceLastWriteTimestamp`, `contextFor`
  - `database-selector/resolver/session.ts` (8): `initialize`, `lastWriteTimestamp`, `updateLastWriteTimestamp`, `save`, `restoreSession`, `contextFor`, `delete`, `stale?`
  - `shard-selector.ts` (6): `initialize`, `call`, `selectShard`, `instrumenter`, `shardResolver`, `shardSelectorStrategy`
- LOC: ~260 net
- Dependencies: PR 48
- Risk: These depend on Rack-style middleware infrastructure. Verify how `connection-handling.ts` implements the middleware interface before implementing.

**PR 51 — Tasks cluster** (#1270)

- Rails sources:

| Rails file                               | LOC      | TS file                                  | Missing |
| ---------------------------------------- | -------- | ---------------------------------------- | ------- |
| `$AR/tasks/database_tasks.rb`            | 673 LOC  | `$TS/tasks/database-tasks.ts`            | 13      |
| `$AR/tasks/mysql_database_tasks.rb`      | ~150 LOC | `$TS/tasks/mysql-database-tasks.ts`      | 4       |
| `$AR/tasks/postgresql_database_tasks.rb` | ~150 LOC | `$TS/tasks/postgresql-database-tasks.ts` | 4       |
| `$AR/tasks/sqlite_database_tasks.rb`     | ~100 LOC | `$TS/tasks/sqlite-database-tasks.ts`     | 4       |

- Missing (25 total, sample from `database_tasks.rb`): `databaseConfiguration`, `dbConfig`, `checkSchemaFile`, `loadConfigAndConnectTo`, `migrate`, `maintainTestSchema`, `raiseForMultipleDatabases`, `createAll`, `dropAll`, `purge`, `purgeAll`, `dumpSchemaCache`, `checkTargetVersion`
- LOC: ~260 net
- Dependencies: PR 48

**PR 52 — Misc small files (21 files)**

| Rails file                               | TS file                                                  | Missing | Sample missing methods                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store.rb`                               | `$TS/store.ts`                                           | 4       | `writeStoreAttribute`, `readStoreAttribute`, `storeAccessorTargetClass`, `typedStoreClass`                                                         |
| `result.rb`                              | `$TS/result.ts`                                          | 2       | `castValues`, `newResult`                                                                                                                          |
| `type/serialized.rb`                     | `$TS/type/serialized.ts`                                 | 1       | `typecastedValue`                                                                                                                                  |
| `type/type_map.rb`                       | `$TS/type/type-map.ts`                                   | 1       | `fetchAll`                                                                                                                                         |
| `touch_later.rb`                         | `$TS/touch-later.ts`                                     | 2       | `touchLaterByClass`, `allTouchLaterClasses`                                                                                                        |
| `normalization.rb`                       | `$TS/normalization.ts`                                   | 2       | `normalizeValue`, `executeNormalization`                                                                                                           |
| `table_metadata.rb`                      | `$TS/table-metadata.ts`                                  | 2       | `scopeForCreate`, `hasJoinConstraints`                                                                                                             |
| `type_caster/connection.rb`              | `$TS/type-caster/connection.ts`                          | 1       | `lookupCastType`                                                                                                                                   |
| `type_caster/map.rb`                     | `$TS/type-caster/map.ts`                                 | 1       | `typecastedValue`                                                                                                                                  |
| `connection_adapters.rb`                 | `$TS/connection-adapters.ts`                             | 1       | `registerAdapter`                                                                                                                                  |
| `connection_handling.rb`                 | `$TS/connection-handling.ts`                             | 1       | `resolveConfigForConnection`                                                                                                                       |
| `connection_adapters/schema_cache.rb`    | `$TS/connection-adapters/schema-cache.ts`                | 5       | `encodeWith`, `initWith`, `marshal_dump`, `marshal_load`, `clearDataSourceCache!`                                                                  |
| `connection_adapters/statement_pool.rb`  | `$TS/connection-adapters/statement-pool.ts`              | 1       | `cacheSQL`                                                                                                                                         |
| `explain.rb`                             | `$TS/explain.ts`                                         | 2       | `execExplain`, `stringifyExplain`                                                                                                                  |
| `explain_registry.rb`                    | `$TS/explain-registry.ts`                                | 1       | `register`                                                                                                                                         |
| `integration.rb`                         | `$TS/integration.ts`                                     | 2       | `toParam`, `cacheKey`                                                                                                                              |
| `delegated_type.rb`                      | `$TS/delegated-type.ts`                                  | 1       | `delegatedTypeFor`                                                                                                                                 |
| `log_subscriber.rb`                      | `$TS/log-subscriber.ts`                                  | 1       | `colorizePayload`                                                                                                                                  |
| `query_logs.rb`                          | `$TS/query-logs.ts`                                      | 2       | `updateQueryLogsTags`, `appendCommentToSql`                                                                                                        |
| `database_configurations/hash_config.rb` | `$TS/database-configurations/hash-config.ts`             | 1       | `keyNotFoundError`                                                                                                                                 |
| `database_configurations/url_config.rb`  | `$TS/database-configurations/url-config.ts`              | 1       | `buildHashConfig`                                                                                                                                  |
| `postgresql/oid/enum.rb`                 | `$TS/connection-adapters/postgresql/oid/enum.ts`         | 1       | `castValue`                                                                                                                                        |
| `postgresql/oid/legacy_point.rb`         | `$TS/connection-adapters/postgresql/oid/legacy-point.ts` | 1       | `castValue`                                                                                                                                        |
| `postgresql/oid/range.rb`                | `$TS/connection-adapters/postgresql/oid/range.ts`        | 1       | `castValueFrom`                                                                                                                                    |
| `postgresql/utils.rb`                    | `$TS/connection-adapters/postgresql/utils.ts`            | 1       | `extractSchemaQualifiedTableName`                                                                                                                  |
| `postgresql/quoting.rb`                  | `$TS/connection-adapters/postgresql/quoting.ts`          | 7       | `encodedArray`, `encodeRange`, `determineEncodingOfStringsInArray`, `typeCastArray`, `typeCastRangeValue`, `infinity?`, `lookupCastTypeFromColumn` |
| `scoping/default.rb`                     | `$TS/scoping/default.ts`                                 | 2       | `scopeAttributes?`, `ignoreDefaultScope?`                                                                                                          |
| `scoping/named.rb`                       | `$TS/scoping/named.ts`                                   | 1       | `validScopeName?`                                                                                                                                  |

- Total: ~57 missing methods, ~240 net LOC
- Dependencies: relevant Wave 2–7 PRs per file

**PR 53 — Railtie + deprecator + job_runtime + query_assertions (combined)** ✅ #1197 + #1198 (PR 53b query_assertions)

---

### Wave 12 — Long tail

**PR 55 — `enum.rb` + `reflection.rb` (combined)** _(~260 net LOC)_

- Rails: `$AR/enum.rb` (411 LOC), `$AR/reflection.rb` (1282 LOC)
- TS: `$TS/enum.ts` (63%, 7 missing), `$TS/reflection.ts` (93%, 7 missing)
- enum missing (7): `enum`, `definedEnums`, `_enum`, `enumValues`, `buildEnumScopeMethod`, `buildEnumSingletonMethods`, `buildEnumInstanceMethods`
- reflection missing (7): `derivedJoinTableName`, `hasThroughReflections?`, `joinTable`, `joinPrimaryKey`, `joinForeignKey`, `checkValidityForMacro`, `ensureNotPolymorphic`
- LOC: ~140 + ~120 → ~260
- Dependencies: PR 35 (model_schema component)
- Rationale: both define class-level metadata generators; reflection's `derivedJoinTableName` overlaps `model_schema.derivedJoinTableName`.

**PR 56 — `insert_all.rb` (58%)**

- Rails: `$AR/insert_all.rb` (328 LOC)
- TS: `$TS/insert-all.ts` (19 matched, 14 missing, 58%)
- Missing (14): `buildScopeAttributes`, `buildReturning`, `buildConflictTarget`, `buildConflictResolution`, `buildUpdates`, `buildUpdateCondition`, `allDefaultAttributes`, `allDefaultAttributesExcluding`, `customUpdateSql`, `primaryKey?`, `uniqueByColumns`, `returningClause`, `conflictTargetClause`, `updateSql`
- LOC: ~220 + ~50 of upsert/conflict integration tests → ~270 net
- Dependencies: PR 35 (model_schema component), PR 8

**PR 57 — Long-tail 1-missers + pg quoting residual (combined)** _(~270 net LOC)_

Folds former PRs 58 + 59 plus the remaining unassigned 1-missers from the PR 52 catch-all that share quoting/explain concerns.

| Cluster                                | Files                                                                                                               | Missing |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------- |
| explain/log/integration/delegated_type | `explain.rb` (2), `explain_registry.rb` (1), `log_subscriber.rb` (1), `integration.rb` (2), `delegated_type.rb` (1) | 7       |
| pg quoting                             | `postgresql/quoting.rb` (7)                                                                                         | 7       |
| query_logs + internal_metadata         | `query_logs.rb` (2), `internal_metadata.rb` (1)                                                                     | 3       |
| pg OID 1-missers                       | `oid/enum.rb`, `oid/legacy_point.rb`, `oid/range.rb`                                                                | 3       |
| pg utils + scoping leaves              | `postgresql/utils.rb` (1), `scoping/default.rb` (2), `scoping/named.rb` (1)                                         | 4       |

- LOC: ~270 net
- Dependencies: PR 4 (for explain), PR 14 (for pg quoting)
- Rationale: pg quoting's `lookupCastTypeFromColumn` cross-cuts with explain output formatting and pg OID encoders; lumping reduces context-switch cost.

---

## Risks / Unknowns (concrete, file-specific)

1. **`withRawConnection` lease semantics** (`$AR/connection_adapters/abstract_adapter.rb` lines 983–1053): 70 LOC block managing connection validity, retry loops, and pool re-check. Couples to `verified!` (line 1054) and the pool work in #1133/#1134. Must read both PRs before PR 25.

2. **`performQuery` protocol** (`$AR/connection_adapters/abstract/database_statements.rb` lines ~400–430): Rails 7.2 central query chokepoint for instrumentation, query cache, and retry. Every adapter overrides it. PR 4 must nail the interface so PRs 17–20 correctly super-delegate. Wrong interface = silent query cache bypass.

3. **`buildArel` family in `relation.ts` (PR 37)**: `$TS/relation.ts` is 4591 LOC vs `$AR/relation.rb` 1502 LOC. TS has 3x more code — many "missing" privates likely exist under drift names. Do a side-by-side diff of `grep "def " $AR/relation.rb` against `grep "^\s*\(private\s\+\)\?\w\+(" $TS/relation.ts` before each split.

4. **`assignMultiparameterAttributes`** (`$AR/attribute_assignment.rb` lines ~30–82): Parses Rails date decomposition fields `name(1i)`, `name(2i)`, `name(3i)` for day/month/year splitting into Date objects. No TS precedent in the codebase — needs a string-splitting parser. PR 26 risk.

5. **`defineNonCyclicMethod`** (`$AR/autosave_association.rb`): Ruby metaprogramming to prevent autosave cycles. Check `$TS/autosave-association.ts` for any existing cycle-prevention before implementing from scratch in PR 30.

6. **`migration.ts` already 736 LOC larger than Rails source**: `$TS/migration.ts` (2357 LOC) vs `$AR/migration.rb` (1621 LOC). Before implementing all 31 "missing" methods in PR 46, audit for TS-side methods that match by behavior but differ in name.

7. **Schema dumper output format must be byte-exact**: `$AR/connection_adapters/abstract/schema_dumper.rb` defines string format like `t.string "name", limit: 255, null: false`. PR 7 (in #1139) + adapter-specific PRs 10, 13, 15 must produce identical output — downstream schema-load tests will diff the output.

8. **`command_recorder` invert dispatch table** (`$AR/migration/command_recorder.rb`): Check `$TS/migration/command-recorder.ts` for whether it uses a dispatch table (Ruby `REVERSIBLE_AND_IRREVERSIBLE_METHODS`) before reimplementing each `invert*` in PR 45 — may be a single dispatch expansion.

9. **Middleware Rack interface** (`$AR/middleware/database_selector.rb`): `call(env)` follows Rack convention. Verify how the TS project handles middleware (possibly as async function middleware, not Rack). PR 50 may need a different interface contract.

10. **`visitAddForeignKey` signature conflict** (noted in #1139): Legacy `(fromTable, toTable, options)` vs Rails `(o: ForeignKeyDefinition)`. The file-local helper workaround in #1139 must survive through PRs 9, 12 which also override this method.

11. **`mysql2/` directory missing entirely**: `$TS/connection-adapters/mysql2/` does not exist. PR 18 must create directory + file. Verify `tsconfig.json` and `package.json` exports map do not need updating.

12. **`railtie.ts` + `middleware/` directory both missing**: These require creating new top-level files and directories. Verify `$TS/index.ts` or barrel exports need updating after PR 50 and PR 53.

13. **MariaDB `DATETIME` serialization**: The mysql2 adapter inserts ISO 8601 `Z`-suffix strings into `DATETIME` columns (e.g. `"2026-05-05T14:32:00Z"`) which MariaDB rejects. Surfaced during the test-schema migration (TS-4d #1211): both `defineSchema` and the legacy auto-schema path work around it by mapping `datetime` → `TEXT` on non-PG, so timestamp columns are never exercised as real `DATETIME` on MariaDB/SQLite. The real fix is in the adapter's datetime quoter/typecaster — emit MariaDB-compatible `YYYY-MM-DD HH:MM:SS` (no `T`, no `Z`) for `DATETIME` columns. Likely lives near `connection-adapters/mysql2/quoting.ts` / `typecast.ts`. Slot in alongside PR 22 (`mysql2_adapter.rb`) or as a standalone fix; tag PR 22's body with this dependency. Once fixed, revert the `defineSchema` datetime→TEXT downgrade so MariaDB tests actually exercise `DATETIME` semantics.

---

## Critical Files

- `packages/activerecord/src/connection-adapters/abstract-adapter.ts`
- `packages/activerecord/src/connection-adapters/abstract/database-statements.ts`
- `packages/activerecord/src/connection-adapters/abstract/schema-statements.ts`
- `packages/activerecord/src/relation.ts`
- `packages/activerecord/src/base.ts`

---
