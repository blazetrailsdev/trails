# ActiveRecord API Compare: Road to 100%

Current state: **70.8%** (393/555 classes/modules). Target: 100%.

```bash
pnpm run api:compare -- --package activerecord
```

Note: The compare script folds Ruby's `ClassMethods` concern pattern into the
parent module (their methods become static/class methods on the parent). This
avoids inflating the count with namespace wrappers that have no TS equivalent —
in JS/TS, the filename is the module and static methods live on the class.

162 classes/modules remain. 5 are misplaced (exist but in the wrong file).

---

## Fully Matched Areas (✅)

These workstreams have zero missing classes.

- **Associations** — all 42 classes including builders, join dependency, preloader, errors
- **Attribute Methods** — all 12 sub-modules (dirty, read, write, query, PK, before_type_cast, serialization, time zone, composite PK, attributes)
- **Abstract Adapter Layer** — all 38 classes (connection pool, transaction, query cache, schema definitions, etc.)
- **SQLite3 Adapter** — all 12 classes (adapter, column, statements, quoting, schema)
- **PostgreSQL Adapter** — all 35 classes including 26 OID types, schema, quoting, utils
- **Fixtures & Testing** — all 12 classes (FixtureSet, File, TableRow, TableRows, TestFixtures, QueryAssertions)
- **Scoping** — all 5 classes (default, named, ScopeRegistry)
- **Validations** — all 7 classes (absence, associated, length, numericality, presence, uniqueness)
- **Types** — all 16 classes (date, time, datetime, json, text, serialized, type map, etc.)
- **Other Adapter Infrastructure** — all 8 classes (Column, Deduplicable, PoolConfig, PoolManager, SchemaCache, SqlTypeMetadata, StatementPool)
- **Core/Base** — Core, Base, Callbacks, Inheritance, NoTouching, Sanitization, SchemaMigration, Suppressor, Integration, Transactions, SecurePassword

## Nearly Complete Areas

- **Reflection** — 9 of 12 classes (3 missing: PolymorphicReflection, RuntimeReflection, Reflection module)
- **Encryption** — 28 of 30 classes (2 missing: top-level module export, Cipher misplaced)
- **Relation Query Layer** — 22 of 25 classes (3 missing: 2 Relation internals, 1 Calculations class)
- **Migrations** — 22 of 40 classes (18 missing are all version compatibility classes: V7.2, V7.1, V7.0, etc.)

---

## Remaining Work: 162 missing + 5 misplaced

### Errors (12 missing in `errors.rb`)

43/55 matched. The 12 remaining are adapter-specific errors (PostgreSQL/MySQL
exception translation) and features not yet implemented:

| Missing class                             | Blocked by                                     |
| ----------------------------------------- | ---------------------------------------------- |
| `TableNotSpecified`                       | No use case — our tableName always infers      |
| `MismatchedForeignKey`                    | PostgreSQL adapter exception translation       |
| `RangeError` / `ActiveRecordRangeError`   | PostgreSQL/MySQL adapter exception translation |
| `SQLWarning`                              | MySQL warning capture                          |
| `ExclusiveConnectionTimeoutError`         | Exclusive connection lock mechanism            |
| `DatabaseAlreadyExists`                   | `db:create` tasks                              |
| `PreparedStatementCacheExpired`           | Prepared statement caching                     |
| `MultiparameterAssignmentErrors`          | HTML form multi-param assignment               |
| `UnknownAttributeReference`               | `disallow_raw_sql!` implementation             |
| `AsynchronousQueryInsideTransactionError` | Async query support                            |
| `UnmodifiableRelation`                    | Relation freezing                              |
| `DatabaseVersionError`                    | DB version checking                            |

### Reflection (3 missing in `reflection.rb`)

9/12 matched. Full class hierarchy implemented with Arel-based join
scope building (`joinScope`, `buildScope`, `joinScopes`, `klassJoinScope`).

Missing:

- `PolymorphicReflection` — created during join scope building for polymorphic through associations
- `RuntimeReflection` — internal optimization, wraps reflection with runtime association instance
- `Reflection` module — top-level container module

Known gap: `foreignKey` derivation does not yet handle composite primary
keys or `queryConstraints`. Associations with CPK will report incorrect
foreign keys in reflection. This should be addressed when CPK association
support is fully implemented.

### Migration Compatibility (18 missing in `migration/compatibility.rb`)

1 of 19 matched. These are versioned migration classes (V7.2, V7.1, V7.0,
V6.1, etc.) that maintain backwards compatibility for older migration files.

### MySQL/MariaDB Adapter (14 missing)

| Rails file                       | Missing | Notes                                                                                                                    |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `abstract_mysql_adapter.rb`      | 2       | AbstractMysqlAdapter + related                                                                                           |
| `mysql2_adapter.rb`              | 1       | Mysql2Adapter (misplaced)                                                                                                |
| `mysql/*`                        | 10      | Column, Quoting, SchemaCreation, SchemaDefinitions (3), SchemaDumper, SchemaStatements, TypeMetadata, DatabaseStatements |
| `trilogy_adapter.rb`             | 1       | TrilogyAdapter                                                                                                           |
| `trilogy/database_statements.rb` | 1       | DatabaseStatements                                                                                                       |

### Statement Cache (7 missing in `statement_cache.rb`)

Prepared statement caching infrastructure — StatementCache, BindManager,
PartialQuery, etc.

### Store (4 missing in `store.rb`)

1 of 5 matched. Missing: Store, IndifferentCoder, IndifferentHashAccessor,
HashAccessor.

### Middleware (4 missing)

| Rails file                                         | Missing              |
| -------------------------------------------------- | -------------------- |
| `middleware/database_selector.rb`                  | 1 — DatabaseSelector |
| `middleware/database_selector/resolver.rb`         | 1 — Resolver         |
| `middleware/database_selector/resolver/session.rb` | 1 — Session          |
| `middleware/shard_selector.rb`                     | 1 — ShardSelector    |

### Message Pack / Marshalling / Future (10 missing)

| Rails file         | Missing | Notes                           |
| ------------------ | ------- | ------------------------------- |
| `future_result.rb` | 4       | FutureResult, EventBuffer, etc. |
| `message_pack.rb`  | 4       | MessagePack encoder/decoder     |
| `marshalling.rb`   | 2       | Marshalling module              |

### Smaller Gaps (1-3 missing each)

| Rails file                                           | Missing | Notes                                              |
| ---------------------------------------------------- | ------- | -------------------------------------------------- |
| `relation.rb`                                        | 2       | Additional Relation internals                      |
| `relation/calculations.rb`                           | 1       | One class missing                                  |
| `dynamic_matchers.rb`                                | 3       | DynamicMatchers, Method, FindBy                    |
| `coders/*`                                           | 3       | ColumnSerializer (misplaced), JSON, YAMLColumn (2) |
| `enum.rb`                                            | 2       | EnumType, additional module                        |
| `normalization.rb`                                   | 2       | Normalization module                               |
| `signed_id.rb`                                       | 2       | SignedId module                                    |
| `token_for.rb`                                       | 2       | TokenFor, TokenDefinition                          |
| `insert_all.rb`                                      | 2       | InsertAll, related                                 |
| `locking/optimistic.rb`                              | 2       | Optimistic locking                                 |
| `destroy_association_async_job.rb`                   | 2       | AsyncJob                                           |
| `query_cache.rb`                                     | 2       | QueryCache module                                  |
| `query_logs_formatter.rb`                            | 2       | Formatter classes                                  |
| `promise.rb`                                         | 2       | Promise, related                                   |
| `result.rb`                                          | 2       | Result class                                       |
| `readonly_attributes.rb`                             | 3       | ReadonlyAttributes module                          |
| `asynchronous_queries_tracker.rb`                    | 2       | Tracker                                            |
| `encryption.rb`                                      | 1       | Top-level Encryption module (misplaced)            |
| `encryption/cipher/aes256_gcm.rb`                    | 1       | Cipher (misplaced)                                 |
| `autosave_association.rb`                            | 1       | AutosaveAssociation module                         |
| `connection_handling.rb`                             | 1       | ConnectionHandling module                          |
| `counter_cache.rb`                                   | 1       | CounterCache module                                |
| `database_configurations.rb`                         | 1       | DatabaseConfigurations partial                     |
| `database_configurations/connection_url_resolver.rb` | 1       | ConnectionUrlResolver                              |
| `delegated_type.rb`                                  | 1       | DelegatedType partial                              |
| `deprecator.rb`                                      | 1       | Deprecator                                         |
| `disable_joins_association_relation.rb`              | 1       | DisableJoinsAssociationRelation                    |
| `association_relation.rb`                            | 1       | AssociationRelation                                |
| `aggregations.rb`                                    | 1       | Aggregations module                                |
| `model_schema.rb`                                    | 1       | ModelSchema module                                 |
| `nested_attributes.rb`                               | 1       | NestedAttributes partial                           |
| `persistence.rb`                                     | 1       | Persistence module                                 |
| `querying.rb`                                        | 1       | Querying module                                    |
| `query_logs.rb`                                      | 3       | QueryLogs partial                                  |
| `secure_token.rb`                                    | 1       | SecureToken partial                                |
| `serialization.rb`                                   | 1       | Serialization module                               |
| `table_metadata.rb`                                  | 1       | TableMetadata                                      |
| `timestamp.rb`                                       | 1       | Timestamp module                                   |
| `touch_later.rb`                                     | 1       | TouchLater module                                  |
| `transaction.rb`                                     | 1       | Transaction module                                 |
| `translation.rb`                                     | 1       | Translation module                                 |
| `locking/pessimistic.rb`                             | 1       | Pessimistic locking                                |
| `explain.rb`                                         | 1       | Explain module                                     |
| `explain_registry.rb`                                | 1       | ExplainRegistry                                    |
| `explain_subscriber.rb`                              | 1       | ExplainSubscriber                                  |
| `log_subscriber.rb`                                  | 1       | LogSubscriber                                      |
| `legacy_yaml_adapter.rb`                             | 1       | LegacyYamlAdapter                                  |
| `runtime_registry.rb`                                | 1       | RuntimeRegistry                                    |
| `railtie.rb`                                         | 1       | Railtie                                            |
| `railties/controller_runtime.rb`                     | 1       | ControllerRuntime                                  |
| `tasks/database_tasks.rb`                            | 1       | DatabaseTasks partial                              |
| `tasks/*_database_tasks.rb`                          | 3       | MySQL, PostgreSQL, SQLite task runners             |

---

## Misplaced (5 classes — need to move)

| Current location                  | Expected location                           | Class                           |
| --------------------------------- | ------------------------------------------- | ------------------------------- |
| `encryption/cipher/aes256-gcm.ts` | `encryption.ts`                             | Cipher                          |
| `errors.ts`                       | `validations.ts`                            | RecordInvalid                   |
| `adapters/postgresql-adapter.ts`  | `connection-adapters/postgresql-adapter.ts` | PostgreSQLAdapter (1 misplaced) |
| `adapters/mysql2-adapter.ts`      | `connection-adapters/mysql2-adapter.ts`     | Mysql2Adapter                   |
| `coders/column-serializer.ts`     | correct path but misplaced internally       | ColumnSerializer                |

---

## Milestones

| Target         | What it takes                                         | Status |
| -------------- | ----------------------------------------------------- | ------ |
| **30%** (~167) | Errors + abstract adapter                             | ✅     |
| **40%** (~222) | + core modules + relation + SQLite3                   | ✅     |
| **50%** (~278) | + attribute methods + types + migrations              | ✅     |
| **60%** (~333) | + PostgreSQL + encryption + associations              | ✅     |
| **70%** (~389) | + fixtures + predicate builder + adapter infra        | ✅     |
| **75%** (~416) | + reflection + migration compat + store               |        |
| **80%** (~444) | + MySQL adapter + statement cache + remaining modules |        |
| **90%** (~500) | + middleware + message pack + async + remaining gaps  |        |
| **100%** (555) | + all remaining 1-class gaps                          |        |

---

## Suggested priority

1. **Reflection** (10 missing) — high-value, used by associations and introspection
2. **Remaining module exports** (~20 × 1 class) — many are already implemented in `base.ts` but not exported from the correct file path
3. **Store** (4 missing) — self-contained, popular Rails feature
4. **Errors** (12 remaining) — blocked by adapter work, tackle as adapters are built
5. **Migration Compatibility** (18 missing) — mechanical but large, low user impact
6. **MySQL Adapter** (14 missing) — needed for MySQL/MariaDB support
7. **Statement Cache** (7 missing) — performance infrastructure
8. **Middleware** (4 missing) — database selector, shard selector
9. **Message Pack / Marshalling / Future** (10 missing) — lowest priority
