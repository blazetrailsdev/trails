import { ArgumentError } from "@blazetrails/activemodel";
import { isPresent } from "@blazetrails/activesupport";
import { include, prepend, rbInspect, type PrependModule } from "@blazetrails/ruby-compat";
import { Current, Migration } from "../migration.js";
import * as Compatibility from "./compatibility.js";
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

export class V5_0 extends V5_1 {
  static override TableDefinition = {
    primaryKey(
      super_: Super,
      name: string,
      type: ColumnType = "primary_key",
      options: Options = {},
    ) {
      if (type === "primary_key") type = "integer";
      return super_(name, type, options);
    },

    references(super_: Super, ...args: unknown[]) {
      const last = args[args.length - 1];
      const options = (typeof last === "object" && last !== null ? args.pop() : {}) as Options;
      return super_(...args, { type: "integer", ...options });
    },

    belongsTo(super_: Super, ...args: unknown[]) {
      return (V5_0.TableDefinition.references as Super).call(this, super_, ...args);
    },

    raiseOnIfExistOptions(_super: unknown, _options: Options): void {},
  } as unknown as PrependModule;

  override async createTable(
    tableName: string,
    options?: Parameters<Current["createTable"]>[1],
    fn?: Parameters<Current["createTable"]>[2],
  ): Promise<void> {
    if (typeof options === "function") [options, fn] = [{}, options];
    options = { ...options };
    const connection = await this.connection;
    if (connection.adapterName === "PostgreSQL") {
      if (options.id === "uuid" && !Object.hasOwn(options, "default")) {
        options.default = "uuid_generate_v4()";
      }
    }

    if (
      !(
        (connection.adapterName === "Mysql2" || connection.adapterName === "Trilogy") &&
        options.id === "bigint"
      )
    ) {
      if (
        (options.id === "integer" || options.id === "bigint") &&
        !Object.hasOwn(options, "default")
      ) {
        options.default = null;
      }
    }

    if (!Object.hasOwn(options, "id")) {
      options.id = "integer";
    }

    await super.createTable(tableName, options, fn);
  }

  override async createJoinTable(
    table1: string,
    table2: string,
    options?: Parameters<Current["createJoinTable"]>[2],
    fn?: Parameters<Current["createJoinTable"]>[3],
  ): Promise<void> {
    if (typeof options === "function") [options, fn] = [{}, options];
    const columnOptions = { type: "integer", ...options?.columnOptions };
    await super.createJoinTable(table1, table2, { ...options, columnOptions }, fn);
  }

  override async addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { ifNotExists?: boolean } = {},
  ): Promise<void> {
    if (type === "primary_key") {
      type = "integer";
      options = { ...options, primaryKey: true };
    } else if (type === "datetime") {
      options = { ...options, precision: options.precision ?? null };
    }
    await super.addColumn(tableName, columnName, type, options);
  }

  override async addReference(
    tableName: string,
    refName: string,
    options: Parameters<Current["addReference"]>[2] = {},
  ): Promise<void> {
    await super.addReference(tableName, refName, { type: "integer", ...options });
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
    prepend(t as object, V5_0.TableDefinition);
    return super.compatibleTableDefinition(t);
  }
}

type RemoveIndexOptions = { column?: string | string[]; name?: string; ifExists?: boolean };

export class V4_2 extends V5_0 {
  static override TableDefinition = {
    references(super_: Super, ...args: unknown[]) {
      const last = args[args.length - 1];
      const options = (typeof last === "object" && last !== null ? args.pop() : {}) as Options;
      return super_(...args, { ...options, index: options.index || false });
    },

    belongsTo(super_: Super, ...args: unknown[]) {
      return (V4_2.TableDefinition.references as Super).call(this, super_, ...args);
    },

    timestamps(super_: Super, options: Options = {}) {
      if (options.null == null) options = { ...options, null: true };
      return super_(options);
    },

    raiseOnIfExistOptions(_super: unknown, _options: Options): void {},
  } as unknown as PrependModule;

  override async addReference(
    tableName: string,
    refName: string,
    options: Parameters<Current["addReference"]>[2] = {},
  ): Promise<void> {
    options = { ...options, index: options.index || false };
    await super.addReference(tableName, refName, options);
  }

  override async addBelongsTo(
    tableName: string,
    refName: string,
    options: Parameters<Current["addReference"]>[2] = {},
  ): Promise<void> {
    await this.addReference(tableName, refName, options);
  }

  override async addTimestamps(tableName: string, options: ColumnOptions = {}): Promise<void> {
    if (options.null == null) options = { ...options, null: true };
    await super.addTimestamps(tableName, options);
  }

  override async indexExists(
    tableName: string,
    columnName: string | string[],
    options: { unique?: boolean; name?: string; valid?: boolean } = {},
  ): Promise<boolean> {
    const columnNames = [columnName].flat().map(String);
    options = {
      ...options,
      name: isPresent(options.name)
        ? String(options.name)
        : (await this.connection).indexName(tableName, { column: columnNames }),
    };
    return super.indexExists(tableName, columnName, options);
  }

  override async removeIndex(
    tableName: string,
    columnName: string | string[] | RemoveIndexOptions | null = null,
    options: RemoveIndexOptions = {},
  ): Promise<void> {
    if (!(typeof columnName === "string" || Array.isArray(columnName))) {
      options = { ...columnName, ...options };
      columnName = null;
    }

    options = { ...options, name: await this.indexNameForRemove(tableName, columnName, options) };
    await super.removeIndex(tableName, columnName ?? undefined, options);
  }

  /** @internal */
  override compatibleTableDefinition<T>(t: T): T {
    prepend(t as object, V4_2.TableDefinition);
    return super.compatibleTableDefinition(t);
  }

  /** @internal */
  async indexNameForRemove(
    tableName: string,
    columnName: string | string[] | null,
    options: RemoveIndexOptions,
  ): Promise<string> {
    const connection = await this.connection;
    const indexName = connection.indexName(tableName, columnName ?? options);

    if (!(await connection.indexNameExists(tableName, indexName))) {
      if (Object.hasOwn(options, "name")) {
        const { column: _column, ...optionsWithoutColumn } = options;
        const indexNameWithoutColumn = connection.indexName(tableName, optionsWithoutColumn);

        if (await connection.indexNameExists(tableName, indexNameWithoutColumn)) {
          return indexNameWithoutColumn;
        }
      }

      throw new ArgumentError(`Index name '${indexName}' on table '${tableName}' does not exist`);
    }

    return indexName;
  }
}

Migration.Compatibility = Compatibility;
