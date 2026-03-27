import type { DatabaseAdapter } from "./adapter.js";
import {
  TableDefinition,
  Table,
  type ColumnType,
  type ColumnOptions,
  type AddForeignKeyOptions,
} from "./connection-adapters/abstract/schema-definitions.js";
import { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";
import { detectAdapterName } from "./adapter-name.js";
import { quoteIdentifier, quoteTableName } from "./quoting.js";

export type {
  ReferentialAction,
  AddForeignKeyOptions,
} from "./connection-adapters/abstract/schema-definitions.js";

interface RecordedOperation {
  method: string;
  args: unknown[];
}

/**
 * Migration — base class for database migrations.
 *
 * Mirrors: ActiveRecord::Migration
 */
export abstract class Migration {
  protected adapter!: DatabaseAdapter;
  private _recording = false;
  private _recordedOps: RecordedOperation[] = [];
  private _name?: string;
  private _version?: string;

  /** Determine adapter type from the adapter class name. */
  protected get _adapterName(): "sqlite" | "postgres" | "mysql" {
    return detectAdapterName(this.adapter);
  }

  private _schema?: SchemaStatements;

  get schema(): SchemaStatements {
    if (!this._schema) {
      this._schema = new SchemaStatements(this.adapter);
    }
    return this._schema;
  }

  /**
   * Mirrors: ActiveRecord::Migration#initialize
   */
  constructor(name?: string, version?: string) {
    this._name = name;
    this._version = version;
  }

  /**
   * Run the migration in the given direction (class method).
   *
   * Mirrors: ActiveRecord::Migration.migrate
   */
  static async migrate(direction: "up" | "down"): Promise<void> {
    // Subclasses should override; this is a no-op base
  }

  /**
   * Override to define the forward migration.
   */
  async up(): Promise<void> {
    // Default: run change() in forward direction
    await this._runChange("up");
  }

  /**
   * Override to define the rollback migration.
   * Default: run change() in reverse direction.
   */
  async down(): Promise<void> {
    await this._runChange("down");
  }

  /**
   * Override for reversible migrations.
   * Called by both up() and down() with a direction parameter.
   */
  async change(): Promise<void> {
    // Subclasses override
  }

  private async _runChange(direction: "up" | "down"): Promise<void> {
    if (direction === "up") {
      await this.change();
    } else {
      // Record operations from change(), then replay in reverse
      this._recording = true;
      this._recordedOps = [];
      await this.change();
      this._recording = false;

      // If no operations were recorded, migration is irreversible
      if (this._recordedOps.length === 0) {
        throw new Error(
          `${this.constructor.name}#down is not implemented. This migration is irreversible.`,
        );
      }

      // Replay in reverse
      for (const op of this._recordedOps.reverse()) {
        await this._reverseOperation(op);
      }
    }
  }

  private async _reverseOperation(op: RecordedOperation): Promise<void> {
    switch (op.method) {
      case "createTable":
        await this.dropTable(op.args[0] as string);
        break;
      case "dropTable":
        throw new Error("Cannot reverse dropTable without table definition");
      case "addColumn":
        await this.removeColumn(op.args[0] as string, op.args[1] as string);
        break;
      case "removeColumn":
        throw new Error("Cannot reverse removeColumn without type info");
      case "addIndex":
        {
          const idxOpts: { column: string | string[]; name?: string } = {
            column: op.args[1] as string | string[],
          };
          const origOpts = op.args[2] as { name?: string } | undefined;
          if (origOpts?.name) idxOpts.name = origOpts.name;
          await this.removeIndex(op.args[0] as string, idxOpts);
        }
        break;
      case "removeIndex":
        throw new Error("Cannot reverse removeIndex without column info");
      case "renameColumn":
        await this.renameColumn(op.args[0] as string, op.args[2] as string, op.args[1] as string);
        break;
      case "renameTable":
        await this.renameTable(op.args[1] as string, op.args[0] as string);
        break;
      case "changeColumn":
        throw new Error("Cannot reverse changeColumn without previous type info");
      case "addForeignKey": {
        const fkOpts = op.args[2] as { column?: string; name?: string } | undefined;
        await this.removeForeignKey(op.args[0] as string, fkOpts ?? (op.args[1] as string));
        break;
      }
      case "createJoinTable":
        await this.dropJoinTable(
          op.args[0] as string,
          op.args[1] as string,
          op.args[2] as { tableName?: string } | undefined,
        );
        break;
      case "dropJoinTable":
        throw new Error("Cannot reverse dropJoinTable without table definition");
      case "addCheckConstraint": {
        const [table, expr, opts] = op.args as [string, string, { name?: string }?];
        const constraintName = opts?.name ?? this.schema._checkConstraintName(table, expr);
        await this.removeCheckConstraint(table, { name: constraintName });
        break;
      }
      case "removeCheckConstraint": {
        const [rmTable, rmArg] = op.args as [string, string | { name?: string } | undefined];
        if (typeof rmArg === "string") {
          await this.addCheckConstraint(rmTable, rmArg);
        } else {
          throw new Error("Cannot reverse removeCheckConstraint without expression");
        }
        break;
      }
      default:
        throw new Error(`Cannot reverse operation: ${op.method}`);
    }
  }

  // -- Schema operations (delegated to SchemaStatements) --
  // Migration records operations for reversibility, then delegates
  // actual SQL execution to this.schema (a SchemaStatements instance).
  // In Rails, these methods live on the connection adapter via
  // ActiveRecord::ConnectionAdapters::SchemaStatements.

  async createTable(
    name: string,
    optionsOrFn?:
      | { id?: boolean; force?: boolean; ifNotExists?: boolean }
      | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void,
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "createTable", args: [name, optionsOrFn, fn] });
      return;
    }
    await this.schema.createTable(name, optionsOrFn, fn);
  }

  async dropTable(name: string, options?: { ifExists?: boolean }): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "dropTable", args: [name] });
      return;
    }
    await this.schema.dropTable(name, options);
  }

  async addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { ifNotExists?: boolean } = {},
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "addColumn", args: [tableName, columnName, type, options] });
      return;
    }
    await this.schema.addColumn(tableName, columnName, type, options);
  }

  async removeColumn(
    tableName: string,
    columnName: string,
    options: { ifExists?: boolean } = {},
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "removeColumn", args: [tableName, columnName, options] });
      return;
    }
    await this.schema.removeColumn(tableName, columnName, options);
  }

  async renameColumn(tableName: string, oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "renameColumn", args: [tableName, oldName, newName] });
      return;
    }
    await this.schema.renameColumn(tableName, oldName, newName);
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
    if (this._recording) {
      this._recordedOps.push({ method: "addIndex", args: [tableName, columns, options] });
      return;
    }
    await this.schema.addIndex(tableName, columns, options);
  }

  async removeIndex(
    tableName: string,
    options: { column?: string | string[]; name?: string } = {},
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "removeIndex", args: [tableName, options] });
      return;
    }
    await this.schema.removeIndex(tableName, options);
  }

  async changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({
        method: "changeColumn",
        args: [tableName, columnName, type, options],
      });
      return;
    }
    await this.schema.changeColumn(tableName, columnName, type, options);
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "renameTable", args: [oldName, newName] });
      return;
    }
    await this.schema.renameTable(oldName, newName);
  }

  async tableExists(tableName: string): Promise<boolean> {
    return this.schema.tableExists(tableName);
  }

  async columnExists(tableName: string, columnName: string): Promise<boolean> {
    return this.schema.columnExists(tableName, columnName);
  }

  async changeColumnDefault(
    tableName: string,
    columnName: string,
    options: { from?: unknown; to: unknown } | unknown,
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({
        method: "changeColumnDefault",
        args: [tableName, columnName, options],
      });
      return;
    }
    await this.schema.changeColumnDefault(tableName, columnName, options);
  }

  async changeColumnNull(
    tableName: string,
    columnName: string,
    allowNull: boolean,
    defaultValue?: unknown,
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({
        method: "changeColumnNull",
        args: [tableName, columnName, allowNull, defaultValue],
      });
      return;
    }
    await this.schema.changeColumnNull(tableName, columnName, allowNull, defaultValue);
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
    if (this._recording) {
      this._recordedOps.push({ method: "addReference", args: [tableName, refName, options] });
      return;
    }
    await this.schema.addReference(tableName, refName, options);
  }

  async removeReference(
    tableName: string,
    refName: string,
    options: { polymorphic?: boolean } = {},
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "removeReference", args: [tableName, refName, options] });
      return;
    }
    await this.schema.removeReference(tableName, refName, options);
  }

  async addForeignKey(
    fromTable: string,
    toTable: string,
    options: AddForeignKeyOptions = {},
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "addForeignKey", args: [fromTable, toTable, options] });
      return;
    }
    await this.schema.addForeignKey(fromTable, toTable, options);
  }

  async removeForeignKey(
    fromTable: string,
    toTableOrOptions?: string | { column?: string; name?: string },
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "removeForeignKey", args: [fromTable, toTableOrOptions] });
      return;
    }
    await this.schema.removeForeignKey(fromTable, toTableOrOptions);
  }

  async addCheckConstraint(
    tableName: string,
    expression: string,
    options: { name?: string; validate?: boolean } = {},
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({
        method: "addCheckConstraint",
        args: [tableName, expression, options],
      });
      return;
    }
    await this.schema.addCheckConstraint(tableName, expression, options);
  }

  async removeCheckConstraint(
    tableName: string,
    expressionOrOptions?: string | { name?: string },
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({
        method: "removeCheckConstraint",
        args: [tableName, expressionOrOptions],
      });
      return;
    }
    await this.schema.removeCheckConstraint(tableName, expressionOrOptions);
  }
  async addTimestamps(tableName: string, options: ColumnOptions = {}): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "addTimestamps", args: [tableName, options] });
      return;
    }
    await this.schema.addTimestamps(tableName, options);
  }

  async removeTimestamps(tableName: string): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "removeTimestamps", args: [tableName] });
      return;
    }
    await this.schema.removeTimestamps(tableName);
  }

  async createJoinTable(
    table1: string,
    table2: string,
    options?: { tableName?: string } | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void,
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "createJoinTable", args: [table1, table2, options, fn] });
      return;
    }
    await this.schema.createJoinTable(table1, table2, options, fn);
  }

  async dropJoinTable(
    table1: string,
    table2: string,
    options?: { tableName?: string },
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "dropJoinTable", args: [table1, table2, options] });
      return;
    }
    await this.schema.dropJoinTable(table1, table2, options);
  }

  async changeTable(tableName: string, fn?: (t: Table) => void | Promise<void>): Promise<void> {
    // Build Table against Migration (not SchemaStatements) so that
    // per-operation recording in addColumn/removeColumn/etc. still applies
    const table = new Table(tableName, this);
    if (fn) await fn(table);
  }

  async renameIndex(_tableName: string, oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "renameIndex", args: [_tableName, oldName, newName] });
      return;
    }
    await this.schema.renameIndex(_tableName, oldName, newName);
  }

  indexName(tableName: string, options: { column?: string | string[] }): string {
    return this.schema.indexName(tableName, options);
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
    return this.schema.columns(tableName);
  }

  async indexes(
    tableName: string,
  ): Promise<Array<{ name: string; columns: string[]; unique: boolean }>> {
    return this.schema.indexes(tableName);
  }

  async primaryKey(tableName: string): Promise<string | null> {
    return this.schema.primaryKey(tableName);
  }

  async foreignKeys(
    tableName: string,
  ): Promise<Array<{ from: string; to: string; column: string; primaryKey: string }>> {
    return this.schema.foreignKeys(tableName);
  }

  async tables(): Promise<string[]> {
    return this.schema.tables();
  }

  async views(): Promise<string[]> {
    return this.schema.views();
  }

  /**
   * Get the migration name.
   *
   * Mirrors: ActiveRecord::Migration#name
   */
  get name(): string {
    return this.constructor.name;
  }

  /**
   * Revert a migration or a block of operations.
   *
   * Mirrors: ActiveRecord::Migration#revert
   */
  async revert(migrationOrFn?: Migration | (() => Promise<void>)): Promise<void> {
    if (migrationOrFn === undefined) return;
    if (migrationOrFn instanceof Migration) {
      (migrationOrFn as any).adapter = this.adapter;
      await migrationOrFn.down();
    } else {
      // Record operations and reverse them
      this._recording = true;
      this._recordedOps = [];
      await migrationOrFn();
      this._recording = false;
      for (const op of this._recordedOps.reverse()) {
        await this._reverseOperation(op);
      }
      this._recordedOps = [];
    }
  }

  /**
   * Define reversible operations.
   *
   * Mirrors: ActiveRecord::Migration#reversible
   */
  async reversible(
    fn?: (dir: {
      up: (f: () => Promise<void>) => void;
      down: (f: () => Promise<void>) => void;
    }) => void,
  ): Promise<void> {
    if (!fn) return;
    const upFns: Array<() => Promise<void>> = [];
    const downFns: Array<() => Promise<void>> = [];
    fn({
      up: (f) => upFns.push(f),
      down: (f) => downFns.push(f),
    });
    // In a forward migration, run up fns. In reverse, run down fns.
    // We always run the up direction here; down is handled by _runChange
    for (const f of upFns) await f();
  }

  /**
   * Run code only in the up direction.
   *
   * Mirrors: ActiveRecord::Migration#up_only
   */
  async upOnly(fn?: () => Promise<void>): Promise<void> {
    if (!this._recording && fn) {
      await fn();
    }
  }

  /**
   * Run the migration in a given direction.
   *
   * Mirrors: ActiveRecord::Migration#migrate
   */
  async migrate(direction: "up" | "down"): Promise<void> {
    if (direction === "up") {
      await this.up();
    } else {
      await this.down();
    }
  }

  /**
   * Check if the migration is currently reverting (recording operations
   * for later reversal).
   *
   * Mirrors: ActiveRecord::Migration#reverting?
   */
  isReverting(): boolean {
    return this._recording;
  }

  async isViewExists(viewName: string): Promise<boolean> {
    return this.schema.viewExists(viewName);
  }

  async isIndexExists(
    tableName: string,
    columnName: string | string[],
    options?: { unique?: boolean; name?: string },
  ): Promise<boolean> {
    return this.schema.indexExists(tableName, columnName, options);
  }

  /**
   * Retrieve a migration by version. Placeholder — returns null.
   *
   * Mirrors: ActiveRecord::Migration.get
   */
  static get(_version: string): Migration | null {
    return null;
  }

  /**
   * Execute the migration on a given adapter.
   */
  async run(adapter?: DatabaseAdapter, direction: "up" | "down" = "up"): Promise<void> {
    if (adapter) this.adapter = adapter;
    if (direction === "up") {
      await this.up();
    } else {
      await this.down();
    }
  }

  /**
   * Get the migration version from the class name or a static property.
   */
  get version(): string {
    return (this.constructor as any).version ?? this.constructor.name;
  }
}

/**
 * MigrationContext — wraps an adapter with schema-aware migration methods
 * and synchronous schema inspection, for use in tests and programmatic migrations.
 *
 * Mirrors: ActiveRecord::MigrationContext
 */
export class MigrationContext {
  private _tables = new Set<string>();
  private _columns = new Map<string, Set<string>>();
  private _columnMeta = new Map<
    string,
    Map<
      string,
      {
        type: string;
        primaryKey?: boolean;
        null?: boolean;
        default?: unknown;
        limit?: number;
        precision?: number;
        scale?: number;
      }
    >
  >();
  private _indexes = new Map<string, { columns: string[]; unique: boolean; name?: string }[]>();
  tableNamePrefix = "";
  tableNameSuffix = "";

  constructor(private adapter: DatabaseAdapter) {}

  private get _adapterName(): "sqlite" | "postgres" | "mysql" {
    return detectAdapterName(this.adapter);
  }

  async createTable(
    name: string,
    options?: { primaryKey?: string | false; force?: boolean; ifNotExists?: boolean; id?: boolean },
    fn?: (t: TableDefinition) => void,
  ): Promise<void> {
    if (name.length > 64) {
      throw new Error(`Table name '${name}' is too long; the limit is 64 characters`);
    }
    if (options?.force && options?.ifNotExists) {
      throw new Error("Options `:force` and `:if_not_exists` cannot be used simultaneously.");
    }
    if (options?.force) {
      await this.dropTable(name).catch(() => {});
    }
    if (options?.ifNotExists && this.tableExists(name)) {
      return;
    }
    const td = new TableDefinition(name, { id: options?.id, adapterName: this._adapterName });
    if (fn) fn(td);
    await this.adapter.executeMutation(td.toSql());
    this._tables.add(name);
    const cols = new Set<string>();
    for (const col of td.columns) {
      cols.add(col.name);
    }
    this._columns.set(name, cols);

    // Store column metadata
    const meta = new Map<
      string,
      {
        type: string;
        primaryKey?: boolean;
        null?: boolean;
        default?: unknown;
        limit?: number;
        precision?: number;
        scale?: number;
      }
    >();
    if (options?.id !== false) {
      meta.set("id", { type: "integer", primaryKey: true });
    }
    for (const col of td.columns) {
      if (col.name === "id" && meta.has("id")) continue;
      meta.set(col.name, {
        type: col.type,
        primaryKey: col.options.primaryKey,
        null: col.options.null,
        default: col.options.default,
        limit: col.options.limit,
        precision: col.options.precision,
        scale: col.options.scale,
      });
    }
    this._columnMeta.set(name, meta);

    // Create indexes from table definition
    for (const idx of td.indexes) {
      const indexName = idx.name ?? `index_${name}_on_${idx.columns.join("_and_")}`;
      const unique = idx.unique ? "UNIQUE " : "";
      const colsList = idx.columns.map((c) => `"${c}"`).join(", ");
      await this.adapter.executeMutation(
        `CREATE ${unique}INDEX "${indexName}" ON "${name}" (${colsList})`,
      );
      if (!this._indexes.has(name)) this._indexes.set(name, []);
      this._indexes.get(name)!.push({ ...idx, name: indexName });
    }
  }

  async dropTable(name: string): Promise<void> {
    await this.adapter.executeMutation(`DROP TABLE IF EXISTS "${name}"`);
    this._tables.delete(name);
    this._columns.delete(name);
    this._columnMeta.delete(name);
    this._indexes.delete(name);
  }

  private _mapType(type: string): string {
    const an = this._adapterName;
    switch (type.toLowerCase()) {
      case "string":
        return `VARCHAR(255)`;
      case "text":
        return "TEXT";
      case "integer":
        return "INTEGER";
      case "float":
        return an === "postgres" ? "DOUBLE PRECISION" : "REAL";
      case "decimal":
        return "DECIMAL(10, 0)";
      case "boolean":
        return "BOOLEAN";
      case "date":
        return "DATE";
      case "datetime":
      case "timestamp":
        return an === "postgres" ? "TIMESTAMP" : "DATETIME";
      case "binary":
        return an === "postgres" ? "BYTEA" : "BLOB";
      case "primary_key":
        if (an === "postgres") return "SERIAL PRIMARY KEY";
        if (an === "mysql") return "INT AUTO_INCREMENT PRIMARY KEY";
        return "INTEGER PRIMARY KEY AUTOINCREMENT";
      default:
        return type.toUpperCase();
    }
  }

  async addColumn(
    table: string,
    column: string,
    type: string,
    _options?: ColumnOptions & { ifNotExists?: boolean },
  ): Promise<void> {
    const ifNotExists = _options?.ifNotExists ?? false;
    if (this._columns.has(table) && this._columns.get(table)!.has(column)) {
      if (!ifNotExists) {
        throw new Error(`Column "${column}" already exists in table "${table}"`);
      }
      return;
    }
    await this.adapter.executeMutation(
      `ALTER TABLE "${table}" ADD COLUMN "${column}" ${this._mapType(type)}`,
    );
    if (!this._columns.has(table)) this._columns.set(table, new Set());
    this._columns.get(table)!.add(column);
    if (!this._columnMeta.has(table)) this._columnMeta.set(table, new Map());
    this._columnMeta.get(table)!.set(column, {
      type,
      null: _options?.null,
      default: _options?.default,
      limit: _options?.limit,
      precision: _options?.precision,
      scale: _options?.scale,
    });
  }

  async removeColumn(
    table: string,
    columnOrColumns: string,
    optionsOrColumn?: string | { ifExists?: boolean },
    ...rest: string[]
  ): Promise<void> {
    // Support variadic: removeColumn("t", "a", "b", "c")
    if (typeof optionsOrColumn === "string") {
      if (rest.length > 0 && typeof rest[rest.length - 1] === "object") {
        throw new Error("Cannot mix variadic column names with options object in removeColumn");
      }
      const allCols = [columnOrColumns, optionsOrColumn, ...rest];
      for (const col of allCols) {
        await this.adapter.executeMutation(`ALTER TABLE "${table}" DROP COLUMN "${col}"`);
        this._columns.get(table)?.delete(col);
        this._columnMeta.get(table)?.delete(col);
      }
      return;
    }
    if (optionsOrColumn?.ifExists && !this.columnExists(table, columnOrColumns)) {
      return;
    }
    await this.adapter.executeMutation(`ALTER TABLE "${table}" DROP COLUMN "${columnOrColumns}"`);
    this._columns.get(table)?.delete(columnOrColumns);
    this._columnMeta.get(table)?.delete(columnOrColumns);
  }

  async renameColumn(table: string, from: string, to: string): Promise<void> {
    await this.adapter.executeMutation(`ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"`);
    const cols = this._columns.get(table);
    if (cols) {
      cols.delete(from);
      cols.add(to);
    }
    const meta = this._columnMeta.get(table);
    if (meta && meta.has(from)) {
      const entry = meta.get(from)!;
      meta.delete(from);
      meta.set(to, entry);
    }
  }

  async changeColumn(
    table: string,
    column: string,
    type: string,
    _options?: ColumnOptions,
  ): Promise<void> {
    if (this._adapterName === "mysql") {
      await this.adapter.executeMutation(
        `ALTER TABLE "${table}" MODIFY COLUMN "${column}" ${this._mapType(type)}`,
      );
    } else {
      await this.adapter.executeMutation(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE ${this._mapType(type)}`,
      );
    }
    const meta = this._columnMeta.get(table);
    if (meta && meta.has(column)) {
      const entry = meta.get(column)!;
      meta.set(column, {
        ...entry,
        type,
        null: _options?.null ?? entry.null,
        default: _options?.default ?? entry.default,
        limit: _options?.limit ?? entry.limit,
        precision: _options?.precision ?? entry.precision,
        scale: _options?.scale ?? entry.scale,
      });
    }
  }

  async addIndex(
    table: string,
    columns: string | string[],
    options?: {
      unique?: boolean;
      name?: string;
      where?: string;
      order?: Record<string, string>;
      ifNotExists?: boolean;
    },
  ): Promise<void> {
    const cols = Array.isArray(columns) ? columns : [columns];
    const unique = options?.unique ?? false;
    const indexName = options?.name ?? `index_${table}_on_${cols.join("_and_")}`;
    const an = this._adapterName;
    const uniqueStr = unique ? "UNIQUE " : "";
    const ifNotExistsStr = options?.ifNotExists ? "IF NOT EXISTS " : "";
    const colsStr = cols
      .map((c) => {
        let col = quoteIdentifier(c, an);
        if (an !== "mysql") {
          const ord = options?.order?.[c];
          if (ord) col += ` ${ord.toUpperCase()}`;
        }
        return col;
      })
      .join(", ");
    let sql = `CREATE ${uniqueStr}INDEX ${ifNotExistsStr}${quoteIdentifier(indexName, an)} ON ${quoteTableName(table, an)} (${colsStr})`;
    if (an !== "mysql" && options?.where) sql += ` WHERE ${options.where}`;
    await this.adapter.executeMutation(sql);
    if (!this._indexes.has(table)) this._indexes.set(table, []);
    this._indexes.get(table)!.push({ columns: cols, unique, name: indexName });
  }

  async removeIndex(
    table: string,
    options: { column?: string | string[]; name?: string },
  ): Promise<void> {
    let indexName = options.name;
    if (!indexName && options.column) {
      const cols = Array.isArray(options.column) ? options.column : [options.column];
      indexName = `index_${table}_on_${cols.join("_and_")}`;
    }
    if (indexName) {
      const adp = detectAdapterName(this.adapter);
      if (adp === "mysql") {
        await this.adapter.executeMutation(`DROP INDEX \`${indexName}\` ON \`${table}\``);
      } else {
        await this.adapter.executeMutation(`DROP INDEX "${indexName}"`);
      }
      const tableIndexes = this._indexes.get(table);
      if (tableIndexes) {
        this._indexes.set(
          table,
          tableIndexes.filter((i) => i.name !== indexName),
        );
      }
    }
  }

  async renameTable(from: string, to: string): Promise<void> {
    const fullFrom = `${this.tableNamePrefix}${from}${this.tableNameSuffix}`;
    const fullTo = `${this.tableNamePrefix}${to}${this.tableNameSuffix}`;
    await this.adapter.executeMutation(`ALTER TABLE "${fullFrom}" RENAME TO "${fullTo}"`);
    this._tables.delete(fullFrom);
    this._tables.add(fullTo);
    const cols = this._columns.get(fullFrom);
    if (cols) {
      this._columns.delete(fullFrom);
      this._columns.set(fullTo, cols);
    }
    const meta = this._columnMeta.get(fullFrom);
    if (meta) {
      this._columnMeta.delete(fullFrom);
      this._columnMeta.set(fullTo, meta);
    }
    const indexes = this._indexes.get(fullFrom);
    if (indexes) {
      this._indexes.delete(fullFrom);
      this._indexes.set(fullTo, indexes);
    }
  }

  async reversible(
    fn: (dir: {
      up: (cb: () => void | Promise<void>) => void;
      down: (cb: () => void | Promise<void>) => void;
    }) => void,
  ): Promise<void> {
    let upFn: (() => void | Promise<void>) | null = null;
    fn({
      up: (cb) => {
        upFn = cb;
      },
      down: () => {},
    });
    if (upFn) await (upFn as any)();
  }

  async revert(fn: () => Promise<void>): Promise<void> {
    // For testing purposes, just run the function in reverse conceptually.
    // A full revert implementation would record and reverse operations.
    await fn();
  }

  tableExists(name: string): boolean {
    return this._tables.has(name);
  }

  columnExists(table: string, column: string): boolean {
    return this._columns.get(table)?.has(column) ?? false;
  }

  indexExists(table: string, column: string): boolean {
    return this._indexes.get(table)?.some((i) => i.columns.includes(column)) ?? false;
  }

  tables(): string[] {
    return Array.from(this._tables).sort();
  }

  columns(tableName: string): Array<{
    name: string;
    type: string;
    primaryKey?: boolean;
    null?: boolean;
    default?: unknown;
    limit?: number;
    precision?: number;
    scale?: number;
  }> {
    const meta = this._columnMeta.get(tableName);
    if (meta) {
      return Array.from(meta.entries()).map(([name, info]) => ({ name, ...info }));
    }
    const cols = this._columns.get(tableName);
    if (!cols) return [];
    return Array.from(cols).map((name) => ({ name, type: "string" }));
  }

  indexes(tableName: string): Array<{ columns: string[]; unique: boolean; name?: string }> {
    const idxs = this._indexes.get(tableName);
    if (!idxs) return [];
    return idxs.map((i) => ({ ...i, columns: [...i.columns] }));
  }
}

// === Migrator (Rails defines this in migration.rb) ===

export interface MigrationProxy {
  version: string;
  name: string;
  filename?: string;
  migration: () => MigrationLike;
}

export interface MigrationLike {
  up(adapter: DatabaseAdapter): Promise<void>;
  down(adapter: DatabaseAdapter): Promise<void>;
}

export class Migrator {
  private _adapter: DatabaseAdapter;
  private _migrations: MigrationProxy[];
  private _schemaTableName = "schema_migrations";
  verbose = true;
  private _output: string[] = [];

  constructor(adapter: DatabaseAdapter, migrations: MigrationProxy[]) {
    this._adapter = adapter;
    this._validateMigrations(migrations);
    const normalized = migrations.map((m) => ({
      ...m,
      version: String(BigInt(m.version)),
    }));
    this._migrations = this._sortMigrations(normalized);
  }

  get migrations(): MigrationProxy[] {
    return [...this._migrations];
  }

  get output(): readonly string[] {
    return [...this._output];
  }

  /**
   * Run all pending migrations up, or migrate to a specific version.
   *
   * Mirrors: ActiveRecord::Migrator#migrate
   */
  async migrate(targetVersion?: number | string | null): Promise<void> {
    await this._ensureSchemaTable();

    if (targetVersion !== undefined && targetVersion !== null) {
      this._validateTargetVersion(targetVersion);
      const target = BigInt(targetVersion);
      const current = BigInt(await this.currentVersion());
      if (target > current) {
        await this._migrateUp(targetVersion);
      } else if (target < current) {
        await this._migrateDown(targetVersion);
      }
    } else {
      await this._migrateUp(null);
    }
  }

  /**
   * Run all pending migrations up to the target version (or all if no target).
   *
   * Mirrors: ActiveRecord::Migrator.up
   */
  async up(targetVersion?: number | string | null): Promise<void> {
    await this._ensureSchemaTable();
    await this._migrateUp(targetVersion ?? null);
  }

  /**
   * Revert all applied migrations down to the target version.
   *
   * Mirrors: ActiveRecord::Migrator.down
   */
  async down(targetVersion?: number | string | null): Promise<void> {
    await this._ensureSchemaTable();
    await this._migrateDown(targetVersion ?? 0);
  }

  /**
   * Rollback N migrations.
   *
   * Mirrors: ActiveRecord::Migrator#rollback
   */
  async rollback(steps: number = 1): Promise<void> {
    if (!Number.isInteger(steps) || steps < 0) {
      throw new Error(`Invalid steps: ${steps}. Must be a non-negative integer.`);
    }
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();
    const appliedMigrations = this._migrations.filter((m) => applied.has(m.version)).reverse();
    const toRollback = appliedMigrations.slice(0, steps);

    for (const proxy of toRollback) {
      await this._runMigration(proxy, "down");
    }
  }

  /**
   * Move forward N migrations.
   *
   * Mirrors: ActiveRecord::Migrator#forward
   */
  async forward(steps: number = 1): Promise<void> {
    if (!Number.isInteger(steps) || steps < 0) {
      throw new Error(`Invalid steps: ${steps}. Must be a non-negative integer.`);
    }
    await this._ensureSchemaTable();
    const pending = await this.pendingMigrations();
    const toRun = pending.slice(0, steps);

    for (const proxy of toRun) {
      await this._runMigration(proxy, "up");
    }
  }

  /**
   * Get the current schema version.
   *
   * Mirrors: ActiveRecord::Migrator.current_version
   */
  async currentVersion(): Promise<number> {
    await this._ensureSchemaTable();
    const versions = await this.getAllVersions();
    if (versions.length === 0) return 0;
    let max = BigInt(0);
    for (const v of versions) {
      const bv = BigInt(v);
      if (bv > max) max = bv;
    }
    return Number(max);
  }

  /**
   * Get all applied migration versions.
   *
   * Mirrors: ActiveRecord::Migrator.get_all_versions
   */
  async getAllVersions(): Promise<string[]> {
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();
    return [...applied].sort((a, b) => {
      const ba = BigInt(a);
      const bb = BigInt(b);
      if (ba < bb) return -1;
      if (ba > bb) return 1;
      return 0;
    });
  }

  /**
   * Get pending (unapplied) migrations.
   *
   * Mirrors: ActiveRecord::Migrator#pending_migrations
   */
  async pendingMigrations(): Promise<MigrationProxy[]> {
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();
    return this._migrations.filter((m) => !applied.has(m.version));
  }

  /**
   * Get status of all migrations.
   *
   * Mirrors: ActiveRecord::Migrator#migrations_status
   */
  async migrationsStatus(): Promise<
    Array<{ status: "up" | "down"; version: string; name: string }>
  > {
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();

    return this._migrations.map((m) => ({
      status: applied.has(m.version) ? ("up" as const) : ("down" as const),
      version: m.version,
      name: m.name,
    }));
  }

  /**
   * Find migrations from directory paths.
   * In our TS implementation, migrations are registered programmatically
   * rather than discovered from the filesystem.
   *
   * Mirrors: ActiveRecord::MigrationContext#migrations
   */
  static fromPaths(
    adapter: DatabaseAdapter,
    migrations: MigrationProxy[],
    _paths?: string[],
  ): Migrator {
    return new Migrator(adapter, migrations);
  }

  private _sortMigrations(migrations: MigrationProxy[]): MigrationProxy[] {
    return [...migrations].sort((a, b) => {
      const va = BigInt(a.version);
      const vb = BigInt(b.version);
      if (va < vb) return -1;
      if (va > vb) return 1;
      return 0;
    });
  }

  private _validateMigrations(migrations: MigrationProxy[]): void {
    const versions = new Set<string>();
    const names = new Set<string>();

    for (const m of migrations) {
      if (!m.version || !/^\d+$/.test(m.version)) {
        throw new Error(
          `Invalid migration version: ${m.version}. Version must be a numeric string.`,
        );
      }
      const normalized = String(BigInt(m.version));
      if (versions.has(normalized)) {
        throw new Error(`Duplicate migration version: ${m.version}`);
      }
      if (names.has(m.name)) {
        throw new Error(`Duplicate migration name: ${m.name}`);
      }
      versions.add(normalized);
      names.add(m.name);
    }
  }

  private _schemaTableEnsured = false;

  private async _ensureSchemaTable(): Promise<void> {
    if (this._schemaTableEnsured) return;
    await this._adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS "${this._schemaTableName}" ("version" VARCHAR(255) NOT NULL PRIMARY KEY)`,
    );
    this._schemaTableEnsured = true;
  }

  private async _appliedVersions(): Promise<Set<string>> {
    const rows = await this._adapter.execute(`SELECT "version" FROM "${this._schemaTableName}"`);
    return new Set(
      rows.map((r) => {
        const v = String(r.version).trim();
        try {
          return String(BigInt(v));
        } catch {
          return v;
        }
      }),
    );
  }

  private _validateTargetVersion(v: number | string): void {
    if (typeof v === "string") {
      if (!/^\d+$/.test(v)) {
        throw new Error(`Invalid target version: ${v}. Must be a non-negative numeric value.`);
      }
    } else {
      if (!Number.isInteger(v) || v < 0) {
        throw new Error(`Invalid target version: ${v}. Must be a non-negative integer.`);
      }
    }
  }

  private async _migrateUp(targetVersion: number | string | null): Promise<void> {
    if (targetVersion !== null) this._validateTargetVersion(targetVersion);
    const target = targetVersion !== null ? BigInt(targetVersion) : null;
    const applied = await this._appliedVersions();

    for (const proxy of this._migrations) {
      if (applied.has(proxy.version)) continue;
      if (target !== null && BigInt(proxy.version) > target) break;
      await this._runMigration(proxy, "up");
    }
  }

  private async _migrateDown(targetVersion: number | string): Promise<void> {
    this._validateTargetVersion(targetVersion);
    const target = BigInt(targetVersion);
    const applied = await this._appliedVersions();
    const toRevert = this._migrations
      .filter((m) => applied.has(m.version) && BigInt(m.version) > target)
      .reverse();

    for (const proxy of toRevert) {
      await this._runMigration(proxy, "down");
    }
  }

  private async _runMigration(proxy: MigrationProxy, direction: "up" | "down"): Promise<void> {
    if (this.verbose) {
      const action = direction === "up" ? "migrating" : "reverting";
      this._output.push(`== ${proxy.version} ${proxy.name}: ${action} ==`);
    }

    const migration = proxy.migration();
    if (direction === "up") {
      await migration.up(this._adapter);
      await this._adapter.executeMutation(
        `INSERT INTO "${this._schemaTableName}" ("version") VALUES (?)`,
        [proxy.version],
      );
    } else {
      await migration.down(this._adapter);
      await this._adapter.executeMutation(
        `DELETE FROM "${this._schemaTableName}" WHERE "version" = ?`,
        [proxy.version],
      );
    }

    if (this.verbose) {
      const action = direction === "up" ? "migrated" : "reverted";
      this._output.push(`== ${proxy.version} ${proxy.name}: ${action} ==`);
    }
  }
}
