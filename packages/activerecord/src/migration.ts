import {
  getFs,
  getPath,
  getEnv,
  camelize,
  underscore,
  humanize,
  isPlainObject,
  stdout,
} from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { rubyInspect } from "./relation/ruby-inspect.js";
import { Temporal } from "@blazetrails/activesupport/temporal";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import {
  TableDefinition,
  Table,
  ForeignKeyDefinition,
  type ColumnType,
  type ColumnOptions,
  type AddForeignKeyOptions,
  type ForeignKeyLookupOptions,
  type AddIndexOptions,
  type IdHashOptions,
} from "./connection-adapters/abstract/schema-definitions.js";
import {
  SchemaStatements,
  assertSchemaAdapter,
  type JoinTableOptions,
  type ValidateConstraintStatements,
  type CommentOrChanges,
  type CommentStatements,
  type EnumStatements,
  type ExtensionStatements,
  type UniqueConstraintStatements,
} from "./connection-adapters/abstract/schema-statements.js";
import type { UniqueConstraintOptions } from "./connection-adapters/postgresql/schema-definitions.js";
import { CommandRecorder } from "./migration/command-recorder.js";
import { SchemaMigration } from "./schema-migration.js";
import { InternalMetadata } from "./internal-metadata.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { migrationArConfig } from "./migration/ar-config-source.js";
import type { ExecutionStrategy } from "./migration/execution-strategy.js";
import type { PendingMigrationConnection } from "./migration/pending-migration-connection.js";
import { registerVersion, findVersion, CURRENT_VERSION } from "./migration/compatibility.js";

export type {
  ReferentialAction,
  AddForeignKeyOptions,
} from "./connection-adapters/abstract/schema-definitions.js";

export { ExecutionStrategy } from "./migration/execution-strategy.js";
export { DefaultStrategy } from "./migration/default-strategy.js";
export { PendingMigrationConnection } from "./migration/pending-migration-connection.js";
export {
  registerVersion,
  findVersion,
  currentVersion,
  type Compatibility,
} from "./migration/compatibility.js";

import { ActiveRecordError, NoDatabaseError } from "./errors.js";
import { ActiveRecord } from "./ar-config.js";

// Mirrors Rails AbstractAdapter#extract_new_comment_value (alias of extract_new_default_value).
// For {from,to} hashes, returns `to` (which may be null to clear a comment).
// `to: undefined` is rejected — a missing value cannot be forwarded to SQL.
function _extractNewCommentValue(v: CommentOrChanges): string | null {
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
  return v;
}

// Registry for AR config injected by Base — breaks the migration ↔ base import cycle.
/** @internal */
/**
 * The `columnOptionsKeys` (limit/precision/scale/default/null/collation/comment)
 * that Rails' `column_exists?(table, column, type = nil, **options)` matches
 * against, in addition to the name and optional `type`.
 */
export interface ColumnExistsOptions {
  limit?: unknown;
  precision?: unknown;
  scale?: unknown;
  default?: unknown;
  null?: unknown;
  collation?: unknown;
  comment?: unknown;
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
    super(`Multiple migrations have the version number ${version}.`);
    this.name = "DuplicateMigrationVersionError";
  }
}

export class DuplicateMigrationNameError extends MigrationError {
  constructor(name: string) {
    super(`Multiple migrations have the name ${name}.`);
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
  constructor(name?: string) {
    super(
      name != null
        ? `Illegal name for migration file: ${name}\n\t(only lower case letters, numbers, and '_' allowed).`
        : "Illegal name for migration.",
    );
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
 * @internal Backing store for `Migration.verbose` (`migration.rb:797`,
 * defaulted at `:811`). Rails' `cattr_accessor` is one variable shared by the
 * class and every instance; a static class field would be shadowed by a
 * subclass assigning to it, so the storage lives at module scope.
 */
let migrationVerbose = true;

/**
 * @internal `Migration#write`'s body (`migration.rb:1001`) for callers that
 * have no Migration instance. Rails puts migration output on `$stdout` via
 * `Kernel#puts`; `stdout` is the activesupport shim standing in for `$stdout`
 * — no logger is involved.
 */
function writeMigrationMessage(text = ""): void {
  if (migrationVerbose) {
    stdout.write(`${text}\n`);
  }
}

/** @internal The banner `Migration#announce` (`migration.rb:1005`) hands to `write`. */
function announceMigrationText(header: string, message: string): string {
  const text = `${header}: ${message}`;
  const pad = Math.max(0, 75 - text.length);
  return `== ${text} ${"=".repeat(pad)}`;
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
  private _executionStrategy?: ExecutionStrategy;
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

  /** Mirrors: ActiveRecord::Migration.verbose (`cattr_accessor`, `migration.rb:797`). */
  static get verbose(): boolean {
    return migrationVerbose;
  }

  static set verbose(value: boolean) {
    migrationVerbose = value;
  }

  get verbose(): boolean {
    return migrationVerbose;
  }

  set verbose(value: boolean) {
    migrationVerbose = value;
  }
  private static _disableDdlTransaction = false;

  /** Return the normalized adapter name from the configured adapter. */
  protected get _adapterName(): "sqlite" | "postgres" | "mysql" {
    return this.connection.adapterName as "sqlite" | "postgres" | "mysql";
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
   * The migration instance currently executing a legacy class-level
   * `self.up`/`self.down` body, so that body's schema operations route through
   * it. Mirrors Rails' `Migration.delegate` (`active_record/migration.rb:951`).
   */
  static _delegate?: Migration;

  /**
   * Run the migration in the given direction (class method).
   *
   * Mirrors: ActiveRecord::Migration.migrate — `new.migrate(direction)`, so the
   * class-level entry point runs through the instance announce/timing/write +
   * exec_migration path (`active_record/migration.rb:727`).
   */
  static async migrate(direction: "up" | "down"): Promise<void> {
    await new (this as unknown as new () => Migration)().migrate(direction);
  }

  /**
   * Override to define the forward migration.
   *
   * @internal
   */
  async up(): Promise<void> {
    const legacy = this._legacyClassDirection("up");
    if (legacy) return legacy();
    // Default: run change() in the forward direction.
    await this.change();
  }

  /**
   * Override to define the rollback migration.
   * Default: run change() in reverse direction.
   *
   * @internal
   */
  async down(): Promise<void> {
    const legacy = this._legacyClassDirection("down");
    if (legacy) return legacy();
    // Mirrors Rails exec_migration: `down` == `revert { change }`.
    await this.revert(() => this.change());
  }

  /**
   * Rails legacy delegate shape (`active_record/migration.rb:951-960`): a legacy
   * migration defines its own class-level `self.up`/`self.down`; the instance
   * `up`/`down` run that body with itself as the delegate (so its schema ops
   * route back through this instance), and no-op for a direction the legacy
   * class doesn't define (`return unless self.class.respond_to?(direction)`).
   * Returns null for the normal `change`-based path (no class-level up/down).
   */
  private _legacyClassDirection(direction: "up" | "down"): (() => Promise<void>) | null {
    const ctor = this.constructor as typeof Migration;
    const owns = (d: "up" | "down"): boolean => Object.prototype.hasOwnProperty.call(ctor, d);
    if (!owns("up") && !owns("down")) return null; // change-based, not legacy
    if (!owns(direction)) return async (): Promise<void> => {}; // Rails: return unless respond_to?
    const fn = (ctor as unknown as Record<string, () => Promise<void>>)[direction];
    return async (): Promise<void> => {
      const prev = Migration._delegate;
      Migration._delegate = this;
      try {
        await fn.call(ctor);
      } finally {
        Migration._delegate = prev;
      }
    };
  }

  /**
   * Override for reversible migrations.
   * Called by both up() and down() with a direction parameter.
   */
  async change(): Promise<void> {
    // Subclasses override
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
          id?: boolean | ColumnType | IdHashOptions;
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
      // Record `[name, options?, block?]` without trailing `undefined`, so the
      // inversion to drop_table (which keeps every arg, including the block, for
      // reversibility) doesn't carry a stray arg into the executed statement.
      const recordArgs: unknown[] = [name];
      if (typeof optionsOrFn === "function") {
        recordArgs.push(optionsOrFn);
      } else {
        if (optionsOrFn !== undefined) recordArgs.push(optionsOrFn);
        if (fn !== undefined) recordArgs.push(fn);
      }
      this._recorder.record("createTable", recordArgs);
      return;
    }
    const tname = this._pt(name);
    await this.schema.createTable(tname, optionsOrFn, fn);
  }

  async dropTable(
    ...args: Array<
      | string
      | { ifExists?: boolean; force?: "cascade"; temporary?: boolean }
      | ((t: TableDefinition) => void)
    >
  ): Promise<void> {
    const rest = [...args] as unknown[];
    // Rails drop_table(*table_names, **options, &block): the trailing block is
    // the table definition, kept only so the recorder can recreate on reversal.
    const block = typeof rest[rest.length - 1] === "function" ? rest.pop() : undefined;
    const last = rest[rest.length - 1];
    const hasOptions = last !== null && typeof last === "object";
    const options = hasOptions
      ? (last as { ifExists?: boolean; force?: "cascade"; temporary?: boolean })
      : undefined;
    const names = (hasOptions ? rest.slice(0, -1) : rest) as string[];
    if (this._recording) {
      // Record the raw (un-prefixed) names — invert replays through createTable,
      // which re-applies the table-name prefix. The recorder accepts the splat.
      const recordArgs: unknown[] = [...names];
      if (options) recordArgs.push(options);
      if (block) recordArgs.push(block);
      this._recorder.record("dropTable", recordArgs);
      return;
    }
    const tnames = names.map((n) => this._pt(n)) as [string, ...string[]];
    if (options) {
      await this.schema.dropTable(...tnames, options);
    } else {
      await this.schema.dropTable(...tnames);
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
    options: AddIndexOptions = {},
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("addIndex", [tableName, columns, options]);
      return;
    }
    tableName = this._pt(tableName);
    await this.schema.addIndex(tableName, columns, options);
  }

  // Rails migration compatibility: `remove_index(table_name, column_name = nil, **options)`.
  async removeIndex(
    tableName: string,
    columnOrOptions:
      | string
      | string[]
      | { column?: string | string[]; name?: string; ifExists?: boolean } = {},
    options: { column?: string | string[]; name?: string; ifExists?: boolean } = {},
  ): Promise<void> {
    if (this._recording) {
      // Record args as actually passed so command-recorder inversion sees the
      // same shape: positional column → [table, column, options]; options-hash
      // form → [table, options] (no spurious trailing hash to mis-strip).
      const recordArgs =
        typeof columnOrOptions === "string" || Array.isArray(columnOrOptions)
          ? [tableName, columnOrOptions, options]
          : [tableName, columnOrOptions];
      this._recorder.record("removeIndex", recordArgs);
      return;
    }
    tableName = this._pt(tableName);
    await this.schema.removeIndex(tableName, columnOrOptions, options);
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

  async columnExists(
    tableName: string,
    columnName: string,
    type?: string | null,
    options?: ColumnExistsOptions,
  ): Promise<boolean> {
    return this.schema.columnExists(this._pt(tableName), columnName, type, options);
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
    const conn = this.connection;
    assertSchemaAdapter(conn);
    await conn.changeColumnNull(tableName, columnName, allowNull, defaultValue);
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

  /** Alias of addReference (Rails: `alias :add_belongs_to :add_reference`). */
  async addBelongsTo(
    tableName: string,
    refName: string,
    options: ColumnOptions & {
      polymorphic?: boolean;
      foreignKey?: boolean;
      type?: ColumnType;
      index?: boolean;
    } = {},
  ): Promise<void> {
    return this.addReference(tableName, refName, options);
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

  /** Alias of removeReference (Rails: `alias :remove_belongs_to :remove_reference`). */
  async removeBelongsTo(
    tableName: string,
    refName: string,
    options: { polymorphic?: boolean } = {},
  ): Promise<void> {
    return this.removeReference(tableName, refName, options);
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
    options?: { column?: string; name?: string; ifExists?: boolean },
  ): Promise<void> {
    if (this._recording) {
      // Rails records `remove_foreign_key(from_table, to_table, **options)`;
      // preserve the trailing options so invert_add_foreign_key's column/name
      // survive the round-trip and resolve the real constraint on replay.
      const recordArgs: unknown[] = [fromTable, toTableOrOptions];
      if (options !== undefined) recordArgs.push(options);
      this._recorder.record("removeForeignKey", recordArgs);
      return;
    }
    fromTable = this._pt(fromTable);
    if (typeof toTableOrOptions === "string") toTableOrOptions = this._pt(toTableOrOptions);
    await this.schema.removeForeignKey(fromTable, toTableOrOptions, options);
  }

  async addCheckConstraint(
    tableName: string,
    expression: string,
    // Mirrors Rails' `add_check_constraint(table, expression, **options)`:
    // unrecognized options are forwarded verbatim, not rejected.
    options: {
      name?: string;
      validate?: boolean;
      ifNotExists?: boolean;
      [key: string]: unknown;
    } = {},
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
    options?: { name?: string; ifExists?: boolean },
  ): Promise<void> {
    if (this._recording) {
      // Rails records `remove_check_constraint(table, expression, **options)`;
      // preserve the trailing options so invert_add_check_constraint's :name
      // survives the round-trip and resolves the real constraint on replay.
      const recordArgs: unknown[] = [tableName, expressionOrOptions];
      if (options !== undefined) recordArgs.push(options);
      this._recorder.record("removeCheckConstraint", recordArgs);
      return;
    }
    tableName = this._pt(tableName);
    await this.schema.removeCheckConstraint(tableName, expressionOrOptions, options);
  }

  async validateCheckConstraint(
    tableName: string,
    nameOrOptions: string | { name: string },
  ): Promise<void> {
    const connection = this.connection as DatabaseAdapter & ValidateConstraintStatements;
    await connection.validateCheckConstraint(this._pt(tableName), nameOrOptions);
  }

  async validateForeignKey(
    fromTable: string,
    toTableOrOptions?: string | Omit<ForeignKeyLookupOptions, "toTable">,
    options?: Omit<ForeignKeyLookupOptions, "toTable">,
  ): Promise<void> {
    const toTable = typeof toTableOrOptions === "string" ? toTableOrOptions : undefined;
    const opts = typeof toTableOrOptions === "object" ? toTableOrOptions : (options ?? undefined);
    const connection = this.connection as DatabaseAdapter & ValidateConstraintStatements;
    await connection.validateForeignKey(this._pt(fromTable), toTable, opts);
  }

  async changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: CommentOrChanges,
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("changeColumnComment", [tableName, columnName, commentOrChanges]);
      return;
    }
    tableName = this._pt(tableName);
    const resolved = _extractNewCommentValue(commentOrChanges);
    const connection = this.connection as DatabaseAdapter & CommentStatements;
    await connection.changeColumnComment(tableName, columnName, resolved);
  }

  async changeTableComment(tableName: string, commentOrChanges: CommentOrChanges): Promise<void> {
    if (this._recording) {
      this._recorder.record("changeTableComment", [tableName, commentOrChanges]);
      return;
    }
    tableName = this._pt(tableName);
    const resolved = _extractNewCommentValue(commentOrChanges);
    const connection = this.connection as DatabaseAdapter & CommentStatements;
    await connection.changeTableComment(tableName, resolved);
  }

  async enableExtension(name: string, options?: Record<string, unknown>): Promise<void> {
    if (this._recording) {
      this._recorder.record("enableExtension", [name, options]);
      return;
    }
    const connection = this.connection as DatabaseAdapter & ExtensionStatements;
    await connection.enableExtension(name, options);
  }

  async disableExtension(
    name: string,
    options?: { force?: "cascade"; schema?: string },
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("disableExtension", [name, options]);
      return;
    }
    const connection = this.connection as DatabaseAdapter & ExtensionStatements;
    await connection.disableExtension(name, options);
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
    const connection = this.connection as DatabaseAdapter & EnumStatements;
    await connection.createEnum(name, values, options);
  }

  async dropEnum(
    name: string,
    valuesOrOptions?: string[] | { ifExists?: boolean },
    options?: { ifExists?: boolean },
  ): Promise<void> {
    // Normalize: if second arg is a plain object it is the options hash (no values).
    // Mirrors Rails drop_enum(name, values = nil, **options) which allows options-only calls.
    const isOptsObj =
      valuesOrOptions !== null &&
      typeof valuesOrOptions === "object" &&
      !Array.isArray(valuesOrOptions);
    const values = isOptsObj ? undefined : valuesOrOptions;
    const opts = isOptsObj ? valuesOrOptions : (options ?? undefined);
    if (this._recording) {
      this._recorder.record("dropEnum", [name, values, opts]);
      return;
    }
    // values is only captured for recording (so dropEnum can be inverted to createEnum);
    // the adapter's dropEnum(name, options?) doesn't need values for SQL execution.
    const connection = this.connection as DatabaseAdapter & EnumStatements;
    await connection.dropEnum(name, opts ?? {});
  }

  async renameEnumValue(name: string, options: { from: string; to: string }): Promise<void> {
    if (this._recording) {
      this._recorder.record("renameEnumValue", [name, options]);
      return;
    }
    const connection = this.connection as DatabaseAdapter & EnumStatements;
    await connection.renameEnumValue(name, options);
  }

  async addUniqueConstraint(
    tableName: string,
    columnName?: string | string[],
    options?: UniqueConstraintOptions,
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("addUniqueConstraint", [tableName, columnName, options]);
      return;
    }
    tableName = this._pt(tableName);
    const connection = this.connection as DatabaseAdapter & UniqueConstraintStatements;
    await connection.addUniqueConstraint(tableName, columnName, options);
  }

  async removeUniqueConstraint(
    tableName: string,
    columnNameOrOptions?: string | string[] | UniqueConstraintOptions,
    options?: UniqueConstraintOptions,
  ): Promise<void> {
    // Normalize: if second arg is a plain object it is the options hash (no column).
    // Mirrors Rails extract_options! semantics for remove_unique_constraint(table, **opts).
    const isOptsObj =
      columnNameOrOptions !== null &&
      typeof columnNameOrOptions === "object" &&
      !Array.isArray(columnNameOrOptions);
    const columnName = isOptsObj ? undefined : columnNameOrOptions;
    const opts = isOptsObj ? columnNameOrOptions : (options ?? undefined);
    if (this._recording) {
      this._recorder.record("removeUniqueConstraint", [tableName, columnName, opts]);
      return;
    }
    tableName = this._pt(tableName);
    const connection = this.connection as DatabaseAdapter & UniqueConstraintStatements;
    await connection.removeUniqueConstraint(tableName, columnName, opts);
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
    const table = this.schema.updateTableDefinition(tableName, this);
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

  indexName(
    tableName: string,
    options: { column?: string | string[]; name?: string; _usesLegacyIndexName?: boolean },
  ): string {
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
    // `columns` is a string for expression indexes, an array otherwise —
    // mirrors Rails' IndexDefinition#columns.
  ): Promise<Array<{ name: string; columns: string | string[]; unique: boolean }>> {
    return this.schema.indexes(this._pt(tableName));
  }

  async primaryKey(tableName: string): Promise<string | string[] | null> {
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
    return this._name ?? this.constructor.name;
  }

  /**
   * Revert a migration or a block of operations.
   *
   * Mirrors: ActiveRecord::Migration#revert
   */
  async revert(migrationOrFn?: Migration | (() => Promise<void>)): Promise<void> {
    if (migrationOrFn === undefined) return;
    if (migrationOrFn instanceof Migration) {
      // Mirrors Rails `revert(*migration_classes)` -> `run(..., revert: true)`.
      await this._run(migrationOrFn, { revert: true });
      return;
    }
    const fn = migrationOrFn;
    if (this._recording) {
      // Nested: reuse the active recorder and just toggle its direction, so a
      // `revert` inside a reverting migration cancels by double-negation
      // (mirrors Rails `connection.revert(&block)` when connection is already a
      // CommandRecorder — no fresh recorder, no replay, and no suppress_messages:
      // Rails only suppresses in the outer branch).
      await this._recorder.revert(async () => {
        await fn();
      });
      return;
    }
    // Outermost: swap in a CommandRecorder as the active delegate, record the
    // block in reverting mode (commands invert at record time), restore, then
    // replay the recorded inverses for real.
    const previousRecorder = this._recorder;
    const recorder = new CommandRecorder(this.connection);
    this._recorder = recorder;
    this._recording = true;
    try {
      await recorder.revert(async () => {
        await this.suppressMessages(async () => {
          await fn();
        });
      });
    } finally {
      this._recorder = previousRecorder;
      this._recording = false;
    }
    await recorder.replay(this as unknown as Record<string, (...a: unknown[]) => Promise<void>>);
  }

  /**
   * Run another migration in a direction, flipping it under `revert`.
   *
   * Mirrors: ActiveRecord::Migration#run — when the current migration is itself
   * reverting, running a sub-migration `:up` means executing it `:down` without
   * reverting, so it wraps the call in a nested `revert`.
   */
  private async _run(
    migration: Migration,
    opts: { direction?: "up" | "down"; revert?: boolean } = {},
  ): Promise<void> {
    let dir = opts.direction ?? "up";
    if (opts.revert) dir = dir === "down" ? "up" : "down";
    if (this.isReverting()) {
      await this.revert(async () => {
        await this._run(migration, { direction: dir, revert: true });
      });
    } else if (this._recording) {
      // Recording (but not reverting): route the sub-migration's ops into the
      // active recorder by sharing our recorder state with it.
      const prevRecorder = migration._recorder;
      const prevRecording = migration._recording;
      const prevConn = migration._connectionOverride;
      migration._recorder = this._recorder;
      migration._recording = true;
      migration._connectionOverride = this.connection;
      try {
        await (dir === "up" ? migration.up() : migration.down());
      } finally {
        migration._recorder = prevRecorder;
        migration._recording = prevRecording;
        migration._connectionOverride = prevConn;
      }
    } else {
      await migration.execMigration(this.connection, dir);
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
    if (this.isReverting()) {
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
    if (!this.isReverting() && fn) {
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
    await this.execMigration(this.connection, direction);
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
    return this._recording && this._recorder.reverting;
  }

  async viewExists(viewName: string): Promise<boolean> {
    return this.schema.viewExists(viewName);
  }

  async indexExists(
    tableName: string,
    columnName: string | string[],
    options?: { unique?: boolean; name?: string; valid?: boolean },
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
    if (adapter) this.connection = adapter;
    if (direction === "up") {
      await this.up();
    } else {
      await this.down();
    }
  }

  /**
   * Get the migration version. Rails initializes `@version` to nil
   * (`migration.rb:799`) — only `@name` defaults to the class name — so an
   * unversioned migration has no version.
   */
  get version(): string | undefined {
    return this._version;
  }

  // --- Logging (Rails: Migration#write, #announce, #say, #say_with_time, #suppress_messages) ---

  write(text = ""): void {
    if (Migration.verbose) {
      stdout.write(`${text}\n`);
    }
  }

  announce(message: string): void {
    // Ruby interpolates a nil version as "", not "undefined".
    this.write(announceMigrationText(`${this.version ?? ""} ${this.name}`, message));
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
    const was = Migration.verbose;
    Migration.verbose = false;
    try {
      await fn();
    } finally {
      Migration.verbose = was;
    }
  }

  // --- Connection (Rails: Migration#connection, #connection_pool) ---

  get connection(): DatabaseAdapter {
    // Rails: `@connection || ActiveRecord::Base.lease_connection`. A bare
    // migration with no assigned connection leases one from the migration pool.
    return this._connectionOverride ?? this.adapter ?? migrationArConfig()!.leaseConnection!();
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
      this._executionStrategy = undefined;
    }
  }

  get executionStrategy(): ExecutionStrategy {
    this._executionStrategy ??= new (ActiveRecord.migrationStrategy as new (
      migration: Migration,
    ) => ExecutionStrategy)(this);
    return this._executionStrategy;
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
    const raw =
      number == null
        ? 0n
        : typeof number === "bigint"
          ? number
          : BigInt(typeof number === "number" ? Math.max(0, Math.trunc(number)) : number);
    const n = raw < 0n ? 0n : raw;
    // Rails' `else "%.3d" % number.to_i` branch: sequential numbering, no
    // timestamp consulted at all (migration.rb:1128-1134).
    if (!ActiveRecord.timestampedMigrations) return n.toString().padStart(3, "0");
    const stamp = Temporal.Now.instant()
      .toString()
      .replace(/[-T:Z.]/g, "")
      .slice(0, 14);
    if (number == null) return stamp;
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
      tableNamePrefix: migrationArConfig()?.tableNamePrefix ?? "",
      tableNameSuffix: migrationArConfig()?.tableNameSuffix ?? "",
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

    const destinationMigrations = new MigrationContext([destination]).migrations;
    let last: MigrationProxy | undefined = destinationMigrations[destinationMigrations.length - 1];

    const copied: MigrationProxy[] = [];
    for (const [scope, sourcePath] of Object.entries(sources)) {
      // Must round-trip through `MigrationContext#parseMigrationFilename` (regex
      // `[a-z0-9_]*`) or the copied file would be invisible to subsequent
      // discovery via `MigrationContext#migrations`.
      if (!/^[a-z0-9_]+$/.test(scope)) {
        throw new ArgumentError(
          `Invalid migration scope '${scope}': must match /^[a-z0-9_]+$/ to be discoverable by MigrationContext#migrations.`,
        );
      }
      if (!fs.existsSync(sourcePath)) continue;
      const sourceMigrations = new MigrationContext([sourcePath]).migrations;

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
        // both `MigrationContext#migrations` discovery (regex matches .ts|.js) and
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
            return loadMigrationFrom(mod, proxyName, newVersion);
          },
        };
        last = copy;

        // Preserve TS compiler magic directives (// @ts-check, // @ts-nocheck)
        // before the provenance line, mirroring Rails' frozen_string_literal /
        // encoding handling (migration.rb:1082).
        const magicMatch = /^((?:\/\/ @ts-(?:no)?check[^\n]*\n)+\n?)/.exec(body);
        const magic = magicMatch ? magicMatch[1] : "";
        const rest = magic.length > 0 ? body.slice(magic.length) : body;
        fs.writeFileSync(newPath, `${magic}${inserted}${rest}`);
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
    if (ActiveRecord.maintainTestSchema) {
      await this.loadSchemaIfPendingBang();
    }
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
    return this.connection;
  }

  get nearestDelegate(): DatabaseAdapter {
    return this.connection;
  }

  /** @internal */
  async methodMissing(name: string, ...args: unknown[]): Promise<unknown> {
    return await this.sayWithTime(`${name}(${this.formatArguments(args)})`, async () => {
      const conn = this.connection as unknown as Record<string, unknown>;
      if (typeof conn["revert"] !== "function") {
        if (args.length > 0 && !["execute", "enableExtension", "disableExtension"].includes(name)) {
          const options = Migration.tableNameOptions();
          args[0] = Migration.properTableName(args[0] as string | { tableName?: unknown }, options);
          if (name === "renameTable" || (name === "removeForeignKey" && !isPlainObject(args[1]))) {
            args[1] = Migration.properTableName(
              args[1] as string | { tableName?: unknown },
              options,
            );
          }
        }
      }
      const strategy = this.executionStrategy as {
        respondToMissing?: (name: string) => boolean;
        methodMissing?: (name: string, ...args: unknown[]) => unknown;
      };
      if (strategy.respondToMissing?.(name) !== true) {
        throw new TypeError(`undefined method '${name}' for ${this.connection.constructor.name}`);
      }
      return await strategy.methodMissing?.(name, ...args);
    });
  }

  /** @internal */
  executeBlock(fn: () => Promise<void>): Promise<void> {
    return fn();
  }

  /**
   * Render a dispatched statement's arguments the way Ruby's
   * `format_arguments` does: every argument through `inspect`, with a
   * trailing options Hash stripped of internal (`_`-prefixed) keys and
   * omitted when nothing survives. An empty argument list still yields
   * `"nil"`, matching Ruby's `arguments.last` on an empty array.
   *
   * @internal
   */
  formatArguments(args: unknown[]): string {
    const argList = args.slice(0, -1).map((a) => rubyInspect(a));
    const last = args[args.length - 1];
    if (isPlainObject(last)) {
      const filtered = Object.fromEntries(
        Object.entries(last).filter(([k]) => !this.isInternalOption(k)),
      );
      if (Object.keys(filtered).length > 0) argList.push(rubyInspect(filtered));
    } else {
      argList.push(rubyInspect(last));
    }
    return argList.join(", ");
  }

  /** @internal */
  isInternalOption(optionName: string): boolean {
    return optionName.startsWith("_");
  }

  /** @internal */
  commandRecorder(): CommandRecorder {
    return new CommandRecorder(this.connection);
  }

  /** @internal */
  static env(): string {
    return getEnv("TRAILS_ENV") ?? getEnv("NODE_ENV") ?? "development";
  }
}

// === Migrator (Rails defines this in migration.rb) ===

export interface MigrationProxy {
  version: string;
  name: string;
  filename?: string;
  /** Mirrors: ActiveRecord::MigrationProxy#scope — engine name for copied engine migrations */
  scope?: string;
  migration: () => Migration | Promise<Migration>;
  /** @internal Mirrors: ActiveRecord::MigrationProxy#basename */
  basename?(): string;
  /** @internal Mirrors: ActiveRecord::MigrationProxy#load_migration */
  loadMigration?(): Promise<Migration>;
}

/**
 * Mirrors: ActiveRecord::MigrationProxy#load_migration (`migration.rb:1195`) —
 * `name.constantize.new(name, version)`. The module's export named after the
 * migration is the class; the instance is always constructed here so it
 * carries the proxy's name and version.
 */
async function loadMigrationFrom(
  mod: Record<string, unknown>,
  name: string,
  version: string,
): Promise<Migration> {
  const exported = mod[name];
  if (typeof exported === "function") {
    return new (exported as new (name?: string, version?: string) => Migration)(name, version);
  }
  throw new Error(`Migration ${name} must export a Migration class named "${name}"`);
}

/**
 * Rails' `sort_by(&:version)` over migration proxies: numeric, not
 * lexicographic, so version 10 sorts after version 2. BigInt because a
 * timestamp version exceeds `Number.MAX_SAFE_INTEGER`.
 */
/**
 * Ruby's `String#to_i`: the leading signed integer prefix, or 0 when there is
 * none — so `"123abc"` is 123 and a non-numeric legacy version sorts as 0
 * rather than raising. BigInt keeps precision past `Number.MAX_SAFE_INTEGER`.
 */
function toInteger(value: string): bigint {
  const match = value.match(/^\s*(-?\d+)/);
  if (!match) return 0n;
  try {
    return BigInt(match[1]);
  } catch {
    return 0n;
  }
}

function byVersion(a: MigrationProxy, b: MigrationProxy): number {
  const va = BigInt(a.version);
  const vb = BigInt(b.version);
  return va < vb ? -1 : va > vb ? 1 : 0;
}

/**
 * = \Migration \Context
 *
 * MigrationContext sets the context in which a migration is run.
 *
 * A migration context requires the path to the migrations is set in the
 * `migrationsPaths` parameter. Optionally a `schemaMigration` object can be
 * provided. Multiple database applications will instantiate a
 * `SchemaMigration` object per database.
 *
 * Mirrors: ActiveRecord::MigrationContext (migration.rb:1211)
 */
export class MigrationContext {
  readonly migrationsPaths: string[];
  private readonly _schemaMigration?: SchemaMigration;
  private readonly _internalMetadata?: InternalMetadata;

  /**
   * Rails defaults `schema_migration` / `internal_metadata` from
   * `connection_pool` (`migration.rb:1214-1218`); trails has no pool to reach
   * from here, so they stay optional. A context built without them still
   * answers the connectionless half — `migrationsPaths`, `migrations` and the
   * file discovery under it — which is all the CLI's bootstrap needs.
   */
  constructor(
    migrationsPaths: string[],
    schemaMigration?: SchemaMigration,
    internalMetadata?: InternalMetadata,
  ) {
    this.migrationsPaths = migrationsPaths;
    this._schemaMigration = schemaMigration;
    this._internalMetadata = internalMetadata;
  }

  /** Mirrors: ActiveRecord::MigrationContext#schema_migration */
  get schemaMigration(): SchemaMigration {
    if (!this._schemaMigration) {
      throw new MigrationError("MigrationContext was built without a schema_migration");
    }
    return this._schemaMigration;
  }

  /** Mirrors: ActiveRecord::MigrationContext#internal_metadata */
  get internalMetadata(): InternalMetadata {
    if (!this._internalMetadata) {
      throw new MigrationError("MigrationContext was built without an internal_metadata");
    }
    return this._internalMetadata;
  }

  /**
   * @internal The adapter every `Migrator` built here runs against — trails'
   * stand-in for the `connection_pool` Rails' `MigrationContext` reaches
   * through `DatabaseTasks` (`migration.rb:1361-1367`).
   */
  private get connection(): DatabaseAdapter {
    return this.schemaMigration.connection;
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#migrate
   * (`migration.rb:1228-1238`).
   */
  async migrate(
    targetVersion?: number | string | null,
    block?: (m: MigrationProxy) => boolean,
  ): Promise<MigrationProxy[]> {
    if (targetVersion === undefined || targetVersion === null) return this.up(targetVersion, block);
    const target = BigInt(targetVersion);
    const current = BigInt((await this.currentVersion()) ?? 0);
    if (current === 0n && target === 0n) return [];
    if (current > target) return this.down(targetVersion, block);
    return this.up(targetVersion, block);
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#up (`migration.rb:1248-1256`) */
  async up(
    targetVersion?: number | string | null,
    block?: (m: MigrationProxy) => boolean,
  ): Promise<MigrationProxy[]> {
    const selectedMigrations = block ? this.migrations.filter(block) : this.migrations;
    return this._migrateWithMigrator(this._newMigrator("up", selectedMigrations, targetVersion));
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#down (`migration.rb:1258-1266`) */
  async down(
    targetVersion?: number | string | null,
    block?: (m: MigrationProxy) => boolean,
  ): Promise<MigrationProxy[]> {
    const selectedMigrations = block ? this.migrations.filter(block) : this.migrations;
    return this._migrateWithMigrator(this._newMigrator("down", selectedMigrations, targetVersion));
  }

  /**
   * @internal `Migrator#migrate` is `use_advisory_lock? ? with_advisory_lock
   * { migrate_without_lock } : migrate_without_lock` (`migration.rb:1452-1458`).
   * It is spelled out here because trails' `Migrator#migrate` still carries the
   * MigrationContext-shaped `(targetVersion, block)` signature its remaining
   * callers pass; `migrator-run-surface-caller-migration` collapses it.
   */
  private async _migrateWithMigrator(migrator: Migrator): Promise<MigrationProxy[]> {
    return migrator.isUseAdvisoryLock()
      ? migrator.withAdvisoryLock(() => migrator.migrateWithoutLock())
      : migrator.migrateWithoutLock();
  }

  private _newMigrator(
    direction: "up" | "down",
    migrations: MigrationProxy[],
    targetVersion: number | string | null = null,
  ): Migrator {
    return new Migrator(this.connection, migrations, {
      direction,
      targetVersion,
      internalMetadataEnabled: this._internalMetadata?.enabled,
    });
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#rollback
   * (`migration.rb:1240-1242`) — `move(:down, steps)`, not `Migrator`'s own
   * `rollback`. The two are not equivalent: `move` indexes into the sorted
   * migration list from `currentMigration` and raises
   * `UnknownMigrationVersionError` when the current version has no matching
   * migration, where `Migrator#rollback` walks the last N *applied* versions
   * and silently rolls back a different set when migrations ran out of order.
   */
  async rollback(steps: number = 1): Promise<MigrationProxy[]> {
    return this.move("down", steps);
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#forward
   * (`migration.rb:1244-1246`) — `move(:up, steps)`. See {@link rollback} for
   * why this does not delegate to `Migrator#forward`.
   */
  async forward(steps: number = 1): Promise<MigrationProxy[]> {
    return this.move("up", steps);
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#run (`migration.rb:1268-1270`) */
  async run(direction: "up" | "down", targetVersion: number | string): Promise<string | undefined> {
    const migrator = this._newMigrator(direction, this.migrations, targetVersion);
    return migrator.isUseAdvisoryLock()
      ? migrator.withAdvisoryLock(() => migrator.runWithoutLock())
      : migrator.runWithoutLock();
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#open
   * (`migration.rb:1272-1274`) — a fresh `Migrator` over this context's
   * migrations, so each read sees current schema_migrations.
   */
  open(): Migrator {
    return new Migrator(this.connection, this.migrations, {
      direction: "up",
      targetVersion: null,
      internalMetadataEnabled: this._internalMetadata?.enabled,
    });
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#migrations_status (`migration.rb:1317-1330`) */
  async migrationsStatus(): Promise<
    Array<{ status: "up" | "down"; version: string; name: string }>
  > {
    const dbList = new Set(await this.schemaMigration.normalizedVersions());

    const fileList = this.migrationFiles().map((file) => {
      const parsed = this.parseMigrationFilename(file);
      if (!parsed) throw new IllegalMigrationNameError(file);
      const [rawVersion, name, scope] = parsed;
      if (this.isValidateTimestamp() && !this.isValidMigrationTimestamp(rawVersion)) {
        throw new InvalidMigrationTimestampError(rawVersion, name);
      }
      const version = SchemaMigration.normalizeMigrationNumber(rawVersion);
      const status = dbList.delete(version) ? ("up" as const) : ("down" as const);
      return { status, version, name: humanize(name + scope) };
    });

    const noFileList = [...dbList].map((version) => ({
      status: "up" as const,
      version,
      name: "********** NO FILE **********",
    }));

    return [...noFileList, ...fileList].sort((a, b) => {
      const va = toInteger(a.version);
      const vb = toInteger(b.version);
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#current_environment
   * (`migration.rb:1340-1342`) — `ConnectionHandling::DEFAULT_ENV.call`, whose
   * trails counterpart is {@link DatabaseConfigurations.currentEnv}.
   */
  get currentEnvironment(): string {
    return DatabaseConfigurations.currentEnv();
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#protected_environment? (`migration.rb:1344-1346`) */
  async protectedEnvironment(): Promise<boolean> {
    const stored = await this.lastStoredEnvironment();
    if (!stored) return false;
    const { Base } = await import("./base.js");
    return (Base.protectedEnvironments ?? ["production"]).includes(stored);
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#last_stored_environment (`migration.rb:1348-1357`) */
  async lastStoredEnvironment(): Promise<string | null> {
    const internalMetadata = this.internalMetadata;
    if (!internalMetadata.enabled) return null;
    if ((await this.currentVersion()) === 0) return null;
    const noEnvMsg =
      "Environment data not found in the schema. To resolve this issue, run: bin/rails db:environment:set";
    if (!(await internalMetadata.tableExists())) {
      throw new NoEnvironmentInSchemaError(noEnvMsg);
    }
    const environment = await internalMetadata.get("environment");
    if (!environment) {
      throw new NoEnvironmentInSchemaError(noEnvMsg);
    }
    return environment;
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#get_all_versions */
  async getAllVersions(): Promise<number[]> {
    if (await this.schemaMigration.tableExists()) {
      return this.schemaMigration.integerVersions();
    }
    return [];
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#current_version
   * (`migration.rb:1292-1295`), whose bare `rescue NoDatabaseError` returns nil.
   */
  async currentVersion(): Promise<number | undefined> {
    try {
      const versions = await this.getAllVersions();
      return versions.length > 0 ? Math.max(...versions) : 0;
    } catch (error) {
      if (error instanceof NoDatabaseError) return undefined;
      throw error;
    }
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#needs_migration? */
  async needsMigration(): Promise<boolean> {
    return (await this.pendingMigrationVersions()).length > 0;
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#pending_migration_versions */
  async pendingMigrationVersions(): Promise<number[]> {
    const applied = new Set(await this.getAllVersions());
    return this.migrations.map((m) => Number(m.version)).filter((v) => !applied.has(v));
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#migrations
   * (`migration.rb:1303-1315`). Discovery reads *this context's*
   * `migrationsPaths`, which Rails keeps as per-instance constructor state
   * (`attr_reader :migrations_paths`), so two contexts built for two migration
   * directories do not collide.
   */
  get migrations(): MigrationProxy[] {
    const migrations = this.migrationFiles().map((file) => {
      const parsed = this.parseMigrationFilename(file);
      if (!parsed) throw new IllegalMigrationNameError(file);
      const [version, rawName, scope] = parsed;
      if (this.isValidateTimestamp() && !this.isValidMigrationTimestamp(version)) {
        throw new InvalidMigrationTimestampError(version, rawName);
      }
      const name = camelize(rawName);
      return {
        version,
        name,
        filename: file,
        scope: scope || undefined,
        migration: async (): Promise<Migration> => {
          const { pathToFileURL } = await import("node:url");
          const mod = await import(pathToFileURL(file).href);
          return loadMigrationFrom(mod, name, version);
        },
      } satisfies MigrationProxy;
    });

    return migrations.sort(byVersion);
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#migration_files (`migration.rb:1369-1372`) */
  private migrationFiles(): string[] {
    const { readdirSync, existsSync } = getFs();
    const { join } = getPath();
    const files: string[] = [];
    const collect = (dir: string): void => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          collect(full);
        } else if (/^\d+_.*\.(ts|js)$/.test(entry.name)) {
          files.push(full);
        }
      }
    };
    for (const p of this.migrationsPaths) collect(p);
    return files.sort();
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#parse_migration_filename (`migration.rb:1374-1376`) */
  private parseMigrationFilename(filename: string): [string, string, string] | null {
    const base = filename.replace(/.*[/\\]/, "").replace(/\.(ts|js)$/, "");
    const m = base.match(/^(\d+)_([a-z0-9_]*)(?:\.([a-z0-9_]*))?$/);
    if (!m) return null;
    return [m[1], m[2], m[3] ?? ""];
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#validate_timestamp? (`migration.rb:1378-1380`) */
  private isValidateTimestamp(): boolean {
    return ActiveRecord.timestampedMigrations && Migrator.validateMigrationTimestamps;
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#valid_migration_timestamp? (`migration.rb:1382-1384`) */
  private isValidMigrationTimestamp(version: string | number): boolean {
    const tomorrow = Temporal.Now.plainDateTimeISO("UTC").add({ days: 1 });
    const limit = Number(
      `${tomorrow.year}${String(tomorrow.month).padStart(2, "0")}${String(tomorrow.day).padStart(2, "0")}${String(tomorrow.hour).padStart(2, "0")}${String(tomorrow.minute).padStart(2, "0")}${String(tomorrow.second).padStart(2, "0")}`,
    );
    return Number(version) < limit;
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#move
   * (`migration.rb:1386-1401`), whose closing `public_send(direction, version)`
   * returns whatever `up` / `down` returned — so `rollback` / `forward` answer
   * the migrations that ran.
   */
  async move(direction: "up" | "down", steps: number): Promise<MigrationProxy[]> {
    const migrator = this._newMigrator(direction, this.migrations);
    const currentVersion = (await this.currentVersion()) ?? 0;
    const currentMigration = await migrator.currentMigration();
    if (currentVersion !== 0 && !currentMigration) {
      throw new UnknownMigrationVersionError(currentVersion);
    }
    // Rails' `migrations.index(current_migration)` is `Array#index`, i.e.
    // `MigrationProxy#==` — Struct value equality, not identity. Versions are
    // unique (`Migrator#validate`), so matching on version is that comparison.
    const migrations = migrator.migrations;
    const startIndex =
      currentVersion === 0
        ? 0
        : migrations.findIndex((m) => m.version === currentMigration!.version);
    const finish = migrations[startIndex + steps];
    const version = finish ? Number(finish.version) : 0;
    return direction === "up" ? this.up(version) : this.down(version);
  }
}

/**
 * Construction-time options. `direction` / `targetVersion` are the per-run
 * state Rails' `Migrator` holds as `@direction` / `@target_version`; a Migrator
 * built without them is the long-lived, MigrationContext-shaped instance
 * (Rails' `MigrationContext#open`).
 */
type MigratorOptions = {
  environment?: string;
  /**
   * Set to false when the db_config opts out of metadata storage
   * (Rails' `use_metadata_table: false`). environment stamping is a
   * no-op / raises in `environment:set` when this is false.
   */
  internalMetadataEnabled?: boolean;
  direction?: "up" | "down";
  targetVersion?: number | string | null;
};

export class Migrator {
  /** Mirrors: ActiveRecord::Migrator.migrations_paths (`migration.rb:1407`) */
  static migrationsPaths: string[] = [];

  static validateMigrationTimestamps = false;

  private _adapter: DatabaseAdapter;
  private _migrations: MigrationProxy[];
  private _schemaMigration: SchemaMigration;
  private _internalMetadata: InternalMetadata;
  private _environment: string;
  private readonly _options: MigratorOptions;
  private readonly _direction: "up" | "down";
  private readonly _targetVersion: number | string | null;
  private _migratedVersions?: Set<string>;

  constructor(
    adapter: DatabaseAdapter,
    migrations: MigrationProxy[],
    options: MigratorOptions = {},
  ) {
    this._options = options;
    this._direction = options.direction ?? "up";
    this._targetVersion = options.targetVersion ?? null;
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
    this.validate(migrations);
    const normalized = migrations.map((m) => ({
      ...m,
      version: String(BigInt(m.version)),
    }));
    this._migrations = this._sortMigrations(normalized);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#migrations */
  get migrations(): MigrationProxy[] {
    return this.isDown() ? [...this._migrations].reverse() : this._sortMigrations(this._migrations);
  }

  /**
   * Options for the per-run Migrator `run` / `up` / `down` each construct
   * (Rails' `Migrator.new(direction, migrations, schema_migration,
   * internal_metadata, target_version)`). The `new Migrator(...)` call itself
   * stays inline at all three sites, as Rails writes it.
   */
  private _runOptions(
    direction: "up" | "down",
    targetVersion: number | string | null,
  ): MigratorOptions {
    return { ...this._options, direction, targetVersion };
  }

  // Rails: MIGRATOR_SALT = 2053462845 (Zlib.crc32("googol"))
  private static readonly _MIGRATOR_SALT = 2053462845;

  /**
   * Wrap a block with an advisory lock to prevent concurrent migrations.
   * If the adapter doesn't support advisory locks, runs without locking.
   *
   * Once the lock is held, `loadMigrated` reloads schema_migrations to be sure
   * it wasn't changed by another process while we blocked (migration.rb:1601).
   * Rails' `Migrator` creates the bookkeeping tables in `initialize`; a
   * constructor cannot await, so they are ensured here before the reload can
   * query them.
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
    await this._ensureSchemaTable();
    await this.loadMigrated();
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
      released = await adapter.releaseAdvisoryLock(lockId);
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
   *
   * Dispatches to {@link up} / {@link down}, which each build the per-run
   * Migrator. A target equal to the current version goes to `up`, so an
   * unapplied migration below an already-applied target still runs. The target
   * is rejected up front because Ruby compares it against `current_version`
   * directly, while it may reach us as a string.
   */
  async migrate(
    targetVersion?: number | string | null,
    block?: (m: MigrationProxy) => boolean,
  ): Promise<MigrationProxy[]> {
    if (targetVersion === undefined || targetVersion === null) return this.up(null, block);

    if (this._invalidTarget(targetVersion)) {
      throw new UnknownMigrationVersionError(targetVersion);
    }

    const target = BigInt(targetVersion);
    const current = BigInt(await this.currentVersion());
    if (current === BigInt(0) && target === BigInt(0)) return [];
    if (current > target) return this.down(targetVersion, block);
    return this.up(targetVersion, block);
  }

  /**
   * The migration list handed to the per-run Migrator: Rails' `migrations` when
   * no block is given, `migrations.select(&block)` when one is.
   */
  private _selectedMigrations(block?: (m: MigrationProxy) => boolean): MigrationProxy[] {
    return block ? this._migrations.filter(block) : this._migrations;
  }

  /**
   * Rails builds a fresh `Migrator` for every `up` / `down` / `run`, so the
   * caller's own `@migrated_versions` memo can never go stale. Our `Migrator`
   * doubles as `MigrationContext` and is read again after delegating, so the
   * memo has to be dropped once a per-run migrator has changed
   * schema_migrations underneath it.
   */
  private _invalidateMigrated(): void {
    this._migratedVersions = undefined;
  }

  /**
   * Run all pending migrations up to the target version (or all if no target).
   *
   * Mirrors: ActiveRecord::Migrator.up
   *
   * @internal
   */
  async up(
    targetVersion?: number | string | null,
    block?: (m: MigrationProxy) => boolean,
  ): Promise<MigrationProxy[]> {
    const migrator = new Migrator(
      this._adapter,
      this._selectedMigrations(block),
      this._runOptions("up", targetVersion ?? null),
    );
    try {
      return await migrator._withAdvisoryLock(() => migrator.migrateWithoutLock());
    } finally {
      this._invalidateMigrated();
    }
  }

  /**
   * Revert all applied migrations down to the target version.
   *
   * Mirrors: ActiveRecord::Migrator.down
   *
   * @internal
   */
  async down(
    targetVersion?: number | string | null,
    block?: (m: MigrationProxy) => boolean,
  ): Promise<MigrationProxy[]> {
    const migrator = new Migrator(
      this._adapter,
      this._selectedMigrations(block),
      this._runOptions("down", targetVersion ?? null),
    );
    try {
      return await migrator._withAdvisoryLock(() => migrator.migrateWithoutLock());
    } finally {
      this._invalidateMigrated();
    }
  }

  /**
   * Rollback N migrations.
   *
   * Mirrors: ActiveRecord::Migrator#rollback
   */
  async rollback(steps: number = 1): Promise<MigrationProxy[]> {
    if (!Number.isInteger(steps) || steps < 0) {
      throw new Error(`Invalid steps: ${steps}. Must be a non-negative integer.`);
    }
    let rolledBack: MigrationProxy[] = [];
    await this._withAdvisoryLock(async () => {
      await this._ensureSchemaTable();
      const applied = await this.migrated();
      const appliedMigrations = this._migrations.filter((m) => applied.has(m.version)).reverse();
      const toRollback = appliedMigrations.slice(0, steps);

      for (const proxy of toRollback) {
        await this._runMigration(proxy, "down");
      }
      rolledBack = toRollback;
    });
    return rolledBack;
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
   * Reads the direction and target version this Migrator was constructed with,
   * as Rails does with `@direction` / `@target_version`.
   *
   * The already-applied guards replicate the skip logic in Rails'
   * `execute_migration_in_transaction` (migration.rb:1528-1530), which checks
   * `migrated.include?(migration.version)` before running. Our `_runMigration`
   * doesn't carry that check, so the guard lives here instead.
   */
  async runWithoutLock(): Promise<string | undefined> {
    // Rails' `Migrator#run` is only ever built with a target version; a nil one
    // finds no migration and raises, so mirror that rather than treating it as
    // "run everything".
    const targetVersion = this._targetVersion ?? "";
    await this._ensureSchemaTable();
    let key: string;
    try {
      key = String(BigInt(targetVersion));
    } catch {
      throw new UnknownMigrationVersionError(targetVersion);
    }
    const proxy = this._migrations.find((m) => m.version === key);
    if (!proxy) throw new UnknownMigrationVersionError(targetVersion);
    await this.recordEnvironment();
    const applied = await this.migrated();
    if (this.isUp() && applied.has(key)) return undefined;
    if (this.isDown() && !applied.has(key)) return undefined;
    await this._runMigration(proxy, this._direction);
    return proxy.version;
  }

  /** @internal Mirrors: ActiveRecord::Migrator#migrate_without_lock */
  async migrateWithoutLock(): Promise<MigrationProxy[]> {
    // isInvalidTarget() is only ever true for a non-null target version.
    if (this.isInvalidTarget()) {
      throw new UnknownMigrationVersionError(this._targetVersion ?? "");
    }
    await this._ensureSchemaTable();
    await this.recordEnvironment();
    const runnable = await this.runnable();
    for (const proxy of runnable) {
      await this.executeMigrationInTransaction(proxy);
    }
    return runnable;
  }

  /** @internal Mirrors: ActiveRecord::Migrator#up? */
  isUp(): boolean {
    return this._direction === "up";
  }

  /** @internal Mirrors: ActiveRecord::Migrator#down? */
  isDown(): boolean {
    return this._direction === "down";
  }

  /** @internal Mirrors: ActiveRecord::Migrator#record_environment */
  async recordEnvironment(): Promise<void> {
    if (this.isDown()) return;
    if (this._internalMetadata.enabled) {
      await this._internalMetadata.set("environment", this._recordedEnvironment());
    }
  }

  /**
   * The env name stamped into `ar_internal_metadata`. Rails writes
   * `connection.pool.db_config.env_name` straight through; a Migrator built on
   * a bare adapter carries a NullPool, whose config answers nil for every key
   * (Rails' `NullConfig#method_missing`), so fall back to the env name the
   * Migrator resolved at construction rather than stamping undefined.
   */
  private _recordedEnvironment(): string {
    const pool = this.connection.pool as { dbConfig?: { envName?: string } } | null;
    return pool?.dbConfig?.envName ?? this._environment;
  }

  /**
   * @internal Mirrors: ActiveRecord::Migrator#connection — Rails reaches for
   * `DatabaseTasks.migration_connection`; trails takes the adapter as a
   * constructor argument, so this exposes it under Rails' name.
   */
  private get connection(): DatabaseAdapter {
    return this._adapter;
  }

  /** @internal Mirrors: ActiveRecord::Migrator#ran? */
  async isRan(proxy: MigrationProxy): Promise<boolean> {
    const applied = await this.migrated();
    return applied.has(proxy.version);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#invalid_target? */
  isInvalidTarget(): boolean {
    if (this._targetVersion === null) return false;
    return this._invalidTarget(this._targetVersion);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#execute_migration_in_transaction */
  async executeMigrationInTransaction(proxy: MigrationProxy): Promise<void> {
    await this._runMigration(proxy, this._direction);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#target */
  private target(): MigrationProxy | undefined {
    if (this._targetVersion === null) return undefined;
    let key: string;
    try {
      key = String(BigInt(this._targetVersion));
    } catch {
      return undefined;
    }
    return this.migrations.find((m) => m.version === key);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#finish */
  private finish(): number {
    const migrations = this.migrations;
    const target = this.target();
    const index = target ? migrations.findIndex((m) => m.version === target.version) : -1;
    return index === -1 ? migrations.length - 1 : index;
  }

  /** @internal Mirrors: ActiveRecord::Migrator#start */
  private async start(): Promise<number> {
    if (this.isUp()) return 0;
    const current = await this.current();
    const index = current ? this.migrations.findIndex((m) => m.version === current.version) : -1;
    return index === -1 ? 0 : index;
  }

  /** @internal Mirrors: ActiveRecord::Migrator#record_version_state_after_migrating */
  async recordVersionStateAfterMigrating(
    version: string,
    direction: "up" | "down" = "up",
  ): Promise<void> {
    const migrated = await this.migrated();
    if (direction === "up") {
      migrated.add(version);
      await this._schemaMigration.recordVersion(version);
    } else {
      migrated.delete(version);
      await this._schemaMigration.deleteVersion(version);
    }
  }

  /** @internal Mirrors: ActiveRecord::Migrator#ddl_transaction */
  async ddlTransaction(migration: Migration, fn: () => Promise<void>): Promise<void> {
    return this._ddlTransaction(migration, fn);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#use_transaction? */
  isUseTransaction(migration: Migration): boolean {
    return this._useTransaction(migration);
  }

  /**
   * @internal Mirrors: ActiveRecord::Migrator#use_advisory_lock?
   *
   * Rails gates solely on `connection.advisory_locks_enabled?`
   * (`supports_advisory_locks? && @advisory_locks_enabled`), mirrored here by
   * `isAdvisoryLocksEnabled()`. The `currentDatabase` requirement is enforced at
   * the point it's actually needed — `_withAdvisoryLock` /
   * `generateMigratorAdvisoryLockId`, which throw if an advisory-lock-capable
   * adapter can't supply the DB name — rather than silently skipping the lock
   * here (which Rails never does).
   */
  isUseAdvisoryLock(): boolean {
    return !!this._adapter.isAdvisoryLocksEnabled?.();
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
    return this.migrations.filter((m) => !applied.has(m.version));
  }

  /**
   * Get pending (unapplied) migrations.
   *
   * Mirrors: ActiveRecord::Migrator#pending_migrations
   */
  async pendingMigrations(): Promise<MigrationProxy[]> {
    await this._ensureSchemaTable();
    const applied = await this.migrated();
    return this.migrations.filter((m) => !applied.has(m.version));
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
    // Mirrors Rails: db_list uses schema_migration.normalized_versions and file
    // versions go through schema_migration.normalize_migration_number before
    // matching (migration.rb:1319-1328 / schema_migration.rb:69-70).
    const applied = new Set(
      [...(await this._appliedVersions())].map((v) => SchemaMigration.normalizeMigrationNumber(v)),
    );

    const fileList = this._migrations.map((m) => {
      const normV = SchemaMigration.normalizeMigrationNumber(m.version);
      const isUp = applied.delete(normV);
      return {
        status: (isUp ? "up" : "down") as "up" | "down", // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
        version: normV,
        // Mirrors Rails: `(name + scope).humanize` — the snake-case filename
        // part concatenated with the scope suffix, humanized (migration.rb:1330).
        // Our proxy carries the camelized class name, so underscore it back
        // before appending the (already snake-case) scope and humanizing.
        name: humanize(underscore(m.name) + (m.scope ?? "")),
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
    // than raising.
    return [...dbList, ...fileList].sort((a, b) => {
      const va = toInteger(a.version);
      const vb = toInteger(b.version);
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
  }

  private _sortMigrations(migrations: MigrationProxy[]): MigrationProxy[] {
    return [...migrations].sort(byVersion);
  }

  /** @internal */
  private validate(migrations: MigrationProxy[]): void {
    // Rails' Migrator#validate checks duplicate names before touching
    // versions, and tolerates a nil version. Mirror that ordering so a list of
    // same-name, version-less migrations raises DuplicateMigrationNameError
    // rather than being rejected for a missing version.
    //
    // Rails uses `group_by(&:name).find { |_, v| v.length > 1 }`, which reports
    // the first *name* in first-occurrence order that has any duplicate — not
    // the name whose repeat appears earliest. Count first, then walk the list
    // in order to find the first duplicated name/version, to match that.
    const nameCounts = new Map<string, number>();
    for (const m of migrations) {
      nameCounts.set(m.name, (nameCounts.get(m.name) ?? 0) + 1);
    }
    for (const m of migrations) {
      if (nameCounts.get(m.name)! > 1) {
        throw new DuplicateMigrationNameError(m.name);
      }
    }

    const versionCounts = new Map<string, number>();
    for (const m of migrations) {
      const normalized = String(BigInt(m.version));
      versionCounts.set(normalized, (versionCounts.get(normalized) ?? 0) + 1);
    }
    for (const m of migrations) {
      if (versionCounts.get(String(BigInt(m.version)))! > 1) {
        throw new DuplicateMigrationVersionError(m.version);
      }
    }
  }

  private _schemaTablesEnsured?: Promise<void>;

  /**
   * Deliberate stand-in for Rails' constructor-time creation: `initialize`
   * creates both bookkeeping tables as its last act (migration.rb:1429-1430),
   * so everything downstream may assume they exist. `createTable` is async and
   * a constructor cannot await, so the creation is memoized here and awaited at
   * the entry points instead — still exactly once per Migrator, and a failure
   * stays terminal the way a raise from `initialize` would.
   */
  private _ensureSchemaTable(): Promise<void> {
    return (this._schemaTablesEnsured ??= (async () => {
      await this._schemaMigration.createTable();
      await this._internalMetadata.createTable();
    })());
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

  /**
   * Mirrors Rails' `Migrator#invalid_target?`: a target version is invalid when
   * it is given, is not 0, and does not correspond to any known migration.
   */
  private _invalidTarget(targetVersion: number | string): boolean {
    let key: string;
    try {
      key = String(BigInt(targetVersion));
    } catch {
      return true;
    }
    if (key === "0") return false;
    return !this._migrations.some((m) => m.version === key);
  }

  /**
   * Run exactly one migration (identified by `targetVersion`) in the given
   * direction. Used by the `db:migrate:up` / `db:migrate:down` CLI paths
   * where the user supplies a specific VERSION.
   *
   * Mirrors: ActiveRecord::MigrationContext#run (which builds a Migrator
   * scoped to `target_version` and calls `#run`).
   */
  async run(direction: "up" | "down", targetVersion: number | string): Promise<string | undefined> {
    const migrator = new Migrator(
      this._adapter,
      this._migrations,
      this._runOptions(direction, targetVersion),
    );
    try {
      return await migrator._withAdvisoryLock(() => migrator.runWithoutLock());
    } finally {
      this._invalidateMigrated();
    }
  }

  private async _runMigration(proxy: MigrationProxy, direction: "up" | "down"): Promise<void> {
    let migration: Migration | undefined;
    // Rails wraps both the migration execution AND the version
    // stamping inside the same ddl_transaction so they commit/rollback
    // atomically. Without this, a committed migration + failed stamp
    // would leave schema_migrations out of sync.
    try {
      const loaded = (migration = await proxy.migration());
      loaded.connection = this._adapter;
      await this._ddlTransaction(loaded, async () => {
        await loaded.migrate(direction);
        await this.recordVersionStateAfterMigrating(proxy.version, direction);
        if (direction === "up" && this._internalMetadata.enabled) {
          await this._internalMetadata.set("environment", this._recordedEnvironment());
        }
      });
    } catch (e) {
      // Mirrors: ActiveRecord::Migrator#execute_migration_in_transaction rescue block
      // Rails re-resolves the proxy here (`migration.rb:1540` → `use_transaction?`
      // → `MigrationProxy#disable_ddl_transaction`), so a migration that failed to
      // load raises again from inside the rescue and escapes unwrapped.
      const useTx = this._useTransaction(migration ?? (await proxy.migration()));
      // Ruby's `#{e}` interpolates Exception#to_s — the bare message, without
      // the `Error: ` prefix JS String(e) would add.
      const msg = `An error has occurred, ${useTx ? "this and " : ""}all later migrations canceled:\n\n${e instanceof Error ? e.message : e}`;
      throw Object.assign(new Error(msg), { cause: e });
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
  private async _ddlTransaction(migration: Migration, fn: () => Promise<void>): Promise<void> {
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
  private _useTransaction(migration: Migration): boolean {
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

  /**
   * @internal The shared helper of {@link checkEnvironment} and
   * {@link checkProtectedEnvironments}, which are `Tasks::DatabaseTasks`
   * methods (`database_tasks.rb:635-650`) that trails parked on `Migrator` —
   * a separate deviation from the one RFC 0051 is closing here, with its own
   * tests. `MigrationContext` owns the Rails-sited copy
   * (`migration.rb:1348-1357`).
   */
  async lastStoredEnvironment(): Promise<string | null> {
    // When metadata storage is explicitly opted out (`use_metadata_table:
    // false`), treat the DB as unstamped even if a stale
    // ar_internal_metadata table exists from a previous run — Rails'
    // MigrationContext#last_stored_environment short-circuits on
    // `internal_metadata.enabled?` before the table_exists? read.
    if (!this._internalMetadata.enabled) return null;
    if ((await this.currentVersionReadOnly()) === 0) return null;
    const noEnvMsg =
      "Environment data not found in the schema. To resolve this issue, run: bin/rails db:environment:set";
    if (!(await this._internalMetadata.tableExists())) {
      throw new NoEnvironmentInSchemaError(noEnvMsg);
    }
    const environment = await this._internalMetadata.get("environment");
    if (!environment) {
      throw new NoEnvironmentInSchemaError(noEnvMsg);
    }
    return environment;
  }

  /** @internal Mirrors: ActiveRecord::Migrator#current_migration (`migration.rb:1439-1441`) */
  async currentMigration(): Promise<MigrationProxy | null> {
    const version = await this.currentVersion();
    if (version === 0) return null;
    const versionStr = String(version);
    return this._migrations.find((m) => m.version === versionStr) ?? null;
  }

  /** @internal Mirrors: ActiveRecord::Migrator `alias :current :current_migration` (`migration.rb:1442`) */
  async current(): Promise<MigrationProxy | null> {
    return this.currentMigration();
  }

  /** @internal Mirrors: ActiveRecord::Migrator#runnable */
  async runnable(): Promise<MigrationProxy[]> {
    const runnable = this.migrations.slice(await this.start(), this.finish() + 1);
    const kept: MigrationProxy[] = [];
    if (this.isUp()) {
      for (const m of runnable) {
        if (!(await this.isRan(m))) kept.push(m);
      }
      return kept;
    }
    if (this.target()) runnable.pop();
    for (const m of runnable) {
      if (await this.isRan(m)) kept.push(m);
    }
    return kept;
  }

  async migrated(): Promise<Set<string>> {
    return this._migratedVersions ?? this.loadMigrated();
  }

  /**
   * Rails' `initialize` creates both bookkeeping tables (`migration.rb:1429-1430`)
   * before anything can read `migrated`, so `load_migrated` may assume
   * schema_migrations exists. `_ensureSchemaTable` is trails' async stand-in for
   * that constructor step (a constructor cannot await), so every entry point
   * that reads versions has to await it — not just `pendingMigrations`.
   */
  async loadMigrated(): Promise<Set<string>> {
    await this._ensureSchemaTable();
    return (this._migratedVersions = await this._appliedVersions());
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
      await this._migrator.loadMigrated();
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
