# ActiveRecord API Compare: Road to 100%

Current state: **22.9%** (127/555 classes/modules). Target: 100%.

```bash
pnpm run api:compare -- --package activerecord
```

Note: The compare script folds Ruby's `ClassMethods` concern pattern into the
parent module (their methods become static/class methods on the parent). This
avoids inflating the count with namespace wrappers that have no TS equivalent —
in JS/TS, the filename is the module and static methods live on the class.

This plan splits the remaining 423 missing classes into two independent
workstreams that can be worked in parallel without conflicts.

---

## Workstream A: Model Layer

Everything a user touches when defining and querying models — the ORM surface
area. This is the higher-value workstream for anyone building apps on top of
blazetrails.

### A1. Errors (46 missing in `errors.rb`)

The single biggest file gap. These are mostly simple class declarations that
inherit from StandardError or RuntimeError equivalents. High ratio of matched
classes to effort.

Already partially matched (9 classes exist in `errors.ts` but 46 are missing).

### A2. Core Modules (mixed into Base)

Top-level modules that Rails mixes into `ActiveRecord::Base`. Many are already
implemented in our `base.ts` but not exported from the correct file path.

| Rails file             | Missing | Notes                                                            |
| ---------------------- | ------- | ---------------------------------------------------------------- |
| `attribute_methods.rb` | 3       | AttributeMethods + LazyAttributeSet + GeneratedAttributeMethods  |
| `core.rb`              | 3       | Core + InspectionMask + related                                  |
| `dynamic_matchers.rb`  | 3       | DynamicMatchers + Method/FindBy                                  |
| `normalization.rb`     | 3       | Normalization + related                                          |
| `signed_id.rb`         | 3       | SignedId + related                                               |
| `token_for.rb`         | 3       | TokenFor, TokenDefinition, etc.                                  |
| `callbacks.rb`         | 2       | Callbacks module                                                 |
| `counter_cache.rb`     | 2       | CounterCache module                                              |
| `inheritance.rb`       | 2       | Inheritance module                                               |
| `insert_all.rb`        | 2       | InsertAll + related                                              |
| `model_schema.rb`      | 2       | ModelSchema module                                               |
| `no_touching.rb`       | 2       | NoTouching module                                                |
| `persistence.rb`       | 2       | Persistence module                                               |
| `querying.rb`          | 2       | Querying module                                                  |
| `result.rb`            | 2       | Result class                                                     |
| `sanitization.rb`      | 2       | Sanitization module                                              |
| `schema_migration.rb`  | 2       | SchemaMigration class                                            |
| `suppressor.rb`        | 2       | Suppressor module                                                |
| `timestamp.rb`         | 2       | Timestamp module                                                 |
| Others (1 each)        | ~15     | aggregations, connection_handling, deprecator, integration, etc. |

### A3. Attribute Methods (13 missing)

Sub-modules of `AttributeMethods` that define how model attributes behave.

| Rails file                                   | Missing | Notes                                      |
| -------------------------------------------- | ------- | ------------------------------------------ |
| `attribute_methods/dirty.rb`                 | 2       | Dirty tracking                             |
| `attribute_methods/read.rb`                  | 1       | Attribute reading                          |
| `attribute_methods/write.rb`                 | 1       | Attribute writing                          |
| `attribute_methods/query.rb`                 | 1       | `user.active?` style queries               |
| `attribute_methods/primary_key.rb`           | 1       | Primary key handling                       |
| `attribute_methods/before_type_cast.rb`      | 1       | Raw value access                           |
| `attribute_methods/serialization.rb`         | 1       | Serialized attributes                      |
| `attribute_methods/time_zone_conversion.rb`  | 1       | TZ-aware attributes                        |
| `attribute_methods/composite_primary_key.rb` | 1       | Composite PK support                       |
| `attributes.rb`                              | 3       | Attribute API (`attribute :name, :string`) |

### A4. Relation Layer (28 missing)

The query interface. We have a `Relation` class but it isn't split into the
sub-modules Rails uses.

| Rails file                             | Missing | Notes                            |
| -------------------------------------- | ------- | -------------------------------- |
| `relation.rb`                          | 2       | Relation + internal classes      |
| `relation/query_methods.rb`            | 0       | Already matched (3 classes)      |
| `relation/calculations.rb`             | 0       | Already matched                  |
| `relation/finder_methods.rb`           | 0       | Already matched                  |
| `relation/delegation.rb`               | 2       | Delegation module                |
| `relation/spawn_methods.rb`            | 1       | SpawnMethods module              |
| `relation/where_clause.rb`             | 1       | WhereClause class                |
| `relation/from_clause.rb`              | 1       | FromClause class                 |
| `relation/query_attribute.rb`          | 1       | QueryAttribute class             |
| `relation/batches/batch_enumerator.rb` | 1       | BatchEnumerator class            |
| `relation/predicate_builder/*`         | 6       | ArrayHandler, RangeHandler, etc. |
| `relation/merger.rb`                   | 0       | Already matched                  |

### A5. Associations (7 missing — builders + internals)

Most association classes are already matched (21/21 error classes, all
concrete association types). The gaps are:

| Rails file                                         | Missing | Notes                  |
| -------------------------------------------------- | ------- | ---------------------- |
| `associations/association.rb`                      | 1       | Base Association class |
| `associations/builder/association.rb`              | 1       | Base builder           |
| `associations/builder/collection_association.rb`   | 1       | Collection builder     |
| `associations/builder/singular_association.rb`     | 1       | Singular builder       |
| `associations/join_dependency/join_association.rb` | 1       | Join association node  |
| `associations/join_dependency/join_base.rb`        | 1       | Join base node         |
| `associations/join_dependency/join_part.rb`        | 1       | Join part base class   |

### A6. Types (16 missing)

Each type is self-contained: inherit from an ActiveModel type, override
`cast`/`serialize`/`deserialize`.

| Rails file                          | Missing | Notes                            |
| ----------------------------------- | ------- | -------------------------------- |
| `type/adapter_specific_registry.rb` | 4       | Registration, TypeConflict, etc. |
| `type/time.rb`                      | 2       | Time type                        |
| `type/date.rb`                      | 1       | Date type                        |
| `type/date_time.rb`                 | 1       | DateTime type                    |
| `type/json.rb`                      | 1       | JSON type                        |
| `type/serialized.rb`                | 1       | Serialized type                  |
| `type/text.rb`                      | 1       | Text type                        |
| `type/type_map.rb`                  | 1       | TypeMap class                    |
| `type/hash_lookup_type_map.rb`      | 1       | HashLookupTypeMap                |
| `type/decimal_without_scale.rb`     | 1       | DecimalWithoutScale              |
| `type/unsigned_integer.rb`          | 1       | UnsignedInteger                  |
| `type/internal/timezone.rb`         | 1       | Timezone mixin                   |
| `type.rb`                           | 1       | Top-level Type module            |
| `type_caster/connection.rb`         | 1       | TypeCaster::Connection           |
| `type_caster/map.rb`                | 1       | TypeCaster::Map                  |

### A7. Validations (7 missing)

Thin wrappers around ActiveModel validations with AR-specific behavior.

`validations/absence.rb`, `validations/associated.rb`,
`validations/length.rb`, `validations/numericality.rb`,
`validations/presence.rb`, `validations/uniqueness.rb`,
plus the top-level `validations.rb` module.

### A8. Scoping (5 missing)

| Rails file           | Missing | Notes                                 |
| -------------------- | ------- | ------------------------------------- |
| `scoping.rb`         | 1       | Scoping module                        |
| `scoping/default.rb` | 1       | Default scope                         |
| `scoping/named.rb`   | 1       | Named scopes (`scope :active, -> {}`) |
| Others               | 2       | ScopeRegistry, etc.                   |

Note: ScopeRegistry needs `AsyncLocalStorage` for safe concurrent use.

### A9. Encryption (15 missing)

Already have 16 matched classes — good foundation.

| Rails file                               | Missing | Notes                                                     |
| ---------------------------------------- | ------- | --------------------------------------------------------- |
| `encryption/encryptable_record.rb`       | 1       | EncryptableRecord module                                  |
| `encryption/encrypted_attribute_type.rb` | 1       | Type class                                                |
| `encryption/configurable.rb`             | 1       | Configurable module                                       |
| `encryption/contexts.rb`                 | 1       | Contexts module                                           |
| `encryption/errors.rb`                   | 5       | Additional error classes                                  |
| Others                                   | 6       | ExtendedDeterministicQueries, Fixtures, MessagePack, etc. |

### A10. Smaller areas

| Area                     | Missing | Notes                              |
| ------------------------ | ------- | ---------------------------------- |
| `locking/optimistic.rb`  | 2       | Optimistic locking                 |
| `locking/pessimistic.rb` | 2       | Pessimistic locking                |
| `coders/*`               | 4       | ColumnSerializer, JSON, YamlColumn |
| `serialization.rb`       | 1       | Serialization module               |
| `store.rb`               | 6       | Store, IndifferentCoder, etc.      |
| `statement_cache.rb`     | 7       | StatementCache, BindManager, etc.  |
| `enum.rb`                | 2       | Enum module                        |
| `nested_attributes.rb`   | 2       | NestedAttributes module            |
| `delegated_type.rb`      | 1       | Already partially matched          |
| `secure_password.rb`     | 1       | SecurePassword module              |
| `secure_token.rb`        | 2       | SecureToken module                 |
| `translation.rb`         | 1       | Translation module                 |

### Workstream A totals

~180 missing classes (after folding ClassMethods into parents). Completing
all of A would move us from 127 to ~307 matched (55%).

---

## Workstream B: Infrastructure Layer

Database plumbing, adapters, migrations, schema management, fixtures, and
testing utilities. These are the internals that make the model layer work
against real databases.

### B1. Abstract Adapter Layer (25 missing)

The foundation that all concrete adapters build on.

| Rails file                        | Missing | Notes                                                    |
| --------------------------------- | ------- | -------------------------------------------------------- |
| `abstract_adapter.rb`             | 1       | AbstractAdapter base class                               |
| `abstract/transaction.rb`         | 10      | Transaction, SavepointTransaction, NullTransaction, etc. |
| `abstract/connection_pool.rb`     | 6       | Queue, Reaper, BiasableQueue, etc.                       |
| `abstract/query_cache.rb`         | 3       | QueryCache, Store, etc.                                  |
| `abstract/schema_definitions.rb`  | 3       | Already have 3 matched; 3 missing                        |
| `abstract/connection_handler.rb`  | 1       | Already have 1 matched                                   |
| `abstract/database_limits.rb`     | 1       | DatabaseLimits module                                    |
| `abstract/database_statements.rb` | 1       | DatabaseStatements module                                |
| `abstract/quoting.rb`             | 1       | Quoting module (currently misplaced)                     |
| `abstract/savepoints.rb`          | 1       | Savepoints module                                        |

### B2. SQLite3 Adapter (8 missing)

Our primary adapter. Highest priority among concrete adapters.

| Rails file                          | Missing | Notes                  |
| ----------------------------------- | ------- | ---------------------- |
| `sqlite3_adapter.rb`                | 1       | SQLite3Adapter class   |
| `sqlite3/column.rb`                 | 1       | Column class           |
| `sqlite3/database_statements.rb`    | 1       | DatabaseStatements     |
| `sqlite3/explain_pretty_printer.rb` | 1       | ExplainPrettyPrinter   |
| `sqlite3/quoting.rb`                | 1       | Quoting module         |
| `sqlite3/schema_creation.rb`        | 1       | SchemaCreation visitor |
| `sqlite3/schema_definitions.rb`     | 1       | Schema definitions     |
| `sqlite3/schema_dumper.rb`          | 1       | SchemaDumper           |
| `sqlite3/schema_statements.rb`      | 1       | SchemaStatements       |

### B3. PostgreSQL Adapter (35 missing)

Large surface area, mostly OID types. Each OID type is small and self-contained.

**OID types (23):**
Array, Bit, BitVarying, Bytea, Cidr, Date, DateTime, Decimal, Enum, Inet,
Interval, Jsonb, LegacyPoint, MacAddr, Money, Oid, Point, SpecializedString,
Timestamp, TimestampWithTimeZone, TypeMapInitializer, Vector, Xml

**Adapter internals (12):**
PostgreSQLAdapter, Column, DatabaseStatements, ExplainPrettyPrinter, Quoting,
ReferentialIntegrity, SchemaCreation, SchemaDefinitions, SchemaDumper,
SchemaStatements, TypeMetadata, Utils

### B4. MySQL Adapter (18 missing)

| Rails file                  | Missing | Notes                                 |
| --------------------------- | ------- | ------------------------------------- |
| `abstract_mysql_adapter.rb` | 1       | AbstractMysqlAdapter                  |
| `mysql2_adapter.rb`         | 1       | Mysql2Adapter                         |
| `mysql/*`                   | 9       | Column, Quoting, SchemaCreation, etc. |
| `mysql2/*`                  | 1       | DatabaseStatements                    |
| `trilogy_adapter.rb`        | 1       | TrilogyAdapter                        |
| `trilogy/*`                 | 1       | DatabaseStatements                    |

Lower priority — MySQL support isn't the primary target right now.

### B5. Other Adapter Infrastructure (14 missing)

| Rails file                                 | Missing | Notes                 |
| ------------------------------------------ | ------- | --------------------- |
| `connection_adapters.rb`                   | 1       | Top-level module      |
| `connection_adapters/column.rb`            | 1       | Base Column class     |
| `connection_adapters/deduplicable.rb`      | 1       | Deduplicable mixin    |
| `connection_adapters/pool_config.rb`       | 1       | PoolConfig class      |
| `connection_adapters/pool_manager.rb`      | 1       | PoolManager class     |
| `connection_adapters/schema_cache.rb`      | 1       | SchemaCache class     |
| `connection_adapters/sql_type_metadata.rb` | 1       | SqlTypeMetadata class |
| `connection_adapters/statement_pool.rb`    | 1       | StatementPool class   |

### B6. Migrations and Schema (23 missing)

| Rails file                                  | Missing        | Notes                                            |
| ------------------------------------------- | -------------- | ------------------------------------------------ |
| `migration.rb`                              | 15             | Migration + CheckPending, compatibility versions |
| `migration/command_recorder.rb`             | 2              | CommandRecorder + StraightReversible             |
| `migration/compatibility.rb`                | included above | V7.2, V7.1, V7.0, etc.                           |
| `migration/default_strategy.rb`             | 1              | DefaultStrategy                                  |
| `migration/execution_strategy.rb`           | 1              | ExecutionStrategy                                |
| `migration/pending_migration_connection.rb` | 1              | PendingMigrationConnection                       |
| `schema.rb`                                 | 2              | Schema class                                     |
| `schema_dumper.rb`                          | 3              | SchemaDumper + related                           |
| `internal_metadata.rb`                      | 1              | InternalMetadata                                 |

### B7. Fixtures and Testing (13 missing)

| Rails file                      | Missing | Notes                     |
| ------------------------------- | ------- | ------------------------- |
| `fixtures.rb`                   | 4       | FixtureSet + helpers      |
| `fixture_set/file.rb`           | 1       | Already partially matched |
| `fixture_set/model_metadata.rb` | 1       | ModelMetadata             |
| `fixture_set/render_context.rb` | 1       | RenderContext             |
| `fixture_set/table_row.rb`      | 1       | TableRow                  |
| `fixture_set/table_rows.rb`     | 1       | TableRows                 |
| `test_fixtures.rb`              | 1       | TestFixtures module       |
| `test_databases.rb`             | 1       | TestDatabases module      |
| `testing/query_assertions.rb`   | 2       | QueryAssertions           |

### B8. Middleware and Misc (10 missing)

| Rails file                                         | Missing | Notes                                        |
| -------------------------------------------------- | ------- | -------------------------------------------- |
| `middleware/database_selector.rb`                  | 1       | DatabaseSelector                             |
| `middleware/database_selector/resolver.rb`         | 1       | Resolver                                     |
| `middleware/database_selector/resolver/session.rb` | 1       | Session                                      |
| `middleware/shard_selector.rb`                     | 1       | ShardSelector                                |
| `query_cache.rb`                                   | 2       | QueryCache module                            |
| `query_logs.rb`                                    | 3       | QueryLogs + formatters                       |
| `explain.rb`                                       | 1       | Explain module                               |
| `explain_registry.rb`                              | 1       | ExplainRegistry                              |
| `explain_subscriber.rb`                            | 1       | ExplainSubscriber                            |
| Others                                             | ~5      | RuntimeRegistry, FutureResult, Promise, etc. |

### Workstream B totals

~240 missing classes (after folding ClassMethods into parents). Completing
all of B would move us from 127 to ~367 matched (66%).

---

## Suggested order of attack

### Workstream A priority

1. **A1 (Errors)** — 46 classes, mostly declarations, biggest single-file win
2. **A4 (Relation)** — core query API, high user visibility
3. **A2 (Core modules)** — many already implemented, just need correct exports
4. **A3 (Attribute methods)** — defines how attributes behave
5. **A6 (Types)** — small self-contained classes
6. **A5 (Associations)** — only 7 missing, quick wins
7. **A7-A10** — validations, scoping, encryption, smaller areas

### Workstream B priority

1. **B1 (Abstract adapter)** — foundation for everything else
2. **B2 (SQLite3)** — our primary adapter
3. **B6 (Migrations)** — core schema management
4. **B5 (Adapter infra)** — PoolConfig, Column, SchemaCache
5. **B3 (PostgreSQL)** — large but each OID type is mechanical
6. **B7 (Fixtures/testing)** — useful for our own test infrastructure
7. **B4 (MySQL)** — lower priority
8. **B8 (Middleware/misc)** — lowest priority

---

## Milestones

| Target         | What it takes                                           |
| -------------- | ------------------------------------------------------- |
| **30%** (~167) | A1 (errors) + B1 (abstract adapter) — ~71 classes       |
| **40%** (~222) | + A2 (core modules) + A4 (relation) + B2 (SQLite3)      |
| **50%** (~278) | + A3 (attribute methods) + A6 (types) + B6 (migrations) |
| **75%** (~416) | + A5, A7-A10 + B3 (PostgreSQL) + B5 (adapter infra)     |
| **100%** (555) | + B4 (MySQL) + B7 (fixtures) + B8 (middleware/misc)     |

---

## Fix misplaced first (5 classes, free wins)

These exist but are detected in the wrong file path:

| Current location                  | Expected location                              | Class                         |
| --------------------------------- | ---------------------------------------------- | ----------------------------- |
| `quoting.ts`                      | `connection-adapters/abstract/quoting.ts`      | Quoting                       |
| `enum.ts`                         | `connection-adapters/postgresql/oid/enum.ts`   | Enum (PG OID, name collision) |
| `adapters/postgresql/hstore.ts`   | `connection-adapters/postgresql/oid/hstore.ts` | Hstore                        |
| `adapters/postgresql/uuid.ts`     | `connection-adapters/postgresql/oid/uuid.ts`   | Uuid                          |
| `encryption/cipher/aes256-gcm.ts` | `encryption.ts`                                | Cipher                        |
