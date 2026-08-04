# Mixin parity-gap triage (RFC 0072)

Triage of the data-layer parity gaps that became visible when PR #5334 taught
`resolveModuleName` to resolve partially-qualified `include`/`extend` names
(`include PostgreSQL::Quoting` inside `module ActiveRecord::ConnectionAdapters`).
Because `resolveModuleName` also feeds `flattenIncludedMethodInfos`, that
expanded the Rails-side **expected** surface, and the story
`triage-newly-visible-mixin-parity-gaps` was filed to split the newly-visible
gaps into "really unported" / "mis-attributed" / "out of scope" before anyone
sized porting work.

Measured on 2026-08-04 from `scripts/api-compare/output/` after a full
`pnpm build` + `pnpm api:compare`:

```
Data layer: 7729/7816 methods (98.9%)  |  files: 409/409
```

so the data layer carries **87** missing methods, not the 258/93 the story
quoted — the intervening year of porting absorbed the rest.

## The finding

**85 of the 87 are already ported, in the TS file that mirrors the mixin's own
Ruby file.** They are reported missing only because the flattening re-expects
every mixed-in method in each _host_ file as well:
`PostgreSQL::Quoting#escape_bytea` is expected in both
`connection_adapters/postgresql/quoting.rb` (where trails ports it, as
`connection-adapters/postgresql/quoting.ts`, and where it matches) and again in
`connection_adapters/postgresql_adapter.rb` (where trails does not repeat it,
because Rails does not either). The host copy is a duplicate expectation, so
the same method is counted twice in the denominator and once in the numerator.

That is a comparator-attribution defect, not a porting gap, and it is why the
old data-layer 100% and the current 98.9% are both artifacts. Crediting the 85
puts the data layer at **7814/7816 (99.97%)** — the known floor asked for by the
story's last acceptance criterion.

## Groups

Every group below is `<count> | <ruby file> | <host> | <mixin that defines it>`.
"ported at" is the TS file the method is actually implemented in.

| n   | host file                                              | mixin                                 | verdict                                                                                                       |
| --- | ------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 18  | `base.rb`                                              | `Encryption::EncryptableRecord`       | mis-attributed — `encryption/encryptable-record.ts` (of 19; the 19th is below)                                |
| 5   | `base.rb`                                              | `Delegation::DelegateCache`           | mis-attributed — `relation/delegation.ts`                                                                     |
| 3   | `base.rb`                                              | `Aggregations::ClassMethods`          | mis-attributed — `aggregations.ts`                                                                            |
| 1   | `base.rb`                                              | `Encryption::EncryptableRecord`       | **unported** — `encrypted_attributes?`                                                                        |
| 8   | `connection_adapters/postgresql_adapter.rb`            | `PostgreSQL::Quoting`                 | mis-attributed — `postgresql/quoting.ts`                                                                      |
| 4   | `connection_adapters/postgresql_adapter.rb`            | `PostgreSQL::DatabaseStatements`      | mis-attributed — `postgresql/database-statements.ts`                                                          |
| 1   | `connection_adapters/postgresql_adapter.rb`            | `PostgreSQL::Quoting` (`infinity?`)   | mis-attributed — `postgresql/quoting.ts`                                                                      |
| 8   | `connection_adapters/abstract_mysql_adapter.rb`        | `MySQL::SchemaStatements`             | mis-attributed — `mysql/schema-statements.ts`                                                                 |
| 2   | `connection_adapters/abstract_mysql_adapter.rb`        | `MySQL::DatabaseStatements`           | mis-attributed — `mysql/database-statements.ts`                                                               |
| 1   | `connection_adapters/mysql2_adapter.rb`                | `Mysql2::DatabaseStatements`          | mis-attributed — `mysql2/database-statements.ts`                                                              |
| 1   | `connection_adapters/mysql2_adapter.rb`                | `Mysql2::DatabaseStatements`          | **name divergence** — `multi_statements_enabled?` is `multiStatementsEnabled`, not `isMultiStatementsEnabled` |
| 4   | `connection_adapters/sqlite3_adapter.rb`               | `SQLite3::SchemaStatements`           | mis-attributed — `sqlite3/schema-statements.ts`                                                               |
| 1   | `connection_adapters/postgresql/schema_definitions.rb` | own (`TableDefinition`)               | mis-attributed — `abstract/schema-definitions.ts` (inherited)                                                 |
| 3   | `type/{date,date_time,time}.rb` (AR)                   | `Type::Internal::Timezone`            | mis-attributed — `type/internal/timezone.ts`                                                                  |
| 8   | `type/{date,date_time,time}.rb` (AM)                   | `Type::Helpers::{Timezone,TimeValue}` | mis-attributed — `type/helpers/*.ts`                                                                          |
| 19  | `type/{decimal,float,integer}.rb` (AM)                 | `Type::Helpers::Numeric`              | mis-attributed — `type/helpers/numeric.ts`                                                                    |

Totals: **85 mis-attributed, 1 genuinely unported, 1 name divergence.** Nothing
in the data layer falls into "out of scope per `unported-files.ts`" — the
out-of-scope hosts were already excluded before the flattening ran.

## What was filed

- `credit-mixin-methods-ported-in-their-own-file` (RFC 0072) — the comparator
  fix: a flattened mixin method already matched in the file mirroring the
  mixin's own Ruby file must not be re-expected in each host.
- `port-encryptable-record-encrypted-attributes-predicate` (RFC 0072) — the one
  genuinely unported method.
- `rename-multi-statements-enabled-to-conventions-predicate` (RFC 0072) — the
  `is`-prefix predicate rename.

No exclusion-file rows were added: 85 duplicate expectations are a defect in the
expected surface, and baselining them would ratify it.
