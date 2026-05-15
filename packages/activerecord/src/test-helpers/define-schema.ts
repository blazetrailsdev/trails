import type { DatabaseAdapter } from "../adapter.js";
import { SchemaStatements } from "../connection-adapters/abstract/schema-statements.js";

export type PrimitiveColumnSpec =
  | "string"
  | "text"
  | "integer"
  | "big_integer"
  | "float"
  | "decimal"
  | "boolean"
  | "datetime"
  | "date"
  | "time"
  | "binary"
  | "json";

export type ColumnSpec =
  | PrimitiveColumnSpec
  | {
      type: PrimitiveColumnSpec;
      limit?: number;
      references?: string;
      null?: boolean;
      default?: unknown;
      primary?: boolean;
    };

export interface WrappedTableSchema {
  columns: Record<string, ColumnSpec>;
  /**
   * Table-level primary key. `string[]` builds a composite PK constraint and
   * suppresses the auto-`id` column. `false` builds the table without a PK.
   * `string` is not supported — use the matching column with `primary: true`
   * via the legacy shape, or pass `[name]` for a single-column composite.
   *
   * Required: this is the disambiguator that separates the wrapper shape
   * from the legacy `Record<colName, ColumnSpec>` shape. Without it, a
   * legacy single-column table whose column happens to be named `columns`
   * (with an object ColumnSpec) is structurally indistinguishable from a
   * wrapper. If you don't need to override the PK, use the legacy shape.
   */
  primaryKey: string[] | false;
}
export type TableSchema = Record<string, ColumnSpec> | WrappedTableSchema;
export type Schema = Record<string, TableSchema>;

export interface DefineSchemaOpts {
  dropExisting?: boolean;
}

/** @internal */
const WRAPPER_KEYS = new Set(["columns", "primaryKey"]);

/** @internal */
function isWrappedSchema(table: TableSchema): table is WrappedTableSchema {
  // The wrapper and the legacy `Record<colName, ColumnSpec>` shape both
  // permit a key called `columns`, so discrimination needs an unambiguous
  // signal. We use the presence of `primaryKey` — the wrapper's sole
  // purpose is to set a table-level PK, so making it required also
  // collapses the only ambiguity: a legacy single-column table
  // `{ columns: { type: "string" } }` is structurally identical to a
  // wrapper with one column named `type`, but it cannot have `primaryKey`,
  // so it stays unambiguously legacy.
  //
  // Rule:
  //   1. `primaryKey` is present.
  //   2. `columns` is present and an object map.
  //   3. No other top-level keys.
  if (!table || typeof table !== "object") return false;
  if (!("primaryKey" in table)) return false;
  const pk = (table as { primaryKey?: unknown }).primaryKey;
  // Validate primaryKey is the wrapper-shaped value; otherwise this is a
  // legacy table that happens to have a column called `primaryKey`.
  if (pk !== false && !Array.isArray(pk)) return false;
  if (Array.isArray(pk) && !pk.every((v) => typeof v === "string")) return false;
  const candidate = (table as { columns?: unknown }).columns;
  if (!candidate || typeof candidate !== "object") return false;
  for (const key of Object.keys(table)) {
    if (!WRAPPER_KEYS.has(key)) return false;
  }
  return true;
}

/** @internal */
function columnsOf(table: TableSchema): Record<string, ColumnSpec> {
  return isWrappedSchema(table) ? table.columns : (table as Record<string, ColumnSpec>);
}

/** @internal */
function primaryKeyOf(table: TableSchema): string[] | false | undefined {
  return isWrappedSchema(table) ? table.primaryKey : undefined;
}

/** @internal */
function resolveReferences(schema: Schema): string[] {
  const refs = new Map<string, Set<string>>();
  for (const [table, raw] of Object.entries(schema)) {
    refs.set(table, new Set());
    const columns = columnsOf(raw);
    for (const spec of Object.values(columns)) {
      if (typeof spec === "object" && spec.references) {
        if (spec.references in schema && spec.references !== table) {
          refs.get(table)!.add(spec.references);
        }
      }
    }
  }

  const sorted: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(table: string): void {
    if (visited.has(table)) return;
    if (visiting.has(table)) {
      throw new Error(`defineSchema: circular reference detected involving table "${table}"`);
    }
    visiting.add(table);
    for (const dep of refs.get(table)!) {
      visit(dep);
    }
    visiting.delete(table);
    visited.add(table);
    sorted.push(table);
  }

  for (const table of Object.keys(schema)) {
    visit(table);
  }
  return sorted;
}

/** @internal */
const COLUMN_TYPE_MAP_PG: Record<PrimitiveColumnSpec, string> = {
  string: "string",
  text: "text",
  integer: "integer",
  big_integer: "bigint",
  float: "float",
  decimal: "decimal",
  boolean: "boolean",
  datetime: "datetime",
  date: "date",
  time: "time",
  binary: "binary",
  json: "json",
};

// MySQL/MariaDB accepts native DATETIME columns with "YYYY-MM-DD HH:MM:SS" format
// (no T/Z suffix). AR DateTime.serialize now emits this format, so datetime can
// use the native column type. date/time/binary/json still use "string" (VARCHAR).
/** @internal */
const COLUMN_TYPE_MAP_MYSQL: Record<PrimitiveColumnSpec, string> = {
  ...COLUMN_TYPE_MAP_PG,
  date: "string",
  time: "string",
  binary: "string",
  json: "string",
};

// SQLite stores temporal and binary types as TEXT.
/** @internal */
const COLUMN_TYPE_MAP_SQLITE: Record<PrimitiveColumnSpec, string> = {
  ...COLUMN_TYPE_MAP_PG,
  datetime: "string",
  date: "string",
  time: "string",
  binary: "string",
  json: "string",
};

export async function defineSchema(
  adapter: DatabaseAdapter,
  schema: Schema,
  opts?: DefineSchemaOpts,
): Promise<void> {
  const ss = adapter.schemaStatements ? adapter.schemaStatements() : new SchemaStatements(adapter);
  const order = resolveReferences(schema);
  const typeMap =
    adapter.adapterName === "postgres"
      ? COLUMN_TYPE_MAP_PG
      : adapter.adapterName === "mysql"
        ? COLUMN_TYPE_MAP_MYSQL
        : COLUMN_TYPE_MAP_SQLITE;

  if (opts?.dropExisting) {
    for (const table of [...order].reverse()) {
      await ss.dropTable(table, { ifExists: true });
    }
  }

  for (const table of order) {
    const raw = schema[table];
    const columns = columnsOf(raw);
    const pk = primaryKeyOf(raw);
    const createOpts: Record<string, unknown> = {};
    if (pk === false) createOpts["id"] = false;
    else if (Array.isArray(pk)) {
      createOpts["primaryKey"] = pk;
      createOpts["id"] = false;
    }
    await ss.createTable(table, createOpts, (t) => {
      for (const [colName, spec] of Object.entries(columns)) {
        const primitive: PrimitiveColumnSpec = typeof spec === "string" ? spec : spec.type;
        const arType = typeMap[primitive];
        const options: Record<string, unknown> = {};
        if (typeof spec === "object") {
          if (spec.limit !== undefined) options["limit"] = spec.limit;
          if (spec.null !== undefined) options["null"] = spec.null;
          if (spec.default !== undefined) options["default"] = spec.default;
          if (spec.primary && pk === undefined) {
            options["primaryKey"] = true;
          }
        }
        // MySQL DATETIME without precision = DATETIME(0), which rejects fractional
        // seconds. Default to DATETIME(6) so test schemas accept microseconds.
        if (
          adapter.adapterName === "mysql" &&
          primitive === "datetime" &&
          options["precision"] == null
        ) {
          options["precision"] = 6;
        }
        t.column(colName, arType, options);
      }
    });
  }
}
