import {
  block,
  except,
  fetch,
  hashDelete,
  isEmpty,
  OpenSSL,
  partition,
  slice,
  rbInspect,
  rtest,
  toI,
} from "@blazetrails/ruby-compat";
import { NotImplementedError } from "../../errors.js";
import { findJoinTableName, joinTableName } from "../../migration/join-table.js";
import { CommandRecorder } from "../../migration/command-recorder.js";
import type { MigrationCommand } from "../../migration/command-recorder.js";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  extractOptionsBang,
  include,
  isPlainObject,
  symbolizeKeys,
} from "@blazetrails/activesupport";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import type { Relation } from "../../relation.js";
import type { Base } from "../../base.js";
import {
  TableDefinition,
  Table,
  AlterTable,
  IndexDefinition,
  AddColumnDefinition,
  ColumnDefinition,
  ChangeColumnDefaultDefinition,
  CreateIndexDefinition,
  ForeignKeyDefinition,
  CheckConstraintDefinition,
  type AddForeignKeyOptions,
  type AddIndexOptions,
  type AddReferenceOptions,
  type RemoveReferenceOptions,
  ReferenceDefinition,
  type ColumnType,
  type ColumnOptions,
  type IdHashOptions,
  type ForeignKeyLookupOptions,
  type RemoveForeignKeyOptions,
} from "./schema-definitions.js";
import type { TableDefinitionOf, TableOf } from "./schema-definitions.js";
import type { UniqueConstraintOptions } from "../postgresql/schema-definitions.js";
import { SchemaCreation, type SchemaCreationConn } from "./schema-creation.js";
import type { SchemaQuoter } from "./assert-schema-adapter.js";
import { Column } from "../column.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import {
  singularize,
  pluralize,
  isPresent,
  presence,
  assertValidKeys,
  any,
  first,
  mbChars,
  wrap,
} from "@blazetrails/activesupport";
import { SchemaDumper } from "./schema-dumper.js";
import { ActiveRecord } from "../../namespaces.js";

export type JoinTableOptions = {
  tableName?: string;
  columnOptions?: Record<string, unknown>;
  id?: boolean | "uuid";
  force?: boolean | "cascade";
  ifNotExists?: boolean;
  options?: string;
  comment?: string;
  temporary?: boolean;
  as?: string | { toSql(): string };
};

export interface ValidateConstraintStatements {
  validateConstraint(tableName: string, constraintName: string | undefined): Promise<void>;
  validateCheckConstraint(
    tableName: string,
    nameOrOptions: string | { name: string },
  ): Promise<void>;
  validateForeignKey(
    fromTable: string,
    toTable?: string,
    options?: Omit<ForeignKeyLookupOptions, "toTable">,
  ): Promise<void>;
}

export type CommentOrChanges = string | null | { from: string | null; to: string | null };

export interface CommentStatements {
  changeTableComment(tableName: string, commentOrChanges: CommentOrChanges): Promise<void>;
  changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: CommentOrChanges,
  ): Promise<void>;
}

export interface ExtensionStatements {
  enableExtension(name: string, options?: Record<string, unknown>): Promise<void>;
  disableExtension(name: string, options?: { force?: "cascade" }): Promise<void>;
}

export interface EnumStatements {
  createEnum(name: string, values: string[], options?: Record<string, unknown>): Promise<void>;
  dropEnum(
    name: string,
    valuesOrOptions?: string[] | { ifExists?: boolean },
    options?: { ifExists?: boolean },
  ): Promise<void>;
  renameEnumValue(name: string, options: { from: string; to: string }): Promise<void>;
}

export interface UniqueConstraintStatements {
  addUniqueConstraint(
    tableName: string,
    columnName?: string | string[] | null,
    options?: UniqueConstraintOptions,
  ): Promise<void>;
  removeUniqueConstraint(
    tableName: string,
    columnNameOrOptions?: string | string[] | UniqueConstraintOptions | null,
    options?: UniqueConstraintOptions,
  ): Promise<void>;
}

export interface SchemaNamespaceStatements {
  createSchema(name: string, options?: { force?: boolean; ifNotExists?: boolean }): Promise<void>;
}

/** @internal */
interface SchemaMigrationPool {
  schemaMigration: { tableName: string; versions(): Promise<Array<string | number>> };
  migrationContext: {
    getAllVersions(): Promise<number[]>;
    migrations: ReadonlyArray<{ version: number }>;
  };
}

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/** @internal */
export interface SchemaStatements
  extends
    Pick<
      DatabaseAdapter,
      | "columnFor"
      | "execute"
      | "indexAlgorithms"
      | "indexNameLength"
      | "internalExecQuery"
      | "lookupCastType"
      | "pool"
      | "queryValues"
      | "quote"
      | "schemaCache"
      | "selectRows"
      | "supportsComments"
      | "supportsCommentsInCreate"
      | "supportsDatetimeWithPrecision"
      | "supportsForeignKeys"
      | "supportsIndexSortOrder"
      | "supportsIndexesInCreate"
      | "tableAliasLength"
      | "tableNameLength"
      | "visitor"
    >,
    SchemaQuoter {
  /** @internal */
  findJoinTableName(table1: string, table2: string, options?: { tableName?: string }): string;
  /** @internal */
  joinTableName(table1: string, table2: string): string;
}

export class SchemaStatements {
  /* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

  declare protected _config: Record<string, unknown>;

  private get _pool(): SchemaMigrationPool {
    return this.pool as SchemaMigrationPool;
  }

  get schemaCreation(): SchemaCreation {
    return new SchemaCreation(this as unknown as SchemaCreationConn);
  }

  async createTable(
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
          temporary?: boolean;
          as?: string | { toSql(): string };
          autoIncrement?: boolean;
          limit?: number;
          precision?: number;
        }
      | ((t: TableDefinitionOf<this>) => void | Promise<void>),
    fn?: (t: TableDefinitionOf<this>) => void | Promise<void>,
  ): Promise<unknown> {
    if (typeof options === "function") {
      fn = options;
      options = undefined;
    }
    const { id, primaryKey, force, ...rest } = options ?? {};
    options = rest;
    this.validateCreateTableOptionsBang(options);

    if ((options as { _usesLegacyTableName?: boolean })._usesLegacyTableName !== true) {
      this.validateTableLengthBang(tableName);
    }

    if (force && "ifNotExists" in options) {
      throw new ArgumentError(
        "Options `:force` and `:if_not_exists` cannot be used simultaneously.",
      );
    }

    const td = await this.buildCreateTableDefinition(
      tableName,
      { id, primaryKey, force, ...options },
      fn,
    );

    if (force) {
      await this.dropTable(tableName, { force, ifExists: true });
    } else {
      await this.schemaCache.clearDataSourceCacheBang(tableName);
    }

    const result = await this.execute(await this.schemaCreation.accept(td));

    if (!this.supportsIndexesInCreate?.()) {
      for (const [columnName, indexOptions] of td.indexes) {
        await this.addIndex(tableName, columnName, {
          ...indexOptions,
          ifNotExists: td.ifNotExists,
        });
      }
    }

    if (this.supportsComments?.() && !this.supportsCommentsInCreate?.()) {
      const tableComment = presence(td.comment);
      if (tableComment != null) {
        await this.changeTableComment(tableName, tableComment);
      }

      for (const column of td.columns) {
        if (isPresent(column.options.comment)) {
          await this.changeColumnComment(tableName, column.name, column.options.comment!);
        }
      }
    }

    return result;
  }

  async dropTable(
    ...args:
      | string[]
      | [...string[], { ifExists?: boolean; force?: boolean | "cascade" } | undefined]
      | [...string[], ((t: TableDefinition) => void) | undefined]
      | [
          ...string[],
          { ifExists?: boolean; force?: boolean | "cascade" } | undefined,
          ((t: TableDefinition) => void) | undefined,
        ]
  ): Promise<unknown> {
    const rest = [...args] as unknown[];
    while (
      rest.length > 0 &&
      (rest[rest.length - 1] === undefined || typeof rest[rest.length - 1] === "function")
    ) {
      rest.pop();
    }
    args = rest as typeof args;
    const last = args[args.length - 1];
    const hasOptions = last !== null && last !== undefined && typeof last === "object";
    const tableNames = (hasOptions ? args.slice(0, -1) : args) as string[];
    const options = (hasOptions ? last : {}) as { ifExists?: boolean; force?: boolean | "cascade" };
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    for (const tableName of tableNames) {
      await this.schemaCache.clearDataSourceCacheBang(tableName);
      await this.execute(`DROP TABLE${ifExists} ${this.quoteTableName(tableName)}`);
    }
    return tableNames;
  }

  async addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { ifNotExists?: boolean } = {},
  ): Promise<unknown> {
    const addColumnDef = await this.buildAddColumnDefinition(tableName, columnName, type, options);
    if (!addColumnDef) return;
    return this.execute(await this.schemaCreation.accept(addColumnDef));
  }

  async removeColumn(
    tableName: string,
    columnName: string,
    type?: ColumnType,
    options: { ifExists?: boolean } = {},
  ): Promise<void> {
    if (columnName === undefined) {
      throw new ArgumentError("wrong number of arguments (given 1, expected 2..3)");
    }
    if (options.ifExists === true && !(await this.columnExists(tableName, columnName))) return;
    await this.execute(
      `ALTER TABLE ${this.quoteTableName(tableName)} ${this.removeColumnForAlter(tableName, columnName, type, options)}`,
    );
  }

  async renameColumn(
    _tableName: string,
    _columnName: string,
    _newColumnName: string,
  ): Promise<void> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:766
    throw new NotImplementedError("rename_column is not implemented");
  }

  async addIndex(
    tableName: string,
    columnName: string | string[],
    options: AddIndexOptions = {},
  ): Promise<unknown> {
    const createIndex = await this.buildCreateIndexDefinition(
      tableName,
      columnName,
      options as Record<string, unknown>,
    );
    return this.execute(await this.schemaCreation.accept(createIndex));
  }

  async removeIndex(
    tableName: string,
    columnName:
      | string
      | string[]
      | { column?: string | string[]; name?: string; ifExists?: boolean }
      | null = null,
    options: { column?: string | string[]; name?: string; ifExists?: boolean } = {},
  ): Promise<unknown> {
    if (!(typeof columnName === "string" || Array.isArray(columnName))) {
      options = { ...columnName, ...options };
      columnName = null;
    }

    if (options.ifExists && !(await this.indexExists(tableName, columnName, options))) return;

    const indexName = await this.indexNameForRemove(tableName, columnName, options);

    return this.execute(
      `DROP INDEX ${this.quoteColumnName(indexName)} ON ${this.quoteTableName(tableName)}`,
    );
  }

  async changeColumn(
    _tableName: string,
    _columnName: string,
    _type: ColumnType,
    _options: ColumnOptions = {},
  ): Promise<void> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:711
    throw new NotImplementedError("change_column is not implemented");
  }

  async renameTable(
    _tableName: string,
    _newName: string,
    _options: Record<string, unknown> = {},
  ): Promise<void> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:524
    throw new NotImplementedError("rename_table is not implemented");
  }

  async tableExists(tableName: string): Promise<boolean | null> {
    if (!isPresent(tableName)) return null;
    try {
      return any(
        await this.queryValues(this.dataSourceSql(tableName, { type: "BASE TABLE" }), "SCHEMA"),
      );
    } catch (error) {
      if (!(error instanceof NotImplementedError)) throw error;
      return (await this.tables()).includes(String(tableName));
    }
  }

  async columnExists(
    tableName: string,
    columnName: string,
    type?: string | null,
    options: {
      limit?: unknown;
      precision?: unknown;
      scale?: unknown;
      default?: unknown;
      null?: unknown;
      collation?: unknown;
      comment?: unknown;
    } = {},
  ): Promise<boolean> {
    columnName = String(columnName);
    const checks: Array<(c: Column) => unknown> = [];
    checks.push((c) => c.name === columnName);
    if (type != null) {
      checks.push((c) => {
        try {
          return c.type === type;
        } catch {
          return null;
        }
      });
    }
    for (const attr of this.columnOptionsKeys() as Array<keyof typeof options>) {
      if (attr in options) {
        checks.push((c) => (c as unknown as Record<string, unknown>)[attr] === options[attr]);
      }
    }

    return (await this.columns(tableName)).some((c) => checks.every((check) => check(c)));
  }

  async changeColumnDefault(
    _tableName: string,
    _columnName: string,
    _defaultOrChanges: unknown,
  ): Promise<void> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:729
    throw new NotImplementedError("change_column_default is not implemented");
  }

  async changeColumnNull(
    _tableName: string,
    _columnName: string,
    null_: boolean,
    default_?: unknown,
  ): Promise<void> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:758
    throw new NotImplementedError("change_column_null is not implemented");
  }

  async addReference(
    tableName: string,
    refName: string,
    options: AddReferenceOptions = {},
  ): Promise<void> {
    await new ReferenceDefinition(refName, options).add(tableName, this);
  }

  async addBelongsTo(
    tableName: string,
    refName: string,
    options: AddReferenceOptions = {},
  ): Promise<void> {
    return this.addReference(tableName, refName, options);
  }

  async removeReference(
    tableName: string,
    refName: string,
    { foreignKey = false, polymorphic = false, ...options }: RemoveReferenceOptions = {},
  ): Promise<void> {
    const conditionalOptions = slice(options, "ifExists", "ifNotExists");

    if (foreignKey) {
      const referenceName = ActiveRecord.Base.pluralizeTableNames
        ? pluralize(String(refName))
        : refName;
      let foreignKeyOptions: RemoveForeignKeyOptions;
      if (isPlainObject(foreignKey)) {
        foreignKeyOptions = { ...foreignKey, ...conditionalOptions };
      } else {
        foreignKeyOptions = { toTable: referenceName, ...conditionalOptions };
      }
      foreignKeyOptions.column ??= `${refName}_id`;
      await this.removeForeignKey(tableName, foreignKeyOptions);
    }

    await this.removeColumn(tableName, `${refName}_id`, undefined, conditionalOptions);
    if (polymorphic) {
      await this.removeColumn(tableName, `${refName}_type`, undefined, conditionalOptions);
    }
  }

  async removeBelongsTo(
    tableName: string,
    refName: string,
    options: RemoveReferenceOptions = {},
  ): Promise<void> {
    return this.removeReference(tableName, refName, options);
  }

  async addForeignKey(
    fromTable: string,
    toTable: string,
    options: AddForeignKeyOptions = {},
  ): Promise<void> {
    if (!this.useForeignKeys()) return;
    if (
      options.ifNotExists === true &&
      (await this.foreignKeyExists(
        fromTable,
        toTable,
        slice(options as Record<string, unknown>, "column") as ForeignKeyLookupOptions,
      ))
    ) {
      return;
    }
    options = this.foreignKeyOptions(
      fromTable,
      toTable,
      options as Record<string, unknown>,
    ) as AddForeignKeyOptions;
    const at = this.createAlterTable(fromTable);
    at.addForeignKey(toTable, options as Partial<AddForeignKeyOptions>);
    await this.execute(await this.schemaCreation.accept(at));
  }

  async removeForeignKey(
    fromTable: string,
    toTable?: string | RemoveForeignKeyOptions,
    options: RemoveForeignKeyOptions = {},
  ): Promise<void> {
    if (typeof toTable === "object" && toTable !== null) {
      options = toTable;
      toTable = options.toTable;
    }
    if (!this.useForeignKeys()) return;
    options = { ...options };
    if (
      hashDelete<unknown>(options as Record<string, unknown>, "ifExists") === true &&
      !(await this.foreignKeyExists(fromTable, toTable))
    ) {
      return;
    }

    const fkNameToDelete = (await this.foreignKeyForBang(fromTable, { ...options, toTable })).name;

    const at = this.createAlterTable(fromTable);
    at.dropForeignKey(fkNameToDelete);

    await this.execute(await this.schemaCreation.accept(at));
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
    const support = this as { supportsCheckConstraints?: () => Promise<boolean> };
    if (
      typeof support.supportsCheckConstraints === "function" &&
      !(await support.supportsCheckConstraints())
    )
      return;

    const ifNotExists = options.ifNotExists;
    options = this.checkConstraintOptions(tableName, expression, options) as {
      name?: string;
      validate?: boolean;
    };
    if (ifNotExists && (await this.checkConstraintExists(tableName, options))) return;

    const at = this.createAlterTable(tableName);
    at.addCheckConstraint(expression, options);
    await this.execute(await this.schemaCreation.accept(at));
  }

  async removeCheckConstraint(
    tableName: string,
    expression?:
      | string
      | { name?: string; expression?: string; validate?: boolean; ifExists?: boolean },
    options: { name?: string; expression?: string; validate?: boolean; ifExists?: boolean } = {},
  ): Promise<void> {
    let expr: string | undefined;
    let opts: { name?: string; expression?: string; validate?: boolean; ifExists?: boolean };
    if (typeof expression === "string") {
      expr = expression;
      opts = { ...options };
    } else {
      expr = undefined;
      opts = { ...(expression ?? {}), ...options };
    }
    const { ifExists, ...lookupOptions } = opts;

    if (ifExists === true && !(await this.checkConstraintExists(tableName, lookupOptions))) return;

    const chk = await this.checkConstraintForBang(tableName, {
      expression: expr,
      ...lookupOptions,
    });
    const at = this.createAlterTable(tableName);
    at.dropCheckConstraint(chk.name);
    await this.execute(await this.schemaCreation.accept(at));
  }

  async addTimestamps(tableName: string, options: ColumnOptions = {}): Promise<void> {
    const fragments = await this.addTimestampsForAlter(tableName, options);
    await this.execute(`ALTER TABLE ${this.quoteTableName(tableName)} ${fragments.join(", ")}`);
  }

  async removeTimestamps(tableName: string): Promise<void> {
    await this.removeColumns(tableName, "updated_at", "created_at");
  }

  async createJoinTable(
    table1: string,
    table2: string,
    options?: JoinTableOptions | ((t: TableDefinitionOf<this>) => void),
    fn?: (t: TableDefinitionOf<this>) => void,
  ): Promise<void> {
    if (typeof options === "function") {
      fn = options;
      options = undefined;
    }
    options = { ...options };
    let columnOptions = options.columnOptions ?? {};
    delete options.columnOptions;
    const joinTableName = this.findJoinTableName(table1, table2, options);
    columnOptions = { null: false, index: false, ...columnOptions };
    const [t1Ref, t2Ref] = [table1, table2].map((t) => this.referenceNameForTable(t));

    await this.createTable(joinTableName, { ...options, id: false }, (t) => {
      t.references(t1Ref, columnOptions);
      t.references(t2Ref, columnOptions);
      if (fn) fn(t);
    });
  }

  async dropJoinTable(
    table1: string,
    table2: string,
    kwargs: {
      tableName?: string;
      ifExists?: boolean;
      force?: boolean | "cascade";
      columnOptions?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    const options = { ...kwargs };
    const joinTableName = this.findJoinTableName(table1, table2, options);
    await this.dropTable(joinTableName, options);
  }

  async changeTable(
    tableName: string,
    fnOrOptions?: ((t: TableOf<this>) => void | Promise<void>) | { bulk?: boolean },
    fn?: (t: TableOf<this>) => void | Promise<void>,
    base: unknown = this,
  ): Promise<void> {
    const options = typeof fnOrOptions === "function" ? {} : (fnOrOptions ?? {});
    const callback = typeof fnOrOptions === "function" ? fnOrOptions : fn;

    const supportsBulk =
      typeof (this as any).supportsBulkAlter === "function" &&
      (this as any).supportsBulkAlter() === true;

    if (options.bulk && supportsBulk) {
      const recorder = new CommandRecorder(this);
      const bulkTable = this.updateTableDefinition(tableName, recorder as unknown) as TableOf<this>;
      if (callback) await callback(bulkTable);
      await this.bulkChangeTable(tableName, recorder.commands);
    } else {
      const table = this.updateTableDefinition(tableName, base) as TableOf<this>;
      if (callback) await callback(table);
    }
  }

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    oldName = String(oldName);
    newName = String(newName);
    this.validateIndexLengthBang(tableName, newName);

    const oldIndexDef = (await this.indexes(tableName)).find((i) => i.name === oldName);
    if (!oldIndexDef) return;
    await this.addIndex(tableName, oldIndexDef.columns, {
      name: newName,
      unique: oldIndexDef.unique,
    });
    await this.removeIndex(tableName, { name: oldName });
  }

  indexName(
    tableName: string,
    options:
      | { column?: string | string[]; name?: string; _usesLegacyIndexName?: boolean }
      | string
      | string[],
  ): string {
    if (typeof options !== "string" && !Array.isArray(options)) {
      if (options.column != null) {
        if (options._usesLegacyIndexName) {
          const cols = wrap(options.column);
          return `index_${tableName}_on_${cols.join("_and_")}`;
        }
        return this.generateIndexName(tableName, options.column);
      }
      if (options.name != null) return options.name;
      throw new ArgumentError("You must specify the index name");
    }
    return this.indexName(tableName, this.indexNameOptions(options));
  }

  async removeColumns(tableName: string, ...columns: string[]): Promise<void>;
  async removeColumns(tableName: string, ...args: [...string[], ColumnOptions]): Promise<void>;
  async removeColumns(
    tableName: string,
    ...columnNames: Array<string | ColumnOptions>
  ): Promise<void> {
    const { type = null, ...options } = extractOptionsBang(columnNames);
    if (isEmpty(columnNames)) {
      throw new ArgumentError(
        "You must specify at least one column name. Example: remove_columns(:people, :first_name)",
      );
    }

    const removeColumnFragments = this.removeColumnsForAlter(
      tableName,
      ...(columnNames as string[]),
      { type, ...options },
    );
    await this.execute(
      `ALTER TABLE ${this.quoteTableName(tableName)} ${removeColumnFragments.join(", ")}`,
    );
  }

  async addColumns(
    tableName: string,
    ...args: [...string[], { type: ColumnType } & ColumnOptions]
  ): Promise<void>;
  async addColumns(
    tableName: string,
    ...columnNames: Array<string | ({ type: ColumnType } & ColumnOptions)>
  ): Promise<void> {
    const options = extractOptionsBang(columnNames);
    if (!("type" in options)) throw new ArgumentError("missing keyword: :type");
    const type = hashDelete(options, "type") as ColumnType;
    for (const columnName of columnNames as string[]) {
      await this.addColumn(tableName, columnName, type, options);
    }
  }

  async columns(tableName: string): Promise<Column[]> {
    tableName = String(tableName);
    const adapter = this as unknown as {
      columnDefinitions(tableName: string): Promise<any[]>;
      newColumnFromField(
        tableName: string,
        field: any,
        definitions: any[],
      ): Column | Promise<Column>;
    };
    const definitions = await adapter.columnDefinitions(tableName);
    const columns: Column[] = [];
    for (const field of definitions) {
      columns.push(await adapter.newColumnFromField(tableName, field, definitions));
    }
    return columns;
  }

  async indexes(_tableName: string): Promise<IndexDefinition[]> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:81
    throw new NotImplementedError("#indexes is not implemented");
  }

  async primaryKey(tableName: string): Promise<string | string[] | null> {
    const primaryKeys = await (
      this as unknown as { primaryKeys(tableName: string): Promise<string[]> }
    ).primaryKeys(tableName);
    let pk: string | string[] | null = primaryKeys;
    if (!(primaryKeys.length > 1)) pk = primaryKeys[0] ?? null;
    return pk;
  }

  async foreignKeys(_tableName: string): Promise<ForeignKeyDefinition[]> {
    // @nie disposition=TODO
    throw new NotImplementedError("foreign_keys is not implemented");
  }

  async tables(): Promise<string[]> {
    return (await this.queryValues(this.dataSourceSql({ type: "BASE TABLE" }), "SCHEMA")).map(
      String,
    );
  }

  async views(): Promise<string[]> {
    return (await this.queryValues(this.dataSourceSql({ type: "VIEW" }), "SCHEMA")).map(String);
  }

  async viewExists(viewName: string): Promise<boolean | null> {
    if (!isPresent(viewName)) return null;
    try {
      return any(await this.queryValues(this.dataSourceSql(viewName, { type: "VIEW" }), "SCHEMA"));
    } catch (e) {
      if (e instanceof NotImplementedError) {
        return (await this.views()).includes(String(viewName));
      }
      throw e;
    }
  }

  async indexExists(
    tableName: string,
    columnName: string | string[] | null | undefined,
    options: {
      column?: string | string[];
      name?: string;
      unique?: boolean;
      valid?: boolean;
      include?: string | string[];
      nullsNotDistinct?: boolean;
      [key: string]: unknown;
    } = {},
  ): Promise<boolean> {
    return (await this.indexes(tableName)).some((i) => i.isDefinedFor(columnName, options));
  }

  async foreignKeyExists(
    fromTable: string,
    toTable?: string | ForeignKeyLookupOptions,
    options: Omit<ForeignKeyLookupOptions, "toTable"> = {},
  ): Promise<boolean> {
    if (typeof toTable === "object" && toTable !== null) {
      options = toTable;
      toTable = undefined;
    }
    return isPresent(await this.foreignKeyFor(fromTable, { toTable, ...options }));
  }

  typeToSql(type: ColumnType, options: ColumnOptions = {}): string {
    let sql: string;
    const native = type == null ? undefined : this.nativeDatabaseTypes()[type];
    if (native === undefined) {
      sql = type == null ? "" : String(type);
    } else {
      const spec = (typeof native === "string" ? { name: native } : native) as {
        name?: string;
        limit?: number;
        precision?: number;
        scale?: number;
      };
      sql = spec.name ?? String(type);
      let { precision, scale, limit } = options;
      if (type === "decimal") {
        scale ??= spec.scale;
        precision ??= spec.precision;
        if (precision != null) {
          sql += scale != null ? `(${precision},${scale})` : `(${precision})`;
        } else if (scale != null) {
          throw new ArgumentError(
            "Error adding decimal column: precision cannot be empty if scale is specified",
          );
        }
      } else if (
        (type === "datetime" || type === "timestamp" || type === "time" || type === "interval") &&
        (precision ??= spec.precision) != null
      ) {
        if (precision >= 0 && precision <= 6) {
          sql += `(${precision})`;
        } else {
          throw new ArgumentError(
            `No ${spec.name} type has precision of ${precision}. The allowed range of precision is from 0 to 6`,
          );
        }
      } else if (type !== "primary_key" && (limit ??= spec.limit) != null) {
        sql += `(${limit})`;
      }
    }

    return sql;
  }

  nativeDatabaseTypes(): Record<string, unknown> {
    return {};
  }

  async tableOptions(_tableName: string): Promise<Record<string, unknown> | null> {
    return null;
  }

  async tableComment(_tableName: string): Promise<string | null> {
    return null;
  }

  tableAliasFor(
    this: SchemaStatements & { tableAliasLength(): number },
    tableName: string,
  ): string {
    const maxLen = this.tableAliasLength();
    return tableName.slice(0, maxLen).replace(/\./g, "_");
  }

  async dataSources(): Promise<string[]> {
    try {
      const values = await this.queryValues(this.dataSourceSql(), "SCHEMA");
      return values.map(String);
    } catch (error) {
      if (!(error instanceof NotImplementedError)) throw error;
      const t = await this.tables();
      const v = await this.views();
      return [...new Set([...t, ...v])];
    }
  }

  async dataSourceExists(name: string): Promise<boolean | null> {
    if (!isPresent(name)) return null;
    try {
      return any(await this.queryValues(this.dataSourceSql(name), "SCHEMA"));
    } catch (error) {
      if (!(error instanceof NotImplementedError)) throw error;
      return (await this.dataSources()).includes(String(name));
    }
  }

  async buildCreateTableDefinition(
    tableName: string,
    kwargs: {
      id?: false | ColumnType | IdHashOptions;
      primaryKey?: string | string[] | false;
      force?: boolean | "cascade";
      [key: string]: unknown;
    } = {},
    fn?: (td: TableDefinitionOf<this>) => void | Promise<void>,
  ): Promise<TableDefinitionOf<this>> {
    const { id = "primary_key", primaryKey, force: _force, ...options } = kwargs;
    const tdOptions: Record<string, unknown> = {};
    for (const key of [...this.validTableDefinitionOptions(), "_skipValidateOptions"]) {
      if (key in options) {
        tdOptions[key] = options[key];
        delete options[key];
      }
    }
    const pkOptions: Record<string, unknown> = {};
    for (const key of [...this.validPrimaryKeyOptions(), "_skipValidateOptions"]) {
      if (key in options) {
        pkOptions[key] = options[key];
        delete options[key];
      }
    }

    const tableDefinition = this.createTableDefinition(
      tableName,
      tdOptions,
    ) as TableDefinitionOf<this>;
    tableDefinition.setPrimaryKey(tableName, id, primaryKey, pkOptions);

    if (fn) await fn(tableDefinition);

    return tableDefinition;
  }

  async buildCreateJoinTableDefinition(
    table1: string,
    table2: string,
    kwargs: {
      columnOptions?: Record<string, unknown>;
      tableName?: string;
      [key: string]: unknown;
    } = {},
    fn?: (td: TableDefinitionOf<this>) => void | Promise<void>,
  ): Promise<TableDefinitionOf<this>> {
    const options: Record<string, unknown> = { ...kwargs };
    let columnOptions = (options.columnOptions as Record<string, unknown>) ?? {};
    delete options.columnOptions;
    const joinTableName = this.findJoinTableName(table1, table2, options);
    columnOptions = { null: false, index: false, ...columnOptions };

    const [t1Ref, t2Ref] = [table1, table2].map((t) => this.referenceNameForTable(t));

    return this.buildCreateTableDefinition(joinTableName, { ...options, id: false }, async (td) => {
      td.references(t1Ref, columnOptions);
      td.references(t2Ref, columnOptions);
      if (fn) await fn(td);
    });
  }

  async buildAddColumnDefinition(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { ifNotExists?: boolean } = {},
  ): Promise<AlterTable | null> {
    if (options.ifNotExists === true && (await this.columnExists(tableName, columnName))) {
      return null;
    }
    const { ifNotExists: _, ...colOpts } = options;

    if (this.supportsDatetimeWithPrecision?.()) {
      if (type === "datetime" && !("precision" in colOpts)) {
        colOpts.precision = 6;
      }
    }

    const at = this.createAlterTable(tableName);
    at.addColumn(columnName, type, colOpts);
    return at;
  }

  buildChangeColumnDefaultDefinition(
    _tableName: string,
    _columnName: string,
    _defaultOrChanges: unknown,
  ): Promise<ChangeColumnDefaultDefinition | undefined> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:738
    throw new NotImplementedError("build_change_column_default_definition is not implemented");
  }

  async buildCreateIndexDefinition(
    tableName: string,
    columnName: string | string[],
    options: {
      name?: string;
      unique?: boolean;
      where?: string;
      using?: string;
      type?: string;
      algorithm?: string;
      ifNotExists?: boolean;
      [key: string]: unknown;
    } = {},
  ): Promise<CreateIndexDefinition> {
    const [index, algorithm, ifNotExists] = await this.addIndexOptions(
      tableName,
      columnName,
      options,
    );
    return new CreateIndexDefinition(index, algorithm, ifNotExists);
  }

  async indexNameExists(
    tableName: string,
    indexName: string,
  ): Promise<IndexDefinition | boolean | undefined> {
    indexName = String(indexName);
    return (await this.indexes(tableName)).find((i) => i.name === indexName);
  }

  foreignKeyColumnFor(tableName: string, columnName = "id"): string {
    const name = this.stripTableNamePrefixAndSuffix(tableName);
    return `${singularize(name)}_${columnName}`;
  }

  foreignKeyOptions(
    fromTable: string,
    toTable: string,
    options: Record<string, unknown> = {},
  ): Record<string, unknown> {
    options = { ...options };

    if (Array.isArray(options.primaryKey)) {
      if (!rtest(options.column)) {
        options.column = (options.primaryKey as string[]).map((pkColumn) =>
          this.foreignKeyColumnFor(toTable, pkColumn),
        );
      }
    } else {
      if (!rtest(options.column)) options.column = this.foreignKeyColumnFor(toTable, "id");
    }

    if (!rtest(options.name)) options.name = this.foreignKeyName(fromTable, options);

    if (Array.isArray(options.column) || Array.isArray(options.primaryKey)) {
      if (wrap(options.primaryKey).length !== wrap(options.column).length) {
        throw new ArgumentError(
          `For composite primary keys, specify :column and :primary_key, where ` +
            `:column must reference all the :primary_key columns from ${JSON.stringify(toTable)}`,
        );
      }
    }

    return options;
  }

  async checkConstraints(_tableName: string): Promise<CheckConstraintDefinition[]> {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  checkConstraintOptions(
    tableName: string,
    expression: string,
    options: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const dup = { ...options };
    dup.name ??= this.checkConstraintName(tableName, { expression, ...dup } as {
      name?: string;
      expression?: string;
    });
    return dup;
  }

  async checkConstraintExists(
    tableName: string,
    options: { name?: string; expression?: string; validate?: boolean } = {},
  ): Promise<boolean> {
    if (!("name" in options) && !("expression" in options)) {
      throw new ArgumentError("At least one of :name or :expression must be supplied");
    }
    return (await this.checkConstraintFor(tableName, options)) !== undefined;
  }

  async removeConstraint(tableName: string, constraintName: string | undefined): Promise<void> {
    const at = this.createAlterTable(tableName);
    at.dropConstraint(constraintName);
    await this.execute(await this.schemaCreation.accept(at));
  }

  async dumpSchemaInformation(): Promise<string | null> {
    const versions = await this._pool.schemaMigration.versions();
    if (versions.length === 0) return null;
    return this.insertVersionsSql(versions);
  }

  internalStringOptionsForPrimaryKey(): Record<string, unknown> {
    return { primaryKey: true };
  }

  async assumeMigratedUptoVersion(version: number | string): Promise<void> {
    version = Number(toI(version));

    const pool = this._pool;
    const smTable = this.quoteTableName(pool.schemaMigration.tableName);

    const migrationContext = pool.migrationContext;
    const migrated = await migrationContext.getAllVersions();
    const allVersions = migrationContext.migrations.map((m) => m.version);

    if (!migrated.includes(version)) {
      await this.execute(`INSERT INTO ${smTable} (version) VALUES (${this.quote(version)})`);
    }

    const inserting = allVersions.filter((v) => v < version && !migrated.includes(v));
    if (inserting.length > 0) {
      const duplicate = inserting.find((v) => inserting.filter((x) => x === v).length > 1);
      if (duplicate !== undefined) {
        throw new Error(
          `Duplicate migration ${duplicate}. Please renumber your migrations to resolve the conflict.`,
        );
      }
      await this.execute(this.insertVersionsSql(inserting));
    }
  }

  columnsForDistinct(columns: string | string[], _orders?: string[]): string | string[] {
    return columns;
  }

  async distinctRelationForPrimaryKey(relation: Relation<Base>): Promise<void> {
    const primaryKeyColumns = wrap(relation.primaryKey).map((column) =>
      this.visitor.compile(relation.table.get(column)),
    );

    const values = this.columnsForDistinct(primaryKeyColumns, relation.orderValues as string[]);

    const limited = relation.reselect(values).distinctBang();
    const limitedIds = (await this.selectRows(limited.arel(), "SQL")).map((results) =>
      results.slice(results.length - wrap(relation.primaryKey).length),
    );

    if (limitedIds.length === 0) {
      relation.noneBang();
    } else {
      relation.whereBang(
        Object.fromEntries(
          wrap(relation.primaryKey).map((key, i) => [key, limitedIds.map((row) => row[i])]),
        ),
      );
    }

    relation.limitValue = relation.offsetValue = null;
  }

  updateTableDefinition(tableName: string, base?: unknown): Table {
    return new Table(tableName, (base ?? this) as SchemaStatements);
  }

  async addIndexOptions(
    tableName: string,
    columnName: string | string[],
    options: {
      name?: string;
      ifNotExists?: boolean;
      internal?: boolean;
      unique?: boolean;
      where?: string;
      using?: string;
      type?: string;
      algorithm?: string;
      [key: string]: unknown;
    } = {},
  ): Promise<[IndexDefinition, string | undefined, boolean]> {
    const { name: _n, ifNotExists: _i, internal: _int, ...rest } = options;
    assertValidKeys(rest, [
      "unique",
      "length",
      "order",
      "opclass",
      "where",
      "type",
      "using",
      "comment",
      "algorithm",
      "include",
      "nullsNotDistinct",
    ]);

    const columnNames = this.indexColumnNames(columnName);
    const indexName = options.name?.toString() ?? this.indexName(tableName, columnNames);

    this.validateIndexLengthBang(tableName, indexName, options.internal);

    const idx = new IndexDefinition(tableName, indexName, !!options.unique, columnNames, {
      where: options.where,
      using: options.using,
      type: options.type,
      lengths: (options.length ?? {}) as Record<string, number>,
      orders: (options.order ?? {}) as Record<string, string>,
      opclasses: (options.opclass ?? {}) as Record<string, string>,
      include: options.include as string | string[] | undefined,
      nullsNotDistinct: options.nullsNotDistinct as boolean | undefined,
      comment: options.comment as string | undefined,
    });
    return [idx, this.indexAlgorithm(options.algorithm), !!options.ifNotExists];
  }

  indexAlgorithm(algorithm?: string): string | undefined {
    if (algorithm == null) return undefined;
    const indexAlgorithms = this.indexAlgorithms();
    return fetch<string>(
      indexAlgorithms,
      algorithm,
      block(() => {
        throw new ArgumentError(
          `Algorithm must be one of the following: ${Object.keys(indexAlgorithms)
            .map((a) => `:${a}`)
            .join(", ")}`,
        );
      }),
    );
  }

  async quotedColumnsForIndex(
    columnNames: string[],
    options: Record<string, unknown> = {},
  ): Promise<string> {
    const quotedColumns = new Map<string, string>();
    for (const name of columnNames) {
      quotedColumns.set(name, this.quoteColumnName(name));
    }
    return Array.from(
      (
        await this.addOptionsForIndexColumns(
          quotedColumns,
          options as { order?: string | Record<string, string> },
        )
      ).values(),
    ).join(", ");
  }

  isOptionsIncludeDefault(options: Record<string, unknown>): boolean {
    return "default" in options && !(options.null === false && options.default == null);
  }

  async changeTableComment(_tableName: string, _commentOrChanges: CommentOrChanges): Promise<void> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:1528
    throw new NotImplementedError(
      `${this.constructor.name} does not support changing table comments`,
    );
  }

  async changeColumnComment(
    _tableName: string,
    _columnName: string,
    _commentOrChanges: CommentOrChanges,
  ): Promise<void> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:1538
    throw new NotImplementedError(
      `${this.constructor.name} does not support changing column comments`,
    );
  }

  createSchemaDumper(options: Record<string, unknown>): SchemaDumper {
    return SchemaDumper.create(
      this as unknown as Parameters<typeof SchemaDumper.create>[0],
      options,
    );
  }

  useForeignKeys(): boolean {
    return this.supportsForeignKeys() && this.isForeignKeysEnabled();
  }

  async bulkChangeTable(tableName: string, operations: MigrationCommand[]): Promise<void> {
    let sqlFragments: string[] = [];
    let nonCombinableOperations: Array<() => Promise<void>> = [];

    for (const [command, args] of operations) {
      const [table, ...arguments_] = args as [string, ...unknown[]];
      const method = `${command}ForAlter`;

      if (typeof (this as any)[method] === "function") {
        const [sqls, procs] = partition(
          wrap(await (this as any)[method](table, ...arguments_)),
          (v) => typeof v === "string",
        ) as [string[], Array<() => Promise<void>>];
        for (const sql of sqls) sqlFragments.push(sql);
        for (const proc of procs) nonCombinableOperations.push(proc);
      } else {
        if (sqlFragments.length > 0) {
          await this.execute(
            `ALTER TABLE ${this.quoteTableName(tableName)} ${sqlFragments.join(", ")}`,
          );
        }
        for (const proc of nonCombinableOperations) await proc();
        sqlFragments = [];
        nonCombinableOperations = [];
        await (this as any)[command](table, ...arguments_);
      }
    }

    if (sqlFragments.length > 0) {
      await this.execute(
        `ALTER TABLE ${this.quoteTableName(tableName)} ${sqlFragments.join(", ")}`,
      );
    }
    for (const proc of nonCombinableOperations) await proc();
  }

  validTableDefinitionOptions(): string[] {
    return ["temporary", "ifNotExists", "options", "as", "comment", "charset", "collation"];
  }

  validColumnDefinitionOptions(): string[] {
    return ColumnDefinition.OPTION_NAMES;
  }

  validPrimaryKeyOptions(): string[] {
    return ["limit", "default", "precision"];
  }

  maxIndexNameSize(): number {
    return 62;
  }

  /** @internal */
  generateIndexName(tableName: string, column: string | string[]): string {
    let name = `index_${tableName}_on_${wrap(column).join("_and_")}`;
    if (new TextEncoder().encode(name).length <= this.maxIndexNameSize()) return name;

    const hashedIdentifier = "_" + first(OpenSSL.Digest.SHA256.hexdigest(name), 10);
    name = `idx_on_${wrap(column).join("_")}`;

    const shortLimit = this.maxIndexNameSize() - new TextEncoder().encode(hashedIdentifier).length;
    const shortName = mbChars(name).limit(shortLimit).toS();

    return `${shortName}${hashedIdentifier}`;
  }

  /** @internal */
  validateChangeColumnNullArgumentBang(value: unknown): void {
    if (value !== true && value !== false) {
      throw new ArgumentError(
        `change_column_null expects a boolean value (true for NULL, false for NOT NULL). Got: ${rbInspect(value)}`,
      );
    }
  }

  /** @internal */
  columnOptionsKeys(): string[] {
    return ["limit", "precision", "scale", "default", "null", "collation", "comment"];
  }

  /** @internal */
  addIndexSortOrder(
    quotedColumns: Map<string, string>,
    options: { order?: string | Record<string, string> },
  ): Map<string, string> {
    const orders = this.optionsForIndexColumns(options.order);
    for (const [name, _col] of quotedColumns) {
      const dir = orders(name);
      if (dir) quotedColumns.set(name, `${quotedColumns.get(name)} ${dir.toUpperCase()}`);
    }
    return quotedColumns;
  }

  /** @internal */
  optionsForIndexColumns<T extends string | number>(
    options: T | Record<string, T> | undefined,
  ): (col: string) => T | undefined {
    if (options && typeof options === "object") {
      return (col: string) => options[col];
    }
    return (_col: string) => options ?? undefined;
  }

  /** @internal */
  async addOptionsForIndexColumns(
    quotedColumns: Map<string, string>,
    options: {
      order?: string | Record<string, string>;
      opclass?: string | Record<string, string>;
      length?: number | Record<string, number>;
    } = {},
  ): Promise<Map<string, string>> {
    if (await this.supportsIndexSortOrder()) {
      quotedColumns = this.addIndexSortOrder(quotedColumns, options);
    }
    return quotedColumns;
  }

  /** @internal */
  async indexNameForRemove(
    tableName: string,
    columnName: string | string[] | null | undefined,
    options: { name?: string; column?: string | string[] },
  ): Promise<string> {
    if (this.canRemoveIndexByName(columnName, options)) return options.name as string;

    const checks: Array<(idx: IndexDefinition) => boolean> = [];
    let columnNames: string[];

    if (!options.name && this.isExpressionColumnName(columnName as string)) {
      options = { ...options, name: this.indexName(tableName, columnName as string) };
      columnNames = [];
    } else {
      columnNames = this.indexColumnNames((columnName ?? options.column) as string | string[]);
    }

    if (options.name) {
      const n = options.name;
      checks.push((i) => i.name === n);
    }

    if (
      columnNames.length > 0 &&
      !(options.name && this.isExpressionColumnName(columnNames as unknown as string))
    ) {
      checks.push(
        (i) => this.indexName(tableName, i.columns) === this.indexName(tableName, columnNames),
      );
    }

    if (checks.length === 0) throw new ArgumentError("No name or columns specified");

    const allIndexes = await this.indexes(tableName);
    const matching = allIndexes.filter((i) => checks.every((c) => c(i)));

    if (matching.length > 1) {
      throw new ArgumentError(
        `Multiple indexes found on ${tableName} columns ${columnNames}. Specify an index name from ${matching.map((i) => i.name).join(", ")}`,
      );
    } else if (matching.length === 0) {
      throw new ArgumentError(`No indexes found on ${tableName} with the options provided.`);
    }
    return matching[0].name;
  }

  /** @internal */
  async renameTableIndexes(
    tableName: string,
    newName: string,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const idxs = await this.indexes(newName);
    for (const index of idxs) {
      const generatedIndexName = this.indexName(tableName, {
        column: index.columns,
        ...options,
      } as any);
      if (generatedIndexName === index.name) {
        await this.renameIndex(
          newName,
          generatedIndexName,
          this.indexName(newName, { column: index.columns, ...options } as any),
        );
      }
    }
  }

  /** @internal */
  async renameColumnIndexes(
    tableName: string,
    columnName: string,
    newColumnName: string,
  ): Promise<void> {
    const colName = String(columnName);
    const newColName = String(newColumnName);
    const idxs = await this.indexes(tableName);
    for (const index of idxs) {
      if (!index.columns.includes(newColName)) continue;
      const oldColumns = [...index.columns];
      const pos = oldColumns.indexOf(newColName);
      oldColumns[pos] = colName;
      const generatedIndexName = this.indexName(tableName, { column: oldColumns });
      if (generatedIndexName === index.name) {
        await this.renameIndex(
          tableName,
          generatedIndexName,
          this.indexName(tableName, { column: index.columns }),
        );
      }
    }
  }

  /** @internal */
  createTableDefinition(name: string, options: Record<string, unknown> = {}): TableDefinition {
    return new TableDefinition(this, name, options);
  }

  /** @internal */
  createAlterTable(name: string): AlterTable {
    return new AlterTable(this.createTableDefinition(name));
  }

  /** @internal */
  validateCreateTableOptionsBang(options: Record<string, unknown>): void {
    if (options._skipValidateOptions) return;
    const { _usesLegacyTableName: _l, _skipValidateOptions: _s, ...rest } = options;
    assertValidKeys(rest, [
      ...this.validTableDefinitionOptions(),
      ...this.validPrimaryKeyOptions(),
    ]);
  }

  /** @internal */
  fetchTypeMetadata(
    sqlType: string | null,
    ..._rest: unknown[]
  ): SqlTypeMetadata | Promise<SqlTypeMetadata> {
    const castType = this.lookupCastType(sqlType);
    return SqlTypeMetadata.new({
      sqlType,
      type: castType?.type(),
      limit: castType?.limit,
      precision: castType?.precision,
      scale: castType?.scale,
    });
  }

  /** @internal */
  indexColumnNames(columnNames: string | string[]): string[] {
    if (this.isExpressionColumnName(columnNames as string)) {
      return columnNames as unknown as string[];
    }
    return wrap(columnNames);
  }

  /** @internal */
  indexNameOptions(columnNames: string | string[]): { column: string | string[] } {
    if (this.isExpressionColumnName(columnNames as string)) {
      const joined = (columnNames as string).match(/\w+/g)?.join("_") ?? String(columnNames);
      return { column: joined };
    }
    return { column: columnNames };
  }

  /** @internal */
  isExpressionColumnName(columnName: string): boolean {
    return typeof columnName === "string" && /\W/.test(columnName);
  }

  /** @internal */
  stripTableNamePrefixAndSuffix(tableName: string): string {
    const adapter = this as any;
    const prefix: string = adapter.tableNamePrefix ?? ActiveRecord.Base.tableNamePrefix;
    const suffix: string = adapter.tableNameSuffix ?? ActiveRecord.Base.tableNameSuffix;
    const str = String(tableName);
    const m = str.match(new RegExp(`${prefix}(.+)${suffix}`));
    return m ? m[1] : str;
  }

  /** @internal */
  foreignKeyName(
    tableName: string,
    options: { name?: string; column?: string | string[] },
  ): string | undefined {
    return fetch<string | undefined>(
      options,
      "name",
      block(() => {
        const columns = wrap(fetch<string[]>(symbolizeKeys(options), ":column")).map(String);
        const identifier = `${tableName}_${columns.join("_and_")}_fk`;
        const hashedIdentifier = first(OpenSSL.Digest.SHA256.hexdigest(identifier), 10);
        return `fk_rails_${hashedIdentifier}`;
      }),
    );
  }

  /** @internal */
  async foreignKeyFor(
    fromTable: string,
    options: ForeignKeyLookupOptions = {},
  ): Promise<ForeignKeyDefinition | undefined> {
    if (!this.useForeignKeys()) return undefined;
    const fks = await this.foreignKeys(fromTable);
    return fks.find((fk) => fk.isDefinedFor(options));
  }

  /** @internal */
  async foreignKeyForBang(
    fromTable: string,
    { toTable, ...options }: ForeignKeyLookupOptions,
  ): Promise<ForeignKeyDefinition> {
    const fk = await this.foreignKeyFor(fromTable, { toTable, ...options });
    if (!rtest(fk)) {
      throw new ArgumentError(
        `Table '${fromTable}' has no foreign key for ${toTable ?? rbInspect(symbolizeKeys(options))}`,
      );
    }
    return fk!;
  }

  /** @internal */
  extractForeignKeyAction(specifier: string): "cascade" | "nullify" | "restrict" | undefined {
    switch (specifier) {
      case "CASCADE":
        return "cascade";
      case "SET NULL":
        return "nullify";
      case "RESTRICT":
        return "restrict";
      default:
        return undefined;
    }
  }

  /**
   * @internal
   * @missingRailsName config — PERMANENT
   */
  isForeignKeysEnabled(): boolean {
    const foreignKeys = fetch<unknown>(this._config, "foreignKeys", true);
    return foreignKeys != null && foreignKeys !== false;
  }

  /** @internal */
  checkConstraintName(
    tableName: string,
    options: { name?: string; expression?: string } = {},
  ): string | undefined {
    return fetch<string | undefined>(
      options,
      "name",
      block(() => {
        const expression = fetch<string | undefined>(symbolizeKeys(options), ":expression");
        const identifier = `${tableName}_${expression ?? ""}_chk`;
        const hashedIdentifier = first(OpenSSL.Digest.SHA256.hexdigest(identifier), 10);
        return `chk_rails_${hashedIdentifier}`;
      }),
    );
  }

  /** @internal */
  async checkConstraintFor(
    tableName: string,
    options: { name?: string; expression?: string; validate?: boolean } = {},
  ): Promise<CheckConstraintDefinition | undefined> {
    const adapter = this as any;
    if (
      typeof adapter.supportsCheckConstraints === "function" &&
      !(await adapter.supportsCheckConstraints())
    ) {
      return undefined;
    }
    const chkName = this.checkConstraintName(tableName, options);
    const constraints = await this.checkConstraints(tableName);
    return constraints.find((chk) => chk.isDefinedFor({ name: chkName, ...options }));
  }

  /** @internal */
  async checkConstraintForBang(
    tableName: string,
    { expression, ...options }: { name?: string; expression?: string; validate?: boolean },
  ): Promise<CheckConstraintDefinition> {
    const chk = await this.checkConstraintFor(tableName, { expression, ...options });
    if (!rtest(chk)) {
      throw new ArgumentError(
        `Table '${tableName}' has no check constraint for ${expression ?? rbInspect(symbolizeKeys(options))}`,
      );
    }
    return chk!;
  }

  /** @internal */
  validateIndexLengthBang(tableName: string, newName: string, _internal = false): void {
    if (newName.length > this.indexNameLength()) {
      throw new ArgumentError(
        `Index name '${newName}' on table '${tableName}' is too long; the limit is ${this.indexNameLength()} characters`,
      );
    }
  }

  /** @internal */
  validateTableLengthBang(tableName: string): void {
    if (tableName.length > this.tableNameLength()) {
      throw new ArgumentError(
        `Table name '${tableName}' is too long; the limit is ${this.tableNameLength()} characters`,
      );
    }
  }

  /** @internal */
  extractNewDefaultValue(defaultOrChanges: unknown): unknown {
    if (
      defaultOrChanges !== null &&
      typeof defaultOrChanges === "object" &&
      "from" in (defaultOrChanges as Record<string, unknown>) &&
      "to" in (defaultOrChanges as Record<string, unknown>)
    ) {
      return (defaultOrChanges as { to: unknown }).to;
    }
    return defaultOrChanges;
  }

  /** @internal */
  extractNewCommentValue(defaultOrChanges: CommentOrChanges): string | null {
    return this.extractNewDefaultValue(defaultOrChanges) as string | null;
  }

  /** @internal */
  canRemoveIndexByName(
    columnName: string | string[] | undefined | null,
    options: Record<string, unknown>,
  ): boolean {
    return columnName == null && "name" in options && isEmpty(except(options, "name", "algorithm"));
  }

  /** @internal */
  referenceNameForTable(tableName: string): string {
    return singularize(tableName.split(".").at(-1) ?? tableName);
  }

  /** @internal */
  addColumnForAlter(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): Promise<string | [string, () => Promise<void>]> {
    const td = this.createTableDefinition(tableName);
    const cd = td.newColumnDefinition(columnName, type, options);
    return this.schemaCreation.accept(new AddColumnDefinition(cd));
  }

  /** @internal */
  async changeColumnDefaultForAlter(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<string> {
    const cd = await this.buildChangeColumnDefaultDefinition(
      tableName,
      columnName,
      defaultOrChanges,
    );
    return (this.schemaCreation as { accept(o: unknown): Promise<string> }).accept(cd);
  }

  /** @internal */
  renameColumnSql(_tableName: string, columnName: string, newColumnName: string): string {
    return `RENAME COLUMN ${this.quoteColumnName(columnName)} TO ${this.quoteColumnName(newColumnName)}`;
  }

  /** @internal */
  removeColumnForAlter(
    _tableName: string,
    columnName: string,
    _type?: ColumnType,
    _options: ColumnOptions = {},
  ): string {
    return `DROP COLUMN ${this.quoteColumnName(columnName)}`;
  }

  /** @internal */
  removeColumnsForAlter(
    tableName: string,
    ...columnNames: Array<string | Record<string, unknown>>
  ): string[] {
    extractOptionsBang(columnNames);
    return (columnNames as string[]).map((columnName) =>
      this.removeColumnForAlter(tableName, columnName),
    );
  }

  /** @internal */
  async addTimestampsForAlter(
    tableName: string,
    options: ColumnOptions = {},
  ): Promise<Array<string | [string, () => Promise<void>]>> {
    const opts: ColumnOptions = { ...options };
    if (opts.null == null) opts.null = false;
    if (!("precision" in opts) && (this as any).supportsDatetimeWithPrecision?.()) {
      opts.precision = 6;
    }
    return [
      await this.addColumnForAlter(tableName, "created_at", "datetime", opts),
      await this.addColumnForAlter(tableName, "updated_at", "datetime", opts),
    ];
  }

  /** @internal */
  removeTimestampsForAlter(tableName: string, _options: Record<string, unknown> = {}): string[] {
    return this.removeColumnsForAlter(tableName, "updated_at", "created_at");
  }

  /** @internal */
  insertVersionsSql(versions: string | number | Array<string | number>): string {
    const smTable = this.quoteTableName(this._pool.schemaMigration.tableName);

    if (Array.isArray(versions)) {
      const rows = [...versions].reverse().map((v) => `(${this.quote(v)})`);
      return `INSERT INTO ${smTable} (version) VALUES\n${rows.join(",\n")};`;
    }
    return `INSERT INTO ${smTable} (version) VALUES (${this.quote(versions)});`;
  }

  /** @internal */
  dataSourceSql(name?: string | null, options?: { type?: string }): string;
  /** @internal */
  dataSourceSql(options: { type?: string }): string;
  /** @internal */
  dataSourceSql(
    _nameOrOptions?: string | null | { type?: string },
    _options?: { type?: string },
  ): string {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:1890
    throw new NotImplementedError(
      "ActiveRecord::ConnectionAdapters::SchemaStatements#data_source_sql is not implemented",
    );
  }

  /** @internal */
  quotedScope(_name?: string | null, _options?: { type?: string }): Record<string, string | null> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:1894
    throw new NotImplementedError(
      "ActiveRecord::ConnectionAdapters::SchemaStatements#quoted_scope is not implemented",
    );
  }
}

include(SchemaStatements, { findJoinTableName, joinTableName });
