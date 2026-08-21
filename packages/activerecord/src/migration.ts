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
import { Temporal } from "@blazetrails/date";
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
  type IndexDefinition,
} from "./connection-adapters/abstract/schema-definitions.js";
import {
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
import { SchemaMigration, NullSchemaMigration } from "./schema-migration.js";
import { InternalMetadata, NullInternalMetadata } from "./internal-metadata.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import type { DatabaseConfig } from "./database-configurations/database-config.js";
import { migrationArConfig } from "./migration/ar-config-source.js";
import type { SchemaFormat } from "./tasks/database-tasks.js";
import type { ExecutionStrategy } from "./migration/execution-strategy.js";
import { PendingMigrationConnection } from "./migration/pending-migration-connection.js";
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
import type { Base } from "./base.js";

/** The one `Base` member `execute_migration_in_transaction` names. */
type BaseWithLogger = Pick<typeof Base, "logger">;

let _base: BaseWithLogger | undefined;

/**
 * @internal Receives `ActiveRecord::Base` at module init, as
 * `schema-migration.ts`'s `_registerBase` does. Rails resolves the `Base`
 * constant inside `execute_migration_in_transaction` at call time via autoload
 * (`migration.rb:1532`), so base.rb is not required there; in ESM a value
 * import of `base.js` would be a load-time edge into an import cycle.
 */
export function _registerBase(base: BaseWithLogger): void {
  _base = base;
}

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
function crc32(str: string): number {
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
  /**
   * Mirrors: `PendingMigrationError#initialize` (`migration.rb:159-165`).
   *
   * Ruby's `initialize(message = nil, pending_migrations: nil)` lets a caller
   * pass the kwarg on its own; TypeScript has no kwargs, so the options hash is
   * accepted in the first parameter's place — the union-typed first parameter
   * with runtime dispatch that `ConnectionNotEstablished` (`errors.ts`) already
   * uses for Ruby's `Exception.new(any_object)`. Passing `undefined` positionally
   * instead would put an argument in the call that Rails' call sites
   * (`migration.rb:722,743`) do not pass.
   *
   * The one arm that cannot converge is Rails' nil default (`migration.rb:161`),
   * which reads `connection_pool.migration_context.open.pending_migrations` —
   * asynchronous in trails, and a JS constructor cannot await. Raise sites
   * resolve the list first, as `check_pending_migrations` and
   * `check_all_pending!` already do (`migration.rb:722,743`); reaching the arm
   * anyway raises rather than inventing a message Rails never produces.
   */
  constructor(
    message?: string | { pendingMigrations?: MigrationProxy[] },
    options: { pendingMigrations?: MigrationProxy[] } = {},
  ) {
    const { pendingMigrations } =
      message != null && typeof message === "object" ? message : options;
    if (typeof message !== "string") {
      if (pendingMigrations == null) {
        throw new ArgumentError(
          "PendingMigrationError needs a message or `pendingMigrations:`; Rails reads the list " +
            "itself (migration.rb:161), which is asynchronous here and cannot run in a constructor.",
        );
      }
      // `detailedMigrationMessage` reads no instance state, and `super` has to
      // run before `this` exists.
      super(PendingMigrationError.prototype.detailedMigrationMessage(pendingMigrations));
    } else {
      super(message);
    }
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
  constructor({ current, stored }: { current?: string; stored?: string } = {}) {
    let msg = `You are attempting to modify a database that was last run in \`${stored ?? ""}\` environment.\n`;
    msg += `You are running in \`${current ?? ""}\` environment. `;
    msg += `If you are sure you want to continue, first set the environment using:\n\n`;
    msg += `        trails db environment:set`;
    super(`${msg}\n\n`);
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
 * @internal Storage for the blocks `up`/`down` selected, drained by
 * `Migration#reversible`. Rails' Struct has no such field: Ruby's `up`/`down`
 * run their block inline (`yield unless reverting`), but a trails callback is
 * async while the registering block is not, so the selected blocks are
 * collected here and awaited after the block returns. The key is a
 * module-private Symbol so the field is not part of the class' surface.
 */
const toRun = Symbol("toRun");

/**
 * Mirrors: ActiveRecord::Migration::ReversibleBlockHelper (migration.rb:873-880),
 * `Struct.new(:reverting)` with `up` (`yield unless reverting`) and `down`
 * (`yield if reverting`).
 */
export class ReversibleBlockHelper {
  /** @internal */
  [toRun]: Array<() => Promise<void>> = [];

  constructor(public reverting: boolean) {}

  /** @internal */
  up(fn: () => Promise<void>): void {
    if (!this.reverting) this[toRun].push(fn);
  }

  /** @internal */
  down(fn: () => Promise<void>): void {
    if (this.reverting) this[toRun].push(fn);
  }
}

/**
 * Migration — base class for database migrations.
 *
 * Mirrors: ActiveRecord::Migration
 */
export class Migration {
  /** @internal Per-migration connection override — mirrors Rails' @connection ivar. */
  protected _connectionOverride?: DatabaseAdapter;
  /** @internal Per-migration pool override — mirrors Rails' @pool ivar. */
  protected _poolOverride?: ConnectionPool;
  private _executionStrategy?: ExecutionStrategy;
  private _recording = false;
  private _recorder = new CommandRecorder();
  private _name?: string;
  /**
   * The migration instance class-level schema operations route through
   * (mirrors Rails `class << self; attr_accessor :delegate`, `migration.rb:684`).
   * Seeded with `Migration.delegate = new Migration()` at the bottom of this
   * file, exactly as Rails does at `migration.rb:813`.
   * Rails defines `delegate` and `nearest_delegate` only inside `class << self`
   * (`migration.rb:684-689`); the instance side reaches the adapter through
   * `connection` (`migration.rb:1006-1012`), never through a delegate reader.
   * @internal
   */
  static delegate: Migration | null = null;
  private _version?: number;

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
  protected get _adapterName(): "sqlite" | "postgres" | "mysql2" {
    return this.connection.adapterName as "sqlite" | "postgres" | "mysql2";
  }

  /**
   * Mirrors: ActiveRecord::Migration#initialize
   */
  constructor(name?: string, version?: number) {
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
      const prev = Migration.delegate;
      Migration.delegate = this;
      try {
        await fn.call(ctor);
      } finally {
        Migration.delegate = prev;
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

  // -- Schema operations (delegated to the connection adapter) --
  // Migration records operations for reversibility, then delegates
  // actual SQL execution to this.connection. In Rails, these methods
  // live on the connection adapter via
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
    await this.connection.createTable(tname, optionsOrFn, fn);
  }

  async dropTable(
    ...args: Array<
      | string
      | { ifExists?: boolean; force?: boolean | "cascade"; temporary?: boolean }
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
      ? (last as { ifExists?: boolean; force?: boolean | "cascade"; temporary?: boolean })
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
      await this.connection.dropTable(...tnames, options);
    } else {
      await this.connection.dropTable(...tnames);
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
    await this.connection.addColumn(tableName, columnName, type, options);
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
    await this.connection.removeColumn(tableName, columnName, type, opts);
  }

  async renameColumn(tableName: string, oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recorder.record("renameColumn", [tableName, oldName, newName]);
      return;
    }
    tableName = this._pt(tableName);
    await this.connection.renameColumn(tableName, oldName, newName);
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
    await this.connection.addIndex(tableName, columns, options);
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
    await this.connection.removeIndex(tableName, columnOrOptions, options);
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
    await this.connection.changeColumn(tableName, columnName, type, options);
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recorder.record("renameTable", [oldName, newName]);
      return;
    }
    oldName = this._pt(oldName);
    newName = this._pt(newName);
    await this.connection.renameTable(oldName, newName);
  }

  async tableExists(tableName: string): Promise<boolean> {
    return this.connection.tableExists(this._pt(tableName));
  }

  async columnExists(
    tableName: string,
    columnName: string,
    type?: string | null,
    options?: ColumnExistsOptions,
  ): Promise<boolean> {
    return this.connection.columnExists(this._pt(tableName), columnName, type, options);
  }

  async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    if (this._recording) {
      this._recorder.record("changeColumnDefault", [tableName, columnName, defaultOrChanges]);
      return;
    }
    tableName = this._pt(tableName);
    await this.connection.changeColumnDefault(tableName, columnName, defaultOrChanges);
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
    await this.connection.changeColumnNull(tableName, columnName, allowNull, defaultValue);
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
    await this.connection.addReference(tableName, refName, options);
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
    await this.connection.removeReference(tableName, refName, options);
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
    await this.connection.addForeignKey(fromTable, toTable, options);
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
    await this.connection.removeForeignKey(fromTable, toTableOrOptions, options);
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
    await this.connection.addCheckConstraint(tableName, expression, options);
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
    await this.connection.removeCheckConstraint(tableName, expressionOrOptions, options);
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

  async disableExtension(name: string, options?: { force?: "cascade" }): Promise<void> {
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
    await this.connection.addTimestamps(tableName, options);
  }

  async removeTimestamps(tableName: string): Promise<void> {
    if (this._recording) {
      this._recorder.record("removeTimestamps", [tableName]);
      return;
    }
    tableName = this._pt(tableName);
    await this.connection.removeTimestamps(tableName);
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
    await this.connection.createJoinTable(table1, table2, options, fn);
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
    await this.connection.dropJoinTable(table1, table2, options);
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
      await this.connection.changeTable(tname, options, callback);
      return;
    }
    const table = this.connection.updateTableDefinition(tableName, this);
    if (callback) await callback(table);
  }

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recorder.record("renameIndex", [tableName, oldName, newName]);
      return;
    }
    tableName = this._pt(tableName);
    await this.connection.renameIndex(tableName, oldName, newName);
  }

  indexName(
    tableName: string,
    options: { column?: string | string[]; name?: string; _usesLegacyIndexName?: boolean },
  ): string {
    return this.connection.indexName(this._pt(tableName), options);
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
    return this.connection.columns(this._pt(tableName));
  }

  async indexes(tableName: string): Promise<IndexDefinition[]> {
    return this.connection.indexes(this._pt(tableName));
  }

  async primaryKey(tableName: string): Promise<string | string[] | null> {
    return this.connection.primaryKey(this._pt(tableName));
  }

  async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    return this.connection.foreignKeys(this._pt(tableName));
  }

  async tables(): Promise<string[]> {
    return this.connection.tables();
  }

  async views(): Promise<string[]> {
    return this.connection.views();
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
      await this.run(migrationOrFn, { revert: true });
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
   * Runs the given migration classes.
   *
   * Last argument can specify options:
   * - `direction` - Default is `up`.
   * - `revert` - Default is `false`.
   *
   * Mirrors: ActiveRecord::Migration#run (`migration.rb:937-949`) — when the
   * current migration is itself reverting, running a sub-migration `up` means
   * executing it `down` without reverting, so it wraps the call in a nested
   * `revert`.
   */
  async run(
    migration: Migration,
    opts: { direction?: "up" | "down"; revert?: boolean } = {},
  ): Promise<void> {
    let dir = opts.direction ?? "up";
    if (opts.revert) dir = dir === "down" ? "up" : "down";
    if (this.isReverting()) {
      await this.revert(async () => {
        await this.run(migration, { direction: dir, revert: true });
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
   * Mirrors: ActiveRecord::Migration#reversible (migration.rb:909-912),
   * `helper = ReversibleBlockHelper.new(reverting?)` then
   * `execute_block { yield helper }`. The helper runs each `up`/`down` block
   * inline as Ruby yields; the callbacks here are async and the block that
   * registers them is not, so they are collected on the helper and awaited on
   * the way out of the same `execute_block`. The whole invocation of `fn` —
   * not just the selected callbacks — happens inside `execute_block`, so a
   * recording pass defers the block's own statements to `replay` as Ruby's
   * `yield helper` does (`migration/command_recorder.rb:148-152`).
   */
  async reversible(fn?: (dir: ReversibleBlockHelper) => void): Promise<void> {
    if (!fn) return;
    const helper = new ReversibleBlockHelper(this.isReverting());
    await this.executeBlock(async () => {
      fn(helper);
      for (const f of helper[toRun]) await f();
    });
  }

  /**
   * Run code only in the up direction.
   *
   * Mirrors: ActiveRecord::Migration#up_only (migration.rb:928-930),
   * `execute_block(&block) unless reverting?`.
   */
  async upOnly(fn?: () => Promise<void>): Promise<void> {
    if (!this.isReverting() && fn) {
      await this.executeBlock(fn);
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
    return this.connection.viewExists(viewName);
  }

  async indexExists(
    tableName: string,
    columnName: string | string[],
    options?: { unique?: boolean; name?: string; valid?: boolean },
  ): Promise<boolean> {
    return this.connection.indexExists(this._pt(tableName), columnName, options);
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
   * Get the migration version. Rails initializes `@version` to nil
   * (`migration.rb:799`) — only `@name` defaults to the class name — so an
   * unversioned migration has no version.
   */
  get version(): number | undefined {
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
    // Rails: `@connection || DatabaseTasks.migration_connection`
    // (`migration.rb:1036-1038`). `DatabaseTasks` is reached through the
    // call-time config source rather than an import: naming
    // `tasks/database-tasks.js` here would be a load-time edge back into a
    // module that already imports this one.
    return this._connectionOverride ?? migrationArConfig()!.databaseTasks().migrationConnection();
  }

  set connection(conn: DatabaseAdapter | undefined) {
    this._connectionOverride = conn;
  }

  /**
   * Mirrors: ActiveRecord::Migration#connection_pool (`migration.rb:1040-1042`).
   * `DatabaseTasks` is reached through the call-time config source for the same
   * reason `Migrator#connection` does — naming `tasks/database-tasks.js` here
   * would be a load-time edge back into a module that already imports this one.
   */
  get connectionPool(): ConnectionPool {
    return this._poolOverride ?? migrationArConfig()!.databaseTasks().migrationConnectionPool();
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

  // --- Class methods (Rails: Migration.copy, .proper_table_name, etc.) ---

  /**
   * `MigrationFilenameRegexp` (`migration.rb:637`). Rails' migrations end in
   * `.rb`; trails' end in `.ts`/`.js`.
   */
  static readonly MigrationFilenameRegexp = /^([0-9]+)_([_a-z0-9]*)\.?([_a-z0-9]*)?\.(?:ts|js)$/;

  static isValidVersionFormat(version: string): boolean {
    return [
      Migration.MigrationFilenameRegexp,
      /^\d(_?\d)*$/, // integer with optional underscores
    ].some((pattern) => pattern.test(version));
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
      tableNamePrefix: migrationArConfig()!.tableNamePrefix,
      tableNameSuffix: migrationArConfig()!.tableNameSuffix,
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

    const schemaMigration = new NullSchemaMigration();
    const internalMetadata = new NullInternalMetadata();

    const destinationMigrations = new MigrationContext(
      [destination],
      schemaMigration,
      internalMetadata,
    ).migrations;
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
      const sourceMigrations = new MigrationContext([sourcePath], schemaMigration, internalMetadata)
        .migrations;

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

        const nextNumber = last ? last.version + 1 : 0;
        const newVersion = toInteger(Migration.nextMigrationNumber(nextNumber));
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
        let loaded: Promise<Migration> | undefined;
        const copy: MigrationProxy = {
          name: source.name,
          version: newVersion,
          scope,
          filename: newPath,
          migration: async () => {
            loaded ??= (async () => {
              const { pathToFileURL } = await import("node:url");
              const mod = (await import(pathToFileURL(newPath).href)) as Record<string, unknown>;
              return loadMigrationFrom(mod, proxyName, newVersion);
            })();
            return loaded;
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

  /** @internal Mirrors: `ActiveRecord::Migration.check_pending_migrations` (`migration.rb:739-746`) */
  static async checkPendingMigrations(): Promise<void> {
    const migrations = await this.pendingMigrations();

    if (migrations.length > 0) {
      throw new PendingMigrationError({ pendingMigrations: migrations });
    }
  }

  /**
   * Mirrors: `ActiveRecord::Migration.check_all_pending!` (`migration.rb:714-728`).
   *
   * Raises {@link PendingMigrationError} if any migrations are pending for all
   * database configurations in an environment.
   */
  static async checkAllPendingBang(): Promise<void> {
    const pendingMigrations: MigrationProxy[][] = [];

    await migrationArConfig()!
      .databaseTasks()
      .withTemporaryPoolForEach({ env: this.env() }, async (pool) => {
        const pending = await pool.migrationContext.open().pendingMigrations();
        if (pending != null) pendingMigrations.push(pending);
      });

    const migrations = pendingMigrations.flat();

    if (migrations.length > 0) {
      throw new PendingMigrationError({ pendingMigrations: migrations });
    }
  }

  /** Mirrors: `ActiveRecord::Migration.load_schema_if_pending!` (`migration.rb:730-736`). */
  static async loadSchemaIfPendingBang(): Promise<void> {
    if (await this.anySchemaNeedsUpdate()) {
      await this.loadSchemaBang();
    }

    await this.checkPendingMigrations();
  }

  static async maintainTestSchemaBang(): Promise<void> {
    if (ActiveRecord.maintainTestSchema) {
      // Rails writes `suppress_messages { load_schema_if_pending! }`
      // (migration.rb:719); the bare class-level call lands in
      // `method_missing` (migration.rb:723-725), which forwards to
      // `nearest_delegate`. TS has no static `method_missing`, so the
      // forwarding Ruby does implicitly is spelled out here.
      await this.nearestDelegate?.suppressMessages(async () => {
        await this.loadSchemaIfPendingBang();
      });
    }
  }

  /** @internal */
  static get nearestDelegate(): Migration | null {
    return (
      this.delegate ?? (Object.getPrototypeOf(this) as typeof Migration).nearestDelegate ?? null
    );
  }

  /** @internal */
  static methodMissing(name: string, ...args: unknown[]): unknown {
    const delegate = this.nearestDelegate as unknown as Record<string, unknown> | null;
    if (delegate !== null && typeof delegate[name] === "function") {
      return (delegate[name] as (...a: unknown[]) => unknown).apply(delegate, args);
    }
    throw new TypeError(`undefined method '${name}' for ${this.name}`);
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

  /**
   * Mirrors: ActiveRecord::Migration#execute_block (migration.rb:1146-1152).
   *
   *   def execute_block
   *     if connection.respond_to? :execute_block
   *       super # use normal delegation to record the block
   *     else
   *       yield
   *     end
   *   end
   *
   * Ruby's `super` has no super-definition, so it falls through to
   * `method_missing`, which delegates to the connection — the CommandRecorder
   * while reverting, which records the block for inversion
   * (command_recorder.rb:52).
   *
   * @internal
   */
  async executeBlock(fn: () => Promise<void>): Promise<void> {
    const connection = this.connection as unknown as Record<string, unknown>;
    if (typeof connection["executeBlock"] === "function") {
      await this.methodMissing("executeBlock", fn);
      return;
    }
    await fn();
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

  /**
   * @internal Mirrors: `ActiveRecord::Migration.any_schema_needs_update?`
   * (`migration.rb:747-751`). Rails reads `ActiveRecord.schema_format`; trails
   * keeps that setting on `DatabaseTasks` (it is also `schemaUpToDate`'s default).
   */
  private static async anySchemaNeedsUpdate(): Promise<boolean> {
    const databaseTasks = migrationArConfig()!.databaseTasks();

    for (const dbConfig of this.dbConfigsInCurrentEnv()) {
      if (!(await databaseTasks.schemaUpToDate(dbConfig, databaseTasks.schemaFormat))) return true;
    }
    return false;
  }

  /** @internal Mirrors: `ActiveRecord::Migration.pending_migrations` (`migration.rb:757-769`) */
  private static async pendingMigrations(): Promise<MigrationProxy[]> {
    const pendingMigrations: MigrationProxy[][] = [];

    for (const dbConfig of this.dbConfigsInCurrentEnv()) {
      await PendingMigrationConnection.withTemporaryPool(dbConfig, async (pool) => {
        const pending = await pool.migrationContext.open().pendingMigrations();
        if (pending != null) pendingMigrations.push(pending);
      });
    }

    return pendingMigrations.flat();
  }

  /** @internal Mirrors: `ActiveRecord::Migration.db_configs_in_current_env` (`migration.rb:753-755`) */
  private static dbConfigsInCurrentEnv(): DatabaseConfig[] {
    return migrationArConfig()!.configurations().configsFor({ envName: this.env() });
  }

  /** @internal */
  static env(): string {
    return getEnv("TRAILS_ENV") ?? getEnv("NODE_ENV") ?? "development";
  }

  /**
   * @internal Mirrors: `ActiveRecord::Migration.load_schema!` (`migration.rb:775-783`).
   *
   * Rails roundtrips to Rake — `FileUtils.cd(root) { clear_all_connections!; system("bin/rails
   * db:test:prepare") }` — so plugins can hook into database initialization. trails has no
   * process surface to shell to, so it calls what that Rake task reaches directly.
   * `db:test:prepare` invokes `db:test:load_schema` (`databases.rake:531-539`), which
   * depends on `db:test:purge` (`:541-545`) — so every test config is purged by a direct
   * `configs_for(env_name: "test")` loop with no pool open, and only then does
   * `load_schema` open a temporary pool per config. Both phases are kept, in that order:
   * the purge must not run behind an established connection to a database it is about
   * to recreate. `ENV["SCHEMA_FORMAT"]` overrides the configured format there
   * (`:537`), so it does here; trails keeps that setting on `DatabaseTasks`.
   *
   * `ActiveRecord::Schema.verbose = false` (`:534`) silences the load; `Schema`
   * inherits `Migration`'s `verbose` cattr, so the assignment writes the same
   * state. The constant is reached through a call-time `await import` rather
   * than a module-scope one because `schema.ts` is `class Schema extends
   * Current`: a value import would close a cycle through this file and evaluate
   * `Schema` with `Current` in TDZ. Ruby resolves it when the task runs, which
   * is where the dynamic import resolves it too.
   */
  private static async loadSchemaBang(): Promise<void> {
    const databaseTasks = migrationArConfig()!.databaseTasks();

    await migrationArConfig()!.connectionHandler().clearAllConnectionsBang("all");

    const testConfigs = migrationArConfig()!.configurations().configsFor({ envName: "test" });
    for (const dbConfig of testConfigs) {
      await databaseTasks.purge(dbConfig);
    }

    const { Schema } = await import("./schema.js");
    await databaseTasks.withTemporaryPoolForEach({ env: "test" }, async (pool) => {
      const dbConfig = pool.dbConfig;
      Schema.verbose = false;
      // `databases.rake:537` — `DatabaseTasks.schemaFormat` is the trails home
      // of Rails' global `ActiveRecord.schema_format`.
      const schemaFormat = (getEnv("SCHEMA_FORMAT") ?? databaseTasks.schemaFormat) as SchemaFormat;
      await databaseTasks.loadSchema(dbConfig, schemaFormat);
    });
  }
}

// === Migrator (Rails defines this in migration.rb) ===

export interface MigrationProxy {
  version: number;
  name: string;
  filename?: string;
  /** Mirrors: ActiveRecord::MigrationProxy#scope — engine name for copied engine migrations */
  scope?: string;
  /**
   * Mirrors: ActiveRecord::MigrationProxy#migration — `@migration ||=
   * load_migration` (`migration.rb:1190-1192`). Memoized by the implementer, so
   * every member Rails delegates through the proxy sees the same instance.
   */
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
  version: number,
): Promise<Migration> {
  const exported = mod[name];
  if (typeof exported === "function") {
    return new (exported as new (name?: string, version?: number) => Migration)(name, version);
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
 * rather than raising. A migration version is a 14-digit timestamp at most, so
 * it is exactly representable as a JS number.
 */
function toInteger(value: string): number {
  const match = value.match(/^\s*(-?\d+)/);
  if (!match) return 0;
  return Number(match[1]);
}

function byVersion(a: MigrationProxy, b: MigrationProxy): number {
  return a.version - b.version;
}

/**
 * The `schema_migration` / `internal_metadata` arguments of
 * `MigrationContext#initialize` (`migration.rb:1214`), whose Ruby defaults are
 * `nil`. Both may be omitted — but only while the context's collaborators are
 * still the real ones, so `MigrationContext#initialize`'s
 * `schema_migration || SchemaMigration.new(connection_pool)` fallback
 * (`migration.rb:1215-1216`) cannot be reached by a context typed for the null
 * objects `Migration.copy` seats (`migration.rb:1065-1066`).
 * @internal
 */
type SeatedCollaborators<S, I> = [S] extends [SchemaMigration]
  ? [I] extends [InternalMetadata]
    ? [] | [schemaMigration: S] | [schemaMigration: S, internalMetadata: I]
    : [schemaMigration: S, internalMetadata: I]
  : [I] extends [InternalMetadata]
    ? [schemaMigration: S] | [schemaMigration: S, internalMetadata: I]
    : [schemaMigration: S, internalMetadata: I];

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
export class MigrationContext<
  S extends SchemaMigration | NullSchemaMigration = SchemaMigration,
  I extends InternalMetadata | NullInternalMetadata = InternalMetadata,
> {
  /** Mirrors: `attr_reader :migrations_paths, :schema_migration, :internal_metadata` (`migration.rb:1212`). */
  readonly migrationsPaths: string[];
  readonly schemaMigration: S;
  readonly internalMetadata: I;

  /**
   * Mirrors: ActiveRecord::MigrationContext#initialize
   * (`migration.rb:1214-1218`).
   *
   * A caller with no pool hands in the null objects `Migration.copy` does
   * (`migration.rb:1065-1066`), which the discovery half (`migrations`,
   * `migrationFiles`, `parseMigrationFilename`) never calls into. Rails'
   * `NullSchemaMigration` (`schema_migration.rb:9`) / `NullInternalMetadata`
   * (`internal_metadata.rb:13`) are empty classes duck-typed into the same
   * slot, and `attr_reader` (`migration.rb:1212`) hands back whatever was
   * seated.
   *
   * TS has no duck typing, so the collaborators are the class' two type
   * parameters, defaulted to the real classes: a context built with the null
   * objects is a `MigrationContext<NullSchemaMigration, NullInternalMetadata>`,
   * which is not assignable to `MigrationContext`, and the connected half
   * (`up`/`down`/`currentVersion`, …) is annotated `this: MigrationContext`.
   * Calling one of those on a discovery-only context is therefore a compile
   * error rather than a null object receiving a `SchemaMigration` message, and
   * the readers hand back exactly what was seated, as `attr_reader` does.
   *
   * TS cannot say "when this argument is omitted, its type parameter is at its
   * default", so the two `||` fallbacks are written through {@link SeatedCollaborators}:
   * seating nothing is only well-typed when the parameters still are the real
   * collaborators, which is the sole branch that reaches them. Omitting a
   * collaborator on a narrowed context — the one call that would make them
   * lie — does not compile.
   */
  constructor(migrationsPaths: string[], ...seated: SeatedCollaborators<S, I>) {
    const [schemaMigration, internalMetadata] = seated;
    this.migrationsPaths = migrationsPaths;
    this.schemaMigration = schemaMigration ?? (new SchemaMigration(this.connectionPool()) as S);
    this.internalMetadata = internalMetadata ?? (new InternalMetadata(this.connectionPool()) as I);
  }

  /**
   * Mirrors: ActiveRecord::MigrationContext#connection_pool
   * (`migration.rb:1365-1367`). `DatabaseTasks` is reached through the
   * call-time config source rather than an import, for the same reason
   * `Migration#connection_pool` does.
   */
  private connectionPool(): ConnectionPool {
    return migrationArConfig()!.databaseTasks().migrationConnectionPool();
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#migrate
   * (`migration.rb:1228-1238`).
   */
  async migrate(
    this: MigrationContext,
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
    this: MigrationContext,
    targetVersion?: number | string | null,
    block?: (m: MigrationProxy) => boolean,
  ): Promise<MigrationProxy[]> {
    const selectedMigrations = block ? this.migrations.filter(block) : this.migrations;
    return this._migrateWithMigrator(
      new Migrator(
        "up",
        selectedMigrations,
        this.schemaMigration,
        this.internalMetadata,
        targetVersion,
      ),
    );
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#down (`migration.rb:1258-1266`) */
  async down(
    this: MigrationContext,
    targetVersion?: number | string | null,
    block?: (m: MigrationProxy) => boolean,
  ): Promise<MigrationProxy[]> {
    const selectedMigrations = block ? this.migrations.filter(block) : this.migrations;
    return this._migrateWithMigrator(
      new Migrator(
        "down",
        selectedMigrations,
        this.schemaMigration,
        this.internalMetadata,
        targetVersion,
      ),
    );
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

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#rollback
   * (`migration.rb:1240-1242`) — `move(:down, steps)`, not `Migrator`'s own
   * `rollback`. The two are not equivalent: `move` indexes into the sorted
   * migration list from `currentMigration` and raises
   * `UnknownMigrationVersionError` when the current version has no matching
   * migration, where `Migrator#rollback` walks the last N *applied* versions
   * and silently rolls back a different set when migrations ran out of order.
   */
  async rollback(this: MigrationContext, steps: number = 1): Promise<MigrationProxy[]> {
    return this.move("down", steps);
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#forward
   * (`migration.rb:1244-1246`) — `move(:up, steps)`. See {@link rollback} for
   * why this does not delegate to `Migrator#forward`.
   */
  async forward(this: MigrationContext, steps: number = 1): Promise<MigrationProxy[]> {
    return this.move("up", steps);
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#run (`migration.rb:1268-1270`) */
  async run(
    this: MigrationContext,
    direction: "up" | "down",
    targetVersion: number | string,
  ): Promise<number | undefined> {
    const migrator = new Migrator(
      direction,
      this.migrations,
      this.schemaMigration,
      this.internalMetadata,
      targetVersion,
    );
    return migrator.isUseAdvisoryLock()
      ? migrator.withAdvisoryLock(() => migrator.runWithoutLock())
      : migrator.runWithoutLock();
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#open
   * (`migration.rb:1272-1274`) — a fresh `Migrator` over this context's
   * migrations, so each read sees current schema_migrations.
   */
  open(this: MigrationContext): Migrator {
    return new Migrator("up", this.migrations, this.schemaMigration, this.internalMetadata);
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#migrations_status (`migration.rb:1317-1330`) */
  async migrationsStatus(
    this: MigrationContext,
  ): Promise<Array<{ status: "up" | "down"; version: string; name: string }>> {
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
  async protectedEnvironment(this: MigrationContext): Promise<boolean> {
    const stored = await this.lastStoredEnvironment();
    if (!stored) return false;
    const { Base } = await import("./base.js");
    return (Base.protectedEnvironments ?? ["production"]).includes(stored);
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#last_stored_environment (`migration.rb:1348-1357`) */
  async lastStoredEnvironment(this: MigrationContext): Promise<string | null> {
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
  async getAllVersions(this: MigrationContext): Promise<number[]> {
    if (await this.schemaMigration.tableExists()) {
      return this.schemaMigration.integerVersions();
    }
    return [];
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#current_version
   * (`migration.rb:1292-1295`), whose bare `rescue NoDatabaseError` returns nil.
   */
  async currentVersion(this: MigrationContext): Promise<number | undefined> {
    try {
      const versions = await this.getAllVersions();
      return versions.length > 0 ? Math.max(...versions) : 0;
    } catch (error) {
      if (error instanceof NoDatabaseError) return undefined;
      throw error;
    }
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#needs_migration? */
  async needsMigration(this: MigrationContext): Promise<boolean> {
    return (await this.pendingMigrationVersions()).length > 0;
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#pending_migration_versions */
  async pendingMigrationVersions(this: MigrationContext): Promise<number[]> {
    const applied = new Set(await this.getAllVersions());
    return this.migrations.map((m) => m.version).filter((v) => !applied.has(v));
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
      const [rawVersion, rawName, scope] = parsed;
      if (this.isValidateTimestamp() && !this.isValidMigrationTimestamp(rawVersion)) {
        throw new InvalidMigrationTimestampError(rawVersion, rawName);
      }
      const version = toInteger(rawVersion);
      const name = camelize(rawName);
      let loaded: Promise<Migration> | undefined;
      return {
        version,
        name,
        filename: file,
        scope: scope || undefined,
        migration: async (): Promise<Migration> => {
          loaded ??= (async () => {
            const { pathToFileURL } = await import("node:url");
            const mod = await import(pathToFileURL(file).href);
            return loadMigrationFrom(mod, name, version);
          })();
          return loaded;
        },
      } satisfies MigrationProxy;
    });

    return migrations.sort(byVersion);
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#migration_files
   * (`migration.rb:1369-1372`).
   *
   * Rails globs `#{paths}/**\/[0-9]*_*.rb`. trails scaffolds migrations in
   * TypeScript, so the extension set is `ts|js` and the same migration can be
   * present twice — the source and its compiled output. The two spellings that
   * survive discovery, and their precedence, are:
   *
   * - `<version>_<name>.ts` — the Rails-faithful form, and what trailties
   *   generates.
   * - `<version>-<name>.js` / `<version>-<name>.ts` — the pre-1.12c hyphen
   *   form, kept as a transitional alias so apps generated against earlier
   *   releases still load.
   *
   * A version+name present in more than one spelling is loaded once: `.ts`
   * beats `.js` (source over compiled output), and at equal extension the
   * canonical underscore beats the hyphen alias, so renaming a migration
   * across the 1.12c boundary does not double-load it.
   */
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
        } else if (/^\d+[_-].*\.(ts|js)$/.test(entry.name)) {
          files.push(full);
        }
      }
    };
    for (const p of this.migrationsPaths) collect(p);
    return this.dedupeMigrationFiles(files.sort());
  }

  /**
   * @internal The `.ts`-over-`.js` / underscore-over-hyphen precedence
   * {@link migrationFiles} documents. Rails needs no counterpart: one Ruby
   * migration is one `.rb` file under one spelling.
   */
  private dedupeMigrationFiles(files: string[]): string[] {
    const byBasename = new Map<string, string>();
    for (const file of files) {
      const parsed = this.parseMigrationFilename(file);
      if (!parsed) continue;
      const key = `${parsed[0]}_${parsed[1]}`;
      const existing = byBasename.get(key);
      if (existing === undefined) {
        byBasename.set(key, file);
        continue;
      }
      const isTs = (name: string): boolean => name.endsWith(".ts");
      const isUnderscore = (name: string): boolean => /^\d+_/.test(name.replace(/.*[/\\]/, ""));
      if (isTs(file) && !isTs(existing)) {
        byBasename.set(key, file);
      } else if (isTs(file) === isTs(existing) && isUnderscore(file) && !isUnderscore(existing)) {
        byBasename.set(key, file);
      }
    }
    return [...byBasename.values()].sort();
  }

  /**
   * @internal Mirrors: ActiveRecord::MigrationContext#parse_migration_filename
   * (`migration.rb:1374-1376`). The name segment is folded to the underscore
   * form so a hyphen-alias file and its renamed underscore twin parse to the
   * same name — which is what lets {@link dedupeMigrationFiles} collapse them
   * and `Migrator#validate`'s duplicate-name check see one migration.
   */
  private parseMigrationFilename(filename: string): [string, string, string] | null {
    const base = filename.replace(/.*[/\\]/, "").replace(/\.(ts|js)$/, "");
    const m = base.match(/^(\d+)[_-]([a-z0-9_-]*)(?:\.([a-z0-9_]*))?$/);
    if (!m) return null;
    return [m[1], m[2].replace(/-/g, "_"), m[3] ?? ""];
  }

  /** @internal Mirrors: ActiveRecord::MigrationContext#validate_timestamp? (`migration.rb:1378-1380`) */
  private isValidateTimestamp(): boolean {
    return ActiveRecord.timestampedMigrations && ActiveRecord.validateMigrationTimestamps;
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
  async move(
    this: MigrationContext,
    direction: "up" | "down",
    steps: number,
  ): Promise<MigrationProxy[]> {
    const migrator = new Migrator(
      direction,
      this.migrations,
      this.schemaMigration,
      this.internalMetadata,
    );
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

export class Migrator {
  /** Mirrors: ActiveRecord::Migrator.migrations_paths (`migration.rb:1407`) */
  static migrationsPaths: string[] = [];

  private _migrations: MigrationProxy[];
  private _schemaMigration: SchemaMigration;
  private _internalMetadata: InternalMetadata;
  private readonly _direction: "up" | "down";
  private readonly _targetVersion: number | null;
  private _migratedVersions?: Set<number>;

  /**
   * Mirrors: `ActiveRecord::Migrator#initialize` (`migration.rb:1418-1433`) —
   * `(direction, migrations, schema_migration, internal_metadata,
   * target_version = nil)`. The bookkeeping objects are arguments, as Rails has
   * them, so a multi-database caller can hand each Migrator its own pair
   * (`multi_db_migrator_test.rb:142,149`).
   */
  constructor(
    direction: "up" | "down",
    migrations: MigrationProxy[],
    schemaMigration: SchemaMigration,
    internalMetadata: InternalMetadata,
    targetVersion?: number | string | null,
  ) {
    this._direction = direction;
    this._targetVersion = targetVersion == null ? null : toInteger(String(targetVersion));
    this._schemaMigration = schemaMigration;
    this._internalMetadata = internalMetadata;
    this.validate(migrations);
    this._migrations = this._sortMigrations(migrations);
  }

  /** @internal Mirrors: ActiveRecord::Migrator#migrations */
  get migrations(): MigrationProxy[] {
    return this.isDown() ? [...this._migrations].reverse() : this._sortMigrations(this._migrations);
  }

  // Rails: MIGRATOR_SALT = 2053462845 (Zlib.crc32("googol"))
  private static readonly _MIGRATOR_SALT = 2053462845;

  /**
   * Wrap a block with an advisory lock to prevent concurrent migrations.
   *
   * Once the lock is held, `loadMigrated` reloads schema_migrations to be sure
   * it wasn't changed by another process while we blocked (migration.rb:1601).
   *
   * Whether the adapter can take a lock at all is the *caller's* question:
   * `use_advisory_lock?` (migration.rb:1596-1598) is checked by `#migrate` /
   * `#run` (migration.rb:1447, 1461), never inside this body. Adapters that
   * cannot lock answer `isAdvisoryLocksEnabled()` falsey.
   *
   * The one call with no Rails counterpart is `_ensureSchemaTable()`: Rails
   * creates the bookkeeping tables in `Migrator#initialize`
   * (migration.rb:1470-1476), and a TS constructor cannot await, so they are
   * ensured at the one point that must see them — before `loadMigrated` reads
   * schema_migrations.
   *
   * @internal Mirrors: ActiveRecord::Migrator#with_advisory_lock
   */
  async withAdvisoryLock<T>(fn: () => Promise<T>): Promise<T> {
    const lockId = await this.generateMigratorAdvisoryLockId();
    const gotLock = await this.connection.getAdvisoryLock(lockId);
    if (!gotLock) {
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
    // Any non-true return — false or undefined — is treated as failure, matching
    // Rails: `release_advisory_lock(...) or raise` (migration.rb:1608-1612).
    let released: boolean | undefined;
    try {
      released = await this.connection.releaseAdvisoryLock(lockId);
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
   * Mirrors: ActiveRecord::Migrator#migrate (`migration.rb:1452-1458`) — the
   * advisory-lock gate. A target equal to the current version runs `up`, so an
   * unapplied migration below an already-applied target still runs. The target
   * is rejected up front because Ruby compares it against `current_version`
   * directly, while it may reach us as a string.
   *
   * Rails' `#migrate` takes no arguments; the `(targetVersion, block)`
   * signature its callers still pass is what
   * `migrator-run-surface-caller-migration` collapses. Until then the direction
   * choice `MigrationContext#migrate` (`migration.rb:1228-1238`) makes is made
   * here, on a per-run `Migrator` built the way Rails builds one.
   */
  async migrate(
    targetVersion?: number | string | null,
    block?: (m: MigrationProxy) => boolean,
  ): Promise<MigrationProxy[]> {
    // With no target this is Rails' `Migrator#migrate`, which runs the
    // direction this Migrator was built with; with one it is
    // `MigrationContext#migrate`'s dispatch (`migration.rb:1228-1238`).
    let direction: "up" | "down" = this._direction;
    if (targetVersion != null) {
      direction = "up";
      if (this._invalidTarget(targetVersion)) {
        throw new UnknownMigrationVersionError(targetVersion);
      }
      const target = BigInt(targetVersion);
      const current = BigInt(await this.currentVersion());
      if (current === BigInt(0) && target === BigInt(0)) return [];
      if (current > target) direction = "down";
    }

    const migrator = new Migrator(
      direction,
      block ? this._migrations.filter(block) : this._migrations,
      this._schemaMigration,
      this._internalMetadata,
      targetVersion ?? null,
    );
    try {
      return migrator.isUseAdvisoryLock()
        ? await migrator.withAdvisoryLock(() => migrator.migrateWithoutLock())
        : await migrator.migrateWithoutLock();
    } finally {
      this._invalidateMigrated();
    }
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
   * @internal Mirrors: ActiveRecord::Migrator#run_without_lock
   *
   * Reads the direction and target version this Migrator was constructed with,
   * as Rails does with `@direction` / `@target_version`.
   */
  async runWithoutLock(): Promise<number | undefined> {
    await this._ensureSchemaTable();
    const migration = this._migrations.find((m) => m.version === this._targetVersion);
    if (!migration) throw new UnknownMigrationVersionError(this._targetVersion ?? "");
    await this.recordEnvironment();
    return this.executeMigrationInTransaction(migration);
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
      // `NullConfig#env_name` is nil for a bare-adapter Migrator, as in Rails
      // (`abstract/connection_pool.rb:17-22`); the cast narrows, it does not default.
      await this._internalMetadata.set(
        "environment",
        this.connection.pool.dbConfig.envName as string,
      );
    }
  }

  /**
   * @internal Mirrors: ActiveRecord::Migrator#connection
   * (`migration.rb:1488-1491`). `DatabaseTasks` is reached through the
   * call-time config source: naming `tasks/database-tasks.js` here would be a
   * load-time edge back into a module that already imports this one.
   */
  private get connection(): DatabaseAdapter {
    return migrationArConfig()!.databaseTasks().migrationConnection();
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

  /**
   * @internal Mirrors: ActiveRecord::Migrator#execute_migration_in_transaction
   *
   * Rails' early returns yield nil; the version is returned only when the
   * migration actually ran, which is what `run_without_lock` hands back to
   * `MigrationContext#run`.
   */
  async executeMigrationInTransaction(migration: MigrationProxy): Promise<number | undefined> {
    // Ruby's method-level `rescue` (`migration.rb:1538`) covers the guards and
    // the log line too, not just the ddl_transaction.
    try {
      const applied = await this.migrated();
      if (this.isDown() && !applied.has(migration.version)) return undefined;
      if (this.isUp() && applied.has(migration.version)) return undefined;

      // Rails' guard is just `if Base.logger`; the `?.` on `info` is forced by
      // trails' `Base.logger` type, which declares every level optional
      // (base.ts:1717-1723) because the logger is app-supplied, where Ruby's is
      // an ActiveSupport::Logger that always responds to `info`.
      if (_base?.logger)
        _base.logger.info?.(`Migrating to ${migration.name} (${migration.version})`);

      await this.ddlTransaction(migration, async () => {
        // Rails delegates `migrate` through the proxy (`migration.rb:1187`);
        // trails resolves it here because the proxy's loader is an async ESM
        // `import()` where Ruby's `load` is synchronous.
        await (await migration.migration()).migrate(this._direction);
        await this.recordVersionStateAfterMigrating(migration.version);
      });
    } catch (e) {
      // Rails re-resolves the proxy here (`migration.rb:1540` → `use_transaction?`
      // → `MigrationProxy#disable_ddl_transaction`), so a migration that failed to
      // load raises again from inside the rescue and escapes unwrapped.
      const useTx = await this.isUseTransaction(migration);
      // Ruby's `#{e}` interpolates Exception#to_s — the bare message, without
      // the `Error: ` prefix JS String(e) would add.
      const msg = `An error has occurred, ${useTx ? "this and " : ""}all later migrations canceled:\n\n${e instanceof Error ? e.message : e}`;
      throw Object.assign(new Error(msg), { cause: e });
    }
    return migration.version;
  }

  /** @internal Mirrors: ActiveRecord::Migrator#target */
  private target(): MigrationProxy | undefined {
    if (this._targetVersion === null) return undefined;
    return this.migrations.find((m) => m.version === this._targetVersion);
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
  async recordVersionStateAfterMigrating(version: number): Promise<void> {
    const migrated = await this.migrated();
    if (this.isDown()) {
      migrated.delete(version);
      await this._schemaMigration.deleteVersion(String(version));
    } else {
      migrated.add(version);
      await this._schemaMigration.createVersion(String(version));
    }
  }

  /**
   * @internal Mirrors: ActiveRecord::Migrator#use_advisory_lock?
   *
   * Rails gates solely on `connection.advisory_locks_enabled?`
   * (`supports_advisory_locks? && @advisory_locks_enabled`), mirrored here by
   * `isAdvisoryLocksEnabled()`.
   */
  isUseAdvisoryLock(): boolean {
    return this.connection.isAdvisoryLocksEnabled();
  }

  /** @internal Mirrors: ActiveRecord::Migrator#generate_migrator_advisory_lock_id */
  async generateMigratorAdvisoryLockId(): Promise<bigint> {
    // Rails sends `current_database` unconditionally; an adapter that does not
    // define it raises NoMethodError. The `!` reproduces that unconditional
    // send — it is not a claim that the member is always present.
    const dbNameHash = crc32(await this.connection.currentDatabase!());
    return BigInt(Migrator._MIGRATOR_SALT) * BigInt(dbNameHash);
  }

  /**
   * Get the current schema version.
   *
   * Mirrors: ActiveRecord::Migrator.current_version
   */
  async currentVersion(): Promise<number> {
    const versions = await this.getAllVersions();
    return versions.length > 0 ? Math.max(...versions) : 0;
  }

  /**
   * Get all applied migration versions.
   *
   * Mirrors: ActiveRecord::Migrator.get_all_versions
   */
  async getAllVersions(): Promise<number[]> {
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();
    return [...applied].sort((a, b) => a - b);
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
      : new Set<number>();
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
    const applied = new Set(await this._schemaMigration.normalizedVersions());

    const fileList = this._migrations.map((m) => {
      const normV = SchemaMigration.normalizeMigrationNumber(String(m.version));
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

    const versionCounts = new Map<number, number>();
    for (const m of migrations) {
      versionCounts.set(m.version, (versionCounts.get(m.version) ?? 0) + 1);
    }
    for (const m of migrations) {
      if (versionCounts.get(m.version)! > 1) {
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

  private async _appliedVersions(): Promise<Set<number>> {
    return new Set(await this._schemaMigration.integerVersions());
  }

  /**
   * Mirrors Rails' `Migrator#invalid_target?`: a target version is invalid when
   * it is given, is not 0, and does not correspond to any known migration.
   */
  private _invalidTarget(targetVersion: number | string): boolean {
    const key = toInteger(String(targetVersion));
    if (key === 0) return false;
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
  async run(direction: "up" | "down", targetVersion: number | string): Promise<number | undefined> {
    const migrator = new Migrator(
      direction,
      this._migrations,
      this._schemaMigration,
      this._internalMetadata,
      targetVersion,
    );
    try {
      return migrator.isUseAdvisoryLock()
        ? await migrator.withAdvisoryLock(() => migrator.runWithoutLock())
        : await migrator.runWithoutLock();
    } finally {
      this._invalidateMigrated();
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
   *
   * @internal
   */
  async ddlTransaction(migration: MigrationProxy, fn: () => Promise<void>): Promise<void> {
    if (await this.isUseTransaction(migration)) {
      await this.connection.transaction(fn);
    } else {
      await fn();
    }
  }

  /**
   * Mirrors Rails' `Migrator#use_transaction?`:
   * `!migration.disable_ddl_transaction && connection.supports_ddl_transactions?`
   *
   * @internal
   */
  async isUseTransaction(migration: MigrationProxy): Promise<boolean> {
    // `migration.disable_ddl_transaction` is delegated through the proxy
    // (`migration.rb:1187`); trails resolves it here because the proxy's loader
    // is an async ESM `import()` where Ruby's `load` is synchronous.
    if ((await migration.migration()).disableDdlTransaction) return false;
    // Check adapter support via the DatabaseAdapter interface.
    // SQLite returns true, PG returns true, MySQL returns false.
    // Absent (undefined) defaults to false.
    return this.connection.supportsDdlTransactions?.() ?? false;
  }

  /** @internal Mirrors: ActiveRecord::Migrator#current_migration (`migration.rb:1439-1441`) */
  async currentMigration(): Promise<MigrationProxy | null> {
    const version = await this.currentVersion();
    if (version === 0) return null;
    return this._migrations.find((m) => m.version === version) ?? null;
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

  async migrated(): Promise<Set<number>> {
    return this._migratedVersions ?? this.loadMigrated();
  }

  /**
   * Rails' `initialize` creates both bookkeeping tables (`migration.rb:1429-1430`)
   * before anything can read `migrated`, so `load_migrated` may assume
   * schema_migrations exists. `_ensureSchemaTable` is trails' async stand-in for
   * that constructor step (a constructor cannot await), so every entry point
   * that reads versions has to await it — not just `pendingMigrations`.
   */
  async loadMigrated(): Promise<Set<number>> {
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

  /**
   * Mirrors: ActiveRecord::Migration::Current#compatible_table_definition
   * (migration.rb:612-614), the identity hook the four table-definition
   * wrappers above it yield through.
   *
   * Those wrappers (`create_table`, `change_table`, `create_join_table`,
   * `drop_table`, migration.rb:580-609) exist solely so
   * `Migration::Compatibility`'s version classes can override this hook
   * (compatibility.rb:156, 219, 262, 310, 408, 462). Version compatibility
   * (`Migration[x.y]`) is out of scope for the port, so the hook has no caller
   * in the ported subset and the wrappers are not ported with it — porting
   * four identity wrappers whose only job is to reach an identity hook would
   * be indirection with no reader.
   *
   * @internal
   */
  compatibleTableDefinition(t: unknown): unknown {
    return t;
  }
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
  private _migrations: MigrationProxy[];

  constructor(
    app: (env: Record<string, unknown>) => Promise<unknown>,
    options: {
      migrator?: Migrator;
      migrations?: MigrationProxy[];
    } = {},
  ) {
    this._app = app;
    this._migrator = options.migrator;
    this._migrations = options.migrations ?? [];
  }

  // Rails' `@mutex.synchronize` (migration.rb:657) guards the
  // `@watcher ||= build_watcher` memo and the `@needs_check` flag. trails
  // registers migrations programmatically, so it has neither, and nothing else
  // on `this` is written across the awaits below — no critical section to hold.
  async call(env: Record<string, unknown>): Promise<unknown> {
    if (this._migrator) {
      await this._migrator.loadMigrated();
      const pending = await this._migrator.pendingMigrations();
      this._throwIfPending(pending.length);
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

// Rails: `self.delegate = new` (`migration.rb:813`) — instantiate the delegate
// after the class body, so class-level schema operations have a delegate before
// any migration runs.
Migration.delegate = new Migration();
