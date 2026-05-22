# activerecord — Road to 100% test:compare

> **Status (2026-05-22):** Headline 7863/7872 (84.1%) below is from
> 2026-05-18; ~50 AR PRs have landed since (#2202–#2253). Refresh with
> `pnpm test:compare --cached --json --package activerecord` before
> triaging. Top-10 rows = ~430 of 1244 skipped tests — drive those first.
> Phase ordering lives in
> [`activerecord-index.md`](activerecord-index.md) Phase 4.

Per-file backlog tracker for closing the `test:compare` delta. Companion to
[`activerecord-100-plan.md`](activerecord-100-plan.md) (post-100% fidelity
work; strategy + BLOCKED vocab + workflow live there too). This doc owns
the per-file table; `activerecord-100-plan.md` owns batches + strategy.

## Refresh

```bash
pnpm test:compare --cached --json --package activerecord
pnpm tsx scripts/test-compare/per-file-backlog.ts > /tmp/tc.md
# paste the headline + table body below, bump the "as of" date
```

The headline number is `totalMatched / totalRubyTests` from the
`convention-comparison.json` snapshot. "Pending" = `missing + skipped`
for each file; misplaced is informational (relocate-only fixes).

## Scope

Three categories of work close the delta. Each batch picks one file and
addresses whichever applies:

1. **Un-skip stubs** — files where matched-skipped > 0. Flip `it.skip` → `it`;
   port the test body if Rails has one we never wrote; resolve any infra gap
   the BLOCKED tag pins.
2. **Port missing Rails bodies** — files where missing > 0. Write the test
   in our TS file under the exact Rails name (CLAUDE.md test-name rule
   applies: never rename, never re-word).
3. **Implementation work to unblock** — when a BLOCKED tag points at real
   missing source-code behavior, port that first. Reference the
   `BLOCKED:*` taxonomy in `activerecord-100-plan.md` (BLOCKED vocabulary section).

Out of scope for this doc: name-drift reconcile (relocate / rename) — those
are mostly mechanical and live as misplaced counts, not pending work.

## How to ship one file

1. Pick a row (top of the table is highest impact).
2. Read the Rails source: `scripts/api-compare/.rails-source/activerecord/test/cases/<rubyFile>`.
3. Read our file: `packages/activerecord/src/<conventionTsFile>`.
4. Decide: un-skip vs port vs implement. Test names must match Rails verbatim.
5. Spawn an agent or open a PR directly. Target ~250 LOC; split via
   `<base>` / `<base>b` for big files (the cluster pattern from Phase 5).
6. Verify: `pnpm test:compare --cached --package activerecord` shows the
   row drop or close out.

## Per-file backlog (sorted by missing + skipped)

**7863/7872 (84.1%)** as of 2026-05-18. Skipped: 1244. Misplaced: 4. Wrong-describe: 8.

| Ruby file                                                              | TS file                                                                | Matched | Skipped | Missing | Misplaced | Pending |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------: | ------: | ------: | --------: | ------: |
| `associations/eager_test.rb`                                           | `associations/eager.test.ts`                                           |     197 |      70 |       0 |         0 |  **70** |
| `adapter_test.rb`                                                      | `adapter.test.ts`                                                      |      75 |      70 |       0 |         0 |  **70** |
| `insert_all_test.rb`                                                   | `insert-all.test.ts`                                                   |      72 |      42 |       1 |         0 |  **43** |
| `associations/join_model_test.rb`                                      | `associations/join-model.test.ts`                                      |     102 |      41 |       0 |         0 |  **41** |
| `database_configurations/hash_config_test.rb`                          | `database-configurations/hash-config.test.ts`                          |      34 |      34 |       0 |         0 |  **34** |
| `strict_loading_test.rb`                                               | `strict-loading.test.ts`                                               |      54 |      30 |       0 |         0 |  **30** |
| `associations/has_one_associations_test.rb`                            | `associations/has-one-associations.test.ts`                            |      93 |      28 |       0 |         0 |  **28** |
| `scoping/relation_scoping_test.rb`                                     | `scoping/relation-scoping.test.ts`                                     |      64 |      28 |       0 |         0 |  **28** |
| `tasks/database_tasks_test.rb`                                         | `tasks/database-tasks.test.ts`                                         |      78 |      26 |       0 |         0 |  **26** |
| `query_cache_test.rb`                                                  | `query-cache.test.ts`                                                  |      67 |      25 |       0 |         0 |  **25** |
| `schema_dumper_test.rb`                                                | `schema-dumper.test.ts`                                                |      67 |      25 |       0 |         0 |  **25** |
| `associations/inverse_associations_test.rb`                            | `associations/inverse-associations.test.ts`                            |      93 |      23 |       0 |         0 |  **23** |
| `associations/has_and_belongs_to_many_associations_test.rb`            | `associations/has-and-belongs-to-many-associations.test.ts`            |      91 |      23 |       0 |         0 |  **23** |
| `relation/where_test.rb`                                               | `relation/where.test.ts`                                               |      62 |      23 |       0 |         0 |  **23** |
| `view_test.rb`                                                         | `view.test.ts`                                                         |      21 |      21 |       0 |         0 |  **21** |
| `nested_attributes_test.rb`                                            | `nested-attributes.test.ts`                                            |     127 |      18 |       0 |         0 |  **18** |
| `associations/cascaded_eager_loading_test.rb`                          | `associations/cascaded-eager-loading.test.ts`                          |      27 |      18 |       0 |         0 |  **18** |
| `bind_parameter_test.rb`                                               | `bind-parameter.test.ts`                                               |      17 |      17 |       0 |         0 |  **17** |
| `comment_test.rb`                                                      | `comment.test.ts`                                                      |      17 |      17 |       0 |         0 |  **17** |
| `associations/has_one_through_associations_test.rb`                    | `associations/has-one-through-associations.test.ts`                    |      47 |      16 |       0 |         0 |  **16** |
| `database_configurations/resolver_test.rb`                             | `database-configurations/resolver.test.ts`                             |      16 |      16 |       0 |         0 |  **16** |
| `database_selector_test.rb`                                            | `database-selector.test.ts`                                            |      16 |      16 |       0 |         0 |  **16** |
| `forbidden_attributes_protection_test.rb`                              | `forbidden-attributes-protection.test.ts`                              |      16 |      16 |       0 |         0 |  **16** |
| `transaction_callbacks_test.rb`                                        | `transaction-callbacks.test.ts`                                        |      57 |      15 |       0 |         0 |  **15** |
| `autosave_association_test.rb`                                         | `autosave-association.test.ts`                                         |     177 |      13 |       0 |         0 |  **13** |
| `quoting_test.rb`                                                      | `quoting.test.ts`                                                      |      37 |      13 |       0 |         0 |  **13** |
| `defaults_test.rb`                                                     | `defaults.test.ts`                                                     |      25 |      13 |       0 |         0 |  **13** |
| `associations/nested_through_associations_test.rb`                     | `associations/nested-through-associations.test.ts`                     |      64 |      12 |       0 |         0 |  **12** |
| `relation/where_chain_test.rb`                                         | `relation/where-chain.test.ts`                                         |      54 |      12 |       0 |         0 |  **12** |
| `associations/callbacks_test.rb`                                       | `associations/callbacks.test.ts`                                       |      18 |      12 |       0 |         0 |  **12** |
| `adapters/postgresql/serial_test.rb`                                   | `adapters/postgresql/serial.test.ts`                                   |      12 |      12 |       0 |         0 |  **12** |
| `connection_adapters/connection_handler_test.rb`                       | `connection-adapters/connection-handler.test.ts`                       |      27 |      11 |       0 |         0 |  **11** |
| `aggregations_test.rb`                                                 | `aggregations.test.ts`                                                 |      25 |      11 |       0 |         0 |  **11** |
| `multiple_db_test.rb`                                                  | `multiple-db.test.ts`                                                  |      12 |      11 |       0 |         0 |  **11** |
| `reserved_word_test.rb`                                                | `reserved-word.test.ts`                                                |      12 |      11 |       0 |         0 |  **11** |
| `connection_management_test.rb`                                        | `connection-management.test.ts`                                        |      11 |      11 |       0 |         0 |  **11** |
| `associations_test.rb`                                                 | `associations.test.ts`                                                 |     129 |       9 |       1 |         0 |  **10** |
| `locking_test.rb`                                                      | `locking.test.ts`                                                      |      50 |      10 |       0 |         0 |  **10** |
| `connection_pool_test.rb`                                              | `connection-pool.test.ts`                                              |      39 |      10 |       0 |         0 |  **10** |
| `nested_attributes_with_callbacks_test.rb`                             | `nested-attributes-with-callbacks.test.ts`                             |      10 |      10 |       0 |         0 |  **10** |
| `adapters/postgresql/array_test.rb`                                    | `adapters/postgresql/array.test.ts`                                    |      42 |       8 |       0 |         0 |   **8** |
| `associations/eager_load_includes_full_sti_class_test.rb`              | `associations/eager-load-includes-full-sti-class.test.ts`              |       8 |       8 |       0 |         0 |   **8** |
| `base_prevent_writes_test.rb`                                          | `base-prevent-writes.test.ts`                                          |       8 |       8 |       0 |         0 |   **8** |
| `migration_test.rb`                                                    | `migration.test.ts`                                                    |      86 |       7 |       0 |         4 |   **7** |
| `relations_test.rb`                                                    | `relations.test.ts`                                                    |     281 |       7 |       0 |         0 |   **7** |
| `adapters/postgresql/hstore_test.rb`                                   | `adapters/postgresql/hstore.test.ts`                                   |      44 |       7 |       0 |         0 |   **7** |
| `connection_adapters/merge_and_resolve_default_url_config_test.rb`     | `connection-adapters/merge-and-resolve-default-url-config.test.ts`     |      40 |       7 |       0 |         0 |   **7** |
| `adapters/postgresql/timestamp_test.rb`                                | `adapters/postgresql/timestamp.test.ts`                                |      14 |       7 |       0 |         0 |   **7** |
| `readonly_test.rb`                                                     | `readonly.test.ts`                                                     |      14 |       7 |       0 |         0 |   **7** |
| `adapters/abstract_mysql_adapter/case_sensitivity_test.rb`             | `adapters/abstract-mysql-adapter/case-sensitivity.test.ts`             |       7 |       7 |       0 |         0 |   **7** |
| `connection_adapters/connection_swapping_nested_test.rb`               | `connection-adapters/connection-swapping-nested.test.ts`               |       7 |       7 |       0 |         0 |   **7** |
| `base_test.rb`                                                         | `base.test.ts`                                                         |     171 |       6 |       0 |         0 |   **6** |
| `adapters/abstract_mysql_adapter/bind_parameter_test.rb`               | `adapters/abstract-mysql-adapter/bind-parameter.test.ts`               |      10 |       6 |       0 |         0 |   **6** |
| `connection_handling_test.rb`                                          | `connection-handling.test.ts`                                          |      10 |       6 |       0 |         0 |   **6** |
| `adapters/abstract_mysql_adapter/mysql_boolean_test.rb`                | `adapters/abstract-mysql-adapter/mysql-boolean.test.ts`                |       6 |       6 |       0 |         0 |   **6** |
| `adapters/postgresql/transaction_test.rb`                              | `adapters/postgresql/transaction.test.ts`                              |       6 |       6 |       0 |         0 |   **6** |
| `associations/eager_singularization_test.rb`                           | `associations/eager-singularization.test.ts`                           |       6 |       6 |       0 |         0 |   **6** |
| `adapters/postgresql/postgresql_adapter_test.rb`                       | `adapters/postgresql/postgresql-adapter.test.ts`                       |      67 |       5 |       0 |         0 |   **5** |
| `counter_cache_test.rb`                                                | `counter-cache.test.ts`                                                |      55 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/enum_test.rb`                                     | `adapters/postgresql/enum.test.ts`                                     |      19 |       5 |       0 |         0 |   **5** |
| `adapters/abstract_mysql_adapter/adapter_prevent_writes_test.rb`       | `adapters/abstract-mysql-adapter/adapter-prevent-writes.test.ts`       |      12 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/referential_integrity_test.rb`                    | `adapters/postgresql/referential-integrity.test.ts`                    |       6 |       5 |       0 |         0 |   **5** |
| `adapters/abstract_mysql_adapter/optimizer_hints_test.rb`              | `adapters/abstract-mysql-adapter/optimizer-hints.test.ts`              |       5 |       5 |       0 |         0 |   **5** |
| `adapters/abstract_mysql_adapter/transaction_test.rb`                  | `adapters/abstract-mysql-adapter/transaction.test.ts`                  |       5 |       5 |       0 |         0 |   **5** |
| `adapters/abstract_mysql_adapter/unsigned_type_test.rb`                | `adapters/abstract-mysql-adapter/unsigned-type.test.ts`                |       5 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/collation_test.rb`                                | `adapters/postgresql/collation.test.ts`                                |       5 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/create_unlogged_tables_test.rb`                   | `adapters/postgresql/create-unlogged-tables.test.ts`                   |       5 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/deferred_constraints_test.rb`                     | `adapters/postgresql/deferred-constraints.test.ts`                     |       5 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/numbers_test.rb`                                  | `adapters/postgresql/numbers.test.ts`                                  |       5 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/optimizer_hints_test.rb`                          | `adapters/postgresql/optimizer-hints.test.ts`                          |       5 |       5 |       0 |         0 |   **5** |
| `associations/has_one_through_disable_joins_associations_test.rb`      | `associations/has-one-through-disable-joins-associations.test.ts`      |       5 |       5 |       0 |         0 |   **5** |
| `invertible_migration_test.rb`                                         | `invertible-migration.test.ts`                                         |      28 |       4 |       0 |         0 |   **4** |
| `sanitize_test.rb`                                                     | `sanitize.test.ts`                                                     |      22 |       4 |       0 |         0 |   **4** |
| `instrumentation_test.rb`                                              | `instrumentation.test.ts`                                              |      18 |       4 |       0 |         0 |   **4** |
| `adapters/postgresql/quoting_test.rb`                                  | `adapters/postgresql/quoting.test.ts`                                  |      16 |       4 |       0 |         0 |   **4** |
| `associations/extension_test.rb`                                       | `associations/extension.test.ts`                                       |      12 |       4 |       0 |         0 |   **4** |
| `touch_later_test.rb`                                                  | `touch-later.test.ts`                                                  |      11 |       4 |       0 |         0 |   **4** |
| `relation/field_ordered_values_test.rb`                                | `relation/field-ordered-values.test.ts`                                |      10 |       4 |       0 |         0 |   **4** |
| `adapters/abstract_mysql_adapter/mysql_explain_test.rb`                | `adapters/abstract-mysql-adapter/mysql-explain.test.ts`                |       5 |       4 |       0 |         0 |   **4** |
| `adapters/postgresql/date_test.rb`                                     | `adapters/postgresql/date.test.ts`                                     |       5 |       4 |       0 |         0 |   **4** |
| `adapters/abstract_mysql_adapter/auto_increment_test.rb`               | `adapters/abstract-mysql-adapter/auto-increment.test.ts`               |       4 |       4 |       0 |         0 |   **4** |
| `adapters/postgresql/rename_table_test.rb`                             | `adapters/postgresql/rename-table.test.ts`                             |       4 |       4 |       0 |         0 |   **4** |
| `adapters/postgresql/transaction_nested_test.rb`                       | `adapters/postgresql/transaction-nested.test.ts`                       |       4 |       4 |       0 |         0 |   **4** |
| `associations/nested_error_test.rb`                                    | `associations/nested-error.test.ts`                                    |       4 |       4 |       0 |         0 |   **4** |
| `connection_adapters/adapter_leasing_test.rb`                          | `connection-adapters/adapter-leasing.test.ts`                          |       4 |       4 |       0 |         0 |   **4** |
| `connection_adapters/registration_test.rb`                             | `connection-adapters/registration.test.ts`                             |       4 |       4 |       0 |         0 |   **4** |
| `connection_adapters/standalone_connection_test.rb`                    | `connection-adapters/standalone-connection.test.ts`                    |       4 |       4 |       0 |         0 |   **4** |
| `database_configurations/url_config_test.rb`                           | `database-configurations/url-config.test.ts`                           |       4 |       4 |       0 |         0 |   **4** |
| `hot_compatibility_test.rb`                                            | `hot-compatibility.test.ts`                                            |       4 |       4 |       0 |         0 |   **4** |
| `numeric_data_test.rb`                                                 | `numeric-data.test.ts`                                                 |       4 |       4 |       0 |         0 |   **4** |
| `validations/i18n_validation_test.rb`                                  | `validations/i18n-validation.test.ts`                                  |       4 |       4 |       0 |         0 |   **4** |
| `calculations_test.rb`                                                 | `calculations.test.ts`                                                 |     233 |       3 |       0 |         0 |   **3** |
| `batches_test.rb`                                                      | `batches.test.ts`                                                      |     107 |       3 |       0 |         0 |   **3** |
| `reflection_test.rb`                                                   | `reflection.test.ts`                                                   |      63 |       3 |       0 |         0 |   **3** |
| `adapters/postgresql/uuid_test.rb`                                     | `adapters/postgresql/uuid.test.ts`                                     |      29 |       3 |       0 |         0 |   **3** |
| `connection_adapters/connection_handlers_multi_db_test.rb`             | `connection-adapters/connection-handlers-multi-db.test.ts`             |      20 |       2 |       1 |         0 |   **3** |
| `associations/left_outer_join_association_test.rb`                     | `associations/left-outer-join-association.test.ts`                     |      19 |       3 |       0 |         0 |   **3** |
| `adapters/postgresql/bytea_test.rb`                                    | `adapters/postgresql/bytea.test.ts`                                    |      14 |       3 |       0 |         0 |   **3** |
| `adapters/postgresql/money_test.rb`                                    | `adapters/postgresql/money.test.ts`                                    |      12 |       3 |       0 |         0 |   **3** |
| `statement_cache_test.rb`                                              | `statement-cache.test.ts`                                              |      11 |       3 |       0 |         0 |   **3** |
| `adapters/postgresql/xml_test.rb`                                      | `adapters/postgresql/xml.test.ts`                                      |       5 |       3 |       0 |         0 |   **3** |
| `adapters/abstract_mysql_adapter/mysql_enum_test.rb`                   | `adapters/abstract-mysql-adapter/mysql-enum.test.ts`                   |       4 |       3 |       0 |         0 |   **3** |
| `adapters/postgresql/composite_test.rb`                                | `adapters/postgresql/composite.test.ts`                                |       4 |       3 |       0 |         0 |   **3** |
| `habtm_destroy_order_test.rb`                                          | `habtm-destroy-order.test.ts`                                          |       4 |       3 |       0 |         0 |   **3** |
| `adapters/abstract_mysql_adapter/nested_deadlock_test.rb`              | `adapters/abstract-mysql-adapter/nested-deadlock.test.ts`              |       3 |       3 |       0 |         0 |   **3** |
| `adapters/abstract_mysql_adapter/set_test.rb`                          | `adapters/abstract-mysql-adapter/set.test.ts`                          |       3 |       3 |       0 |         0 |   **3** |
| `adapters/abstract_mysql_adapter/sp_test.rb`                           | `adapters/abstract-mysql-adapter/sp.test.ts`                           |       3 |       3 |       0 |         0 |   **3** |
| `adapters/postgresql/type_lookup_test.rb`                              | `adapters/postgresql/type-lookup.test.ts`                              |       3 |       3 |       0 |         0 |   **3** |
| `column_definition_test.rb`                                            | `column-definition.test.ts`                                            |       3 |       3 |       0 |         0 |   **3** |
| `connection_adapters/connection_handlers_multi_pool_config_test.rb`    | `connection-adapters/connection-handlers-multi-pool-config.test.ts`    |       3 |       3 |       0 |         0 |   **3** |
| `pooled_connections_test.rb`                                           | `pooled-connections.test.ts`                                           |       3 |       3 |       0 |         0 |   **3** |
| `unconnected_test.rb`                                                  | `unconnected.test.ts`                                                  |       3 |       3 |       0 |         0 |   **3** |
| `associations/has_many_through_associations_test.rb`                   | `associations/has-many-through-associations.test.ts`                   |     164 |       1 |       1 |         0 |   **2** |
| `attribute_methods_test.rb`                                            | `attribute-methods.test.ts`                                            |     133 |       2 |       0 |         0 |   **2** |
| `inheritance_test.rb`                                                  | `inheritance.test.ts`                                                  |      73 |       2 |       0 |         0 |   **2** |
| `attributes_test.rb`                                                   | `attributes.test.ts`                                                   |      38 |       2 |       0 |         0 |   **2** |
| `unsafe_raw_sql_test.rb`                                               | `unsafe-raw-sql.test.ts`                                               |      37 |       2 |       0 |         0 |   **2** |
| `associations/inner_join_association_test.rb`                          | `associations/inner-join-association.test.ts`                          |      31 |       2 |       0 |         0 |   **2** |
| `connection_adapters/schema_cache_test.rb`                             | `connection-adapters/schema-cache.test.ts`                             |      27 |       2 |       0 |         0 |   **2** |
| `relation/select_test.rb`                                              | `relation/select.test.ts`                                              |      26 |       2 |       0 |         0 |   **2** |
| `query_logs_test.rb`                                                   | `query-logs.test.ts`                                                   |      25 |       2 |       0 |         0 |   **2** |
| `log_subscriber_test.rb`                                               | `log-subscriber.test.ts`                                               |      21 |       2 |       0 |         0 |   **2** |
| `transaction_instrumentation_test.rb`                                  | `transaction-instrumentation.test.ts`                                  |      21 |       2 |       0 |         0 |   **2** |
| `relation/with_test.rb`                                                | `relation/with.test.ts`                                                |      16 |       2 |       0 |         0 |   **2** |
| `primary_class_test.rb`                                                | `primary-class.test.ts`                                                |       7 |       2 |       0 |         0 |   **2** |
| `adapters/postgresql/explain_test.rb`                                  | `adapters/postgresql/explain.test.ts`                                  |       5 |       2 |       0 |         0 |   **2** |
| `adapters/abstract_mysql_adapter/virtual_column_test.rb`               | `adapters/abstract-mysql-adapter/virtual-column.test.ts`               |       4 |       2 |       0 |         0 |   **2** |
| `database_statements_test.rb`                                          | `database-statements.test.ts`                                          |       3 |       2 |       0 |         0 |   **2** |
| `adapters/postgresql/domain_test.rb`                                   | `adapters/postgresql/domain.test.ts`                                   |       2 |       2 |       0 |         0 |   **2** |
| `associations/eager_load_nested_include_test.rb`                       | `associations/eager-load-nested-include.test.ts`                       |       2 |       2 |       0 |         0 |   **2** |
| `attribute_methods/read_test.rb`                                       | `attribute-methods/read.test.ts`                                       |       2 |       2 |       0 |         0 |   **2** |
| `statement_invalid_test.rb`                                            | `statement-invalid.test.ts`                                            |       2 |       2 |       0 |         0 |   **2** |
| `associations/has_many_associations_test.rb`                           | `associations/has-many-associations.test.ts`                           |     312 |       1 |       0 |         0 |   **1** |
| `finder_test.rb`                                                       | `finder.test.ts`                                                       |     261 |       1 |       0 |         0 |   **1** |
| `associations/belongs_to_associations_test.rb`                         | `associations/belongs-to-associations.test.ts`                         |     154 |       1 |       0 |         0 |   **1** |
| `transactions_test.rb`                                                 | `transactions.test.ts`                                                 |      98 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/schema_test.rb`                                   | `adapters/postgresql/schema.test.ts`                                   |      71 |       1 |       0 |         0 |   **1** |
| `encryption/encryptable_record_test.rb`                                | `encryption/encryptable-record.test.ts`                                |      51 |       1 |       0 |         0 |   **1** |
| `timestamp_test.rb`                                                    | `timestamp.test.ts`                                                    |      40 |       1 |       0 |         0 |   **1** |
| `adapters/abstract_mysql_adapter/connection_test.rb`                   | `adapters/abstract-mysql-adapter/connection.test.ts`                   |      26 |       0 |       1 |         0 |   **1** |
| `relation/update_all_test.rb`                                          | `relation/update-all.test.ts`                                          |      26 |       1 |       0 |         0 |   **1** |
| `adapters/mysql2/mysql2_adapter_test.rb`                               | `adapters/mysql2/mysql2-adapter.test.ts`                               |      23 |       1 |       0 |         0 |   **1** |
| `adapter_prevent_writes_test.rb`                                       | `adapter-prevent-writes.test.ts`                                       |      15 |       1 |       0 |         0 |   **1** |
| `delegated_type_test.rb`                                               | `delegated-type.test.ts`                                               |      13 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/foreign_table_test.rb`                            | `adapters/postgresql/foreign-table.test.ts`                            |      10 |       1 |       0 |         0 |   **1** |
| `validations/association_validation_test.rb`                           | `validations/association-validation.test.ts`                           |      10 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/infinity_test.rb`                                 | `adapters/postgresql/infinity.test.ts`                                 |       9 |       1 |       0 |         0 |   **1** |
| `finder_respond_to_test.rb`                                            | `finder-respond-to.test.ts`                                            |       9 |       1 |       0 |         0 |   **1** |
| `secure_token_test.rb`                                                 | `secure-token.test.ts`                                                 |       9 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/virtual_column_test.rb`                           | `adapters/postgresql/virtual-column.test.ts`                           |       7 |       1 |       0 |         0 |   **1** |
| `associations/required_test.rb`                                        | `associations/required.test.ts`                                        |       7 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/invertible_migration_test.rb`                     | `adapters/postgresql/invertible-migration.test.ts`                     |       6 |       1 |       0 |         0 |   **1** |
| `relation/predicate_builder_test.rb`                                   | `relation/predicate-builder.test.ts`                                   |       6 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/statement_pool_test.rb`                           | `adapters/postgresql/statement-pool.test.ts`                           |       3 |       1 |       0 |         0 |   **1** |
| `associations/bidirectional_destroy_dependencies_test.rb`              | `associations/bidirectional-destroy-dependencies.test.ts`              |       3 |       1 |       0 |         0 |   **1** |
| `date_test.rb`                                                         | `date.test.ts`                                                         |       3 |       1 |       0 |         0 |   **1** |
| `adapters/sqlite3/explain_test.rb`                                     | `adapters/sqlite3/explain.test.ts`                                     |       2 |       1 |       0 |         0 |   **1** |
| `active_record_test.rb`                                                | `active-record.test.ts`                                                |       1 |       1 |       0 |         0 |   **1** |
| `adapters/abstract_mysql_adapter/count_deleted_rows_with_lock_test.rb` | `adapters/abstract-mysql-adapter/count-deleted-rows-with-lock.test.ts` |       1 |       1 |       0 |         0 |   **1** |
| `adapters/abstract_mysql_adapter/sql_types_test.rb`                    | `adapters/abstract-mysql-adapter/sql-types.test.ts`                    |       1 |       1 |       0 |         0 |   **1** |
| `adapters/mysql2/check_constraint_quoting_test.rb`                     | `adapters/mysql2/check-constraint-quoting.test.ts`                     |       1 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/case_insensitive_test.rb`                         | `adapters/postgresql/case-insensitive.test.ts`                         |       1 |       1 |       0 |         0 |   **1** |
| `adapters/sqlite3/statement_pool_test.rb`                              | `adapters/sqlite3/statement-pool.test.ts`                              |       1 |       1 |       0 |         0 |   **1** |
| `column_alias_test.rb`                                                 | `column-alias.test.ts`                                                 |       1 |       1 |       0 |         0 |   **1** |
| `disconnected_test.rb`                                                 | `disconnected.test.ts`                                                 |       1 |       1 |       0 |         0 |   **1** |
| `invalid_connection_test.rb`                                           | `invalid-connection.test.ts`                                           |       1 |       1 |       0 |         0 |   **1** |
| `persistence/reload_association_cache_test.rb`                         | `persistence/reload-association-cache.test.ts`                         |       1 |       1 |       0 |         0 |   **1** |
| `prepared_statement_status_test.rb`                                    | `prepared-statement-status.test.ts`                                    |       1 |       1 |       0 |         0 |   **1** |
| `table_metadata_test.rb`                                               | `table-metadata.test.ts`                                               |       1 |       1 |       0 |         0 |   **1** |
| `type_caster/connection_test.rb`                                       | `type-caster/connection.test.ts`                                       |       1 |       1 |       0 |         0 |   **1** |
| `types_test.rb`                                                        | `types.test.ts`                                                        |       1 |       1 |       0 |         0 |   **1** |

171 files with pending work; 149 files at 100% (no skipped, no missing).

## Recent-merge followups (Phase 5 / defineSchema migration backlog)

Distilled from `~/.btwhooks/data/github/blazetrailsdev/trails/<PR#>/post-pr/*.md`. Findings files preserved.

- **Phase 5 root cluster B** (#1734): ~150 LOC `calculations.test.ts` (7596 LOC, 101 sites). ~200 LOC `persistence.test.ts` (4789 LOC, 141 sites). Schema maps will be large (Account, Company, Firm, Topic, Reply, Post). Inline `const adp = createTestAdapter()` in `beforeEach` exists outside `freshAdapter()` — separate grep pass after sed.
- **Phase 5 root cluster C** (#1737): ~250 LOC `enum.test.ts` (~77 sites). ~250 LOC `attribute-methods.test.ts` (~79 sites). ~150 LOC `attributes.test.ts` (~58 sites). ~80 LOC `attribute-methods/` subtree. Other root files: inheritance, multiparameter-attributes, nested-attributes, readonly, reflection, sanitize, secure-password, shard-keys, signed-id, statement-cache, strict-loading, time-precision, time-travel, transaction-_, query-cache, querying, relations, primary-class, instrumentation, instantiate-schema-types, filter-attributes, encryption-hooks, cache-key, batches, autosave, autosave-association, date-time_, counter-cache, annotate. **Patterns**: `as const` on TEST_SCHEMA with wrapped `{ columns, primaryKey }` breaks structural assignment — cast `: Schema` and drop `as const`. When sync factory becomes async, every caller's `it("...", () => {})` using `await` must flip to `async () => {`. `vi.stubEnv("AR_NO_AUTO_SCHEMA", "1")` hacks droppable.
- **batch 82 BLOCKED triage** (#1740): ~30 LOC port 3 hstore store_accessor tests (storeAccessor implemented at store.ts:329 + base.ts:1535). Before un-skipping "changes with store accessors", verify per-accessor dirty aliases (`<accessor>_changed?`, `_was`, `_change`) wired on storeAccessor module (~10 LOC if not). ~20 LOC per-attribute `<attr>_before_type_cast` alias generation in attribute-methods pipeline. `scripts/api-compare/unported-files.ts:480` has pre-existing `className` type error.
- **insert-all triage** (#1741): ~10 LOC extend `insert-all.ts#verifyAttributes` to reject unknown keys (throw `UnknownAttributeError`) — unblocks `insert all raises on unknown attribute` (L738) + 2 related. ~6 LOC `insertAllBang`/`upsertAllBang` class-level wrappers in `querying.ts`. ~250 LOC sharpen 60 `BLOCKED:` annotations into 3-line BLOCKED/ROOT-CAUSE/SCOPE. Clusters: timestamps (15, no implicit/explicit handling in `mapKeyWithValue`), RETURNING (4 pg), readonly (3, no `_readonlyAttributes` filter), schema/index (7). 63 `it.skip` mostly empty placeholders.
- **transactions slot D** (#1742): 2 deferred. `restore previously new record after double save` (transactions.test.ts ~L1167): `withTransactionReturningStatus` captures closure-local snapshot per call; two saves register their own `tx.afterRollback`; second clobbers first. Open Q: between save#1/save#2 in same outer user tx is `@_previously_new_record` actually mutated in Rails? Fix: use `_restoreTransactionRecordState` gated by level, OR only register `afterRollback` when `wasOutermostState`. Auto-declare `primaryKey = "movieid"` — `setPrimaryKeyAttr` is one-liner with no attribute registration; need lazy fix (declare only if no later `attribute()` or schema-load fires) to not clobber schema-driven type.
- **SQLite strict + dataSourceExists** (#1743): Reconcile floor — adapter allows ≥3.8.0 but `dataSourceExists()`/`tableExists`/`tables`/`views` require 3.37+. Raise to 3.37 (drop sqlite_master fallback, −20 LOC) or keep 3.8 + add fallbacks (+50 LOC). Rails resolves at 3.37+. `strict` honored only by node-sqlite (`enableDoubleQuotedStringLiterals`); better-sqlite3/expo-sqlite no-op. ~30 LOC node-sqlite `strict` test. ~20 LOC adapter→driver `strict` forwarding test.
- **TM phase 5 PG cluster A** (#1753): 3 failing `array.test.ts` tests (default, default strings, change column with array) pre-existing — root cause: `addColumn(..., { array: true, default: [4,4,2] })` blows up in `quoteDefaultExpression → quote` with `TypeError: can't quote Array`. ~30 LOC fix PG `quoteDefaultExpression` (postgresql/quoting.ts:193) and/or `addColumn` plumbing to serialize JS array through `OID::Array.serialize` before quoting. ~250 LOC next cluster: explain/hstore/infinity/interval/json/range/uuid/virtual-column PG test files. ~20 LOC extend `PrimitiveColumnSpec` with PG-only optional types (`citext`, `hstore`, `uuid`, `interval`, `oid`) + `array?` option. **Audit-script papercut** (scripts/audit-define-schema.ts:55-67): strips strings BEFORE line comments — apostrophe in `//` comment can consume content across lines.
- **TM phase 5 cache-key + autosave** (#1756): ~5 LOC `annotate.test.ts` — already green under `AR_NO_AUTO_SCHEMA=1` (toSql() only), flagged due to no `defineSchema()`. Either add no-op or refine audit script to exclude files with zero DB-touching ops (same false positive for `attribute-methods/*.test.ts`). ~250–350 LOC `batches.test.ts` (90 failing). ~250–350 LOC `counter-cache.test.ts` (85 failing).
- **calculations describes 3-7** (#1803): ~150 LOC 6 remaining describes (~L2750–7050) — tables: products, orders, topics + inline items/nullables/empties. ~30 LOC `bigint aggregates (big_integer columns)` (~L7378) — needs `big_integer` in defineSchema map. ~5 LOC `lookupCastTypeFromJoinDependencies` (L7489, no DB). ~200 LOC `persistence.test.ts` second half. **Bug-shape pattern**: inner `const adapter = freshAdapter()` shadows in describes 5-6 prevent `AR_NO_AUTO_SCHEMA=1` — watch for same in persistence.test.ts.
- **AutomaticInverseFindingTests** (#1806): Bundle 5 sibling describes in `inverse-associations.test.ts` (~80 LOC PR): InversePolymorphicBelongsToTests (~L1250), InverseCachedPathTests (~L1407), InverseAssociationTests (~L1485), inverse_of (~L1594), InverseHasOneTests (~L1659).
- **persistence.test.ts cluster A slice** (#1822): ~150 LOC continuation — large describe at ~L1144 (>1200 LOC, ends ~L2356). 121b clusters at ~L2358, 2453, 2662, 2682, 2724, 2744, 2777 (~200 LOC). 121c clusters at ~L3393–4729 (~200 LOC). ~10 LOC describe ~L978 audit — uses `defineSchema` but many no-op `expect(true).toBe(true)` placeholders.
- **autosave-association cluster A** (#1887): 1/26 describes migrated; ~163 tests still on auto-schema. Clusters: B TestDefaultAutosaveAssociationOnAHasMany (L494-837); C TestDefaultAutosaveAssociationOnAHasOne (L838-1309, may split); D TestAutosaveAssociationOnAHasOne (L1310-1633); E TestDefaultAutosaveAssociationOnABelongsTo (L1634-1857); F-Z 21 more (L1858-4637). Likely-must-split: TestAutosaveAssociationsInGeneral (L2296-2921); unnamed "should update children when autosave is true and parent is new but child is not" (L3824-4306).
- **has-many-associations cluster A** (#1891): 3 head describes (7 tests). File ~8450 LOC, ~610 inline `class … extends Base` — no `tableName =` overrides. Clusters by `// --` comments: Counting/Building/Creating; Finding/Replacing; Deleting/Counter-cache; STI/Polymorphic; Through/Dependent; Async; trailing HasManyAssociationsTestPrimaryKeys (~L8040) + AsyncHasManyAssociationsTest. Same-named tables across clusters have different shapes — schema per-describe (use `freshAdapterWithSchema(schema)` helper, not full-file `TEST_SCHEMA`).
- **relations.test.ts cluster A** (#1895): 5 of ~20 RelationTest describes (file ~6987 LOC). ~40 LOC L2148+ (Order + User variants). ~60 LOC items/users `_tableName`-pinned (L2713-3578). ~30 LOC references/eager-loading (L3578, 3738, 3805). ~30 LOC second top-level RelationTest at L4074 (Post: title/body/status/views/created_at). ~30 LOC final describes (L4232+).
- **associations.test.ts cluster A** (#1897): 5 of 38 describes (file ~9998 LOC). ~50 LOC DependentAssociations (L855-1113). ~20 LOC StrictLoading (L1114-1200). ~30 LOC AssociationDefinitions + AssociationReflection (L1201-1438). ~30 LOC HABTM (L1439-1539). ~40 LOC CounterCache + TouchBelongsToParents (L1540-1725). ~60 LOC Rails-guided (L1726-1976). 250+ LOC each: AssociationsTest mega-block (L1977+), BelongsToAssociationsTest (L4876), HasManyAssociationsTest (L4130), AssociationProxyTest, PreloaderTest. Trailing through L9998: OverridingAssociationsTest, GeneratedMethodsTest, WithAnnotationsTest, CollectionProxyDelegation, eagerLoadBang.
- **transaction-{isolation,callbacks,instrumentation}** (#1913): 3 `TM path:` cases in transaction-instrumentation.test.ts use dedicated per-test adapter (`freshIsolatedAdapter()`) — `Topic.afterCommit` stopped firing on shared adapter due to commit-side TM state pollution. ~20 LOC extend `resetTestAdapterState()` to reset `transactionManager` (or replace `_sharedAdapter`); then 3 tests + TransactionIsolationUnsupportedTest could share. ~5 LOC lazy-init outer `beforeEach` sharedAdapter.
- **encryptable-record-message-pack-serialized** (#1917): ~30 LOC collapse `encrypted_book_with_binary_message_pack_serializeds` (and likely `_first_binaries`, `_second_binaries`, `encrypted_book_with_binaries`) into shared `encrypted_books` by adding `logo` column. Audit Rails fixture schema (`encryptable_record_message_pack_serialized_test.rb:37-41`).
- **associations.test.ts cluster B** (#1919): 3 more describes (skipped 2 no-DB). Remaining: ~30 LOC CounterCache + TouchBelongsToParents (L1575-1760); ~30 LOC Rails-guided (L1761-2011); ~250 LOC each: AssociationsTest mega-block (L2012-3639), BelongsToAssociationsTest (L4876-6028), HasManyAssociationsTest (L6029-7220), PreloaderTest (L7593-9442); ~150 LOC AssociationProxyTest (L7221-7592); ~150 LOC trailing (~L10033). Mega-blocks define dozens of inline classes per `it()` — schema union per block. Don't migrate AssociationDefinitions/AssociationReflection (no persistence).
- **useTransactionalTests opt-out (B6.2)** (#1921): B6.3 (~60 LOC) wire `getUseTransactionalTests(adapter)` into global `beforeEach` in `test-setup-ar.ts`. B6.4 sweep (~5 LOC × ~50 files) — add `defineSchema(adapter, schema, { useTransactionalTests: false })` to candidates. ~5 LOC export from public test-helpers barrel. Per-adapter WeakMap storage vs Rails per-test-class.
- **defineSchema idempotent (B6 prep)** (#1922): ~30 LOC cascade-drop on parent-table signature change (reverse-topo order). Phase 6 hoist: `beforeEach(defineSchema)` → `beforeAll`; swap `resetTestAdapterState` for `BEGIN`/`ROLLBACK`.
- **transaction-instrumentation isolation** (#1923): Sidestepped MariaDB failure by per-test adapter; underlying TM bug live. Root cause: `_withinNewTransactionBody` (abstract/transaction.ts:1162-1178) — when catch path calls `this.rollbackTransaction()` and it throws (spied), TM stack frame never popped → next caller opens SAVEPOINT against transaction that never materialized (MariaDB symptom). Same on commit catch (L1183-1191). ~30 LOC wrap both `rollbackTransaction()` in `try { ... } finally { pop if still top, force incomplete }`. ~5 LOC audit other test files spying on `tm.rollbackTransaction`/`commitDbTransaction` with shared adapter.
- **setupAdapterSuite helper** (#1971): Helper ships unused. ~30 LOC × ~8 PG candidates: `foreign-table`, `citext`, `infinity`, `interval`, `datatype`, `json`, `virtual-column`, `explain`. Group as 2-3 PRs of 3 files. ~50 LOC `define-schema-pg-types.test.ts`. ~80 LOC MySQL `mysql-explain.test.ts` + `schema.test.ts` (MariaDB DDL auto-commit caveat). Skip migration / mark opt-out: `sqlite3-adapter.test.ts` (644 LOC); `adapters/postgresql/{schema,uuid,range,array,hstore,bytea}.test.ts` (3500+ LOC mid-body schema mutation). ~30 LOC refactor `encryption/uniqueness-validations.test.ts` + `extended-deterministic-queries.test.ts` to use helper.
- **HABTM reuse adapter (B1966)** (#1976): ~80–120 LOC promote HABTM file to `withTransactionalFixtures` — mirror #1977. Tables: rich_person2s, treasure2s, treasures_rich_people2, cj_developers, cj_projects, custom_joins, same_devs/projs/joins, multi_owners, tag_as/bs, multi_owners_tag_as/bs, parent_owners, child_owners, parent_owners_p_tags, child_owners_c_tags + developers/projects/developer_projects.
- **polymorphic has-many describes (B1966a)** (#1977): Only 5 polymorphic/`as:` tests extracted from head describe (L262-8038). ~7600 lines still on per-test `freshAdapter()`. Two sibling describes with same name now — `test:compare` happy but readability sharp edge. ~250 LOC per batch. ~50 LOC opportunistic hoist `class Author/Post` from 4+ test redeclarations to module scope. File ~2.6× Rails size (8567 vs 3285) because each `it()` redeclares its own class block. **Document in test-compare workflow**: describe-name mismatch flags previously-passing tests as wrong-describe.
- **has-many building cluster (B1966e)** (#1982): Remaining sections in `has-many-associations.test.ts` head describe (~L263): Counting (3), Finding (7), Deleting (4), Destroying (7), Dependence (1), Get/Set IDs (3), Included in collection (2), Clearing (2), Counter cache (4), Has many on new record (1), Calling size/empty (many), Association definition, Scoped queries. Could move into same building-cluster describe without changing test bodies; per-cluster split cleaner (~150–250 LOC each).
- **uniqueness-validation float scope** (#2025): ~10 LOC if `defineSchema`'s `"float"` widens to `DOUBLE`/`DOUBLE PRECISION` on MySQL, revert test value `9.5` → `9.99`. `COLUMN_TYPE_MAP_MYSQL.float` currently `"float"` (single-precision MariaDB FLOAT).

---

## Appendix A: TS-ahead files (de-dup candidates)

Files with more active TS `it()`s than Rails has tests. `test:compare` does not flag these. Most are intentional supplemental coverage; some may overlap with sibling files. Surfaced by 2026-05-19 audit.

| File                                           |  TS | Rails | Ahead |
| ---------------------------------------------- | --: | ----: | ----: |
| adapters/postgresql/postgresql-adapter.test.ts | 148 |    67 |   +81 |
| relation/where.test.ts                         | 123 |    62 |   +61 |
| scoping/default-scoping.test.ts                | 151 |    96 |   +55 |
| adapters/postgresql/range.test.ts              |  93 |    46 |   +47 |
| validations/uniqueness-validation.test.ts      | 100 |    55 |   +45 |
| scoping/named-scoping.test.ts                  | 111 |    73 |   +38 |
| associations/has-many-associations.test.ts     | 309 |   272 |   +37 |
| relation/annotations.test.ts                   |  37 |   _2_ | _+35_ |
| tasks/database-tasks.test.ts                   | 107 |    78 |   +29 |
| adapters/postgresql/geometric.test.ts          |  54 |    29 |   +25 |

70 additional TS-ahead files are within ±25.

> _Italic row = known stem-name mismatch; `relation/annotations.test.ts` real counterpart is `cases/annotate_test.rb`. Re-audit before acting._

## Appendix B: No-Rails-counterpart files

TS files that have no single Rails test file equivalent — `test:compare` excludes them by design.

**TS-only infra:** `adapters/sqlite3-adapter`, `connection-adapters/abstract/{connection-pool/queue,database-statements,database-limits,savepoints,schema-dumper}`, `connection-adapters/{pool-config,pool-manager}`, `connection-adapters/sqlite3/quoting`, `relation/{query-attribute,thenable}`, `tasks/{mysql,postgresql,sqlite}-database-tasks`.

**Possibly mis-identified:** `associations/habtm` (2 tests; likely duplicate of `habtm-associations`), `database-configurations/connection-url-resolver` (12 tests; TS-specific URL resolver).

## Appendix C: BLOCKED-by-feature summary

Cluster-level view of the 24 BLOCKED files surfaced by the 2026-05-19 audit (closing requires implementation LOC, not test LOC):

| Cluster                 | BLOCKED files | Feature needed                                                     |
| ----------------------- | ------------: | ------------------------------------------------------------------ |
| associations            |             6 | Polymorphic through join model, STI inverse dispatch               |
| connection-adapters     |             4 | Nested connection swapping, role/shard context                     |
| encryption              |             3 | Key rotation edge cases, deterministic context                     |
| relation                |             3 | load_async (permanent/Ruby-only), missing/associated query methods |
| coders                  |             1 | YAML column coder                                                  |
| database-configurations |             1 | URL resolver edge cases                                            |
| tasks                   |             1 | Rake infrastructure                                                |
| persistence             |             1 | Transaction-aware persistence edge                                 |
| type-caster             |             1 | Type-caster edge case                                              |

## Appendix D: Audit reproducibility + limitations

The 2026-05-19 audit covered the 228 `packages/activerecord/src/**/*.test.ts` files with at least one commit dated before 2026-04-15 (`git log --before=2026-04-15 --name-only`).

**Limitations of the audit (not of `test:compare`):**

- **Assertion-quality not analyzed.** For matching-name tests, assertion bodies were not compared line-for-line. A test with the same name but weaker assertions is invisible. `test:compare` has the same blind spot.
- **Stem-name matching is fuzzy.** Rails counterparts located by `foo.test.ts → foo_test.rb`. Known mismatch: `relation/annotations.test.ts` (real counterpart `cases/annotate_test.rb`).
- **Counts use `grep -cE '^\s*it\('` (TS) and `grep -cE '^\s*(def test_|test ")'` (Rails)** — minitest declarations only. Authoritative numbers live in `pnpm test:compare --cached --json`.
