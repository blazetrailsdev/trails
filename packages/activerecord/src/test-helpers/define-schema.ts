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

export type TableSchema = Record<string, ColumnSpec>;
export type Schema = Record<string, TableSchema>;

export interface DefineSchemaOpts {
  dropExisting?: boolean;
}

/** @internal */
function resolveReferences(schema: Schema): string[] {
  const refs = new Map<string, Set<string>>();
  for (const [table, columns] of Object.entries(schema)) {
    refs.set(table, new Set());
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
  const ss = new SchemaStatements(adapter);
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
    const columns = schema[table];
    await ss.createTable(table, (t) => {
      for (const [colName, spec] of Object.entries(columns)) {
        const primitive: PrimitiveColumnSpec = typeof spec === "string" ? spec : spec.type;
        const arType = typeMap[primitive];
        const options: Record<string, unknown> = {};
        if (typeof spec === "object") {
          if (spec.limit !== undefined) options["limit"] = spec.limit;
          if (spec.null !== undefined) options["null"] = spec.null;
          if (spec.default !== undefined) options["default"] = spec.default;
          if (spec.primary) options["primaryKey"] = true;
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
