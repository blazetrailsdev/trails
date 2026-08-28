import { ArgumentError } from "@blazetrails/activemodel";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import type { CheckConstraintDefinition } from "../abstract/schema-definitions.js";
import { IndexDefinition } from "../abstract/schema-definitions.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import { SchemaStatements as AbstractSchemaStatements } from "../abstract/schema-statements.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";
import { SchemaDumper } from "./schema-dumper.js";
import { Column } from "./column.js";
import { quoteTableName } from "./quoting.js";

interface SQLite3SchemaAdapter extends DatabaseAdapter {
  addForeignKey(
    fromTable: string,
    toTable: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  removeForeignKey(
    fromTable: string,
    toTableOrOptions?: string | Record<string, unknown>,
    options?: Record<string, unknown>,
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
    options?: Record<string, unknown>,
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
  options?: Record<string, unknown>,
): Promise<void> {
  return adapter.removeForeignKey(fromTable, toTableOrOptions, options);
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
  options?: Record<string, unknown>,
): Promise<void> {
  return adapter.removeCheckConstraint(tableName, expressionOrOptions, options);
}

const INDEX_ON_REGEX =
  /\bON\b\s*"?(\w+?)"?\s*\((?<expressions>.+?)\)(?:\s*WHERE\b\s*(?<where>.+))?(?:\s*\/\*.*\*\/)?$/i;

export async function indexes(
  adapter: DatabaseAdapter,
  tableName: string,
): Promise<IndexDefinition[]> {
  const rows = (
    await adapter.internalExecQuery(`PRAGMA index_list(${quoteTableName(tableName)})`, "SCHEMA")
  ).toArray() as Array<{ name: string; unique: number; origin: string }>;
  const result: IndexDefinition[] = [];
  for (const idx of rows) {
    if (idx.name.startsWith("sqlite_")) continue;

    const indexSql = (await adapter.queryValue(
      `SELECT sql FROM sqlite_master WHERE name = ${adapter.quote(idx.name)} AND type = 'index' ` +
        `UNION ALL ` +
        `SELECT sql FROM sqlite_temp_master WHERE name = ${adapter.quote(idx.name)} AND type = 'index'`,
      "SCHEMA",
    )) as string | null | undefined;
    const match = indexSql ? INDEX_ON_REGEX.exec(indexSql) : null;
    const expressions = match?.groups?.expressions;
    let where = match?.groups?.where;
    if (where != null) where = where.replace(/\s*\/\*.*\*\/$/, "");

    const cols = (
      await adapter.internalExecQuery(`PRAGMA index_info(${adapter.quote(idx.name)})`, "SCHEMA")
    ).toArray() as Array<{ name: string | null }>;
    const columnNames = cols.map((c) => c.name);

    const orders: Record<string, string> = {};
    let columns: string[] | string;
    if (columnNames.some((name) => name == null)) {
      columns = expressions ?? "";
    } else {
      columns = columnNames as string[];
      if (indexSql) {
        for (const m of indexSql.matchAll(/"(\w+)" DESC/g)) {
          orders[m[1]] = "desc";
        }
      }
    }

    result.push(
      new IndexDefinition(tableName, idx.name, idx.unique !== 0, columns, { orders, where }),
    );
  }
  return result;
}

/** @missingRailsCall any? — PERMANENT */
export async function virtualTableExists(
  adapter: DatabaseAdapter,
  tableName: string,
): Promise<boolean> {
  return (
    (await adapter.queryValues(dataSourceSql(tableName, { type: "VIRTUAL TABLE" }), "SCHEMA"))
      .length > 0
  );
}

export function createSchemaDumper(
  this: DatabaseAdapter,
  options: Record<string, unknown> = {},
): AbstractSchemaDumper {
  return SchemaDumper.create(this as Parameters<typeof SchemaDumper.create>[0], options);
}

/** @internal */
export function validTableDefinitionOptions(this: DatabaseAdapter): string[] {
  return [...AbstractSchemaStatements.prototype.validTableDefinitionOptions.call(this), "rename"];
}

/** @internal */
export function validateIndexLengthBang(
  this: DatabaseAdapter,
  tableName: string,
  newName: string,
  internal = false,
): void {
  if (internal) return;
  AbstractSchemaStatements.prototype.validateIndexLengthBang.call(
    this,
    tableName,
    newName,
    internal,
  );
}

/**
 * @internal
 * @missingRailsArgs extract_value_from_default — PERMANENT
 * @missingRailsArgs extract_default_function — PERMANENT
 */
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
    defaultFunction = extractDefaultFunction(defaultValue, dfltValue);
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
  ).deduplicate();
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
export function dataSourceSql(name?: string, { type }: { type?: string } = {}): string {
  const scope = quotedScope(name, { type });
  if (!scope.type) scope.type = "'table','view'";
  let sql = "SELECT name FROM pragma_table_list WHERE schema <> 'temp'";
  sql += " AND name NOT IN ('sqlite_sequence', 'sqlite_schema')";
  if (scope.name) sql += ` AND name = ${scope.name}`;
  sql += ` AND type IN (${scope.type})`;
  return sql;
}

/**
 * @internal
 * @missingRailsCall quote — PERMANENT
 */
export function quotedScope(
  name?: string,
  { type }: { type?: string } = {},
): { name?: string; type?: string } {
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
  throw new ArgumentError(
    `deferrable must be \`"immediate"\` or \`"deferred"\`, got: \`${JSON.stringify(deferrable)}\``,
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
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function extractValueFromDefault(dfltValue: string | null): unknown {
  if (dfltValue === null) return null;
  if (/^null$/i.test(dfltValue)) return null;
  const single = /^'([^|]*)'$/m.exec(dfltValue);
  if (single) return single[1].replace(/''/g, "'");
  const double = /^"([^|]*)"$/m.exec(dfltValue);
  if (double) return double[1].replace(/""/g, '"');
  if (/^-?\d+(\.\d*)?$/.test(dfltValue)) return dfltValue;
  const hex = /x'(.*)'/.exec(dfltValue);
  if (hex) return Buffer.from(hex[1], "hex");
  return null;
}

export { extractValueFromDefault as _extractValueFromDefault };

function extractDefaultFunction(defaultValue: unknown, dflt: string | null): string | null {
  if (
    defaultValue == null &&
    dflt != null &&
    /\w+\(.*\)|CURRENT_TIME|CURRENT_DATE|CURRENT_TIMESTAMP|\|\|/.test(dflt)
  ) {
    return dflt;
  }
  return null;
}
