# Private API Parity — Path to 100%

`pnpm api:compare --package activerecord --privates-only` reports
**205/1429 (14.3%)** for private/protected methods, vs 96.3% for
public-only. Of the remaining gap, roughly **~10% is detection**
(fixable in the extractor) and **~90% is real implementation work**
spread across many Rails subsystems.

## 1. Script improvements

### ✅ 1a. Detect non-exported file-local helpers as private methods

Landed in **PR #870**. `extract-ts-api.ts` now walks un-exported
`FunctionDeclaration` and arrow-const `VariableStatement` nodes and
emits them as `internal: true` methods bound to the file's host class.
Also added `--privates-only` flag (filters to internal-only surface).

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

### Tier 1 — foundation ✅ COMPLETE

- **`persistence.rb`** — **95% (20/21)** — PR #874. One stub remains
  (`_updateRecordWithLock` composite-PK path).
- **`transactions.rb`** — **100%** — PR #882.
- **`relation/query_methods.rb`** — **100%** — PRs #884 + #901 + #908.

Still open in Tier 1:

- **`attribute_methods.rb` submodules** (0/6 + 0/3 + 0/6 + 0/1 ×4 +
  0/2 + 0/4) — read/write/dirty/serialization/time-zone/before-type-cast.
  ~30 methods.
- **`callbacks.rb`** (0/3).

### Tier 2 — associations cluster

`associations/` directory is mostly red:

- `association.rb` 5/20, `collection_association.rb` 5/15,
  `has_many_through_association.rb` 2/19, `join_dependency.rb` 0/12,
  `preloader/*` 0/14 + 0/10 + 0/2 + 0/2, `association_scope.rb` 0/9,
  `alias_tracker.rb` 0/2, builders 0/3.

Subtotal: ~120 methods. 6–8 PRs. Sequence: `association.rb` →
`collection_*` → `has_many_through` → `preloader/*` → `join_dependency`.

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

### Tier 4 — relation cluster

`relation.rb` 0/19, `relation/batches.rb` 0/11,
`relation/calculations.rb` 0/17, `relation/finder_methods.rb` 0/15,
`relation/merger.rb` 0/8, `relation/predicate_builder.rb` 0/5,
`relation/where_clause.rb` 0/12 (mostly script-fix), plus several
predicate_builder subfiles.

Subtotal: ~110 methods. 6 PRs.

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

1. **Finish Tier 1 stragglers** — `attribute_methods` submodules and
   `callbacks.rb`.
2. **Tier 4** (relation cluster) — exercised by every test.
3. **Tier 2** (associations).
4. **Tier 3** (adapters) — sequence per-driver after `abstract_*`.
5. **Tiers 5–7** in parallel as bandwidth allows.
