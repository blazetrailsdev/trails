/**
 * SchemaStatements — DDL operations for database schema manipulation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SchemaStatements
 *
 * This is the base implementation with generic SQL. Adapter-specific
 * subclasses can override methods for dialect differences (e.g. SQLite
 * doesn't support ALTER TABLE ADD CONSTRAINT).
 */

import type { DatabaseAdapter } from "../../adapter.js";
import {
  TableDefinition,
  Table,
  IndexDefinition,
  ColumnDefinition,
  AddColumnDefinition,
  CreateIndexDefinition,
  ForeignKeyDefinition,
  type ColumnType,
  type ColumnOptions,
} from "./schema-definitions.js";
import { SchemaCreation } from "./schema-creation.js";
import { detectAdapterName } from "../../adapter-name.js";
import { quoteIdentifier, quoteDefaultExpression } from "../../quoting.js";

export class SchemaStatements {
  private _schemaCreation?: SchemaCreation;

  constructor(
    protected adapter: DatabaseAdapter,
    protected adapterName: "sqlite" | "postgres" | "mysql" = detectAdapterName(adapter),
  ) {}

  get schemaCreation(): SchemaCreation {
    if (!this._schemaCreation) {
      this._schemaCreation = new SchemaCreation(this.adapterName);
    }
    return this._schemaCreation;
  }

  protected _qi(name: string): string {
    return quoteIdentifier(name, this.adapterName);
  }

  async createTable(
    name: string,
    optionsOrFn?:
      | { id?: boolean; force?: boolean; ifNotExists?: boolean }
      | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void,
  ): Promise<void> {
    let options: { id?: boolean; force?: boolean; ifNotExists?: boolean } = {};
    let definer: ((t: TableDefinition) => void) | undefined;

    if (typeof optionsOrFn === "function") {
      definer = optionsOrFn;
    } else if (optionsOrFn) {
      options = optionsOrFn;
      definer = fn;
    }

    if (name.length > 64) {
      throw new Error(`Table name '${name}' is too long; the limit is 64 characters`);
    }

    if (options.force && options.ifNotExists) {
      throw new Error("Options `:force` and `:if_not_exists` cannot be used simultaneously.");
    }

    if (options.force) {
      if (await this.tableExists(name)) {
        await this.dropTable(name);
      }
    }

    if (options.ifNotExists && (await this.tableExists(name))) {
      return;
    }

    const td = new TableDefinition(name, { ...options, adapterName: this.adapterName });
    if (definer) definer(td);

    await this.adapter.executeMutation(td.toSql());

    for (const idx of td.indexes) {
      await this.addIndex(name, idx.columns, { unique: idx.unique, name: idx.name });
    }
  }

  async dropTable(name: string, options: { ifExists?: boolean } = {}): Promise<void> {
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    await this.adapter.executeMutation(`DROP TABLE${ifExists} ${this._qi(name)}`);
  }

  async addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { ifNotExists?: boolean } = {},
  ): Promise<void> {
    if (options.ifNotExists && (await this.columnExists(tableName, columnName))) {
      return;
    }
    const colDef = new ColumnDefinition(columnName, type, options);
    const addDef = new AddColumnDefinition(colDef);
    await this.adapter.executeMutation(
      `ALTER TABLE ${this._qi(tableName)} ${this.schemaCreation.accept(addDef)}`,
    );
  }

  async removeColumn(
    tableName: string,
    columnName: string,
    options: { ifExists?: boolean } = {},
  ): Promise<void> {
    if (options.ifExists && !(await this.columnExists(tableName, columnName))) {
      return;
    }
    await this.adapter.executeMutation(
      `ALTER TABLE ${this._qi(tableName)} DROP COLUMN ${this._qi(columnName)}`,
    );
  }

  async renameColumn(tableName: string, oldName: string, newName: string): Promise<void> {
    await this.adapter.executeMutation(
      `ALTER TABLE ${this._qi(tableName)} RENAME COLUMN ${this._qi(oldName)} TO ${this._qi(newName)}`,
    );
  }

  async addIndex(
    tableName: string,
    columns: string | string[],
    options: { unique?: boolean; name?: string } = {},
  ): Promise<void> {
    const cols = Array.isArray(columns) ? columns : [columns];
    const indexName = options.name ?? this.indexName(tableName, { column: cols });
    const indexDef = new IndexDefinition(tableName, indexName, options.unique ?? false, cols);
    const createDef = new CreateIndexDefinition(indexDef);
    await this.adapter.executeMutation(this.schemaCreation.accept(createDef));
  }

  async removeIndex(
    tableName: string,
    options: { column?: string | string[]; name?: string } = {},
  ): Promise<void> {
    let indexName: string;
    if (options.name) {
      indexName = options.name;
    } else if (options.column) {
      const cols = Array.isArray(options.column) ? options.column : [options.column];
      indexName = `index_${tableName}_on_${cols.join("_and_")}`;
    } else {
      throw new Error("Must specify either name or column for remove_index");
    }

    if (this.adapterName === "mysql") {
      await this.adapter.executeMutation(
        `DROP INDEX ${this._qi(indexName)} ON ${this._qi(tableName)}`,
      );
    } else {
      await this.adapter.executeMutation(`DROP INDEX IF EXISTS ${this._qi(indexName)}`);
    }
  }

  async changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): Promise<void> {
    const sqlType = this.schemaCreation.typeToSql(type, options);
    const table = this._qi(tableName);
    const col = this._qi(columnName);

    if (this.adapterName === "mysql") {
      const nullable = options.null === false ? " NOT NULL" : "";
      const defaultClause = quoteDefaultExpression(options.default);
      await this.adapter.executeMutation(
        `ALTER TABLE ${table} MODIFY COLUMN ${col} ${sqlType}${nullable}${defaultClause}`,
      );
    } else if (this.adapterName === "postgres") {
      const clauses: string[] = [`ALTER COLUMN ${col} TYPE ${sqlType}`];
      if (options.null !== undefined) {
        clauses.push(
          `ALTER COLUMN ${col} ${options.null === false ? "SET NOT NULL" : "DROP NOT NULL"}`,
        );
      }
      if (options.default !== undefined) {
        clauses.push(`ALTER COLUMN ${col} SET${quoteDefaultExpression(options.default)}`);
      }
      await this.adapter.executeMutation(`ALTER TABLE ${table} ${clauses.join(", ")}`);
    } else {
      const nullable = options.null === false ? " NOT NULL" : "";
      const defaultClause = quoteDefaultExpression(options.default);
      await this.adapter.executeMutation(
        `ALTER TABLE ${table} ALTER COLUMN ${col} TYPE ${sqlType}${nullable}${defaultClause}`,
      );
    }
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    await this.adapter.executeMutation(
      `ALTER TABLE ${this._qi(oldName)} RENAME TO ${this._qi(newName)}`,
    );
  }

  async tableExists(tableName: string): Promise<boolean> {
    let rows: Record<string, unknown>[];
    switch (this.adapterName) {
      case "sqlite":
        rows = await this.adapter.execute(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`,
        );
        break;
      case "postgres":
        rows = await this.adapter.execute(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName}' LIMIT 1`,
        );
        break;
      case "mysql":
        rows = await this.adapter.execute(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${tableName}' LIMIT 1`,
        );
        break;
    }
    return rows.length > 0;
  }

  async columnExists(tableName: string, columnName: string): Promise<boolean> {
    let rows: Record<string, unknown>[];
    switch (this.adapterName) {
      case "sqlite":
        rows = await this.adapter.execute(`PRAGMA table_info("${tableName}")`);
        return rows.some((row: any) => row.name === columnName);
      case "postgres":
        rows = await this.adapter.execute(
          `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' AND column_name = '${columnName}' LIMIT 1`,
        );
        return rows.length > 0;
      case "mysql":
        rows = await this.adapter.execute(
          `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${tableName}' AND column_name = '${columnName}' LIMIT 1`,
        );
        return rows.length > 0;
    }
  }

  async changeColumnDefault(
    tableName: string,
    columnName: string,
    options: { from?: unknown; to: unknown } | unknown,
  ): Promise<void> {
    const defaultVal =
      typeof options === "object" && options !== null && "to" in (options as any)
        ? (options as any).to
        : options;
    const clause = quoteDefaultExpression(defaultVal);
    await this.adapter.executeMutation(
      `ALTER TABLE ${this._qi(tableName)} ALTER COLUMN ${this._qi(columnName)} SET${clause || " DEFAULT NULL"}`,
    );
  }

  async changeColumnNull(
    tableName: string,
    columnName: string,
    allowNull: boolean,
    defaultValue?: unknown,
  ): Promise<void> {
    if (!allowNull && defaultValue !== undefined) {
      const quoted = quoteDefaultExpression(defaultValue).replace(/^ DEFAULT /, "");
      await this.adapter.executeMutation(
        `UPDATE ${this._qi(tableName)} SET ${this._qi(columnName)} = ${quoted} WHERE ${this._qi(columnName)} IS NULL`,
      );
    }
    const constraint = allowNull ? "DROP NOT NULL" : "SET NOT NULL";
    await this.adapter.executeMutation(
      `ALTER TABLE ${this._qi(tableName)} ALTER COLUMN ${this._qi(columnName)} ${constraint}`,
    );
  }

  async addReference(
    tableName: string,
    refName: string,
    options: ColumnOptions & {
      polymorphic?: boolean;
      foreignKey?: boolean;
      type?: ColumnType;
      index?: boolean;
    } = {},
  ): Promise<void> {
    const colType = options.type ?? "integer";
    await this.addColumn(tableName, `${refName}_id`, colType, options);
    if (options.polymorphic) {
      await this.addColumn(tableName, `${refName}_type`, "string", options);
    }
    if (options.index !== false) {
      const cols = options.polymorphic ? [`${refName}_id`, `${refName}_type`] : [`${refName}_id`];
      await this.addIndex(tableName, cols);
    }
  }

  async removeReference(
    tableName: string,
    refName: string,
    options: { polymorphic?: boolean } = {},
  ): Promise<void> {
    if (options.polymorphic) {
      await this.removeColumn(tableName, `${refName}_type`);
    }
    await this.removeColumn(tableName, `${refName}_id`);
  }

  async addForeignKey(
    fromTable: string,
    toTable: string,
    options: { column?: string; primaryKey?: string; name?: string } = {},
  ): Promise<void> {
    const column = options.column ?? `${toTable.replace(/s$/, "")}_id`;
    const pk = options.primaryKey ?? "id";
    const name = options.name ?? `fk_${fromTable}_${column}`;
    const fkDef = new ForeignKeyDefinition(fromTable, toTable, column, pk, name);
    await this.adapter.executeMutation(
      `ALTER TABLE ${this._qi(fromTable)} ADD ${this.schemaCreation.accept(fkDef)}`,
    );
  }

  async removeForeignKey(
    fromTable: string,
    toTableOrOptions?: string | { column?: string; name?: string },
  ): Promise<void> {
    let name: string;
    if (typeof toTableOrOptions === "string") {
      const column = `${toTableOrOptions.replace(/s$/, "")}_id`;
      name = `fk_${fromTable}_${column}`;
    } else if (toTableOrOptions?.name) {
      name = toTableOrOptions.name;
    } else if (toTableOrOptions?.column) {
      name = `fk_${fromTable}_${toTableOrOptions.column}`;
    } else {
      throw new Error("removeForeignKey requires a target table or options");
    }
    await this.adapter.executeMutation(
      `ALTER TABLE ${this._qi(fromTable)} DROP CONSTRAINT ${this._qi(name)}`,
    );
  }

  async addTimestamps(tableName: string, options: ColumnOptions = {}): Promise<void> {
    const nullable = options.null !== undefined ? options.null : false;
    await this.addColumn(tableName, "created_at", "datetime", { null: nullable });
    await this.addColumn(tableName, "updated_at", "datetime", { null: nullable });
  }

  async removeTimestamps(tableName: string): Promise<void> {
    await this.removeColumn(tableName, "created_at");
    await this.removeColumn(tableName, "updated_at");
  }

  async createJoinTable(
    table1: string,
    table2: string,
    options?: { tableName?: string } | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void,
  ): Promise<void> {
    let opts: { tableName?: string } = {};
    let definer: ((t: TableDefinition) => void) | undefined;
    if (typeof options === "function") {
      definer = options;
    } else if (options) {
      opts = options;
      definer = fn;
    }
    const tableName = opts.tableName ?? [table1, table2].sort().join("_");
    await this.createTable(tableName, { id: false }, (t) => {
      t.integer(`${table1.replace(/s$/, "")}_id`);
      t.integer(`${table2.replace(/s$/, "")}_id`);
      if (definer) definer(t);
    });
  }

  async dropJoinTable(
    table1: string,
    table2: string,
    options?: { tableName?: string },
  ): Promise<void> {
    const tableName = options?.tableName ?? [table1, table2].sort().join("_");
    await this.dropTable(tableName);
  }

  async changeTable(tableName: string, fn?: (t: Table) => void | Promise<void>): Promise<void> {
    const table = new Table(tableName, this);
    if (fn) await fn(table);
  }

  async renameIndex(_tableName: string, oldName: string, newName: string): Promise<void> {
    await this.adapter.executeMutation(
      `ALTER INDEX ${this._qi(oldName)} RENAME TO ${this._qi(newName)}`,
    );
  }

  indexName(tableName: string, options: { column?: string | string[] }): string {
    const cols = Array.isArray(options.column) ? options.column : [options.column ?? ""];
    return `index_${tableName}_on_${cols.join("_and_")}`;
  }

  async removeColumns(tableName: string, ...columns: string[]): Promise<void> {
    for (const col of columns) {
      await this.removeColumn(tableName, col);
    }
  }

  async addColumns(
    tableName: string,
    ...columns: Array<{ name: string; type: ColumnType; options?: ColumnOptions }>
  ): Promise<void> {
    for (const col of columns) {
      await this.addColumn(tableName, col.name, col.type, col.options ?? {});
    }
  }

  async columns(
    tableName: string,
  ): Promise<Array<{ name: string; type: string; null: boolean; default: unknown }>> {
    switch (this.adapterName) {
      case "sqlite": {
        const rows = await this.adapter.execute(`PRAGMA table_info("${tableName}")`);
        return rows.map((row: any) => ({
          name: row.name,
          type: row.type,
          null: row.notnull === 0,
          default: row.dflt_value,
        }));
      }
      case "postgres": {
        const rows = await this.adapter.execute(
          `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' ORDER BY ordinal_position`,
        );
        return rows.map((row: any) => ({
          name: row.column_name,
          type: row.data_type,
          null: row.is_nullable === "YES",
          default: row.column_default,
        }));
      }
      case "mysql": {
        const rows = await this.adapter.execute(
          `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${tableName}' ORDER BY ordinal_position`,
        );
        return rows.map((row: any) => ({
          name: row.COLUMN_NAME ?? row.column_name,
          type: row.DATA_TYPE ?? row.data_type,
          null: (row.IS_NULLABLE ?? row.is_nullable) === "YES",
          default: row.COLUMN_DEFAULT ?? row.column_default,
        }));
      }
    }
  }

  async indexes(
    tableName: string,
  ): Promise<Array<{ name: string; columns: string[]; unique: boolean }>> {
    switch (this.adapterName) {
      case "sqlite": {
        const rows = await this.adapter.execute(`PRAGMA index_list("${tableName}")`);
        const result: Array<{ name: string; columns: string[]; unique: boolean }> = [];
        for (const row of rows as any[]) {
          const cols = await this.adapter.execute(`PRAGMA index_info("${row.name}")`);
          result.push({
            name: row.name,
            columns: (cols as any[]).map((c: any) => c.name),
            unique: row.unique === 1,
          });
        }
        return result;
      }
      case "postgres": {
        const rows = await this.adapter.execute(
          `SELECT i.relname AS name, ix.indisunique AS unique, array_agg(a.attname ORDER BY k.n) AS columns
           FROM pg_index ix
           JOIN pg_class t ON t.oid = ix.indrelid
           JOIN pg_class i ON i.oid = ix.indexrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
           JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, n) ON true
           JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
           WHERE t.relname = '${tableName}' AND n.nspname = 'public' AND NOT ix.indisprimary
           GROUP BY i.relname, ix.indisunique`,
        );
        return rows.map((row: any) => ({
          name: row.name,
          columns: Array.isArray(row.columns) ? row.columns : [row.columns],
          unique: row.unique === true,
        }));
      }
      case "mysql": {
        const rows = await this.adapter.execute(
          `SHOW INDEX FROM \`${tableName}\` WHERE Key_name != 'PRIMARY' ORDER BY Key_name, Seq_in_index`,
        );
        const indexMap = new Map<string, { columns: string[]; unique: boolean }>();
        for (const row of rows as any[]) {
          const name = row.Key_name;
          if (!indexMap.has(name)) {
            indexMap.set(name, { columns: [], unique: row.Non_unique === 0 });
          }
          indexMap.get(name)!.columns.push(row.Column_name);
        }
        return Array.from(indexMap.entries()).map(([name, info]) => ({ name, ...info }));
      }
    }
  }

  async primaryKey(tableName: string): Promise<string | null> {
    switch (this.adapterName) {
      case "sqlite": {
        const rows = await this.adapter.execute(`PRAGMA table_info("${tableName}")`);
        const pk = (rows as any[]).find((r: any) => r.pk > 0);
        return pk ? pk.name : null;
      }
      case "postgres": {
        const rows = await this.adapter.execute(
          `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = to_regclass($1) AND i.indisprimary LIMIT 1`,
          [tableName],
        );
        return rows.length > 0 ? (rows[0] as any).attname : null;
      }
      case "mysql": {
        const rows = await this.adapter.execute(
          `SHOW KEYS FROM \`${tableName}\` WHERE Key_name = 'PRIMARY'`,
        );
        return rows.length > 0 ? (rows[0] as any).Column_name : null;
      }
    }
  }

  async foreignKeys(
    tableName: string,
  ): Promise<Array<{ from: string; to: string; column: string; primaryKey: string }>> {
    switch (this.adapterName) {
      case "sqlite": {
        const rows = await this.adapter.execute(`PRAGMA foreign_key_list("${tableName}")`);
        return (rows as any[]).map((row: any) => ({
          from: tableName,
          to: row.table,
          column: row.from,
          primaryKey: row.to,
        }));
      }
      case "postgres": {
        const rows = await this.adapter.execute(
          `SELECT kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
           JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
           WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = '${tableName}' AND tc.table_schema = 'public'`,
        );
        return rows.map((row: any) => ({
          from: tableName,
          to: row.foreign_table,
          column: row.column_name,
          primaryKey: row.foreign_column,
        }));
      }
      case "mysql": {
        const rows = await this.adapter.execute(
          `SELECT column_name, referenced_table_name, referenced_column_name
           FROM information_schema.key_column_usage
           WHERE table_schema = DATABASE() AND table_name = '${tableName}' AND referenced_table_name IS NOT NULL`,
        );
        return rows.map((row: any) => ({
          from: tableName,
          to: row.referenced_table_name ?? row.REFERENCED_TABLE_NAME,
          column: row.column_name ?? row.COLUMN_NAME,
          primaryKey: row.referenced_column_name ?? row.REFERENCED_COLUMN_NAME,
        }));
      }
    }
  }

  async tables(): Promise<string[]> {
    let rows: Record<string, unknown>[];
    switch (this.adapterName) {
      case "sqlite":
        rows = await this.adapter.execute(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        );
        return (rows as any[]).map((r: any) => r.name);
      case "postgres":
        rows = await this.adapter.execute(
          `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
        );
        return (rows as any[]).map((r: any) => r.name);
      case "mysql":
        rows = await this.adapter.execute(
          `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`,
        );
        return (rows as any[]).map((r: any) => r.name ?? r.TABLE_NAME);
    }
  }

  async views(): Promise<string[]> {
    let rows: Record<string, unknown>[];
    switch (this.adapterName) {
      case "sqlite":
        rows = await this.adapter.execute(
          `SELECT name FROM sqlite_master WHERE type='view' ORDER BY name`,
        );
        return (rows as any[]).map((r: any) => r.name);
      case "postgres":
        rows = await this.adapter.execute(
          `SELECT viewname AS name FROM pg_views WHERE schemaname = 'public' ORDER BY viewname`,
        );
        return (rows as any[]).map((r: any) => r.name);
      case "mysql":
        rows = await this.adapter.execute(
          `SELECT table_name AS name FROM information_schema.views WHERE table_schema = DATABASE() ORDER BY table_name`,
        );
        return (rows as any[]).map((r: any) => r.name ?? r.TABLE_NAME);
    }
  }

  async viewExists(viewName: string): Promise<boolean> {
    let rows: Record<string, unknown>[];
    switch (this.adapterName) {
      case "sqlite":
        rows = await this.adapter.execute(
          `SELECT name FROM sqlite_master WHERE type='view' AND name='${viewName}'`,
        );
        break;
      case "postgres":
        rows = await this.adapter.execute(
          `SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = '${viewName}' LIMIT 1`,
        );
        break;
      case "mysql":
        rows = await this.adapter.execute(
          `SELECT 1 FROM information_schema.views WHERE table_schema = DATABASE() AND table_name = '${viewName}' LIMIT 1`,
        );
        break;
    }
    return rows.length > 0;
  }

  async indexExists(
    tableName: string,
    columnName: string | string[],
    options?: { unique?: boolean; name?: string },
  ): Promise<boolean> {
    const allIndexes = await this.indexes(tableName);
    const targetCols = Array.isArray(columnName) ? columnName : [columnName];

    return allIndexes.some((idx) => {
      if (options?.name && idx.name !== options.name) return false;
      if (options?.unique !== undefined && idx.unique !== options.unique) return false;
      return (
        targetCols.length === idx.columns.length && targetCols.every((c, i) => c === idx.columns[i])
      );
    });
  }

  async foreignKeyExists(
    fromTable: string,
    toTableOrOptions?: string | { column?: string; name?: string },
  ): Promise<boolean> {
    const fks = await this.foreignKeys(fromTable);
    if (typeof toTableOrOptions === "string") {
      return fks.some((fk) => fk.to === toTableOrOptions);
    }
    if (toTableOrOptions?.column) {
      return fks.some((fk) => fk.column === toTableOrOptions.column);
    }
    return fks.length > 0;
  }

  typeToSql(type: ColumnType, options: ColumnOptions = {}): string {
    return this.schemaCreation.typeToSql(type, options);
  }
}
