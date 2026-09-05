import { ArgumentError } from "@blazetrails/activemodel";
import { pluralize } from "@blazetrails/activesupport";
import { rbObjAsString as toS } from "@blazetrails/ruby-compat";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import type {
  AddForeignKeyOptions,
  ForeignKeyDefinition,
  ForeignKeyLookupOptions,
  RemoveForeignKeyOptions,
} from "../abstract/schema-definitions.js";
import { CheckConstraintDefinition } from "../abstract/schema-definitions.js";
import type { TableDefinition as SQLite3TableDefinition } from "./schema-definitions.js";
import { IndexDefinition } from "../abstract/schema-definitions.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import { globalPluralizeTableNames } from "../abstract/table-name-options.js";
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
    toTable?: string | Record<string, unknown>,
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
    expression?: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<void>;
  fetchTypeMetadata(sqlType: string): SqlTypeMetadata;
  alterTable(
    tableName: string,
    foreignKeys?: ForeignKeyDefinition[],
    checkConstraints?: CheckConstraintDefinition[],
    options?: { rename?: Record<string, string> },
    block?: (definition: SQLite3TableDefinition) => void,
  ): Promise<void>;
}

export async function addForeignKey(
  this: SQLite3SchemaAdapter,
  fromTable: string,
  toTable: string,
  options: AddForeignKeyOptions = {},
): Promise<void> {
  assertValidDeferrable(options.deferrable);

  await this.alterTable(fromTable, undefined, undefined, undefined, (definition) => {
    definition.foreignKey(this.stripTableNamePrefixAndSuffix(toTable), options);
  });
}

export async function removeForeignKey(
  this: SQLite3SchemaAdapter,
  fromTable: string,
  toTable?: string | RemoveForeignKeyOptions,
  options: RemoveForeignKeyOptions = {},
): Promise<void> {
  let to = typeof toTable === "string" ? toTable : undefined;
  const opts: RemoveForeignKeyOptions =
    typeof toTable === "object" && toTable !== null ? { ...toTable, ...options } : { ...options };
  const ifExists = opts.ifExists === true;
  delete opts.ifExists;

  if (ifExists && !(await this.foreignKeyExists(fromTable, to))) return;

  to ??= opts.toTable;
  let matchOptions: ForeignKeyLookupOptions = { ...opts };
  delete matchOptions.name;
  delete matchOptions.toTable;
  delete matchOptions.validate;

  const foreignKeys = await this.foreignKeys(fromTable);
  const fkey = foreignKeys.find((fk) => {
    let table: string;
    if (to != null) {
      table = to;
    } else {
      table = toS(matchOptions.column).replace(/_id$/, "");
      table = globalPluralizeTableNames() ? pluralize(table) : table;
    }
    table = this.stripTableNamePrefixAndSuffix(table);
    const fkOptions = fk.options as Record<string, unknown>;
    matchOptions = Object.fromEntries(
      Object.entries(matchOptions).filter(([k]) => k in fkOptions),
    ) as ForeignKeyLookupOptions;
    const fkToTable = this.stripTableNamePrefixAndSuffix(fk.toTable);
    return (
      fkToTable === table &&
      Object.entries(matchOptions).every(([k, v]) => toS(fkOptions[k]) === toS(v))
    );
  });

  if (!fkey) {
    throw new ArgumentError(
      `Table '${fromTable}' has no foreign key for ${to ?? toS(matchOptions)}`,
    );
  }

  foreignKeys.splice(foreignKeys.indexOf(fkey), 1);
  await this.alterTable(fromTable, foreignKeys);
}

export async function checkConstraints(
  this: SQLite3SchemaAdapter,
  tableName: string,
): Promise<CheckConstraintDefinition[]> {
  const tableSql = (await this.queryValue(
    `SELECT sql FROM sqlite_master WHERE name = ${this.quote(tableName)} AND type = 'table' ` +
      `UNION ALL ` +
      `SELECT sql FROM sqlite_temp_master WHERE name = ${this.quote(tableName)} AND type = 'table'`,
    "SCHEMA",
  )) as string | null;

  const sql = String(tableSql ?? "");
  const scanned: [name: string, expression: string][] = [];
  for (const match of sql.matchAll(/CONSTRAINT\s+(\w+)\s+CHECK\s+\(/gi)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < sql.length && depth > 0) {
      if (sql[i] === "(") depth++;
      else if (sql[i] === ")") depth--;
      i++;
    }
    if (depth !== 0) continue;
    scanned.push([match[1], sql.slice(start, i - 1)]);
  }
  return scanned.map(
    ([name, expression]) => new CheckConstraintDefinition(tableName, expression, { name }),
  );
}

export async function addCheckConstraint(
  this: SQLite3SchemaAdapter,
  tableName: string,
  expression: string,
  options: { name?: string; validate?: boolean } = {},
): Promise<void> {
  await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
    definition.checkConstraint(expression, options);
  });
}

export async function removeCheckConstraint(
  this: SQLite3SchemaAdapter,
  tableName: string,
  expression?:
    | string
    | { name?: string; expression?: string; validate?: boolean; ifExists?: boolean },
  options: {
    name?: string;
    expression?: string;
    validate?: boolean;
    ifExists?: boolean;
  } = {},
): Promise<void> {
  const expr = typeof expression === "string" ? expression : undefined;
  const opts =
    typeof expression === "object" ? { ...(expression ?? {}), ...options } : { ...options };

  const { ifExists, ...lookupOptions } = opts;

  if (ifExists === true && !(await this.checkConstraintExists(tableName, lookupOptions))) return;

  let checkConstraints = await this.checkConstraints(tableName);
  const chkNameToDelete = (
    await this.checkConstraintForBang(tableName, { expression: expr, ...lookupOptions })
  ).name;
  checkConstraints = checkConstraints.filter((chk) => chk.name !== chkNameToDelete);
  await this.alterTable(tableName, await this.foreignKeys(tableName), checkConstraints);
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
