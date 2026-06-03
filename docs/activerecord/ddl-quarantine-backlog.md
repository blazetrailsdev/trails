# DDL-Quarantine Backlog

Files with bespoke in-test DDL that have been quarantined (`describe.skip`) to
cut MySQL CI cost. Each is a **faithful rewrite backlog item**: replace the
ad-hoc schema with canonical models + fixtures (see PR #2913 / `dirty.test.ts`
as the model).

The quarantine header in each file reads:

```
// QUARANTINED (PR #N): bespoke in-test DDL skipped to cut MySQL CI cost;
// tests are the backlog for a faithful canonical rewrite (see this doc
// and the dirty.test.ts model, PR #2913).
```

## Phase 1 — Giants (PR #TBD)

These are the largest files by test count; quarantining them drops the most DDL
per PR. The PR ceiling is waived (mechanical sweep).

| File                                           | Tests skipped | Rails counterpart                              |
| ---------------------------------------------- | :-----------: | ---------------------------------------------- |
| `associations.test.ts`                         |      402      | `associations/*_test.rb` (omnibus)             |
| `associations/has-many-associations.test.ts`   |      310      | `associations/has_many_associations_test.rb`   |
| `calculations.test.ts`                         |      544      | `calculations_test.rb`                         |
| `relations.test.ts`                            |      675      | `relations_test.rb`                            |
| `associations/eager.test.ts`                   |      203      | `associations/eager_test.rb`                   |
| `persistence.test.ts`                          |      389      | `persistence_test.rb`                          |
| `associations/belongs-to-associations.test.ts` |      153      | `associations/belongs_to_associations_test.rb` |

**Phase 1 total: 2,676 tests quarantined.**

## Rewrite guidance

1. Read the corresponding Rails test file under `vendor/rails/activerecord/test/cases/`.
2. Rewrite to ride canonical models (`Base` subclasses from `test-helpers/`) +
   `setupHandlerSuite()` + `useHandlerTransactionalFixtures()`.
3. Keep Rails test names verbatim (`NEVER rename tests` — CLAUDE.md).
4. `it.skip` real implementation gaps with scoped reasons; never fake-pass.
5. Verify co-run with shield files under `--no-file-parallelism`.
6. Remove the `// QUARANTINED` header once the rewrite lands.
7. Remove the file's entry from this backlog.

## Files NOT quarantined (ride canonical schema — zero DDL relief)

The following Phase-1 "giants" from the initial target list have **no bespoke
DDL**; they already call `defineSchema(TEST_SCHEMA)` or `useHandlerFixtures()`.
Skipping them would lose coverage for zero DDL cost and is excluded per the
sweep rules.

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
- `migration.test.ts`
