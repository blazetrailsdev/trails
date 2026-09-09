import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { Column } from "./connection-adapters/column.js";
import { isBlank, isPresent } from "@blazetrails/activesupport";
import { ActiveRecordError } from "./errors.js";
import type { Base } from "./base.js";
import type {
  CheckConstraintDefinition,
  ForeignKeyDefinition,
} from "./connection-adapters/abstract/schema-definitions.js";
import type { ValueType } from "@blazetrails/activemodel";

let _base: typeof Base | undefined;

/** @internal */
export function _registerBase(base: typeof Base): void {
  _base = base;
}

function baseClass(): typeof Base {
  if (!_base) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return _base;
}

export interface IndexInfo {
  table?: string;
  columns: string | string[];
  unique: boolean;
  where?: string;
  orders?: Record<string, string> | string;
  name?: string;
  lengths?: number | Record<string, number>;
  opclasses?: string | Record<string, string>;
  using?: string;
  type?: string;
  nullsNotDistinct?: boolean;
  include?: string | string[];
  comment?: string;
}

function conciseOptions<T>(
  columns: string | string[],
  options: T | Record<string, T> | undefined,
): T | Record<string, T> | undefined {
  if (options == null || typeof options !== "object") return options;
  const values = Object.values(options as Record<string, T>);
  if (values.length === 0) return undefined;
  if (Array.isArray(columns) && columns.length === values.length && new Set(values).size === 1) {
    return values[0];
  }
  return options;
}

export interface SchemaSource {
  /** @internal */
  tables(): Promise<string[]>;
  columns(tableName: string): Promise<Column[]>;
  /** @internal */
  indexes(tableName: string): Promise<IndexInfo[]>;
  /** @internal */
  lookupCastTypeFromColumn(column: Column): ValueType;
}

export type SchemaDumpLanguage = "ts" | "js";

export interface SchemaDumperOptions {
  language?: SchemaDumpLanguage;
  version?: string;
}

export interface SchemaDumperConfig extends SchemaDumperOptions {
  tableNamePrefix?: string;
  tableNameSuffix?: string;
}

class AdapterSchemaSource implements SchemaSource {
  private _adapter: DatabaseAdapter;

  get adapter(): DatabaseAdapter {
    return this._adapter;
  }

  /** @internal */
  constructor(adapter: DatabaseAdapter) {
    this._adapter = adapter;
  }

  /** @internal */
  async tables(): Promise<string[]> {
    return this._adapter.tables();
  }

  lookupCastTypeFromColumn(column: Column): ValueType {
    return this._adapter.lookupCastTypeFromColumn(column as { sqlType: string | null });
  }

  async columns(tableName: string): Promise<Column[]> {
    return this._adapter.columns(tableName);
  }

  /** @internal */
  async indexes(tableName: string): Promise<IndexInfo[]> {
    type RichIdx = {
      columns: string | string[];
      unique: boolean;
      name?: string;
      where?: string;
      orders?: Record<string, string> | string;
      nullsNotDistinct?: boolean;
      using?: string;
      type?: string;
      lengths?: number | Record<string, number>;
      opclasses?: string | Record<string, string>;
      include?: string | string[];
      comment?: string;
    };
    const raw = (await this._adapter.indexes(tableName)) as RichIdx[];
    return raw.map((idx) => ({
      columns: idx.columns,
      unique: idx.unique,
      name: idx.name,
      where: idx.where,
      orders:
        typeof idx.orders === "string" && Array.isArray(idx.columns)
          ? Object.fromEntries(idx.columns.map((c) => [c, idx.orders as string]))
          : idx.orders,
      nullsNotDistinct: idx.nullsNotDistinct,
      using: idx.using,
      type: idx.type,
      lengths: idx.lengths,
      opclasses: idx.opclasses,
      include: idx.include,
      comment: idx.comment,
    }));
  }
}

export function statelessTest(pattern: RegExp, value: string): boolean {
  const safe =
    pattern.global || pattern.sticky
      ? new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""))
      : pattern;
  return safe.test(value);
}

export abstract class SchemaDumper {
  static ignoreTables: (string | RegExp)[] = [];
  /** @noRailsEquivalent PERMANENT */
  static language: SchemaDumpLanguage = "ts";
  static fkIgnorePattern: RegExp = /^fk_rails_[0-9a-f]{10}$/;
  static chkIgnorePattern: RegExp = /^chk_rails_[0-9a-f]{10}$/;
  static exclIgnorePattern: RegExp = /^excl_rails_[0-9a-f]{10}$/;
  static uniqueIgnorePattern: RegExp = /^uniq_rails_[0-9a-f]{10}$/;

  private _source: SchemaSource;
  protected _options: Record<string, unknown>;
  private _language: SchemaDumpLanguage;
  private _tableName?: string;
  private _version?: string;
  private _ignoreTables: (string | RegExp)[];

  /** @internal */
  constructor(connection: SchemaSource | DatabaseAdapter, options: Record<string, unknown> = {}) {
    this._source = isDatabaseAdapter(connection) ? new AdapterSchemaSource(connection) : connection;
    this._options = options;
    const lang =
      (options.language as SchemaDumpLanguage | undefined) ??
      (this.constructor as typeof SchemaDumper).language;
    this._language = lang;
    this._version = typeof options.version === "string" ? options.version : undefined;
    const subclassIgnore = (this.constructor as typeof SchemaDumper).ignoreTables ?? [];
    const base = baseClass();
    this._ignoreTables = [
      base.schemaMigrationsTableName,
      base.internalMetadataTableName,
      ...subclassIgnore,
    ];
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
   * @missingRailsCall insert — PERMANENT
   */
  formattedVersion(): string {
    const s = this._version ?? "";
    if (s.length !== 14) return s;
    return `${s.slice(0, 4)}_${s.slice(4, 6)}_${s.slice(6, 8)}_${s.slice(8)}`;
  }

  /** @internal */
  defineParams(): string {
    return this._version ? `version: ${this.formattedVersion()}` : "";
  }

  /** @internal */
  static generateOptions(config: SchemaDumperConfig = {}): Record<string, unknown> {
    return {
      tableNamePrefix: config.tableNamePrefix ?? "",
      tableNameSuffix: config.tableNameSuffix ?? "",
      language: config.language,
      version: config.version,
    };
  }

  protected static create<T extends typeof SchemaDumper>(
    this: T,
    connection: SchemaSource | DatabaseAdapter,
    options: Record<string, unknown> = {},
  ): InstanceType<T> {
    return new (this as unknown as new (
      connection: SchemaSource | DatabaseAdapter,
      options: Record<string, unknown>,
    ) => InstanceType<T>)(connection, options);
  }

  static dump(
    pool: ConnectionPoolLike | SchemaSource | DatabaseAdapter = baseClass().connectionPool(),
    stream: string[] = [],
    config: SchemaDumperConfig = baseClass(),
  ): Promise<string[]> {
    const options = this.generateOptions(config);
    if (isDatabaseAdapter(pool)) {
      const source = new AdapterSchemaSource(pool);
      return (async () => {
        try {
          const version = await (
            pool.pool as { migrationContext: { currentVersion(): Promise<number | undefined> } }
          ).migrationContext.currentVersion();
          if (version != null) options.version = String(version);
        } catch {}
        const createDialectDumper = (pool as { createSchemaDumper?: unknown }).createSchemaDumper;
        const dumper =
          (typeof createDialectDumper === "function"
            ? (createDialectDumper.call(pool, options) as SchemaDumper | undefined | null)
            : undefined) ?? this.create(source, options);
        return dumper.dump(stream);
      })();
    }
    if (isConnectionPool(pool)) {
      return pool
        .withConnection(async (connection) => {
          await this.dump(connection, stream, config);
        })
        .then(() => stream);
    }
    return this.create(pool, options).dump(stream);
  }

  static dumpTableSchema(adapter: DatabaseAdapter, tableName: string): Promise<string>;
  static dumpTableSchema(source: SchemaSource, tableName: string): Promise<string>;
  static async dumpTableSchema(
    source: SchemaSource | DatabaseAdapter,
    tableName: string,
  ): Promise<string> {
    const wrappedSource = isDatabaseAdapter(source) ? new AdapterSchemaSource(source) : source;
    let dumper: SchemaDumper;
    if (isDatabaseAdapter(source) && typeof (source as any).createSchemaDumper === "function") {
      dumper = (source as any).createSchemaDumper({}) as SchemaDumper;
    } else {
      dumper = this.create(wrappedSource);
    }
    const stream: string[] = [];
    await dumper.schemas(stream);
    await dumper.extensions(stream);
    await dumper.types(stream);
    await dumper.dumpTable(stream, tableName);
    return stream.join("\n");
  }

  async dump(stream: string[] = []): Promise<string[]> {
    this.header(stream);
    await this.schemas(stream);
    await this.extensions(stream);
    await this.types(stream);
    await this.tables(stream);
    await this.virtualTables(stream);
    this.trailer(stream);
    return stream;
  }

  /** @internal */
  protected extensions(_stream: string[]): Promise<void> {
    return Promise.resolve();
  }

  /** @internal */
  protected types(_stream: string[]): Promise<void> {
    return Promise.resolve();
  }

  /** @internal */
  protected schemas(_stream: string[]): Promise<void> {
    return Promise.resolve();
  }

  /** @internal */
  protected virtualTables(_stream: string[]): Promise<void> {
    return Promise.resolve();
  }

  private header(stream: string[]): void {
    stream.push("// This file is auto-generated from the current state of the database.");
    stream.push("// Instead of editing this file, please use the migrations feature.");
    stream.push("");
    if (this._language === "ts") {
      stream.push(`import type { DatabaseAdapter } from "@blazetrails/activerecord";`);
      stream.push("");
    }
    const params = this.defineParams();
    if (params) {
      stream.push(`export const defineParams = { ${params} };`);
      stream.push("");
    }
    if (this._language === "ts") {
      stream.push("export default async function defineSchema(ctx: DatabaseAdapter) {");
    } else {
      stream.push("/** @param {import('@blazetrails/activerecord').DatabaseAdapter} ctx */");
      stream.push("export default async function defineSchema(ctx) {");
    }
  }

  private trailer(stream: string[]): void {
    stream.push("}");
  }

  private async tables(stream: string[]): Promise<void> {
    const sortedTables = [...(await this._source.tables())].sort();

    const notIgnoredTables = sortedTables.filter((tableName) => !this.isIgnored(tableName));

    for (const [index, tableName] of notIgnoredTables.entries()) {
      await this.table(tableName, stream);
      if (index < notIgnoredTables.length - 1) stream.push("");
    }

    if (this._fkHookHost() !== undefined) {
      const foreignKeysStream: string[] = [];
      for (const tbl of notIgnoredTables) {
        await this.foreignKeys(tbl, foreignKeysStream);
      }

      if (foreignKeysStream.length > 0) stream.push("");

      for (const line of foreignKeysStream) stream.push(line);
    }
  }

  /** @internal */
  isIgnored(tableName: string): boolean {
    return this._ignoreTables.some((ignored) => {
      const stripped = this.removePrefixAndSuffix(tableName);
      if (typeof ignored === "string") return stripped === ignored;
      ignored.lastIndex = 0;
      return ignored.test(stripped);
    });
  }

  /** @internal */
  removePrefixAndSuffix(table: string): string {
    if (isBlank(this._options.tableNamePrefix) && isBlank(this._options.tableNameSuffix)) {
      return table;
    }
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prefix = escape((this._options.tableNamePrefix as string | undefined) ?? "");
    const suffix = escape((this._options.tableNameSuffix as string | undefined) ?? "");
    const re = new RegExp(`^${prefix}(.+)${suffix}$`);
    const m = table.match(re);
    return m ? m[1] : table;
  }

  /**
   * @internal Used by `dumpTableSchema` and external callers.
   * @noRailsEquivalent CONVERGEABLE the per-table body of SchemaDumper#tables (schema_dumper.rb:134), extracted so dumpTableSchema shares it.
   */
  async dumpTable(stream: string[], tableName: string): Promise<void> {
    await this.table(tableName, stream);
  }

  /** @internal */
  async table(table: string, stream: string[]): Promise<void> {
    const adapter = this._adapter();
    if (adapter && typeof adapter.supportsVirtualColumns === "function") {
      try {
        this.supportsVirtualColumns = await adapter.supportsVirtualColumns();
      } catch {
        this.supportsVirtualColumns = false;
      }
    }
    const columns = await this._source.columns(table);

    let pk: string | string[] | null = null;
    if (adapter && typeof adapter.primaryKey === "function") {
      try {
        pk = await adapter.primaryKey(table);
      } catch {}
    }

    try {
      this.tableName = table;

      const tbl: string[] = [];

      const stripped = this.removePrefixAndSuffix(table);
      const opts: string[] = [];
      if (typeof pk === "string") {
        if (pk !== "id") opts.push(`primaryKey: ${JSON.stringify(pk)}`);
        const pkcol = columns.find((c) => c.name === pk);
        let pkcolspec = this.columnSpecForPrimaryKey(pkcol);
        if (Object.keys(pkcolspec).length > 0) {
          if (!Object.keys(pkcolspec).every((k) => k === "id" || k === "default")) {
            const { id: type, ...rest } = pkcolspec;
            pkcolspec = { id: { ...(type != null ? { type } : {}), ...rest } };
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
        opts.push(this.formatOptions(tableOptions));
      }

      opts.push('force: "cascade"');
      tbl.push(
        `  await ctx.createTable(${JSON.stringify(stripped)}, { ${opts.join(", ")} }, (t) => {`,
      );

      for (const column of columns) {
        if (!this.validType(column.type))
          throw new Error(`Unknown type '${column.sqlType ?? ""}' for column '${column.name}'`);
        if (column.name === pk) continue;

        const [type, colspec] = this.columnSpec(column);
        const optStr =
          Object.keys(colspec).length > 0 ? `, { ${this.formatColspec(colspec)} }` : "";
        if (type.startsWith(":")) {
          tbl.push(`    t.${type.slice(1)}(${JSON.stringify(column.name)}${optStr});`);
        } else {
          tbl.push(
            `    t.column(${JSON.stringify(column.name)}, ${JSON.stringify(type)}${optStr});`,
          );
        }
      }

      await this.indexesInCreate(table, tbl);

      const remaining = await this.checkConstraintsInCreate(table, tbl);

      if (adapter?.supportsExclusionConstraints?.())
        await this.exclusionConstraintsInCreate?.(table, tbl);
      if (adapter?.supportsUniqueConstraints?.())
        await this.uniqueConstraintsInCreate?.(table, tbl);

      tbl.push("  });");

      if (remaining && remaining.length > 0) tbl.push("", ...remaining);

      stream.push(...tbl);
    } catch (e) {
      const cls = e instanceof Error && e.name !== "Error" ? e.name : "StandardError";
      const message = e instanceof Error ? e.message : String(e);
      stream.push(`# Could not dump table ${JSON.stringify(table)} because of following ${cls}`);
      stream.push(`#   ${message}`);
    } finally {
      this.tableName = undefined;
    }
  }

  /**
   * @internal
   * @missingRailsCall any? — PERMANENT
   */
  protected async checkConstraintsInCreate(
    table: string,
    stream: string[],
  ): Promise<string[] | undefined> {
    const host = this._hookHost("checkConstraints") as
      | {
          checkConstraints: (t: string) => Promise<unknown[]>;
          supportsCheckConstraints?: () => Promise<boolean>;
        }
      | undefined;
    if (!host) return undefined;
    if (host.supportsCheckConstraints && !(await host.supportsCheckConstraints())) return undefined;
    const checkConstraints = ((await host.checkConstraints(table)) ??
      []) as CheckConstraintDefinition[];
    if (checkConstraints.length === 0) return undefined;
    const checkValid = checkConstraints.filter((chk) => chk.isValidate);
    const checkInvalid = checkConstraints.filter((chk) => !chk.isValidate);

    if (checkValid.length > 0) {
      const checkConstraintStatements = checkValid.map((check) => {
        const [expr, ...opts] = this.checkParts(check);
        const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
        return `    t.checkConstraint(${expr}${optStr});`;
      });
      stream.push(checkConstraintStatements.sort().join("\n"));
    }

    if (checkInvalid.length > 0) {
      const tableNameStr = JSON.stringify(this.removePrefixAndSuffix(table));
      const addCheckConstraintStatements = checkInvalid.map((check) => {
        const [expr, ...opts] = this.checkParts(check);
        const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
        return `  await ctx.addCheckConstraint(${tableNameStr}, ${expr}${optStr});`;
      });
      return [addCheckConstraintStatements.sort().join("\n")];
    }
    return undefined;
  }

  /** @internal */
  protected tableOptions(_tableName: string): Promise<Record<string, unknown>> {
    return Promise.resolve({});
  }

  /** @internal */
  protected _adapter(): any {
    const src = (this as any)._source;
    return src?.adapter ?? src;
  }

  /** @internal */
  protected abstract validType(type: string | null | undefined): boolean;

  /** @internal */
  protected exclusionConstraintsInCreate?(table: string, stream: string[]): Promise<void>;

  /** @internal */
  protected uniqueConstraintsInCreate?(table: string, stream: string[]): Promise<void>;

  /** @internal */
  protected abstract columnSpec(column: Column): [string, Record<string, unknown>];

  /** @internal */
  protected abstract columnSpecForPrimaryKey(column: Column | undefined): Record<string, unknown>;

  /** @internal */
  protected abstract prepareColumnOptions(column: Column): Record<string, unknown>;

  /** @internal */
  protected abstract isDefaultPrimaryKey(column: Column): boolean;

  /** @internal */
  protected abstract isExplicitPrimaryKeyDefault(column: Column): boolean;

  /** @internal */
  protected supportsVirtualColumns = false;

  /** @internal */
  protected abstract schemaTypeWithVirtual(column: Column): string;

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
  protected abstract schemaDefault(column: Column): string | undefined;

  /** @internal */
  protected abstract schemaExpression(column: Column): string | undefined;

  /** @internal */
  protected abstract schemaCollation(column: Column): string | undefined;

  /** @internal */
  indexParts(index: IndexInfo): string[] {
    const cols =
      typeof index.columns === "string"
        ? JSON.stringify(index.columns)
        : `[${index.columns.map((c) => JSON.stringify(c)).join(", ")}]`;
    const parts: string[] = [cols];
    parts.push(`name: ${JSON.stringify(index.name)}`);
    if (index.unique) parts.push("unique: true");
    const lengths = conciseOptions(index.columns, index.lengths);
    if (lengths !== undefined) parts.push(`length: ${this.formatIndexParts(lengths)}`);
    const orders = conciseOptions(index.columns, index.orders);
    if (orders !== undefined) parts.push(`order: ${this.formatIndexParts(orders)}`);
    const opclasses = conciseOptions(index.columns, index.opclasses);
    if (opclasses !== undefined) parts.push(`opclass: ${this.formatIndexParts(opclasses)}`);
    if (index.where) parts.push(`where: ${JSON.stringify(index.where)}`);
    if (!this._adapter().defaultIndexType(index))
      parts.push(`using: ${JSON.stringify(index.using)}`);
    if (index.include != null) parts.push(`include: ${JSON.stringify(index.include)}`);
    if (index.nullsNotDistinct) parts.push("nullsNotDistinct: true");
    if (index.type) parts.push(`type: ${JSON.stringify(index.type)}`);
    if (index.comment) parts.push(`comment: ${JSON.stringify(index.comment)}`);
    return parts;
  }

  /**
   * @internal
   * @missingRailsCall any? — PERMANENT
   */
  async indexes(table: string, stream: string[]): Promise<void> {
    const indexes = await this._source.indexes(table);
    if (indexes.length > 0) {
      const addIndexStatements = indexes.map((index) => {
        const tableName = JSON.stringify(this.removePrefixAndSuffix(index.table ?? table));
        const [cols, ...opts] = this.indexParts(index);
        const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
        return `  addIndex(${tableName}, ${cols}${optStr});`;
      });
      stream.push(addIndexStatements.sort().join("\n"));
      stream.push("");
    }
  }

  /**
   * @internal
   * @missingRailsCall any? — PERMANENT
   */
  async indexesInCreate(table: string, stream: string[]): Promise<void> {
    let indexes = await this._source.indexes(table);
    if (indexes.length > 0) {
      const adapter = this._adapter();
      let exclusionConstraints: { name?: string }[];
      if (
        adapter?.supportsExclusionConstraints?.() &&
        (exclusionConstraints = await adapter.exclusionConstraints(table)).length > 0
      ) {
        const exclusionConstraintNames = exclusionConstraints.map((ec) => ec.name);
        indexes = indexes.filter((index) => !exclusionConstraintNames.includes(index.name));
      }

      let uniqueConstraints: { name?: string }[];
      if (
        adapter?.supportsUniqueConstraints?.() &&
        (uniqueConstraints = await adapter.uniqueConstraints(table)).length > 0
      ) {
        const uniqueConstraintNames = uniqueConstraints.map((uc) => uc.name);
        indexes = indexes.filter((index) => !uniqueConstraintNames.includes(index.name));
      }

      const indexStatements = indexes.map((index) => {
        const [cols, ...opts] = this.indexParts(index);
        const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
        return `    t.index(${cols}${optStr});`;
      });
      stream.push(indexStatements.sort().join("\n"));
    }
  }

  /** @internal */
  private _hookHost(method: "checkConstraints" | "foreignKeys"): unknown {
    const candidates: unknown[] = [
      this._source,
      this._source instanceof AdapterSchemaSource ? this._source.adapter : undefined,
    ];
    for (const c of candidates) {
      const fn = (c as Record<string, unknown> | undefined)?.[method];
      if (typeof fn === "function") return c;
    }
    return undefined;
  }

  /** @internal */
  private _fkHookHost(): unknown {
    return this._hookHost("foreignKeys");
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
   * @missingRailsCall any? — PERMANENT
   * @missingRailsCall order:foreignKeyColumnFor,removePrefixAndSuffix — PERMANENT
   */
  async foreignKeys(table: string, stream: string[]): Promise<void> {
    const host = this._hookHost("foreignKeys");
    if (!host) return;
    const fn = (host as { foreignKeys: (t: string) => Promise<unknown[]> }).foreignKeys;
    const fks = (await fn.call(host, table)) ?? [];
    if (fks.length === 0) return;
    const columnFor = (host as { foreignKeyColumnFor?: (t: string, c: string) => string })
      .foreignKeyColumnFor;
    const statements: string[] = [];
    for (const fk of fks as ForeignKeyDefinition[]) {
      const fromExpr = JSON.stringify(this.removePrefixAndSuffix(fk.fromTable));
      const toExpr = JSON.stringify(this.removePrefixAndSuffix(fk.toTable));
      const opts: string[] = [];
      const inferredColumn = columnFor ? columnFor.call(host, fk.toTable, "id") : undefined;
      if (fk.column && fk.column !== inferredColumn) {
        opts.push(`column: ${JSON.stringify(fk.column)}`);
      }
      if (fk.isCustomPrimaryKey) opts.push(`primaryKey: ${JSON.stringify(fk.primaryKey)}`);
      if (fk.isExportNameOnSchemaDump) opts.push(`name: ${JSON.stringify(fk.name)}`);
      if (fk.onUpdate) opts.push(`onUpdate: ${JSON.stringify(fk.onUpdate)}`);
      if (fk.onDelete) opts.push(`onDelete: ${JSON.stringify(fk.onDelete)}`);
      if (fk.deferrable !== undefined && fk.deferrable !== false)
        opts.push(`deferrable: ${JSON.stringify(fk.deferrable)}`);
      if (fk.isValidate == null || fk.isValidate === false) opts.push("validate: false");
      const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      statements.push(`  await ctx.addForeignKey(${fromExpr}, ${toExpr}${optStr});`);
    }
    stream.push(statements.sort().join("\n"));
  }

  /** @internal */
  formatColspec(colspec: Record<string, unknown>): string {
    return Object.entries(colspec)
      .map(([key, value]) => {
        return `${key}: ${
          value && typeof value === "object" && !Array.isArray(value)
            ? `{ ${this.formatColspec(value as Record<string, unknown>)} }`
            : String(value)
        }`;
      })
      .join(", ");
  }

  /** @internal */
  formatOptions(options: Record<string, unknown>): string {
    const isIdent = /^[a-zA-Z_$][\w$]*$/;
    return Object.entries(options)
      .map(([k, v]) => {
        const key = isIdent.test(k) ? k : JSON.stringify(k);
        if (typeof v === "function") {
          return `${key}: () => ${JSON.stringify((v as () => unknown)())}`;
        }
        return `${key}: ${JSON.stringify(v)}`;
      })
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

interface ConnectionPoolLike {
  withConnection<T>(fn: (conn: DatabaseAdapter) => T | Promise<T>): Promise<T>;
}

function isConnectionPool(v: unknown): v is ConnectionPoolLike {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof (v as { withConnection?: unknown }).withConnection === "function"
  );
}

function isDatabaseAdapter(v: unknown): v is DatabaseAdapter {
  if (v === null || typeof v !== "object") return false;
  const obj = v as {
    execute?: unknown;
    executeMutation?: unknown;
    adapterName?: unknown;
  };
  return (
    typeof obj.execute === "function" &&
    typeof obj.executeMutation === "function" &&
    typeof obj.adapterName === "string"
  );
}
