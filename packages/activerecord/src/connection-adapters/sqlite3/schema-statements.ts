import { ArgumentError } from "@blazetrails/activemodel";
import { any, isPresent, pluralize, symbolizeKeys } from "@blazetrails/activesupport";
import {
  except,
  hashDelete,
  rbInspect,
  rbObjAsString as toS,
  slice,
} from "@blazetrails/ruby-compat";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import type {
  AddForeignKeyOptions,
  ForeignKeyDefinition,
  RemoveForeignKeyOptions,
} from "../abstract/schema-definitions.js";
import { CheckConstraintDefinition } from "../abstract/schema-definitions.js";
import { TableDefinition as SQLite3TableDefinition } from "./schema-definitions.js";
import { IndexDefinition } from "../abstract/schema-definitions.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import { ActiveRecord } from "../../namespaces.js";
import { SchemaStatements as AbstractSchemaStatements } from "../abstract/schema-statements.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";
import { SchemaCreation } from "./schema-creation.js";
import { SchemaDumper } from "./schema-dumper.js";
import { Column } from "./column.js";
import { quoteTableName } from "./quoting.js";

interface SQLite3SchemaAdapter extends DatabaseAdapter {
  /** @internal */
  extractValueFromDefault(default_: string | null): string | Uint8Array | null;
  /** @internal */
  extractDefaultFunction(defaultValue: unknown, default_: string | null): string | null;
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
  fetchTypeMetadata(
    sqlType: string | null,
    ..._rest: unknown[]
  ): SqlTypeMetadata | Promise<SqlTypeMetadata>;
  alterTable(
    tableName: string,
    foreignKeys?: ForeignKeyDefinition[],
    checkConstraints?: CheckConstraintDefinition[],
    options?: { rename?: Record<string, string> },
    block?: (definition: SQLite3TableDefinition) => void,
  ): Promise<void>;
}

export async function indexes(
  this: SQLite3SchemaAdapter,
  tableName: string,
): Promise<IndexDefinition[]> {
  const rows = (
    await this.internalExecQuery(`PRAGMA index_list(${quoteTableName(tableName)})`, "SCHEMA")
  ).toArray() as Array<{ name: string; unique: number; origin: string }>;
  const result: IndexDefinition[] = [];
  for (const idx of rows) {
    if (idx.name.startsWith("sqlite_")) continue;

    const indexSql = (await this.queryValue(
      `SELECT sql FROM sqlite_master WHERE name = ${this.quote(idx.name)} AND type = 'index' ` +
        `UNION ALL ` +
        `SELECT sql FROM sqlite_temp_master WHERE name = ${this.quote(idx.name)} AND type = 'index'`,
      "SCHEMA",
    )) as string | null | undefined;
    const match = indexSql ? INDEX_ON_REGEX.exec(indexSql) : null;
    const expressions = match?.groups?.expressions;
    let where = match?.groups?.where;
    if (where != null) where = where.replace(/\s*\/\*.*\*\/$/, "");

    const cols = (
      await this.internalExecQuery(`PRAGMA index_info(${this.quote(idx.name)})`, "SCHEMA")
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

/** @inventedArm if — CONVERGEABLE optional-positional-before-trailing-options-or-block-is-overloaded-on-typeof */
export async function removeForeignKey(
  this: SQLite3SchemaAdapter,
  fromTable: string,
  toTable?: string | RemoveForeignKeyOptions,
  options: RemoveForeignKeyOptions = {},
): Promise<void> {
  if (typeof toTable === "object" && toTable !== null) {
    options = { ...toTable, ...options };
    toTable = undefined;
  } else {
    options = { ...options };
  }
  if (
    hashDelete<unknown>(options as Record<string, unknown>, "ifExists") === true &&
    !(await this.foreignKeyExists(fromTable, toTable))
  ) {
    return;
  }

  toTable ??= options.toTable;
  options = except(options as Record<string, unknown>, "name", "toTable", "validate");
  const foreignKeys = await this.foreignKeys(fromTable);

  const fkey = foreignKeys.find((fk) => {
    let table: string;
    if (toTable != null) {
      table = toTable;
    } else {
      table = toS(options.column).replace(/_id$/, "");
      table = ActiveRecord.Base.pluralizeTableNames ? pluralize(table) : table;
    }
    table = this.stripTableNamePrefixAndSuffix(table);
    const fkOptions = fk.options as Record<string, unknown>;
    options = slice(options as Record<string, unknown>, ...Object.keys(fkOptions));
    const fkToTable = this.stripTableNamePrefixAndSuffix(fk.toTable);
    return (
      fkToTable === table && Object.entries(options).every(([k, v]) => toS(fkOptions[k]) === toS(v))
    );
  });

  if (!fkey) {
    throw new ArgumentError(
      `Table '${fromTable}' has no foreign key for ${toTable ?? toS(symbolizeKeys(options as Record<string, unknown>))}`,
    );
  }

  foreignKeys.splice(foreignKeys.indexOf(fkey), 1);
  await this.alterTable(fromTable, foreignKeys);
}

export async function virtualTableExists(
  this: SQLite3SchemaAdapter,
  tableName: string,
): Promise<boolean> {
  return any(
    await this.queryValues(this.dataSourceSql(tableName, { type: "VIRTUAL TABLE" }), "SCHEMA"),
  );
}

/**
 * @inventedArm loop — CONVERGEABLE top-level-arms-awaiting-a-permanence-ruling-kwargs-finite-regex-recursion-env-inquirer
 * @inventedArm if — CONVERGEABLE top-level-arms-awaiting-a-permanence-ruling-kwargs-finite-regex-recursion-env-inquirer
 */
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

const INDEX_ON_REGEX =
  /\bON\b\s*"?(\w+?)"?\s*\((?<expressions>.+?)\)(?:\s*WHERE\b\s*(?<where>.+))?(?:\s*\/\*.*\*\/)?$/i;

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

/** @inventedArm if — CONVERGEABLE optional-positional-before-trailing-options-or-block-is-overloaded-on-typeof */
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

export function createSchemaDumper(
  this: DatabaseAdapter,
  options: Record<string, unknown>,
): AbstractSchemaDumper {
  return SchemaDumper.create(this, options);
}

export function schemaCreation(this: DatabaseAdapter): SchemaCreation {
  return new SchemaCreation(this);
}

/** @internal */
export function validTableDefinitionOptions(this: DatabaseAdapter): string[] {
  return [...AbstractSchemaStatements.prototype.validTableDefinitionOptions.call(this), "rename"];
}

/** @internal */
export function createTableDefinition(
  this: DatabaseAdapter,
  name: string,
  options: Record<string, unknown> = {},
): SQLite3TableDefinition {
  return new SQLite3TableDefinition(this, name, options);
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

/** @internal */
export function newColumnFromField(
  this: SQLite3SchemaAdapter,
  _tableName: string,
  field: Record<string, unknown>,
  definitions: Record<string, unknown>[],
): Column {
  const default_ = field["dflt_value"] as string | null;

  const typeMetadata = this.fetchTypeMetadata(field["type"] as string) as SqlTypeMetadata;
  const defaultValue = this.extractValueFromDefault(default_);
  const generatedType = extractGeneratedType(field);

  let defaultFunction: string | null;
  if (isPresent(generatedType)) {
    defaultFunction = default_;
  } else {
    defaultFunction = this.extractDefaultFunction(defaultValue, default_);
  }

  const rowid = isColumnTheRowid(field, definitions);

  return Column.new(
    field["name"] as string,
    defaultValue,
    typeMetadata,
    Number(field["notnull"]) === 0,
    defaultFunction,
    {
      collation: field["collation"] as string | null,
      autoIncrement: field["auto_increment"] as boolean | undefined,
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
export function dataSourceSql(
  this: QuotedScopeHost,
  name: string | null = null,
  { type }: { type?: string } = {},
): string {
  const scope = quotedScope.call(this, name ?? undefined, { type });
  scope.type ||= "'table','view'";

  let sql = "SELECT name FROM pragma_table_list WHERE schema <> 'temp'";
  sql += " AND name NOT IN ('sqlite_sequence', 'sqlite_schema')";
  if (scope.name) sql += ` AND name = ${scope.name}`;
  sql += ` AND type IN (${scope.type})`;
  return sql;
}

type QuotedScopeHost = { quote(value: unknown): string };

/** @internal */
export function quotedScope(
  this: QuotedScopeHost,
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
  if (name != null) scope.name = this.quote(name);
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
    `deferrable must be \`:immediate\` or \`:deferred\`, got: \`${rbInspect(deferrable)}\``,
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
