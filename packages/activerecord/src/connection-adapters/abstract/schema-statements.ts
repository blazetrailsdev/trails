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
  AlterTable,
  IndexDefinition,
  ColumnDefinition,
  AddColumnDefinition,
  CreateIndexDefinition,
  ForeignKeyDefinition,
  CheckConstraintDefinition,
  type AddForeignKeyOptions,
  type ColumnType,
  type ColumnOptions,
} from "./schema-definitions.js";
import { SchemaCreation } from "./schema-creation.js";
import { detectAdapterName } from "../../adapter-name.js";
import { quoteIdentifier, quoteDefaultExpression, quoteTableName, quote } from "./quoting.js";
import { Column } from "../column.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import { deduplicate } from "../deduplicable.js";
import { singularize, getCrypto } from "@blazetrails/activesupport";
import { SchemaDumper } from "./schema-dumper.js";

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

  protected _qt(tableName: string): string {
    return quoteTableName(tableName, this.adapterName);
  }

  async createTable(
    name: string,
    optionsOrFn?:
      | { id?: boolean | "uuid"; force?: boolean; ifNotExists?: boolean }
      | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void,
  ): Promise<void> {
    let options: {
      id?: boolean | "uuid";
      force?: boolean;
      ifNotExists?: boolean;
    } = {};
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
    options: {
      unique?: boolean;
      name?: string;
      where?: string;
      order?: Record<string, string>;
      ifNotExists?: boolean;
    } = {},
  ): Promise<void> {
    const cols = Array.isArray(columns) ? columns : [columns];
    const indexName = options.name ?? this.indexName(tableName, { column: cols });
    const indexDef = new IndexDefinition(
      tableName,
      indexName,
      options.unique ?? false,
      cols,
      options.where,
      options.order ?? {},
    );
    const createDef = new CreateIndexDefinition(indexDef, options.ifNotExists ?? false);
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
    options: AddForeignKeyOptions = {},
  ): Promise<void> {
    const column = options.column ?? `${toTable.replace(/s$/, "")}_id`;
    const pk = options.primaryKey ?? "id";
    const name = options.name ?? `fk_${fromTable}_${column}`;
    const fkDef = new ForeignKeyDefinition(
      fromTable,
      toTable,
      column,
      pk,
      name,
      options.onDelete,
      options.onUpdate,
    );
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

  async addCheckConstraint(
    tableName: string,
    expression: string,
    options: { name?: string; validate?: boolean } = {},
  ): Promise<void> {
    const name = options.name ?? this._checkConstraintName(tableName, expression);
    const validate = options.validate !== false;
    const chkDef = new CheckConstraintDefinition(tableName, expression, name, validate);
    await this.adapter.executeMutation(
      `ALTER TABLE ${this._qi(tableName)} ADD ${this.schemaCreation.accept(chkDef)}`,
    );
  }

  async removeCheckConstraint(
    tableName: string,
    expressionOrOptions?: string | { name?: string },
  ): Promise<void> {
    let name: string;
    if (typeof expressionOrOptions === "string") {
      name = this._checkConstraintName(tableName, expressionOrOptions);
    } else if (expressionOrOptions?.name) {
      name = expressionOrOptions.name;
    } else {
      throw new Error("removeCheckConstraint requires either an expression or { name } option");
    }
    await this.adapter.executeMutation(
      `ALTER TABLE ${this._qi(tableName)} DROP CONSTRAINT ${this._qi(name)}`,
    );
  }

  _checkConstraintName(tableName: string, expression: string): string {
    let hash = 0;
    for (let i = 0; i < expression.length; i++) {
      hash = ((hash << 5) - hash + expression.charCodeAt(i)) | 0;
    }
    const hex = (hash >>> 0).toString(16).padStart(8, "0");
    return `chk_${tableName}_${hex}`;
  }

  async addTimestamps(tableName: string, options: ColumnOptions = {}): Promise<void> {
    const opts: ColumnOptions = { ...options, null: options.null ?? false };
    await this.addColumn(tableName, "created_at", "datetime", opts);
    await this.addColumn(tableName, "updated_at", "datetime", opts);
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

  async columns(tableName: string): Promise<Column[]> {
    switch (this.adapterName) {
      case "sqlite": {
        const rows = await this.adapter.execute(`PRAGMA table_info("${tableName}")`);
        return rows.map((row: any) => {
          const meta = deduplicate(new SqlTypeMetadata({ sqlType: row.type, type: row.type }));
          return new Column(row.name, row.dflt_value, meta, row.notnull === 0, {
            primaryKey: row.pk > 0,
          });
        });
      }
      case "postgres": {
        const rows = await this.adapter.execute(
          `SELECT c.column_name, c.data_type, c.udt_name, c.character_maximum_length, c.numeric_precision, c.numeric_scale, c.is_nullable, c.column_default,
            CASE WHEN pk.attname IS NOT NULL THEN true ELSE false END AS is_primary_key
          FROM information_schema.columns c
          LEFT JOIN (
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = to_regclass($1) AND i.indisprimary
          ) pk ON pk.attname = c.column_name
          WHERE c.table_schema = 'public' AND c.table_name = $1
          ORDER BY c.ordinal_position`,
          [tableName],
        );
        return rows.map((row: any) => {
          let sqlType: string = row.data_type;
          if (row.data_type === "ARRAY") {
            sqlType = `${row.udt_name.replace(/^_/, "")}[]`;
          } else if (row.data_type === "USER-DEFINED") {
            sqlType = row.udt_name;
          } else if (row.character_maximum_length) {
            sqlType = `${row.udt_name}(${row.character_maximum_length})`;
          } else if (
            row.numeric_precision != null &&
            row.numeric_scale != null &&
            (row.udt_name === "numeric" || row.udt_name === "decimal")
          ) {
            sqlType = `numeric(${row.numeric_precision},${row.numeric_scale})`;
          }
          const meta = deduplicate(
            new SqlTypeMetadata({
              sqlType,
              type: row.udt_name,
              limit: row.character_maximum_length ?? null,
              precision: row.numeric_precision ?? null,
              scale: row.numeric_scale ?? null,
            }),
          );
          return new Column(row.column_name, row.column_default, meta, row.is_nullable === "YES", {
            primaryKey: row.is_primary_key === true,
          });
        });
      }
      case "mysql": {
        const rows = await this.adapter.execute(
          `SELECT column_name, column_key, data_type, character_maximum_length, numeric_precision, numeric_scale, is_nullable, column_default FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position`,
          [tableName],
        );
        return rows.map((row: any) => {
          const name = row.COLUMN_NAME ?? row.column_name;
          let sqlType: string = row.DATA_TYPE ?? row.data_type;
          const maxLen = row.CHARACTER_MAXIMUM_LENGTH ?? row.character_maximum_length;
          const precision = row.NUMERIC_PRECISION ?? row.numeric_precision;
          const scale = row.NUMERIC_SCALE ?? row.numeric_scale;
          if (maxLen != null && (sqlType === "varchar" || sqlType === "char")) {
            sqlType = `${sqlType}(${maxLen})`;
          } else if (
            precision != null &&
            scale != null &&
            (sqlType === "decimal" || sqlType === "numeric")
          ) {
            sqlType = `${sqlType}(${precision},${scale})`;
          }
          const meta = deduplicate(
            new SqlTypeMetadata({
              sqlType,
              type: row.DATA_TYPE ?? row.data_type,
              limit: maxLen ?? null,
              precision: precision ?? null,
              scale: scale ?? null,
            }),
          );
          return new Column(
            name,
            row.COLUMN_DEFAULT ?? row.column_default,
            meta,
            (row.IS_NULLABLE ?? row.is_nullable) === "YES",
            {
              primaryKey: (row.COLUMN_KEY ?? row.column_key) === "PRI",
            },
          );
        });
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
          `SHOW INDEX FROM ${quoteIdentifier(tableName, "mysql")} WHERE Key_name != 'PRIMARY'`,
        );
        const indexMap = new Map<string, { unique: boolean; seqs: [number, string][] }>();
        for (const row of rows as any[]) {
          const name = row.Key_name;
          if (!indexMap.has(name)) {
            indexMap.set(name, { unique: row.Non_unique === 0, seqs: [] });
          }
          indexMap.get(name)!.seqs.push([row.Seq_in_index, row.Column_name]);
        }
        return Array.from(indexMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, info]) => {
            info.seqs.sort((a, b) => a[0] - b[0]);
            return { name, columns: info.seqs.map((s) => s[1]), unique: info.unique };
          });
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

  // ---------------------------------------------------------------------------
  // Methods below match the Rails SchemaStatements API surface.
  // ---------------------------------------------------------------------------

  nativeDatabaseTypes(): Record<string, unknown> {
    return {};
  }

  tableOptions(_tableName: string): Record<string, unknown> | null {
    return null;
  }

  tableComment(_tableName: string): string | null {
    return null;
  }

  tableAliasFor(tableName: string): string {
    const maxLen = this.tableAliasLength();
    return tableName.slice(0, maxLen).replace(/\./g, "_");
  }

  protected tableAliasLength(): number {
    return 64;
  }

  async dataSources(): Promise<string[]> {
    const t = await this.tables();
    const v = await this.views();
    return [...new Set([...t, ...v])];
  }

  async isDataSourceExists(name: string): Promise<boolean> {
    if (!name) return false;
    if (await this.tableExists(name)) return true;
    return this.viewExists(name);
  }

  buildCreateTableDefinition(
    tableName: string,
    options: {
      id?: boolean | "uuid" | false;
      primaryKey?: string;
      force?: boolean;
      [key: string]: unknown;
    } = {},
    fn?: (td: TableDefinition) => void,
  ): TableDefinition {
    const hasCustomPk = !!options.primaryKey && options.id !== false;
    const td = new TableDefinition(tableName, {
      id: hasCustomPk ? false : options.id,
      adapterName: this.adapterName,
    });
    if (hasCustomPk) {
      const pkType = (typeof options.id === "string" ? options.id : "primary_key") as ColumnType;
      td.columns.unshift(
        new ColumnDefinition(options.primaryKey as string, pkType, { primaryKey: true }),
      );
    }
    if (fn) fn(td);
    return td;
  }

  buildCreateJoinTableDefinition(
    table1: string,
    table2: string,
    options: {
      columnOptions?: Record<string, unknown>;
      tableName?: string;
      [key: string]: unknown;
    } = {},
    fn?: (td: TableDefinition) => void,
  ): TableDefinition {
    const joinTableName = options.tableName ?? this._findJoinTableName(table1, table2);
    const { columnOptions = {}, tableName: _, ...rest } = options;
    const mergedColOpts = { null: false, index: false, ...columnOptions };

    const t1Ref = this._referenceNameForTable(table1);
    const t2Ref = this._referenceNameForTable(table2);

    return this.buildCreateTableDefinition(joinTableName, { ...rest, id: false }, (td) => {
      td.references(t1Ref, mergedColOpts);
      td.references(t2Ref, mergedColOpts);
      if (fn) fn(td);
    });
  }

  private _findJoinTableName(table1: string, table2: string): string {
    const unqualify = (name: string) => (name.split(".").at(-1) ?? name).replace(/\./g, "_");
    const [t1, t2] = [unqualify(table1), unqualify(table2)].sort();
    const parts1 = t1.split("_");
    const parts2 = t2.split("_");
    // Remove common prefix (Rails dedup: music_artists + music_records → music_artists_records)
    let commonLen = 0;
    while (
      commonLen < parts1.length - 1 &&
      commonLen < parts2.length - 1 &&
      parts1[commonLen] === parts2[commonLen]
    ) {
      commonLen++;
    }
    if (commonLen > 0) {
      const prefix = parts1.slice(0, commonLen).join("_");
      const suffix1 = parts1.slice(commonLen).join("_");
      const suffix2 = parts2.slice(commonLen).join("_");
      return `${prefix}_${suffix1}_${suffix2}`;
    }
    return `${t1}_${t2}`;
  }

  private _referenceNameForTable(tableName: string): string {
    const unqualified = tableName.split(".").at(-1) ?? tableName;
    return singularize(unqualified);
  }

  async buildAddColumnDefinition(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { ifNotExists?: boolean } = {},
  ): Promise<AlterTable | null> {
    if (options.ifNotExists && (await this.columnExists(tableName, columnName))) {
      return null;
    }
    const { ifNotExists: _, ...colOpts } = options;
    const at = new AlterTable(tableName);
    at.addColumn(columnName, type, colOpts);
    return at;
  }

  buildChangeColumnDefaultDefinition(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): AlterTable {
    let newDefault: unknown;
    if (
      defaultOrChanges != null &&
      typeof defaultOrChanges === "object" &&
      "to" in (defaultOrChanges as Record<string, unknown>)
    ) {
      newDefault = (defaultOrChanges as { to: unknown }).to;
    } else {
      newDefault = defaultOrChanges;
    }
    const at = new AlterTable(tableName);
    at.changeColumnDefault(columnName, newDefault);
    return at;
  }

  buildCreateIndexDefinition(
    tableName: string,
    columnName: string | string[],
    options: {
      name?: string;
      unique?: boolean;
      where?: string;
      using?: string;
      type?: string;
      algorithm?: string;
      ifNotExists?: boolean;
      [key: string]: unknown;
    } = {},
  ): CreateIndexDefinition {
    const columnNames = Array.isArray(columnName) ? columnName : [columnName];
    const indexName = options.name ?? this.indexName(tableName, { column: columnNames });
    const idx = new IndexDefinition(
      tableName,
      indexName,
      !!options.unique,
      columnNames,
      options.where,
    );
    return new CreateIndexDefinition(idx, !!options.ifNotExists, options.algorithm);
  }

  async isIndexNameExists(tableName: string, indexName: string): Promise<boolean> {
    const idxs = await this.indexes(tableName);
    return idxs.some((idx) => idx.name === indexName);
  }

  foreignKeyColumnFor(tableName: string, columnName = "id"): string {
    const name = tableName.replace(/^.*\./, "");
    return `${singularize(name)}_${columnName}`;
  }

  foreignKeyOptions(
    fromTable: string,
    toTable: string,
    options: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const result = { ...options };

    if (Array.isArray(result.primaryKey)) {
      if (!result.column) {
        result.column = (result.primaryKey as string[]).map((pk) =>
          this.foreignKeyColumnFor(toTable, pk),
        );
      }
    } else {
      if (!result.column) {
        const pk = typeof result.primaryKey === "string" ? result.primaryKey : "id";
        result.column = this.foreignKeyColumnFor(toTable, pk);
      }
    }

    if (!result.name) {
      const unqualifiedFrom = (fromTable.split(".").at(-1) ?? fromTable).replace(/\./g, "_");
      const cols = Array.isArray(result.column) ? result.column : [result.column];
      const fullName = `fk_rails_${unqualifiedFrom}_${(cols as string[]).join("_")}`;
      if (fullName.length > this.maxIndexNameSize()) {
        const hex = getCrypto().createHash("sha256").update(fullName).digest("hex").slice(0, 10);
        result.name = `fk_rails_${hex}`;
      } else {
        result.name = fullName;
      }
    }

    return result;
  }

  async checkConstraints(_tableName: string): Promise<CheckConstraintDefinition[]> {
    throw new Error("NotImplementedError: checkConstraints is not implemented");
  }

  checkConstraintOptions(
    _tableName: string,
    _expression: string,
    options: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return { ...options };
  }

  async isCheckConstraintExists(
    tableName: string,
    options: { name?: string; expression?: string },
  ): Promise<boolean> {
    if (!options.name && !options.expression) {
      throw new Error("At least one of :name or :expression must be supplied");
    }
    try {
      const constraints = await this.checkConstraints(tableName);
      return constraints.some((c) => {
        if (options.name && c.name === options.name) return true;
        if (options.expression && c.expression === options.expression) return true;
        return false;
      });
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("NotImplementedError")) return false;
      throw e;
    }
  }

  async removeConstraint(tableName: string, constraintName: string): Promise<void> {
    const at = new AlterTable(tableName);
    at.dropConstraint(constraintName);
    await this.adapter.executeMutation(this.schemaCreation.accept(at));
  }

  async dumpSchemaInformation(): Promise<string | null> {
    const smTable = (this.adapter as any).pool?.schemaMigration;
    if (!smTable) return null;
    const versions: string[] =
      typeof smTable.versions === "function" ? await smTable.versions() : (smTable.versions ?? []);
    if (versions.length === 0) return null;
    return this._insertVersionsSql(smTable.tableName ?? "schema_migrations", versions);
  }

  private _insertVersionsSql(tableName: string, versions: string | string[]): string {
    const smTable = this._qt(tableName);
    if (Array.isArray(versions)) {
      const rows = versions.reverse().map((v) => `(${quote(v)})`);
      return `INSERT INTO ${smTable} (version) VALUES\n${rows.join(",\n")};`;
    }
    return `INSERT INTO ${smTable} (version) VALUES (${quote(versions)});`;
  }

  internalStringOptionsForPrimaryKey(): Record<string, unknown> {
    return { primaryKey: true };
  }

  async assumeMigratedUptoVersion(version: number | string): Promise<void> {
    const ver = String(version);
    if (!/^\d+$/.test(ver)) {
      throw new Error(`Invalid migration version: ${version}`);
    }
    const verNum = parseInt(ver, 10);

    const pool = (this.adapter as any).pool;
    const smTableName = pool?.schemaMigration?.tableName ?? "schema_migrations";
    const smTable = this._qt(smTableName);

    const migrationContext = pool?.migrationContext;
    const migrated: number[] = migrationContext
      ? typeof migrationContext.getAllVersions === "function"
        ? await migrationContext.getAllVersions()
        : []
      : [];
    const allVersions: number[] = migrationContext
      ? (migrationContext.migrations ?? []).map((m: { version: number }) => m.version)
      : [];

    // Insert the target version if not already migrated
    if (!migrated.includes(verNum)) {
      await this.adapter.executeMutation(`INSERT INTO ${smTable} (version) VALUES (${quote(ver)})`);
    }

    // Insert all known migration versions below the target that haven't been run
    const inserting = allVersions.filter((v) => v < verNum && !migrated.includes(v));
    if (inserting.length > 0) {
      const duplicate = inserting.find((v) => inserting.filter((x) => x === v).length > 1);
      if (duplicate !== undefined) {
        throw new Error(
          `Duplicate migration ${duplicate}. Please renumber your migrations to resolve the conflict.`,
        );
      }
      await this.adapter.executeMutation(
        this._insertVersionsSql(smTableName, inserting.map(String)),
      );
    }
  }

  columnsForDistinct(columns: string, _orders?: string[]): string {
    return columns;
  }

  distinctRelationForPrimaryKey(relation: {
    primaryKey?: string | string[];
    orderValues?: unknown[];
    reselect?: (...cols: unknown[]) => unknown;
    distinctBang?: () => unknown;
  }): unknown {
    const pk = relation.primaryKey;
    if (!pk) return relation;

    const pkColumns = Array.isArray(pk) ? pk : [pk];
    const quotedPkColumns = pkColumns.map((col) => this._qi(col));
    const values = this.columnsForDistinct(
      quotedPkColumns.join(", "),
      (relation.orderValues as string[]) ?? [],
    );

    let limited: any = relation;
    if (limited.reselect) limited = limited.reselect(values);
    if (limited.distinctBang) limited.distinctBang();

    return limited;
  }

  updateTableDefinition(tableName: string, base?: unknown): Table {
    return new Table(tableName, (base ?? this) as SchemaStatements);
  }

  addIndexOptions(
    tableName: string,
    columnName: string | string[],
    options: {
      name?: string;
      ifNotExists?: boolean;
      internal?: boolean;
      unique?: boolean;
      where?: string;
      using?: string;
      type?: string;
      algorithm?: string;
      [key: string]: unknown;
    } = {},
  ): [IndexDefinition, string | undefined, boolean] {
    const columnNames = Array.isArray(columnName) ? columnName : [columnName];
    const indexName = options.name ?? this.indexName(tableName, { column: columnNames });
    const idx = new IndexDefinition(
      tableName,
      indexName,
      !!options.unique,
      columnNames,
      options.where,
    );
    return [idx, this.indexAlgorithm(options.algorithm), !!options.ifNotExists];
  }

  indexAlgorithm(algorithm?: string): string | undefined {
    if (!algorithm) return undefined;
    const normalized = algorithm.toLowerCase();
    if (normalized === "default") return undefined;

    const adapterAlgorithms =
      typeof (this.adapter as any).indexAlgorithms === "function"
        ? ((this.adapter as any).indexAlgorithms() as Record<string, string>)
        : null;

    if (adapterAlgorithms && normalized in adapterAlgorithms) {
      return adapterAlgorithms[normalized];
    }

    const valid = adapterAlgorithms
      ? ["default", ...Object.keys(adapterAlgorithms)]
      : ["default", "concurrently"];
    throw new Error(
      `Algorithm must be one of the following: ${valid.map((a) => `'${a}'`).join(", ")}`,
    );
  }

  quotedColumnsForIndex(columnNames: string[], _options: Record<string, unknown> = {}): string {
    return columnNames.map((name) => this._qi(name)).join(", ");
  }

  isOptionsIncludeDefault(options: Record<string, unknown>): boolean {
    return "default" in options && !(options.null === false && options.default == null);
  }

  async changeTableComment(
    _tableName: string,
    _commentOrChanges: string | null | { from?: string; to?: string },
  ): Promise<void> {
    throw new Error(
      `NotImplementedError: ${this.adapterName} does not support changing table comments`,
    );
  }

  async changeColumnComment(
    _tableName: string,
    _columnName: string,
    _commentOrChanges: string | null | { from?: string; to?: string },
  ): Promise<void> {
    throw new Error(
      `NotImplementedError: ${this.adapterName} does not support changing column comments`,
    );
  }

  createSchemaDumper(options: Record<string, unknown> = {}): SchemaDumper {
    return SchemaDumper.create(this as Parameters<typeof SchemaDumper.create>[0], options);
  }

  isUseForeignKeys(): boolean {
    const adapter = this.adapter as any;
    const supportsForeignKeys =
      typeof adapter.supportsForeignKeys === "function" ? adapter.supportsForeignKeys() : true;
    const foreignKeysEnabled =
      typeof adapter.foreignKeysEnabled === "function" ? adapter.foreignKeysEnabled() : true;
    return supportsForeignKeys && foreignKeysEnabled;
  }

  async bulkChangeTable(
    tableName: string,
    operations: Array<[string, string, ...unknown[]]>,
  ): Promise<void> {
    const sqlFragments: string[] = [];
    const nonCombinable: Array<() => Promise<void>> = [];

    for (const [command, table, ...arguments_] of operations) {
      const forAlterMethod = (this as any)[`${command}ForAlter`];
      if (typeof forAlterMethod === "function") {
        const result = forAlterMethod.call(this, table, ...arguments_);
        const results = Array.isArray(result) ? result : [result];
        for (const r of results) {
          if (typeof r === "string") {
            sqlFragments.push(r);
          } else if (typeof r === "function") {
            nonCombinable.push(r);
          }
        }
      } else {
        if (sqlFragments.length > 0) {
          await this.adapter.executeMutation(
            `ALTER TABLE ${this._qt(tableName)} ${sqlFragments.join(", ")}`,
          );
          sqlFragments.length = 0;
        }
        for (const proc of nonCombinable) await proc();
        nonCombinable.length = 0;

        const method = (this as any)[command];
        if (typeof method === "function") {
          await method.call(this, table, ...arguments_);
        } else {
          throw new Error(`Unknown bulk change command: ${command}`);
        }
      }
    }

    if (sqlFragments.length > 0) {
      await this.adapter.executeMutation(
        `ALTER TABLE ${this._qt(tableName)} ${sqlFragments.join(", ")}`,
      );
    }
    for (const proc of nonCombinable) await proc();
  }

  validTableDefinitionOptions(): string[] {
    return ["temporary", "ifNotExists", "options", "as", "comment", "charset", "collation"];
  }

  validColumnDefinitionOptions(): string[] {
    return [
      "limit",
      "precision",
      "scale",
      "default",
      "null",
      "collation",
      "comment",
      "primaryKey",
      "ifNotExists",
    ];
  }

  validPrimaryKeyOptions(): string[] {
    return ["limit", "default", "precision"];
  }

  maxIndexNameSize(): number {
    return 62;
  }
}
