import { changedIndexes, changesApplied } from "./attribute-methods.js";
import type { Base } from "./base.js";
import { quoteColumnName } from "./connection-handling.js";
import type { ModelSchema } from "./model-schema.js";
import { serialize } from "./type.js";

/** Builds a persisted record around a row the database returned, with no copy. */
export function instantiate(schema: ModelSchema, row: unknown[]): Base {
  const record = Object.create(schema.klass.prototype) as Base;
  record._row = row;
  record._original = null;
  record._newRecord = false;
  record._destroyed = false;
  record._associationCache = null;
  return record;
}

export function save(record: Base): boolean {
  if (record._newRecord) createRecord(record);
  else updateRecord(record);
  changesApplied(record);
  return true;
}

function createRecord(record: Base): void {
  const { columns, types, quotedTableName, primaryKey, primaryKeyIndex, klass } = record._schema;
  const indexes = changedIndexes(record);
  const names = indexes.map((i) => quoteColumnName(columns[i].name));
  const values =
    indexes.length > 0
      ? `(${names.join(", ")}) VALUES (${indexes.map(() => "?").join(", ")})`
      : "DEFAULT VALUES";
  const sql = `INSERT INTO ${quotedTableName} ${values} RETURNING ${quoteColumnName(primaryKey)}`;
  const binds = indexes.map((i) => serialize(types[i], record._row[i]));
  const returned = klass.connection.selectRow(sql, binds);
  if (primaryKeyIndex >= 0 && returned !== undefined) record._row[primaryKeyIndex] = returned[0];
  record._newRecord = false;
}

function updateRecord(record: Base): void {
  const { columns, types, quotedTableName, primaryKey, primaryKeyIndex, klass } = record._schema;
  const indexes = changedIndexes(record);
  if (indexes.length === 0) return;
  const assignments = indexes.map((i) => `${quoteColumnName(columns[i].name)} = ?`);
  const sql =
    `UPDATE ${quotedTableName} SET ${assignments.join(", ")} ` +
    `WHERE ${quotedTableName}.${quoteColumnName(primaryKey)} = ?`;
  const binds = indexes.map((i) => serialize(types[i], record._row[i]));
  binds.push(record._original![primaryKeyIndex]);
  klass.connection.execute(sql, binds);
}

export function destroy(record: Base): void {
  const { quotedTableName, primaryKey, primaryKeyIndex, klass } = record._schema;
  if (!record._newRecord && !record._destroyed) {
    const id = (record._original ?? record._row)[primaryKeyIndex];
    klass.connection.execute(
      `DELETE FROM ${quotedTableName} WHERE ${quotedTableName}.${quoteColumnName(primaryKey)} = ?`,
      [id],
    );
  }
  record._destroyed = true;
}
