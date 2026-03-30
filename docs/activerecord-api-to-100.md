# ActiveRecord API Compare: Road to 100%

Current state: **47.0%** (261/555 classes/modules). Target: 100%.

```bash
pnpm run api:compare -- --package activerecord
```

Note: The compare script folds Ruby's `ClassMethods` concern pattern into the
parent module (their methods become static/class methods on the parent). This
avoids inflating the count with namespace wrappers that have no TS equivalent —
in JS/TS, the filename is the module and static methods live on the class.

This plan splits the remaining 290 missing classes into two independent
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

| Rails file             | Missing | Notes                                                            | Status |
| ---------------------- | ------- | ---------------------------------------------------------------- | ------ |
| `attribute_methods.rb` | 0       | AttributeMethods + LazyAttributeSet + GeneratedAttributeMethods  | ✅     |
| `core.rb`              | 0       | Core + InspectionMask + related                                  | ✅     |
| `dynamic_matchers.rb`  | 3       | DynamicMatchers + Method/FindBy                                  |        |
| `normalization.rb`     | 2       | Normalization + related                                          |        |
| `signed_id.rb`         | 2       | SignedId + related                                               |        |
| `token_for.rb`         | 2       | TokenFor, TokenDefinition, etc.                                  |        |
| `callbacks.rb`         | 0       | Callbacks module                                                 | ✅     |
| `counter_cache.rb`     | 1       | CounterCache module                                              |        |
| `inheritance.rb`       | 0       | Inheritance module                                               | ✅     |
| `insert_all.rb`        | 2       | InsertAll + related                                              |        |
| `model_schema.rb`      | 1       | ModelSchema module                                               |        |
| `no_touching.rb`       | 0       | NoTouching module                                                | ✅     |
| `persistence.rb`       | 1       | Persistence module                                               |        |
| `querying.rb`          | 1       | Querying module                                                  |        |
| `result.rb`            | 2       | Result class                                                     |        |
| `sanitization.rb`      | 0       | Sanitization module                                              | ✅     |
| `schema_migration.rb`  | 0       | SchemaMigration class                                            | ✅     |
| `suppressor.rb`        | 0       | Suppressor module                                                | ✅     |
| `timestamp.rb`         | 1       | Timestamp module                                                 |        |
| Others (1 each)        | ~15     | aggregations, connection_handling, deprecator, integration, etc. |        |

### A3. Attribute Methods (Done ✅)

Sub-modules of `AttributeMethods` that define how model attributes behave.

| Rails file                                   | Missing | Notes                                      | Status |
| -------------------------------------------- | ------- | ------------------------------------------ | ------ |
| `attribute_methods/dirty.rb`                 | 0       | Dirty tracking                             | ✅     |
| `attribute_methods/read.rb`                  | 0       | Attribute reading                          | ✅     |
| `attribute_methods/write.rb`                 | 0       | Attribute writing                          | ✅     |
| `attribute_methods/query.rb`                 | 0       | `user.active?` style queries               | ✅     |
| `attribute_methods/primary_key.rb`           | 0       | Primary key handling                       | ✅     |
| `attribute_methods/before_type_cast.rb`      | 0       | Raw value access                           | ✅     |
| `attribute_methods/serialization.rb`         | 0       | Serialized attributes                      | ✅     |
| `attribute_methods/time_zone_conversion.rb`  | 0       | TZ-aware attributes                        | ✅     |
| `attribute_methods/composite_primary_key.rb` | 0       | Composite PK support                       | ✅     |
| `attributes.rb`                              | 0       | Attribute API (`attribute :name, :string`) | ✅     |

### A4. Relation Layer (9 missing)

The query interface. We have a `Relation` class but it isn't split into the
sub-modules Rails uses.

| Rails file                             | Missing | Notes                            | Status |
| -------------------------------------- | ------- | -------------------------------- | ------ |
| `relation.rb`                          | 2       | Relation + internal classes      |        |
| `relation/query_methods.rb`            | 0       | Already matched (3 classes)      | ✅     |
| `relation/calculations.rb`             | 1       | One class missing                |        |
| `relation/finder_methods.rb`           | 0       | Already matched                  | ✅     |
| `relation/delegation.rb`               | 0       | Delegation module                | ✅     |
| `relation/spawn_methods.rb`            | 0       | SpawnMethods module              | ✅     |
| `relation/where_clause.rb`             | 0       | WhereClause class                | ✅     |
| `relation/from_clause.rb`              | 0       | FromClause class                 | ✅     |
| `relation/query_attribute.rb`          | 0       | QueryAttribute class             | ✅     |
| `relation/batches/batch_enumerator.rb` | 0       | BatchEnumerator class            | ✅     |
| `relation/predicate_builder/*`         | 6       | ArrayHandler, RangeHandler, etc. |        |
| `relation/merger.rb`                   | 0       | Already matched                  | ✅     |

### A5. Associations (4 missing)

Most association classes are already matched (21/21 error classes, all
concrete association types). The gaps are:

| Rails file                                         | Missing | Notes                  | Status |
| -------------------------------------------------- | ------- | ---------------------- | ------ |
| `associations/association.rb`                      | 0       | Base Association class | ✅     |
| `associations/builder/association.rb`              | 0       | Base builder           | ✅     |
| `associations/builder/collection_association.rb`   | 0       | Collection builder     | ✅     |
| `associations/builder/singular_association.rb`     | 0       | Singular builder       | ✅     |
| `associations/join_dependency.rb`                  | 1       | Join dependency class  |        |
| `associations/join_dependency/join_association.rb` | 1       | Join association node  |        |
| `associations/join_dependency/join_base.rb`        | 1       | Join base node         |        |
| `associations/join_dependency/join_part.rb`        | 1       | Join part base class   |        |

### A6. Types (16 missing)

Each type is self-contained: inherit from an ActiveModel type, override
`cast`/`serialize`/`deserialize`.

| Rails file                          | Missing | Notes                            | Status |
| ----------------------------------- | ------- | -------------------------------- | ------ |
| `type/adapter_specific_registry.rb` | 4       | Registration, TypeConflict, etc. |        |
| `type/time.rb`                      | 2       | Time type                        |        |
| `type/date.rb`                      | 1       | Date type                        |        |
| `type/date_time.rb`                 | 1       | DateTime type                    |        |
| `type/json.rb`                      | 1       | JSON type                        |        |
| `type/serialized.rb`                | 1       | Serialized type                  |        |
| `type/text.rb`                      | 1       | Text type                        |        |
| `type/type_map.rb`                  | 1       | TypeMap class                    |        |
| `type/hash_lookup_type_map.rb`      | 1       | HashLookupTypeMap                |        |
| `type/decimal_without_scale.rb`     | 1       | DecimalWithoutScale              |        |
| `type/unsigned_integer.rb`          | 1       | UnsignedInteger                  |        |
| `type/internal/timezone.rb`         | 1       | Timezone mixin                   |        |
| `type.rb`                           | 1       | Top-level Type module            |        |
| `type_caster/connection.rb`         | 1       | TypeCaster::Connection           |        |
| `type_caster/map.rb`                | 1       | TypeCaster::Map                  |        |

### A7. Validations (7 missing)

Thin wrappers around ActiveModel validations with AR-specific behavior.

`validations/absence.rb`, `validations/associated.rb`,
`validations/length.rb`, `validations/numericality.rb`,
`validations/presence.rb`, `validations/uniqueness.rb`,
plus the top-level `validations.rb` module.

### A8. Scoping (Done ✅)

| Rails file           | Missing | Notes                                 | Status |
| -------------------- | ------- | ------------------------------------- | ------ |
| `scoping.rb`         | 0       | Scoping module                        | ✅     |
| `scoping/default.rb` | 0       | Default scope                         | ✅     |
| `scoping/named.rb`   | 0       | Named scopes (`scope :active, -> {}`) | ✅     |
| Others               | 0       | ScopeRegistry, etc.                   | ✅     |

### A9. Encryption (15 missing)

Already have 16 matched classes — good foundation.

| Rails file                               | Missing | Notes                                                     | Status |
| ---------------------------------------- | ------- | --------------------------------------------------------- | ------ |
| `encryption/encryptable_record.rb`       | 1       | EncryptableRecord module                                  |        |
| `encryption/encrypted_attribute_type.rb` | 1       | Type class                                                |        |
| `encryption/configurable.rb`             | 1       | Configurable module                                       |        |
| `encryption/contexts.rb`                 | 1       | Contexts module                                           |        |
| `encryption/errors.rb`                   | 5       | Additional error classes                                  |        |
| Others                                   | 6       | ExtendedDeterministicQueries, Fixtures, MessagePack, etc. |        |

### A10. Smaller areas

| Area                     | Missing | Notes                              | Status |
| ------------------------ | ------- | ---------------------------------- | ------ |
| `locking/optimistic.rb`  | 2       | Optimistic locking                 |        |
| `locking/pessimistic.rb` | 1       | Pessimistic locking                |        |
| `coders/*`               | 4       | ColumnSerializer, JSON, YamlColumn |        |
| `serialization.rb`       | 1       | Serialization module               |        |
| `store.rb`               | 4       | Store, IndifferentCoder, etc.      |        |
| `statement_cache.rb`     | 7       | StatementCache, BindManager, etc.  |        |
| `enum.rb`                | 2       | Enum module                        |        |
| `nested_attributes.rb`   | 1       | NestedAttributes module            |        |
| `delegated_type.rb`      | 1       | Already partially matched          |        |
| `secure_password.rb`     | 0       | SecurePassword module              | ✅     |
| `secure_token.rb`        | 1       | SecureToken module                 |        |
| `translation.rb`         | 1       | Translation module                 |        |

---

## Workstream B: Infrastructure Layer

Database plumbing, adapters, migrations, schema management, fixtures, and
testing utilities. These are the internals that make the model layer work
against real databases.

### B1. Abstract Adapter Layer (Done ✅)

The foundation that all concrete adapters build on.

| Rails file                        | Missing | Notes                                                    | Status |
| --------------------------------- | ------- | -------------------------------------------------------- | ------ |
| `abstract_adapter.rb`             | 0       | AbstractAdapter base class                               | ✅     |
| `abstract/transaction.rb`         | 0       | Transaction, SavepointTransaction, NullTransaction, etc. | ✅     |
| `abstract/connection_pool.rb`     | 0       | Queue, Reaper, BiasableQueue, etc.                       | ✅     |
| `abstract/query_cache.rb`         | 0       | QueryCache, Store, etc.                                  | ✅     |
| `abstract/schema_definitions.rb`  | 0       | Already matched                                          | ✅     |
| `abstract/connection_handler.rb`  | 0       | Already matched                                          | ✅     |
| `abstract/database_limits.rb`     | 0       | DatabaseLimits module                                    | ✅     |
| `abstract/database_statements.rb` | 0       | DatabaseStatements module                                | ✅     |
| `abstract/quoting.rb`             | 0       | Quoting module                                           | ✅     |
| `abstract/savepoints.rb`          | 0       | Savepoints module                                        | ✅     |
| `abstract/schema_creation.rb`     | 0       | SchemaCreation class                                     | ✅     |
| `abstract/schema_statements.rb`   | 0       | SchemaStatements class                                   | ✅     |

### B2. SQLite3 Adapter (Done ✅)

Our primary adapter. Highest priority among concrete adapters.

| Rails file                          | Missing | Notes                  | Status |
| ----------------------------------- | ------- | ---------------------- | ------ |
| `sqlite3_adapter.rb`                | 0       | SQLite3Adapter class   | ✅     |
| `sqlite3/column.rb`                 | 0       | Column class           | ✅     |
| `sqlite3/database_statements.rb`    | 0       | DatabaseStatements     | ✅     |
| `sqlite3/explain_pretty_printer.rb` | 0       | ExplainPrettyPrinter   | ✅     |
| `sqlite3/quoting.rb`                | 0       | Quoting module         | ✅     |
| `sqlite3/schema_creation.rb`        | 0       | SchemaCreation visitor | ✅     |
| `sqlite3/schema_definitions.rb`     | 0       | Schema definitions     | ✅     |
| `sqlite3/schema_dumper.rb`          | 0       | SchemaDumper           | ✅     |
| `sqlite3/schema_statements.rb`      | 0       | SchemaStatements       | ✅     |

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

| Rails file                  | Missing | Notes                                 | Status |
| --------------------------- | ------- | ------------------------------------- | ------ |
| `abstract_mysql_adapter.rb` | 1       | AbstractMysqlAdapter                  |        |
| `mysql2_adapter.rb`         | 1       | Mysql2Adapter                         |        |
| `mysql/*`                   | 9       | Column, Quoting, SchemaCreation, etc. |        |
| `mysql2/*`                  | 1       | DatabaseStatements                    |        |
| `trilogy_adapter.rb`        | 1       | TrilogyAdapter                        |        |
| `trilogy/*`                 | 1       | DatabaseStatements                    |        |

Lower priority — MySQL support isn't the primary target right now.

### B5. Other Adapter Infrastructure (Done ✅)

| Rails file                                 | Missing | Notes                 | Status |
| ------------------------------------------ | ------- | --------------------- | ------ |
| `connection_adapters.rb`                   | 0       | Top-level module      | ✅     |
| `connection_adapters/column.rb`            | 0       | Base Column class     | ✅     |
| `connection_adapters/deduplicable.rb`      | 0       | Deduplicable mixin    | ✅     |
| `connection_adapters/pool_config.rb`       | 0       | PoolConfig class      | ✅     |
| `connection_adapters/pool_manager.rb`      | 0       | PoolManager class     | ✅     |
| `connection_adapters/schema_cache.rb`      | 0       | SchemaCache class     | ✅     |
| `connection_adapters/sql_type_metadata.rb` | 0       | SqlTypeMetadata class | ✅     |
| `connection_adapters/statement_pool.rb`    | 0       | StatementPool class   | ✅     |

### B6. Migrations and Schema (18 missing)

| Rails file                                  | Missing | Notes                                | Status |
| ------------------------------------------- | ------- | ------------------------------------ | ------ |
| `migration.rb`                              | 0       | Migration + CheckPending             | ✅     |
| `migration/command_recorder.rb`             | 0       | CommandRecorder + StraightReversible | ✅     |
| `migration/compatibility.rb`                | 18      | V7.2, V7.1, V7.0, etc.               |        |
| `migration/default_strategy.rb`             | 0       | DefaultStrategy                      | ✅     |
| `migration/execution_strategy.rb`           | 0       | ExecutionStrategy                    | ✅     |
| `migration/pending_migration_connection.rb` | 0       | PendingMigrationConnection           | ✅     |
| `schema.rb`                                 | 0       | Schema class                         | ✅     |
| `schema_dumper.rb`                          | 0       | SchemaDumper + related               | ✅     |
| `internal_metadata.rb`                      | 0       | InternalMetadata                     | ✅     |

### B7. Fixtures and Testing (Done ✅)

| Rails file                      | Missing | Notes                | Status |
| ------------------------------- | ------- | -------------------- | ------ |
| `fixtures.rb`                   | 0       | FixtureSet + helpers | ✅     |
| `fixture_set/file.rb`           | 0       | Already matched      | ✅     |
| `fixture_set/model_metadata.rb` | 0       | ModelMetadata        | ✅     |
| `fixture_set/render_context.rb` | 0       | RenderContext        | ✅     |
| `fixture_set/table_row.rb`      | 0       | TableRow             | ✅     |
| `fixture_set/table_rows.rb`     | 0       | TableRows            | ✅     |
| `test_fixtures.rb`              | 0       | TestFixtures module  | ✅     |
| `test_databases.rb`             | 0       | TestDatabases module | ✅     |
| `testing/query_assertions.rb`   | 0       | QueryAssertions      | ✅     |

### B8. Middleware and Misc (10 missing)

| Rails file                                         | Missing | Notes                                        | Status |
| -------------------------------------------------- | ------- | -------------------------------------------- | ------ |
| `middleware/database_selector.rb`                  | 1       | DatabaseSelector                             |        |
| `middleware/database_selector/resolver.rb`         | 1       | Resolver                                     |        |
| `middleware/database_selector/resolver/session.rb` | 1       | Session                                      |        |
| `middleware/shard_selector.rb`                     | 1       | ShardSelector                                |        |
| `query_cache.rb`                                   | 2       | QueryCache module                            |        |
| `query_logs.rb`                                    | 3       | QueryLogs + formatters                       |        |
| `explain.rb`                                       | 1       | Explain module                               |        |
| `explain_registry.rb`                              | 1       | ExplainRegistry                              |        |
| `explain_subscriber.rb`                            | 1       | ExplainSubscriber                            |        |
| Others                                             | ~5      | RuntimeRegistry, FutureResult, Promise, etc. |        |

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
| -------------- | ------------------------------------------------------- | --- |
| **30%** (~167) | A1 (errors) + B1 (abstract adapter) — ~71 classes       | ✅  |
| **40%** (~222) | + A2 (core modules) + A4 (relation) + B2 (SQLite3)      | ✅  |
| **50%** (~278) | + A3 (attribute methods) + A6 (types) + B6 (migrations) |     |
| **75%** (~416) | + A5, A7-A10 + B3 (PostgreSQL) + B5 (adapter infra)     |     |
| **100%** (555) | + B4 (MySQL) + B7 (fixtures) + B8 (middleware/misc)     |     |

---

## Fix misplaced first (5 classes, free wins)

These exist but are detected in the wrong file path:

| Current location                  | Expected location                              | Class                         |
| --------------------------------- | ---------------------------------------------- | ----------------------------- |
| `quoting.ts`                      | `connection-adapters/abstract/quoting.ts`      | Quoting (FIXED ✅)            |
| `enum.ts`                         | `connection-adapters/postgresql/oid/enum.ts`   | Enum (PG OID, name collision) |
| `adapters/postgresql/hstore.ts`   | `connection-adapters/postgresql/oid/hstore.ts` | Hstore (FIXED ✅)             |
| `adapters/postgresql/uuid.ts`     | `connection-adapters/postgresql/oid/uuid.ts`   | Uuid (FIXED ✅)               |
| `encryption/cipher/aes256-gcm.ts` | `encryption.ts`                                | Cipher                        |
