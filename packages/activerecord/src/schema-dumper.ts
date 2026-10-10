import {
  STDOUT,
  StandardError,
  StringIO,
  partition,
  rbEqq,
  rbInspect,
  rbObjAsString,
  rbObjClassname,
  regexpEscape,
  toS,
  type IO,
} from "@blazetrails/ruby-compat";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { Column } from "./connection-adapters/column.js";
import type { PostgreSQLAdapter } from "./connection-adapters/postgresql-adapter.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import {
  any,
  camelize,
  cattrAccessor,
  compact,
  isBlank,
  isPresent,
} from "@blazetrails/activesupport";
import { ActiveRecordError } from "./errors.js";
import type { Base } from "./base.js";
import type {
  CheckConstraintDefinition,
  IndexDefinition,
} from "./connection-adapters/abstract/schema-definitions.js";

let _base: typeof Base | undefined;

/** @internal */
export function _registerBase(base: typeof Base): void {
  _base = base;
}

function baseClass(): typeof Base {
  if (!_base) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return _base;
}

export interface SchemaDumperConfig {
  tableNamePrefix?: string;
  tableNameSuffix?: string;
}

export abstract class SchemaDumper {
  static ignoreTables: (string | RegExp)[] = [];
  declare static fkIgnorePattern: RegExp;
  declare static chkIgnorePattern: RegExp;
  declare static exclIgnorePattern: RegExp;
  declare static uniqueIgnorePattern: RegExp;

  static {
    cattrAccessor.call(this, "fkIgnorePattern", { default: /^fk_rails_[0-9a-f]{10}$/ });
    cattrAccessor.call(this, "chkIgnorePattern", { default: /^chk_rails_[0-9a-f]{10}$/ });
    cattrAccessor.call(this, "exclIgnorePattern", { default: /^excl_rails_[0-9a-f]{10}$/ });
    cattrAccessor.call(this, "uniqueIgnorePattern", { default: /^uniq_rails_[0-9a-f]{10}$/ });
  }

  protected connection: DatabaseAdapter;
  protected _options: Record<string, unknown>;
  private _tableName?: string;
  private _version: Promise<number | null | undefined> | null;
  private _ignoreTables: (string | RegExp)[];

  /** @internal */
  constructor(connection: DatabaseAdapter, options: Record<string, unknown> = {}) {
    this.connection = connection;
    try {
      this._version = (connection.pool as ConnectionPool).migrationContext
        .currentVersion()
        .then(null, () => null);
    } catch {
      this._version = null;
    }
    this._options = options;
    this._ignoreTables = [
      baseClass().schemaMigrationsTableName,
      baseClass().internalMetadataTableName,
      (this.constructor as typeof SchemaDumper).ignoreTables,
    ].flat();
  }

  /** @internal */
  get tableName(): string | undefined {
    return this._tableName;
  }
  /** @internal */
  set tableName(value: string | undefined) {
    this._tableName = value;
  }

  /**
   * @internal
   * @missingRailsCall insert — CONVERGEABLE schema-dumper-formatted-version-inserts-through-string-insert
   */
  async formattedVersion(): Promise<string> {
    const stringified = toS(await this._version);
    if (stringified.length !== 14) return stringified;
    return `${stringified.slice(0, 4)}_${stringified.slice(4, 6)}_${stringified.slice(6, 8)}_${stringified.slice(8)}`;
  }

  /** @internal */
  async defineParams(): Promise<string> {
    return (await this._version) != null ? `version: ${await this.formattedVersion()}` : "";
  }

  /** @internal */
  static generateOptions(config: SchemaDumperConfig): Record<string, unknown> {
    return {
      tableNamePrefix: config.tableNamePrefix,
      tableNameSuffix: config.tableNameSuffix,
    };
  }

  protected static create<T extends typeof SchemaDumper>(
    this: T,
    connection: DatabaseAdapter,
    options: Record<string, unknown> = {},
  ): InstanceType<T> {
    return new (this as unknown as new (
      connection: DatabaseAdapter,
      options: Record<string, unknown>,
    ) => InstanceType<T>)(connection, options);
  }

  static async dump<S extends IO | StringIO = IO>(
    pool: ConnectionPool = baseClass().connectionPool(),
    stream: S = STDOUT as S,
    config: SchemaDumperConfig = baseClass(),
  ): Promise<S> {
    await pool.withConnection(async (connection) => {
      await connection.createSchemaDumper(this.generateOptions(config)).dump(stream);
    });
    return stream;
  }

  async dump<S extends IO | StringIO>(stream: S): Promise<S> {
    await this.header(stream);
    await this.schemas(stream);
    await this.extensions(stream);
    await this.types(stream);
    await this.tables(stream);
    await this.virtualTables(stream);
    this.trailer(stream);
    return stream;
  }

  /** @internal */
  protected extensions(_stream: IO | StringIO): Promise<unknown> {
    return Promise.resolve();
  }

  /** @internal */
  protected types(_stream: IO | StringIO): Promise<void> {
    return Promise.resolve();
  }

  /** @internal */
  protected schemas(_stream: IO | StringIO): Promise<void> {
    return Promise.resolve();
  }

  /** @internal */
  protected virtualTables(_stream: IO | StringIO): Promise<unknown> {
    return Promise.resolve();
  }

  private async header(stream: IO | StringIO): Promise<void> {
    stream.puts(
      [
        "// This file is auto-generated from the current state of the database. Instead",
        "// of editing this file, please use the migrations feature of Active Record to",
        "// incrementally modify your database, and then regenerate this schema definition.",
        "//",
        "// This file is the source Trails uses to define your schema when running `bin/trails",
        "// db:schema:load`. When creating a new database, `bin/trails db:schema:load` tends to",
        "// be faster and is potentially less error prone than running all of your",
        "// migrations from scratch. Old migrations may fail to apply correctly if those",
        "// migrations use external dependencies or application code.",
        "//",
        "// It's strongly recommended that you check this file into your version control system.",
        "",
        `import { Schema } from "@blazetrails/activerecord";`,
        "",
        `await Schema.define({ ${await this.defineParams()} }, async ({ connection: ctx }) => {`,
      ].join("\n"),
    );
  }

  private trailer(stream: IO | StringIO): void {
    stream.puts("});");
  }

  private async tables(stream: IO | StringIO): Promise<void> {
    const sortedTables = [...(await this.connection.tables())].sort();

    const notIgnoredTables = sortedTables.filter((tableName) => !this.isIgnored(tableName));

    for (const [index, tableName] of notIgnoredTables.entries()) {
      await this.table(tableName, stream);
      if (index < notIgnoredTables.length - 1) stream.puts("");
    }

    if (this.connection.supportsForeignKeys()) {
      const foreignKeysStream = new StringIO();
      for (const tbl of notIgnoredTables) {
        await this.foreignKeys(tbl, foreignKeysStream);
      }
      const foreignKeysString = foreignKeysStream.string();
      if (foreignKeysString.length > 0) stream.puts();
      stream.print(foreignKeysString);
    }
  }

  /** @internal */
  isIgnored(tableName: string): boolean {
    return this._ignoreTables.some((ignored) =>
      rbEqq(ignored, this.removePrefixAndSuffix(tableName)),
    );
  }

  /** @internal */
  removePrefixAndSuffix(table: string): string {
    if (isBlank(this._options.tableNamePrefix) && isBlank(this._options.tableNameSuffix)) {
      return table;
    }

    const prefix = regexpEscape(toS(this._options.tableNamePrefix));
    const suffix = regexpEscape(toS(this._options.tableNameSuffix));
    return table.replace(new RegExp(`^${prefix}(.+)${suffix}$`), "$1");
  }

  /** @internal */
  async table(table: string, stream: IO | StringIO): Promise<void> {
    const columns = await this.connection.columns(table);

    try {
      this.tableName = table;

      const tbl = new StringIO();

      const pk = await this.connection.primaryKey(table);

      const stripped = this.removePrefixAndSuffix(table);
      const opts: string[] = [];
      if (typeof pk === "string") {
        if (pk !== "id") opts.push(`primaryKey: ${JSON.stringify(pk)}`);
        const pkcol = columns.find((c) => c.name === pk);
        let pkcolspec = await this.columnSpecForPrimaryKey(pkcol);
        if (Object.keys(pkcolspec).length > 0) {
          if (!Object.keys(pkcolspec).every((k) => k === "id" || k === "default")) {
            const { id: type, ...rest } = pkcolspec;
            pkcolspec = { id: compact({ type, ...rest }) };
          }
          opts.push(this.formatColspec(pkcolspec));
        }
      } else if (Array.isArray(pk)) {
        opts.push(`primaryKey: ${JSON.stringify(pk)}`);
      } else {
        opts.push("id: false");
      }

      const tableOptions = await this.tableOptions(table);
      if (isPresent(tableOptions)) {
        opts.push(this.formatOptions(tableOptions!));
      }

      opts.push('force: "cascade"');
      tbl.puts(
        `  await ctx.createTable(${JSON.stringify(stripped)}, { ${opts.join(", ")} }, (t) => {`,
      );

      for (const column of columns) {
        if (!this.connection.isValidType(column.type))
          throw new StandardError(
            `Unknown type '${column.sqlType ?? ""}' for column '${column.name}'`,
          );
        if (column.name === pk) continue;

        const [type, colspec] = await this.columnSpec(column);
        if (type.startsWith(":")) {
          tbl.print(`    t.${camelize(type.slice(1), false)}(${JSON.stringify(column.name)}`);
        } else {
          tbl.print(`    t.column(${JSON.stringify(column.name)}, ${JSON.stringify(type)}`);
        }
        if (isPresent(colspec)) tbl.print(`, { ${this.formatColspec(colspec)} }`);
        tbl.puts(");");
      }

      await this.indexesInCreate(table, tbl);
      let remaining: StringIO | undefined;
      if (await this.connection.supportsCheckConstraints())
        remaining = await this.checkConstraintsInCreate(table, tbl);
      if (this.connection.supportsExclusionConstraints())
        await this.exclusionConstraintsInCreate!(table, tbl);
      if (this.connection.supportsUniqueConstraints())
        await this.uniqueConstraintsInCreate!(table, tbl);

      tbl.puts("  });");

      if (remaining) {
        tbl.puts();
        tbl.print(remaining.string());
      }

      stream.print(tbl.string());
    } catch (e) {
      stream.puts(
        `# Could not dump table ${JSON.stringify(table)} because of following ${rbObjClassname(e)}`,
      );
      stream.puts(`#   ${(e as Error).message}`);
      stream.puts();
    } finally {
      this.tableName = undefined;
    }
  }

  /**
   * @internal
   * @inventedArm if — PERMANENT
   */
  protected async checkConstraintsInCreate(
    table: string,
    stream: IO | StringIO,
  ): Promise<StringIO | undefined> {
    const checkConstraints = await this.connection.checkConstraints(table);
    if (any(checkConstraints)) {
      const [checkValid, checkInvalid] = partition(checkConstraints, (chk) => chk.isValidate);

      if (checkValid.length > 0) {
        const checkConstraintStatements = checkValid.map((check) => {
          const [expression, ...options] = this.checkParts(check);
          return `    t.checkConstraint(${expression}${options.length > 0 ? `, { ${options.join(", ")} }` : ""});`;
        });

        stream.puts(checkConstraintStatements.sort().join("\n"));
      }

      if (checkInvalid.length > 0) {
        const remaining = new StringIO();
        const tableName = JSON.stringify(this.removePrefixAndSuffix(table));

        const addCheckConstraintStatements = checkInvalid.map((check) => {
          const [expression, ...options] = this.checkParts(check);
          return `  await ctx.addCheckConstraint(${tableName}, ${expression}${options.length > 0 ? `, { ${options.join(", ")} }` : ""});`;
        });

        remaining.puts(addCheckConstraintStatements.sort().join("\n"));
        return remaining;
      }
    }
    return undefined;
  }

  /** @internal */
  protected tableOptions(_tableName: string): Promise<Record<string, unknown> | null> {
    return Promise.resolve({});
  }

  /** @internal */
  protected exclusionConstraintsInCreate?(table: string, stream: IO | StringIO): Promise<void>;

  /** @internal */
  protected uniqueConstraintsInCreate?(table: string, stream: IO | StringIO): Promise<void>;

  /** @internal */
  protected abstract columnSpec(column: Column): Promise<[string, Record<string, unknown>]>;

  /** @internal */
  protected abstract columnSpecForPrimaryKey(
    column: Column | undefined,
  ): Promise<Record<string, unknown>>;

  /** @internal */
  protected abstract prepareColumnOptions(column: Column): Promise<Record<string, unknown>>;

  /** @internal */
  protected abstract isDefaultPrimaryKey(column: Column): boolean;

  /** @internal */
  protected abstract isExplicitPrimaryKeyDefault(column: Column): boolean;

  /** @internal */
  protected abstract schemaTypeWithVirtual(column: Column): Promise<string>;

  /** @internal */
  protected abstract schemaType(column: Column): string;

  /** @internal */
  protected abstract isBigint(column: Column): boolean;

  /** @internal */
  protected abstract schemaLimit(column: Column): string | undefined;

  /** @internal */
  protected abstract schemaPrecision(column: Column): string | undefined;

  /** @internal */
  protected abstract schemaScale(column: Column): string | undefined;

  /** @internal */
  protected abstract schemaDefault(column: Column): unknown;

  /** @internal */
  protected abstract schemaExpression(column: Column): string | undefined;

  /** @internal */
  protected abstract schemaCollation(column: Column): Promise<string | undefined>;

  /** @internal */
  indexParts(index: IndexDefinition): string[] {
    const indexParts = [rbInspect(index.columns), `name: ${JSON.stringify(index.name)}`];
    if (index.unique) indexParts.push("unique: true");
    if (isPresent(index.lengths))
      indexParts.push(`length: ${this.formatIndexParts(index.lengths)}`);
    if (isPresent(index.orders)) indexParts.push(`order: ${this.formatIndexParts(index.orders)}`);
    if (isPresent(index.opclasses))
      indexParts.push(`opclass: ${this.formatIndexParts(index.opclasses)}`);
    if (index.where) indexParts.push(`where: ${JSON.stringify(index.where)}`);
    if (!this.connection.defaultIndexType(index))
      indexParts.push(`using: ${JSON.stringify(index.using)}`);
    if (index.include != null) indexParts.push(`include: ${JSON.stringify(index.include)}`);
    if (index.nullsNotDistinct) indexParts.push("nullsNotDistinct: true");
    if (index.type) indexParts.push(`type: ${JSON.stringify(index.type)}`);
    if (index.comment) indexParts.push(`comment: ${JSON.stringify(index.comment)}`);
    return indexParts;
  }

  /** @internal */
  async indexes(table: string, stream: IO | StringIO): Promise<void> {
    const indexes = await this.connection.indexes(table);
    if (any(indexes)) {
      const addIndexStatements = indexes.map((index) => {
        const tableName = JSON.stringify(this.removePrefixAndSuffix(index.table));
        const [columns, ...options] = this.indexParts(index);
        return `  addIndex(${tableName}, ${columns}, { ${options.join(", ")} });`;
      });
      stream.puts(addIndexStatements.sort().join("\n"));
      stream.puts("");
    }
  }

  /** @internal */
  async indexesInCreate(table: string, stream: IO | StringIO): Promise<void> {
    let indexes = await this.connection.indexes(table);
    if (any(indexes)) {
      let exclusionConstraints: { name?: string }[];
      if (
        this.connection.supportsExclusionConstraints() &&
        any(
          (exclusionConstraints = await (this.connection as PostgreSQLAdapter).exclusionConstraints(
            table,
          )),
        )
      ) {
        const exclusionConstraintNames = exclusionConstraints.map((ec) => ec.name);
        indexes = indexes.filter((index) => !exclusionConstraintNames.includes(index.name));
      }

      let uniqueConstraints: { name?: string }[];
      if (
        this.connection.supportsUniqueConstraints() &&
        any(
          (uniqueConstraints = await (this.connection as PostgreSQLAdapter).uniqueConstraints(
            table,
          )),
        )
      ) {
        const uniqueConstraintNames = uniqueConstraints.map((uc) => uc.name);
        indexes = indexes.filter((index) => !uniqueConstraintNames.includes(index.name));
      }

      const indexStatements = indexes.map((index) => {
        const [columns, ...options] = this.indexParts(index);
        return `    t.index(${columns}, { ${options.join(", ")} });`;
      });
      stream.puts(indexStatements.sort().join("\n"));
    }
  }

  /** @internal */
  checkParts(check: CheckConstraintDefinition): string[] {
    const checkParts: string[] = [JSON.stringify(check.expression)];
    if (check.isExportNameOnSchemaDump) checkParts.push(`name: ${JSON.stringify(check.name)}`);
    if (!check.isValidate) checkParts.push(`validate: ${JSON.stringify(check.isValidate)}`);
    return checkParts;
  }

  /**
   * @internal
   * @inventedArm if — PERMANENT
   */
  async foreignKeys(table: string, stream: IO | StringIO): Promise<undefined> {
    const foreignKeys = await this.connection.foreignKeys(table);
    if (any(foreignKeys)) {
      const addForeignKeyStatements = foreignKeys.map((foreignKey) => {
        const parts = [
          `await ctx.addForeignKey(${JSON.stringify(this.removePrefixAndSuffix(foreignKey.fromTable))}`,
          JSON.stringify(this.removePrefixAndSuffix(foreignKey.toTable)),
        ];

        if (foreignKey.column !== this.connection.foreignKeyColumnFor(foreignKey.toTable, "id")) {
          parts.push(`column: ${JSON.stringify(foreignKey.column)}`);
        }

        if (foreignKey.isCustomPrimaryKey) {
          parts.push(`primaryKey: ${JSON.stringify(foreignKey.primaryKey)}`);
        }

        if (foreignKey.isExportNameOnSchemaDump) {
          parts.push(`name: ${JSON.stringify(foreignKey.name)}`);
        }

        if (foreignKey.onUpdate) parts.push(`onUpdate: ${JSON.stringify(foreignKey.onUpdate)}`);
        if (foreignKey.onDelete) parts.push(`onDelete: ${JSON.stringify(foreignKey.onDelete)}`);
        if (foreignKey.deferrable != null && foreignKey.deferrable !== false)
          parts.push(`deferrable: ${JSON.stringify(foreignKey.deferrable)}`);
        if (foreignKey.isValidate == null || foreignKey.isValidate === false)
          parts.push("validate: false");

        const [fromTable, toTable, ...opts] = parts;
        const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
        return `  ${fromTable}, ${toTable}${optStr});`;
      });

      stream.puts(addForeignKeyStatements.sort().join("\n"));
    }
  }

  /** @internal */
  formatColspec(colspec: Record<string, unknown>): string {
    return Object.entries(colspec)
      .map(([key, value]) => {
        return `${key}: ${
          value && typeof value === "object" && !Array.isArray(value)
            ? `{ ${this.formatColspec(value as Record<string, unknown>)} }`
            : rbObjAsString(value)
        }`;
      })
      .join(", ");
  }

  /** @internal */
  formatOptions(options: Record<string, unknown>): string {
    return Object.entries(options)
      .map(([key, value]) => `${key}: ${rbInspect(value)}`)
      .join(", ");
  }

  /** @internal */
  formatIndexParts(options: unknown): string {
    if (options && typeof options === "object" && !Array.isArray(options)) {
      return `{ ${this.formatOptions(options as Record<string, unknown>)} }`;
    }
    return JSON.stringify(options);
  }
}
