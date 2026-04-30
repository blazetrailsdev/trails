# Private API Parity — Path to 100%

`pnpm tsx scripts/api-compare/compare.ts --package activerecord --privates`
reports **3683/5111 methods (72.1%)** with privates included
(public-only is 3074/3398, 90.5%). Tier 1, Tier 2 (#924), and Tier 4
(#917) are complete. Remaining work concentrates in adapters,
encryption, migration/schema, and the long tail.

> Note: `pnpm api:compare` is a chained `&&` script and forwards
> `--package` / `--privates` only to the LAST command in the chain.
> Always invoke `compare.ts` directly when you need package-scoped
> totals or privates numbers.

## 1. Script improvements

### 1b. Audit `this`-typed mixin-helper detection

The agent confirmed mixin detection works for the `Attributes<T>(Base)`
pattern (extract-ts-api.ts:226–292). But CLAUDE.md's recommended pattern
is **`this`-typed top-level functions assigned to a class
(`Model.aliasAttribute = aliasAttribute`)**, which is a different shape.
Verify whether the extractor follows class-static assignments back to
the source function and inherits its visibility — if not, treat it as
1a-style detection.

### 1c. Detect `private`/`protected` predicate methods

Ruby uses `?` suffix predicates inside `private` blocks (e.g.
`equality_node?`). Confirm `extract-ruby-api.rb` keeps them and that
the TS-side name normalizer preserves the predicate name (`equalityNode`).
Spot-check 3–5 0% files for predicate mismatches.

## 2. Implementation roadmap

### Tier 3 — connection adapters

Largest aggregate gap (~300+ methods):

- `abstract_adapter.rb` 0/32, `abstract_mysql_adapter.rb` 0/24,
  `abstract/connection_pool.rb` 0/14, `abstract/database_statements.rb`
  0/21, `abstract/schema_statements.rb` 0/40,
  `abstract/schema_definitions.rb` 0/25, `abstract/schema_creation.rb`
  1/19, `abstract/schema_dumper.rb` 0/13.
- Per-driver: `postgresql_adapter.rb` 1/26, `sqlite3_adapter.rb` 1/21,
  `mysql2_adapter.rb` 0/9, `trilogy_adapter.rb` 0/9, plus driver-specific
  schema/quoting/database-statements files.

Subtotal: ~310 methods. ~16 PRs. Many of these are private helpers
behind already-implemented public APIs — likely a high "script-detection"
hit rate once 1b/1c lands; re-measure before scoping.

### Tier 5 — encryption

`encryption/encryptable_record.rb` 0/20,
`encryption/encrypted_attribute_type.rb` 4/19,
`encryption/encryptor.rb` 0/13,
`encryption/message_serializer.rb` 0/7, plus 8 smaller files.

Subtotal: ~80 methods. 5 PRs.

### Tier 6 — migration / schema-dumping / fixtures / tasks

`migration.rb` 0/36, `migration/command_recorder.rb` 0/24,
`schema_dumper.rb` 2/24, `fixture_set/*` 0/21,
`tasks/database_tasks.rb` 0/16, `test_fixtures.rb` 0/15,
`insert_all.rb` 0/15, `nested_attributes.rb` 0/12,
`autosave_association.rb` 0/19.

Subtotal: ~180 methods. ~10 PRs.

### Tier 7 — long tail

`enum.rb` 0/11, `inheritance.rb` 0/9, `core.rb` 0/9, `timestamp.rb`
0/15, `touch_later.rb` 0/4, `locking/optimistic.rb` 0/8,
`log_subscriber.rb` 0/9, `model_schema.rb` 0/8, `sanitization.rb` 0/5,
`reflection.rb` 8/17, `validations/uniqueness.rb` 0/7, etc.

Subtotal: ~110 methods. ~6 PRs.

### Excluded from scope

- Files marked `✗` in the report (e.g. `dynamic_matchers.rb`,
  `serialization.rb`, `middleware/*`, `railties/*`,
  `destroy_association_async_job.rb`, `deprecator.rb`) — these are on
  the existing skip list per `excluded-files.ts` / `compare.ts` and
  intentionally out of scope.

## 3. Sequencing

1. **Tier 3** (adapters) — sequence per-driver after `abstract_*`.
2. **Tiers 5–7** in parallel as bandwidth allows.
