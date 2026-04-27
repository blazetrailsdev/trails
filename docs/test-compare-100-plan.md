# activerecord test:compare → 100% Plan

Snapshot 2026-04-26: `activerecord 5894/8348 (70.6%) | 338/338 files | 0 misplaced`.
Total pending: **2454 tests** across skipped tests; zero missing files, zero misplaced.

PR sizing follows the repo rule (≤20 methods/feature touchpoints unless trivial).
For each PR the rails source path(s) and trails source/test paths are listed.

## Completed

- **Phase 0** (all stub moves) — PR #855 moved 242 stubs; PRs #861/#869/#875/#880/#890/#893/#896 filled additional gaps
- **PR 1.3** eager loading — PR #858
- **PR 1.4** base_test connected_to guards — PR #866
- **PR 1.12** unsafe raw SQL — PR #860
- **PR 1.13** multiparameter attributes — PR #877
- **PR 1.14** query cache — PR #883
- **PR 1.15** relation/where + where_chain (partial) — PR #889
- **PR 1.16** inverse_of associations — PR #894
- **PR 1.17** integration cache_key/version — PR #878
- **PR 1.20** collection cache key — PR #886
- **PR 1.28** transaction instrumentation — PR #904
- **PR 1.29** counter cache — PR #903
- **PR 1.37** transactions residual — PR #907
- **PR 1.38** filter_attributes — PR #905

---

## Phase 1 — Big skip clusters (single-feature PRs)

### ~~PR 1.1 / 1.2 — Fixtures~~ (skipped — see "Doesn't translate" list)

### PR 1.5 — associations_test residual (50 skipped)

- Rails: `lib/active_record/associations.rb`,
  `lib/active_record/associations/{association,collection_association,
singular_association,builder/*}.rb`
- Rails test: `test/cases/associations_test.rb`
- Trails source: `src/associations.ts`, `src/associations/*.ts`
- Trails test: `src/associations.test.ts`
- Tests to implement:
  - `subselect`
  - `using limitable reflections helper`
  - `association with references`
  - `querying by whole associated records using query constraints`
  - `querying by single associated record works using query constraints`
  - `has many association from a model with query constraints different from the association`
  - `query constraints over three without defining explicit foreign key query constraints raises`
  - `belongs to association does not use parent query constraints if not configured to`
  - `polymorphic belongs to uses parent query constraints`
  - `preloads model with query constraints by explicitly configured fk and pk`
  - `query constraints that dont include the primary key raise with a single column`
  - `query constraints that dont include the primary key raise with multiple columns`
  - `append composite foreign key has many association with autosave`
  - `assign composite foreign key belongs to association with autosave`
  - `append composite has many through association`
  - `append composite has many through association with autosave`
  - `nullify composite has many through association`
  - `push has many through does not load target`
  - `inspect does not reload a not yet loaded target`
  - `pretty print does not reload a not yet loaded target`
  - `save on parent saves children`
  - `proxy object can be stubbed`
  - `inverses get set of subsets of the association`
  - `preload groups queries with same scope`
  - `preload grouped queries with already loaded records`
  - `preload grouped queries of middle records`
  - `preload grouped queries of through records`
  - `preload through records with already loaded middle record`
  - `preload with instance dependent scope`
  - `preload with instance dependent through scope`
  - `preload with through instance dependent scope`
  - `preload groups queries with same scope at second level`
  - `preload groups queries with same sql at second level`
  - `preload with grouping sets inverse association`
  - `preload can group separate levels`
  - `preload can group multi level ping pong through`
  - `preload does not group same class different scope`
  - `preload does not group same scope different key name`
  - `multi database polymorphic preload with same table name`
  - `preload with available records sti`
  - `preload with available records with through association`
  - `preload with only some records available with through associations`
  - `preload with available records queries when scoped`
  - `preload with available records queries when collection`
  - `preload with available records queries when incomplete`
  - `preload has many association with composite foreign key`
  - `preload belongs to association with composite foreign key`
  - `preload loaded belongs to association with composite foreign key`
  - `preload has many through association with composite query constraints`

### PR 1.6 — Schema dumper (43 tests)

- Rails: `lib/active_record/schema_dumper.rb`,
  `lib/active_record/connection_adapters/abstract/schema_dumper.rb`,
  `lib/active_record/connection_adapters/{postgresql,mysql2,sqlite3}/schema_dumper.rb`
- Rails test: `test/cases/schema_dumper_test.rb`
- Trails source: `src/schema-dumper.ts`, `src/connection-adapters/abstract/schema-dumper.ts`
- Trails test: `src/schema-dumper.test.ts`

### PR 1.7 — Insert/upsert all (43 tests)

- Rails: `lib/active_record/insert_all.rb`
- Rails test: `test/cases/insert_all_test.rb`
- Trails source: `src/insert-all.ts`
- Trails test: `src/insert-all.test.ts`

### PR 1.8 — has_and_belongs_to_many (43 tests)

- Rails test: `test/cases/associations/has_and_belongs_to_many_associations_test.rb`
- Trails test: `src/associations/has-and-belongs-to-many-associations.test.ts`

### PR 1.9 — Join model / habtm-via-has-many-through (41 tests)

- Rails test: `test/cases/associations/join_model_test.rb`
- Trails test: `src/associations/join-model.test.ts`

### PR 1.10 — Autosave association residual (39 tests)

- Rails: `lib/active_record/autosave_association.rb`
- Rails test: `test/cases/autosave_association_test.rb`
- Trails source: `src/autosave-association.ts`
- Trails test: `src/autosave-association.test.ts`

### PR 1.11 — has_many :through residual (38 tests)

- Rails test: `test/cases/associations/has_many_through_associations_test.rb`
- Trails test: `src/associations/has-many-through-associations.test.ts`

### PR 1.18 — load_async + future_result (31 tests)

- Rails: `lib/active_record/relation.rb` (`load_async`, `then`),
  `lib/active_record/future_result.rb`
- Rails test: `test/cases/relation/load_async_test.rb`
- Trails source: `src/relation.ts`, `src/future-result.ts`
- Trails test: `src/relation/load-async.test.ts`

### PR 1.19 — Strict loading (30 tests)

- Rails test: `test/cases/strict_loading_test.rb`
- Trails test: `src/strict-loading.test.ts`

### PR 1.21 — Encryption: encryptable_record (28 tests)

- Rails test: `test/cases/encryption/encryptable_record_test.rb`
- Trails test: `src/encryption/encryptable-record.test.ts`

### PR 1.22 — has_one residual (28 tests)

- Rails test: `test/cases/associations/has_one_associations_test.rb`
- Trails test: `src/associations/has-one-associations.test.ts`

### PR 1.23 — Migration core remainder (27 tests)

- Rails test: `test/cases/migration_test.rb`
- Trails test: `src/migration.test.ts`

### PR 1.24 — Tasks::DatabaseTasks (26 tests)

- Rails test: `test/cases/tasks/database_tasks_test.rb`
- Trails test: `src/tasks/database-tasks.test.ts`

### PR 1.25 — Connection pool / handler / pool config (24+13+13 tests)

- Rails tests: `test/cases/connection_pool_test.rb`,
  connection_handler, connection_handlers_multi_db, sharding
- Three sub-PRs.

### PR 1.26 — Reflection (22 tests)

- Rails test: `test/cases/reflection_test.rb`
- Trails test: `src/reflection.test.ts`

### PR 1.27 — has_one :through (22 tests)

- Rails test: `test/cases/associations/has_one_through_associations_test.rb`
- Trails test: `src/associations/has-one-through-associations.test.ts`

### PR 1.30 — has_many :through disable_joins (19 tests)

- Rails test: `test/cases/associations/has_many_through_disable_joins_associations_test.rb`
- Trails test: `src/associations/has-many-through-disable-joins-associations.test.ts`

### PR 1.31 — Type::TypeMap + boundary type tests (18+8+10+2+2+1+3+2 tests)

- Rails tests: `test/cases/type/{type_map,integer,date_time,string,time,unsigned_integer}_test.rb`
- Two sub-PRs: (a) TypeMap + lookup, (b) primitive types.

### PR 1.32 — date_time_precision + time_precision + date_time + dates (18+8+10+1+3 tests)

- Rails tests: `test/cases/{date_time_precision,time_precision,date_time,date,date_test}_test.rb`

### PR 1.33 — Cascaded eager loading + eager_singularization + eager_load_includes_full_sti_class (18+6+8 tests)

- Rails tests: `test/cases/associations/{cascaded_eager_loading,eager_singularization,eager_load_includes_full_sti_class,eager_load_nested_include}_test.rb`

### PR 1.34 — Comments on tables/columns (17 tests)

- Rails test: `test/cases/comment_test.rb`
- Trails test: `src/comment.test.ts`

### PR 1.35 — Bind parameter (17 tests)

- Rails test: `test/cases/bind_parameter_test.rb`
- Trails test: `src/bind-parameter.test.ts`

### PR 1.36 — yaml_serialization + serialization_test + serialized_attribute residual (16+1+16 tests)

- Rails tests: `test/cases/{yaml_serialization,serialization,serialized_attribute}_test.rb`

### PR 1.39 — Database selector / configurations (16+34+16+4 tests)

- Rails tests: `test/cases/database_selector_test.rb`, `test/cases/database_configurations/*.rb`
- Two sub-PRs: (a) configurations, (b) selector middleware.

### PR 1.40 — Transaction callbacks residual (15 tests)

- Rails test: `test/cases/transaction_callbacks_test.rb`
- Trails test: `src/transaction-callbacks.test.ts`

### PR 1.41 — Invertible migration + hot_compatibility (10+4 tests)

- Rails tests: `test/cases/invertible_migration_test.rb`, `test/cases/hot_compatibility_test.rb`

### PR 1.42 — Reserved word + multiple_db + connection_management + connection_handling (11+11+11+6 tests)

- Rails tests: `test/cases/{reserved_word,multiple_db,connection_management,connection_handling}_test.rb`

### PR 1.43 — Assertions::QueryAssertions (10 tests)

- Rails test: `test/cases/assertions/query_assertions_test.rb`
- Trails test: `src/assertions/query-assertions.test.ts`

### PR 1.44 — Sharding (6+4 tests)

- Rails tests: `test/cases/{shard_keys,shard_selector}_test.rb`

### PR 1.45 — primary_class_test + multi_db_migrator + connection swapping (7+7+7+7 tests)

- Rails tests: `test/cases/{primary_class,multi_db_migrator}_test.rb`, connection_adapters/connection_swapping

### PR 1.46 — readonly + transaction_isolation + base_prevent_writes + adapter_prevent_writes (7+7+8+1 tests)

- Rails tests: `test/cases/{readonly,transaction_isolation,base_prevent_writes,adapter_prevent_writes}_test.rb`

### PR 1.47 — i18n validations (11+4+1 tests)

- Rails tests: `test/cases/validations/{i18n_generate_message_validation,i18n_validation,uniqueness_validation,association_validation}_test.rb`

### PR 1.48 — Encryption schemes + uniqueness + configurable + api + unencrypted + concurrency + msgpack (9+6+3+5+2+1+3 tests)

- Rails tests: `test/cases/encryption/{encryption_schemes,uniqueness_validations,configurable,encryptable_record_api,unencrypted_attributes,concurrency,encryptable_record_message_pack_serialized,encryptor}_test.rb`

### PR 1.49 — connection_adapters/schema_cache residual (9 tests)

- Rails test: `test/cases/connection_adapters/schema_cache_test.rb`
- Trails test: `src/connection-adapters/schema-cache.test.ts`

### PR 1.50 — Statement cache + database_statements + statement_invalid + prepared_statement_status (3+2+2+1 tests)

- Rails tests: `test/cases/{statement_cache,database_statements,statement_invalid,prepared_statement_status}_test.rb`

### PR 1.51 — Disconnected/unconnected/invalid/pooled/reaper/reload_models/test_databases/schema_loading/persistence_reload_cache (12 small files)

- One PR; all tiny.

---

## Phase 2 — PostgreSQL adapter polish (~250 skipped tests)

### PR 2.1 — pg/range (36 tests)

### PR 2.2 — pg/hstore (24 tests)

### PR 2.3 — pg/postgresql_adapter residual (23 tests)

### PR 2.4 — pg/array (22 tests)

### PR 2.5 — pg/uuid + pg/timestamp + pg/bytea (12+12+12 tests)

### PR 2.6 — pg/connection + pg/schema (13+26 tests)

### PR 2.7 — pg/serial + pg/composite + pg/virtual_column + pg/foreign_table + pg/infinity + pg/enum (12+3+6+9+9+9 tests)

### PR 2.8 — pg/transaction + nested + schema_authorization + invertible + dbconsole + datatype + citext + quoting + xml + rename_table + money + ltree + interval (~50 tests)

### PR 2.9 — pg/{referential_integrity,optimizer_hints,numbers,extension_migration,deferred_constraints,date,create_unlogged_tables,collation} (~35 tests)

### PR 2.10 — pg/{statement_pool,prepared_statements_disabled,partitions,network,case_insensitive,explain,domain,geometric,type_lookup,full_text,cidr,change_schema,bit_string,postgresql_rake} (37 + smaller)

---

## Phase 3 — MySQL/Trilogy adapter polish (~200 skipped tests)

### PR 3.1 — trilogy adapter (51+26+3 tests)

### PR 3.2 — mysql2 adapter + rake + dbconsole + check_constraint_quoting (15+26+4+1 tests)

### PR 3.3 — abstract_mysql_adapter connection / active_schema (23+14 tests)

### PR 3.4 — abstract_mysql warnings + table_options + quoting (9+9+8 tests)

### PR 3.5 — abstract_mysql remainder (~50 small tests)

---

## Phase 4 — SQLite adapter polish (~30 tests)

### PR 4.1 — sqlite_rake + dbconsole (17+6 tests)

### PR 4.2 — sqlite virtual_column + transaction + statement_pool + explain (1+1+1+1 tests)

---

## Phase 5 — Long tail residual skips

### PR 5.1 — signed_id + enum + inheritance (9+8+2 tests)

### PR 5.2 — nested_attributes + nested_attributes_with_callbacks (19+8 tests)

### PR 5.3 — relations + batches + view + aggregations (16+13+5+7 tests)

### PR 5.4 — relation sub-tests: predicate_builder + select + update_all + field_ordered_values + scoping (6+2+1+4+28 tests)

### PR 5.5 — where + where_chain remaining skips (association JOIN, polymorphic, composite PK associations)

- `src/relation/where.test.ts`, `src/relation/where-chain.test.ts`
- Remaining skips require: association auto-JOIN, polymorphic associations, composite PK + associations, through associations, Rails-specific types (Rational, Duration)

### PR 5.6 — store + delegated_type + sanitize + dirty + column_definition + touch_later + timestamp (4+2+4+1+3+4+1 tests)

### PR 5.7 — attribute_methods + modules + association long tail (2+1+5+3+many tests)

---

## Tracking & cadence

- Run `pnpm test:compare -- --package activerecord` after each merge.
- Open all PRs as draft; run `/link <PR#>` after opening.
- Per CLAUDE.md: do NOT rename Rails-derived test names.

---

## Tests that don't translate to TypeScript / Node

These should be added to a `scripts/test-compare/skip-list.ts` so test:compare counts them N/A rather than missing.

### YAML / Marshal / Ruby object serialization

- `test/cases/yaml_serialization_test.rb` — YAML round-trip of arbitrary Ruby objects
- Any `serialized_attribute_test.rb` case asserting `Marshal.dump` / `Marshal.load`

### Ruby concurrency / thread / GVL

- `test/cases/connection_pool_test.rb` cases asserting on `Thread#priority`, GVL release timing
- `test/cases/relation/load_async_test.rb` cases that assert GVL release while a query runs
- `test/cases/transaction_isolation_test.rb` cases depending on `Thread.new` parallelism

### Ruby autoload / `require` / class reloading

- `reload_models_test.rb` cases depending on `ActiveSupport::Dependencies`
- `schema_loading_test.rb` cases hooking `ActiveSupport.on_load(:active_record)` with Zeitwerk

### Process / Signal / fork

- `connection_handler_test.rb` cases asserting `Process.fork` cleanup
- `reaper_test.rb` cases asserting `Thread.kill` semantics

### Rake / dbconsole shell-out

- PTY/exec cases in `{postgresql,mysql2,trilogy,sqlite3}/dbconsole_test.rb`
- `Rake::Task[...].invoke` task-ordering cases in rake test files

### Fixtures (entire suite)

- `test/cases/fixtures_test.rb` (all 111 cases)
- `test/cases/fixture_set/file_test.rb` (all 14 cases)
- `test/cases/test_fixtures_test.rb` (all 4 cases)

### Ruby exception classes / object model

- Cases asserting on `NameError#missing_name?`, `Module#prepend` ordering, `singleton_class` semantics
- `active_record_test.rb` cases asserting on `ActiveRecord::Base.singleton_class.ancestors`

### Encoding / String semantics

- `binary_test.rb` cases asserting `Encoding::ASCII_8BIT` vs `Encoding::UTF_8`
- `bytea_test.rb` cases asserting on Ruby `String#encoding`

### Symbols

- Cases where the assertion distinguishes `Symbol` from `String`
