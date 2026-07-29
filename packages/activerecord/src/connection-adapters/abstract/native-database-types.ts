/**
 * The per-adapter `NATIVE_DATABASE_TYPES` hashes, transcribed from Rails.
 *
 * Rails declares each hash as a constant inside its adapter class. trails keeps
 * one copy per adapter here, in a leaf module with no imports, because the
 * shared `SchemaCreation` visitor also needs them: `type_to_sql` builds every
 * base type name from `native_database_types[type][:name]`
 * (abstract/schema_statements.rb:1385-1415), and the visitor is constructed
 * without an adapter on the host-less unit-test path. Each adapter's
 * `nativeDatabaseTypes()` returns the hash from here, so there is still exactly
 * one source per adapter.
 *
 * The names are lowercase in Rails and stay lowercase here — the declared type
 * text is what SQLite reflects back verbatim, so uppercasing it would diverge.
 */

/** One entry of a `NATIVE_DATABASE_TYPES` hash — Rails' `{ name:, limit: }` shape. */
export interface NativeDatabaseType {
  name?: string;
  limit?: number;
  precision?: number;
  scale?: number;
}

/** Mirrors: `SQLite3Adapter::NATIVE_DATABASE_TYPES` (sqlite3_adapter.rb:69). */
export const SQLITE3_NATIVE_DATABASE_TYPES: Record<string, NativeDatabaseType> = {
  primary_key: { name: "integer PRIMARY KEY AUTOINCREMENT NOT NULL" },
  string: { name: "varchar" },
  text: { name: "text" },
  integer: { name: "integer" },
  float: { name: "float" },
  decimal: { name: "decimal" },
  datetime: { name: "datetime" },
  time: { name: "time" },
  date: { name: "date" },
  binary: { name: "blob" },
  boolean: { name: "boolean" },
  json: { name: "json" },
};

/** Mirrors: `AbstractMysqlAdapter::NATIVE_DATABASE_TYPES` (abstract_mysql_adapter.rb:31). */
export const MYSQL_NATIVE_DATABASE_TYPES: Record<string, NativeDatabaseType> = {
  primary_key: { name: "bigint auto_increment PRIMARY KEY" },
  string: { name: "varchar", limit: 255 },
  text: { name: "text" },
  integer: { name: "int", limit: 4 },
  bigint: { name: "bigint" },
  float: { name: "float", limit: 24 },
  decimal: { name: "decimal" },
  datetime: { name: "datetime" },
  timestamp: { name: "timestamp" },
  time: { name: "time" },
  date: { name: "date" },
  binary: { name: "blob" },
  blob: { name: "blob" },
  boolean: { name: "tinyint", limit: 1 },
  json: { name: "json" },
};

/**
 * Mirrors: `PostgreSQLAdapter::NATIVE_DATABASE_TYPES` (postgresql_adapter.rb:134).
 * `datetime` is `{}` in Rails too — `native_database_types` fills it in from
 * `datetime_type` on every call.
 */
export const POSTGRESQL_NATIVE_DATABASE_TYPES: Record<string, NativeDatabaseType> = {
  primary_key: { name: "bigserial primary key" },
  string: { name: "character varying" },
  text: { name: "text" },
  integer: { name: "integer", limit: 4 },
  bigint: { name: "bigint" },
  float: { name: "float" },
  decimal: { name: "decimal" },
  datetime: {},
  timestamp: { name: "timestamp" },
  timestamptz: { name: "timestamptz" },
  time: { name: "time" },
  date: { name: "date" },
  daterange: { name: "daterange" },
  numrange: { name: "numrange" },
  tsrange: { name: "tsrange" },
  tstzrange: { name: "tstzrange" },
  int4range: { name: "int4range" },
  int8range: { name: "int8range" },
  binary: { name: "bytea" },
  boolean: { name: "boolean" },
  xml: { name: "xml" },
  tsvector: { name: "tsvector" },
  hstore: { name: "hstore" },
  inet: { name: "inet" },
  cidr: { name: "cidr" },
  macaddr: { name: "macaddr" },
  uuid: { name: "uuid" },
  json: { name: "json" },
  jsonb: { name: "jsonb" },
  ltree: { name: "ltree" },
  citext: { name: "citext" },
  point: { name: "point" },
  line: { name: "line" },
  lseg: { name: "lseg" },
  box: { name: "box" },
  path: { name: "path" },
  polygon: { name: "polygon" },
  circle: { name: "circle" },
  bit: { name: "bit" },
  bit_varying: { name: "bit varying" },
  money: { name: "money" },
  interval: { name: "interval" },
  oid: { name: "oid" },
  enum: {},
};

/**
 * Fallback lookup for the host-less `SchemaCreation` path, where the visitor is
 * built from an adapter *name* rather than a live adapter (see
 * `sqlite3/schema-statements.ts`). With an adapter threaded the visitor always
 * consults `adapter.nativeDatabaseTypes()` instead.
 */
export const NATIVE_DATABASE_TYPES_BY_ADAPTER: Record<
  "sqlite" | "postgres" | "mysql",
  Record<string, NativeDatabaseType>
> = {
  sqlite: SQLITE3_NATIVE_DATABASE_TYPES,
  postgres: POSTGRESQL_NATIVE_DATABASE_TYPES,
  mysql: MYSQL_NATIVE_DATABASE_TYPES,
};
