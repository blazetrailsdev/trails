/**
 * Schema dumper — dumps database schema to a DSL string.
 *
 * Mirrors: ActiveRecord::SchemaDumper
 *
 * Bridges the database adapter's introspection (SchemaStatements) to the
 * abstract SchemaDumper's SchemaSource interface.
 */

import type { DatabaseAdapter } from "./adapter.js";
import { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";
import {
  SchemaDumper as AbstractSchemaDumper,
  type SchemaSource,
  type ColumnInfo,
  type IndexInfo,
} from "./connection-adapters/abstract/schema-dumper.js";
import { SchemaMigration } from "./schema-migration.js";

class AdapterSchemaSource implements SchemaSource {
  private _schema: SchemaStatements;

  constructor(adapter: DatabaseAdapter) {
    this._schema = new SchemaStatements(adapter);
  }

  async tables(): Promise<string[]> {
    return this._schema.tables();
  }

  async columns(tableName: string): Promise<ColumnInfo[]> {
    const cols = await this._schema.columns(tableName);
    return cols.map((col) => ({
      name: col.name,
      type: col.sqlType || col.type || "unknown",
      primaryKey: col.primaryKey,
      null: col.null,
      default: col.default,
      limit: col.limit ?? undefined,
      precision: col.precision ?? undefined,
      scale: col.scale ?? undefined,
    }));
  }

  async indexes(tableName: string): Promise<IndexInfo[]> {
    const idxs = await this._schema.indexes(tableName);
    return idxs.map((idx) => ({
      columns: idx.columns,
      unique: idx.unique,
      name: idx.name,
    }));
  }
}

export class SchemaDumper {
  private _adapter: DatabaseAdapter;

  constructor(adapter: DatabaseAdapter) {
    this._adapter = adapter;
  }

  static async dump(adapter: DatabaseAdapter): Promise<string> {
    const dumper = new SchemaDumper(adapter);
    return dumper.dump();
  }

  async dump(): Promise<string> {
    const source = new AdapterSchemaSource(this._adapter);
    return await AbstractSchemaDumper.dump(source);
  }

  async dumpWithVersion(): Promise<string> {
    const schemaMigration = new SchemaMigration(this._adapter);
    let version = "0";
    if (await schemaMigration.tableExists()) {
      const versions = await schemaMigration.allVersions();
      if (versions.length > 0) {
        version = versions[versions.length - 1];
      }
    }

    const schema = await this.dump();
    return `// Schema version: ${version}\n${schema}`;
  }
}
