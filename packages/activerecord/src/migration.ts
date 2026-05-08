import { getFs, getPath, Logger, getEnv } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import type { FsDirent } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import type { DatabaseAdapter } from "./adapter.js";
import {
  TableDefinition,
  Table,
  ForeignKeyDefinition,
  type ColumnType,
  type ColumnOptions,
  type AddForeignKeyOptions,
} from "./connection-adapters/abstract/schema-definitions.js";
import {
  SchemaStatements,
  assertSchemaAdapter,
} from "./connection-adapters/abstract/schema-statements.js";
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

import { ActiveRecordError } from "./errors.js";

// Mirrors Zlib.crc32 (ISO 3309 / ITU-T V.42 polynomial) operating on UTF-8 bytes.
function _crc32(str: string): number {
  const bytes = new TextEncoder().encode(str);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Migration error classes. Rails defines these in migration.rb, so
// they live here. internal-metadata.ts imports EnvironmentStorageError
// back from this module; the ESM cycle is safe because each callsite
// references the class from a method body (lazy), not at module init.

export class MigrationError extends ActiveRecordError {
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

  /** @internal */
  detailedMigrationMessage(pendingMigrations: Array<{ filename?: string }>): string {
    const env = Migration.env();
    let message =
      "Migrations are pending. To resolve this issue, run:\n\n        bin/rails db:migrate";
    if (env !== "development" && env !== "test") message += ` RAILS_ENV=${env}`;
    message += "\n\n";
    message += `You have ${pendingMigrations.length} pending ${pendingMigrations.length > 1 ? "migrations:" : "migration:"}\n\n`;
    for (const m of pendingMigrations) {
      if (m.filename) message += `${m.filename}\n`;
    }
    return message;
  }
}

export class ConcurrentMigrationError extends MigrationError {
  static readonly RELEASE_LOCK_FAILED_MESSAGE = "Failed to release advisory lock";

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
  /**
   * Accept either a prebuilt message (one-arg) or `(current, stored)`
   * separately (two-arg) matching Rails'
   * `EnvironmentMismatchError.new(current:, stored:)`.
   */
  constructor(currentOrMessage?: string, stored?: string) {
    const message =
      stored !== undefined && currentOrMessage !== undefined
        ? `You are attempting to modify a database that was last run in \`${stored}\` environment.\n` +
          `You are running in \`${currentOrMessage}\` environment. ` +
          `If you are sure you want to continue, first set the environment using:\n\n` +
          `        trails db environment:set\n`
        : (currentOrMessage ?? "The environment does not match the stored environment.");
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
  /**
   * Class-level delegation target set from outside (mirrors Rails `class << self; attr_accessor :delegate`).
   * Distinct from the instance `delegate` getter, which returns the current adapter.
   * @internal
   */
  static delegate: DatabaseAdapter | null = null;
  private _version?: string;
  verbose = true;
  static logger: Logger = new Logger();
  private static _disableDdlTransaction = false;

  /** Return the normalized adapter name from the configured adapter. */
  protected get _adapterName(): "sqlite" | "postgres" | "mysql" {
    return this.adapter.adapterName;
  }

  private _schema?: SchemaStatements;

  get schema(): SchemaStatements {
    if (!this._schema) {
      assertSchemaAdapter(this.adapter);
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
   *
   * @internal
   */
  async up(): Promise<void> {
    // Default: run change() in forward direction
    await this._runChange("up");
  }

  /**
   * Override to define the rollback migration.
   * Default: run change() in reverse direction.
   *
   * @internal
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
      case "changeColumnDefault": {
        const [cdTable, cdCol, cdOpts] = args as [string, string, { from?: unknown; to: unknown }];
        if (cdOpts && typeof cdOpts === "object" && "from" in cdOpts) {
          await this.changeColumnDefault(cdTable, cdCol, { from: cdOpts.to, to: cdOpts.from });
        } else {
          throw new IrreversibleMigration("Cannot reverse changeColumnDefault without from/to");
        }
        break;
      }
      case "changeColumnNull": {
        const [cnTable, cnCol, cnAllow, cnDefault] = args as [string, string, boolean, unknown?];
        await this.changeColumnNull(cnTable, cnCol, !cnAllow, cnDefault);
        break;
      }
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
    if (options) {
      await this.schema.dropTable(name, options);
    } else {
      await this.schema.dropTable(name);
    }
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
    await this.schema.removeColumn(tableName, columnName, type, opts);
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
    toTableOrOptions?:
      | string
      | { column?: string; name?: string; toTable?: string; ifExists?: boolean },
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
    expressionOrOptions?: string | { name?: string; ifExists?: boolean },
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

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recorder.record("renameIndex", [tableName, oldName, newName]);
      return;
    }
    await this.schema.renameIndex(tableName, oldName, newName);
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

  async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
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
    this.announce(direction === "up" ? "migrating" : "reverting");
    const start = Date.now();
    await this.execMigration(this.adapter, direction);
    const elapsed = ((Date.now() - start) / 1000).toFixed(4);
    this.announce(`${direction === "up" ? "migrated" : "reverted"} (${elapsed}s)`);
    this.write();
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

  // --- Logging (Rails: Migration#write, #announce, #say, #say_with_time, #suppress_messages) ---

  write(text = ""): void {
    if (this.verbose) {
      Migration.logger.info(text);
    }
  }

  announce(message: string): void {
    const text = `${this.version} ${this.name}: ${message}`;
    const pad = Math.max(0, 75 - text.length);
    this.write(`== ${text} ${"=".repeat(pad)}`);
  }

  say(message: string, subitem = false): void {
    this.write(`${subitem ? "   ->" : "--"} ${message}`);
  }

  async sayWithTime<T>(message: string, fn: () => Promise<T>): Promise<T> {
    this.say(message);
    const start = Date.now();
    const result = await fn();
    const elapsed = ((Date.now() - start) / 1000).toFixed(4);
    this.say(`${elapsed}s`, true);
    if (typeof result === "number") {
      this.say(`${result} rows`, true);
    }
    return result;
  }

  async suppressMessages(fn: () => Promise<void>): Promise<void> {
    const was = this.verbose;
    this.verbose = false;
    try {
      await fn();
    } finally {
      this.verbose = was;
    }
  }

  // --- Connection (Rails: Migration#connection, #connection_pool) ---

  get connection(): DatabaseAdapter {
    return this.adapter;
  }

  get connectionPool(): DatabaseAdapter {
    return this.adapter;
  }

  // --- Execution (Rails: Migration#exec_migration, #execution_strategy, etc.) ---

  async execMigration(conn: DatabaseAdapter, direction: "up" | "down"): Promise<void> {
    this.adapter = conn;
    try {
      if (direction === "up") {
        await this.up();
      } else {
        await this.down();
      }
    } finally {
      this._schema = undefined;
    }
  }

  get executionStrategy(): ExecutionStrategy {
    return new DefaultStrategy();
  }

  get disableDdlTransaction(): boolean {
    return (this.constructor as typeof Migration)._disableDdlTransaction;
  }

  static disableDdlTransactionBang(): void {
    this._disableDdlTransaction = true;
  }

  compatibleTableDefinition(t: unknown): unknown {
    return t;
  }

  // --- Class methods (Rails: Migration.copy, .proper_table_name, etc.) ---

  static isValidVersionFormat(version: string): boolean {
    return /^\d{3,}$/.test(version);
  }

  static nextMigrationNumber(_number?: number): string {
    return Temporal.Now.instant()
      .toString()
      .replace(/[-T:Z.]/g, "")
      .slice(0, 14);
  }

  static properTableName(
    name: string,
    options: { tableNamePrefix?: string; tableNameSuffix?: string } = {},
  ): string {
    const prefix = options.tableNamePrefix ?? "";
    const suffix = options.tableNameSuffix ?? "";
    return `${prefix}${name}${suffix}`;
  }

  static tableNameOptions(): { tableNamePrefix: string; tableNameSuffix: string } {
    return { tableNamePrefix: "", tableNameSuffix: "" };
  }

  static async copy(
    destination: string,
    sources: Record<string, string>,
    _options: Record<string, unknown> = {},
  ): Promise<string[]> {
    // Rails copies migration files from source directories to destination.
    // In our TS implementation, migrations are registered programmatically,
    // not via filesystem discovery. This returns the list of copied files
    // (empty when there's nothing to copy).
    const fs = getFs();
    const path = getPath();

    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const copied: string[] = [];
    for (const [, sourcePath] of Object.entries(sources)) {
      if (!fs.existsSync(sourcePath)) continue;
      const files = fs
        .readdirSync(sourcePath)
        .filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
      for (const file of files) {
        const dest = path.join(destination, file);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(path.join(sourcePath, file), dest);
          copied.push(dest);
        }
      }
    }
    return copied;
  }

  // --- Pending checks (Rails class methods) ---

  static async checkPendingMigrations(): Promise<void> {
    // In a full Rails app this would check all database configs.
    // Here it's a no-op; use Migrator.pendingMigrations() directly.
  }

  static async checkAllPendingBang(): Promise<void> {
    await this.checkPendingMigrations();
  }

  static async loadSchemaIfPendingBang(): Promise<void> {
    await this.checkPendingMigrations();
  }

  static async maintainTestSchemaBang(): Promise<void> {
    await this.checkPendingMigrations();
  }

  /** @internal */
  static get nearestDelegate(): DatabaseAdapter | null {
    return (
      this.delegate ?? (Object.getPrototypeOf(this) as typeof Migration).nearestDelegate ?? null
    );
  }

  /** @internal */
  static methodMissing(name: string, ...args: unknown[]): unknown {
    const delegate = this.nearestDelegate as Record<string, unknown> | null;
    if (delegate !== null && typeof delegate[name] === "function") {
      return (delegate[name] as (...a: unknown[]) => unknown).apply(delegate, args);
    }
    throw new TypeError(`undefined method '${name}' for ${this.name}`);
  }

  // --- Delegation (Rails: Migration#nearest_delegate, #delegate) ---

  /** Instance delegation target — returns the current adapter. Distinct from the class-level `Migration.delegate`. */
  get delegate(): DatabaseAdapter {
    return this.adapter;
  }

  get nearestDelegate(): DatabaseAdapter {
    return this.adapter;
  }

  /** @internal */
  methodMissing(name: string, ...args: unknown[]): unknown {
    const conn = this.adapter as unknown as Record<string, unknown>;
    if (typeof conn[name] !== "function") {
      // JS has no NoMethodError; TypeError is the closest stdlib equivalent.
      throw new TypeError(`undefined method '${name}' for ${this.adapter.constructor.name}`);
    }
    return (conn[name] as (...a: unknown[]) => unknown).apply(conn, args);
  }

  /** @internal */
  executeBlock(fn: () => Promise<void>): Promise<void> {
    return fn();
  }

  /** @internal */
  formatArguments(args: unknown[]): string {
    const safeJson = (v: unknown) =>
      JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? `${val}n` : val));
    const argList = args.slice(0, -1).map((a) => safeJson(a));
    const last = args[args.length - 1];
    if (last !== null && typeof last === "object" && !Array.isArray(last)) {
      const filtered = Object.fromEntries(
        Object.entries(last as Record<string, unknown>).filter(([k]) => !this.isInternalOption(k)),
      );
      if (Object.keys(filtered).length > 0) argList.push(safeJson(filtered));
    } else if (last !== undefined) {
      argList.push(safeJson(last));
    }
    return argList.join(", ");
  }

  /** @internal */
  isInternalOption(optionName: string): boolean {
    return optionName.startsWith("_");
  }

  /** @internal */
  commandRecorder(): CommandRecorder {
    return new CommandRecorder(this.adapter);
  }

  /** @internal */
  static env(): string {
    return getEnv("TRAILS_ENV") ?? getEnv("NODE_ENV") ?? "development";
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
        limit?: number | null;
        precision?: number | null;
        scale?: number | null;
      }
    >
  >();
  private _indexes = new Map<string, { columns: string[]; unique: boolean; name?: string }[]>();
  tableNamePrefix = "";
  tableNameSuffix = "";

  constructor(private adapter: DatabaseAdapter) {}

  private get _adapterName(): "sqlite" | "postgres" | "mysql" {
    return this.adapter.adapterName;
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
    const td = new TableDefinition(name, {
      id: options?.id,
      adapterName: this._adapterName,
      adapter: this.adapter,
    });
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
        limit?: number | null;
        precision?: number | null;
        scale?: number | null;
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

  // Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#create_virtual_table
  async createVirtualTable(name: string, moduleName: string, args: string[]): Promise<void> {
    if (typeof (this.adapter as any).createVirtualTable === "function") {
      await (this.adapter as any).createVirtualTable(name, moduleName, args);
      this._tables.add(name);
    }
    // Non-SQLite adapters: no-op; virtual tables are SQLite-specific.
  }

  private _mapType(type: string, options?: ColumnOptions): string {
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
      case "time": {
        const p = options?.precision;
        if (p != null && !(p >= 0 && p <= 6))
          throw new ArgumentError(
            `No TIME type has precision of ${p}. The allowed range of precision is from 0 to 6`,
          );
        return p != null ? `TIME(${p})` : "TIME";
      }
      case "datetime":
      case "timestamp": {
        const base = an === "postgres" ? "TIMESTAMP" : "DATETIME";
        // precision: undefined → Rails default of 6; precision: null → no precision suffix
        const p = options?.precision === undefined ? 6 : options.precision;
        if (p != null && !(p >= 0 && p <= 6))
          throw new ArgumentError(
            `No ${base} type has precision of ${p}. The allowed range of precision is from 0 to 6`,
          );
        return p != null ? `${base}(${p})` : base;
      }
      case "binary":
        return an === "postgres" ? "BYTEA" : "BLOB";
      case "primary_key":
        if (an === "postgres") return "SERIAL PRIMARY KEY";
        if (an === "mysql") return "BIGINT AUTO_INCREMENT PRIMARY KEY";
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
      `ALTER TABLE "${table}" ADD COLUMN "${column}" ${this._mapType(type, _options)}`,
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
        `ALTER TABLE "${table}" MODIFY COLUMN "${column}" ${this._mapType(type, _options)}`,
      );
    } else {
      await this.adapter.executeMutation(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE ${this._mapType(type, _options)}`,
      );
    }
    const meta = this._columnMeta.get(table);
    if (meta && meta.has(column)) {
      const entry = meta.get(column)!;
      meta.set(column, {
        ...entry,
        type,
        null: _options?.null !== undefined ? _options.null : entry.null,
        default: _options?.default !== undefined ? _options.default : entry.default,
        limit: _options?.limit !== undefined ? _options.limit : entry.limit,
        precision:
          _options?.precision !== undefined
            ? _options.precision
            : type === "datetime" || type === "timestamp"
              ? 6
              : entry.precision,
        scale: _options?.scale !== undefined ? _options.scale : entry.scale,
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
        let col = this.adapter.quoteIdentifier(c);
        if (an !== "mysql") {
          const ord = options?.order?.[c];
          if (ord) col += ` ${ord.toUpperCase()}`;
        }
        return col;
      })
      .join(", ");
    let sql = `CREATE ${uniqueStr}INDEX ${ifNotExistsStr}${this.adapter.quoteIdentifier(indexName)} ON ${this.adapter.quoteTableName(table)} (${colsStr})`;
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
      if (this.adapter.adapterName === "mysql") {
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
    limit?: number | null;
    precision?: number | null;
    scale?: number | null;
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
  migration: () => MigrationLike | Promise<MigrationLike>;
}

export class Migrator {
  private _adapter: DatabaseAdapter;
  private _migrations: MigrationProxy[];
  private _schemaMigration: SchemaMigration;
  private _internalMetadata: InternalMetadata;
  private _environment: string;
  private _strategy: ExecutionStrategy;
  verbose = true;

  constructor(
    adapter: DatabaseAdapter,
    migrations: MigrationProxy[],
    options: {
      environment?: string;
      strategy?: ExecutionStrategy;
      /**
       * Set to false when the db_config opts out of metadata storage
       * (Rails' `use_metadata_table: false`). environment stamping is a
       * no-op / raises in `environment:set` when this is false.
       */
      internalMetadataEnabled?: boolean;
    } = {},
  ) {
    this._adapter = adapter;
    this._schemaMigration = new SchemaMigration(adapter);
    this._internalMetadata = new InternalMetadata(adapter, {
      enabled: options.internalMetadataEnabled ?? true,
    });
    this._environment =
      options.environment ??
      getEnv("TRAILS_ENV") ??
      getEnv("NODE_ENV") ??
      DatabaseConfigurations.defaultEnv;
    this._strategy = options.strategy ?? new DefaultStrategy();
    this.validate(migrations);
    const normalized = migrations.map((m) => ({
      ...m,
      version: String(BigInt(m.version)),
    }));
    this._migrations = this._sortMigrations(normalized);
  }

  get migrations(): MigrationProxy[] {
    return [...this._migrations];
  }

  // Rails: MIGRATOR_SALT = 2053462845 (Zlib.crc32("googol"))
  private static readonly _MIGRATOR_SALT = 2053462845;

  /**
   * Wrap a block with an advisory lock to prevent concurrent migrations.
   * If the adapter doesn't support advisory locks, runs without locking.
   *
   * Mirrors: ActiveRecord::Migrator#with_advisory_lock
   */
  private async _withAdvisoryLock<T>(fn: () => Promise<T>): Promise<T> {
    const adapter = this._adapter;
    if (
      !adapter.supportsAdvisoryLocks?.() ||
      !adapter.getAdvisoryLock ||
      !adapter.releaseAdvisoryLock
    ) {
      return fn();
    }
    if (typeof adapter.currentDatabase !== "function") {
      throw new Error(
        `${adapter.constructor.name} must implement currentDatabase() to support advisory-locked migrations`,
      );
    }
    const lockId = await this.generateMigratorAdvisoryLockId();
    const locked = await adapter.getAdvisoryLock(lockId);
    if (!locked) {
      throw new ConcurrentMigrationError();
    }
    // Capture fn error so we can release the lock before re-throwing (no-unsafe-finally).
    // Release errors are swallowed when fn itself failed so the migration error wins.
    const _sentinel = Symbol();
    let fnResult: T | typeof _sentinel = _sentinel;
    let fnError: unknown = _sentinel;
    try {
      fnResult = await fn();
    } catch (e) {
      fnError = e;
    }
    // releaseAdvisoryLock is guaranteed present (checked in the guard above).
    // Any non-true return — false or undefined — is treated as failure, matching
    // Rails: `release_advisory_lock(...) or raise` (migration.rb:1608-1612).
    let released: boolean | undefined;
    try {
      released = await adapter.releaseAdvisoryLock!(lockId);
    } catch (releaseErr) {
      if (fnError !== _sentinel) throw fnError;
      throw releaseErr;
    }
    if (fnError !== _sentinel) throw fnError;
    if (released !== true) {
      throw new ConcurrentMigrationError(ConcurrentMigrationError.RELEASE_LOCK_FAILED_MESSAGE);
    }
    return fnResult as T;
  }

  /**
   * Run all pending migrations up, or migrate to a specific version.
   *
   * Mirrors: ActiveRecord::Migrator#migrate
   */
  async migrate(targetVersion?: number | string | null): Promise<void> {
    await this._withAdvisoryLock(async () => {
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
    });
  }

  /**
   * Run all pending migrations up to the target version (or all if no target).
   *
   * Mirrors: ActiveRecord::Migrator.up
   *
   * @internal
   */
  async up(targetVersion?: number | string | null): Promise<void> {
    await this._withAdvisoryLock(async () => {
      await this._ensureSchemaTable();
      await this._migrateUp(targetVersion ?? null);
    });
  }

  /**
   * Revert all applied migrations down to the target version.
   *
   * Mirrors: ActiveRecord::Migrator.down
   *
   * @internal
   */
  async down(targetVersion?: number | string | null): Promise<void> {
    await this._withAdvisoryLock(async () => {
      await this._ensureSchemaTable();
      await this._migrateDown(targetVersion ?? 0);
    });
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
    await this._withAdvisoryLock(async () => {
      await this._ensureSchemaTable();
      const applied = await this._appliedVersions();
      const appliedMigrations = this._migrations.filter((m) => applied.has(m.version)).reverse();
      const toRollback = appliedMigrations.slice(0, steps);

      for (const proxy of toRollback) {
        await this._runMigration(proxy, "down");
      }
    });
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
    await this._withAdvisoryLock(async () => {
      await this._ensureSchemaTable();
      const pending = await this.pendingMigrations();
      const toRun = pending.slice(0, steps);

      for (const proxy of toRun) {
        await this._runMigration(proxy, "up");
      }
    });
  }

  /**
   * @internal Mirrors: ActiveRecord::Migrator#run_without_lock
   *
   * Signature differs from Rails: Rails reads `@direction`/`@target_version` from
   * per-invocation instance state; TS takes them as explicit params.
   *
   * The already-applied guards replicate the skip logic in Rails'
   * `execute_migration_in_transaction` (migration.rb:1528-1530), which checks
   * `migrated.include?(migration.version)` before running. Our `_runMigration`
   * doesn't carry that check, so the guard lives here instead.
   */
  async runWithoutLock(direction: "up" | "down", targetVersion: string | number): Promise<void> {
    this._validateTargetVersion(targetVersion);
    await this._ensureSchemaTable();
    const key = String(BigInt(targetVersion));
    const proxy = this._migrations.find((m) => m.version === key);
    if (!proxy) throw new UnknownMigrationVersionError(key);
    const applied = await this._appliedVersions();
    if (direction === "up" && applied.has(key)) return;
    if (direction === "down" && !applied.has(key)) return;
    await this._runMigration(proxy, direction);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#migrate_without_lock */
  async migrateWithoutLock(targetVersion?: number | string | null): Promise<void> {
    await this._ensureSchemaTable();
    await this._migrateUp(targetVersion ?? null);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#record_environment */
  async recordEnvironment(): Promise<void> {
    if (this._internalMetadata.enabled) {
      await this._ensureSchemaTable();
      await this._internalMetadata.set("environment", this._environment);
    }
  }

  /** @internal Mirrors: ActiveRecord::Migrator#ran? */
  async isRan(proxy: MigrationProxy): Promise<boolean> {
    const applied = await this._appliedVersions();
    return applied.has(proxy.version);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#invalid_target? */
  isInvalidTarget(targetVersion?: string | number | null): boolean {
    if (targetVersion === null || targetVersion === undefined) return false;
    try {
      const key = String(BigInt(targetVersion));
      return !this._migrations.some((m) => m.version === key);
    } catch {
      return true;
    }
  }

  /** @internal Mirrors: ActiveRecord::Migrator#execute_migration_in_transaction */
  async executeMigrationInTransaction(
    proxy: MigrationProxy,
    direction: "up" | "down" = "up",
  ): Promise<void> {
    await this._runMigration(proxy, direction);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#record_version_state_after_migrating */
  async recordVersionStateAfterMigrating(
    version: string,
    direction: "up" | "down" = "up",
  ): Promise<void> {
    if (direction === "up") {
      await this._schemaMigration.recordVersion(version);
    } else {
      await this._schemaMigration.deleteVersion(version);
    }
  }

  /** @internal Mirrors: ActiveRecord::Migrator#ddl_transaction */
  async ddlTransaction(migration: MigrationLike, fn: () => Promise<void>): Promise<void> {
    return this._ddlTransaction(migration, fn);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#use_transaction? */
  isUseTransaction(migration: MigrationLike): boolean {
    return this._useTransaction(migration);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#use_advisory_lock? */
  isUseAdvisoryLock(): boolean {
    return !!(
      this._adapter.supportsAdvisoryLocks?.() &&
      this._adapter.getAdvisoryLock &&
      this._adapter.releaseAdvisoryLock &&
      typeof this._adapter.currentDatabase === "function"
    );
  }

  /** @internal Mirrors: ActiveRecord::Migrator#with_advisory_lock */
  async withAdvisoryLock<T>(fn: () => Promise<T>): Promise<T> {
    return this._withAdvisoryLock(fn);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#generate_migrator_advisory_lock_id */
  async generateMigratorAdvisoryLockId(): Promise<bigint> {
    if (typeof this._adapter.currentDatabase !== "function") {
      throw new Error(
        `${this._adapter.constructor.name} must implement currentDatabase() to support advisory-locked migrations`,
      );
    }
    const dbName = await this._adapter.currentDatabase();
    if (!dbName) {
      // currentDatabase() returned empty — adapter bug (MySQL stub returns "").
      // Fall back to the salt; file a fix for the adapter.
      return BigInt(Migrator._MIGRATOR_SALT);
    }
    return BigInt(Migrator._MIGRATOR_SALT) * BigInt(_crc32(dbName));
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
   * Read-only check for whether `schema_migrations` already exists.
   * Used by `db prepare` to decide whether the DB is fresh (should run
   * seeds) vs. already-initialized (just run pending migrations).
   *
   * Mirrors Rails' `initialize_database` which checks
   * `schema_migration.table_exists?` for the same purpose.
   */
  async schemaMigrationTableExists(): Promise<boolean> {
    return this._schemaMigration.tableExists();
  }

  /**
   * Read-only variant of {@link currentVersion}: returns 0 when the
   * schema_migrations table doesn't yet exist, without creating it.
   *
   * Matches Rails' `current_version` exactly (it calls `get_all_versions`
   * which checks `schema_migration.table_exists?` and returns [] on miss).
   * The regular {@link currentVersion} keeps the legacy auto-create path
   * to stay compatible with internal callers that rely on it.
   */
  async currentVersionReadOnly(): Promise<number> {
    if (!(await this._schemaMigration.tableExists())) return 0;
    const applied = await this._appliedVersions();
    let max = BigInt(0);
    for (const v of applied) {
      const bv = BigInt(v);
      if (bv > max) max = bv;
    }
    return Number(max);
  }

  /**
   * Read-only variant of {@link pendingMigrations}: does not create the
   * schema_migrations / ar_internal_metadata tables. Treats a missing
   * schema_migrations as "no applied versions", so every known migration
   * is considered pending.
   *
   * Matches Rails' `pending_migration_versions` (built from
   * `get_all_versions`, which checks `table_exists?` and returns [] on
   * miss).
   */
  async pendingMigrationsReadOnly(): Promise<MigrationProxy[]> {
    const applied = (await this._schemaMigration.tableExists())
      ? await this._appliedVersions()
      : new Set<string>();
    return this._migrations.filter((m) => !applied.has(m.version));
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

  /** @internal */
  private validate(migrations: MigrationProxy[]): void {
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

  /**
   * Run exactly one migration (identified by `targetVersion`) in the given
   * direction. Used by the `db:migrate:up` / `db:migrate:down` CLI paths
   * where the user supplies a specific VERSION.
   *
   * Mirrors: ActiveRecord::MigrationContext#run (which builds a Migrator
   * scoped to `target_version` and calls `#run`).
   */
  async run(direction: "up" | "down", targetVersion: number | string): Promise<void> {
    await this._withAdvisoryLock(() => this.runWithoutLock(direction, targetVersion));
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
      Migration.logger.info(`== ${proxy.version} ${proxy.name}: ${action} ==`);
    }

    const migration = await proxy.migration();
    // Rails wraps both the migration execution AND the version
    // stamping inside the same ddl_transaction so they commit/rollback
    // atomically. Without this, a committed migration + failed stamp
    // would leave schema_migrations out of sync.
    await this._ddlTransaction(migration, async () => {
      await this._strategy.exec(direction, migration, this._adapter);
      if (direction === "up") {
        await this._schemaMigration.recordVersion(proxy.version);
        if (this._internalMetadata.enabled) {
          await this._internalMetadata.set("environment", this._environment);
        }
      } else {
        await this._schemaMigration.deleteVersion(proxy.version);
      }
    });

    if (this.verbose) {
      const action = direction === "up" ? "migrated" : "reverted";
      Migration.logger.info(`== ${proxy.version} ${proxy.name}: ${action} ==`);
    }
  }

  /**
   * Wrap the migration in a DDL transaction if the adapter supports
   * it and the migration hasn't opted out. Mirrors Rails'
   * `Migrator#ddl_transaction`:
   *
   *     def ddl_transaction(migration)
   *       if use_transaction?(migration)
   *         connection.transaction { yield }
   *       else
   *         yield
   *       end
   *     end
   */
  private async _ddlTransaction(migration: MigrationLike, fn: () => Promise<void>): Promise<void> {
    if (this._useTransaction(migration)) {
      // Skip wrapping if the adapter is already in a transaction
      // (e.g. a caller wrapped the entire migrate in a transaction).
      // Starting a nested BEGIN would error on adapters that issue
      // raw BEGIN (vs savepoints).
      if (this._adapter.inTransaction) {
        await fn();
      } else {
        await this._adapter.beginTransaction();
        try {
          await fn();
          await this._adapter.commit();
        } catch (e) {
          try {
            await this._adapter.rollback();
          } catch {
            // Swallow rollback errors so the original migration
            // error isn't masked.
          }
          throw e;
        }
      }
    } else {
      await fn();
    }
  }

  /**
   * Mirrors Rails' `Migrator#use_transaction?`:
   * `!migration.disable_ddl_transaction && connection.supports_ddl_transactions?`
   */
  private _useTransaction(migration: MigrationLike): boolean {
    if (migration.disableDdlTransaction) return false;
    // Check adapter support via the DatabaseAdapter interface.
    // SQLite returns true, PG returns true, MySQL returns false.
    // Absent (undefined) defaults to false.
    return this._adapter.supportsDdlTransactions?.() ?? false;
  }

  /**
   * Check that the current environment matches the stored environment.
   * Raises EnvironmentMismatchError if they differ.
   *
   * Mirrors: ActiveRecord::Tasks::DatabaseTasks.check_current_environment
   */
  async checkEnvironment(): Promise<void> {
    // Match Rails' `return if ENV["DISABLE_DATABASE_ENVIRONMENT_CHECK"]`.
    // In Ruby, "" is truthy, so any *present* value (including empty
    // string) bypasses the check. JS treats "" as falsy, so we use a
    // presence check instead to preserve Rails semantics.
    // TRAILS_DISABLE_DATABASE_ENVIRONMENT_CHECK is the canonical name; DISABLE_DATABASE_ENVIRONMENT_CHECK
    // is the legacy fallback (one-release window — remove when BC-4 lint rule ships).
    // The !== undefined check (not a truthiness check) is intentional: an empty string is "present"
    // in Ruby (truthy), so any set value — including "" — must bypass the check. Do not simplify
    // this to a falsy/truthiness test; that would silently break Rails parity.
    if (
      (getEnv("TRAILS_DISABLE_DATABASE_ENVIRONMENT_CHECK") ??
        getEnv("DISABLE_DATABASE_ENVIRONMENT_CHECK")) !== undefined
    )
      return;
    await this._ensureSchemaTable();
    const stored = await this._internalMetadata.get("environment");
    if (stored === null) {
      throw new NoEnvironmentInSchemaError(
        "Environment data not found in the schema. Run migrations to initialize it.",
      );
    }
    if (stored !== this._environment) {
      // Use the Rails-style (current, stored) constructor so the error
      // message stays consistent with DatabaseTasks'
      // checkProtectedEnvironmentsBang path.
      throw new EnvironmentMismatchError(this._environment, stored);
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
    // Matches Rails: protected_environment? returns nil when nothing has
    // been stamped yet, so a fresh DB under NODE_ENV=production doesn't
    // trip the guard until it's actually been migrated and stamped.
    // Read-only — no _ensureSchemaTable side effect.
    const stored = await this.lastStoredEnvironment();
    if (!stored) return;

    let envList = protectedEnvironments;
    if (!envList) {
      const { Base } = await import("./base.js");
      envList = Base.protectedEnvironments ?? ["production"];
    }

    if (envList.includes(stored)) {
      throw new ProtectedEnvironmentError(stored);
    }
  }

  /**
   * Boolean mirror of {@link checkProtectedEnvironments}.
   *
   * Mirrors: ActiveRecord::MigrationContext#protected_environment?
   */
  async protectedEnvironment(): Promise<boolean> {
    const stored = await this.lastStoredEnvironment();
    if (!stored) return false;
    const { Base } = await import("./base.js");
    const list = Base.protectedEnvironments ?? ["production"];
    return list.includes(stored);
  }

  get internalMetadata(): InternalMetadata {
    return this._internalMetadata;
  }

  // --- MigrationContext-style methods (Rails: MigrationContext) ---

  get migrationsPaths(): string[] {
    return [...Migrator.migrationsPaths];
  }

  get schemaMigration(): SchemaMigration {
    return this._schemaMigration;
  }

  open(): Migrator {
    return this;
  }

  async needsMigration(): Promise<boolean> {
    const pending = await this.pendingMigrations();
    return pending.length > 0;
  }

  async pendingMigrationVersions(): Promise<string[]> {
    const pending = await this.pendingMigrations();
    return pending.map((m) => m.version);
  }

  get currentEnvironment(): string {
    return this._environment;
  }

  async isProtectedEnvironment(): Promise<boolean> {
    try {
      await this.checkProtectedEnvironments();
      return false;
    } catch (error) {
      if (error instanceof ProtectedEnvironmentError) {
        return true;
      }
      throw error;
    }
  }

  async lastStoredEnvironment(): Promise<string | null> {
    // When metadata storage is explicitly opted out (`use_metadata_table:
    // false`), treat the DB as unstamped even if a stale
    // ar_internal_metadata table exists from a previous run — Rails'
    // MigrationContext#last_stored_environment short-circuits on
    // `internal_metadata.enabled?` before the table_exists? read.
    if (!this._internalMetadata.enabled) return null;
    // Read-only: if ar_internal_metadata doesn't exist yet, the database
    // has never been stamped with an environment — return null without
    // creating the table.
    if (!(await this._internalMetadata.tableExists())) return null;
    return this._internalMetadata.get("environment");
  }

  async currentMigration(): Promise<MigrationProxy | null> {
    const version = await this.currentVersion();
    if (version === 0) return null;
    const versionStr = String(version);
    return this._migrations.find((m) => m.version === versionStr) ?? null;
  }

  async runnable(): Promise<MigrationProxy[]> {
    return this.pendingMigrations();
  }

  async migrated(): Promise<Set<string>> {
    return this._appliedVersions();
  }

  async loadMigrated(): Promise<Set<string>> {
    return this._appliedVersions();
  }

  static migrationsPaths: string[] = [];

  // Rails: MigrationContext#migration_files
  /** @internal */
  migrationFiles(paths: string[] = Migrator.migrationsPaths): string[] {
    const { readdirSync, existsSync } = getFs();
    const { join } = getPath();
    const files: string[] = [];
    const collect = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true }) as FsDirent[]) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          collect(full);
        } else if (/^\d+_.*\.(ts|js)$/.test(entry.name)) {
          files.push(full);
        }
      }
    };
    for (const p of paths) collect(p);
    return files.sort();
  }

  // Rails: MigrationContext#parse_migration_filename
  /** @internal */
  parseMigrationFilename(filename: string): [string, string, string] | null {
    const base = filename.replace(/.*[/\\]/, "").replace(/\.(ts|js)$/, "");
    const m = base.match(/^(\d+)_([a-z0-9_]*)(?:\.([a-z0-9_]*))?$/);
    if (!m) return null;
    return [m[1]!, m[2]!, m[3] ?? ""];
  }

  // Rails: MigrationContext#validate_timestamp?
  /** @internal */
  isValidateTimestamp(): boolean {
    // Rails: ActiveRecord.timestamped_migrations (default true) && ActiveRecord.validate_migration_timestamps (default false)
    // true && false = false, so false is the correct default until these config flags are wired.
    return false;
  }

  // Rails: MigrationContext#valid_migration_timestamp?
  /** @internal */
  isValidMigrationTimestamp(version: string | number): boolean {
    const tomorrow = Temporal.Now.plainDateTimeISO("UTC").add({ days: 1 });
    const limit = Number(
      `${tomorrow.year}${String(tomorrow.month).padStart(2, "0")}${String(tomorrow.day).padStart(2, "0")}${String(tomorrow.hour).padStart(2, "0")}${String(tomorrow.minute).padStart(2, "0")}${String(tomorrow.second).padStart(2, "0")}`,
    );
    return Number(version) < limit;
  }

  // Rails: MigrationContext#move
  /** @internal */
  async move(direction: "up" | "down", steps: number): Promise<void> {
    const current = await this.currentVersion();
    // Mirror Migrator#migrations: ascending for :up, descending for :down.
    // MigrationContext#move uses migrator.migrations[start_index + steps], so the
    // direction of the list determines which version "steps" positions forward lands on.
    const asc = (a: MigrationProxy, b: MigrationProxy) =>
      BigInt(a.version) < BigInt(b.version) ? -1 : 1;
    const ordered =
      direction === "up"
        ? [...this._migrations].sort(asc)
        : [...this._migrations].sort(asc).reverse();
    const startIndex = current === 0 ? 0 : ordered.findIndex((m) => m.version === String(current));
    if (current !== 0 && startIndex === -1) {
      throw new UnknownMigrationVersionError(String(current));
    }
    const finish = ordered[startIndex + steps];
    const targetVersion = finish ? Number(finish.version) : 0;
    if (direction === "up") {
      await this.up(targetVersion);
    } else {
      await this.down(targetVersion);
    }
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

  /** @internal */
  buildWatcher(_paths?: string[]): null {
    // In Rails this creates a filesystem watcher for migration files.
    // In TS migrations are registered programmatically, not watched.
    return null;
  }
}
