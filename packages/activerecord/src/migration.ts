import { getFs, getPath, Logger, getEnv, camelize, underscore } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import type { FsDirent } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import type { DatabaseAdapter } from "./adapter.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
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
  type JoinTableOptions,
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

// Mirrors Rails AbstractAdapter#extract_new_comment_value (alias of extract_new_default_value).
// For {from,to} hashes, returns `to` (which may be null to clear a comment).
// `to: undefined` is rejected — a missing value cannot be forwarded to SQL.
function _extractNewCommentValue(
  v: string | null | { from?: unknown; to?: unknown },
): string | null {
  if (v !== null && typeof v === "object") {
    if (!("to" in v) || (v as { to: unknown }).to === undefined) {
      throw new ArgumentError("change_column_comment / change_table_comment requires a :to value");
    }
    const to = (v as { to: unknown }).to;
    if (to !== null && typeof to !== "string") {
      throw new ArgumentError(
        `change_column_comment / change_table_comment :to must be a string or null, got ${typeof to}`,
      );
    }
    return to;
  }
  return v as string | null;
}

// Registry for AR config injected by Base — breaks the migration ↔ base import cycle.
/** @internal */
export interface MigrationArConfig {
  tableNamePrefix: string;
  tableNameSuffix: string;
}
let _arConfig: MigrationArConfig | null = null;
/** @internal */
export function registerMigrationArConfig(config: MigrationArConfig): void {
  _arConfig = config;
}

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
  constructor(version?: string | number, name?: string) {
    const t = Temporal.Now.plainDateTimeISO("UTC").add({ days: 1 });
    const p = (n: number) => String(n).padStart(2, "0");
    const limit = `${t.year}${p(t.month)}${p(t.day)}${p(t.hour)}${p(t.minute)}${p(t.second)}`;
    const prefix =
      version != null && name != null
        ? `Invalid timestamp ${version} for migration file: ${name}.`
        : "Invalid timestamp for migration.";
    super(`${prefix}\nTimestamp must be in form YYYYMMDDHHMMSS, and less than ${limit}.`);
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
  /** @internal Per-migration connection override — mirrors Rails' @connection ivar. */
  protected _connectionOverride?: DatabaseAdapter;
  /** @internal Per-migration pool override — mirrors Rails' @pool ivar. */
  protected _poolOverride?: ConnectionPool;
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
  private _schemaConn?: DatabaseAdapter;

  get schema(): SchemaStatements {
    const conn = this.connection;
    if (!this._schema || this._schemaConn !== conn) {
      assertSchemaAdapter(conn);
      this._schema = conn.schemaStatements ? conn.schemaStatements() : new SchemaStatements(conn);
      this._schemaConn = conn;
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
      case "changeColumnComment": {
        const [ccTable, ccCol, ccOpts] = args as [string, string, { from?: unknown; to?: unknown }];
        if (
          !ccOpts ||
          typeof ccOpts !== "object" ||
          !("from" in ccOpts) ||
          ccOpts.from === undefined ||
          !("to" in ccOpts) ||
          ccOpts.to === undefined
        ) {
          throw new IrreversibleMigration(
            "change_column_comment is only reversible if given a :from and :to option.",
          );
        }
        await this.changeColumnComment(ccTable, ccCol, { from: ccOpts.to, to: ccOpts.from });
        break;
      }
      case "changeTableComment": {
        const [ctTable, ctOpts] = args as [string, { from?: unknown; to?: unknown }];
        if (
          !ctOpts ||
          typeof ctOpts !== "object" ||
          !("from" in ctOpts) ||
          ctOpts.from === undefined ||
          !("to" in ctOpts) ||
          ctOpts.to === undefined
        ) {
          throw new IrreversibleMigration(
            "change_table_comment is only reversible if given a :from and :to option.",
          );
        }
        await this.changeTableComment(ctTable, { from: ctOpts.to, to: ctOpts.from });
        break;
      }
      case "enableExtension": {
        const [extName, extOpts] = args as [string, Record<string, unknown>?];
        await this.disableExtension(extName, extOpts);
        break;
      }
      case "disableExtension": {
        const [dextName, dextOpts] = args as [string, Record<string, unknown>?];
        await this.enableExtension(dextName, dextOpts);
        break;
      }
      case "createEnum": {
        const [enumName, enumValues, enumOpts] = args as [
          string,
          string[],
          Record<string, unknown>?,
        ];
        await this.dropEnum(enumName, enumValues, enumOpts);
        break;
      }
      case "dropEnum": {
        const [deEnumName, deValues, deOpts] = args as [
          string,
          string[] | undefined,
          Record<string, unknown>?,
        ];
        if (!deValues) {
          throw new IrreversibleMigration("Cannot reverse dropEnum without a list of enum values");
        }
        await this.createEnum(deEnumName, deValues, deOpts);
        break;
      }
      case "renameEnumValue": {
        const [revName, revOpts] = args as [string, { from: string; to: string }];
        await this.renameEnumValue(revName, { from: revOpts.to, to: revOpts.from });
        break;
      }
      case "addUniqueConstraint": {
        const [ucTable, ucColumn, ucOpts] = args as [
          string,
          string | string[] | undefined,
          Record<string, unknown>?,
        ];
        if (ucOpts?.["usingIndex"]) {
          throw new IrreversibleMigration(
            "add_unique_constraint is not reversible if given a using_index.",
          );
        }
        await this.removeUniqueConstraint(ucTable, ucColumn, ucOpts);
        break;
      }
      case "removeUniqueConstraint": {
        const [rucTable, rucColumn, rucOpts] = args as [
          string,
          string | string[] | undefined,
          Record<string, unknown>?,
        ];
        if (!rucColumn) {
          throw new IrreversibleMigration(
            "remove_unique_constraint is only reversible if given a column_name.",
          );
        }
        await this.addUniqueConstraint(rucTable, rucColumn, rucOpts);
        break;
      }
      default: {
        // Delegate unknown commands to CommandRecorder's invert dispatch so
        // Rails-shape ops like removeColumns/addColumns/changeTable round-
        // trip. Mirrors Rails: revert { } -> recorder.replay(self) where
        // replayed cmds are the inverted ones.
        const { cmd: iCmd, args: iArgs } = this._recorder.inverseOf(cmd, args);
        const method = (this as unknown as Record<string, (...a: unknown[]) => Promise<void>>)[
          iCmd
        ];
        if (typeof method !== "function") {
          throw new IrreversibleMigration(`Cannot reverse operation: ${cmd}`);
        }
        await method.apply(this, iArgs);
        break;
      }
    }
  }

  // -- Schema operations (delegated to SchemaStatements) --
  // Migration records operations for reversibility, then delegates
  // actual SQL execution to this.schema (a SchemaStatements instance).
  // In Rails, these methods live on the connection adapter via
  // ActiveRecord::ConnectionAdapters::SchemaStatements.

  /** @internal Mirrors Rails Migration#method_missing's proper_table_name dispatch. */
  protected _pt(name: string): string {
    return Migration.properTableName(name, Migration.tableNameOptions());
  }

  async createTable(
    name: string,
    optionsOrFn?:
      | {
          id?: boolean | "uuid";
          primaryKey?: string | string[] | false;
          force?: boolean | "cascade";
          ifNotExists?: boolean;
          default?: unknown;
          options?: string;
          comment?: string;
          charset?: string;
          collation?: string;
          as?: string;
        }
      | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void,
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("createTable", [name, optionsOrFn, fn]);
      return;
    }
    const tname = this._pt(name);
    await this.schema.createTable(tname, optionsOrFn, fn);
  }

  async dropTable(
    name: string,
    options?: { ifExists?: boolean; force?: "cascade"; temporary?: boolean },
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("dropTable", [name]);
      return;
    }
    const tname = this._pt(name);
    if (options) {
      await this.schema.dropTable(tname, options);
    } else {
      await this.schema.dropTable(tname);
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
    tableName = this._pt(tableName);
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
    tableName = this._pt(tableName);
    await this.schema.removeColumn(tableName, columnName, type, opts);
  }

  async renameColumn(tableName: string, oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recorder.record("renameColumn", [tableName, oldName, newName]);
      return;
    }
    tableName = this._pt(tableName);
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
    tableName = this._pt(tableName);
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
    tableName = this._pt(tableName);
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
    tableName = this._pt(tableName);
    await this.schema.changeColumn(tableName, columnName, type, options);
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recorder.record("renameTable", [oldName, newName]);
      return;
    }
    oldName = this._pt(oldName);
    newName = this._pt(newName);
    await this.schema.renameTable(oldName, newName);
  }

  async tableExists(tableName: string): Promise<boolean> {
    return this.schema.tableExists(this._pt(tableName));
  }

  async columnExists(tableName: string, columnName: string): Promise<boolean> {
    return this.schema.columnExists(this._pt(tableName), columnName);
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
    tableName = this._pt(tableName);
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
    tableName = this._pt(tableName);
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
    tableName = this._pt(tableName);
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
    tableName = this._pt(tableName);
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
    fromTable = this._pt(fromTable);
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
    fromTable = this._pt(fromTable);
    if (typeof toTableOrOptions === "string") toTableOrOptions = this._pt(toTableOrOptions);
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
    tableName = this._pt(tableName);
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
    tableName = this._pt(tableName);
    await this.schema.removeCheckConstraint(tableName, expressionOrOptions);
  }
  async validateCheckConstraint(
    tableName: string,
    nameOrOptions: string | { name: string },
  ): Promise<void> {
    await (this.connection as any).validateCheckConstraint(this._pt(tableName), nameOrOptions);
  }

  async validateForeignKey(
    fromTable: string,
    toTableOrOptions?: string | { name?: string },
    options?: { name?: string },
  ): Promise<void> {
    const toTable = typeof toTableOrOptions === "string" ? toTableOrOptions : undefined;
    const opts = typeof toTableOrOptions === "object" ? toTableOrOptions : (options ?? undefined);
    await (this.connection as any).validateForeignKey(this._pt(fromTable), toTable, opts);
  }

  async changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: string | null | { from?: unknown; to?: unknown },
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("changeColumnComment", [tableName, columnName, commentOrChanges]);
      return;
    }
    tableName = this._pt(tableName);
    const resolved = _extractNewCommentValue(commentOrChanges);
    await (this.connection as any).changeColumnComment(tableName, columnName, resolved);
  }

  async changeTableComment(
    tableName: string,
    commentOrChanges: string | null | { from?: unknown; to?: unknown },
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("changeTableComment", [tableName, commentOrChanges]);
      return;
    }
    tableName = this._pt(tableName);
    const resolved = _extractNewCommentValue(commentOrChanges);
    await (this.connection as any).changeTableComment(tableName, resolved);
  }

  async enableExtension(name: string, options?: Record<string, unknown>): Promise<void> {
    if (this._recording) {
      this._recorder.record("enableExtension", [name, options]);
      return;
    }
    await (this.connection as any).enableExtension(name, options);
  }

  async disableExtension(name: string, options?: Record<string, unknown>): Promise<void> {
    if (this._recording) {
      this._recorder.record("disableExtension", [name, options]);
      return;
    }
    await (this.connection as any).disableExtension(name, options);
  }

  async createEnum(
    name: string,
    values: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("createEnum", [name, values, options]);
      return;
    }
    await (this.connection as any).createEnum(name, values, options);
  }

  async dropEnum(
    name: string,
    valuesOrOptions?: string[] | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<void> {
    // Normalize: if second arg is a plain object it is the options hash (no values).
    // Mirrors Rails drop_enum(name, values = nil, **options) which allows options-only calls.
    const isOptsObj =
      valuesOrOptions !== null &&
      typeof valuesOrOptions === "object" &&
      !Array.isArray(valuesOrOptions);
    const values = isOptsObj ? undefined : (valuesOrOptions as string[] | undefined);
    const opts = isOptsObj ? (valuesOrOptions as Record<string, unknown>) : (options ?? undefined);
    if (this._recording) {
      this._recorder.record("dropEnum", [name, values, opts]);
      return;
    }
    // values is only captured for recording (so dropEnum can be inverted to createEnum);
    // the adapter's dropEnum(name, options?) doesn't need values for SQL execution.
    await (this.connection as any).dropEnum(name, opts ?? {});
  }

  async renameEnumValue(name: string, options: { from: string; to: string }): Promise<void> {
    if (this._recording) {
      this._recorder.record("renameEnumValue", [name, options]);
      return;
    }
    await (this.connection as any).renameEnumValue(name, options);
  }

  async addUniqueConstraint(
    tableName: string,
    columnName?: string | string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("addUniqueConstraint", [tableName, columnName, options]);
      return;
    }
    tableName = this._pt(tableName);
    await (this.connection as any).addUniqueConstraint(tableName, columnName, options);
  }

  async removeUniqueConstraint(
    tableName: string,
    columnNameOrOptions?: string | string[] | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<void> {
    // Normalize: if second arg is a plain object it is the options hash (no column).
    // Mirrors Rails extract_options! semantics for remove_unique_constraint(table, **opts).
    const isOptsObj =
      columnNameOrOptions !== null &&
      typeof columnNameOrOptions === "object" &&
      !Array.isArray(columnNameOrOptions);
    const columnName = isOptsObj
      ? undefined
      : (columnNameOrOptions as string | string[] | undefined);
    const opts = isOptsObj
      ? (columnNameOrOptions as Record<string, unknown>)
      : (options ?? undefined);
    if (this._recording) {
      this._recorder.record("removeUniqueConstraint", [tableName, columnName, opts]);
      return;
    }
    tableName = this._pt(tableName);
    await (this.connection as any).removeUniqueConstraint(tableName, columnName, opts);
  }

  async addTimestamps(tableName: string, options: ColumnOptions = {}): Promise<void> {
    if (this._recording) {
      this._recorder.record("addTimestamps", [tableName, options]);
      return;
    }
    tableName = this._pt(tableName);
    await this.schema.addTimestamps(tableName, options);
  }

  async removeTimestamps(tableName: string): Promise<void> {
    if (this._recording) {
      this._recorder.record("removeTimestamps", [tableName]);
      return;
    }
    tableName = this._pt(tableName);
    await this.schema.removeTimestamps(tableName);
  }

  async createJoinTable(
    table1: string,
    table2: string,
    options?: JoinTableOptions | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void,
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("createJoinTable", [table1, table2, options, fn]);
      return;
    }
    table1 = this._pt(table1);
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
    table1 = this._pt(table1);
    await this.schema.dropJoinTable(table1, table2, options);
  }

  async changeTable(
    tableName: string,
    fnOrOptions?: ((t: Table) => void | Promise<void>) | { bulk?: boolean },
    fn?: (t: Table) => void | Promise<void>,
  ): Promise<void> {
    const options = typeof fnOrOptions === "function" ? {} : (fnOrOptions ?? {});
    const callback = typeof fnOrOptions === "function" ? fnOrOptions : fn;
    if (this._recording) {
      // Rails: change_table delegates to the CommandRecorder so individual
      // ops inside the block can be inverted (or batched, in the bulk path).
      await this._recorder.changeTable(
        tableName,
        options as Record<string, unknown>,
        callback as Parameters<CommandRecorder["changeTable"]>[2],
      );
      return;
    }
    if (options.bulk) {
      // Bulk path mirrors Rails: delegate to SchemaStatements#changeTable which
      // records ops via a Proxy and coalesces into a single ALTER. Apply
      // tableNamePrefix here since SchemaStatements doesn't.
      const tname = this._pt(tableName);
      await this.schema.changeTable(tname, options, callback);
      return;
    }
    // Build Table against Migration (not SchemaStatements) so that
    // per-operation recording in addColumn/removeColumn/etc. still applies
    const table = new Table(tableName, this);
    if (callback) await callback(table);
  }

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recorder.record("renameIndex", [tableName, oldName, newName]);
      return;
    }
    tableName = this._pt(tableName);
    await this.schema.renameIndex(tableName, oldName, newName);
  }

  indexName(tableName: string, options: { column?: string | string[] }): string {
    return this.schema.indexName(this._pt(tableName), options);
  }

  async removeColumns(tableName: string, ...columns: string[]): Promise<void>;
  async removeColumns(
    tableName: string,
    ...args: [...string[], { type?: ColumnType; ifExists?: boolean }]
  ): Promise<void>;
  async removeColumns(
    tableName: string,
    ...columnsOrOptions: Array<string | ({ type?: ColumnType } & Record<string, unknown>)>
  ): Promise<void> {
    if (this._recording) {
      // Record as a single removeColumns op so invertRemoveColumns can flip
      // it back to addColumns (Rails: CommandRecorder#invert_remove_columns).
      this._recorder.record("removeColumns", [tableName, ...columnsOrOptions]);
      return;
    }
    const last = columnsOrOptions[columnsOrOptions.length - 1];
    const hasOpts = typeof last === "object" && last !== null;
    const opts = (hasOpts ? (columnsOrOptions.pop() as Record<string, unknown>) : {}) as {
      type?: ColumnType;
      ifExists?: boolean;
    };
    const columns = columnsOrOptions as string[];
    for (const col of columns) {
      await this.removeColumn(tableName, col, opts.type, { ifExists: opts.ifExists });
    }
  }

  async addColumns(
    tableName: string,
    ...args: [...string[], { type: ColumnType } & ColumnOptions]
  ): Promise<void>;
  async addColumns(
    tableName: string,
    ...columnsAndOptions: Array<string | ({ type: ColumnType } & ColumnOptions)>
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("addColumns", [tableName, ...columnsAndOptions]);
      return;
    }
    const last = columnsAndOptions[columnsAndOptions.length - 1];
    if (typeof last !== "object" || last === null || !("type" in last)) {
      throw new TypeError("addColumns requires a trailing options hash with a :type entry");
    }
    const { type, ...rest } = columnsAndOptions.pop() as { type: ColumnType } & ColumnOptions;
    const columns = columnsAndOptions as string[];
    for (const col of columns) {
      await this.addColumn(tableName, col, type, rest);
    }
  }

  async columns(tableName: string): Promise<import("./connection-adapters/column.js").Column[]> {
    return this.schema.columns(this._pt(tableName));
  }

  async indexes(
    tableName: string,
  ): Promise<Array<{ name: string; columns: string[]; unique: boolean }>> {
    return this.schema.indexes(this._pt(tableName));
  }

  async primaryKey(tableName: string): Promise<string | null> {
    return this.schema.primaryKey(this._pt(tableName));
  }

  async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    return this.schema.foreignKeys(this._pt(tableName));
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
    return this.schema.indexExists(this._pt(tableName), columnName, options);
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
    return this._connectionOverride ?? this.adapter;
  }

  set connection(conn: DatabaseAdapter | undefined) {
    this._connectionOverride = conn;
  }

  get connectionPool(): ConnectionPool {
    // Mirrors Rails: @pool || DatabaseTasks.migration_connection_pool.
    // _poolOverride is a real ConnectionPool when set by the migration runner.
    // The adapter fallback is intentionally unsafe: DatabaseTasks.migrationConnectionPool
    // is async (needs dynamic import to break the circular migration→base dependency),
    // so we can't call it here synchronously. The cast is load-bearing until pool
    // lookup is restructured — callers on the test/direct-construction path must not
    // invoke pool-only methods (leaseConnection, withConnection, etc.).
    return (this._poolOverride ?? this.adapter) as unknown as ConnectionPool;
  }

  // --- Execution (Rails: Migration#exec_migration, #execution_strategy, etc.) ---

  async execMigration(conn: DatabaseAdapter, direction: "up" | "down"): Promise<void> {
    this._connectionOverride = conn;
    try {
      if (direction === "up") {
        await this.up();
      } else {
        await this.down();
      }
    } finally {
      this._connectionOverride = undefined;
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

  static nextMigrationNumber(number?: number | bigint | string): string {
    // Rails: max(now.utc.strftime("%Y%m%d%H%M%S"), "%.14d" % number) — so a
    // numerically-larger sequence wins over a same-second timestamp. Callers
    // (e.g. Migration.copy) pass `last.version + 1` to guarantee monotonicity
    // across iterations within the same second. Accepts bigint/string so
    // versions beyond Number.MAX_SAFE_INTEGER (e.g. future renumbering above
    // 9.0e15) survive without precision loss.
    const stamp = Temporal.Now.instant()
      .toString()
      .replace(/[-T:Z.]/g, "")
      .slice(0, 14);
    if (number == null) return stamp;
    const raw =
      typeof number === "bigint"
        ? number
        : BigInt(typeof number === "number" ? Math.max(0, Math.trunc(number)) : number);
    const n = raw < 0n ? 0n : raw;
    // Numeric (BigInt) comparison — string compare goes lexicographic once
    // either side exceeds 14 digits and would mis-order (e.g. a 15-digit
    // "100…" would sort below a 14-digit "2026…" string).
    return n > BigInt(stamp) ? n.toString().padStart(14, "0") : stamp;
  }

  static properTableName(
    name: string | { tableName?: unknown },
    options: { tableNamePrefix?: string; tableNameSuffix?: string } = {},
  ): string {
    // Mirrors Rails `name.respond_to?(:table_name)`: any non-null reference
    // exposing a string `tableName` is honored. Model classes (functions)
    // expose it as a static getter, so `typeof name === "function"` must
    // count too — guarding only on "object" silently produces a stringified
    // function name with prefix/suffix applied.
    if (
      name != null &&
      (typeof name === "object" || typeof name === "function") &&
      typeof (name as { tableName?: unknown }).tableName === "string"
    ) {
      return (name as { tableName: string }).tableName;
    }
    const prefix = options.tableNamePrefix ?? "";
    const suffix = options.tableNameSuffix ?? "";
    return `${prefix}${String(name)}${suffix}`;
  }

  static tableNameOptions(): { tableNamePrefix: string; tableNameSuffix: string } {
    return {
      tableNamePrefix: _arConfig?.tableNamePrefix ?? "",
      tableNameSuffix: _arConfig?.tableNameSuffix ?? "",
    };
  }

  static async copy(
    destination: string,
    sources: Record<string, string>,
    options: {
      onSkip?: (scope: string, migration: MigrationProxy) => void;
      onCopy?: (scope: string, migration: MigrationProxy, oldPath: string) => void;
    } = {},
  ): Promise<MigrationProxy[]> {
    // Mirrors Rails' Migration.copy: discover migrations in each scoped source
    // directory, dedupe by Rails-name against the destination, renumber so
    // the copied migration's version is greater than the latest existing one,
    // emit `${version}_${name.underscore}.${scope}.ts`, and invoke optional
    // on_skip / on_copy callbacks. See Rails migration.rb:1060-1108.
    const fs = getFs();
    const path = getPath();

    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    // Discovery is filename-driven; the adapter is only used by the proxy's
    // lazy `migration` factory (which we never invoke here), so a stub is safe.
    const stubAdapter = {} as DatabaseAdapter;
    const destinationMigrations = Migrator.fromPath(destination, stubAdapter);
    let last: MigrationProxy | undefined = destinationMigrations[destinationMigrations.length - 1];

    const copied: MigrationProxy[] = [];
    for (const [scope, sourcePath] of Object.entries(sources)) {
      // Must round-trip through `Migrator.parseMigrationFilename` (regex
      // `[a-z0-9_]*`) or the copied file would be invisible to subsequent
      // discovery via `Migrator.fromPath`.
      if (!/^[a-z0-9_]+$/.test(scope)) {
        throw new ArgumentError(
          `Invalid migration scope '${scope}': must match /^[a-z0-9_]+$/ to be discoverable by Migrator.fromPath.`,
        );
      }
      if (!fs.existsSync(sourcePath)) continue;
      const sourceMigrations = Migrator.fromPath(sourcePath, stubAdapter);

      for (const source of sourceMigrations) {
        if (!source.filename) continue;
        const body = fs.readFileSync(source.filename, "utf8");
        const inserted = `// This migration comes from ${scope} (originally ${source.version})\n`;

        const duplicate = destinationMigrations.find((m) => m.name === source.name);
        if (duplicate) {
          if (options.onSkip && duplicate.scope !== scope) {
            options.onSkip(scope, source);
          }
          continue;
        }

        const nextNumber = last ? BigInt(last.version) + 1n : 0n;
        const newVersion = Migration.nextMigrationNumber(nextNumber);
        const fileBase = underscore(source.name);
        // Preserve the source file extension — a `.js` source must stay
        // loadable under a JS-only runtime; switching to `.ts` would break
        // both `Migrator.fromPath` discovery (regex matches .ts|.js) and
        // the proxy's dynamic `import()`.
        const ext = path.extname(source.filename) || ".ts";
        const newPath = path.join(destination, `${newVersion}_${fileBase}.${scope}${ext}`);
        const oldPath = source.filename;
        // Build a fresh migration factory that imports the NEW path — spreading
        // `source` would carry over a closure pinned to the old engine file.
        const proxyName = source.name;
        const copy: MigrationProxy = {
          name: source.name,
          version: newVersion,
          scope,
          filename: newPath,
          migration: async () => {
            const { pathToFileURL } = await import("node:url");
            const mod = (await import(pathToFileURL(newPath).href)) as Record<string, unknown>;
            return (mod.default ?? mod[proxyName]) as MigrationLike;
          },
        };
        last = copy;

        fs.writeFileSync(newPath, `${inserted}${body}`);
        copied.push(copy);
        options.onCopy?.(scope, copy, oldPath);
        destinationMigrations.push(copy);
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
        array?: boolean;
      }
    >
  >();
  private _indexes = new Map<
    string,
    {
      columns: string[];
      unique: boolean;
      name?: string;
      where?: string;
      orders?: Record<string, string>;
      using?: string;
      nullsNotDistinct?: boolean;
      include?: string[];
    }[]
  >();
  private _tableNamePrefix: string | null = null;
  private _tableNameSuffix: string | null = null;

  /**
   * Effective table-name prefix. Defaults to `Migration.tableNameOptions().tableNamePrefix`
   * (i.e. the configured `ActiveRecord::Base.table_name_prefix` value) when no explicit
   * value has been assigned to this context. Mirrors Rails, where `MigrationContext`
   * does not carry its own prefix and reads from the active record config at use time.
   */
  get tableNamePrefix(): string {
    return this._tableNamePrefix ?? Migration.tableNameOptions().tableNamePrefix;
  }
  set tableNamePrefix(value: string) {
    this._tableNamePrefix = value;
  }

  /**
   * Effective table-name suffix. Symmetric with {@link tableNamePrefix}.
   */
  get tableNameSuffix(): string {
    return this._tableNameSuffix ?? Migration.tableNameOptions().tableNameSuffix;
  }
  set tableNameSuffix(value: string) {
    this._tableNameSuffix = value;
  }

  constructor(private adapter: DatabaseAdapter) {}

  private get _adapterName(): "sqlite" | "postgres" | "mysql" {
    return this.adapter.adapterName;
  }

  /** @internal Query catalog for column names+types — used after CTAS where columns derive from the SELECT. */
  private async _introspectColumns(name: string): Promise<
    {
      name: string;
      type: string;
      limit?: number;
      precision?: number;
      scale?: number;
      array?: boolean;
    }[]
  > {
    const a = this._adapterName;
    const qt = this.adapter.quoteTableName(name);
    let sql: string;
    if (a === "sqlite") {
      sql = `PRAGMA table_info(${qt})`;
    } else if (a === "postgres") {
      const [s, t] = name.includes(".") ? name.split(".", 2) : ["public", name];
      const e = (x: string) => x.replace(/'/g, "''");
      // Pull udt_name for user-defined types (citext, hstore, …) which
      // surface as "USER-DEFINED" via data_type, plus size fields for
      // limit/precision/scale propagation.
      sql = `SELECT column_name, data_type, udt_name, character_maximum_length, numeric_precision, numeric_scale, datetime_precision FROM information_schema.columns WHERE table_schema = '${e(s)}' AND table_name = '${e(t)}' ORDER BY ordinal_position`;
    } else {
      sql = `SHOW COLUMNS FROM ${qt}`;
    }
    const rows = await this.adapter.execute(sql);
    return rows.map((r) => {
      const x = r as Record<string, unknown>;
      const colName = (x.name ?? x.column_name ?? x.Field) as string;
      // SQLite: type; PG: data_type (with udt_name for USER-DEFINED); MySQL: Type
      let rawType = ((x.type ?? x.data_type ?? x.Type) as string | undefined) ?? "";
      let isArray = false;
      if (a === "postgres") {
        // PG reports array columns as data_type='ARRAY' + udt_name='_int4'
        // etc. — strip the leading underscore and surface as the base type
        // plus array:true (schema-dumper/array.test.ts pattern).
        if (rawType.toUpperCase() === "ARRAY" && typeof x.udt_name === "string") {
          rawType = (x.udt_name as string).replace(/^_/, "");
          isArray = true;
        } else if (rawType.toUpperCase() === "USER-DEFINED" && x.udt_name) {
          rawType = String(x.udt_name);
        }
      }
      // Mirror the configured MySQL emulateBooleans setting rather than
      // hard-coding Rails' default — abstract-mysql-adapter exposes it.
      const emulateBooleans =
        a === "mysql"
          ? ((this.adapter as { emulateBooleans?: boolean }).emulateBooleans ?? true)
          : true;
      const normalized = MigrationContext._normalizeIntrospectedType(rawType, a, {
        emulateBooleans,
      });
      // Prefer PG's authoritative size columns when present — they sit in
      // information_schema rather than baked into the type string.
      if (a === "postgres") {
        const charLen = x.character_maximum_length;
        const numPrec = x.numeric_precision;
        const numScale = x.numeric_scale;
        const dtPrec = x.datetime_precision;
        if (typeof charLen === "number") normalized.limit = charLen;
        // numeric_precision is meaningless for floats per PG type-map-init
        // (float4 carries a fixed limit, float8 carries nothing) — only fill
        // it for decimal.
        if (typeof numPrec === "number" && normalized.type === "decimal") {
          normalized.precision = numPrec;
          if (typeof numScale === "number") normalized.scale = numScale;
        }
        if (
          typeof dtPrec === "number" &&
          (normalized.type === "datetime" ||
            normalized.type === "time" ||
            normalized.type === "timestamptz")
        )
          normalized.precision = dtPrec;
      }
      return { name: colName, ...normalized, ...(isArray ? { array: true } : {}) };
    });
  }

  /**
   * @internal Map raw catalog types (PG/MySQL/SQLite) to Rails-canonical
   * names plus precision/scale/limit. Mirrors the per-adapter type-lookup
   * registrations (mysql-type-lookup, postgresql/oid). Callers may pass
   * `emulateBooleans` (default true) so MySQL `tinyint(1)` follows the
   * adapter's configured emulation mode; `_introspectColumns` threads in
   * the live `abstract-mysql-adapter#emulateBooleans` value.
   */
  static _normalizeIntrospectedType(
    raw: string,
    adapter: "sqlite" | "postgres" | "mysql" = "sqlite",
    opts: { emulateBooleans?: boolean } = {},
  ): {
    type: string;
    limit?: number;
    precision?: number;
    scale?: number;
  } {
    const emulateBooleans = opts.emulateBooleans ?? true;
    const t = raw.toLowerCase().trim();
    if (!t) return { type: "string" };
    // MySQL boolean emulation must run before modifier stripping.
    if (/^tinyint\s*\(\s*1\s*\)/.test(t))
      return emulateBooleans ? { type: "boolean" } : { type: "integer", limit: 1 };
    // enum/set carry a literal value list, not a length.
    if (/^enum\s*\(/.test(t) || /^set\s*\(/.test(t)) return { type: "string" };
    const parenMatch = t.match(/^([a-z_ ]+?)\s*\((\d+)(?:\s*,\s*(\d+))?\)/);
    const head = (parenMatch?.[1] ?? t.replace(/\s+unsigned\b.*$/, "")).trim();
    const arg1 = parenMatch ? Number(parenMatch[2]) : undefined;
    const arg2 = parenMatch && parenMatch[3] != null ? Number(parenMatch[3]) : undefined;
    const limit = arg1 !== undefined && arg2 === undefined ? { limit: arg1 } : {};
    // decimal(N) / decimal(N,M) — one-arg is precision (Rails decimal_columns).
    const decSizes =
      arg1 !== undefined
        ? arg2 !== undefined
          ? { precision: arg1, scale: arg2 }
          : { precision: arg1 }
        : {};
    // datetime(N) / time(N) — N is fractional-seconds precision.
    const precOnly = arg1 !== undefined && arg2 === undefined ? { precision: arg1 } : {};
    // Per-adapter integer byte limits, mirroring the canonical type maps:
    //  - postgresql/type-map-init.ts:134-136 (int2=2, int4=4, int8=8)
    //  - mysql-type-lookup tests (tinyint=1, smallint=2, mediumint=3, int=4)
    //  - sqlite3-adapter.ts:2188 (sqlite3Int defaults to limit 8)
    // SQLite collapses everything to its dynamic integer; don't pretend
    // otherwise. PG/MySQL share byte-sized variants below.
    const intByteLimit: Record<string, number | undefined> = {
      tinyint: 1,
      smallint: 2,
      int2: 2,
      mediumint: 3,
      int: 4,
      integer: 4,
      int4: 4,
      year: 4,
    };
    if (/^(varchar|character varying|character|char|nvarchar|nchar)$/.test(head))
      return { type: "string", ...limit };
    if (/^(text|tinytext|mediumtext|longtext|clob)$/.test(head)) return { type: "text" };
    if (/^citext$/.test(head)) return { type: "citext" };
    if (/^(int|integer|int4|int2|smallint|mediumint|tinyint|serial|smallserial|year)$/.test(head)) {
      if (adapter === "sqlite") return { type: "integer", limit: 8 };
      // MySQL `year` is registered as a plain IntegerType with no limit
      // (abstract-mysql-adapter.ts:1422). Other integer aliases keep their
      // adapter-registered byte limit.
      if (head === "year") return { type: "integer" };
      return { type: "integer", limit: intByteLimit[head] ?? 4 };
    }
    if (/^(bigint|int8|bigserial)$/.test(head))
      return adapter === "sqlite" ? { type: "integer", limit: 8 } : { type: "bigint" };
    // Float byte-limits: PG float4 has limit 24 and float8 has no limit
    // (postgresql/type-map-init.ts:138-139). SQLite registers all float-like
    // declarations as FloatType() with no limit (sqlite3-adapter.ts:2224).
    // MySQL retains the float/double precision split.
    if (/^float4$/.test(head)) return { type: "float", limit: 24 };
    if (/^float8$/.test(head)) return { type: "float" };
    if (/^float$/.test(head))
      return adapter === "mysql" ? { type: "float", limit: 24 } : { type: "float" };
    if (/^real$/.test(head))
      return adapter === "mysql" ? { type: "float", limit: 53 } : { type: "float", limit: 24 };
    if (/^(double|double precision)$/.test(head))
      return adapter === "mysql" ? { type: "float", limit: 53 } : { type: "float" };
    if (/^(numeric|decimal|number)$/.test(head)) return { type: "decimal", ...decSizes };
    if (/^(bool|boolean)$/.test(head)) return { type: "boolean" };
    // PG registers `bit`/`varbit` as standalone Bit/BitVarying types
    // (postgresql/type-map-init.ts); MySQL `bit` is a binary blob per
    // mysql-type-lookup. PG `bit varying` arrives via information_schema.
    if (/^bit$/.test(head))
      return adapter === "postgres" ? { type: "bit", ...limit } : { type: "binary", ...limit };
    // Store the raw SQL form 'bit varying' so SchemaDumper SQL_TYPE_MAP
    // (schema-dumper.ts:142-143) resolves it to the bitVarying DSL helper.
    if (/^(varbit|bit varying)$/.test(head)) return { type: "bit varying", ...limit };
    if (/^date$/.test(head)) return { type: "date" };
    if (/^(time|time without time zone)$/.test(head)) return { type: "time", ...precOnly };
    if (/^(timetz|time with time zone)$/.test(head)) return { type: "time", ...precOnly };
    // Distinguish PG timestamptz from naive datetime — schema-dumper.ts:117-118
    // maps `timestamp with time zone` to the `timestamptz` SQL_TYPE_MAP entry
    // (the emitter then falls back to `t.column(..., "timestamptz")` since
    // `timestamptz` isn't in DSL_HELPER_METHODS). Separate from the `datetime`
    // DSL used for naive timestamps.
    if (/^(timestamptz|timestamp with time zone)$/.test(head))
      return { type: "timestamptz", ...precOnly };
    if (/^(datetime|timestamp|timestamp without time zone)$/.test(head))
      return { type: "datetime", ...precOnly };
    if (/^uuid$/.test(head)) return { type: "uuid" };
    if (/^(json|jsonb)$/.test(head)) return { type: head };
    if (/^(bytea|blob|tinyblob|mediumblob|longblob|binary|varbinary)$/.test(head))
      return { type: "binary", ...limit };
    return { type: head };
  }

  async createTable(
    name: string,
    options?: {
      primaryKey?: string | string[] | false;
      force?: boolean | "cascade";
      ifNotExists?: boolean;
      id?: boolean | "uuid";
      default?: unknown;
      options?: string;
      comment?: string;
      charset?: string;
      collation?: string;
      as?: string;
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
      await this.dropTable(name, {
        force: options.force === "cascade" ? "cascade" : undefined,
      }).catch(() => {});
    }
    if (options?.ifNotExists && this.tableExists(name)) {
      return;
    }
    const td = new TableDefinition(name, {
      id: options?.as != null ? false : options?.id,
      primaryKey: options?.primaryKey,
      default: options?.default,
      options: options?.options,
      comment: options?.comment,
      charset: options?.charset,
      collation: options?.collation,
      as: options?.as,
      adapterName: this._adapterName,
      adapter: this.adapter,
    });
    if (fn) fn(td);
    await this.adapter.executeMutation(td.toSql());
    if (options?.comment != null && options.comment.length > 0) {
      const adapterWithComments = this.adapter as {
        supportsComments?: () => boolean;
        supportsCommentsInCreate?: () => boolean;
        changeTableComment?: (name: string, comment: string | null) => Promise<void>;
      };
      if (
        adapterWithComments.supportsComments?.() &&
        !adapterWithComments.supportsCommentsInCreate?.() &&
        typeof adapterWithComments.changeTableComment === "function"
      ) {
        await adapterWithComments.changeTableComment(name, options.comment);
      }
    }
    this._tables.add(name);
    const cols = new Set<string>();
    // CTAS ignores td.columns — actual columns come from the SELECT (introspected below).
    const tdCols = options?.as != null ? [] : td.columns;
    for (const col of tdCols) {
      cols.add(col.name);
    }

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
        array?: boolean;
      }
    >();
    const compositePk =
      Array.isArray(options?.primaryKey) && options.primaryKey.length > 0
        ? new Set(options.primaryKey)
        : null;
    if (
      options?.id !== false &&
      !compositePk &&
      options?.primaryKey !== false &&
      options?.as == null
    ) {
      const idType = typeof options?.id === "string" ? options.id : "integer";
      const idName = typeof options?.primaryKey === "string" ? options.primaryKey : "id";
      meta.set(idName, { type: idType, primaryKey: true });
    }
    for (const col of tdCols) {
      if (meta.has(col.name)) continue;
      meta.set(col.name, {
        type: col.type,
        primaryKey: col.options.primaryKey || compositePk?.has(col.name) || undefined,
        null: col.options.null,
        default: col.options.default,
        limit: col.options.limit,
        precision: col.options.precision,
        scale: col.options.scale,
        array: (col.options as { array?: boolean }).array,
      });
    }
    if (options?.as != null) {
      for (const col of await this._introspectColumns(name)) {
        const { name: c, ...rest } = col;
        cols.add(c);
        meta.set(c, rest);
      }
    }
    this._columns.set(name, cols);
    this._columnMeta.set(name, meta);

    // Create indexes from table definition — skip for adapters that emit them inline in CREATE TABLE
    const adapterWithIndexInCreate = this.adapter as { supportsIndexesInCreate?: () => boolean };
    if (adapterWithIndexInCreate.supportsIndexesInCreate?.()) {
      for (const idx of td.indexes) {
        const indexName = idx.name ?? `index_${name}_on_${idx.columns.join("_and_")}`;
        if (!this._indexes.has(name)) this._indexes.set(name, []);
        this._indexes.get(name)!.push({ ...idx, name: indexName, orders: {} });
      }
      return;
    }
    for (const idx of td.indexes) {
      const rawOrders =
        typeof idx.orders === "string"
          ? Object.fromEntries(idx.columns.map((c) => [c, idx.orders as string]))
          : idx.orders;
      const ordersMap = rawOrders && Object.keys(rawOrders).length > 0 ? rawOrders : undefined;
      await this.addIndex(name, idx.columns, {
        unique: idx.unique,
        name: idx.name,
        where: idx.where,
        order: ordersMap,
        using: idx.using,
        nullsNotDistinct: idx.nullsNotDistinct,
        include: idx.include,
        ifNotExists: idx.ifNotExists,
      });
    }
  }

  async dropTable(
    name: string,
    options?: { ifExists?: boolean; force?: "cascade"; temporary?: boolean },
  ): Promise<void> {
    // Mirrors Rails MySQL drop_table: emit `DROP TEMPORARY TABLE` when `temporary: true`.
    // `IF EXISTS` is included by default (matches the abstract drop_table contract); pass
    // `ifExists: false` to omit it. `force: "cascade"` adds `CASCADE` on Postgres.
    const temporary =
      options?.temporary === true && this._adapterName === "mysql" ? " TEMPORARY" : "";
    const ifExists = options?.ifExists === false ? "" : " IF EXISTS";
    const cascade =
      options?.force === "cascade" && this._adapterName === "postgres" ? " CASCADE" : "";
    const quoted = this.adapter.quoteTableName(name);
    await this.adapter.executeMutation(`DROP${temporary} TABLE${ifExists} ${quoted}${cascade}`);
    this._tables.delete(name);
    this._columns.delete(name);
    this._columnMeta.delete(name);
    this._indexes.delete(name);
  }

  async enableExtension(name: string, options?: Record<string, unknown>): Promise<void> {
    await (this.adapter as any).enableExtension?.(name, options);
  }

  async createEnum(
    name: string,
    values: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    await (this.adapter as any).createEnum?.(name, values, options);
  }

  async createSchema(name: string, options?: Record<string, unknown>): Promise<void> {
    await (this.adapter as any).createSchema?.(name, options);
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
        // MigrationContext is a lightweight SQL builder used in tests; _mapType always runs here
        // (unlike real adapter addColumn which calls typeToSql directly). The precision=6 default
        // for datetime matches Rails' behavior, but applies to timestamp too in this simplified path.
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
      array: (_options as { array?: boolean } | undefined)?.array,
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
      nullsNotDistinct?: boolean;
      ifNotExists?: boolean;
      include?: string[];
      using?: string;
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
        const isExpr = /\W/.test(c);
        let col = isExpr ? c : this.adapter.quoteIdentifier(c);
        if (an !== "mysql") {
          const ord = options?.order?.[c];
          if (ord) col += ` ${ord.toUpperCase()}`;
        }
        return col;
      })
      .join(", ");
    const usingStr =
      an === "postgres" && options?.using && options.using !== "btree"
        ? ` USING ${options.using}`
        : "";
    let sql = `CREATE ${uniqueStr}INDEX ${ifNotExistsStr}${this.adapter.quoteIdentifier(indexName)} ON ${this.adapter.quoteTableName(table)}${usingStr} (${colsStr})`;
    // Clause order mirrors Rails' visit_CreateIndexDefinition
    // (abstract/schema_creation.rb): INCLUDE → NULLS NOT DISTINCT → WHERE.
    if (an === "postgres" && options?.include && options.include.length > 0)
      sql += ` INCLUDE (${options.include.map((c) => this.adapter.quoteIdentifier(c)).join(", ")})`;
    if (an === "postgres" && options?.nullsNotDistinct) sql += " NULLS NOT DISTINCT";
    if (an !== "mysql" && options?.where) sql += ` WHERE ${options.where}`;
    await this.adapter.executeMutation(sql);
    if (!this._indexes.has(table)) this._indexes.set(table, []);
    this._indexes.get(table)!.push({
      columns: cols,
      unique,
      name: indexName,
      where: options?.where,
      orders: options?.order,
      using: usingStr ? options?.using : undefined,
      nullsNotDistinct: options?.nullsNotDistinct,
      include: options?.include,
    });
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
    array?: boolean;
  }> {
    const meta = this._columnMeta.get(tableName);
    if (meta) {
      return Array.from(meta.entries()).map(([name, info]) => ({ name, ...info }));
    }
    const cols = this._columns.get(tableName);
    if (!cols) return [];
    return Array.from(cols).map((name) => ({ name, type: "string" }));
  }

  indexes(tableName: string): Array<{
    columns: string[];
    unique: boolean;
    name?: string;
    where?: string;
    orders?: Record<string, string>;
    using?: string;
    nullsNotDistinct?: boolean;
    include?: string[];
  }> {
    const idxs = this._indexes.get(tableName);
    if (!idxs) return [];
    return idxs.map((i) => ({
      ...i,
      columns: [...i.columns],
      include: i.include ? [...i.include] : undefined,
    }));
  }
}

// === Migrator (Rails defines this in migration.rb) ===

export interface MigrationProxy {
  version: string;
  name: string;
  filename?: string;
  /** Mirrors: ActiveRecord::MigrationProxy#scope — engine name for copied engine migrations */
  scope?: string;
  migration: () => MigrationLike | Promise<MigrationLike>;
  /** @internal Mirrors: ActiveRecord::MigrationProxy#basename */
  basename?(): string;
  /** @internal Mirrors: ActiveRecord::MigrationProxy#load_migration */
  loadMigration?(): Promise<MigrationLike>;
}

export class Migrator {
  static validateMigrationTimestamps = false;

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
    const applied = new Set(await this._appliedVersions());

    const fileList = this._migrations.map((m) => {
      const isUp = applied.delete(m.version);
      return {
        status: (isUp ? "up" : "down") as "up" | "down",
        version: m.version,
        name: m.name,
      };
    });

    // Mirrors Rails Migrator#migrations_status: applied versions with no
    // matching file get a placeholder name. Combined list sorts numerically.
    const dbList = [...applied].map((version) => ({
      status: "up" as const,
      version,
      name: "********** NO FILE **********",
    }));

    // Rails sorts by `version.to_i` — non-numeric rows coerce to 0 rather
    // than raising. Use BigInt for precision (versions can exceed
    // MAX_SAFE_INTEGER) with a 0-fallback for non-numeric legacy rows.
    // Mirror Ruby String#to_i: take the leading signed integer prefix and
    // return 0 when none — strings like "123abc" sort as 123 (Rails parity).
    const toBig = (v: string): bigint => {
      const m = v.match(/^\s*(-?\d+)/);
      if (!m) return 0n;
      try {
        return BigInt(m[1]!);
      } catch {
        return 0n;
      }
    };
    return [...dbList, ...fileList].sort((a, b) => {
      const va = toBig(a.version);
      const vb = toBig(b.version);
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
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

  /**
   * Build a Migrator by scanning `dir` for migration files, mirroring
   * Rails' `MigrationContext.new(dir, schema_migration, internal_metadata)`.
   *
   * Each discovered file becomes a `MigrationProxy` whose `migration` factory
   * dynamically imports the file (ESM `import()`).
   *
   * Mirrors: ActiveRecord::MigrationContext#migrations (the discovery half)
   */
  static fromDir(dir: string, adapter: DatabaseAdapter): Migrator {
    return new Migrator(adapter, Migrator.fromPath(dir, adapter));
  }

  /**
   * Scan `dir` for migration files and build `MigrationProxy[]` (without
   * wrapping them in a Migrator). Mirrors the discovery half of Rails'
   * `MigrationContext#migrations`.
   *
   * Mirrors: ActiveRecord::MigrationContext#migrations (discovery)
   */
  static fromPath(dir: string, adapter: DatabaseAdapter): MigrationProxy[] {
    const helper = new Migrator(adapter, []);
    const proxies: MigrationProxy[] = [];
    for (const file of helper.migrationFiles([dir])) {
      const parsed = helper.parseMigrationFilename(file);
      if (!parsed) continue;
      const [version, rawName, scope] = parsed;
      const name = camelize(rawName);
      proxies.push({
        version,
        name,
        filename: file,
        scope: scope || undefined,
        migration: async () => {
          const { pathToFileURL } = await import("node:url");
          const mod = await import(pathToFileURL(file).href);
          return (mod.default ?? mod[name]) as MigrationLike;
        },
      });
    }
    // Rails MigrationContext#migrations: `migrations.sort_by(&:version)` —
    // numeric (not lexicographic) so "10" sorts after "2".
    return proxies.sort((a, b) => {
      const va = BigInt(a.version);
      const vb = BigInt(b.version);
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
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
    const validateTs = this.isValidateTimestamp();

    for (const m of migrations) {
      if (!m.version || !/^\d+$/.test(m.version)) {
        throw new MigrationError(
          `Invalid migration version: ${m.version}. Version must be a numeric string.`,
        );
      }
      if (validateTs && !this.isValidMigrationTimestamp(m.version)) {
        throw new InvalidMigrationTimestampError(m.version, m.name);
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
    try {
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
    } catch (e) {
      // Mirrors: ActiveRecord::Migrator#execute_migration_in_transaction rescue block
      const useTx = this._useTransaction(migration);
      const msg = `An error has occurred, ${useTx ? "this and " : ""}all later migrations canceled:\n\n${e}`;
      throw Object.assign(new Error(msg), { cause: e });
    }

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
    return Migrator.validateMigrationTimestamps;
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
