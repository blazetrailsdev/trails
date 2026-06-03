# DDL-Quarantine Backlog

Files with bespoke in-test DDL that have been quarantined (`describe.skip`) to
cut MySQL CI cost. Each is a **faithful rewrite backlog item**: replace the
ad-hoc schema with canonical models + fixtures (see PR #2913 / `dirty.test.ts`
as the model).

The quarantine header added to each file is a single line:

```
// QUARANTINED (PR #2916): bespoke in-test DDL skipped to cut MySQL CI cost; tests are the backlog for a faithful canonical rewrite (see docs/activerecord/ddl-quarantine-backlog.md and the dirty.test.ts model, PR #2913).
```

## Phase 1 — Giants (PR #2916)

| File                                           | Tests skipped | Rails counterpart                                                                                                                                                                                                |
| ---------------------------------------------- | :-----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `associations.test.ts`                         |      402      | `associations/*_test.rb` (omnibus) — ⚠️ 4 describe blocks (`AssociationDefinitions`, `AssociationReflection`, `GeneratedMethodsTest`, `WithAnnotationsTest`) touch no DB; unwrap-only, no fixture rewrite needed |
| `associations/has-many-associations.test.ts`   |      310      | `associations/has_many_associations_test.rb`                                                                                                                                                                     |
| `calculations.test.ts`                         |      544      | `calculations_test.rb`                                                                                                                                                                                           |
| `relations.test.ts`                            |      675      | `relations_test.rb`                                                                                                                                                                                              |
| `associations/eager.test.ts`                   |      203      | `associations/eager_test.rb` — `EagerLoadingTooManyIdsTest` was already all-`it.skip` before quarantine; unwrap only                                                                                             |
| `persistence.test.ts`                          |      389      | `persistence_test.rb` — ⚠️ 41 pre-existing `expect(true).toBe(true)` stubs (composite-key + `queryConstraints`); remove in rewrite                                                                               |
| `associations/belongs-to-associations.test.ts` |      153      | `associations/belongs_to_associations_test.rb`                                                                                                                                                                   |

**Phase 1 total: 2,676 tests quarantined.**

## Phase 2 — Remaining sweep (PR #2916)

All remaining DDL-emitting files across `relation/`, `scoping/`, `validations/`,
`associations/`, `encryption/`, and top-level.

### Top-level

| File                                                | Tests skipped | Rails counterpart                                           |
| --------------------------------------------------- | :-----------: | ----------------------------------------------------------- |
| `transactions.test.ts`                              |      165      | `transactions_test.rb`                                      |
| `scoping/default-scoping.test.ts`                   |      151      | `scoping/default_scoping_test.rb`                           |
| `relation.test.ts`                                  |      117      | `relation_test.rb`                                          |
| `insert-all.test.ts`                                |      115      | `insert_all_test.rb`                                        |
| `scoping/named-scoping.test.ts`                     |      111      | `scoping/named_scoping_test.rb`                             |
| `strict-loading.test.ts`                            |      96       | `strict_loading_test.rb`                                    |
| `serialized-attribute.test.ts`                      |      82       | `serialized_attribute_test.rb`                              |
| `scoping/relation-scoping.test.ts`                  |      77       | `scoping/relation_scoping_test.rb`                          |
| `store.test.ts`                                     |      76       | `store_test.rb`                                             |
| `timestamp.test.ts`                                 |      72       | `timestamp_test.rb`                                         |
| `transaction-callbacks.test.ts`                     |      64       | `transaction_callbacks_test.rb`                             |
| `locking.test.ts`                                   |      56       | `optimistic_locking_test.rb`                                |
| `attributes.test.ts`                                |      55       | `attributes_test.rb`                                        |
| `aggregations.test.ts`                              |      44       | `aggregations_test.rb`                                      |
| `unsafe-raw-sql.test.ts`                            |      38       | `unsafe_raw_sql_test.rb`                                    |
| `defaults.test.ts`                                  |      37       | `defaults_test.rb`                                          |
| `secure-password.test.ts`                           |      37       | `secure_password_test.rb`                                   |
| `querying.test.ts`                                  |      35       | `querying_test.rb`                                          |
| `encryption/extended-deterministic-queries.test.ts` |      34       | `encryption/extended_deterministic_queries_test.rb`         |
| `collection-cache-key.test.ts`                      |      30       | `collection_cache_key_test.rb`                              |
| `explain.test.ts`                                   |      26       | `explain_test.rb`                                           |
| `dup.test.ts`                                       |      21       | `dup_test.rb`                                               |
| `json-serialization.test.ts`                        |      23       | `json_serialization_test.rb`                                |
| `log-subscriber.test.ts`                            |      21       | `log_subscriber_test.rb`                                    |
| `token-for.test.ts`                                 |      20       | `token_for_test.rb`                                         |
| `secure-token.test.ts`                              |      18       | `secure_token_test.rb`                                      |
| `delegated-type.test.ts`                            |      16       | `delegated_type_test.rb`                                    |
| `serialization.test.ts`                             |      16       | `serialization_test.rb`                                     |
| `excluding.test.ts`                                 |      16       | `excluding_test.rb`                                         |
| `suppressor.test.ts`                                |      13       | `suppressor_test.rb`                                        |
| `touch-later.test.ts`                               |      13       | `touch_later_test.rb`                                       |
| `errors.test.ts`                                    |      13       | `errors_test.rb`                                            |
| `filter-attributes.test.ts`                         |      12       | `filter_attributes_test.rb`                                 |
| `modules.test.ts`                                   |      11       | `modules_test.rb`                                           |
| `querying-methods-delegation.test.ts`               |       9       | `querying_test.rb`                                          |
| `finder-respond-to.test.ts`                         |       9       | `finder_respond_to_test.rb`                                 |
| `clone.test.ts`                                     |       8       | —                                                           |
| `i18n.test.ts`                                      |       7       | `i18n_test.rb`                                              |
| `bigint-roundtrip.test.ts`                          |       7       | —                                                           |
| `transaction-isolation.test.ts`                     |       6       | `transaction_isolation_test.rb`                             |
| `boolean.test.ts`                                   |       5       | —                                                           |
| `null-relation.test.ts`                             |      14       | `null_relation_test.rb`                                     |
| `habtm-destroy-order.test.ts`                       |       4       | `associations/has_and_belongs_to_many_associations_test.rb` |
| `numeric-data.test.ts`                              |       4       | —                                                           |
| `delegate.test.ts`                                  |       3       | `delegate_test.rb`                                          |
| `date.test.ts`                                      |       3       | `date_test.rb`                                              |
| `lazy-schema-reflection.test.ts`                    |       2       | —                                                           |
| `mixin.test.ts`                                     |       2       | —                                                           |
| `inherited.test.ts`                                 |       2       | —                                                           |
| `custom-locking.test.ts`                            |       1       | —                                                           |

### relation/

| File                                        | Tests skipped | Rails counterpart                    |
| ------------------------------------------- | :-----------: | ------------------------------------ |
| `relation/where-chain.test.ts`              |      55       | `relation/where_chain_test.rb`       |
| `relation/merging.test.ts`                  |      52       | `relation/merging_test.rb`           |
| `relation/or.test.ts`                       |      46       | `relation/or_test.rb`                |
| `relation/select.test.ts`                   |      40       | `relation/select_test.rb`            |
| `relation/annotations.test.ts`              |      37       | `relation/annotation_test.rb`        |
| `relation/delete-all.test.ts`               |      30       | `relation/delete_all_test.rb`        |
| `relation/update-all.test.ts`               |      28       | `relation/update_all_test.rb`        |
| `relation/mutation.test.ts`                 |      25       | `relation/mutation_test.rb`          |
| `relation/predicate-builder.test.ts`        |      24       | `relation/predicate_builder_test.rb` |
| `relation/with.test.ts`                     |      16       | `relation/with_test.rb`              |
| `relation/order.test.ts`                    |      15       | `relation/order_test.rb`             |
| `relation/thenable.test.ts`                 |      13       | —                                    |
| `relation/field-ordered-values.test.ts`     |      12       | —                                    |
| `relation/structural-compatibility.test.ts` |       7       | —                                    |
| `relation/and.test.ts`                      |       6       | `relation/and_test.rb`               |
| `relation/delegation.test.ts`               |       3       | —                                    |

### associations/

| File                                                      | Tests skipped | Rails counterpart                             |
| --------------------------------------------------------- | :-----------: | --------------------------------------------- |
| `associations/cascaded-eager-loading.test.ts`             |      26       | `associations/cascaded_eager_loading_test.rb` |
| `associations/association-scope.test.ts`                  |      28       | `associations/association_scope_test.rb`      |
| `associations/extension.test.ts`                          |      12       | `associations/extension_test.rb`              |
| `associations/required.test.ts`                           |      10       | `associations/required_test.rb`               |
| `associations/bidirectional-destroy-dependencies.test.ts` |       3       | —                                             |

### encryption/

⚠️ **High-priority rewrites** — both were faithfully ported and passing before quarantine. They call `defineSchema` with a small inline model schema but the test logic was canonical. Restoring them only requires removing the bespoke `defineSchema` call.

| File                                        | Tests skipped | Rails counterpart                                                     |
| ------------------------------------------- | :-----------: | --------------------------------------------------------------------- |
| `encryption/contexts.test.ts`               |       9       | `encryption/contexts_test.rb` — ported PR #2825, was test:compare 9/9 |
| `encryption/uniqueness-validations.test.ts` |       6       | `encryption/uniqueness_validations_test.rb`                           |

### validations/

⚠️ **`length-validation.test.ts` is high-priority** — was faithfully ported (PR #2792) and passing before quarantine.

| File                                          | Tests skipped | Rails counterpart                                                  |
| --------------------------------------------- | :-----------: | ------------------------------------------------------------------ |
| `validations/numericality-validation.test.ts` |      16       | `validations/numericality_test.rb`                                 |
| `validations/association-validation.test.ts`  |      10       | `validations/association_test.rb`                                  |
| `validations/presence-validation.test.ts`     |       8       | `validations/presence_test.rb`                                     |
| `validations/length-validation.test.ts`       |       5       | `validations/length_test.rb` — ported PR #2792, all 5 were passing |
| `validations/i18n-validation.test.ts`         |       4       | `validations/i18n_validation_test.rb`                              |
| `validations/validations.test.ts`             |       2       | `validations_test.rb`                                              |

### type/

| File                     | Tests skipped | Rails counterpart        |
| ------------------------ | :-----------: | ------------------------ |
| `type/date-time.test.ts` |       2       | `type/date_time_test.rb` |
| `type/string.test.ts`    |       1       | `type/string_test.rb`    |

**Phase 2 total: 2,378 tests quarantined.**

---

**Grand total: 5,054 tests quarantined across 88 files.**

## Rewrite guidance

1. Read the corresponding Rails test file under `vendor/rails/activerecord/test/cases/`.
2. Rewrite to ride canonical models (`Base` subclasses from `test-helpers/`) +
   `setupHandlerSuite()` + `useHandlerTransactionalFixtures()`.
3. Keep Rails test names verbatim (`NEVER rename tests` — CLAUDE.md).
4. `it.skip` real implementation gaps with scoped reasons; never fake-pass.
5. Verify co-run with shield files under `--no-file-parallelism`.
6. Remove the `// QUARANTINED` header once the rewrite lands.
7. Remove the file's entry from this backlog.

## Phase 3 targets (excluded from this sweep, kept for later)

These files define their own bespoke schema constant (e.g. `const TEST_SCHEMA = {...}`) and call `defineSchema(TEST_SCHEMA)` — they DO emit MySQL DDL and are valid quarantine candidates. They were excluded from this PR to keep scope manageable; quarantine them in Phase 3.

- `associations/has-many-through-associations.test.ts`
- `autosave-association.test.ts`
- `finder.test.ts`
- `base.test.ts`
- `reflection.test.ts`
- `counter-cache.test.ts`
- `relation/where.test.ts`
- `associations/nested-through-associations.test.ts`
- `associations/join-model.test.ts`
- `nested-attributes.test.ts`

## Permanently excluded

- `migration.test.ts` — DDL is the feature under test (schema migration logic), not a setup artifact. Quarantining it would skip the tests that validate the feature this cost stems from.
- `readonly.test.ts` — sibling agent mid-rewrite; do not touch.
- `dirty.test.ts`, `forbidden-attributes-protection.test.ts` — already faithfully rewritten off inline DDL.
