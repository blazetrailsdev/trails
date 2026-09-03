import {
  getFs,
  getPath,
  getEnv,
  camelize,
  groupBy,
  underscore,
  humanize,
  isPlainObject,
  extractOptionsBang,
  stdout,
  FileUpdateChecker,
  Monitor,
} from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { rubyInspect } from "./relation/ruby-inspect.js";
import { Zlib } from "@blazetrails/ruby-compat";
import { Temporal } from "@blazetrails/date";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import {
  TableDefinition,
  type TableDefinitionOf,
  type TableOf,
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

type BaseWithLogger = Pick<typeof Base, "logger">;

let _base: BaseWithLogger | undefined;

/** @internal */
export function _registerBase(base: BaseWithLogger): void {
  _base = base;
}

/** @internal */
export interface ColumnExistsOptions {
  limit?: unknown;
  precision?: unknown;
  scale?: unknown;
  default?: unknown;
  null?: unknown;
  collation?: unknown;
  comment?: unknown;
}

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

/** @internal */
let migrationVerbose = true;

/** @internal */
function writeMigrationMessage(text = ""): void {
  if (migrationVerbose) {
    stdout.write(`${text}\n`);
  }
}

/** @internal */
function announceMigrationText(header: string, message: string): string {
  const text = `${header}: ${message}`;
  const pad = Math.max(0, 75 - text.length);
  return `== ${text} ${"=".repeat(pad)}`;
}

/** @internal */
const toRun = Symbol("toRun");

export class ReversibleBlockHelper {
  /** @noRailsEquivalent PERMANENT */
  [toRun]: Array<() => Promise<void>> = [];

  constructor(public reverting: boolean) {}

  up(fn: () => Promise<void>): void {
    if (!this.reverting) this[toRun].push(fn);
  }

  down(fn: () => Promise<void>): void {
    if (this.reverting) this[toRun].push(fn);
  }
}

export type MigrationClass = new () => Migration;

type MigrationRunOptions = { direction?: "up" | "down"; revert?: boolean };

/** @noRailsEquivalent PERMANENT */
function isMigrationClass(fn: unknown): fn is MigrationClass {
  return typeof fn === "function" && (fn === Migration || fn.prototype instanceof Migration);
}

function isCommandRecorder(connection: unknown): connection is CommandRecorder {
  return connection instanceof CommandRecorder;
}

export class Migration<A extends DatabaseAdapter = DatabaseAdapter> {
  /** @internal */
  protected _connectionOverride?: DatabaseAdapter | CommandRecorder;
  /** @internal */
  protected _poolOverride?: ConnectionPool;
  private _executionStrategy?: ExecutionStrategy;
  private _name?: string;
  static delegate: Migration | null = null;
  private _version?: number;

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

  constructor(name?: string, version?: number) {
    this._name = name;
    this._version = version;
  }

  static forVersion(v: string | number): typeof Migration {
    return findVersion(v) as unknown as typeof Migration;
  }

  static async migrate(direction: "up" | "down"): Promise<void> {
    await new (this as unknown as new () => Migration)().migrate(direction);
  }

  async up(): Promise<void> {
    const legacy = this._legacyClassDirection("up");
    if (legacy) return legacy();
    await this.change();
  }

  async down(): Promise<void> {
    const legacy = this._legacyClassDirection("down");
    if (legacy) return legacy();
    await this.revert(() => this.change());
  }

  private _legacyClassDirection(direction: "up" | "down"): (() => Promise<void>) | null {
    const ctor = this.constructor as typeof Migration;
    const owns = (d: "up" | "down"): boolean => Object.prototype.hasOwnProperty.call(ctor, d);
    if (!owns("up") && !owns("down")) return null;
    if (!owns(direction)) return async (): Promise<void> => {};
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

  async change(): Promise<void> {}

  /** @internal */
  protected _pt(name: string): string {
    if (isCommandRecorder(this.connection)) return name;
    return Migration.properTableName(name, Migration.tableNameOptions());
  }

  /**
   * @missingRailsCall compatible_table_definition — PERMANENT
   * @noRailsEquivalent CONVERGEABLE migration-delegators-belong-on-current-not-migration
   */
  async createTable(
    tableName: string,
    options?:
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
      | ((t: TableDefinitionOf<A>) => void),
    fn?: (t: TableDefinitionOf<A>) => void,
  ): Promise<void> {
    const tname = this._pt(tableName);
    if (fn !== undefined) {
      await this.connection.createTable(tname, options, fn);
    } else if (options !== undefined) {
      await this.connection.createTable(tname, options);
    } else {
      await this.connection.createTable(tname);
    }
  }

  /**
   * @missingRailsCall compatible_table_definition — PERMANENT
   * @noRailsEquivalent CONVERGEABLE migration-delegators-belong-on-current-not-migration
   */
  async dropTable(
    ...args: Array<
      | string
      | { ifExists?: boolean; force?: boolean | "cascade"; temporary?: boolean }
      | ((t: TableDefinition) => void)
    >
  ): Promise<void> {
    const rest = [...args] as unknown[];
    const block = (typeof rest[rest.length - 1] === "function" ? rest.pop() : undefined) as
      | ((t: TableDefinition) => void)
      | undefined;
    const last = rest[rest.length - 1];
    const hasOptions = last !== null && typeof last === "object";
    const options = hasOptions
      ? (last as { ifExists?: boolean; force?: boolean | "cascade"; temporary?: boolean })
      : undefined;
    const names = (hasOptions ? rest.slice(0, -1) : rest) as string[];
    const tnames = names.map((n) => this._pt(n)) as [string, ...string[]];
    if (options !== undefined && block !== undefined) {
      await this.connection.dropTable(...tnames, options, block);
    } else if (options !== undefined) {
      await this.connection.dropTable(...tnames, options);
    } else if (block !== undefined) {
      await this.connection.dropTable(...tnames, block);
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
    tableName = this._pt(tableName);
    await this.connection.removeColumn(tableName, columnName, type, opts);
  }

  async renameColumn(tableName: string, oldName: string, newName: string): Promise<void> {
    tableName = this._pt(tableName);
    await this.connection.renameColumn(tableName, oldName, newName);
  }

  async addIndex(
    tableName: string,
    columns: string | string[],
    options: AddIndexOptions = {},
  ): Promise<void> {
    tableName = this._pt(tableName);
    await this.connection.addIndex(tableName, columns, options);
  }

  async removeIndex(
    tableName: string,
    columnOrOptions:
      | string
      | string[]
      | { column?: string | string[]; name?: string; ifExists?: boolean } = {},
    options: { column?: string | string[]; name?: string; ifExists?: boolean } = {},
  ): Promise<void> {
    tableName = this._pt(tableName);
    await this.connection.removeIndex(tableName, columnOrOptions, options);
  }

  async changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): Promise<void> {
    tableName = this._pt(tableName);
    await this.connection.changeColumn(tableName, columnName, type, options);
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    oldName = this._pt(oldName);
    newName = this._pt(newName);
    await this.connection.renameTable(oldName, newName);
  }

  async tableExists(tableName: string): Promise<boolean | null> {
    return this.connection.tableExists(this._pt(tableName));
  }

  async columnExists(
    tableName: string,
    columnName: string,
    type?: string | null,
    options?: ColumnExistsOptions,
  ): Promise<boolean> {
    if (options !== undefined) {
      return this.connection.columnExists(this._pt(tableName), columnName, type, options);
    } else if (type !== undefined) {
      return this.connection.columnExists(this._pt(tableName), columnName, type);
    }
    return this.connection.columnExists(this._pt(tableName), columnName);
  }

  async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    tableName = this._pt(tableName);
    await this.connection.changeColumnDefault(tableName, columnName, defaultOrChanges);
  }

  async changeColumnNull(
    tableName: string,
    columnName: string,
    allowNull: boolean,
    defaultValue?: unknown,
  ): Promise<void> {
    tableName = this._pt(tableName);
    if (defaultValue !== undefined) {
      await this.connection.changeColumnNull(tableName, columnName, allowNull, defaultValue);
    } else {
      await this.connection.changeColumnNull(tableName, columnName, allowNull);
    }
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
    tableName = this._pt(tableName);
    await this.connection.addReference(tableName, refName, options);
  }

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
    tableName = this._pt(tableName);
    await this.connection.removeReference(tableName, refName, options);
  }

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
    fromTable = this._pt(fromTable);
    if (typeof toTableOrOptions === "string") toTableOrOptions = this._pt(toTableOrOptions);
    if (options !== undefined) {
      await this.connection.removeForeignKey(fromTable, toTableOrOptions, options);
    } else if (toTableOrOptions !== undefined) {
      await this.connection.removeForeignKey(fromTable, toTableOrOptions);
    } else {
      await this.connection.removeForeignKey(fromTable);
    }
  }

  async addCheckConstraint(
    tableName: string,
    expression: string,
    options: {
      name?: string;
      validate?: boolean;
      ifNotExists?: boolean;
      [key: string]: unknown;
    } = {},
  ): Promise<void> {
    tableName = this._pt(tableName);
    await this.connection.addCheckConstraint(tableName, expression, options);
  }

  async removeCheckConstraint(
    tableName: string,
    expressionOrOptions?: string | { name?: string; ifExists?: boolean },
    options?: { name?: string; ifExists?: boolean },
  ): Promise<void> {
    tableName = this._pt(tableName);
    if (options !== undefined) {
      await this.connection.removeCheckConstraint(tableName, expressionOrOptions, options);
    } else if (expressionOrOptions !== undefined) {
      await this.connection.removeCheckConstraint(tableName, expressionOrOptions);
    } else {
      await this.connection.removeCheckConstraint(tableName);
    }
  }

  async validateCheckConstraint(
    tableName: string,
    nameOrOptions: string | { name: string },
  ): Promise<void> {
    const connection = this.connection as DatabaseAdapter as DatabaseAdapter &
      ValidateConstraintStatements;
    await connection.validateCheckConstraint(this._pt(tableName), nameOrOptions);
  }

  async validateForeignKey(
    fromTable: string,
    toTableOrOptions?: string | Omit<ForeignKeyLookupOptions, "toTable">,
    options?: Omit<ForeignKeyLookupOptions, "toTable">,
  ): Promise<void> {
    const toTable = typeof toTableOrOptions === "string" ? toTableOrOptions : undefined;
    const opts = typeof toTableOrOptions === "object" ? toTableOrOptions : (options ?? undefined);
    const connection = this.connection as DatabaseAdapter as DatabaseAdapter &
      ValidateConstraintStatements;
    if (opts !== undefined) {
      await connection.validateForeignKey(this._pt(fromTable), toTable, opts);
    } else if (toTable !== undefined) {
      await connection.validateForeignKey(this._pt(fromTable), toTable);
    } else {
      await connection.validateForeignKey(this._pt(fromTable));
    }
  }

  async changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: CommentOrChanges,
  ): Promise<void> {
    tableName = this._pt(tableName);
    const connection = this.connection as DatabaseAdapter as DatabaseAdapter & CommentStatements;
    await connection.changeColumnComment(tableName, columnName, commentOrChanges);
  }

  async changeTableComment(tableName: string, commentOrChanges: CommentOrChanges): Promise<void> {
    tableName = this._pt(tableName);
    const connection = this.connection as DatabaseAdapter as DatabaseAdapter & CommentStatements;
    await connection.changeTableComment(tableName, commentOrChanges);
  }

  async enableExtension(name: string, options?: Record<string, unknown>): Promise<void> {
    const connection = this.connection as DatabaseAdapter as DatabaseAdapter & ExtensionStatements;
    if (options !== undefined) {
      await connection.enableExtension(name, options);
    } else {
      await connection.enableExtension(name);
    }
  }

  async disableExtension(name: string, options?: { force?: "cascade" }): Promise<void> {
    const connection = this.connection as DatabaseAdapter as DatabaseAdapter & ExtensionStatements;
    if (options !== undefined) {
      await connection.disableExtension(name, options);
    } else {
      await connection.disableExtension(name);
    }
  }

  async createEnum(
    name: string,
    values: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    const connection = this.connection as DatabaseAdapter as DatabaseAdapter & EnumStatements;
    if (options !== undefined) {
      await connection.createEnum(name, values, options);
    } else {
      await connection.createEnum(name, values);
    }
  }

  async dropEnum(
    name: string,
    valuesOrOptions?: string[] | { ifExists?: boolean },
    options?: { ifExists?: boolean },
  ): Promise<void> {
    const isOptsObj =
      valuesOrOptions !== null &&
      typeof valuesOrOptions === "object" &&
      !Array.isArray(valuesOrOptions);
    const values = isOptsObj ? undefined : valuesOrOptions;
    const opts = isOptsObj ? valuesOrOptions : (options ?? undefined);
    const connection = this.connection as DatabaseAdapter as DatabaseAdapter & EnumStatements;
    if (opts !== undefined) {
      await connection.dropEnum(name, values, opts);
    } else if (values !== undefined) {
      await connection.dropEnum(name, values);
    } else {
      await connection.dropEnum(name);
    }
  }

  async renameEnumValue(name: string, options: { from: string; to: string }): Promise<void> {
    const connection = this.connection as DatabaseAdapter as DatabaseAdapter & EnumStatements;
    await connection.renameEnumValue(name, options);
  }

  async addUniqueConstraint(
    tableName: string,
    columnName?: string | string[],
    options?: UniqueConstraintOptions,
  ): Promise<void> {
    tableName = this._pt(tableName);
    const connection = this.connection as DatabaseAdapter as DatabaseAdapter &
      UniqueConstraintStatements;
    if (options !== undefined) {
      await connection.addUniqueConstraint(tableName, columnName, options);
    } else if (columnName !== undefined) {
      await connection.addUniqueConstraint(tableName, columnName);
    } else {
      await connection.addUniqueConstraint(tableName);
    }
  }

  async removeUniqueConstraint(
    tableName: string,
    columnNameOrOptions?: string | string[] | UniqueConstraintOptions,
    options?: UniqueConstraintOptions,
  ): Promise<void> {
    const isOptsObj =
      columnNameOrOptions !== null &&
      typeof columnNameOrOptions === "object" &&
      !Array.isArray(columnNameOrOptions);
    const columnName = isOptsObj ? undefined : columnNameOrOptions;
    const opts = isOptsObj ? columnNameOrOptions : (options ?? undefined);
    tableName = this._pt(tableName);
    const connection = this.connection as DatabaseAdapter as DatabaseAdapter &
      UniqueConstraintStatements;
    if (opts !== undefined) {
      await connection.removeUniqueConstraint(tableName, columnName, opts);
    } else if (columnName !== undefined) {
      await connection.removeUniqueConstraint(tableName, columnName);
    } else {
      await connection.removeUniqueConstraint(tableName);
    }
  }

  async addTimestamps(tableName: string, options: ColumnOptions = {}): Promise<void> {
    tableName = this._pt(tableName);
    await this.connection.addTimestamps(tableName, options);
  }

  async removeTimestamps(tableName: string): Promise<void> {
    tableName = this._pt(tableName);
    await this.connection.removeTimestamps(tableName);
  }

  /**
   * @missingRailsCall compatible_table_definition — PERMANENT
   * @noRailsEquivalent CONVERGEABLE migration-delegators-belong-on-current-not-migration
   */
  async createJoinTable(
    table1: string,
    table2: string,
    options?: JoinTableOptions | ((t: TableDefinitionOf<A>) => void),
    fn?: (t: TableDefinitionOf<A>) => void,
  ): Promise<void> {
    table1 = this._pt(table1);
    if (fn !== undefined) {
      await this.connection.createJoinTable(table1, table2, options, fn);
    } else if (options !== undefined) {
      await this.connection.createJoinTable(table1, table2, options);
    } else {
      await this.connection.createJoinTable(table1, table2);
    }
  }

  async dropJoinTable(
    table1: string,
    table2: string,
    options?: { tableName?: string },
  ): Promise<void> {
    table1 = this._pt(table1);
    if (options !== undefined) {
      await this.connection.dropJoinTable(table1, table2, options);
    } else {
      await this.connection.dropJoinTable(table1, table2);
    }
  }

  /**
   * @missingRailsCall compatible_table_definition — PERMANENT
   * @noRailsEquivalent CONVERGEABLE migration-delegators-belong-on-current-not-migration
   */
  async changeTable(
    tableName: string,
    options?: ((t: TableOf<A>) => void | Promise<void>) | { bulk?: boolean },
    fn?: (t: TableOf<A>) => void | Promise<void>,
  ): Promise<void> {
    if (fn !== undefined) {
      await this.connection.changeTable(this._pt(tableName), options, fn);
    } else if (options !== undefined) {
      await this.connection.changeTable(this._pt(tableName), options);
    } else {
      await this.connection.changeTable(this._pt(tableName));
    }
  }

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
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
    tableName = this._pt(tableName);
    const connection = this.connection as unknown as {
      removeColumns(tableName: string, ...args: Array<string | ColumnOptions>): Promise<void>;
    };
    await connection.removeColumns(tableName, ...columnsOrOptions);
  }

  async addColumns(
    tableName: string,
    ...args: [...string[], { type: ColumnType } & ColumnOptions]
  ): Promise<void>;
  async addColumns(
    tableName: string,
    ...columnsAndOptions: Array<string | ({ type: ColumnType } & ColumnOptions)>
  ): Promise<void> {
    const connection = this.connection as unknown as {
      addColumns(
        tableName: string,
        ...args: Array<string | ({ type: ColumnType } & ColumnOptions)>
      ): Promise<void>;
    };
    await connection.addColumns(this._pt(tableName), ...columnsAndOptions);
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

  get name(): string {
    return this._name ?? this.constructor.name;
  }

  async revert(...migrationClasses: Array<MigrationClass | (() => Promise<void>)>): Promise<void> {
    const last = migrationClasses[migrationClasses.length - 1];
    const fn = typeof last === "function" && !isMigrationClass(last) ? last : undefined;
    const klasses = (fn ? migrationClasses.slice(0, -1) : migrationClasses) as MigrationClass[];
    if (klasses.length > 0) {
      await this.run(...[...klasses].reverse(), { revert: true });
    }
    if (fn === undefined) return;
    if (isCommandRecorder(this.connection)) {
      await this.connection.revert(fn);
      return;
    }
    const recorder = this.commandRecorder();
    this._connectionOverride = recorder;
    await this.suppressMessages(async () => {
      await recorder.revert(fn);
    });
    this._connectionOverride = recorder.delegate as DatabaseAdapter;
    await recorder.replay(this as unknown as Record<string, (...a: unknown[]) => Promise<void>>);
  }

  async run(...migrationClasses: Array<MigrationClass | MigrationRunOptions>): Promise<void> {
    const [klasses, opts] = extractOptionsBang(migrationClasses) as [
      MigrationClass[],
      MigrationRunOptions,
    ];
    let dir = opts.direction ?? "up";
    if (opts.revert) dir = dir === "down" ? "up" : "down";
    if (this.isReverting()) {
      await this.revert(async () => {
        await this.run(...klasses, { direction: dir, revert: true });
      });
    } else {
      for (const migrationClass of klasses) {
        await new migrationClass().execMigration(this.connection, dir);
      }
    }
  }

  async reversible(fn?: (dir: ReversibleBlockHelper) => void): Promise<void> {
    if (!fn) return;
    const helper = new ReversibleBlockHelper(this.isReverting());
    await this.executeBlock(async () => {
      fn(helper);
      for (const f of helper[toRun]) await f();
    });
  }

  async upOnly(fn?: () => Promise<void>): Promise<void> {
    if (!this.isReverting() && fn) {
      await this.executeBlock(fn);
    }
  }

  async migrate(direction: "up" | "down"): Promise<void> {
    if (typeof this[direction] !== "function") return;
    this.announce(direction === "up" ? "migrating" : "reverting");
    let timeElapsed = 0;
    const pool = migrationArConfig()!.databaseTasks().migrationConnection().pool as ConnectionPool;
    await pool.withConnection(async (conn) => {
      const start = Date.now();
      await this.execMigration(conn, direction);
      timeElapsed = (Date.now() - start) / 1000;
    });
    const elapsed = timeElapsed.toFixed(4);
    this.announce(`${direction === "up" ? "migrated" : "reverted"} (${elapsed}s)`);
    this.write();
  }

  isReverting(): boolean {
    const connection = this.connection;
    return isCommandRecorder(connection) && connection.reverting;
  }

  async viewExists(viewName: string): Promise<boolean | null> {
    return this.connection.viewExists(viewName);
  }

  async indexExists(
    tableName: string,
    columnName: string | string[],
    options?: { unique?: boolean; name?: string; valid?: boolean },
  ): Promise<boolean> {
    if (options !== undefined) {
      return this.connection.indexExists(this._pt(tableName), columnName, options);
    }
    return this.connection.indexExists(this._pt(tableName), columnName);
  }

  static get(_version: string): Migration | null {
    return null;
  }

  get version(): number | undefined {
    return this._version;
  }

  write(text = ""): void {
    if (Migration.verbose) {
      stdout.write(`${text}\n`);
    }
  }

  announce(message: string): void {
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

  get connection(): A {
    return (this._connectionOverride ??
      migrationArConfig()!.databaseTasks().migrationConnection()) as A;
  }

  set connection(conn: DatabaseAdapter | CommandRecorder | undefined) {
    this._connectionOverride = conn;
  }

  get connectionPool(): ConnectionPool {
    return this._poolOverride ?? migrationArConfig()!.databaseTasks().migrationConnectionPool();
  }

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

  static readonly MigrationFilenameRegexp = /^([0-9]+)_([_a-z0-9]*)\.?([_a-z0-9]*)?\.(?:ts|js)$/;

  static isValidVersionFormat(versionString: string): boolean {
    return [Migration.MigrationFilenameRegexp, /^\d(_?\d)*$/].some((pattern) =>
      pattern.test(versionString),
    );
  }

  static nextMigrationNumber(number?: number | bigint | string): string {
    const raw =
      number == null
        ? 0n
        : typeof number === "bigint"
          ? number
          : BigInt(typeof number === "number" ? Math.max(0, Math.trunc(number)) : number);
    const n = raw < 0n ? 0n : raw;
    if (!ActiveRecord.timestampedMigrations) return n.toString().padStart(3, "0");
    const stamp = Temporal.Now.instant()
      .toString()
      .replace(/[-T:Z.]/g, "")
      .slice(0, 14);
    if (number == null) return stamp;
    return n > BigInt(stamp) ? n.toString().padStart(14, "0") : stamp;
  }

  static properTableName(
    name: string | { tableName?: unknown },
    options: { tableNamePrefix?: string; tableNameSuffix?: string } = {},
  ): string {
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

  /** @missingRailsCall call — PERMANENT */
  static async copy(
    destination: string,
    sources: Record<string, string>,
    options: {
      onSkip?: (scope: string, migration: MigrationProxy) => void;
      onCopy?: (scope: string, migration: MigrationProxy, oldPath: string) => void;
    } = {},
  ): Promise<MigrationProxy[]> {
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
        const ext = path.extname(source.filename) || ".ts";
        const newPath = path.join(destination, `${newVersion}_${fileBase}.${scope}${ext}`);
        const oldPath = source.filename;
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

  static async checkPendingMigrations(): Promise<void> {
    const migrations = await this.pendingMigrations();

    if (migrations.length > 0) {
      throw new PendingMigrationError({ pendingMigrations: migrations });
    }
  }

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

  static async loadSchemaIfPendingBang(): Promise<void> {
    if (await this.anySchemaNeedsUpdate()) {
      await this.loadSchemaBang();
    }

    await this.checkPendingMigrations();
  }

  static async maintainTestSchemaBang(): Promise<void> {
    if (ActiveRecord.maintainTestSchema) {
      await this.nearestDelegate?.suppressMessages(async () => {
        await this.loadSchemaIfPendingBang();
      });
    }
  }

  static get nearestDelegate(): Migration | null {
    return (
      this.delegate ?? (Object.getPrototypeOf(this) as typeof Migration).nearestDelegate ?? null
    );
  }

  static methodMissing(name: string, ...args: unknown[]): unknown {
    const delegate = this.nearestDelegate as unknown as Record<string, unknown> | null;
    if (delegate !== null && typeof delegate[name] === "function") {
      return (delegate[name] as (...a: unknown[]) => unknown).apply(delegate, args);
    }
    throw new TypeError(`undefined method '${name}' for ${this.name}`);
  }

  async methodMissing(name: string, ...args: unknown[]): Promise<unknown> {
    const block = typeof args[args.length - 1] === "function" ? args.pop() : undefined;
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
      if (block !== undefined) args.push(block);
      return await strategy.methodMissing?.(name, ...args);
    });
  }

  /** @internal */
  async executeBlock(fn: () => Promise<void>): Promise<void> {
    const connection = this.connection as unknown as Record<string, unknown>;
    if (typeof connection["executeBlock"] === "function") {
      await this.methodMissing("executeBlock", fn);
      return;
    }
    await fn();
  }

  /** @internal */
  formatArguments(arguments_: unknown[]): string {
    const argList = arguments_.slice(0, -1).map((a) => rubyInspect(a));
    const last = arguments_[arguments_.length - 1];
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
  private static async anySchemaNeedsUpdate(): Promise<boolean> {
    const databaseTasks = migrationArConfig()!.databaseTasks();

    for (const dbConfig of this.dbConfigsInCurrentEnv()) {
      if (!(await databaseTasks.schemaUpToDate(dbConfig, databaseTasks.schemaFormat))) return true;
    }
    return false;
  }

  /** @internal */
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

  /** @internal */
  private static dbConfigsInCurrentEnv(): DatabaseConfig[] {
    return migrationArConfig()!.configurations().configsFor({ envName: this.env() });
  }

  /**
   * @internal Mirrors: `ActiveRecord::Migration.env` (`migration.rb:771-773`).
   *
   * @missingRailsCall call — CONVERGEABLE: Rails invokes the
   *   `ActiveRecord::ConnectionHandling::DEFAULT_ENV` Proc
   *   (`DEFAULT_ENV.call`, migration.rb:772); trails has no ported
   *   `DEFAULT_ENV` Proc yet and reads the env vars here directly. Convergence
   *   is RFC 0023 story `port-connection-handling-default-env-proc`.
   */
  static env(): string {
    return getEnv("TRAILS_ENV") ?? getEnv("NODE_ENV") ?? "development";
  }

  /** @internal */
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
      const schemaFormat = (getEnv("SCHEMA_FORMAT") ?? databaseTasks.schemaFormat) as SchemaFormat;
      await databaseTasks.loadSchema(dbConfig, schemaFormat);
    });
  }
}

export interface MigrationProxy {
  version: number;
  name: string;
  filename?: string;
  scope?: string;
  migration: () => Migration | Promise<Migration>;
  /** @internal */
  basename?(): string;
  /** @internal */
  loadMigration?(): Promise<Migration>;
}

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

function toInteger(value: string): number {
  const match = value.match(/^\s*(-?\d+)/);
  if (!match) return 0;
  return Number(match[1]);
}

function byVersion(a: MigrationProxy, b: MigrationProxy): number {
  return a.version - b.version;
}

/** @internal */
type SeatedCollaborators<S, I> = [S] extends [SchemaMigration]
  ? [I] extends [InternalMetadata]
    ? [] | [schemaMigration: S] | [schemaMigration: S, internalMetadata: I]
    : [schemaMigration: S, internalMetadata: I]
  : [I] extends [InternalMetadata]
    ? [schemaMigration: S] | [schemaMigration: S, internalMetadata: I]
    : [schemaMigration: S, internalMetadata: I];

export class MigrationContext<
  S extends SchemaMigration | NullSchemaMigration = SchemaMigration,
  I extends InternalMetadata | NullInternalMetadata = InternalMetadata,
> {
  readonly migrationsPaths: string[];
  readonly schemaMigration: S;
  readonly internalMetadata: I;

  constructor(migrationsPaths: string[], ...seated: SeatedCollaborators<S, I>) {
    const [schemaMigration, internalMetadata] = seated;
    this.migrationsPaths = migrationsPaths;
    this.schemaMigration = schemaMigration ?? (new SchemaMigration(this.connectionPool()) as S);
    this.internalMetadata = internalMetadata ?? (new InternalMetadata(this.connectionPool()) as I);
  }

  private connectionPool(): ConnectionPool {
    return migrationArConfig()!.databaseTasks().migrationConnectionPool();
  }

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

  async up(
    this: MigrationContext,
    targetVersion?: number | string | null,
    block?: (m: MigrationProxy) => boolean,
  ): Promise<MigrationProxy[]> {
    const selectedMigrations = block ? this.migrations.filter(block) : this.migrations;
    return new Migrator(
      "up",
      selectedMigrations,
      this.schemaMigration,
      this.internalMetadata,
      targetVersion,
    ).migrate();
  }

  async down(
    this: MigrationContext,
    targetVersion?: number | string | null,
    block?: (m: MigrationProxy) => boolean,
  ): Promise<MigrationProxy[]> {
    const selectedMigrations = block ? this.migrations.filter(block) : this.migrations;
    return new Migrator(
      "down",
      selectedMigrations,
      this.schemaMigration,
      this.internalMetadata,
      targetVersion,
    ).migrate();
  }

  async rollback(this: MigrationContext, steps: number = 1): Promise<MigrationProxy[]> {
    return this.move("down", steps);
  }

  async forward(this: MigrationContext, steps: number = 1): Promise<MigrationProxy[]> {
    return this.move("up", steps);
  }

  async run(
    this: MigrationContext,
    direction: "up" | "down",
    targetVersion: number | string,
  ): Promise<number | undefined> {
    return new Migrator(
      direction,
      this.migrations,
      this.schemaMigration,
      this.internalMetadata,
      targetVersion,
    ).run();
  }

  open(this: MigrationContext): Migrator {
    return new Migrator("up", this.migrations, this.schemaMigration, this.internalMetadata);
  }

  async migrationsStatus(
    this: MigrationContext,
  ): Promise<Array<{ status: "up" | "down"; version: string; name: string }>> {
    const dbList = new Set(await this.schemaMigration.normalizedVersions());

    const fileList = this.migrationFiles().map((file) => {
      const parsed = this.parseMigrationFilename(file);
      if (!parsed) throw new IllegalMigrationNameError(file);
      let version = parsed[0];
      const name = parsed[1];
      const scope = parsed[2];
      if (this.isValidateTimestamp() && !this.isValidMigrationTimestamp(version)) {
        throw new InvalidMigrationTimestampError(version, name);
      }
      version = SchemaMigration.normalizeMigrationNumber(version);
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
   * Mirrors: ActiveRecord::MigrationContext#current_environment
   * (`migration.rb:1340-1342`) — `ConnectionHandling::DEFAULT_ENV.call`, whose
   * trails counterpart is {@link DatabaseConfigurations.defaultEnv}.
   *
   * @missingRailsCall call — CONVERGEABLE: Rails invokes the
   *   `ActiveRecord::ConnectionHandling::DEFAULT_ENV` Proc
   *   (`DEFAULT_ENV.call`, migration.rb:1341); trails has no ported
   *   `DEFAULT_ENV` Proc yet, so this reads
   *   `DatabaseConfigurations.defaultEnv` instead. Convergence is RFC 0023
   *   story `port-connection-handling-default-env-proc`.
   */
  get currentEnvironment(): string {
    return DatabaseConfigurations.defaultEnv;
  }

  async protectedEnvironment(this: MigrationContext): Promise<boolean> {
    const stored = await this.lastStoredEnvironment();
    if (!stored) return false;
    const { Base } = await import("./base.js");
    return (Base.protectedEnvironments ?? ["production"]).includes(stored);
  }

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

  async getAllVersions(this: MigrationContext): Promise<number[]> {
    if (await this.schemaMigration.tableExists()) {
      return this.schemaMigration.integerVersions();
    }
    return [];
  }

  async currentVersion(this: MigrationContext): Promise<number | undefined> {
    try {
      const versions = await this.getAllVersions();
      return versions.length > 0 ? Math.max(...versions) : 0;
    } catch (error) {
      if (error instanceof NoDatabaseError) return undefined;
      throw error;
    }
  }

  /** @missingRailsCall size — PERMANENT */
  async needsMigration(this: MigrationContext): Promise<boolean> {
    return (await this.pendingMigrationVersions()).length > 0;
  }

  async pendingMigrationVersions(this: MigrationContext): Promise<number[]> {
    const applied = new Set(await this.getAllVersions());
    return this.migrations.map((m) => m.version).filter((v) => !applied.has(v));
  }

  get migrations(): MigrationProxy[] {
    const migrations = this.migrationFiles().map((file) => {
      const parsed = this.parseMigrationFilename(file);
      if (!parsed) throw new IllegalMigrationNameError(file);
      let version: string | number = parsed[0];
      let name = parsed[1];
      const scope = parsed[2];
      if (this.isValidateTimestamp() && !this.isValidMigrationTimestamp(version)) {
        throw new InvalidMigrationTimestampError(version, name);
      }
      version = toInteger(version);
      name = camelize(name);
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

  /** @internal */
  protected migrationFiles(): string[] {
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

    const isTs = (file: string): boolean => file.endsWith(".ts");
    const byBasename = new Map<string, string>();
    for (const file of files.sort()) {
      const parsed = this.parseMigrationFilename(file);
      if (!parsed) continue;
      const key = `${parsed[0]}_${parsed[1]}`;
      const kept = byBasename.get(key);
      if (kept === undefined || (isTs(file) && !isTs(kept))) {
        byBasename.set(key, file);
      }
    }
    return [...byBasename.values()].sort();
  }

  /**
   * @internal
   * @missingRailsCall first — PERMANENT
   */
  protected parseMigrationFilename(filename: string): [string, string, string] | null {
    const base = filename.replace(/.*[/\\]/, "");
    const m = base.match(/^([0-9]+)_([_a-z0-9]*)\.?([_a-z0-9]*)?\.(?:ts|js)$/);
    if (!m) return null;
    return [m[1], m[2], m[3] ?? ""];
  }

  /** @internal */
  private isValidateTimestamp(): boolean {
    return ActiveRecord.timestampedMigrations && ActiveRecord.validateMigrationTimestamps;
  }

  /** @internal */
  private isValidMigrationTimestamp(version: string | number): boolean {
    const tomorrow = Temporal.Now.plainDateTimeISO("UTC").add({ days: 1 });
    const limit = Number(
      `${tomorrow.year}${String(tomorrow.month).padStart(2, "0")}${String(tomorrow.day).padStart(2, "0")}${String(tomorrow.hour).padStart(2, "0")}${String(tomorrow.minute).padStart(2, "0")}${String(tomorrow.second).padStart(2, "0")}`,
    );
    return Number(version) < limit;
  }

  /** @internal */
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
  static migrationsPaths: string[] = ["db/migrate"];

  private _migrations: MigrationProxy[];
  private _schemaMigration: SchemaMigration;
  private _internalMetadata: InternalMetadata;
  private readonly _direction: "up" | "down";
  private readonly _targetVersion: number | null;
  private _migratedVersions?: Set<number>;

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

  get migrations(): MigrationProxy[] {
    return this.isDown() ? [...this._migrations].reverse() : this._sortMigrations(this._migrations);
  }

  private static readonly _MIGRATOR_SALT = 2053462845;

  /** @internal */
  async withAdvisoryLock<T>(fn: () => Promise<T>): Promise<T> {
    const lockId = await this.generateMigratorAdvisoryLockId();
    const gotLock = await this.connection.getAdvisoryLock(lockId);
    if (!gotLock) {
      throw new ConcurrentMigrationError();
    }
    await this._ensureSchemaTable();
    await this.loadMigrated();
    const _sentinel = Symbol();
    let fnResult: T | typeof _sentinel = _sentinel;
    let fnError: unknown = _sentinel;
    try {
      fnResult = await fn();
    } catch (e) {
      fnError = e;
    }
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

  async run(): Promise<number | undefined> {
    return this.isUseAdvisoryLock()
      ? this.withAdvisoryLock(() => this.runWithoutLock())
      : this.runWithoutLock();
  }

  async migrate(): Promise<MigrationProxy[]> {
    return this.isUseAdvisoryLock()
      ? this.withAdvisoryLock(() => this.migrateWithoutLock())
      : this.migrateWithoutLock();
  }

  /** @internal */
  async runWithoutLock(): Promise<number | undefined> {
    await this._ensureSchemaTable();
    const migration = this._migrations.find((m) => m.version === this._targetVersion);
    if (!migration) throw new UnknownMigrationVersionError(this._targetVersion ?? "");
    await this.recordEnvironment();
    return this.executeMigrationInTransaction(migration);
  }

  /** @internal */
  async migrateWithoutLock(): Promise<MigrationProxy[]> {
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

  /** @internal */
  isUp(): boolean {
    return this._direction === "up";
  }

  /** @internal */
  isDown(): boolean {
    return this._direction === "down";
  }

  /** @internal */
  async recordEnvironment(): Promise<void> {
    if (this.isDown()) return;
    if (this._internalMetadata.enabled) {
      await this._internalMetadata.set(
        "environment",
        this.connection.pool.dbConfig.envName as string,
      );
    }
  }

  /** @internal */
  private get connection(): DatabaseAdapter {
    return migrationArConfig()!.databaseTasks().migrationConnection();
  }

  /** @internal */
  async isRan(migration: MigrationProxy): Promise<boolean> {
    const applied = await this.migrated();
    return applied.has(migration.version);
  }

  /** @internal */
  isInvalidTarget(): boolean {
    return this._targetVersion !== null && this._targetVersion !== 0 && !this.target();
  }

  /** @internal */
  async executeMigrationInTransaction(migration: MigrationProxy): Promise<number | undefined> {
    try {
      const applied = await this.migrated();
      if (this.isDown() && !applied.has(migration.version)) return undefined;
      if (this.isUp() && applied.has(migration.version)) return undefined;

      if (_base?.logger)
        _base.logger.info?.(`Migrating to ${migration.name} (${migration.version})`);

      await this.ddlTransaction(migration, async () => {
        await (await migration.migration()).migrate(this._direction);
        await this.recordVersionStateAfterMigrating(migration.version);
      });
    } catch (e) {
      const useTx = await this.isUseTransaction(migration);
      const msg = `An error has occurred, ${useTx ? "this and " : ""}all later migrations canceled:\n\n${e instanceof Error ? e.message : e}`;
      throw Object.assign(new Error(msg), { cause: e });
    }
    return migration.version;
  }

  /** @internal */
  private target(): MigrationProxy | undefined {
    if (this._targetVersion === null) return undefined;
    return this.migrations.find((m) => m.version === this._targetVersion);
  }

  /** @internal */
  private finish(): number {
    const migrations = this.migrations;
    const target = this.target();
    const index = target ? migrations.findIndex((m) => m.version === target.version) : -1;
    return index === -1 ? migrations.length - 1 : index;
  }

  /** @internal */
  private async start(): Promise<number> {
    if (this.isUp()) return 0;
    const current = await this.current();
    const index = current ? this.migrations.findIndex((m) => m.version === current.version) : -1;
    return index === -1 ? 0 : index;
  }

  /** @internal */
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

  /** @internal */
  isUseAdvisoryLock(): boolean {
    return this.connection.isAdvisoryLocksEnabled();
  }

  /** @internal */
  async generateMigratorAdvisoryLockId(): Promise<bigint> {
    const dbNameHash = Zlib.crc32(await this.connection.currentDatabase!());
    return BigInt(Migrator._MIGRATOR_SALT) * BigInt(dbNameHash);
  }

  async currentVersion(): Promise<number> {
    const migrated = await this.migrated();
    return migrated.size > 0 ? Math.max(...migrated) : 0;
  }

  private _sortMigrations(migrations: MigrationProxy[]): MigrationProxy[] {
    return [...migrations].sort(byVersion);
  }

  /** @internal */
  private validate(migrations: MigrationProxy[]): void {
    const [name] = [...groupBy(migrations, (m) => m.name)].find(([, v]) => v.length > 1) ?? [];
    if (name != null) throw new DuplicateMigrationNameError(name);

    const [version] =
      [...groupBy(migrations, (m) => m.version)].find(([, v]) => v.length > 1) ?? [];
    if (version != null) throw new DuplicateMigrationVersionError(version);
  }

  private _schemaTablesEnsured?: Promise<void>;

  private _ensureSchemaTable(): Promise<void> {
    return (this._schemaTablesEnsured ??= (async () => {
      await this._schemaMigration.createTable();
      await this._internalMetadata.createTable();
    })());
  }

  private async _appliedVersions(): Promise<Set<number>> {
    return new Set(await this._schemaMigration.integerVersions());
  }

  /** @internal */
  async ddlTransaction(migration: MigrationProxy, fn: () => Promise<void>): Promise<void> {
    if (await this.isUseTransaction(migration)) {
      await this.connection.transaction(fn);
    } else {
      await fn();
    }
  }

  /** @internal */
  async isUseTransaction(migration: MigrationProxy): Promise<boolean> {
    if ((await migration.migration()).disableDdlTransaction) return false;
    return this.connection.supportsDdlTransactions?.() ?? false;
  }

  async currentMigration(): Promise<MigrationProxy | null> {
    const currentVersion = await this.currentVersion();
    return this.migrations.find((m) => m.version === currentVersion) ?? null;
  }

  async current(): Promise<MigrationProxy | null> {
    return this.currentMigration();
  }

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

  async pendingMigrations(): Promise<MigrationProxy[]> {
    const alreadyMigrated = await this.migrated();
    return this.migrations.filter((m) => !alreadyMigrated.has(m.version));
  }

  async migrated(): Promise<Set<number>> {
    return this._migratedVersions ?? this.loadMigrated();
  }

  async loadMigrated(): Promise<Set<number>> {
    await this._ensureSchemaTable();
    return (this._migratedVersions = await this._appliedVersions());
  }
}

export class Current<A extends DatabaseAdapter = DatabaseAdapter> extends Migration<A> {
  static readonly VERSION = CURRENT_VERSION;

  override async createTable(
    tableName: string,
    options?:
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
      | ((t: TableDefinitionOf<A>) => void),
    fn?: (t: TableDefinitionOf<A>) => void,
  ): Promise<void> {
    const block = typeof options === "function" ? options : fn;
    if (block === undefined) {
      await super.createTable(tableName, options);
    } else if (options === undefined || options === block) {
      await super.createTable(tableName, (t) => block(this.compatibleTableDefinition(t)));
    } else {
      await super.createTable(tableName, options, (t) => block(this.compatibleTableDefinition(t)));
    }
  }

  override async changeTable(
    tableName: string,
    options?: ((t: TableOf<A>) => void | Promise<void>) | { bulk?: boolean },
    fn?: (t: TableOf<A>) => void | Promise<void>,
  ): Promise<void> {
    const block = typeof options === "function" ? options : fn;
    if (block === undefined) {
      await super.changeTable(tableName, options);
    } else if (options === undefined || options === block) {
      await super.changeTable(tableName, (t) => block(this.compatibleTableDefinition(t)));
    } else {
      await super.changeTable(tableName, options, (t) => block(this.compatibleTableDefinition(t)));
    }
  }

  override async createJoinTable(
    table1: string,
    table2: string,
    options?: JoinTableOptions | ((t: TableDefinitionOf<A>) => void),
    fn?: (t: TableDefinitionOf<A>) => void,
  ): Promise<void> {
    const block = typeof options === "function" ? options : fn;
    if (block === undefined) {
      await super.createJoinTable(table1, table2, options);
    } else if (options === undefined || options === block) {
      await super.createJoinTable(table1, table2, (t) => block(this.compatibleTableDefinition(t)));
    } else {
      await super.createJoinTable(table1, table2, options, (t) =>
        block(this.compatibleTableDefinition(t)),
      );
    }
  }

  override async dropTable(
    ...args: Array<
      | string
      | { ifExists?: boolean; force?: boolean | "cascade"; temporary?: boolean }
      | ((t: TableDefinition) => void)
    >
  ): Promise<void> {
    const rest = [...args];
    const block = (typeof rest[rest.length - 1] === "function" ? rest.pop() : undefined) as
      | ((t: TableDefinition) => void)
      | undefined;
    if (block !== undefined) {
      await super.dropTable(...rest, (t: TableDefinition) =>
        block(this.compatibleTableDefinition(t)),
      );
    } else {
      await super.dropTable(...rest);
    }
  }

  compatibleTableDefinition<T>(t: T): T {
    return t;
  }
}

registerVersion(CURRENT_VERSION, Current);

export class CheckPending {
  private app: (env: Record<string, unknown>) => Promise<unknown>;
  private needsCheck: boolean;
  private mutex: Monitor;
  private fileWatcher: typeof FileUpdateChecker;
  private watcher?: FileUpdateChecker;

  constructor(
    app: (env: Record<string, unknown>) => Promise<unknown>,
    { fileWatcher = FileUpdateChecker }: { fileWatcher?: typeof FileUpdateChecker } = {},
  ) {
    this.app = app;
    this.needsCheck = true;
    this.mutex = new Monitor();
    this.fileWatcher = fileWatcher;
  }

  async call(env: Record<string, unknown>): Promise<unknown> {
    await this.mutex.synchronize(async () => {
      this.watcher ??= this.buildWatcher(async () => {
        this.needsCheck = true;
        await Migration.checkPendingMigrations();
        this.needsCheck = false;
      });

      if (this.needsCheck) {
        await this.watcher.execute();
      } else {
        await this.watcher.executeIfUpdated();
      }
    });

    return this.app(env);
  }

  private buildWatcher(block: () => Promise<void> | void): FileUpdateChecker {
    const currentEnvironment = DatabaseConfigurations.defaultEnv;
    const allConfigs = migrationArConfig()!.configurations().configsFor({
      envName: currentEnvironment,
    });
    const paths = [
      ...new Set(
        allConfigs.flatMap((config) => {
          const migrationsPaths = config.migrationsPaths;
          if (migrationsPaths == null) return Migrator.migrationsPaths;
          return Array.isArray(migrationsPaths) ? migrationsPaths : [migrationsPaths];
        }),
      ),
    ];
    return new this.fileWatcher(
      [],
      Object.fromEntries(paths.map((path) => [path, ["ts", "js"]])),
      block,
    );
  }
}

Migration.delegate = new Migration();
