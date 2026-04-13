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
import { quoteColumnName } from "./quoting.js";
import { SchemaCreation } from "./schema-creation.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";
import { SchemaDumper } from "./schema-dumper.js";

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

function resolveMasterTable(tableName: string): { masterTable: string; name: string } {
  const dotIdx = tableName.lastIndexOf(".");
  if (dotIdx === -1) return { masterTable: "sqlite_master", name: tableName };
  const schema = tableName.slice(0, dotIdx);
  const name = tableName.slice(dotIdx + 1);
  if (schema === "temp") return { masterTable: "sqlite_temp_master", name };
  return { masterTable: `${quoteColumnName(schema)}.sqlite_master`, name };
}

export async function isVirtualTableExists(
  adapter: DatabaseAdapter,
  tableName: string,
): Promise<boolean> {
  const { masterTable, name } = resolveMasterTable(tableName);
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
