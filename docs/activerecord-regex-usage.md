# ActiveRecord: Regex Usage Audit

Comparison of regex usage in our activerecord source files (excluding tests)
vs Rails activerecord `lib/` (excluding tests). Rails v8.0.2.

## Summary

|                        | BlazeTrails                | Rails                                |
| ---------------------- | -------------------------- | ------------------------------------ |
| **Total regex usages** | ~120 (+24 in test-adapter) | ~130                                 |
| **Files with regex**   | ~35                        | ~53                                  |
| **Heaviest file**      | relation.ts (22)           | postgresql/schema_statements.rb (14) |

## BlazeTrails ActiveRecord

### base.ts

| Line | Method             | Pattern                   |
| ---- | ------------------ | ------------------------- |
| 108  | `quoteLiteral`     | `.replace(/'/g, "''")`    |
| 110  | `quoteLiteral`     | `.replace(/'/g, "''")`    |
| 111  | `quoteLiteral`     | `.replace(/'/g, "''")`    |
| 1039 | `computeTableName` | `.replace(/^./, ...)`     |
| 1040 | `computeTableName` | `.replace(/[A-Z]/g, ...)` |
| 2671 | `_whereClausesFor` | `.replace(/'/g, "''")`    |
| 2672 | `_whereClausesFor` | `.replace(/'/g, "''")`    |

### relation.ts

| Line | Method                  | Pattern                                       |
| ---- | ----------------------- | --------------------------------------------- |
| 180  | `toSql`                 | `.replace(/'/g, "''")`                        |
| 181  | `toSql`                 | `new RegExp(`:${name}\\b`, "g")`              |
| 195  | `toSql`                 | `.replace(/'/g, "''")`                        |
| 524  | `order`                 | `/^(asc\|desc)$/i.test(...)`                  |
| 656  | `having`                | `.replace(/'/g, "''")`                        |
| 704  | `reverseOrder`          | `.match(/^([\w.]+)\s+(ASC\|DESC)$/i)`         |
| 711  | `reverseOrder`          | `/[(),]/.test(...)` + `/\bCASE\b/i.test(...)` |
| 739  | `_buildWhereClause`     | `.replace(/'/g, "''")`                        |
| 2603 | `_buildSelectSql`       | `.replace(/FROM\s+"[^"]+"/, ...)`             |
| 2719 | `_reverseOrderValue`    | `/\bcase\b/i.test(...)`                       |
| 2723 | `_reverseOrderValue`    | `.match(/^([\w.]+)\s+(ASC\|DESC)$/i)`         |
| 2775 | `_buildWhereConditions` | `.replace(/'/g, "''")`                        |
| 2779 | `_buildWhereConditions` | `.replace(/'/g, "''")`                        |
| 2794 | `_buildWhereConditions` | `.replace(/'/g, "''")`                        |
| 2799 | `_buildWhereConditions` | `.replace(/'/g, "''")`                        |
| 2812 | `_buildWhereConditions` | `.replace(/'/g, "''")`                        |
| 2816 | `_buildWhereConditions` | `.replace(/'/g, "''")`                        |
| 2827 | `_buildWhereConditions` | `.replace(/'/g, "''")`                        |
| 2832 | `_buildWhereConditions` | `.replace(/'/g, "''")`                        |
| 2875 | `_inferTableName`       | `.replace(/([A-Z]+)([A-Z][a-z])/g, ...)`      |
| 2876 | `_inferTableName`       | `.replace(/([a-z\d])([A-Z])/g, ...)`          |

### connection-adapters/sqlite3-adapter.ts

| Line | Method              | Pattern                                  |
| ---- | ------------------- | ---------------------------------------- |
| 229  | `initializeTypeMap` | `.replace(/\(.*\)/, "")`                 |
| 255  | `initializeTypeMap` | `registerType(/int/i, ...)`              |
| 256  | `initializeTypeMap` | `/bigint/i.test(...)`                    |
| 259  | `initializeTypeMap` | `registerType(/char\|clob/i, ...)`       |
| 260  | `initializeTypeMap` | `registerType(/blob/i, ...)`             |
| 261  | `initializeTypeMap` | `registerType(/real\|floa\|doub/i, ...)` |

### connection-adapters/abstract/schema-dumper.ts

| Line | Method          | Pattern                                                          |
| ---- | --------------- | ---------------------------------------------------------------- |
| 125  | `columnSpecSql` | `.match(/^(?:character varying\|varchar)\((\d+)\)$/)`            |
| 129  | `columnSpecSql` | `.match(/^(?:character\|char\|bpchar)\((\d+)\)$/)`               |
| 131  | `columnSpecSql` | `.match(/^(?:numeric\|decimal)\((\d+),\s*(\d+)\)$/)`             |
| 135  | `columnSpecSql` | `.match(/^timestamp(\(\d+\))?\s+(with(?:out)?\s+time\s+zone)$/)` |
| 139  | `columnSpecSql` | `.match(/^time(\(\d+\))?\s+(with(?:out)?\s+time\s+zone)$/)`      |
| 161  | `schemaDefault` | `.match(/^'((?:[^']\|'')*)'(::[\w\s."[\](),]+)+$/)`              |
| 163  | `schemaDefault` | `.replace(/''/g, "'")`                                           |
| 186  | `schemaDefault` | `.match(/^\(?(-?\d+(?:\.\d+)?)\)?(::[\w\s."[\](),]+)+$/)`        |

### adapters/postgresql-adapter.ts

| Line | Method                | Pattern                                                           |
| ---- | --------------------- | ----------------------------------------------------------------- |
| 42   | `execRaw`             | `.replace(/\?/g, ...)`                                            |
| 329  | `columnsForDistinct`  | `.replace(/\s+(ASC\|DESC)\s*(NULLS\s+(FIRST\|LAST))?\s*/gi, ...)` |
| 436  | `indexes`             | `.match(/\(([^)]+)\)/)`                                           |
| 443  | `indexes`             | `.match(/\bDESC\b/i)`                                             |
| 547  | `newColumnFromField`  | `.match(/nextval\('([^']+)'::regclass\)/)`                        |
| 768  | `addIndex`            | `.replace(/[."]/g, "_")`                                          |
| 1085 | `changeColumnDefault` | `.replace(/'/g, "''")`                                            |

### connection-adapters/abstract/schema-statements.ts

| Line | Method            | Pattern                      |
| ---- | ----------------- | ---------------------------- |
| 293  | `addColumn`       | `.replace(/^ DEFAULT /, "")` |
| 341  | `addReference`    | `.replace(/s$/, "")`         |
| 364  | `removeReference` | `.replace(/s$/, "")`         |
| 444  | `createJoinTable` | `.replace(/s$/, "")`         |
| 445  | `createJoinTable` | `.replace(/s$/, "")`         |
| 519  | `columns`         | `.replace(/^_/, "")`         |

### connection-adapters/abstract/quoting.ts

| Line | Method            | Pattern                   |
| ---- | ----------------- | ------------------------- |
| 9    | `quoteIdentifier` | `.replace(/\`/g, "\`\`")` |
| 11   | `quoteIdentifier` | `.replace(/"/g, '""')`    |
| 39   | `quoteValue`      | `.replace(/'/g, "''")`    |
| 42   | `quoteValue`      | `.replace(/'/g, "''")`    |
| 44   | `quoteValue`      | `.replace(/'/g, "''")`    |

### connection-adapters/postgresql/quoting.ts

| Line | Method            | Pattern                                       |
| ---- | ----------------- | --------------------------------------------- |
| 62   | `quoteColumnName` | `.replace(/""/g, '"')`                        |
| 64   | `quoteColumnName` | `.replace(/"/g, '""')`                        |
| 97   | `quoteTableName`  | `.replace(/"/g, '""')`                        |
| 102  | `quoteString`     | `.replace(/\\/g, "\\\\").replace(/'/g, "''")` |
| 104  | `quoteString`     | `.replace(/'/g, "''")`                        |

### connection-adapters/mysql/quoting.ts

| Line | Method                 | Pattern                                 |
| ---- | ---------------------- | --------------------------------------- |
| 57   | `mysqlQuoteColumnName` | `.replace(/\`/g, "\`\`")`               |
| 61   | (module level)         | `MYSQL_ESCAPE_RE = /[\\\x00\n\r\x1a]/g` |
| 78   | `mysqlQuoteString`     | `.replace(/'/g, "''")`                  |

### connection-adapters/sqlite3/quoting.ts

| Line | Method                   | Pattern                |
| ---- | ------------------------ | ---------------------- |
| 46   | `sqlite3QuoteTableName`  | `.replace(/"/g, '""')` |
| 51   | `sqlite3QuoteColumnName` | `.replace(/"/g, '""')` |
| 55   | `sqlite3QuoteString`     | `.replace(/'/g, "''")` |

### adapters/mysql2-adapter.ts

| Line | Method       | Pattern                          |
| ---- | ------------ | -------------------------------- |
| 58   | `mysqlQuote` | `.split(/('(?:[^'\\]\|\\.)*')/)` |
| 60   | `mysqlQuote` | `.replace(/"/g, "\`")`           |
| 65   | `mysqlQuote` | `/\bOFFSET\b/i.test(...)`        |
| 66   | `mysqlQuote` | `.replace(/\bOFFSET\b/i, ...)`   |

### sanitization.ts

| Line | Method             | Pattern                                                     |
| ---- | ------------------ | ----------------------------------------------------------- |
| 17   | `sanitizeSqlArray` | `.match(/\?/g)`                                             |
| 51   | `sanitizeSqlLike`  | `new RegExp(...)` + `.replace(/[.*+?^${}()\|[\]\\]/g, ...)` |
| 54   | `sanitizeSqlLike`  | `.replace(/%/g, ...)`                                       |
| 55   | `sanitizeSqlLike`  | `.replace(/_/g, ...)`                                       |

### associations/join-dependency.ts

| Line | Method                | Pattern                                                  |
| ---- | --------------------- | -------------------------------------------------------- |
| 183  | `buildJoinSql`        | `.match(/\bWHERE\s+(.+?)(?:\s+ORDER\|\s+LIMIT\|\s*$)/i)` |
| 186  | `buildJoinSql`        | `new RegExp(...)`                                        |
| 506  | `makeJoinConstraints` | `.match(/\bWHERE\s+(.+?).../)`                           |
| 509  | `makeJoinConstraints` | `new RegExp(...)`                                        |

### associations/join-dependency/join-part.ts

| Line | Method        | Pattern              |
| ---- | ------------- | -------------------- |
| 45   | `instantiate` | `.match(/^t(\d+)$/)` |
| 47   | `instantiate` | `new RegExp(...)`    |

### connection-adapters/postgresql/oid/interval.ts

| Line | Method | Pattern                                           |
| ---- | ------ | ------------------------------------------------- |
| 60   | `cast` | `.match(/(-?\d+)\s*years?/i)`                     |
| 63   | `cast` | `.match(/(-?\d+)\s*mons?(?:ths?)?/i)`             |
| 66   | `cast` | `.match(/(-?\d+)\s*days?/i)`                      |
| 69   | `cast` | `.match(/(-?\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)/)` |

### connection-adapters/postgresql/oid/uuid.ts

| Line | Method         | Pattern                                 |
| ---- | -------------- | --------------------------------------- |
| 14   | (module level) | `UUID_REGEX = /^\{?[0-9a-f]{8}-?...$/i` |
| 33   | `cast`         | `.replace(/[{}-]/g, "")`                |

### connection-adapters/postgresql/oid/hstore.ts

| Line | Method         | Pattern                                        |
| ---- | -------------- | ---------------------------------------------- |
| 89   | `escapeHstore` | `.replace(/\\/g, "\\\\").replace(/"/g, '\\"')` |

### connection-adapters/postgresql/oid/array.ts

| Line | Method             | Pattern                                        |
| ---- | ------------------ | ---------------------------------------------- |
| 47   | `serializeElement` | `.replace(/\\/g, "\\\\").replace(/"/g, '\\"')` |

### connection-adapters/postgresql/oid/point.ts

| Line | Method | Pattern                 |
| ---- | ------ | ----------------------- |
| 50   | `cast` | `.replace(/[()]/g, "")` |

### connection-adapters/postgresql/oid/legacy-point.ts

| Line | Method | Pattern                 |
| ---- | ------ | ----------------------- |
| 38   | `cast` | `.replace(/[()]/g, "")` |

### connection-adapters/postgresql/oid/vector.ts

| Line | Method | Pattern                  |
| ---- | ------ | ------------------------ |
| 36   | `cast` | `.replace(/[[\]]/g, "")` |

### connection-adapters/postgresql/oid/money.ts

| Line | Method      | Pattern                   |
| ---- | ----------- | ------------------------- |
| 31   | `castValue` | `.replace(/[$,\s]/g, "")` |

### connection-adapters/postgresql/utils.ts

| Line | Method        | Pattern                |
| ---- | ------------- | ---------------------- |
| 25   | `quotedName`  | `.replace(/"/g, '""')` |
| 57   | `unquotePart` | `.replace(/""/g, '"')` |

### connection-adapters/postgresql-adapter.ts

| Line | Method      | Pattern                   |
| ---- | ----------- | ------------------------- |
| 24   | `castValue` | `.replace(/[$,\s]/g, "")` |

### adapters/postgresql/pg-range.ts

| Line | Method  | Pattern                                       |
| ---- | ------- | --------------------------------------------- |
| 76   | `parse` | `.replace(/""/g, '"').replace(/\\\\/g, "\\")` |

### adapters/postgresql/geometric.ts

| Line | Method       | Pattern                                             |
| ---- | ------------ | --------------------------------------------------- |
| 45   | `parsePoint` | `.match(/^\(?\s*([^,\s]+)\s*,\s*([^)\s]+)\s*\)?$/)` |

### query-cache.ts

| Line | Method      | Pattern                                       |
| ---- | ----------- | --------------------------------------------- |
| 181  | `dirtyable` | `.replace(/^(\/\*[\s\S]*?\*\/\s*)*/g, "")`    |
| 195  | `dirtyable` | `/\bFOR\s+(UPDATE\|SHARE\|...)\b/i.test(...)` |

### query-logs.ts

| Line | Method            | Pattern                                        |
| ---- | ----------------- | ---------------------------------------------- |
| 169  | `encodeComment`   | `.replace(/'/g, "%27")`                        |
| 179  | `sanitizeComment` | `.replace(/\*\//g, ...).replace(/\/\*/g, ...)` |

### type/type-map.ts

| Line | Method   | Pattern            |
| ---- | -------- | ------------------ |
| 39   | `lookup` | `.match(/\(.*\)/)` |

### connection-handling.ts

| Line | Method           | Pattern                          |
| ---- | ---------------- | -------------------------------- |
| 241  | `_resolveDbPath` | `.replace(/^sqlite3?:\/\//, "")` |

### integration.ts

| Line | Method                  | Pattern                   |
| ---- | ----------------------- | ------------------------- |
| 46   | `cacheKey`              | `.replace(/[^0-9]/g, "")` |
| 59   | `cacheVersionTimestamp` | `.replace(/[^0-9]/g, "")` |

### abstract-mysql-adapter.ts

| Line | Method     | Pattern                    |
| ---- | ---------- | -------------------------- |
| 360  | `annotate` | `.replace(/\*\//g, "* /")` |

### delegated-type.ts

| Line | Method      | Pattern                |
| ---- | ----------- | ---------------------- |
| 76   | `roleTypes` | `.replace(/.*::/, "")` |

### fixture-set/render-context.ts

| Line | Method        | Pattern                         |
| ---- | ------------- | ------------------------------- |
| 20   | `interpolate` | `.replace(/\$\{(\w+)\}/g, ...)` |

### secure-token.ts

| Line | Method           | Pattern                      |
| ---- | ---------------- | ---------------------------- |
| 48   | `hasSecureToken` | `.replace(/_([a-z])/g, ...)` |

### migration.ts

| Line | Method         | Pattern                                                       |
| ---- | -------------- | ------------------------------------------------------------- |
| 1634 | `removeColumn` | `/no such column\|does not exist\|unknown column/i.test(...)` |

### encryption/message-serializer.ts

| Line | Method | Pattern               |
| ---- | ------ | --------------------- |
| 54   | `load` | `.replace(/=+$/, "")` |
| 55   | `load` | `.replace(/=+$/, "")` |

### encryption/key-generator.ts

| Line | Method        | Pattern              |
| ---- | ------------- | -------------------- |
| 28   | `generateKey` | `.replace(/-/g, "")` |

### test-adapter.ts (test infrastructure, not production)

~24 regexes for SQL rewriting (CREATE/DROP TABLE, column detection, etc.)

---

## Rails ActiveRecord (`lib/`)

### active_record/associations/alias_tracker.rb

| Line | Method         | Pattern      |
| ---- | -------------- | ------------ |
| 39   | (class method) | `.scan(...)` |

### active_record/associations/builder/has_and_belongs_to_many.rb

| Line | Method              | Pattern                               |
| ---- | ------------------- | ------------------------------------- |
| 61   | `middle_reflection` | `.gsub("::", "_")`                    |
| 88   | `table_name`        | `.gsub(/^(.*[._])(.+)\0\1(.+)/, ...)` |

### active_record/attribute_assignment.rb

| Line | Method                                            | Pattern                   |
| ---- | ------------------------------------------------- | ------------------------- |
| 64   | `extract_callstack_for_multiparameter_attributes` | `.split("(")`             |
| 75   | `type_cast_attribute_value`                       | `=~ /\([0-9]*([if])\)/`   |
| 79   | `find_parameter_position`                         | `.scan(/\(([0-9]*).*\)/)` |

### active_record/connection_adapters/abstract/database_statements.rb

| Line | Method                              | Pattern                |
| ---- | ----------------------------------- | ---------------------- |
| 741  | `extract_table_ref_from_insert_sql` | `=~ /into\s("...")/im` |

### active_record/connection_adapters/abstract/quoting.rb

| Line | Method         | Pattern                           |
| ---- | -------------- | --------------------------------- |
| 132  | `quote_string` | `.gsub("\\", ...).gsub("'", ...)` |
| 203  | `quoted_time`  | `.sub(/\A\d\d\d\d-\d\d-\d\d /)`   |

### active_record/connection_adapters/abstract/schema_creation.rb

| Line | Method   | Pattern        |
| ---- | -------- | -------------- |
| 12   | `accept` | `.split('::')` |

### active_record/connection_adapters/abstract/schema_statements.rb

| Line | Method                               | Pattern                       |
| ---- | ------------------------------------ | ----------------------------- |
| 1738 | `index_name_options`                 | `.scan(/\w+/)`                |
| 1752 | `strip_table_name_prefix_and_suffix` | `=~ /#{prefix}(.+)#{suffix}/` |

### active_record/connection_adapters/abstract_adapter.rb

| Line | Method              | Pattern                        |
| ---- | ------------------- | ------------------------------ |
| 95   | (class method)      | `.split(File::PATH_SEPARATOR)` |
| 249  | `initialize`        | `.split(".")`                  |
| 254  | `initialize`        | `.split(".")`                  |
| 934  | `extract_precision` | `=~ /\((\d+)(,\d+)?\)/`        |
| 938  | `extract_limit`     | `=~ /\((.*)\)/`                |

### active_record/connection_adapters/abstract_mysql_adapter.rb

| Line | Method                           | Pattern                                              |
| ---- | -------------------------------- | ---------------------------------------------------- |
| 539  | `check_constraints`              | `.gsub("\\'", "'")`                                  |
| 554  | `table_options`                  | `.sub(/\A.*\n\) ?/m)` + `.sub(/\n\/\*!.*\*\/\n\z/m)` |
| 560  | `table_options`                  | `=~ / DEFAULT CHARSET=...(?:COLLATE=...)?/`          |
| 624  | `columns_for_distinct`           | `.gsub(/\s+(?:ASC\|DESC)\b/i)`                       |
| 759  | `strip_whitespace_characters`    | `.gsub('\\\n', ...).gsub("x0A", ...)`                |
| 980  | `mismatched_foreign_key_details` | `=~ /Referencing column '(\w+)'.../i`                |
| 986  | `mismatched_foreign_key_details` | `.match(...)`                                        |
| 1019 | `version_string`                 | `.match(/^(?:5\.5\.5-)?(\d+\.\d+\.\d+)/)`            |

### active_record/connection_adapters/mysql/quoting.rb

| Line | Method              | Pattern                                  |
| ---- | ------------------- | ---------------------------------------- |
| 47   | `quote_column_name` | `.gsub('\`', '\`\`')`                    |
| 51   | `quote_table_name`  | `.gsub('\`', '\`\`').gsub(".", "\`.\`")` |

### active_record/connection_adapters/mysql/schema_dumper.rb

| Line | Method                                  | Pattern                                            |
| ---- | --------------------------------------- | -------------------------------------------------- |
| 13   | `prepare_column_options`                | `=~ /\A(?<size>tiny\|medium\|long)(?:text\|blob)/` |
| 78   | `extract_expression_for_virtual_column` | `=~ /%r/.../`                                      |
| 91   | `extract_expression_for_virtual_column` | `.gsub("\\'", "'")`                                |

### active_record/connection_adapters/mysql/schema_statements.rb

| Line | Method                                    | Pattern                                        |
| ---- | ----------------------------------------- | ---------------------------------------------- |
| 38   | `indexes`                                 | `.gsub("\\'", "'")`                            |
| 98   | `internal_string_options_for_primary_key` | `.sub(/\A[^_]+/)`                              |
| 177  | `default_type`                            | `.match(/\`#{field_name}\` (.+) DEFAULT .../)` |
| 199  | `new_column_from_field`                   | `.gsub("\\'", "'")`                            |
| 203  | `new_column_from_field`                   | `.gsub("\\'", "'")`                            |
| 266  | `extract_schema_qualified_name`           | `.scan(/[^\`.\s]+\|\`[^\`]\*\`/)`              |

### active_record/connection_adapters/postgresql/oid/date.rb

| Line | Method       | Pattern        |
| ---- | ------------ | -------------- |
| 13   | `cast_value` | `.sub(/^\d+/)` |

### active_record/connection_adapters/postgresql/oid/date_time.rb

| Line | Method       | Pattern        |
| ---- | ------------ | -------------- |
| 13   | `cast_value` | `.sub(/^\d+/)` |

### active_record/connection_adapters/postgresql/oid/hstore.rb

| Line | Method          | Pattern                 |
| ---- | --------------- | ----------------------- | ------------------ |
| 29   | `deserialize`   | `.scan(/^(\\[\\"]       | [^\\"])\*?(?=")/)` |
| 37   | `deserialize`   | `.scan(/NULL/)`         |
| 44   | `deserialize`   | `.scan(/^(\\[\\"]       | [^\\"])\*?(?=")/)` |
| 101  | `escape_hstore` | `.gsub(/(["\\])/, ...)` |

### active_record/connection_adapters/postgresql/oid/money.rb

| Line | Method       | Pattern              |
| ---- | ------------ | -------------------- |
| 27   | `cast_value` | `.sub(/^\((.+)\)$/)` |

### active_record/connection_adapters/postgresql/oid/range.rb

| Line | Method                 | Pattern                                  |
| ---- | ---------------------- | ---------------------------------------- |
| 17   | `type_cast_for_schema` | `.gsub("Infinity", "::Float::INFINITY")` |
| 70   | `extract_bounds`       | `.split(",", 2)`                         |

### active_record/connection_adapters/postgresql/quoting.rb

| Line | Method        | Pattern          |
| ---- | ------------- | ---------------- |
| 146  | `quoted_date` | `.sub(/^-?\d+/)` |

### active_record/connection_adapters/postgresql/schema_statements.rb

| Line | Method                  | Pattern                                                  |
| ---- | ----------------------- | -------------------------------------------------------- |
| 106  | `indexes`               | `.split(" ")`                                            |
| 111  | `indexes`               | `.scan(/ USING (\w+?) \((.+?)\).../)`                    |
| 115  | `indexes`               | `.gsub('""', '"')` + `.split(",")`                       |
| 127  | `indexes`               | `.scan(/(?<column>\w+)"?\s?(?<opclass>...)/)`            |
| 602  | `foreign_keys`          | `.scan(/\d+/)`                                           |
| 603  | `foreign_keys`          | `.scan(/\d+/)`                                           |
| 677  | `exclusion_constraints` | `.split(" WHERE ")`                                      |
| 678  | `exclusion_constraints` | `.match(/EXCLUDE(?: USING ...)? \((?<expression>.+)\)/)` |
| 711  | `unique_constraints`    | `.split(",")`                                            |
| 873  | `columns_for_distinct`  | `.gsub(/\s+(?:ASC\|DESC)\b/i)`                           |
| 874  | `columns_for_distinct`  | `.gsub(/\s+NULLS\s+(?:FIRST\|LAST)\b/i)`                 |
| 977  | `new_column_from_field` | `.match(/\Anextval\('"?...seq..."?'::regclass\)\z/)`     |

### active_record/connection_adapters/postgresql/utils.rb

| Line | Method                          | Pattern                    |
| ---- | ------------------------------- | -------------------------- |
| 61   | `extract_schema_qualified_name` | `.scan(/[^".]+\|"[^"]*"/)` |

### active_record/connection_adapters/postgresql_adapter.rb

| Line | Method                       | Pattern               |
| ---- | ---------------------------- | --------------------- |
| 86   | `dbconsole`                  | `.gsub(/[ \\]/, ...)` |
| 474  | `enable_extension`           | `.split(".")`         |
| 487  | `disable_extension`          | `.split(".")`         |
| 763  | `extract_value_from_default` | `.gsub("''", "'")`    |

### active_record/connection_adapters/sqlite3/quoting.rb

| Line | Method              | Pattern                             |
| ---- | ------------------- | ----------------------------------- |
| 45   | `quote_column_name` | `.gsub('"', '""')`                  |
| 49   | `quote_table_name`  | `.gsub('"', '""').gsub(".", '"."')` |
| 76   | `quoted_time`       | `.sub(/\A\d\d\d\d-\d\d-\d\d /)`     |

### active_record/connection_adapters/sqlite3/schema_dumper.rb

| Line | Method           | Pattern        |
| ---- | ---------------- | -------------- |
| 16   | `virtual_tables` | `.split(", ")` |

### active_record/connection_adapters/sqlite3/schema_statements.rb

| Line | Method              | Pattern                                                  |
| ---- | ------------------- | -------------------------------------------------------- |
| 24   | `indexes`           | `=~ /\bON\b\s*"?(\w+?)"?\s*\((?<expressions>.+?)\).../i` |
| 30   | `indexes`           | `.sub(/\s*\/\*.*\*\/\z/)`                                |
| 39   | `indexes`           | `.scan(/"(\w+)" DESC/)`                                  |
| 102  | `check_constraints` | `.scan(/CONSTRAINT\s+(?<name>\w+)\s+CHECK\s+\(...\)/i)`  |

### active_record/connection_adapters/sqlite3_adapter.rb

| Line | Method                           | Pattern                                |
| ---- | -------------------------------- | -------------------------------------- | -------------------- |
| 304  | `virtual_tables`                 | `.match(VIRTUAL_TABLE_REGEX)`          |
| 427  | `foreign_keys`                   | `.match(FK_REGEX)`                     |
| 428  | `foreign_keys`                   | `.match(DEFERRABLE_REGEX)`             |
| 528  | `extract_value_from_default`     | `.gsub("''", "'")`                     |
| 531  | `extract_value_from_default`     | `.gsub('""', '"')`                     |
| 670  | `copy_table_indexes`             | `.gsub(/(^                             | _)(#{from})_/, ...)` |
| 727  | `table_structure_with_collation` | `=~ COLLATE_REGEX`                     |
| 728  | `table_structure_with_collation` | `=~ PRIMARY_KEY_AUTOINCREMENT_REGEX`   |
| 729  | `table_structure_with_collation` | `=~ GENERATED_ALWAYS_AS_REGEX`         |
| 783  | `table_structure_sql`            | `.sub(FINAL_CLOSE_PARENS_REGEX)`       |
| 786  | `table_structure_sql`            | `.split(/,(?=\s(?:CONSTRAINT\|...))/)` |

### active_record/database_configurations/connection_url_resolver.rb

| Line | Method       | Pattern                          |
| ---- | ------------ | -------------------------------- |
| 31   | `initialize` | `.split("?", 2)`                 |
| 61   | `query_hash` | `.split("&")` + `.split("=", 2)` |

### active_record/dynamic_matchers.rb

| Line | Method                | Pattern                                          |
| ---- | --------------------- | ------------------------------------------------ |
| 10   | `respond_to_missing?` | `Method.match(self, name)`                       |
| 16   | `method_missing`      | `Method.match(self, name)`                       |
| 55   | `initialize`          | `.match(self.class.pattern)` + `.split("_and_")` |

### active_record/encryption/encryptable_record.rb

| Line | Method                                      | Pattern                               |
| ---- | ------------------------------------------- | ------------------------------------- |
| 66   | `source_attribute_from_preserved_attribute` | `.sub(ORIGINAL_ATTRIBUTE_PREFIX, "")` |

### active_record/enum.rb

| Line | Method                            | Pattern                          |
| ---- | --------------------------------- | -------------------------------- |
| 270  | `_enum`                           | `.gsub(/[\W&&[:ascii:]]+/, "_")` |
| 402  | `detect_negative_enum_conditions` | `.sub("not_", "")`               |

### active_record/fixture_set/table_row.rb

| Line | Method              | Pattern                |
| ---- | ------------------- | ---------------------- |
| 115  | `interpolate_label` | `.gsub("$LABEL", ...)` |
| 194  | `add_join_records`  | `.split(/\s*,\s*/)`    |

### active_record/inheritance.rb

| Line | Method         | Pattern          |
| ---- | -------------- | ---------------- |
| 255  | `compute_type` | `.scan(/::\|$/)` |

### active_record/migration.rb

| Line | Method                     | Pattern                          |
| ---- | -------------------------- | -------------------------------- |
| 1374 | `parse_migration_filename` | `.scan(MigrationFilenameRegexp)` |

### active_record/migration/compatibility.rb

| Line | Method               | Pattern        |
| ---- | -------------------- | -------------- |
| 59   | `index_name_options` | `.scan(/\w+/)` |

### active_record/model_schema.rb

| Line | Method         | Pattern                          |
| ---- | -------------- | -------------------------------- |
| 197  | (class method) | `.gsub(/^(.*[_.])(.+)\0\1(.+)/)` |

### active_record/relation.rb

| Line | Method             | Pattern                            |
| ---- | ------------------ | ---------------------------------- |
| 1495 | `tables_in_string` | `.scan(/[a-zA-Z_][.\w]+(?=.?\.)/)` |

### active_record/relation/calculations.rb

| Line | Method     | Pattern       |
| ---- | ---------- | ------------- |
| 598  | `type_for` | `.split(".")` |

### active_record/relation/delegation.rb

| Line | Method                               | Pattern            |
| ---- | ------------------------------------ | ------------------ |
| 39   | `initialize_relation_delegate_cache` | `.gsub("::", "_")` |

### active_record/relation/query_methods.rb

| Line | Method                     | Pattern                    |
| ---- | -------------------------- | -------------------------- |
| 1998 | `arel_column`              | `=~ /\A(?<table>...)\.\z/` |
| 2034 | `reverse_sql_order`        | `.split(",")`              |
| 2050 | `does_not_support_reverse` | `.split(",")`              |
| 2150 | `extract_table_name_from`  | `.match(/^\W?(\w+)\W?\./)` |
| 2188 | `resolve_arel_attributes`  | `.split(".", 2)`           |

### active_record/sanitization.rb

| Line | Method                         | Pattern                               |
| ---- | ------------------------------ | ------------------------------------- |
| 134  | `sanitize_sql_like`            | `.gsub(escape_character, '\0\0')`     |
| 137  | `sanitize_sql_like`            | `.gsub(/(?=[%_])/, escape_character)` |
| 206  | `replace_bind_variables`       | `.gsub(/\?/) do`                      |
| 220  | `replace_named_bind_variables` | `.gsub(/([:\\]?):([a-zA-Z]\w*)/)`     |

### active_record/schema_dumper.rb

| Line | Method                     | Pattern                              |
| ---- | -------------------------- | ------------------------------------ |
| 373  | `remove_prefix_and_suffix` | `.sub(/\A#{prefix}(.+)#{suffix}\z/)` |

### arel/nodes/bound_sql_literal.rb

| Line | Method       | Pattern                          |
| ---- | ------------ | -------------------------------- |
| 20   | `initialize` | `.scan(/:(?<!::)([a-zA-Z]\w*)/)` |

### arel/predications.rb

| Line | Method                  | Pattern           |
| ---- | ----------------------- | ----------------- |
| 136  | `matches_regexp`        | `Regexp.new(...)` |
| 152  | `does_not_match_regexp` | `Regexp.new(...)` |

### arel/visitors/dot.rb

| Line | Method  | Pattern            |
| ---- | ------- | ------------------ |
| 280  | `quote` | `.gsub('"', '\"')` |

### arel/visitors/to_sql.rb

| Line | Method                             | Pattern                                      |
| ---- | ---------------------------------- | -------------------------------------------- |
| 800  | `visit_Arel_Nodes_BoundSqlLiteral` | `.scan(/\?\|([^?]+)/)`                       |
| 811  | `visit_Arel_Nodes_BoundSqlLiteral` | `.scan(/:(?<!::)([a-zA-Z]\w*)\|([^:]+\|.)/)` |

### arel/visitors/visitor.rb

| Line | Method         | Pattern            |
| ---- | -------------- | ------------------ |
| 19   | (class method) | `.gsub("::", "_")` |

## Observations

1. **Quote escaping dominates our code.** Over 30 of our ~120 usages are
   `.replace(/'/g, "''")` scattered across relation.ts, base.ts, and quoting
   files. Rails centralizes this in `quote_string`/adapter quoting methods.

2. **relation.ts is the hotspot.** 22 regex usages vs Rails' query_methods.rb
   with only 5. Most of ours are inline quote escaping that should go through
   the quoting layer.

3. **Rails has more structural parsing regexes.** sqlite3_adapter.rb alone has
   11 regexes for parsing DDL. Our adapters are thinner because we don't yet
   parse DDL output from real databases as heavily.

4. **test-adapter.ts adds 24 more.** These are SQL rewriting regexes for the
   test harness — not production code, but worth noting.

5. **Both codebases use regex for the same categories:**
   - SQL quoting/escaping
   - Type parsing (varchar, int, etc.)
   - SQL clause detection (ASC/DESC, WHERE, FOR UPDATE)
   - Identifier manipulation (table names, column names)
   - Schema introspection (nextval, DEFAULT, constraints)
