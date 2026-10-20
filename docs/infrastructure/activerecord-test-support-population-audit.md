# `activerecord-test-support` in the extra-surface population

Answers story `scope-activerecord-test-support-population` (RFC 0120). Measured
on 2026-10-19 from `pnpm parity:api:extra --json` at `1fedb2eb6c`.

| package                   | files | novel | moved | total | allowed | noCntrp files | noCntrp novel | internal |
| ------------------------- | ----- | ----- | ----- | ----- | ------- | ------------- | ------------- | -------- |
| activerecord-test-support | 34    | 110   | 6     | 116   | 0       | 31            | 104           | 119      |

## What the comparator maps it against

The story assumed the Ruby side might be Rails' `lib/` tree. It is not.
`activerecord-test-support` is a pseudo-package in `vendor/sources.ts`, with
`libPath: "activerecord/test/support"` and no `testPath`. Its TS side is
`packages/activerecord/src/support/` (`PACKAGE_SRC_SUBDIR` in
`scripts/api-compare/config.ts`). `TEST_SUPPORT_PACKAGES` keeps it out of every
other package's dependency index, so a Rails `lib` method never resolves
against a test helper.

- **In:** `activerecord/test/support/*.rb`: `adapter_helper.rb`,
  `async_helper.rb`, `config.rb`, `connection.rb`, `connection_helper.rb`,
  `ddl_helper.rb`, `fake_adapter.rb`, `load_schema_helper.rb`,
  `schema_dumping_helper.rb`, `tools.rb`, `stubs/`.
- **Out:** `activerecord/test/cases/helper.rb` and `test_case.rb` (their
  `with_*` helpers and `ARTest.connect` callers), and
  `activerecord/lib/active_record/test_databases.rb`, which is part of the
  `activerecord` package.
- **File overrides** (`RUBY_FILE_TS_OVERRIDES` in
  `scripts/parity/conventions.ts`): `connection.rb` and `config.rb` both map to
  `support/connection.ts`.

So the low `moved` count does not mean the mapping is wrong. Every `.rb` in
`test/support` has a TS file, and those files score close to zero. The novel
names sit in files that **no `.rb` maps onto**: 104 of the 110 are in the 31
no-counterpart files.

## Sample (18 of 110)

Key: (a) mirrors a Rails test helper the comparator cannot see, (b) mirrors a
`lib/` method in a file we map wrongly, (c) invented by trails, (d) should be
`@internal`.

| #   | TS name (file)                                                  | class | Rails evidence                                                                                                                                                                                              |
| --- | --------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `loadCanonicalSchema` (canonical-schema.ts)                     | (a)   | Plays the role of `LoadSchemaHelper#load_schema` (`test/support/load_schema_helper.rb:4-21`) under a trails name.                                                                                           |
| 2   | `loadAdapterSpecificSchema` (load-schema-helper.ts)             | (a)   | Rails inlines it in `load_schema` (`load_schema_helper.rb:9-16`). It is an extracted helper in a matched file.                                                                                              |
| 3   | `createTestExclusionConstraintsTable` (load-schema-helper.ts)   | (a)   | `create_table :test_exclusion_constraints` in `test/schema/postgresql_specific_schema.rb:162`, i.e. schema data rather than a helper method.                                                                |
| 4   | `createTestUniqueConstraintsTable` (load-schema-helper.ts)      | (a)   | Same, from the sibling `create_table` in `postgresql_specific_schema.rb`.                                                                                                                                   |
| 5   | `describeIfPg` (describe-if-pg.ts)                              | (a)   | Spells the class-level `if current_adapter?(:PostgreSQLAdapter)` guard (`test/support/adapter_helper.rb:4-9`) as a vitest wrapper.                                                                          |
| 6   | `describeIfSqlite` (describe-if-sqlite.ts)                      | (a)   | Same guard, `:SQLite3Adapter`.                                                                                                                                                                              |
| 7   | `describeIfMysqlAdapter` (describe-if-mysql-adapter.ts)         | (a)   | Same guard, `:Mysql2Adapter`.                                                                                                                                                                               |
| 8   | `adapterSupports` (supports.ts)                                 | (a)   | Stands in for the `supports_*?` predicates in `adapter_helper.rb:23-60`, taking the feature as a string.                                                                                                    |
| 9   | `DEFAULT_CONNECTION` (config.ts)                                | (a)   | `config["default_connection"]` in `test/support/connection.rb:10-11`, from `test/config.example.yml`.                                                                                                       |
| 10  | `ARUNIT_DATABASE` (config.ts)                                   | (a)   | The `["arunit", "activerecord_unittest"]` default in `ARTest.expand_config` (`test/support/config.rb:26-37`).                                                                                               |
| 11  | `withSecondPool` (setup-second-pool.ts)                         | (a)   | `ARUnit2Model.establish_connection :arunit2` in `ARTest.connect` (`test/support/connection.rb:33`).                                                                                                         |
| 12  | `slotDatabaseName` (run-token.ts)                               | (b)   | Same job as `"#{db_config.database}-#{i}"` in `ActiveRecord::TestDatabases.create_and_load_schema` (`activerecord/lib/active_record/test_databases.rb:11-15`), which belongs to the `activerecord` package. |
| 13  | `quoteMysqlDatabaseName` (quote-database-name.ts)               | (b)   | Does the work of the MySQL adapter's identifier quoting (`connection_adapters/mysql/quoting.rb`) for a database name.                                                                                       |
| 14  | `newRunToken` (run-token.ts)                                    | (c)   | No counterpart. It names a per-run database set for parallel vitest forks. Rails runs one database per `rake test:<adapter>` process.                                                                       |
| 15  | `ensureWorkerClone` (sqlite-template.ts)                        | (c)   | No counterpart. Copies a template SQLite file for each worker.                                                                                                                                              |
| 16  | `dumpTemplateSchemaCache` (schema-cache-dump.ts)                | (c)   | No counterpart. Warms the schema cache across forks.                                                                                                                                                        |
| 17  | `restoreWorkerConnection` (connection.ts, matched to config.rb) | (c)   | No counterpart in `config.rb` / `connection.rb`.                                                                                                                                                            |
| 18  | `typeRegistryKeyFor` (type-registry-key.ts)                     | (d)   | Wiring for the test adapters. Nothing in Rails' test tree exposes it.                                                                                                                                       |

Of all 110: roughly 55 are (c), in the parallel-database harness files
(`run-token.ts`, `sqlite-template.ts`, `schema-cache-dump.ts`, `ar-db-slots.ts`,
`ar-db-forks-default.ts`, `template-global-setup.ts`, `boot-outcome.ts`,
`ddl-profile.ts`, `canonical-schema-stamp.ts`, `drop-all-tables.ts`). Roughly 30
are (a), Rails test-helper behaviour under trails names (`describeIf*`,
`*IfSupports`, `canonical-schema.ts`, `config.ts` constants, the
second-pool helpers). The rest are (b) or (d).

## Recommendation: accept it as a normal burndown target

The other three options don't fit:

- **Extend the Ruby-side population.** Already done: it is `test/support`.
  Adding `test/cases/helper.rb` / `test_case.rb` would only credit `with_*`
  helpers that `src/support` does not hold.
- **File-mapping overrides.** Only (b) would benefit, and that is two or three
  names. The (a) names live in TS files no `.rb` can map onto, because Rails
  has no such files. A Rails dev would read them as the guards
  `current_adapter?` / `supports_*?` written inline in each test.
- **Remove the package.** That would hide the matched `.rb` ports
  (`adapter-helper.ts`, `load-schema-helper.ts`, `connection.ts`, …), which
  are the ones that score cleanly.

The population is real. The measurement is right, so it is not a mapping
artifact. Because the measurement is right, writing 110 `@noRailsEquivalent`
tags would be exactly the relabelling the story warns against. The (a) and (b)
names converge onto the Rails helper they stand in for. The (c) harness files
are trails' parallel-runner, which Rails does without. Their honest endpoint is
a file-level receipt, decided file by file in the burndown story and not here.

Filed as `activerecord-test-support-extra-surface-burndown` (RFC 0120), with
this triage attached.
