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
import { quoteIdentifier, quoteTableName } from "./connection-adapters/abstract/quoting.js";
import { CommandRecorder } from "./migration/command-recorder.js";
import { SchemaMigration } from "./schema-migration.js";
import { InternalMetadata } from "./internal-metadata.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { DefaultStrategy } from "./migration/default-strategy.js";
import type { ExecutionStrategy, MigrationLike } from "./migration/execution-strategy.js";
import type { PendingMigrationConnection } from "./migration/pending-migration-connection.js";
import { registerVersion, findVersion, CURRENT_VERSION } from "./migration/compatibility.js";

export type {
  ReferentialAction,
  AddForeignKeyOptions,
} from "./connection-adapters/abstract/schema-definitions.js";

export { ExecutionStrategy, type MigrationLike } from "./migration/execution-strategy.js";
export { DefaultStrategy } from "./migration/default-strategy.js";
export { PendingMigrationConnection } from "./migration/pending-migration-connection.js";
export {
  registerVersion,
  findVersion,
  currentVersion,
  type Compatibility,
} from "./migration/compatibility.js";

export class MigrationError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export class IrreversibleMigration extends MigrationError {
  constructor(message = "This migration uses a feature that is not reversible.") {
    super(message);
    this.name = "IrreversibleMigration";
  }
}

export class DuplicateMigrationVersionError extends MigrationError {
  constructor(version: string | number) {
    super(`Duplicate migration version: ${version}`);
    this.name = "DuplicateMigrationVersionError";
  }
}

export class DuplicateMigrationNameError extends MigrationError {
  constructor(name: string) {
    super(`Duplicate migration name: ${name}`);
    this.name = "DuplicateMigrationNameError";
  }
}

export class UnknownMigrationVersionError extends MigrationError {
  constructor(version: string | number) {
    super(`No migration with version number ${version}.`);
    this.name = "UnknownMigrationVersionError";
  }
}

export class IllegalMigrationNameError extends MigrationError {
  constructor(name: string) {
    super(`Illegal name for migration file: ${name}.`);
    this.name = "IllegalMigrationNameError";
  }
}

export class InvalidMigrationTimestampError extends MigrationError {
  constructor(version: string | number) {
    super(`Invalid timestamp ${version} in migration file name.`);
    this.name = "InvalidMigrationTimestampError";
  }
}

export class PendingMigrationError extends MigrationError {
  constructor(message = "Migrations are pending. Run `migrate` to resolve.") {
    super(message);
    this.name = "PendingMigrationError";
  }
}

export class ConcurrentMigrationError extends MigrationError {
  constructor(message = "Cannot run migrations because another migration is currently running.") {
    super(message);
    this.name = "ConcurrentMigrationError";
  }
}

export class NoEnvironmentInSchemaError extends MigrationError {
  constructor(message = "Environment data not found in the schema.") {
    super(message);
    this.name = "NoEnvironmentInSchemaError";
  }
}

export class ProtectedEnvironmentError extends MigrationError {
  constructor(env: string) {
    super(`You are attempting to run a destructive action against your '${env}' database.`);
    this.name = "ProtectedEnvironmentError";
  }
}

export class EnvironmentMismatchError extends MigrationError {
  constructor(message = "The environment does not match the stored environment.") {
    super(message);
    this.name = "EnvironmentMismatchError";
  }
}

export class EnvironmentStorageError extends MigrationError {
  constructor(message = "Cannot store environment data.") {
    super(message);
    this.name = "EnvironmentStorageError";
  }
}

/**
 * Migration — base class for database migrations.
 *
 * Mirrors: ActiveRecord::Migration
 */
export abstract class Migration {
  protected adapter!: DatabaseAdapter;
  private _recording = false;
  private _recorder = new CommandRecorder();
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
   * Get the migration base class for a specific version.
   *
   * Usage:
   *   class CreateUsers extends Migration.forVersion(1.0) {
   *     async change() { ... }
   *   }
   *
   * Mirrors: ActiveRecord[version] (e.g. ActiveRecord::Migration[7.2])
   */
  static forVersion(v: string | number): typeof Migration {
    return findVersion(v) as unknown as typeof Migration;
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
      this._recorder = new CommandRecorder();
      try {
        await this.change();
      } finally {
        this._recording = false;
      }

      // If no operations were recorded, migration is irreversible
      if (this._recorder.commands.length === 0) {
        throw new IrreversibleMigration(
          `${this.constructor.name}#down is not implemented. This migration is irreversible.`,
        );
      }

      // Replay in reverse using CommandRecorder
      for (const { cmd, args } of this._recorder.commands.slice().reverse()) {
        await this._reverseOperation(cmd, args);
      }
    }
  }

  private async _reverseOperation(cmd: string, args: unknown[]): Promise<void> {
    switch (cmd) {
      case "createTable":
        await this.dropTable(args[0] as string);
        break;
      case "dropTable":
        throw new IrreversibleMigration("Cannot reverse dropTable without table definition");
      case "addColumn":
        await this.removeColumn(args[0] as string, args[1] as string);
        break;
      case "removeColumn": {
        const [rcTable, rcCol, rcType] = args as [string, string, ColumnType?];
        if (!rcType) {
          throw new IrreversibleMigration("Cannot reverse removeColumn without type info");
        }
        await this.addColumn(rcTable, rcCol, rcType);
        break;
      }
      case "addIndex": {
        const idxOpts: { column: string | string[]; name?: string } = {
          column: args[1] as string | string[],
        };
        const origOpts = args[2] as { name?: string } | undefined;
        if (origOpts?.name) idxOpts.name = origOpts.name;
        await this.removeIndex(args[0] as string, idxOpts);
        break;
      }
      case "removeIndex": {
        const riOpts = args[1] as { column?: string | string[]; name?: string } | undefined;
        if (!riOpts?.column) {
          throw new IrreversibleMigration("Cannot reverse removeIndex without column info");
        }
        if (riOpts.name) {
          await this.addIndex(args[0] as string, riOpts.column, { name: riOpts.name });
        } else {
          await this.addIndex(args[0] as string, riOpts.column);
        }
        break;
      }
      case "renameColumn":
        await this.renameColumn(args[0] as string, args[2] as string, args[1] as string);
        break;
      case "renameTable":
        await this.renameTable(args[1] as string, args[0] as string);
        break;
      case "renameIndex":
        await this.renameIndex(args[0] as string, args[2] as string, args[1] as string);
        break;
      case "changeColumn":
        throw new IrreversibleMigration("Cannot reverse changeColumn without previous type info");
      case "addForeignKey": {
        const fkOpts = args[2] as { column?: string; name?: string } | undefined;
        await this.removeForeignKey(args[0] as string, fkOpts ?? (args[1] as string));
        break;
      }
      case "addReference":
        await this.removeReference(
          args[0] as string,
          args[1] as string,
          args[2] as { polymorphic?: boolean } | undefined,
        );
        break;
      case "removeReference":
        await this.addReference(
          args[0] as string,
          args[1] as string,
          args[2] as { polymorphic?: boolean; foreignKey?: boolean } | undefined,
        );
        break;
      case "createJoinTable":
        await this.dropJoinTable(
          args[0] as string,
          args[1] as string,
          args[2] as { tableName?: string } | undefined,
        );
        break;
      case "dropJoinTable":
        throw new IrreversibleMigration("Cannot reverse dropJoinTable without table definition");
      case "addCheckConstraint": {
        const [table, expr, opts] = args as [string, string, { name?: string }?];
        const constraintName = opts?.name ?? this.schema._checkConstraintName(table, expr);
        await this.removeCheckConstraint(table, { name: constraintName });
        break;
      }
      case "removeCheckConstraint": {
        const [rmTable, rmArg] = args as [string, string | { name?: string } | undefined];
        if (typeof rmArg === "string") {
          await this.addCheckConstraint(rmTable, rmArg);
        } else {
          throw new IrreversibleMigration(
            "Cannot reverse removeCheckConstraint without expression",
          );
        }
        break;
      }
      default:
        throw new IrreversibleMigration(`Cannot reverse operation: ${cmd}`);
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
      | { id?: boolean | "uuid"; force?: boolean; ifNotExists?: boolean }
      | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void,
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("createTable", [name, optionsOrFn, fn]);
      return;
    }
    await this.schema.createTable(name, optionsOrFn, fn);
  }

  async dropTable(name: string, options?: { ifExists?: boolean }): Promise<void> {
    if (this._recording) {
      this._recorder.record("dropTable", [name]);
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
      this._recorder.record("addColumn", [tableName, columnName, type, options]);
      return;
    }
    await this.schema.addColumn(tableName, columnName, type, options);
  }

  async removeColumn(
    tableName: string,
    columnName: string,
    typeOrOptions?: ColumnType | { ifExists?: boolean },
    options?: { ifExists?: boolean },
  ): Promise<void> {
    const type = typeof typeOrOptions === "string" ? typeOrOptions : undefined;
    const opts = typeof typeOrOptions === "object" ? typeOrOptions : (options ?? {});
    if (this._recording) {
      this._recorder.record("removeColumn", [tableName, columnName, type, opts]);
      return;
    }
    await this.schema.removeColumn(tableName, columnName, opts);
  }

  async renameColumn(tableName: string, oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recorder.record("renameColumn", [tableName, oldName, newName]);
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
      this._recorder.record("addIndex", [tableName, columns, options]);
      return;
    }
    await this.schema.addIndex(tableName, columns, options);
  }

  async removeIndex(
    tableName: string,
    options: { column?: string | string[]; name?: string } = {},
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("removeIndex", [tableName, options]);
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
      this._recorder.record("changeColumn", [tableName, columnName, type, options]);
      return;
    }
    await this.schema.changeColumn(tableName, columnName, type, options);
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recorder.record("renameTable", [oldName, newName]);
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
      this._recorder.record("changeColumnDefault", [tableName, columnName, options]);
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
      this._recorder.record("changeColumnNull", [tableName, columnName, allowNull, defaultValue]);
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
      this._recorder.record("addReference", [tableName, refName, options]);
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
      this._recorder.record("removeReference", [tableName, refName, options]);
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
      this._recorder.record("addForeignKey", [fromTable, toTable, options]);
      return;
    }
    await this.schema.addForeignKey(fromTable, toTable, options);
  }

  async removeForeignKey(
    fromTable: string,
    toTableOrOptions?: string | { column?: string; name?: string },
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("removeForeignKey", [fromTable, toTableOrOptions]);
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
      this._recorder.record("addCheckConstraint", [tableName, expression, options]);
      return;
    }
    await this.schema.addCheckConstraint(tableName, expression, options);
  }

  async removeCheckConstraint(
    tableName: string,
    expressionOrOptions?: string | { name?: string },
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("removeCheckConstraint", [tableName, expressionOrOptions]);
      return;
    }
    await this.schema.removeCheckConstraint(tableName, expressionOrOptions);
  }
  async addTimestamps(tableName: string, options: ColumnOptions = {}): Promise<void> {
    if (this._recording) {
      this._recorder.record("addTimestamps", [tableName, options]);
      return;
    }
    await this.schema.addTimestamps(tableName, options);
  }

  async removeTimestamps(tableName: string): Promise<void> {
    if (this._recording) {
      this._recorder.record("removeTimestamps", [tableName]);
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
      this._recorder.record("createJoinTable", [table1, table2, options, fn]);
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
      this._recorder.record("dropJoinTable", [table1, table2, options]);
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
      this._recorder.record("renameIndex", [_tableName, oldName, newName]);
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

  async columns(tableName: string): Promise<import("./connection-adapters/column.js").Column[]> {
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
      // Record operations and reverse them, preserving outer recorder state
      const outerRecording = this._recording;
      const outerRecorder = this._recorder;
      const innerRecorder = new CommandRecorder();
      this._recording = true;
      this._recorder = innerRecorder;
      try {
        await migrationOrFn();
      } finally {
        this._recording = outerRecording;
        this._recorder = outerRecorder;
      }
      for (const { cmd, args } of innerRecorder.commands.slice().reverse()) {
        await this._reverseOperation(cmd, args);
      }
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
    if (this._recording) {
      // During reversal recording, run the down fns
      for (const f of downFns) await f();
    } else {
      // During forward migration, run the up fns
      for (const f of upFns) await f();
    }
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
    options?: {
      primaryKey?: string | false;
      force?: boolean;
      ifNotExists?: boolean;
      id?: boolean | "uuid";
    },
    fn?: (t: TableDefinition) => void,
  ): Promise<void> {
    if (name.length > 64) {
      throw new MigrationError(`Table name '${name}' is too long; the limit is 64 characters`);
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
      const idType = typeof options?.id === "string" ? options.id : "integer";
      meta.set("id", { type: idType, primaryKey: true });
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

export class Migrator {
  private _adapter: DatabaseAdapter;
  private _migrations: MigrationProxy[];
  private _schemaMigration: SchemaMigration;
  private _internalMetadata: InternalMetadata;
  private _environment: string;
  private _strategy: ExecutionStrategy;
  verbose = true;
  private _output: string[] = [];

  constructor(
    adapter: DatabaseAdapter,
    migrations: MigrationProxy[],
    options: { environment?: string; strategy?: ExecutionStrategy } = {},
  ) {
    this._adapter = adapter;
    this._schemaMigration = new SchemaMigration(adapter);
    this._internalMetadata = new InternalMetadata(adapter);
    this._environment =
      options.environment ?? (process.env.NODE_ENV || DatabaseConfigurations.defaultEnv);
    this._strategy = options.strategy ?? new DefaultStrategy();
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
        throw new MigrationError(
          `Invalid migration version: ${m.version}. Version must be a numeric string.`,
        );
      }
      const normalized = String(BigInt(m.version));
      if (versions.has(normalized)) {
        throw new DuplicateMigrationVersionError(m.version);
      }
      if (names.has(m.name)) {
        throw new DuplicateMigrationNameError(m.name);
      }
      versions.add(normalized);
      names.add(m.name);
    }
  }

  private _schemaTableEnsured = false;

  private async _ensureSchemaTable(): Promise<void> {
    if (this._schemaTableEnsured) return;
    await this._schemaMigration.createTable();
    await this._internalMetadata.createTable();
    this._schemaTableEnsured = true;
  }

  private async _appliedVersions(): Promise<Set<string>> {
    const versions = await this._schemaMigration.allVersions();
    return new Set(
      versions.map((v) => {
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
        throw new MigrationError(
          `Invalid target version: ${v}. Must be a non-negative numeric value.`,
        );
      }
    } else {
      if (!Number.isInteger(v) || v < 0) {
        throw new MigrationError(`Invalid target version: ${v}. Must be a non-negative integer.`);
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
    await this._strategy.exec(direction, migration, this._adapter);
    if (direction === "up") {
      await this._schemaMigration.recordVersion(proxy.version);
      await this._internalMetadata.set("environment", this._environment);
    } else {
      await this._schemaMigration.deleteVersion(proxy.version);
    }

    if (this.verbose) {
      const action = direction === "up" ? "migrated" : "reverted";
      this._output.push(`== ${proxy.version} ${proxy.name}: ${action} ==`);
    }
  }

  /**
   * Check that the current environment matches the stored environment.
   * Raises EnvironmentMismatchError if they differ.
   *
   * Mirrors: ActiveRecord::Tasks::DatabaseTasks.check_current_environment
   */
  async checkEnvironment(): Promise<void> {
    if (process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK === "1") return;
    await this._ensureSchemaTable();
    const stored = await this._internalMetadata.get("environment");
    if (stored === null) {
      throw new NoEnvironmentInSchemaError(
        "Environment data not found in the schema. Run migrations to initialize it.",
      );
    }
    if (stored !== this._environment) {
      throw new EnvironmentMismatchError(
        `You are attempting to modify a database that was last used in the '${stored}' environment. ` +
          `You are running in the '${this._environment}' environment. ` +
          `If you are sure you want to continue, run with DISABLE_DATABASE_ENVIRONMENT_CHECK=1.`,
      );
    }
  }

  /**
   * Check that the current environment is not protected.
   * Protected environments (e.g. production) require explicit confirmation
   * for destructive operations.
   *
   * Mirrors: ActiveRecord::Tasks::DatabaseTasks.check_protected_environments!
   */
  async checkProtectedEnvironments(protectedEnvironments?: string[]): Promise<void> {
    await this._ensureSchemaTable();
    const stored = await this._internalMetadata.get("environment");
    const env = stored ?? this._environment;

    let envList = protectedEnvironments;
    if (!envList) {
      const { Base } = await import("./base.js");
      envList = Base.protectedEnvironments ?? ["production"];
    }

    if (envList.includes(env)) {
      throw new ProtectedEnvironmentError(env);
    }
  }

  get internalMetadata(): InternalMetadata {
    return this._internalMetadata;
  }
}

/**
 * Mirrors: ActiveRecord::Migration::Current
 *
 * Alias for the latest migration version. Migrations that don't
 * specify a version inherit from this.
 *
 * Equivalent to Migration.forVersion(CURRENT_VERSION).
 */
export class Current extends Migration {
  static readonly VERSION = CURRENT_VERSION;
}

// Register the current version so Migration.forVersion(1.0) works
registerVersion(CURRENT_VERSION, Current);

/**
 * Mirrors: ActiveRecord::Migration::CheckPending
 *
 * Middleware that raises PendingMigrationError if migrations are pending.
 */
export class CheckPending {
  private _app: (env: Record<string, unknown>) => Promise<unknown>;
  private _migrator?: Migrator;
  private _pendingConnection?: PendingMigrationConnection;
  private _migrations: MigrationProxy[];

  constructor(
    app: (env: Record<string, unknown>) => Promise<unknown>,
    options: {
      migrator?: Migrator;
      pendingConnection?: PendingMigrationConnection;
      migrations?: MigrationProxy[];
    } = {},
  ) {
    this._app = app;
    this._migrator = options.migrator;
    this._pendingConnection = options.pendingConnection;
    this._migrations = options.migrations ?? [];
  }

  async call(env: Record<string, unknown>): Promise<unknown> {
    if (this._migrator) {
      const pending = await this._migrator.pendingMigrations();
      this._throwIfPending(pending.length);
    } else if (this._pendingConnection) {
      if (this._migrations.length === 0) {
        throw new MigrationError(
          "CheckPending requires a migrations list when using pendingConnection",
        );
      }
      await this._pendingConnection.withAdapter(async (adapter) => {
        const sm = new SchemaMigration(adapter);
        let applied = new Set<string>();
        try {
          if (await sm.tableExists()) {
            const versions = await sm.allVersions();
            applied = new Set(
              versions.map((v) => {
                try {
                  return String(BigInt(v));
                } catch {
                  return v;
                }
              }),
            );
          }
        } catch (err: unknown) {
          if (
            err instanceof Error &&
            /no such column|does not exist|unknown column/i.test(err.message)
          ) {
            // Table exists with incompatible schema; treat as no versions applied
          } else {
            throw err;
          }
        }
        let pendingCount = 0;
        for (const m of this._migrations) {
          let normalized: string;
          try {
            normalized = String(BigInt(m.version));
          } catch {
            throw new MigrationError(`Invalid migration version "${m.version}" in CheckPending`);
          }
          if (!applied.has(normalized)) pendingCount++;
        }
        this._throwIfPending(pendingCount);
      });
    }
    return this._app(env);
  }

  private _throwIfPending(count: number): void {
    if (count > 0) {
      throw new PendingMigrationError(
        `Migrations are pending. To resolve this issue, run:\n\n  migrate\n\n` +
          `You have ${count} pending migration(s).`,
      );
    }
  }
}
