/**
 * MySQL schema statements — MySQL-specific DDL operations.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements (module)
 */

import { ArgumentError } from "@blazetrails/activemodel";
import { Version } from "../abstract-adapter.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import { TypeMetadata } from "./type-metadata.js";
import { TableDefinition } from "./schema-definitions.js";
import { Column } from "./column.js";
import { quoteString } from "./quoting.js";

export interface SchemaStatements {
  createDatabase(name: string, options?: Record<string, unknown>): Promise<void>;
  dropDatabase(name: string): Promise<void>;
  currentDatabase(): Promise<string>;
  charset(): Promise<string>;
  collation(): Promise<string>;
  tables(): Promise<string[]>;
  views(): Promise<string[]>;
  dataSources(): Promise<string[]>;
  indexes(tableName: string): Promise<unknown[]>;
  primaryKeys(tableName: string): Promise<string[]>;
  foreignKeys(tableName: string): Promise<unknown[]>;
  checkConstraints(tableName: string): Promise<unknown[]>;
  tableOptions(tableName: string): Promise<Record<string, string>>;
  tableComment(tableName: string): Promise<string | null>;
  showVariable(name: string): Promise<string | null>;
  renameTable(tableName: string, newName: string): Promise<void>;
  renameIndex(tableName: string, oldName: string, newName: string): Promise<void>;
  dropTable(...tableNames: (string | Record<string, unknown>)[]): Promise<void>;
  changeColumn(
    tableName: string,
    columnName: string,
    type: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void>;
  changeColumnNull(
    tableName: string,
    columnName: string,
    null_: boolean,
    default_?: unknown,
  ): Promise<void>;
  changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: string | Record<string, string | null>,
  ): Promise<void>;
  changeTableComment(
    tableName: string,
    commentOrChanges: string | Record<string, string | null>,
  ): Promise<void>;
  renameColumn(tableName: string, columnName: string, newColumnName: string): Promise<void>;
  addIndex(
    tableName: string,
    columnName: string | string[],
    options?: Record<string, unknown>,
  ): Promise<void>;
  columns(tableName: string): Promise<unknown[]>;
  columnDefinitions(tableName: string): Promise<unknown[]>;
  removeColumn(
    tableName: string,
    columnName: string,
    type?: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  createTable(tableName: string, options?: Record<string, unknown>): Promise<void>;
  removeForeignKey(
    fromTable: string,
    toTable?: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  internalStringOptionsForPrimaryKey(): Record<string, unknown>;
  updateTableDefinition(tableName: string, base: unknown): unknown;
  createSchemaDumper(options?: Record<string, unknown>): unknown;
  typeToSql(type: string, options?: Record<string, unknown>): string;
  tableAliasLength(): number;
  schemaCreation(): unknown;
}

/** @internal */
export function isRowFormatDynamicByDefault(isMariaDb: boolean, databaseVersion: string): boolean {
  const v = new Version(databaseVersion.replace(/-.*$/, ""));
  return isMariaDb ? v.gte("10.2.2") : v.gte("5.7.9");
}

/** @internal */
export function defaultRowFormat(
  isMariaDb: boolean,
  databaseVersion: string,
  innodbFilePerTable: boolean,
  innodbFileFormatBarracuda: boolean,
): string | null {
  if (isRowFormatDynamicByDefault(isMariaDb, databaseVersion)) return null;
  if (innodbFilePerTable && innodbFileFormatBarracuda) return "ROW_FORMAT=DYNAMIC";
  return null;
}

/** @internal */
export function validPrimaryKeyOptions(): string[] {
  return ["limit", "default", "precision", "unsigned", "autoIncrement"];
}

/** @internal */
export function createTableDefinition(
  name: string,
  options: Record<string, unknown> = {},
): TableDefinition {
  return new TableDefinition(name, options as any);
}

/** @internal */
export function defaultType(
  createTableInfo: string | null,
  fieldName: string,
): "string" | "integer" | "function" | undefined {
  if (!createTableInfo) return undefined;
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = createTableInfo.match(new RegExp("`" + escaped + "` (.+) DEFAULT ('|\\d+|[A-z]+)"));
  const defaultPre = match?.[2];
  if (defaultPre === "'") return "string";
  if (defaultPre?.match(/^\d+$/)) return "integer";
  if (defaultPre?.match(/^[A-z]+$/)) return "function";
  return undefined;
}

/** @internal */
export function newColumnFromField(
  tableName: string,
  field: Record<string, string | null>,
  createTableInfoFn: (tableName: string) => string | null,
): Column {
  const fieldName = field["Field"] ?? "";
  const meta = fetchTypeMetadata(field["Type"] ?? "", field["Extra"] ?? "");
  let def: string | null = field["Default"] ?? null;
  let defFn: string | null = null;

  if (meta.type === "datetime" && /^CURRENT_TIMESTAMP(\([0-6]?\))?$/i.test(def ?? "")) {
    if (/on update CURRENT_TIMESTAMP/i.test(field["Extra"] ?? "")) def = `${def} ON UPDATE ${def}`;
    [def, defFn] = [null, def];
  } else if (meta.extra === "DEFAULT_GENERATED") {
    if (def != null && !def.startsWith("(")) def = `(${def})`;
    [def, defFn] = [null, def?.replace(/\\'/g, "'") ?? null];
  } else if (meta.type === "text" && def?.startsWith("'")) {
    def = def.slice(1, -1).replace(/\\'/g, "'");
  } else if (def != null && !/^\d/.test(def)) {
    if (defaultType(createTableInfoFn(tableName), fieldName) === "function")
      [def, defFn] = [null, def];
  }

  return new Column(fieldName, def, meta, field["Null"] === "YES", {
    defaultFunction: defFn ?? undefined,
    collation: field["Collation"] ?? null,
    unsigned: /unsigned/i.test(field["Type"] ?? ""),
    autoIncrement: /auto_increment/i.test(field["Extra"] ?? ""),
    virtual: /VIRTUAL GENERATED|STORED GENERATED/i.test(field["Extra"] ?? ""),
  });
}

/** @internal */
export function fetchTypeMetadata(sqlType: string, extra: string = ""): TypeMetadata {
  // Strip modifiers and normalize: "datetime(6)" → "datetime", "timestamp(3)" → "datetime"
  // (MySQL alias_type maps timestamp → datetime in the abstract type map).
  let baseType = sqlType
    .replace(/\(.*\).*$/, "")
    .trim()
    .toLowerCase();
  if (/^timestamp/.test(baseType)) baseType = "datetime";
  const meta = new SqlTypeMetadata({ sqlType, type: baseType });
  return new TypeMetadata(meta, { extra });
}

/** @internal */
export function extractForeignKeyAction(specifier: string): "cascade" | "nullify" | undefined {
  // RESTRICT is MySQL's default; omit it so FK definitions stay clean.
  if (specifier === "RESTRICT") return undefined;
  switch (specifier) {
    case "CASCADE":
      return "cascade";
    case "SET NULL":
      return "nullify";
    default:
      return undefined;
  }
}

/** @internal */
export function addIndexLength(
  quotedColumns: Map<string, string>,
  options: { length?: Record<string, number> | number } = {},
): Map<string, string> {
  if (options.length == null) return quotedColumns;
  const lengthMap = typeof options.length === "object" ? options.length : null;
  const scalar = typeof options.length === "number" ? options.length : null;
  for (const [name, col] of quotedColumns) {
    const len = lengthMap ? lengthMap[name] : scalar;
    if (len != null) quotedColumns.set(name, `${col}(${len})`);
  }
  return quotedColumns;
}

/** @internal */
export function addOptionsForIndexColumns(
  quotedColumns: Map<string, string>,
  options: {
    length?: Record<string, number> | number;
    order?: Record<string, string> | string;
  } = {},
): Map<string, string> {
  quotedColumns = addIndexLength(quotedColumns, options);
  if (options.order) {
    const orders = typeof options.order === "object" ? options.order : {};
    for (const [name, col] of quotedColumns) {
      const dir = typeof options.order === "string" ? options.order : orders[name];
      if (dir) quotedColumns.set(name, `${col} ${dir.toUpperCase()}`);
    }
  }
  return quotedColumns;
}

/** @internal */
export function dataSourceSql(name?: string | null, options: { type?: string } = {}): string {
  const scope = quotedScope(name, options);
  let sql = `SELECT table_name FROM information_schema.tables WHERE table_schema = ${scope.schema}`;
  if (scope.name) {
    sql += ` AND table_name = ${scope.name}`;
    sql += ` AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = ${scope.schema})`;
  }
  if (scope.type) sql += ` AND table_type = ${scope.type}`;
  return sql;
}

/** @internal */
export function quotedScope(
  name?: string | null,
  options: { type?: string } = {},
): { schema: string; name?: string; type?: string } {
  const [schema, tableName] = extractSchemaQualifiedName(name);
  const scope: { schema: string; name?: string; type?: string } = {
    schema: schema ? quoteString(schema) : "database()",
  };
  if (tableName) scope.name = quoteString(tableName);
  if (options.type) scope.type = quoteString(options.type);
  return scope;
}

/** @internal */
export function extractSchemaQualifiedName(
  str: string | null | undefined,
): [string | null, string | null] {
  const parts = (str ?? "").match(/[^`.\s]+|`[^`]*`/g) ?? [];
  if (parts.length >= 2) {
    return [parts[0]!.replace(/^`|`$/g, ""), parts[1]!.replace(/^`|`$/g, "")];
  }
  if (parts.length === 1) {
    return [null, parts[0].replace(/^`|`$/g, "")];
  }
  return [null, null];
}

/** @internal */
export function typeWithSizeToSql(type: string, size: string | null | undefined): string {
  const s = size?.toString();
  if (s === undefined || s === "tiny" || s === "medium" || s === "long") {
    return `${s ?? ""}${type}`;
  }
  throw new ArgumentError(
    `${JSON.stringify(size)} is invalid :size value. Only :tiny, :medium, and :long are allowed.`,
  );
}

/** @internal */
export function limitToSize(limit: number | null | undefined, type: string): string | undefined {
  switch (type) {
    case "text":
    case "blob":
    case "binary": {
      if (limit == null || (limit >= 0x100 && limit <= 0xffff)) return undefined;
      if (limit >= 0 && limit <= 0xff) return "tiny";
      if (limit >= 0x10000 && limit <= 0xffffff) return "medium";
      if (limit >= 0x1000000 && limit <= 0xffffffff) return "long";
      throw new ArgumentError(`No ${type} type has byte size ${limit}`);
    }
    default:
      return undefined;
  }
}

/** @internal */
export function integerToSql(limit: number | null | undefined): string {
  switch (limit) {
    case 1:
      return "tinyint";
    case 2:
      return "smallint";
    case 3:
      return "mediumint";
    case null:
    case undefined:
    case 4:
      return "int";
    default:
      if (limit >= 5 && limit <= 8) return "bigint";
      throw new ArgumentError(
        `No integer type has byte size ${limit}. Use a decimal with scale 0 instead.`,
      );
  }
}
