import { ArgumentError } from "@blazetrails/activemodel";
import { include, prepend, rbInspect, type PrependModule } from "@blazetrails/ruby-compat";
import { Current } from "../migration.js";
import * as Compatibility from "./compatibility.js";
import { Migration } from "../namespaces.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { ReferenceDefinition as ConnectionAdaptersReferenceDefinition } from "../connection-adapters/abstract/schema-definitions.js";
import type { CommentStatements } from "../connection-adapters/abstract/schema-statements.js";
import type { CommandRecorder as MigrationCommandRecorder } from "./command-recorder.js";
import type {
  AddForeignKeyOptions,
  AddIndexOptions,
  ColumnOptions,
  ColumnType,
} from "../connection-adapters/abstract/schema-definitions.js";

export function find(version: string | number): unknown {
  version =
    typeof version === "number" && Number.isInteger(version) ? `${version}.0` : `${version}`;
  const name = `V${version.replaceAll(".", "_")}`;
  if (!Object.hasOwn(Compatibility, name)) {
    const versions = Object.keys(Compatibility)
      .filter((s) => /^V[0-9_]+$/.test(s))
      .map((s) => rbInspect(s.replace("V", "").replaceAll("_", ".")));
    throw new ArgumentError(
      `Unknown migration version ${rbInspect(version)}; expected one of ${versions.sort().join(", ")}`,
    );
  }
  return (Compatibility as Record<string, unknown>)[name];
}

export const V8_0 = Current;

export class V7_2 extends V8_0 {}

export class V7_1 extends V7_2 {}

type Options = Record<string, unknown>;
type Super = (...args: unknown[]) => unknown;

const LegacyIndexName = {
  legacyIndexName(tableName: string, options: Options | string | string[]): string {
    if (typeof options === "object" && !Array.isArray(options)) {
      if (options.column != null) {
        return `index_${tableName}_on_${[options.column].flat().join("_and_")}`;
      } else if (options.name != null) {
        return options.name as string;
      } else {
        throw new ArgumentError("You must specify the index name");
      }
    } else {
      return LegacyIndexName.legacyIndexName(tableName, LegacyIndexName.indexNameOptions(options));
    }
  },

  indexNameOptions(columnNames: string | string[]): Options {
    if (LegacyIndexName.isExpressionColumnName(columnNames)) {
      columnNames = (columnNames as string).match(/\w+/g)!.join("_");
    }

    return { column: columnNames };
  },

  isExpressionColumnName(columnName: unknown): boolean {
    return typeof columnName === "string" && /\W/.test(columnName);
  },
};

export class V7_0 extends V7_1 {
  static LegacyIndexName = LegacyIndexName;

  static TableDefinition = {
    column(super_: Super, name: string, type: ColumnType, options: Options = {}) {
      options = { ...options, _skipValidateOptions: true };
      return super_(name, type, options);
    },

    change(super_: Super, name: string, type: ColumnType, options: Options = {}) {
      options = { ...options, _skipValidateOptions: true };
      return super_(name, type, options);
    },

    index(
      this: { name: string },
      super_: Super,
      columnName: string | string[],
      options: AddIndexOptions = {},
    ) {
      if (options.name == null) {
        options = { ...options, name: LegacyIndexName.legacyIndexName(this.name, columnName) };
      }
      return super_(columnName, options);
    },

    references(super_: Super, ...args: unknown[]) {
      const last = args[args.length - 1];
      let options = (typeof last === "object" && last !== null ? args.pop() : {}) as Options;
      options = { ...options, _skipValidateOptions: true };
      return super_(...args, options);
    },

    raiseOnIfExistOptions(_super: unknown, _options: Options): void {},
  } as unknown as PrependModule;

  override async addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { ifNotExists?: boolean } = {},
  ): Promise<void> {
    options = { ...options, _skipValidateOptions: true };
    await super.addColumn(tableName, columnName, type, options);
  }

  override async addIndex(
    tableName: string,
    columnName: string | string[],
    options: AddIndexOptions = {},
  ): Promise<void> {
    if (options.name == null) {
      options = { ...options, name: LegacyIndexName.legacyIndexName(tableName, columnName) };
    }
    await super.addIndex(tableName, columnName, options);
  }

  override async addReference(
    tableName: string,
    refName: string,
    options: Parameters<Current["addReference"]>[2] = {},
  ): Promise<void> {
    options = { ...options, _skipValidateOptions: true };
    await super.addReference(tableName, refName, options);
  }

  override async addBelongsTo(
    tableName: string,
    refName: string,
    options: Parameters<Current["addReference"]>[2] = {},
  ): Promise<void> {
    await this.addReference(tableName, refName, options);
  }

  override async createTable(
    tableName: string,
    options?: Parameters<Current["createTable"]>[1],
    fn?: Parameters<Current["createTable"]>[2],
  ): Promise<void> {
    if (typeof options === "function") [options, fn] = [{}, options];
    options = { ...options, _usesLegacyTableName: true, _skipValidateOptions: true } as Options;

    await super.createTable(tableName, options, fn);
  }

  override async renameTable(
    tableName: string,
    newName: string,
    options: Options = {},
  ): Promise<void> {
    options = { ...options, _usesLegacyTableName: true, _usesLegacyIndexName: true };
    await super.renameTable(tableName, newName, options);
  }

  override async changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): Promise<void> {
    options = { ...options, _skipValidateOptions: true };
    const connection = await this.connection;
    if (connection.adapterName === "Mysql2" || connection.adapterName === "Trilogy") {
      options.collation ??= "no_collation";
    }
    await super.changeColumn(tableName, columnName, type, options);
  }

  override async changeColumnNull(
    tableName: string,
    columnName: string,
    allowNull: boolean,
    defaultValue?: unknown,
  ): Promise<void> {
    await super.changeColumnNull(tableName, columnName, !!allowNull, defaultValue);
  }

  override async disableExtension(
    name: string,
    options: { force?: "cascade" } = {},
  ): Promise<void> {
    if ((await this.connection).adapterName === "PostgreSQL") {
      options = { ...options, force: "cascade" };
    }
    await super.disableExtension(name, options);
  }

  override async addForeignKey(
    fromTable: string,
    toTable: string,
    options: AddForeignKeyOptions = {},
  ): Promise<void> {
    if (
      (await this.connection).adapterName === "PostgreSQL" &&
      (options.deferrable as unknown) === true
    ) {
      options = { ...options, deferrable: "immediate" };
    }
    await super.addForeignKey(fromTable, toTable, options);
  }

  /** @internal */
  override compatibleTableDefinition<T>(t: T): T {
    prepend(t as object, V7_0.TableDefinition);
    return super.compatibleTableDefinition(t);
  }
}

include(V7_0, LegacyIndexName);

class PostgreSQLCompat {
  static compatibleTimestampType(type: ColumnType, connection: AbstractAdapter): ColumnType {
    if (connection.adapterName === "PostgreSQL") {
      return type === "datetime" ? "timestamp" : type;
    } else {
      return type;
    }
  }
}

export class V6_1 extends V7_0 {
  static PostgreSQLCompat = PostgreSQLCompat;

  override async addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { ifNotExists?: boolean } = {},
  ): Promise<void> {
    if (type === "datetime") {
      options = { ...options, precision: options.precision ?? null };
    }

    type = PostgreSQLCompat.compatibleTimestampType(type, await this.connection);
    await super.addColumn(tableName, columnName, type, options);
  }

  override async changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): Promise<void> {
    if (type === "datetime") {
      options = { ...options, precision: options.precision ?? null };
    }

    type = PostgreSQLCompat.compatibleTimestampType(type, await this.connection);
    await super.changeColumn(tableName, columnName, type, options);
  }

  static override TableDefinition = {
    newColumnDefinition(
      this: { conn: AbstractAdapter },
      super_: Super,
      name: string,
      type: ColumnType,
      options: Options = {},
    ) {
      type = PostgreSQLCompat.compatibleTimestampType(type, this.conn);
      return super_(name, type, options);
    },

    change(super_: Super, name: string, type: ColumnType, options: Options = {}) {
      options = { ...options, precision: options.precision ?? null };
      return super_(name, type, options);
    },

    column(super_: Super, name: string, type: ColumnType, options: Options = {}) {
      options = { ...options, precision: options.precision ?? null };
      return super_(name, type, options);
    },

    raiseOnIfExistOptions(_super: unknown, _options: Options): void {},
  } as unknown as PrependModule;

  /** @internal */
  override compatibleTableDefinition<T>(t: T): T {
    prepend(t as object, V6_1.TableDefinition);
    return super.compatibleTableDefinition(t);
  }
}

class V6_0ReferenceDefinition extends ConnectionAdaptersReferenceDefinition {
  protected override indexOptions(_tableName: string): AddIndexOptions {
    return this.asOptions(this.index);
  }
}

export class V6_0 extends V6_1 {
  static ReferenceDefinition = V6_0ReferenceDefinition;

  static override TableDefinition = {
    references(super_: Super, ...args: unknown[]) {
      const last = args[args.length - 1];
      let options = (typeof last === "object" && last !== null ? args.pop() : {}) as Options;
      options = { ...options, _usesLegacyReferenceIndexName: true };
      return super_(...args, options);
    },

    belongsTo(super_: Super, ...args: unknown[]) {
      return (V6_0.TableDefinition.references as Super).call(this, super_, ...args);
    },

    column(super_: Super, name: string, type: ColumnType, options: Options = {}) {
      options = { ...options, precision: options.precision ?? null };
      return super_(name, type, options);
    },

    raiseOnIfExistOptions(_super: unknown, _options: Options): void {},
  } as unknown as PrependModule;

  override async addReference(
    tableName: string,
    refName: string,
    options: Parameters<Current["addReference"]>[2] = {},
  ): Promise<void> {
    if ((await this.connection).adapterName === "SQLite") {
      options = { ...options, type: "integer" };
    }

    options = { ...options, _usesLegacyReferenceIndexName: true };
    await super.addReference(tableName, refName, options);
  }

  override async addBelongsTo(
    tableName: string,
    refName: string,
    options: Parameters<Current["addReference"]>[2] = {},
  ): Promise<void> {
    await this.addReference(tableName, refName, options);
  }

  /** @internal */
  override compatibleTableDefinition<T>(t: T): T {
    prepend(t as object, V6_0.TableDefinition);
    return super.compatibleTableDefinition(t);
  }
}

const V5_2CommandRecorder = {
  invertTransaction(_super: unknown, args: unknown[], block?: unknown) {
    return ["transaction", args, block];
  },

  invertChangeColumnComment(_super: unknown, args: unknown[]) {
    return ["changeColumnComment", args];
  },

  invertChangeTableComment(_super: unknown, args: unknown[]) {
    return ["changeTableComment", args];
  },
} as unknown as PrependModule;

export class V5_2 extends V6_0 {
  static override TableDefinition = {
    timestamps(super_: Super, options: Options = {}) {
      options = { ...options, precision: options.precision ?? null };
      return super_(options);
    },

    column(super_: Super, name: string, type: ColumnType, options: Options = {}) {
      options = { ...options, precision: options.precision ?? null };
      return super_(name, type, options);
    },

    raiseOnIfExistOptions(_super: unknown, _options: Options): void {},

    raiseOnDuplicateColumn(_super: unknown, _name: string): void {},
  } as unknown as PrependModule;

  static CommandRecorder = V5_2CommandRecorder;

  override async addTimestamps(tableName: string, options: ColumnOptions = {}): Promise<void> {
    options = { ...options, precision: options.precision ?? null } as ColumnOptions;
    await super.addTimestamps(tableName, options);
  }

  /** @internal */
  override compatibleTableDefinition<T>(t: T): T {
    prepend(t as object, V5_2.TableDefinition);
    return super.compatibleTableDefinition(t);
  }

  /** @internal */
  override async commandRecorder(): Promise<MigrationCommandRecorder> {
    const recorder = await super.commandRecorder();
    prepend(recorder, V5_2.CommandRecorder);
    return recorder;
  }
}

export class V5_1 extends V5_2 {
  override async changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): Promise<void> {
    const connection = await this.connection;
    if (connection.adapterName === "PostgreSQL") {
      const { default: _d, null: _n, comment: _c, ...except } = options;
      await super.changeColumn(tableName, columnName, type, except);
      if (Object.hasOwn(options, "default")) {
        await connection.changeColumnDefault(tableName, columnName, options.default);
      }
      if (Object.hasOwn(options, "null")) {
        await connection.changeColumnNull(tableName, columnName, options.null!, options.default);
      }
      if (Object.hasOwn(options, "comment")) {
        await (connection as unknown as CommentStatements).changeColumnComment(
          tableName,
          columnName,
          options.comment!,
        );
      }
    } else {
      await super.changeColumn(tableName, columnName, type, options);
    }
  }

  override async createTable(
    tableName: string,
    options?: Parameters<Current["createTable"]>[1],
    fn?: Parameters<Current["createTable"]>[2],
  ): Promise<void> {
    const connection = await this.connection;
    if (connection.adapterName === "Mysql2" || connection.adapterName === "Trilogy") {
      if (typeof options === "function") [options, fn] = [{}, options];
      await super.createTable(tableName, { options: "ENGINE=InnoDB", ...options }, fn);
    } else {
      await super.createTable(tableName, options, fn);
    }
  }
}

Migration.Compatibility = Compatibility;
