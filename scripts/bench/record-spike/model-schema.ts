import type { Base } from "./base.js";
import { quoteColumnName, quote } from "./connection-handling.js";
import { ActiveRecordError } from "./errors.js";
import { lookupCastType, type ColumnType } from "./type.js";

export interface Column {
  readonly name: string;
  readonly type: ColumnType;
  readonly index: number;
}

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
  readonly primaryKey: string;
  readonly primaryKeyIndex: number;
  readonly writers: Map<string, AttributeWriter>;
  readonly blankRow: readonly null[];
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
}

export function loadSchema(klass: typeof Base): ModelSchema {
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
  const primaryKey = info.find((row) => row.pk === 1)?.name ?? "id";
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
    primaryKeyIndex: columnIndex.get(primaryKey) ?? -1,
    writers: new Map(),
    blankRow: columns.map(() => null),
    selectSql,
    findSql: `${selectSql} WHERE ${quotedTableName}.${quoteColumnName(primaryKey)} = ? LIMIT 1`,
  };
}
