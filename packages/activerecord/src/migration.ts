import {
  getEnv,
  camelize,
  constantize,
  groupBy,
  underscore,
  humanize,
  isPlainObject,
  extractOptionsBang,
  FileUpdateChecker,
  Monitor,
  symbolizeKeys,
  TopLevel,
  Autoload,
  Benchmark,
  extend,
  type Extended,
  wrap,
  filterMap,
} from "@blazetrails/activesupport";
import {
  format,
  max,
  stdout,
  excToS,
  rbFLoad,
  rbFPublicSend,
  rbInspect,
  rbModRemoveConst,
  rbObjRespondTo,
  block as rbBlock,
  rbBlockGivenP,
  rbStrSend,
  toI,
  aryDelete,
} from "@blazetrails/ruby-compat";
import {
  Dir,
  excBacktraceLocations,
  excSetBacktrace,
  excSetupMessage,
  File,
  FileUtils,
  StandardError,
} from "@blazetrails/ruby-compat";
import { ArgumentError } from "@blazetrails/activemodel";
import { NoMethodError, rbFSend, rbObjClassname, Struct, Zlib } from "@blazetrails/ruby-compat";
import { Temporal, Time } from "@blazetrails/date";
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
  type CommentOrChanges,
} from "./connection-adapters/abstract/schema-statements.js";
import type { UniqueConstraintOptions } from "./connection-adapters/postgresql/schema-definitions.js";
import { CommandRecorder } from "./migration/command-recorder.js";
import { SchemaMigration, NullSchemaMigration } from "./schema-migration.js";
import { InternalMetadata, NullInternalMetadata } from "./internal-metadata.js";
import { ActiveRecord } from "./namespaces.js";
import type * as CompatibilityModule from "./migration/compatibility.js";
import type { DatabaseConfig } from "./database-configurations/database-config.js";
import type { SchemaFormat } from "./tasks/database-tasks.js";
import { ExecutionStrategy } from "./migration/execution-strategy.js";
import { DefaultStrategy } from "./migration/default-strategy.js";
import * as JoinTableModule from "./migration/join-table.js";
import { PendingMigrationConnection } from "./migration/pending-migration-connection.js";
import { VERSION } from "./gem-version.js";

export type {
  ReferentialAction,
  AddForeignKeyOptions,
} from "./connection-adapters/abstract/schema-definitions.js";

export { ExecutionStrategy, DefaultStrategy };
export { PendingMigrationConnection } from "./migration/pending-migration-connection.js";

import { ActiveRecordError, NoDatabaseError } from "./errors.js";
import {
  maintainTestSchema,
  migrationStrategy,
  schemaFormat as _schemaFormat,
  timestampedMigrations,
  validateMigrationTimestamps,
} from "./active-record.js";

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
    this.name = "ActiveRecord::MigrationError";
  }
}

export class IrreversibleMigration extends MigrationError {
  constructor(message = "This migration uses a feature that is not reversible.") {
    super(message);
    this.name = "ActiveRecord::IrreversibleMigration";
  }
}

export class DuplicateMigrationVersionError extends MigrationError {
  constructor(version: string | number) {
    super(`Multiple migrations have the version number ${version}.`);
    this.name = "ActiveRecord::DuplicateMigrationVersionError";
  }
}

export class DuplicateMigrationNameError extends MigrationError {
  constructor(name: string) {
    super(`Multiple migrations have the name ${name}.`);
    this.name = "ActiveRecord::DuplicateMigrationNameError";
  }
}

export class UnknownMigrationVersionError extends MigrationError {
  constructor(version: string | number) {
    super(`No migration with version number ${version}.`);
    this.name = "ActiveRecord::UnknownMigrationVersionError";
  }
}

export class IllegalMigrationNameError extends MigrationError {
  constructor(name?: string) {
    super(
      name != null
        ? `Illegal name for migration file: ${name}\n\t(only lower case letters, numbers, and '_' allowed).`
        : "Illegal name for migration.",
    );
    this.name = "ActiveRecord::IllegalMigrationNameError";
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
    this.name = "ActiveRecord::InvalidMigrationTimestampError";
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
    this.name = "ActiveRecord::PendingMigrationError";
  }

  /** @internal */
  detailedMigrationMessage(pendingMigrations: Array<{ filename?: string }>): string {
    let message =
      "Migrations are pending. To resolve this issue, run:\n\n        bin/trails db migrate";
    if (TopLevel.Trails !== undefined && !TopLevel.Trails.env["local?"]()) {
      message += ` TRAILS_ENV=${TopLevel.Trails.env}`;
    }
    message += "\n\n";
    message += `You have ${pendingMigrations.length} pending ${pendingMigrations.length > 1 ? "migrations:" : "migration:"}\n\n`;
    for (const pendingMigration of pendingMigrations) {
      message += `${pendingMigration.filename}\n`;
    }
    return message;
  }
}

export class ConcurrentMigrationError extends MigrationError {
  static readonly RELEASE_LOCK_FAILED_MESSAGE = "Failed to release advisory lock";

  constructor(message = "Cannot run migrations because another migration is currently running.") {
    super(message);
    this.name = "ActiveRecord::ConcurrentMigrationError";
  }
}

export class NoEnvironmentInSchemaError extends MigrationError {
  constructor() {
    const msg =
      "Environment data not found in the schema. To resolve this issue, run: \n\n        bin/trails db environment:set";
    if (TopLevel.Trails !== undefined) {
      super(`${msg} TRAILS_ENV=${TopLevel.Trails.env}`);
    } else {
      super(msg);
    }
    this.name = "ActiveRecord::NoEnvironmentInSchemaError";
  }
}

export class ProtectedEnvironmentError extends ActiveRecordError {
  constructor(env = "production") {
    let msg = `You are attempting to run a destructive action against your '${env}' database.\n`;
    msg +=
      "If you are sure you want to continue, run the same command with the environment variable:\n";
    msg += "DISABLE_DATABASE_ENVIRONMENT_CHECK=1";
    super(msg);
    this.name = "ActiveRecord::ProtectedEnvironmentError";
  }
}

export class EnvironmentMismatchError extends ActiveRecordError {
  constructor({ current, stored }: { current?: string; stored?: string } = {}) {
    let msg = `You are attempting to modify a database that was last run in \`${stored ?? ""}\` environment.\n`;
    msg += `You are running in \`${current ?? ""}\` environment. `;
    msg += `If you are sure you want to continue, first set the environment using:\n\n`;
    msg += `        bin/trails db environment:set`;
    if (TopLevel.Trails !== undefined) {
      super(`${msg} TRAILS_ENV=${TopLevel.Trails.env}\n\n`);
    } else {
      super(`${msg}\n\n`);
    }
    this.name = "ActiveRecord::EnvironmentMismatchError";
  }
}

export class EnvironmentStorageError extends ActiveRecordError {
  constructor() {
    let msg =
      "You are attempting to store the environment in a database where metadata is disabled.\n";
    msg += "Check your database configuration to see if this is intended.";
    super(msg);
    this.name = "ActiveRecord::EnvironmentStorageError";
  }
}

/** @internal */
let migrationVerbose: boolean | undefined = true;

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

export class ReversibleBlockHelper extends Struct.new("reverting") {
  declare reverting: boolean;

  up<T>(block: () => T): T | undefined {
    if (!this.reverting) return block();
  }

  down<T>(block: () => T): T | undefined {
    if (this.reverting) return block();
  }
}

export type MigrationClass = new () => Migration;

type MigrationRunOptions = { direction?: "up" | "down"; revert?: boolean };

function isCommandRecorder(connection: unknown): connection is CommandRecorder {
  return connection instanceof CommandRecorder;
}

export class Migration<A extends DatabaseAdapter = DatabaseAdapter> {
  /** @internal */
  protected _connectionOverride?: DatabaseAdapter | CommandRecorder;
  /** @internal */
  protected _poolOverride?: ConnectionPool;
  private _executionStrategy?: ExecutionStrategy;
  private _name: string | null;
  static delegate: Migration | null = null;
  private _version?: number;

  static get verbose(): boolean | undefined {
    return migrationVerbose;
  }

  static set verbose(value: boolean | undefined) {
    migrationVerbose = value;
  }

  get verbose(): boolean | undefined {
    return migrationVerbose;
  }

  set verbose(value: boolean | undefined) {
    migrationVerbose = value;
  }
  private static _disableDdlTransaction = false;

  constructor(name: string | null = new.target.name || null, version?: number) {
    this._name = name;
    this._version = version;
  }

  static async migrate(direction: "up" | "down"): Promise<void> {
    await new (this as unknown as new () => Migration)().migrate(direction);
  }

  async up(): Promise<void> {
    const klass = this.constructor as typeof Migration & { up?: () => Promise<void> };
    klass.delegate = this;
    if (!rbObjRespondTo(klass, "up")) return;
    await klass.up!();
  }

  async down(): Promise<void> {
    const klass = this.constructor as typeof Migration & { down?: () => Promise<void> };
    klass.delegate = this;
    if (!rbObjRespondTo(klass, "down")) return;
    await klass.down!();
  }

  /** @internal */
  protected _pt(name: string): string {
    if (isCommandRecorder(this.connection)) return name;
    return Migration.properTableName(name, Migration.tableNameOptions());
  }

  async createTable(
    ...args: [
      tableName: string,
      options?:
        | {
            id?: false | ColumnType | IdHashOptions;
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
    ]
  ): Promise<void> {
    await this.methodMissing("createTable", ...args);
  }

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
    const names = (hasOptions ? rest.slice(0, -1) : rest) as [string, ...string[]];
    if (options !== undefined && block !== undefined) {
      await this.methodMissing("dropTable", ...names, options, block);
    } else if (options !== undefined) {
      await this.methodMissing("dropTable", ...names, options);
    } else if (block !== undefined) {
      await this.methodMissing("dropTable", ...names, block);
    } else {
      await this.methodMissing("dropTable", ...names);
    }
  }

  async addColumn(
    ...args: [
      tableName: string,
      columnName: string,
      type: ColumnType,
      options?: ColumnOptions & { ifNotExists?: boolean },
    ]
  ): Promise<void> {
    await this.methodMissing("addColumn", ...args);
  }

  async removeColumn(
    tableName: string,
    columnName: string,
    typeOrOptions?: ColumnType | { ifExists?: boolean },
    options?: { ifExists?: boolean },
  ): Promise<void> {
    const type = typeof typeOrOptions === "string" ? typeOrOptions : undefined;
    const opts = typeof typeOrOptions === "object" ? typeOrOptions : options;
    if (opts !== undefined) {
      await this.methodMissing("removeColumn", tableName, columnName, type, opts);
    } else if (type !== undefined) {
      await this.methodMissing("removeColumn", tableName, columnName, type);
    } else {
      await this.methodMissing("removeColumn", tableName, columnName);
    }
  }

  async renameColumn(tableName: string, oldName: string, newName: string): Promise<void> {
    await this.methodMissing("renameColumn", tableName, oldName, newName);
  }

  async addIndex(
    ...args: [tableName: string, columns: string | string[], options?: AddIndexOptions]
  ): Promise<unknown> {
    return await this.methodMissing("addIndex", ...args);
  }

  async removeIndex(
    ...args: [
      tableName: string,
      columnOrOptions?:
        | string
        | string[]
        | { column?: string | string[]; name?: string; ifExists?: boolean },
      options?: { column?: string | string[]; name?: string; ifExists?: boolean },
    ]
  ): Promise<unknown> {
    return await this.methodMissing("removeIndex", ...args);
  }

  async changeColumn(
    ...args: [tableName: string, columnName: string, type: ColumnType, options?: ColumnOptions]
  ): Promise<void> {
    await this.methodMissing("changeColumn", ...args);
  }

  async renameTable(
    oldName: string,
    newName: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    if (options !== undefined) {
      await this.methodMissing("renameTable", oldName, newName, options);
    } else {
      await this.methodMissing("renameTable", oldName, newName);
    }
  }

  async tableExists(tableName: string): Promise<boolean | null> {
    return (await this.methodMissing("tableExists", tableName)) as boolean | null;
  }

  async columnExists(
    tableName: string,
    columnName: string,
    type?: string | null,
    options?: ColumnExistsOptions,
  ): Promise<boolean> {
    if (options !== undefined) {
      return (await this.methodMissing(
        "columnExists",
        tableName,
        columnName,
        type,
        options,
      )) as boolean;
    } else if (type !== undefined) {
      return (await this.methodMissing("columnExists", tableName, columnName, type)) as boolean;
    }
    return (await this.methodMissing("columnExists", tableName, columnName)) as boolean;
  }

  async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    await this.methodMissing("changeColumnDefault", tableName, columnName, defaultOrChanges);
  }

  async changeColumnNull(
    tableName: string,
    columnName: string,
    allowNull: boolean,
    defaultValue?: unknown,
  ): Promise<void> {
    if (defaultValue !== undefined) {
      await this.methodMissing("changeColumnNull", tableName, columnName, allowNull, defaultValue);
    } else {
      await this.methodMissing("changeColumnNull", tableName, columnName, allowNull);
    }
  }

  async addReference(
    ...args: [
      tableName: string,
      refName: string,
      options?: ColumnOptions & {
        polymorphic?: boolean;
        foreignKey?: boolean;
        type?: ColumnType;
        index?: boolean;
      },
    ]
  ): Promise<void> {
    await this.methodMissing("addReference", ...args);
  }

  async addBelongsTo(
    ...args: [
      tableName: string,
      refName: string,
      options?: ColumnOptions & {
        polymorphic?: boolean;
        foreignKey?: boolean;
        type?: ColumnType;
        index?: boolean;
      },
    ]
  ): Promise<void> {
    await this.methodMissing("addBelongsTo", ...args);
  }

  async removeReference(
    ...args: [tableName: string, refName: string, options?: { polymorphic?: boolean }]
  ): Promise<void> {
    await this.methodMissing("removeReference", ...args);
  }

  async removeBelongsTo(
    ...args: [tableName: string, refName: string, options?: { polymorphic?: boolean }]
  ): Promise<void> {
    await this.methodMissing("removeBelongsTo", ...args);
  }

  async addForeignKey(
    ...args: [fromTable: string, toTable: string, options?: AddForeignKeyOptions]
  ): Promise<void> {
    await this.methodMissing("addForeignKey", ...args);
  }

  async removeForeignKey(
    fromTable: string,
    toTable?: string | null,
    options?: { column?: string; name?: string; toTable?: string; ifExists?: boolean },
  ): Promise<void> {
    if (options !== undefined) {
      await this.methodMissing("removeForeignKey", fromTable, toTable, options);
    } else if (toTable !== undefined) {
      await this.methodMissing("removeForeignKey", fromTable, toTable);
    } else {
      await this.methodMissing("removeForeignKey", fromTable);
    }
  }

  async addCheckConstraint(
    ...args: [
      tableName: string,
      expression: string,
      options?: {
        name?: string;
        validate?: boolean;
        ifNotExists?: boolean;
        [key: string]: unknown;
      },
    ]
  ): Promise<void> {
    await this.methodMissing("addCheckConstraint", ...args);
  }

  async removeCheckConstraint(
    tableName: string,
    expression?: string | null,
    options?: { name?: string; ifExists?: boolean },
  ): Promise<void> {
    if (options !== undefined) {
      await this.methodMissing("removeCheckConstraint", tableName, expression, options);
    } else if (expression !== undefined) {
      await this.methodMissing("removeCheckConstraint", tableName, expression);
    } else {
      await this.methodMissing("removeCheckConstraint", tableName);
    }
  }

  async validateCheckConstraint(
    tableName: string,
    options: { name?: string; expression?: string | null; validate?: boolean } = {},
  ): Promise<void> {
    await this.methodMissing("validateCheckConstraint", tableName, options);
  }

  async validateForeignKey(
    fromTable: string,
    toTable?: string | null,
    options?: Omit<ForeignKeyLookupOptions, "toTable">,
  ): Promise<void> {
    if (options !== undefined) {
      await this.methodMissing("validateForeignKey", fromTable, toTable, options);
    } else if (toTable !== undefined) {
      await this.methodMissing("validateForeignKey", fromTable, toTable);
    } else {
      await this.methodMissing("validateForeignKey", fromTable);
    }
  }

  async changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: CommentOrChanges,
  ): Promise<void> {
    await this.methodMissing("changeColumnComment", tableName, columnName, commentOrChanges);
  }

  async changeTableComment(tableName: string, commentOrChanges: CommentOrChanges): Promise<void> {
    await this.methodMissing("changeTableComment", tableName, commentOrChanges);
  }

  async createSchema(schemaName: string): Promise<void> {
    await this.methodMissing("createSchema", schemaName);
  }

  async createVirtualTable(tableName: string, moduleName: string, values: string[]): Promise<void> {
    await this.methodMissing("createVirtualTable", tableName, moduleName, values);
  }

  async enableExtension(name: string, options?: Record<string, unknown>): Promise<void> {
    if (options !== undefined) {
      await this.methodMissing("enableExtension", name, options);
    } else {
      await this.methodMissing("enableExtension", name);
    }
  }

  async disableExtension(name: string, options?: { force?: "cascade" }): Promise<void> {
    if (options !== undefined) {
      await this.methodMissing("disableExtension", name, options);
    } else {
      await this.methodMissing("disableExtension", name);
    }
  }

  async createEnum(
    name: string,
    values: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    if (options !== undefined) {
      await this.methodMissing("createEnum", name, values, options);
    } else {
      await this.methodMissing("createEnum", name, values);
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
    const opts = isOptsObj ? valuesOrOptions : options;
    if (opts !== undefined) {
      await this.methodMissing("dropEnum", name, values, opts);
    } else if (values !== undefined) {
      await this.methodMissing("dropEnum", name, values);
    } else {
      await this.methodMissing("dropEnum", name);
    }
  }

  async renameEnumValue(name: string, options: { from: string; to: string }): Promise<void> {
    await this.methodMissing("renameEnumValue", name, options);
  }

  async addUniqueConstraint(
    tableName: string,
    columnName?: string | string[],
    options?: UniqueConstraintOptions,
  ): Promise<void> {
    if (options !== undefined) {
      await this.methodMissing("addUniqueConstraint", tableName, columnName, options);
    } else if (columnName !== undefined) {
      await this.methodMissing("addUniqueConstraint", tableName, columnName);
    } else {
      await this.methodMissing("addUniqueConstraint", tableName);
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
    const opts = isOptsObj ? columnNameOrOptions : options;
    if (opts !== undefined) {
      await this.methodMissing("removeUniqueConstraint", tableName, columnName, opts);
    } else if (columnName !== undefined) {
      await this.methodMissing("removeUniqueConstraint", tableName, columnName);
    } else {
      await this.methodMissing("removeUniqueConstraint", tableName);
    }
  }

  async addTimestamps(...args: [tableName: string, options?: ColumnOptions]): Promise<void> {
    await this.methodMissing("addTimestamps", ...args);
  }

  async removeTimestamps(tableName: string): Promise<void> {
    await this.methodMissing("removeTimestamps", tableName);
  }

  async createJoinTable(
    ...args: [
      table1: string,
      table2: string,
      options?: JoinTableOptions | ((t: TableDefinitionOf<A>) => void),
      fn?: (t: TableDefinitionOf<A>) => void,
    ]
  ): Promise<void> {
    await this.methodMissing("createJoinTable", ...args);
  }

  async dropJoinTable(
    table1: string,
    table2: string,
    options?: { tableName?: string },
  ): Promise<void> {
    if (options !== undefined) {
      await this.methodMissing("dropJoinTable", table1, table2, options);
    } else {
      await this.methodMissing("dropJoinTable", table1, table2);
    }
  }

  async changeTable(
    tableName: string,
    options?: ((t: TableOf<A>) => void | Promise<void>) | { bulk?: boolean },
    fn?: (t: TableOf<A>) => void | Promise<void>,
  ): Promise<void> {
    if (typeof options === "function") {
      await this.methodMissing("changeTable", tableName, {}, options);
    } else {
      await this.methodMissing("changeTable", tableName, options ?? {}, fn);
    }
  }

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    await this.methodMissing("renameIndex", tableName, oldName, newName);
  }

  async indexName(
    tableName: string,
    options: { column?: string | string[]; name?: string; _usesLegacyIndexName?: boolean },
  ): Promise<string> {
    return (await this.connection).indexName(this._pt(tableName), options);
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
    await this.methodMissing("removeColumns", tableName, ...columnsOrOptions);
  }

  async addColumns(
    tableName: string,
    ...args: [...string[], { type: ColumnType } & ColumnOptions]
  ): Promise<void>;
  async addColumns(
    tableName: string,
    ...columnsAndOptions: Array<string | ({ type: ColumnType } & ColumnOptions)>
  ): Promise<void> {
    await this.methodMissing("addColumns", tableName, ...columnsAndOptions);
  }

  async columns(tableName: string): Promise<import("./connection-adapters/column.js").Column[]> {
    return (await this.methodMissing(
      "columns",
      tableName,
    )) as import("./connection-adapters/column.js").Column[];
  }

  async indexes(tableName: string): Promise<IndexDefinition[]> {
    return (await this.methodMissing("indexes", tableName)) as IndexDefinition[];
  }

  async primaryKey(tableName: string): Promise<string | string[] | null> {
    return (await this.methodMissing("primaryKey", tableName)) as string | string[] | null;
  }

  async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    return (await this.methodMissing("foreignKeys", tableName)) as ForeignKeyDefinition[];
  }

  async tables(): Promise<string[]> {
    return (await this.methodMissing("tables")) as string[];
  }

  async views(): Promise<string[]> {
    return (await this.methodMissing("views")) as string[];
  }

  async transaction<T>(
    ...args: Parameters<DatabaseAdapter["transaction"]>
  ): Promise<T | undefined> {
    return (await this.methodMissing("transaction", ...args)) as T | undefined;
  }

  async execute(...args: [sql: string, name?: string | null]): Promise<unknown> {
    return await this.methodMissing("execute", ...args);
  }

  get name(): string | null {
    return this._name;
  }

  async revert(
    ...migrationClasses: Array<MigrationClass | ((...args: never[]) => Promise<void>)>
  ): Promise<void> {
    const block = (
      rbBlockGivenP(migrationClasses[migrationClasses.length - 1])
        ? migrationClasses.pop()
        : undefined
    ) as (() => Promise<void>) | undefined;
    if (migrationClasses.length !== 0) {
      await this.run(...([...migrationClasses].reverse() as MigrationClass[]), { revert: true });
    }
    if (block !== undefined) {
      if (rbObjRespondTo(this.connection, "revert")) {
        await (this.connection as unknown as CommandRecorder).revert(block);
      } else {
        const recorder = await this.commandRecorder();
        this._connectionOverride = recorder;
        await this.suppressMessages(async () => {
          await recorder.revert(block);
        });
        this._connectionOverride = recorder.delegate as DatabaseAdapter;
        await recorder.replay(
          this as unknown as Record<string, (...a: unknown[]) => Promise<void>>,
        );
      }
    }
  }

  async run(...migrationClasses: Array<MigrationClass | MigrationRunOptions>): Promise<void> {
    const opts = extractOptionsBang(migrationClasses) as MigrationRunOptions;
    const klasses = migrationClasses as MigrationClass[];
    let dir = opts.direction ?? "up";
    if (opts.revert) dir = dir === "down" ? "up" : "down";
    if (this.isReverting()) {
      await this.revert(
        rbBlock(async () => {
          await this.run(...klasses, { direction: dir, revert: true });
        }),
      );
    } else {
      for (const migrationClass of klasses) {
        await new migrationClass().execMigration(await this.connection, dir);
      }
    }
  }

  async reversible(fn: (dir: ReversibleBlockHelper) => void | Promise<void>): Promise<void> {
    const helper = new ReversibleBlockHelper(this.isReverting());
    await this.executeBlock(async () => fn(helper));
  }

  async upOnly(block: () => Promise<void>): Promise<void> {
    if (!this.isReverting()) await this.executeBlock(block);
  }

  async migrate(direction: "up" | "down"): Promise<void> {
    if (!rbObjRespondTo(this, direction)) return;

    switch (direction) {
      case "up":
        this.announce("migrating");
        break;
      case "down":
        this.announce("reverting");
        break;
    }

    let timeElapsed: number | null = null;
    const pool = (await ActiveRecord.Tasks.DatabaseTasks.migrationConnection())
      .pool as ConnectionPool;
    await pool.withConnection(async (conn) => {
      timeElapsed = await Benchmark.realtime(() => this.execMigration(conn, direction));
    });

    switch (direction) {
      case "up":
        this.announce(format("migrated (%.4fs)", timeElapsed));
        this.write();
        break;
      case "down":
        this.announce(format("reverted (%.4fs)", timeElapsed));
        this.write();
        break;
    }
  }

  isReverting(): boolean {
    const connection = this.connection;
    return isCommandRecorder(connection) && connection.reverting;
  }

  async viewExists(viewName: string): Promise<boolean | null> {
    return (await this.methodMissing("viewExists", viewName)) as boolean;
  }

  async indexExists(
    tableName: string,
    columnName: string | string[],
    options?: { unique?: boolean; name?: string; valid?: boolean },
  ): Promise<boolean> {
    if (options !== undefined) {
      return (await this.methodMissing("indexExists", tableName, columnName, options)) as boolean;
    }
    return (await this.methodMissing("indexExists", tableName, columnName)) as boolean;
  }

  static get(version: string | number): typeof Migration {
    return Migration.Compatibility.find(version) as typeof Migration;
  }

  static currentVersion(): number {
    return parseFloat(VERSION.STRING);
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
    this.write(announceMigrationText(`${this.version ?? ""} ${this.name ?? ""}`, message));
  }

  say(message: string, subitem = false): void {
    this.write(`${subitem ? "   ->" : "--"} ${message}`);
  }

  async sayWithTime<T>(message: string, fn: () => Promise<T>): Promise<T> {
    this.say(message);
    let result: T | null = null;
    const timeElapsed = await Benchmark.realtime(async () => {
      result = await fn();
    });
    this.say(format("%.4fs", timeElapsed), true);
    if (Number.isInteger(result)) this.say(`${result} rows`, true);
    return result as T;
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

  get connection(): A | Promise<A> {
    return (
      (this._connectionOverride as A | undefined) ??
      (ActiveRecord.Tasks.DatabaseTasks.migrationConnection() as Promise<A>)
    );
  }

  set connection(conn: DatabaseAdapter | CommandRecorder | undefined) {
    this._connectionOverride = conn;
  }

  get connectionPool(): ConnectionPool {
    return this._poolOverride ?? ActiveRecord.Tasks.DatabaseTasks.migrationConnectionPool();
  }

  async execMigration(conn: DatabaseAdapter, direction: "up" | "down"): Promise<void> {
    this._connectionOverride = conn;
    try {
      const self = this as unknown as { change?: () => Promise<void> };
      if (rbObjRespondTo(this, "change")) {
        if (direction === "down") {
          await this.revert(rbBlock(() => self.change!()));
        } else {
          await self.change!();
        }
      } else {
        await this[direction]();
      }
    } finally {
      this._connectionOverride = undefined;
      this._executionStrategy = undefined;
    }
  }

  get executionStrategy(): ExecutionStrategy {
    this._executionStrategy ??= new (migrationStrategy() as new (
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

  static readonly MigrationFilenameRegexp = /^([0-9]+)_([_a-z0-9]*)\.?([_a-z0-9]*)\.(?:ts|js)$/;

  static isValidVersionFormat(versionString: string): boolean {
    return [Migration.MigrationFilenameRegexp, /^\d(_?\d)*$/].some((pattern) =>
      pattern.test(versionString),
    );
  }

  static nextMigrationNumber(number: number | bigint | string): string {
    if (timestampedMigrations()) {
      return max([Time.now().utc().strftime("%Y%m%d%H%M%S"), format("%.14d", number)])!;
    } else {
      return format("%.3d", toI(number));
    }
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
      tableNamePrefix: ActiveRecord.Base.tableNamePrefix,
      tableNameSuffix: ActiveRecord.Base.tableNameSuffix,
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
    const copied: MigrationProxy[] = [];

    if (!File.isExist(destination)) FileUtils.mkdirP(destination);

    const schemaMigration = new NullSchemaMigration();
    const internalMetadata = new NullInternalMetadata();

    const destinationMigrations = new MigrationContext(
      [destination],
      schemaMigration,
      internalMetadata,
    ).migrations;
    let last: MigrationProxy | undefined = destinationMigrations[destinationMigrations.length - 1];

    for (const [scope, path] of Object.entries(sources)) {
      const sourceMigrations = new MigrationContext([path], schemaMigration, internalMetadata)
        .migrations;

      for (const migration of sourceMigrations) {
        let source = File.binread(migration.filename);
        const insertedComment = `// This migration comes from ${scope} (originally ${migration.version})\n`;
        let magicComments = "";
        let substituted: unknown;
        for (;;) {
          [substituted, source] = rbStrSend(
            source,
            "subBang",
            /^\/\/ @ts-(?:no)?check.*\n/,
            rbBlock((magicComment: string) => {
              magicComments += magicComment;
              return "";
            }),
          );
          if (substituted === null) break;
        }

        if (magicComments.length !== 0 && source.startsWith("\n")) {
          magicComments += "\n";
          source = source.slice(1);
        }

        source = `${magicComments}${insertedComment}${source}`;

        const duplicate = destinationMigrations.find((m) => m.name === migration.name);
        if (duplicate) {
          if (options.onSkip && duplicate.scope !== scope) {
            options.onSkip(scope, migration);
          }
          continue;
        }

        migration.version = toInteger(Migration.nextMigrationNumber(last ? last.version + 1 : 0));
        const newPath = File.join(
          destination,
          `${migration.version}_${underscore(migration.name)}.${scope}${File.extname(migration.filename)}`,
        );
        const oldPath = migration.filename;
        migration.filename = newPath;
        last = migration;

        File.binwrite(migration.filename, source);
        copied.push(migration);
        if (options.onCopy) options.onCopy(scope, migration, oldPath);
        destinationMigrations.push(migration);
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

    await ActiveRecord.Tasks.DatabaseTasks.withTemporaryPoolForEach(
      { env: this.env() },
      async (pool) => {
        const pending = await pool.migrationContext.open().pendingMigrations();
        if (pending != null) pendingMigrations.push(pending);
      },
    );

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
    if (maintainTestSchema()) {
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
    return rbFSend(this.nearestDelegate, name, ...args);
  }

  async methodMissing(name: string, ...args: unknown[]): Promise<unknown> {
    const block = typeof args[args.length - 1] === "function" ? args.pop() : undefined;
    const announced = args.filter((a) => a !== undefined);
    return await this.sayWithTime(`${name}(${this.formatArguments(announced)})`, async () => {
      const conn = (await this.connection) as unknown as Record<string, unknown>;
      if (typeof conn["revert"] !== "function") {
        if (args.length > 0 && !["execute", "enableExtension", "disableExtension"].includes(name)) {
          const options = Migration.tableNameOptions();
          args[0] = Migration.properTableName(args[0] as string | { tableName?: unknown }, options);
          if (
            name === "renameTable" ||
            (name === "removeForeignKey" && !isPlainObject(args[1] ?? args[2]))
          ) {
            args[1] = Migration.properTableName(
              args[1] as string | { tableName?: unknown },
              options,
            );
          }
        }
      }
      const strategy = this.executionStrategy as {
        respondToMissing?: (name: string) => boolean | Promise<boolean>;
        methodMissing?: (name: string, ...args: unknown[]) => unknown;
      };
      if ((await strategy.respondToMissing?.(name)) !== true) {
        throw new NoMethodError(
          `undefined method '${name}' for an instance of ${rbObjClassname(this)}`,
          name,
          args,
          false,
          { receiver: this },
        );
      }
      if (block !== undefined) args.push(block);
      return await strategy.methodMissing?.(name, ...args);
    });
  }

  /** @internal */
  async executeBlock(fn: () => Promise<void>): Promise<void> {
    const connection = (await this.connection) as unknown as Record<string, unknown>;
    if (typeof connection["executeBlock"] === "function") {
      await this.methodMissing("executeBlock", fn);
      return;
    }
    await fn();
  }

  /** @internal */
  formatArguments(arguments_: unknown[]): string {
    const argList = arguments_.slice(0, -1).map((a) => rbInspect(a));
    const last = arguments_[arguments_.length - 1];
    if (isPlainObject(last)) {
      const filtered = symbolizeKeys(
        Object.fromEntries(Object.entries(last).filter(([k]) => !this.isInternalOption(k))),
      );
      if (Object.keys(filtered).length > 0) argList.push(rbInspect(filtered));
    } else {
      argList.push(rbInspect(last));
    }
    return argList.join(", ");
  }

  /** @internal */
  isInternalOption(optionName: string): boolean {
    return optionName.startsWith("_");
  }

  /** @internal */
  async commandRecorder(): Promise<CommandRecorder> {
    return new CommandRecorder(await this.connection);
  }

  /** @internal */
  private static async anySchemaNeedsUpdate(): Promise<boolean> {
    const databaseTasks = ActiveRecord.Tasks.DatabaseTasks;

    for (const dbConfig of this.dbConfigsInCurrentEnv()) {
      if (!(await databaseTasks.schemaUpToDate(dbConfig, _schemaFormat()))) return true;
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
    return ActiveRecord.Base.configurations().configsFor({ envName: this.env() });
  }

  /** @internal */
  static env(): string {
    return ActiveRecord.ConnectionHandling.DEFAULT_ENV();
  }

  /** @internal */
  private static async loadSchemaBang(): Promise<void> {
    const databaseTasks = ActiveRecord.Tasks.DatabaseTasks;

    await ActiveRecord.Base.connectionHandler.clearAllConnectionsBang("all");

    const testConfigs = ActiveRecord.Base.configurations().configsFor({ envName: "test" });
    for (const dbConfig of testConfigs) {
      await databaseTasks.purge(dbConfig);
    }

    const { Schema } = await import("./schema.js");
    await databaseTasks.withTemporaryPoolForEach({ env: "test" }, async (pool) => {
      const dbConfig = pool.dbConfig;
      Schema.verbose = false;
      const schemaFormat = (getEnv("SCHEMA_FORMAT") ?? _schemaFormat()) as SchemaFormat;
      await databaseTasks.loadSchema(dbConfig, schemaFormat);
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Migration {
  let CommandRecorder:
    | typeof import("./migration/command-recorder.js").CommandRecorder
    | import("@blazetrails/ruby-compat").ClassModule;
  let Compatibility: typeof CompatibilityModule;
  let JoinTable: typeof JoinTableModule;
  let ExecutionStrategy: typeof import("./migration/execution-strategy.js").ExecutionStrategy;
  let DefaultStrategy: typeof import("./migration/default-strategy.js").DefaultStrategy;
  let CheckPending: typeof import("./migration.js").CheckPending;
  const autoload: Extended<typeof Autoload>["autoload"];
}
Object.assign(Migration, {
  loadPath: {
    "active_record/migration/command_recorder": () => import("./migration/command-recorder.js"),
    "active_record/migration/compatibility": () => import("./migration/compatibility.js"),
    "active_record/migration/join_table": () => import("./migration/join-table.js"),
    "active_record/migration/execution_strategy": () => import("./migration/execution-strategy.js"),
    "active_record/migration/default_strategy": () => import("./migration/default-strategy.js"),
  },
});
extend(Migration, Autoload);
Migration.autoload("CommandRecorder", "active_record/migration/command_recorder");
Migration.autoload("Compatibility", "active_record/migration/compatibility");
Migration.autoload("JoinTable", "active_record/migration/join_table");
Migration.autoload("ExecutionStrategy", "active_record/migration/execution_strategy");
Migration.autoload("DefaultStrategy", "active_record/migration/default_strategy");
Migration.CommandRecorder = CommandRecorder;
Migration.JoinTable = JoinTableModule;
Migration.ExecutionStrategy = ExecutionStrategy;
Migration.DefaultStrategy = DefaultStrategy;

export class MigrationProxy {
  name: string;
  version: number;
  filename: string;
  scope: string;

  private _migration: Promise<Migration> | null = null;

  constructor(name: string, version: number, filename: string, scope: string) {
    this.name = name;
    this.version = version;
    this.filename = filename;
    this.scope = scope;
    this._migration = null;
  }

  basename(): string {
    return File.basename(this.filename);
  }

  async migrate(direction: "up" | "down"): Promise<void> {
    return (await this.migration()).migrate(direction);
  }

  async announce(message: string): Promise<void> {
    (await this.migration()).announce(message);
  }

  async write(text = ""): Promise<void> {
    (await this.migration()).write(text);
  }

  get disableDdlTransaction(): Promise<boolean> {
    return this.migration().then((migration) => migration.disableDdlTransaction);
  }

  /** @internal */
  migration(): Promise<Migration> {
    this._migration ??= this.loadMigration();
    return this._migration;
  }

  /** @internal */
  async loadMigration(): Promise<Migration> {
    try {
      rbModRemoveConst(Object, this.name);
    } catch (e) {
      if (!(e instanceof StandardError)) throw e;
    }

    await rbFLoad(File.expandPath(this.filename));
    return new (constantize(this.name) as new (name?: string, version?: number) => Migration)(
      this.name,
      this.version,
    );
  }
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
  readonly migrationsPaths: string | string[];
  readonly schemaMigration: S;
  readonly internalMetadata: I;

  constructor(migrationsPaths: string | string[], ...seated: SeatedCollaborators<S, I>) {
    const [schemaMigration, internalMetadata] = seated;
    this.migrationsPaths = migrationsPaths;
    this.schemaMigration = schemaMigration ?? (new SchemaMigration(this.connectionPool()) as S);
    this.internalMetadata = internalMetadata ?? (new InternalMetadata(this.connectionPool()) as I);
  }

  private connectionPool(): ConnectionPool {
    return ActiveRecord.Tasks.DatabaseTasks.migrationConnectionPool();
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
  ): Promise<string | number | undefined> {
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

  async migrationsStatus(this: MigrationContext): Promise<Array<[string, string, string]>> {
    let dbList: Array<string | [string, string, string]> =
      await this.schemaMigration.normalizedVersions();

    const fileList = filterMap(this.migrationFiles(), (file): [string, string, string] => {
      const parsed = this.parseMigrationFilename(file);
      if (!parsed) throw new IllegalMigrationNameError(file);
      let version = parsed[0];
      const name = parsed[1];
      const scope = parsed[2];
      if (this.isValidateTimestamp() && !this.isValidMigrationTimestamp(version)) {
        throw new InvalidMigrationTimestampError(version, name);
      }
      version = this.schemaMigration.normalizeMigrationNumber(version);
      const status = aryDelete(dbList, version) != null ? "up" : "down";
      return [status, version, humanize(name + scope)];
    });

    dbList = dbList.map((version) => ["up", version as string, "********** NO FILE **********"]);

    return ([...dbList, ...fileList] as Array<[string, string, string]>).sort(
      ([, a], [, b]) => Number(toI(a)) - Number(toI(b)),
    );
  }

  get currentEnvironment(): string {
    return ActiveRecord.ConnectionHandling.DEFAULT_ENV();
  }

  async protectedEnvironment(this: MigrationContext): Promise<boolean | null> {
    if ((await this.lastStoredEnvironment()) == null) return null;
    return ActiveRecord.Base.protectedEnvironments.includes((await this.lastStoredEnvironment())!);
  }

  async lastStoredEnvironment(this: MigrationContext): Promise<string | null> {
    const internalMetadata = this.internalMetadata;
    if (!internalMetadata.enabled) return null;
    if ((await this.currentVersion()) === 0) return null;
    if (!(await internalMetadata.tableExists())) {
      throw new NoEnvironmentInSchemaError();
    }
    const environment = await internalMetadata.get("environment");
    if (!environment) {
      throw new NoEnvironmentInSchemaError();
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
      return new MigrationProxy(name, version, file, scope);
    });

    return migrations.sort(byVersion);
  }

  /** @internal */
  protected migrationFiles(): string[] {
    const paths = wrap(this.migrationsPaths);
    return paths.flatMap((path) => Dir.glob(`${path}/**/[0-9]*_*.{ts,js}`));
  }

  /** @internal */
  protected parseMigrationFilename(filename: string): [string, string, string] | undefined {
    return (
      rbFSend(File.basename(filename), "scan", Migration.MigrationFilenameRegexp) as [
        string,
        string,
        string,
      ][]
    )[0];
  }

  /** @internal */
  private isValidateTimestamp(): boolean {
    return timestampedMigrations() && validateMigrationTimestamps();
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
    if ((await this.currentVersion()) !== 0 && !(await migrator.currentMigration())) {
      throw new UnknownMigrationVersionError((await this.currentVersion())!);
    }

    const startIndex =
      (await this.currentVersion()) === 0
        ? 0
        : migrator.migrations.indexOf((await migrator.currentMigration())!);

    const finish = migrator.migrations[startIndex + steps];
    const version = finish ? finish.version : 0;
    return rbFPublicSend(this, direction, version) as Promise<MigrationProxy[]>;
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
    let lockId!: bigint;
    let gotLock: boolean | undefined;
    try {
      lockId = await this.generateMigratorAdvisoryLockId();

      gotLock = await (await this.connection).getAdvisoryLock(lockId);
      if (!gotLock) {
        throw new ConcurrentMigrationError();
      }
      await this.loadMigrated();
      return await fn();
    } finally {
      if (gotLock && !(await (await this.connection).releaseAdvisoryLock(lockId))) {
        // eslint-disable-next-line no-unsafe-finally -- Ruby's `ensure` raises over the block's exception (migration.rb:1608-1612).
        throw new ConcurrentMigrationError(ConcurrentMigrationError.RELEASE_LOCK_FAILED_MESSAGE);
      }
    }
  }

  async run(): Promise<string | number | undefined> {
    return (await this.isUseAdvisoryLock())
      ? this.withAdvisoryLock(() => this.runWithoutLock())
      : this.runWithoutLock();
  }

  async migrate(): Promise<MigrationProxy[]> {
    return (await this.isUseAdvisoryLock())
      ? this.withAdvisoryLock(() => this.migrateWithoutLock())
      : this.migrateWithoutLock();
  }

  /** @internal */
  async runWithoutLock(): Promise<string | number | undefined> {
    await this._ensureSchemaTable();
    const migration = this.migrations.find((m) => m.version === this._targetVersion);
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

    await this._internalMetadata.set(
      "environment",
      (await this.connection).pool.dbConfig.envName as string,
    );
  }

  /** @internal */
  private get connection(): Promise<DatabaseAdapter> {
    return ActiveRecord.Tasks.DatabaseTasks.migrationConnection();
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

  /**
   * @internal
   * @missingRailsName direction — PERMANENT
   */
  async executeMigrationInTransaction(
    migration: MigrationProxy,
  ): Promise<string | number | undefined> {
    try {
      const applied = await this.migrated();
      if (this.isDown() && !applied.has(migration.version)) return undefined;
      if (this.isUp() && applied.has(migration.version)) return undefined;

      if (ActiveRecord.Base.logger)
        ActiveRecord.Base.logger.info(`Migrating to ${migration.name} (${migration.version})`);

      return await this.ddlTransaction(migration, async () => {
        await migration.migrate(this._direction);
        return this.recordVersionStateAfterMigrating(migration.version);
      });
    } catch (e) {
      let msg = "An error has occurred, ";
      if (await this.isUseTransaction(migration)) msg += "this and ";
      msg += `all later migrations canceled:\n\n${excToS(e)}`;
      const error = new StandardError(msg);
      excSetBacktrace(error, (excBacktraceLocations(e as Error) ?? []).map(String));
      throw excSetupMessage(error, e);
    }
  }

  /** @internal */
  private target(): MigrationProxy | undefined {
    return this.migrations.find((m) => m.version === this._targetVersion);
  }

  /** @internal */
  private finish(): number {
    const index = this.migrations.indexOf(this.target()!);
    return index === -1 ? this.migrations.length - 1 : index;
  }

  /** @internal */
  private async start(): Promise<number> {
    if (this.isUp()) return 0;
    const index = this.migrations.indexOf((await this.current())!);
    return index === -1 ? 0 : index;
  }

  /** @internal */
  async recordVersionStateAfterMigrating(version: number): Promise<string | number> {
    const migrated = await this.migrated();
    if (this.isDown()) {
      migrated.delete(version);
      return this._schemaMigration.deleteVersion(String(version));
    } else {
      migrated.add(version);
      return this._schemaMigration.createVersion(String(version));
    }
  }

  /** @internal */
  async isUseAdvisoryLock(): Promise<boolean> {
    return (await this.connection).isAdvisoryLocksEnabled();
  }

  /** @internal */
  async generateMigratorAdvisoryLockId(): Promise<bigint> {
    const dbNameHash = Zlib.crc32(
      await (
        (await this.connection) as unknown as { currentDatabase(): Promise<string> }
      ).currentDatabase(),
    );
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
  private validate(migrations: MigrationProxy[]): undefined {
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
  async ddlTransaction<T>(migration: MigrationProxy, fn: () => Promise<T>): Promise<T | undefined> {
    if (await this.isUseTransaction(migration)) {
      return (await this.connection).transaction(fn);
    } else {
      return fn();
    }
  }

  /** @internal */
  async isUseTransaction(migration: MigrationProxy): Promise<boolean> {
    return (
      !(await migration.disableDdlTransaction) && (await this.connection).supportsDdlTransactions()
    );
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
    } else {
      if (this.target()) runnable.pop();
      for (const m of runnable) {
        if (await this.isRan(m)) kept.push(m);
      }
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
  static readonly VERSION = `${VERSION.MAJOR}.${VERSION.MINOR}`;

  override async createTable(
    tableName: string,
    options?:
      | {
          id?: false | ColumnType | IdHashOptions;
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
    } else if (options === block) {
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
    } else if (options === block) {
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
    } else if (options === block) {
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
    const currentEnvironment = ActiveRecord.ConnectionHandling.DEFAULT_ENV();
    const allConfigs = ActiveRecord.Base.configurations().configsFor({
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

Migration.CheckPending = CheckPending;
Migration.delegate = new Migration();
ActiveRecord.Migration = Migration;
ActiveRecord.IrreversibleMigration = IrreversibleMigration;
