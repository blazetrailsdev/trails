import type { Base } from "./base.js";
import { quoteColumnName, quote } from "./connection-handling.js";
import { ActiveRecordError, UnknownPrimaryKey } from "./errors.js";
import { cast, lookupCastType, type ColumnType } from "./type.js";

export interface Column {
  readonly name: string;
  readonly type: ColumnType;
  readonly index: number;
}

export type AttributeReader = (this: Base) => unknown;
export type AttributeWriter = (record: Base, value: unknown) => void;

/**
 * Everything a model class knows about its table, built once from the live
 * database. A record reaches it through its prototype, so a record carries no
 * per-instance metadata.
 */
export interface ModelSchema {
  readonly klass: typeof Base;
  readonly tableName: string;
  readonly quotedTableName: string;
  readonly columns: readonly Column[];
  readonly types: readonly ColumnType[];
  readonly columnIndex: ReadonlyMap<string, number>;
  readonly primaryKey: string | null;
  readonly primaryKeyIndex: number;
  readonly readers: AttributeReader[];
  readonly writers: Map<string, AttributeWriter>;
  readonly defaultRow: readonly unknown[];
  readonly selectSql: string;
  readonly findSql: string;
}

const models = new Map<string, typeof Base>();

export function registerModel(klass: typeof Base): void {
  models.set(klass.name, klass);
}

export function lookupModel(name: string): typeof Base {
  const klass = models.get(name);
  if (klass === undefined) throw new ActiveRecordError(`Missing model class ${name}`);
  return klass;
}

interface TableInfoRow {
  name: string;
  type: string;
  pk: number;
  dflt_value: string | null;
}

function columnDefault(type: ColumnType, literal: string | null): unknown {
  if (literal === null || /^null$/i.test(literal)) return null;
  const quoted = /^'((?:[^']|'')*)'$/.exec(literal);
  if (quoted !== null) return cast(type, quoted[1].replaceAll("''", "'"));
  return /^-?\d+(\.\d+)?$/.test(literal) ? cast(type, Number(literal)) : null;
}

export function reflectSchema(klass: typeof Base): ModelSchema {
  const tableName = klass.tableName;
  if (tableName == null) {
    throw new ActiveRecordError(`${klass.name} sets no tableName, and the spike infers none`);
  }
  const info = klass.connection.raw
    .prepare(`PRAGMA table_info(${quote(tableName)})`)
    .all() as TableInfoRow[];
  if (info.length === 0) throw new ActiveRecordError(`Could not find table '${tableName}'`);

  const columns = info.map((row, index) => ({
    name: row.name,
    type: lookupCastType(row.type),
    index,
  }));
  const primaryKey =
    info.find((row) => row.pk === 1)?.name ?? (info.some((row) => row.name === "id") ? "id" : null);
  const quotedTableName = quoteColumnName(tableName);
  const selectSql = `SELECT ${quotedTableName}.* FROM ${quotedTableName}`;
  const columnIndex = new Map(columns.map((column) => [column.name, column.index]));
  return {
    klass,
    tableName,
    quotedTableName,
    columns,
    types: columns.map((column) => column.type),
    columnIndex,
    primaryKey,
    primaryKeyIndex: primaryKey === null ? -1 : columnIndex.get(primaryKey)!,
    readers: [],
    writers: new Map(),
    defaultRow: columns.map((column, i) => columnDefault(column.type, info[i].dflt_value)),
    selectSql,
    findSql: `${selectSql} WHERE ${quotedTableName}.${quoteColumnName(primaryKey ?? "id")} = ? LIMIT 1`,
  };
}

/** The primary key's name, raising as ActiveRecord does for a table that has none. */
export function primaryKeyBang(schema: ModelSchema): string {
  if (schema.primaryKey === null) throw new UnknownPrimaryKey(schema.klass);
  return schema.primaryKey;
}
