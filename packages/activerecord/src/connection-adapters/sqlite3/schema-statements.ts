/**
 * SQLite3 schema statements — SQLite-specific DDL operations.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements
 *
 * addForeignKey, removeForeignKey, checkConstraints, addCheckConstraint,
 * and removeCheckConstraint are implemented on SQLite3Adapter directly
 * (via alterTable rebuild). The functions below delegate to the adapter.
 */

import type { DatabaseAdapter } from "../../adapter.js";
import type { CheckConstraintDefinition } from "../abstract/schema-definitions.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import { SchemaCreation } from "./schema-creation.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";
import { SchemaDumper } from "./schema-dumper.js";
import { Column } from "./column.js";
import { quoteColumnName, quoteString as quoteStringLiteral } from "./quoting.js";

export interface SchemaStatements {
  dataSources(): Promise<string[]>;
  tables(): Promise<string[]>;
  views(): Promise<string[]>;
  indexes(tableName: string): Promise<unknown[]>;
  primaryKeys(tableName: string): Promise<string[]>;
  foreignKeys(tableName: string): Promise<unknown[]>;
}

interface SQLite3SchemaAdapter extends DatabaseAdapter {
  addForeignKey(
    fromTable: string,
    toTable: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  removeForeignKey(
    fromTable: string,
    toTableOrOptions?: string | Record<string, unknown>,
  ): Promise<void>;
  checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]>;
  addCheckConstraint(
    tableName: string,
    expression: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  removeCheckConstraint(
    tableName: string,
    expressionOrOptions?: string | Record<string, unknown>,
  ): Promise<void>;
  fetchTypeMetadata(sqlType: string): SqlTypeMetadata;
}

export async function addForeignKey(
  adapter: SQLite3SchemaAdapter,
  fromTable: string,
  toTable: string,
  options?: Record<string, unknown>,
): Promise<void> {
  return adapter.addForeignKey(fromTable, toTable, options);
}

export async function removeForeignKey(
  adapter: SQLite3SchemaAdapter,
  fromTable: string,
  toTableOrOptions?: string | Record<string, unknown>,
): Promise<void> {
  return adapter.removeForeignKey(fromTable, toTableOrOptions);
}

export async function checkConstraints(
  adapter: SQLite3SchemaAdapter,
  tableName: string,
): Promise<CheckConstraintDefinition[]> {
  return adapter.checkConstraints(tableName);
}

export async function addCheckConstraint(
  adapter: SQLite3SchemaAdapter,
  tableName: string,
  expression: string,
  options?: Record<string, unknown>,
): Promise<void> {
  return adapter.addCheckConstraint(tableName, expression, options);
}

export async function removeCheckConstraint(
  adapter: SQLite3SchemaAdapter,
  tableName: string,
  expressionOrOptions?: string | Record<string, unknown>,
): Promise<void> {
  return adapter.removeCheckConstraint(tableName, expressionOrOptions);
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#indexes
 *
 * Houses the SQLite index introspection in the file Rails keeps it in; the
 * adapter delegates here. Schema-qualified names (e.g. `temp.widgets`) place
 * the qualifier before the PRAGMA keyword.
 */
export async function indexes(adapter: DatabaseAdapter, tableName: string): Promise<unknown[]> {
  const { schema, bare } = splitTableName(tableName);
  const pragmaPrefix = schema ? `${quoteColumnName(schema)}.` : "";
  const rows = (await adapter.execute(
    `PRAGMA ${pragmaPrefix}index_list(${quoteColumnName(bare)})`,
    [],
    "SCHEMA",
  )) as Array<{ name: string; unique: number; origin: string }>;
  // Skip auto-indexes that SQLite generates for PRIMARY KEY / UNIQUE
  // constraints — Rails' schema cache records user-defined indexes
  // only, and the auto ones are redundant with the CREATE TABLE sql.
  const userIndexes = rows.filter((r) => r.origin === "c");
  const sqliteMaster = schema ? `${quoteColumnName(schema)}.sqlite_master` : "sqlite_master";
  const result: Array<{
    table: string;
    name: string;
    columns: string[];
    unique: boolean;
    where?: string;
  }> = [];
  for (const idx of userIndexes) {
    // index_info takes the bare index name; the schema qualifier, if
    // any, comes before the PRAGMA keyword — same shape as above.
    const cols = (await adapter.execute(
      `PRAGMA ${pragmaPrefix}index_info(${quoteColumnName(idx.name)})`,
      [],
      "SCHEMA",
    )) as Array<{ name: string; seqno: number }>;
    const idxSqlRows = (await adapter.execute(
      `SELECT sql FROM ${sqliteMaster} WHERE type='index' AND name=${quoteStringLiteral(idx.name)}`,
      [],
      "SCHEMA",
    )) as Array<{ sql: string }>;
    const idxSqlRow = idxSqlRows[0];
    const whereMatch = idxSqlRow?.sql ? /\bWHERE\b\s+(.+)$/i.exec(idxSqlRow.sql) : null;
    result.push({
      table: bare,
      name: idx.name,
      columns: cols.sort((a, b) => a.seqno - b.seqno).map((c) => c.name),
      unique: idx.unique === 1,
      ...(whereMatch ? { where: whereMatch[1].trim() } : {}),
    });
  }
  return result;
}

function splitTableName(tableName: string): { schema: string; bare: string } {
  const dot = tableName.lastIndexOf(".");
  return dot === -1
    ? { schema: "", bare: tableName }
    : { schema: tableName.slice(0, dot), bare: tableName.slice(dot + 1) };
}

function resolveMasterTable(
  adapter: DatabaseAdapter,
  tableName: string,
): { masterTable: string; name: string } {
  const dotIdx = tableName.lastIndexOf(".");
  if (dotIdx === -1) return { masterTable: "sqlite_master", name: tableName };
  const schema = tableName.slice(0, dotIdx);
  const name = tableName.slice(dotIdx + 1);
  if (schema === "temp") return { masterTable: "sqlite_temp_master", name };
  return { masterTable: `${adapter.quoteColumnName(schema)}.sqlite_master`, name };
}

export async function isVirtualTableExists(
  adapter: DatabaseAdapter,
  tableName: string,
): Promise<boolean> {
  const { masterTable, name } = resolveMasterTable(adapter, tableName);
  const rows = await adapter.execute(
    `SELECT name FROM ${masterTable} WHERE type = 'table' AND name = ? AND sql LIKE '%VIRTUAL%'`,
    [name],
  );
  return rows.length > 0;
}

export function createSchemaDumper(
  source: unknown,
  options: Record<string, unknown> = {},
): AbstractSchemaDumper {
  return SchemaDumper.create(source as Parameters<typeof SchemaDumper.create>[0], options);
}

export function schemaCreation(): SchemaCreation {
  return new SchemaCreation("sqlite");
}

/** @internal */
function validTableDefinitionOptions(): string[] {
  return ["rename"];
}

/** @internal */
function validateIndexLengthBang(_tableName: string, _newName: string, internal = false): void {
  // SQLite skips index name length validation for internal indexes
  if (internal) return;
}

/** @internal */
export function newColumnFromField(
  adapter: SQLite3SchemaAdapter,
  _tableName: string,
  field: Record<string, unknown>,
  definitions: Record<string, unknown>[],
): Column {
  const dfltValue = (field["dflt_value"] as string | null) ?? null;
  const sqlType = String(field["type"] ?? "");
  const typeMetadata = adapter.fetchTypeMetadata(sqlType);
  const defaultValue = extractValueFromDefault(dfltValue);
  const generatedType = extractGeneratedType(field);

  let defaultFunction: string | null = null;
  if (generatedType) {
    defaultFunction = dfltValue;
  } else {
    defaultFunction = _extractDefaultFunction(defaultValue, dfltValue);
  }

  const rowid = isColumnTheRowid(field, definitions);

  return new Column(
    String(field["name"]),
    defaultValue,
    typeMetadata,
    Number(field["notnull"]) === 0,
    {
      defaultFunction: defaultFunction ?? undefined,
      collation: field["collation"] as string | undefined,
      autoIncrement: Boolean(field["auto_increment"]),
      rowid,
      generatedType,
    },
  );
}

const INTEGER_REGEX = /integer/i;

/** @internal */
export function isColumnTheRowid(
  field: Record<string, unknown>,
  columnDefinitions: Record<string, unknown>[],
): boolean {
  if (!INTEGER_REGEX.test(String(field["type"] ?? "")) || field["pk"] !== 1) return false;
  return columnDefinitions.filter((c) => Number(c["pk"]) > 0).length === 1;
}

/** @internal */
export function dataSourceSql(name?: string, type?: string): string {
  const scope = quotedScope(name, type);
  if (!scope.type) scope.type = "'table','view'";
  let sql = "SELECT name FROM pragma_table_list WHERE schema <> 'temp'";
  sql += " AND name NOT IN ('sqlite_sequence', 'sqlite_schema')";
  if (scope.name) sql += ` AND name = ${scope.name}`;
  sql += ` AND type IN (${scope.type})`;
  return sql;
}

/** @internal */
export function quotedScope(name?: string, type?: string): { name?: string; type?: string } {
  const resolvedType =
    type === "BASE TABLE"
      ? "'table'"
      : type === "VIEW"
        ? "'view'"
        : type === "VIRTUAL TABLE"
          ? "'virtual'"
          : undefined;
  const scope: { name?: string; type?: string } = {};
  if (name != null) scope.name = `'${name.replace(/'/g, "''")}'`;
  if (resolvedType) scope.type = resolvedType;
  return scope;
}

/** @internal */
export function assertValidDeferrable(deferrable: unknown): void {
  if (
    deferrable == null ||
    deferrable === false ||
    deferrable === "immediate" ||
    deferrable === "deferred"
  )
    return;
  throw new Error(
    `deferrable must be "immediate" or "deferred", got: ${JSON.stringify(deferrable)}`,
  );
}

/** @internal */
export function extractGeneratedType(
  field: Record<string, unknown>,
): "virtual" | "stored" | undefined {
  switch (field["hidden"]) {
    case 2:
      return "virtual";
    case 3:
      return "stored";
    default:
      return undefined;
  }
}

/**
 * Mirrors: SQLite3Adapter#extract_value_from_default
 * @internal
 */
export function extractValueFromDefault(dfltValue: string | null): unknown {
  if (dfltValue === null) return null;
  if (/^null$/i.test(dfltValue)) return null;
  // Quoted types — `[^|]` and the `m` flag mirror Rails' `/^'([^|]*)'$/m`
  // exactly (sqlite3_adapter.rb:527,530). Ruby's `^`/`$` are always line
  // anchors, so the faithful JS translation needs the `m` flag.
  const single = /^'([^|]*)'$/m.exec(dfltValue);
  if (single) return single[1].replace(/''/g, "'");
  const double = /^"([^|]*)"$/m.exec(dfltValue);
  if (double) return double[1].replace(/""/g, '"');
  // Numeric types
  if (/^-?\d+(\.\d*)?$/.test(dfltValue)) return dfltValue;
  // Binary columns — unanchored `x'(.*)'` mirrors Rails (sqlite3_adapter.rb:535).
  // Rails unpacks via `[ $1 ].pack("H*")`. SQLite's `PRAGMA table_info`
  // serializes a blob default as `x'<HEX>'` where HEX is always an even-length
  // run of valid hex digits and never contains an embedded quote, so the greedy
  // `.*` capture equals that hex run and `Buffer.from(hex)` is byte-identical to
  // `pack("H*")` for every value SQLite can emit. The two only differ on
  // malformed/non-hex captures, which SQLite never produces; replicating
  // `pack`'s nibble-masking there would be emulating undefined-domain behavior.
  const hex = /x'(.*)'/.exec(dfltValue);
  if (hex) return Buffer.from(hex[1], "hex");
  return null;
}

export { extractValueFromDefault as _extractValueFromDefault };

function _extractDefaultFunction(defaultValue: unknown, dflt: string | null): string | null {
  if (defaultValue == null && dflt != null && /\w+\(.*\)|CURRENT_DATE|CURRENT_TIME/i.test(dflt)) {
    return dflt;
  }
  return null;
}
