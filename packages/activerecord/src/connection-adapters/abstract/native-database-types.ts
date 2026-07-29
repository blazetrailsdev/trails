/** Per-adapter `NATIVE_DATABASE_TYPES`, transcribed from Rails. */
export interface NativeDatabaseType {
  name?: string;
  limit?: number;
  precision?: number;
  scale?: number;
}

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

export const NATIVE_DATABASE_TYPES_BY_ADAPTER: Record<
  "sqlite" | "postgres" | "mysql",
  Record<string, NativeDatabaseType>
> = {
  sqlite: SQLITE3_NATIVE_DATABASE_TYPES,
  postgres: POSTGRESQL_NATIVE_DATABASE_TYPES,
  mysql: MYSQL_NATIVE_DATABASE_TYPES,
};
