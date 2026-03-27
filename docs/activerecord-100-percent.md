# ActiveRecord: Road to 100%

Current state: **61.7%** tests (5,172 / 8,385). **11.1%** API (66/597 classes/modules). 5 misplaced.

```bash
pnpm run test:compare -- --package activerecord
pnpm run api:compare -- --package activerecord
```

## How to work on this

Each workstream below is independent — multiple agents can work on different
streams in parallel without conflicts. Pick a stream, work in a worktree,
and submit a PR.

**Before starting**: read the Rails source for the feature you're implementing.
The test names tell you what behavior to implement, but the Rails source tells
you how.

**Measuring progress**: `api:compare` counts classes/modules matched by name
and file path against the Rails source. Creating the class in the right file
is what moves the number.

---

## Misplaced (5 — fix these first)

These exist but are in the wrong file path:

| Current location                  | Expected location                              | Class/Module                                            |
| --------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| `quoting.ts`                      | `connection-adapters/abstract/quoting.ts`      | Quoting                                                 |
| `enum.ts`                         | `connection-adapters/postgresql/oid/enum.ts`   | Enum (PG OID class, name collision with AR Enum module) |
| `adapters/postgresql/hstore.ts`   | `connection-adapters/postgresql/oid/hstore.ts` | Hstore                                                  |
| `adapters/postgresql/uuid.ts`     | `connection-adapters/postgresql/oid/uuid.ts`   | Uuid                                                    |
| `encryption/cipher/aes256-gcm.ts` | `encryption.ts`                                | Cipher                                                  |

The Enum collision is tricky — our `enum.ts` has the AR Enum module (functions),
but Rails also has a PG OID Enum class. The extractor matches the PG one first.
Hstore/Uuid are just `adapters/` vs `connection-adapters/` path differences.

---

## Workstream 1: Core modules (114 missing across top-level files)

These are the ~40 modules that Rails mixes into Base. Many already have
implementations in our `base.ts` or standalone files — they just need the
class/module exported from the right file path.

### High-value targets (3+ classes each)

| Rails file               | Missing | Notes                                                           |
| ------------------------ | ------- | --------------------------------------------------------------- |
| `statement_cache.rb`     | 7       | StatementCache, BindManager, etc.                               |
| `store.rb`               | 6       | Store, IndifferentCoder, etc.                                   |
| `readonly_attributes.rb` | 4       | ReadonlyAttributes + internal classes                           |
| `message_pack.rb`        | 4       | MessagePack encoder/decoder                                     |
| `future_result.rb`       | 4       | FutureResult, EventBuffer, etc.                                 |
| `fixtures.rb`            | 4       | FixtureSet + helpers                                            |
| `token_for.rb`           | 3       | TokenFor, TokenDefinition, etc.                                 |
| `signed_id.rb`           | 3       | SignedId + related                                              |
| `normalization.rb`       | 3       | Normalization + related                                         |
| `dynamic_matchers.rb`    | 3       | DynamicMatchers + Method/FindBy                                 |
| `core.rb`                | 3       | Core + InspectionMask + related                                 |
| `attribute_methods.rb`   | 3       | AttributeMethods + LazyAttributeSet + GeneratedAttributeMethods |

### Medium targets (2 classes each)

`timestamp.rb`, `suppressor.rb`, `schema_migration.rb`, `sanitization.rb`,
`result.rb`, `query_logs_formatter.rb`, `persistence.rb`, `no_touching.rb`,
`model_schema.rb`, `insert_all.rb`, `inheritance.rb`, `counter_cache.rb`,
`callbacks.rb`, `autosave_association.rb`

### Already partially matched

| Rails file                | OK  | Missing | Notes                                                       |
| ------------------------- | --- | ------- | ----------------------------------------------------------- |
| `base.rb`                 | 1/1 | 0       | Done                                                        |
| `autosave_association.rb` | 1/2 | 1       | AutosaveAssociation module detected, missing internal class |
| `associations.rb`         | 1/2 | 1       | Builder module missing                                      |
| `validations.rb`          | 1/2 | 1       | RecordInvalid matched, Validations module missing           |
| `transactions.rb`         | 1/2 | 1       | Transactions module detected, missing internal class        |

---

## Workstream 2: Connection adapters (100 missing)

The largest gap. Rails has deep adapter internals with many classes.

### Abstract adapter layer (high value)

| Rails file                       | Missing | Notes                                                     |
| -------------------------------- | ------- | --------------------------------------------------------- |
| `abstract/transaction.rb`        | 10      | Transaction, SavepointTransaction, NullTransaction, etc.  |
| `abstract/connection_pool.rb`    | 6       | Queue, Reaper, BiasableQueue, etc.                        |
| `abstract/query_cache.rb`        | 3       | QueryCache, Store, etc.                                   |
| `abstract/schema_definitions.rb` | 4       | Already have 2 matched (TableDefinition, IndexDefinition) |
| `abstract/connection_handler.rb` | 1       | Already have 1 matched                                    |

### PostgreSQL adapter (28 missing across OID types)

Each OID type is a small self-contained class: `cast()`, `serialize()`,
`deserialize()`, register in type map.

Missing OID types: Array, BitVarying, Bit, Bytea, Cidr, DateTime, Date,
Decimal, Inet, Interval, Jsonb, LegacyPoint, MacAddr, Money, Oid,
Point, Range, SpecializedString, Timestamp, TimestampWithTimeZone, Uuid,
Vector, Xml

Also missing: PostgreSQL Column, DatabaseStatements, Quoting,
SchemaCreation, SchemaDefinitions, SchemaStatements, TypeMetadata

### MySQL adapter (18 missing)

Column, DatabaseStatements, Quoting, SchemaCreation, SchemaDefinitions,
SchemaStatements, TypeMetadata, plus MySQL2 adapter specifics.

### SQLite3 adapter (7 missing)

Column, DatabaseStatements, Quoting, SchemaStatements, etc.

---

## Workstream 3: Associations (32 missing)

| Area                | Missing | Notes                                                                                      |
| ------------------- | ------- | ------------------------------------------------------------------------------------------ |
| Builder classes     | 7       | Association, BelongsTo, CollectionAssociation, HABTM, HasMany, HasOne, SingularAssociation |
| Association classes | 7       | BelongsToAssociation, HasManyAssociation, etc.                                             |
| Preloader           | 5       | Preloader, Association, Batch, Branch, ThroughAssociation                                  |
| Errors              | 15      | We have 6/21 matched                                                                       |
| JoinDependency      | 2       | JoinAssociation, JoinBase (JoinPart matched)                                               |
| Other               | 4       | AliasTracker, AssociationScope, DisableJoins, NestedError                                  |

The Builder classes are the biggest win — Rails uses a builder pattern to
configure associations. We inline this in `associations.ts`.

---

## Workstream 4: Relation layer (28 missing)

All missing — no classes matched yet.

| Rails file                  | Classes | Notes                                     |
| --------------------------- | ------- | ----------------------------------------- |
| `relation.rb`               | 7       | Relation + WhereClause, FromClause, etc.  |
| `relation/query_methods.rb` | 4       | QueryMethods + WhereChain, etc.           |
| `relation/calculations.rb`  | 2       | Calculations module                       |
| `relation/delegation.rb`    | 2       | Delegation module                         |
| `relation/batches.rb`       | 2       | Batches module                            |
| Other relation files        | 11      | FinderMethods, SpawnMethods, Merger, etc. |

We have a Relation class in `relation.ts` but it's not split into the
sub-modules Rails uses. Moving/extracting to match Rails file structure
would pick these up.

---

## Workstream 5: Encryption (15 missing)

| Rails file                   | Missing | Notes                                               |
| ---------------------------- | ------- | --------------------------------------------------- |
| `encryption.rb`              | 1       | Top-level Encryption module (Cipher misplaced here) |
| `encryption/encryptor.rb`    | 2       | Encryptor + related                                 |
| `encryption/key_provider.rb` | 2       | KeyProvider + DerivedSecretKeyProvider              |
| Other encryption files       | 10      | Config, Context, Scheme, Properties, etc.           |

Already have 16 OK in encryption — good foundation to build on.

---

## Workstream 6: Migration & schema (23 missing)

| Rails file                      | Missing | Notes                                           |
| ------------------------------- | ------- | ----------------------------------------------- |
| `migration.rb`                  | 7       | Migration + CheckPending, Compatibility modules |
| `migration/command_recorder.rb` | 2       | CommandRecorder + StraightReversible            |
| `migration/compatibility.rb`    | 6       | V7.2, V7.1, V7.0, etc.                          |
| `schema.rb`                     | 1       | Schema class                                    |
| `schema_dumper.rb`              | 3       | SchemaDumper + related                          |
| Other                           | 4       | JoinTable, DefaultStrategy, etc.                |

---

## Workstream 7: Types (16 missing)

| Rails file                          | Missing | Notes                                                 |
| ----------------------------------- | ------- | ----------------------------------------------------- |
| `type/adapter_specific_registry.rb` | 4       | Registration, TypeConflict, etc.                      |
| `type/time.rb`                      | 2       | Time + related                                        |
| Other type files                    | 10      | Date, DateTime, JSON, Serialized, Text, TypeMap, etc. |

Each type is self-contained: inherit from ActiveModel type, override `cast`/`serialize`.

---

## Workstream 8: Smaller areas

| Area                        | Missing | Notes                                                                                                 |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `attribute_methods/*`       | 13      | Dirty, Read, Write, Query, PrimaryKey, BeforeTypeCast, Serialization, TimeZoneConversion, CompositePK |
| `validations/*`             | 7       | Absence, Associated, Length, Numericality, Presence, Uniqueness                                       |
| `scoping/*`                 | 5       | Default, Named, ScopeRegistry                                                                         |
| `database_configurations/*` | 1       | Almost done — 3/4 matched                                                                             |
| `locking/*`                 | 4       | Optimistic, Pessimistic                                                                               |
| `coders/*`                  | 4       | ColumnSerializer, JSON, YamlColumn                                                                    |
| `middleware/*`              | 4       | DatabaseSelector, ShardSelector                                                                       |
| `fixture_set/*`             | 7       | Fixture loading internals                                                                             |
| `testing/*`                 | 2       | TestFixtures, TestDatabases                                                                           |

---

## Known architectural gaps

- **ScopeRegistry needs AsyncLocalStorage**: `ScopeRegistry` uses a process-global
  WeakMap, which means concurrent async scoping blocks on the same model can race.
  Rails uses thread-local storage for `current_scope`; the TS equivalent is
  `AsyncLocalStorage`. This matters for server contexts with concurrent requests.

---

## Strategy for moving the number

The fastest way to improve api:compare is:

1. **Fix misplaced (5)** — move existing classes to correct file paths
2. **Export missing modules from files that already exist** — many modules
   are implemented but not exported as a class/module from the right path
3. **Create stub files for areas with many small classes** — OID types,
   association builders, relation sub-modules
4. **Split large files** — `relation.ts` and `base.ts` contain logic that
   Rails splits across many files/modules
5. **Extract SchemaStatements from Migration** — Done in PR #260.
   DDL methods now live on `SchemaStatements` at
   `connection-adapters/abstract/schema-statements.ts`, and `Migration`
   delegates to `this.schema`. Still using raw SQL string building
   internally — see item 6.
6. **Implement SchemaCreation** — In Rails, DDL SQL is generated by
   `ActiveRecord::ConnectionAdapters::SchemaCreation`, a visitor that
   accepts definition objects (`ColumnDefinition`, `AddColumnDefinition`,
   `ChangeColumnDefinition`, etc.) and produces adapter-specific SQL.
   SchemaStatements calls `schema_creation.accept(definition)` rather
   than building SQL strings directly. This is what enables clean
   per-adapter DDL differences (e.g. Postgres emitting separate ALTER
   COLUMN clauses for type/null/default, MySQL using MODIFY COLUMN,
   proper identifier quoting). Our SchemaStatements currently builds
   SQL inline with `quoteIdentifier` — implementing SchemaCreation
   would replace that with the visitor pattern.
