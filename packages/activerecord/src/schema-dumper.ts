/**
 * Schema dumper — generates TypeScript/Ruby-style schema definitions
 * from database table structure.
 *
 * Mirrors: ActiveRecord::SchemaDumper
 * (activerecord/lib/active_record/schema_dumper.rb).
 *
 * This file carries the full dumper machinery (header, table walk,
 * column/index emission, default normalization). Rails splits the
 * same logic across two classes — the base here in schema_dumper.rb
 * and a `ConnectionAdapters::SchemaDumper` subclass at
 * connection_adapters/abstract/schema_dumper.rb that adds adapter-
 * specific column-spec helpers. TypeScript can't `extends` the subclass
 * back onto this base without an ESM temporal-dead-zone cycle, so we
 * keep a single dumper class here and mix the subclass's column-spec
 * helpers in as `this`-typed functions (CLAUDE.md "Module mixins"),
 * whose bodies live at connection-adapters/abstract/schema-dumper.ts
 * to preserve the api:compare file layout. Construction is fully
 * synchronous and needs no other module to have loaded the adapter layer.
 */

import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";
import { assertSchemaAdapter } from "./connection-adapters/abstract/assert-schema-adapter.js";
import type * as SchemaIntrospectionModule from "./schema-introspection.js";
import * as adapterDumper from "./connection-adapters/abstract/schema-dumper.js";
import type {
  SchemaDumperMixinHost,
  Column,
} from "./connection-adapters/abstract/schema-dumper.js";
import { SchemaMigration } from "./schema-migration.js";
import { Base } from "./base.js";

// Lazy-load schema-introspection to break the static cycle
// (schema-dumper -> schema-introspection -> schema-statements ->
// abstract/schema-dumper -> schema-dumper). The type-only import
// above preserves the compile-time reference.
let schemaIntrospectionModulePromise: Promise<typeof SchemaIntrospectionModule> | undefined;
async function loadSchemaIntrospection(): Promise<typeof SchemaIntrospectionModule> {
  schemaIntrospectionModulePromise ??= import("./schema-introspection.js");
  return schemaIntrospectionModulePromise;
}

export interface ColumnInfo {
  name: string;
  /**
   * DSL cast type (`"string"`, `"integer"`, `"datetime"` …) — what `schemaType` reads.
   * `null` for an unmapped/composite `sqlType` (Rails' `SqlTypeMetadata#type` is nil);
   * the dumper rejects such a column via `validType?` and emits the "Could not dump
   * table" comment rather than fabricating a type.
   */
  type: string | null;
  /**
   * Raw SQL type from the adapter (`"varchar(255)"`, `"timestamp"`, `"enum('a','b')"` …).
   * Carried separately from {@link type} so dialect dumpers (`schemaType`/`schemaLimit`/
   * `schemaPrecision`) can inspect the raw declaration on live columns.
   */
  sqlType?: string | null;
  primaryKey?: boolean;
  null?: boolean;
  default?: unknown;
  defaultFunction?: string | null;
  limit?: number | null;
  precision?: number | null;
  scale?: number | null;
  collation?: string | null;
  array?: boolean;
  /** True when the column's OID-resolved type is a PostgreSQL enum (not a domain or other custom type). */
  isEnum?: boolean;
  /** True for PostgreSQL serial/bigserial columns — emitted as the `t.serial`/`t.bigserial` shorthand. */
  isSerial?: boolean;
  comment?: string | null;
  /** MySQL `AUTO_INCREMENT` flag — consulted by the dialect `isDefaultPrimaryKey`. */
  autoIncrement?: boolean;
  /** MySQL `UNSIGNED` flag — emitted as `unsigned: true` by the dialect dumper. */
  unsigned?: boolean;
  /** Generated-column flag — emitted as `t.virtual` by the dialect dumper. */
  virtual?: boolean;
  /** Raw adapter `Extra` string (MySQL) — read to distinguish stored vs virtual generated columns. */
  extra?: string | null;
}

export interface IndexInfo {
  // A string for expression indexes (the raw expression), an array of column
  // names otherwise — mirrors Rails' IndexDefinition#columns.
  columns: string | string[];
  unique: boolean;
  name?: string;
  /** Per-column max lengths (number for single-column, Record for multi). */
  lengths?: number | Record<string, number>;
  /** Per-column sort order (e.g. "asc"/"desc"). */
  orders?: string | Record<string, string>;
  /** Per-column operator class (Postgres). */
  opclasses?: string | Record<string, string>;
  where?: string;
  using?: string;
  /** MySQL index access method (`"fulltext"` / `"spatial"`). */
  type?: string;
  nullsNotDistinct?: boolean;
  /** PG covering index INCLUDE columns. */
  include?: string[];
  /** Index comment (MySQL `INDEX_COMMENT`, PG `pg_description`). */
  comment?: string;
}

/**
 * Mirrors IndexDefinition#concise_options (schema_definitions.rb): when every
 * column carries the option and all values are identical, collapse the
 * per-column map to a single scalar (`{name:10, description:10}` → `10`,
 * `{name:"desc", rating:"desc"}` → `"desc"`). Applies uniformly to lengths,
 * orders, and opclasses — including the single-column case (`{name:"desc"}` →
 * `"desc"`).
 */
function conciseOptions<T>(
  columns: string | string[],
  options: T | Record<string, T> | undefined,
): T | Record<string, T> | undefined {
  if (options == null || typeof options !== "object") return options;
  // An expression index carries `columns` as a string; a per-column option map
  // only applies to a column array, so guard before comparing counts.
  const values = Object.values(options as Record<string, T>);
  // An empty per-column map means the option is absent (e.g. sqlite reflects
  // `orders: {}` for an index with no explicit sort order) — omit it entirely
  // rather than dumping a stray `order: {}`. Rails never emits an empty map.
  if (values.length === 0) return undefined;
  if (Array.isArray(columns) && columns.length === values.length && new Set(values).size === 1) {
    return values[0];
  }
  return options;
}

/**
 * Interface for sources that can provide schema information.
 * Both MigrationContext (sync/in-memory) and database adapters (async) can implement this.
 */
export interface SchemaSource {
  /** @internal */
  tables(): string[] | Promise<string[]>;
  columns(tableName: string): ColumnInfo[] | Promise<ColumnInfo[]>;
  /** @internal */
  indexes(tableName: string): IndexInfo[] | Promise<IndexInfo[]>;
}

export type SchemaDumpLanguage = "ts" | "js";

export interface SchemaDumperOptions {
  /** Output language for the generated schema DSL: "ts" (default) or "js". */
  language?: SchemaDumpLanguage;
  /** Migration version string, surfaced via `defineParams()` in the header. */
  version?: string;
}

/**
 * DSL methods that actually exist as helpers on TableDefinition —
 * either the abstract base (connection-adapters/abstract/schema-definitions.ts)
 * or adapter-specific subclasses (e.g. PG range helpers in
 * connection-adapters/postgresql/schema-definitions.ts). Types mapped
 * to names outside this set are emitted as `t.column(name, sqlType,
 * options)` so the dumped schema loads through MigrationContext
 * without a ReferenceError.
 */
const DSL_HELPER_METHODS = new Set([
  "string",
  "text",
  "integer",
  "bigint",
  // PG serial shorthands — TableDefinition.serial / .bigserial helpers.
  "serial",
  "bigserial",
  "float",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "timestamp",
  // PG timestamp-with-time-zone — TableDefinition.timestamptz helper.
  "timestamptz",
  "time",
  "binary",
  "json",
  "jsonb",
  "citext",
  "hstore",
  "ltree",
  "tsvector",
  "inet",
  "cidr",
  "macaddr",
  "xml",
  "bit",
  "bitVarying",
  "money",
  "int4range",
  "int8range",
  "numrange",
  "daterange",
  "tsrange",
  "tstzrange",
  // PG interval / oid — TableDefinition.interval / .oid helpers (Rails emits
  // `t.interval`/`t.oid`, not the generic `t.column(name, "interval"|"oid")`).
  "interval",
  "oid",
  // PG geometric types — TableDefinition exposes a helper method for each.
  "point",
  "line",
  "lseg",
  "box",
  "path",
  "polygon",
  "circle",
  // Generated/virtual columns — t.virtual(name, { type:, as:, stored: }) DSL.
  "virtual",
]);

/**
 * Bridges a DatabaseAdapter to the SchemaSource protocol. Not public —
 * used internally by `SchemaDumper.dump(adapter, ...)` /
 * `dumpWithVersion(adapter, ...)` so adapter dumps don't require
 * callers to build a SchemaSource by hand.
 */
class AdapterSchemaSource implements SchemaSource {
  private _adapter: DatabaseAdapter;

  get adapter(): DatabaseAdapter {
    return this._adapter;
  }
  private _schema?: SchemaStatements;

  /** @internal */
  constructor(adapter: DatabaseAdapter) {
    this._adapter = adapter;
  }

  /** @internal */
  async tables(): Promise<string[]> {
    const mod = await loadSchemaIntrospection();
    return mod.introspectTables(this._adapter);
  }

  async columns(tableName: string): Promise<ColumnInfo[]> {
    const mod = await loadSchemaIntrospection();
    const cols = await mod.introspectColumns(this._adapter, tableName);
    return cols.map((col) => {
      // Generated/virtual columns: carry the flag through so the dialect dumper's
      // schemaTypeWithVirtual / prepareColumnOptions emit `t.virtual` with
      // `as:`/`stored:`. The flag lives behind `isVirtual()` on real Column
      // objects (PG/MySQL) and `.virtual` on plain mock sources; the generation
      // expression rides `defaultFunction` (Rails' extract_expression_for_virtual_column).
      const isVirtual =
        typeof (col as any).isVirtual === "function"
          ? (col as any).isVirtual()
          : (col as any).virtual === true;
      return {
        name: col.name,
        // Carry the dsl cast type in `type` and the raw SQL type in `sqlType`.
        // schemaType/schemaLimit/schemaPrecision read the dsl type off `type`
        // and inspect the raw declaration off `sqlType`. A nil dsl type
        // (unmapped/composite sqlType) flows through as null so the dumper's
        // `validType?` check rejects it — mirroring Rails, which raises rather
        // than coalescing to the raw sqlType name.
        type: col.type ?? null,
        sqlType: col.sqlType ?? undefined,
        primaryKey: col.primaryKey,
        null: col.null,
        // A virtual column has no user-visible default (Rails Column#has_default?
        // is false); clear it so schemaDefault doesn't emit a `default:` alongside
        // the `as:`/`stored:` generation options.
        default: isVirtual ? undefined : col.default,
        defaultFunction: col.defaultFunction ?? null,
        limit: col.limit ?? undefined,
        precision: col.precision === undefined ? undefined : col.precision,
        scale: col.scale ?? undefined,
        collation: col.collation ?? undefined,
        array: (col as any).array === true ? true : undefined,
        isEnum: col.type === "enum" ? true : undefined,
        isSerial: (col as any).isSerial === true ? true : undefined,
        comment: col.comment ?? undefined,
        autoIncrement: (col as any).autoIncrement === true ? true : undefined,
        unsigned: (col as any).unsigned === true ? true : undefined,
        virtual: isVirtual ? true : undefined,
        extra: (col as any).extra ?? undefined,
      };
    });
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
      include?: string[];
      comment?: string;
    };
    let raw: RichIdx[];
    const adapterAny = this._adapter as unknown as { indexes?(t: string): Promise<unknown[]> };
    if (typeof adapterAny.indexes === "function") {
      raw = (await adapterAny.indexes(tableName)) as RichIdx[];
    } else {
      if (!this._schema) {
        const mod = await import("./connection-adapters/abstract/schema-statements.js");
        assertSchemaAdapter(this._adapter);
        this._schema = new mod.SchemaStatements(this._adapter);
      }
      raw = (await this._schema.indexes(tableName)) as RichIdx[];
    }
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

/**
 * Generates the schema DSL string from a SchemaSource. Mirrors
 * Rails' base `ActiveRecord::SchemaDumper` class.
 */
export class SchemaDumper {
  static readonly DEFAULT_DATETIME_PRECISION = 6;
  static ignoreTables: (string | RegExp)[] = [];
  /** @internal Mirrors Rails' `SchemaDumper.fk_ignore_pattern`. */
  static fkIgnorePattern: RegExp = /^fk_rails_[0-9a-f]{10}$/;
  /** @internal Mirrors Rails' `SchemaDumper.chk_ignore_pattern`. */
  static chkIgnorePattern: RegExp = /^chk_rails_[0-9a-f]{10}$/;
  /** @internal Mirrors Rails' `SchemaDumper.excl_ignore_pattern`. */
  static exclIgnorePattern: RegExp = /^excl_rails_[0-9a-f]{10}$/;
  /** @internal Mirrors Rails' `SchemaDumper.unique_ignore_pattern`. */
  static uniqueIgnorePattern: RegExp = /^uniq_rails_[0-9a-f]{10}$/;

  /**
   * Per-table primary-key column order from `@connection.primary_key(table)`.
   * Populated by `table()` before column iteration so `emitTable` can render
   * `primaryKey: [...]` (and pick the single-PK column) in PK definition order
   * rather than introspection/declaration order. Mirrors Rails' reliance on
   * `@connection.primary_key(table)`, which already returns columns in key order.
   * @internal
   */
  protected primaryKeyOrderCache: Record<string, string[] | undefined> = Object.create(null);

  private _source: SchemaSource;
  protected _options: Record<string, unknown>;
  private _language: SchemaDumpLanguage;
  private _tableName?: string;
  private _version?: string;
  private _ignoreTables: (string | RegExp)[];

  /** @internal */
  constructor(source: SchemaSource, options: Record<string, unknown> = {}) {
    this._source = source;
    this._options = options;
    const lang = (options.language as SchemaDumpLanguage | undefined) ?? "ts";
    this._language = lang;
    this._version = typeof options.version === "string" ? options.version : undefined;
    const subclassIgnore = (this.constructor as typeof SchemaDumper).ignoreTables ?? [];
    // Rails seeds @ignore_tables from the configurable bookkeeping table names
    // (schema_dumper.rb:78-80) so a renamed schema_migrations/ar_internal_metadata
    // table is still excluded from the dump.
    this._ignoreTables = [
      Base.schemaMigrationsTableName,
      Base.internalMetadataTableName,
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

  /** @internal */
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
  static generateOptions(
    config: { tableNamePrefix?: string; tableNameSuffix?: string } = {},
  ): Record<string, unknown> {
    return {
      tableNamePrefix: config.tableNamePrefix ?? "",
      tableNameSuffix: config.tableNameSuffix ?? "",
    };
  }

  /**
   * Factory matching Rails' `SchemaDumper.create(connection, options)`.
   * `this` is the concrete subclass, so calling `.create(...)` on an
   * adapter subclass (`PostgreSQL::SchemaDumper.create`) returns that
   * subclass.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SchemaDumper.create
   */
  static create<T extends typeof SchemaDumper>(
    this: T,
    source: SchemaSource,
    options: Record<string, unknown> = {},
  ): InstanceType<T> {
    // Single dumper class: the `emitTable`/`columnSpec` dispatch is mixed onto
    // this prototype (see the wrappers below), so a bare-base construction is
    // fully self-contained. `this` is the concrete subclass, so calling
    // `.create(...)` on a dialect subclass returns that subclass.
    return new this(source, options) as InstanceType<T>;
  }

  /**
   * Dump from a SchemaSource (matches Rails) OR directly from a
   * DatabaseAdapter (convenience overload — bridges through
   * AdapterSchemaSource).
   */
  static dump(source: SchemaSource, options?: Record<string, unknown>): string | Promise<string>;
  static dump(adapter: DatabaseAdapter, options?: SchemaDumperOptions): Promise<string>;
  static dump(
    sourceOrAdapter: SchemaSource | DatabaseAdapter,
    options: Record<string, unknown> = {},
  ): string | Promise<string> {
    // Adapter check runs FIRST because concrete DatabaseAdapters
    // (PostgreSQLAdapter, SQLite3Adapter) implement `tables()` /
    // `columns()` / `indexes()` and so also satisfy the SchemaSource
    // duck type. The adapter-bridging path (AdapterSchemaSource)
    // does the column normalization expected by emitTable — skipping
    // it would leak raw adapter column shapes (e.g. `scale: null`)
    // into dumps.
    if (isDatabaseAdapter(sourceOrAdapter)) {
      const source = new AdapterSchemaSource(sourceOrAdapter);
      const lang = (options.language as SchemaDumpLanguage) ?? "ts";
      const dumperOptions = { ...options, language: lang };
      // Instantiate the adapter-specific subclass when the adapter exposes
      // createSchemaDumper() (MySQL/PG/SQLite) so dialect overrides like
      // MySQL's schemaPrecision (datetime precision 0 → `precision: nil`)
      // apply. Mirrors Rails' `connection.create_schema_dumper`, which mixes
      // the adapter's SchemaDumper module into the dumper. Without the hook,
      // `create` still resolves to the ConnectionAdapters subclass (see its
      // redirect) — never the bare base.
      const createDialectDumper = (sourceOrAdapter as { createSchemaDumper?: unknown })
        .createSchemaDumper;
      const dumper =
        (typeof createDialectDumper === "function"
          ? (createDialectDumper.call(sourceOrAdapter, source, dumperOptions) as
              | SchemaDumper
              | undefined
              | null)
          : undefined) ?? this.create(source, dumperOptions);
      return dumper.dump() as Promise<string>;
    }
    return this.create(sourceOrAdapter, options).dump();
  }

  static dumpTableSchema(adapter: DatabaseAdapter, tableName: string): Promise<string>;
  static dumpTableSchema(source: SchemaSource, tableName: string): Promise<string>;
  static async dumpTableSchema(
    source: SchemaSource | DatabaseAdapter,
    tableName: string,
  ): Promise<string> {
    const wrappedSource = isDatabaseAdapter(source) ? new AdapterSchemaSource(source) : source;
    // Instantiate the adapter-specific subclass when the adapter exposes
    // createSchemaDumper() (PostgreSQLAdapter and Mysql2Adapter). Otherwise
    // `create` resolves to the ConnectionAdapters subclass via its redirect —
    // the single emitTable/columnSpec dispatch, never the bare base.
    let dumper: SchemaDumper;
    if (isDatabaseAdapter(source) && typeof (source as any).createSchemaDumper === "function") {
      dumper = (source as any).createSchemaDumper(wrappedSource, {}) as SchemaDumper;
    } else {
      dumper = this.create(wrappedSource);
    }
    const lines: string[] = [];
    await dumper.schemas(lines);
    await dumper.extensions(lines);
    await dumper.types(lines);
    await dumper.dumpTable(lines, tableName);
    return lines.join("\n");
  }

  /**
   * Dump an adapter's schema with a `// Schema version: N` header
   * derived from schema_migrations. No direct Rails analog — Rails
   * emits the version as a block argument in schema.rb; our generated
   * DSL is a plain function, so we use a comment.
   */
  static async dumpWithVersion(
    adapter: DatabaseAdapter,
    options: SchemaDumperOptions = {},
  ): Promise<string> {
    const schemaMigration = new SchemaMigration(adapter);
    let version = "0";
    if (await schemaMigration.tableExists()) {
      const versions = await schemaMigration.allVersions();
      if (versions.length > 0) {
        version = versions[versions.length - 1];
      }
    }
    const schema = await this.dump(adapter, { ...options, version });
    return `// Schema version: ${version}\n${schema}`;
  }

  dump(): string | Promise<string> {
    const lines: string[] = [];
    this.header(lines);
    const schemasResult = this.schemas(lines);
    // Run header sections sequentially to preserve deterministic output order
    // (schemas → extensions → types). If any section is async, chain the rest.
    if (schemasResult instanceof Promise) {
      return schemasResult
        .then(() => this.extensions(lines))
        .then(() => this.types(lines))
        .then(() => this._finalizeDump(lines));
    }
    const extensionsResult = this.extensions(lines);
    if (extensionsResult instanceof Promise) {
      return extensionsResult.then(() => this.types(lines)).then(() => this._finalizeDump(lines));
    }
    const typesResult = this.types(lines);
    if (typesResult instanceof Promise) {
      return typesResult.then(() => this._finalizeDump(lines));
    }
    return this._finalizeDump(lines);
  }

  /** @internal */
  private _finalizeDump(lines: string[]): string | Promise<string> {
    const result = this.dumpTables(lines);
    if (result instanceof Promise) {
      return result.then(async () => {
        await this.virtualTables(lines);
        this.trailer(lines);
        return lines.join("\n");
      });
    }
    const vtResult = this.virtualTables(lines);
    if (vtResult instanceof Promise) {
      return vtResult.then(() => {
        this.trailer(lines);
        return lines.join("\n");
      });
    }
    this.trailer(lines);
    return lines.join("\n");
  }

  /** @internal */
  protected extensions(_lines: string[]): void | Promise<void> {}

  /** @internal */
  protected types(_lines: string[]): void | Promise<void> {}

  /** @internal */
  protected schemas(_lines: string[]): void | Promise<void> {}

  /** @internal */
  protected virtualTables(lines: string[]): void | Promise<void> {
    const adapter = this._source instanceof AdapterSchemaSource ? this._source.adapter : undefined;
    if (!adapter || typeof (adapter as any).virtualTables !== "function") return;
    return this._dumpVirtualTablesAsync(lines);
  }

  private async _dumpVirtualTablesAsync(lines: string[]): Promise<void> {
    const adapter = this._source instanceof AdapterSchemaSource ? this._source.adapter : undefined;
    if (!adapter) return;
    const tables: Record<string, [string, string]> = await (adapter as any).virtualTables();
    const names = Object.keys(tables).sort();
    if (names.length === 0) return;
    lines.push("");
    // Split on commas that are NOT inside single quotes; filter empty segments
    const splitArgs = (s: string): string[] => {
      if (s.trim() === "") return [];
      return s
        .split(/,(?=(?:[^']*'[^']*')*[^']*$)/)
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
    };
    for (const name of names) {
      const [moduleName, argsStr] = tables[name];
      const args = splitArgs(argsStr);
      lines.push(
        `  await ctx.createVirtualTable(${JSON.stringify(name)}, ${JSON.stringify(moduleName)}, ${JSON.stringify(args)});`,
      );
    }
  }

  private header(lines: string[]): void {
    lines.push("// This file is auto-generated from the current state of the database.");
    lines.push("// Instead of editing this file, please use the migrations feature.");
    const params = this.defineParams();
    if (params) lines.push(`// ${params}`);
    lines.push("");
    if (this._language === "ts") {
      lines.push(`import type { MigrationContext } from "@blazetrails/activerecord";`);
      lines.push("");
      lines.push("export default async function defineSchema(ctx: MigrationContext) {");
    } else {
      lines.push("/** @param {import('@blazetrails/activerecord').MigrationContext} ctx */");
      lines.push("export default async function defineSchema(ctx) {");
    }
  }

  private trailer(lines: string[]): void {
    lines.push("}");
  }

  private dumpTables(lines: string[]): void | Promise<void> {
    const tableNames = this._source.tables();
    if (tableNames instanceof Promise) {
      return tableNames.then(async (raw) => {
        const names = [...raw].sort();
        for (const tableName of names) {
          if (this.isIgnored(tableName)) continue;
          await this.table(tableName, lines);
        }
        if (this._fkHookHost() !== undefined) {
          for (const tableName of names) {
            if (this.isIgnored(tableName)) continue;
            await this.foreignKeys(tableName, lines);
          }
        }
      });
    }
    const sorted = [...tableNames].sort();
    for (const tableName of sorted) {
      if (this.isIgnored(tableName)) continue;
      const columns = this._source.columns(tableName);
      const indexes = this._source.indexes(tableName);
      if (columns instanceof Promise || indexes instanceof Promise) {
        throw new TypeError(
          "SchemaSource.columns()/indexes() returned a Promise while tables() was synchronous. " +
            "Use the async schema dumper path (make tables() return a Promise) or ensure all schema methods are synchronous.",
        );
      }
      const adapterTableOpts = this.fetchTableOptions(tableName);
      if (adapterTableOpts instanceof Promise) {
        void adapterTableOpts.catch(() => {});
        throw new TypeError(
          "fetchTableOptions() returned a Promise while tables() was synchronous. " +
            "Use the async schema dumper path (make tables() return a Promise) or ensure all schema methods are synchronous.",
        );
      }
      this.tableName = tableName;
      try {
        this.emitTable(lines, tableName, columns, indexes, adapterTableOpts);
        lines.push("");
      } finally {
        this.tableName = undefined;
      }
    }
  }

  /** @internal */
  isIgnored(tableName: string): boolean {
    const stripped = this.removePrefixAndSuffix(tableName);
    for (const pattern of this._ignoreTables) {
      if (typeof pattern === "string") {
        if (stripped === pattern) return true;
      } else if (pattern instanceof RegExp) {
        pattern.lastIndex = 0;
        if (pattern.test(stripped)) return true;
      }
    }
    return false;
  }

  /** @internal */
  removePrefixAndSuffix(table: string): string {
    const prefix = (this._options.tableNamePrefix as string | undefined) ?? "";
    const suffix = (this._options.tableNameSuffix as string | undefined) ?? "";
    if (!prefix && !suffix) return table;
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escape(prefix)}(.+)${escape(suffix)}$`);
    const m = table.match(re);
    return m ? m[1] : table;
  }

  /** @internal Used by `dumpTableSchema` and external callers. */
  async dumpTable(lines: string[], tableName: string): Promise<void> {
    await this.table(tableName, lines);
  }

  /** @internal */
  async table(tableName: string, lines: string[]): Promise<void> {
    // Mirrors Rails' reliance on `@connection.primary_key(table)`: capture the
    // authoritative PK column order before iterating columns so `emitTable` /
    // `resolvePrimaryKeyColumns` render composite/promoted keys in key order.
    const adapter = this._adapter();
    if (adapter && typeof adapter.primaryKeys === "function") {
      try {
        this.primaryKeyOrderCache[tableName] = await adapter.primaryKeys(tableName);
      } catch {
        // Live introspection is best-effort; fall through to declaration order.
      }
    }
    this.tableName = tableName;
    try {
      const columns = await this._source.columns(tableName);
      const rawIndexes = await this._source.indexes(tableName);
      const indexes = await this.filterIndexesForDump(tableName, rawIndexes);
      const adapterTableOpts = await this.fetchTableOptions(tableName);
      const inlineLines: string[] = [];
      await this.gatherInlineConstraints(tableName, inlineLines);
      this.emitTable(lines, tableName, columns, indexes, adapterTableOpts, inlineLines);
      lines.push("");
    } finally {
      this.tableName = undefined;
    }
  }

  /**
   * Collect inline constraint lines (check / exclusion / unique) to emit
   * inside the createTable block. Subclasses override to add adapter-specific
   * constraints. Base implementation handles check constraints.
   * @internal
   */
  protected async gatherInlineConstraints(tableName: string, lines: string[]): Promise<void> {
    await this.checkConstraintsInCreate(tableName, lines);
  }

  /**
   * Emit inline check-constraint `t.checkConstraint(...)` lines inside the
   * createTable block. Mirrors Rails' `SchemaDumper#check_constraints_in_create`.
   * @internal
   */
  protected async checkConstraintsInCreate(tableName: string, lines: string[]): Promise<void> {
    const host = this._hookHost("checkConstraints") as
      | {
          checkConstraints: (t: string) => Promise<unknown[]>;
          supportsCheckConstraints?: () => boolean;
          getDatabaseVersion?: () => Promise<unknown>;
        }
      | undefined;
    if (!host) return;
    // Mirror Rails' call-site guard (`schema_dumper.rb:210`: `... if
    // @connection.supports_check_constraints?`): adapters whose checkConstraints
    // raises NotImplementedError when unsupported (e.g. MySQL <8.0.16, MariaDB
    // <10.2.1) must not be queried. supportsCheckConstraints reads the cached
    // database version, which the dump path doesn't always load eagerly, so
    // ensure it's resolved first to avoid a false negative dropping real
    // constraints from the dump.
    if (host.supportsCheckConstraints) {
      await host.getDatabaseVersion?.();
      if (!host.supportsCheckConstraints()) return;
    }
    const constraints = (await host.checkConstraints(tableName)) ?? [];
    for (const chk of constraints as { expression: string; name?: string; validate?: boolean }[]) {
      const [expr, ...opts] = this.checkParts(chk);
      const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      lines.push(`    t.checkConstraint(${expr}${optStr});`);
    }
  }

  /**
   * Hook for adapter subclasses to strip indexes that are already represented
   * by a constraint (e.g. PG unique/exclusion constraints create backing indexes
   * that must not also appear as `addIndex` calls). Default: identity.
   * @internal
   */
  protected async filterIndexesForDump(
    _tableName: string,
    indexes: IndexInfo[],
  ): Promise<IndexInfo[]> {
    return indexes;
  }

  /** @internal */
  protected fetchTableOptions(
    _tableName: string,
  ): Record<string, unknown> | Promise<Record<string, unknown>> {
    return {};
  }

  /**
   * Resolves the adapter (or the raw source) backing this dumper — the object
   * whose cast types drive `schema_default`. Lives on the base because
   * `_source` is base-private; the Rails-mapped `schemaDefault` override
   * (`connection-adapters/abstract/schema-dumper.ts`) consults it.
   * @internal
   */
  protected _adapter(): any {
    const src = (this as any)._source;
    return src?.adapter ?? src;
  }

  /**
   * The table's primary-key columns, in key order. Defaults to the columns
   * carrying the per-column `primaryKey` flag (reordered by the live PK order).
   * Dialects whose per-column flag can over-report (e.g. MySQL's `column_key`
   * promotes a UNIQUE NOT NULL index to `PRI` when there is no PRIMARY KEY)
   * override this to consult the authoritative primary key instead.
   * @internal
   */
  protected resolvePrimaryKeyColumns(tableName: string, columns: ColumnInfo[]): ColumnInfo[] {
    return this.orderPrimaryKeyColumns(
      tableName,
      columns.filter((c) => c.primaryKey),
    );
  }

  /**
   * Reorder the primary-key column list to match the live PK order captured in
   * `primaryKeyOrderCache` (`@connection.primary_key(table)`); falls back to the
   * given order when no live order is known (in-memory / mock sources).
   * @internal
   */
  protected orderPrimaryKeyColumns(tableName: string, pkColumns: ColumnInfo[]): ColumnInfo[] {
    const order = this.primaryKeyOrderCache[tableName];
    if (!order || order.length === 0) return pkColumns;
    const byName = new Map(pkColumns.map((c) => [c.name, c]));
    const reordered: ColumnInfo[] = [];
    for (const name of order) {
      const col = byName.get(name);
      if (col) {
        reordered.push(col);
        byName.delete(name);
      }
    }
    for (const col of byName.values()) reordered.push(col);
    return reordered;
  }

  // Column-spec dispatch mixed in from the `ConnectionAdapters::SchemaDumper`
  // layer (connection-adapters/abstract/schema-dumper.ts). The bodies live there
  // to keep the api:compare file mapping; these thin `protected` wrappers put
  // them on this single class's prototype (so dialect subclasses' `super`/
  // `override` resolve normally) without a cyclic `extends`. Each wrapper passes
  // `this` through `_mixinHost` because the mixed-in helpers reach members this
  // class declares `protected` (a free function can't see those through `this`).

  /**
   * The same instance, typed as the public host view the mixin helpers expect.
   * Only a type reinterpretation — dynamic dispatch through `this` (dialect
   * overrides of schemaType, schemaLimit, …) is preserved.
   * @internal
   */
  private get _mixinHost(): SchemaDumperMixinHost {
    return this as unknown as SchemaDumperMixinHost;
  }

  /** @internal */
  protected validType(type: string | null | undefined): boolean {
    return adapterDumper.validType.call(this._mixinHost, type);
  }

  /** @internal */
  protected emitTable(
    lines: string[],
    tableName: string,
    columns: ColumnInfo[],
    indexes: IndexInfo[],
    adapterTableOpts: Record<string, unknown> = {},
    inlineConstraints: string[] = [],
  ): void {
    return adapterDumper.emitTable.call(
      this._mixinHost,
      lines,
      tableName,
      columns,
      indexes,
      adapterTableOpts,
      inlineConstraints,
    );
  }

  /** @internal */
  protected emitTableBody(
    lines: string[],
    tableName: string,
    columns: ColumnInfo[],
    indexes: IndexInfo[],
    adapterTableOpts: Record<string, unknown> = {},
    inlineConstraints: string[] = [],
  ): void {
    return adapterDumper.emitTableBody.call(
      this._mixinHost,
      lines,
      tableName,
      columns,
      indexes,
      adapterTableOpts,
      inlineConstraints,
    );
  }

  /** @internal */
  protected columnSpec(column: Column): [string, Record<string, unknown>] {
    return adapterDumper.columnSpec.call(this._mixinHost, column);
  }

  /** @internal */
  protected columnSpecForPrimaryKey(column: Column): Record<string, unknown> {
    return adapterDumper.columnSpecForPrimaryKey.call(this._mixinHost, column);
  }

  /** @internal */
  protected prepareColumnOptions(column: Column): Record<string, unknown> {
    return adapterDumper.prepareColumnOptions.call(this._mixinHost, column);
  }

  /** @internal */
  protected isDefaultPrimaryKey(column: Column): boolean {
    return adapterDumper.isDefaultPrimaryKey.call(this._mixinHost, column);
  }

  /** @internal */
  protected isExplicitPrimaryKeyDefault(column: Column): boolean {
    return adapterDumper.isExplicitPrimaryKeyDefault.call(this._mixinHost, column);
  }

  /** @internal */
  protected schemaTypeWithVirtual(column: Column): string {
    return adapterDumper.schemaTypeWithVirtual.call(this._mixinHost, column);
  }

  /** @internal */
  protected schemaType(column: Column): string {
    return adapterDumper.schemaType.call(this._mixinHost, column);
  }

  /** @internal */
  protected isBigint(column: Column): boolean {
    return adapterDumper.isBigint.call(this._mixinHost, column);
  }

  /** @internal */
  protected schemaLimit(column: Column): string | undefined {
    return adapterDumper.schemaLimit.call(this._mixinHost, column);
  }

  /** @internal */
  protected schemaPrecision(column: Column): string | undefined {
    return adapterDumper.schemaPrecision.call(this._mixinHost, column);
  }

  /** @internal */
  protected schemaScale(column: Column): string | undefined {
    return adapterDumper.schemaScale.call(this._mixinHost, column);
  }

  /** @internal */
  protected schemaDefault(column: Column): string | undefined {
    return adapterDumper.schemaDefault.call(this._mixinHost, column);
  }

  /** @internal */
  protected schemaExpression(column: Column): string | undefined {
    return adapterDumper.schemaExpression.call(this._mixinHost, column);
  }

  /** @internal */
  protected schemaCollation(column: Column): string | undefined {
    return adapterDumper.schemaCollation.call(this._mixinHost, column);
  }

  /** @internal */
  indexParts(index: IndexInfo): string[] {
    // Expression indexes carry the raw expression as a string and dump verbatim
    // (Rails `index.columns.inspect`); column lists dump as an array, with the
    // single-column shorthand.
    const cols =
      typeof index.columns === "string"
        ? JSON.stringify(index.columns)
        : index.columns.length === 1
          ? JSON.stringify(index.columns[0])
          : `[${index.columns.map((c) => JSON.stringify(c)).join(", ")}]`;
    const parts: string[] = [cols];
    if (index.name) parts.push(`name: ${JSON.stringify(index.name)}`);
    if (index.unique) parts.push("unique: true");
    const lengths = conciseOptions(index.columns, index.lengths);
    if (lengths !== undefined) parts.push(`length: ${this.formatIndexParts(lengths)}`);
    const orders = conciseOptions(index.columns, index.orders);
    if (orders !== undefined) parts.push(`order: ${this.formatIndexParts(orders)}`);
    const opclasses = conciseOptions(index.columns, index.opclasses);
    if (opclasses !== undefined) parts.push(`opclass: ${this.formatIndexParts(opclasses)}`);
    if (index.where) parts.push(`where: ${JSON.stringify(index.where)}`);
    if (index.using && index.using !== "btree") parts.push(`using: ${JSON.stringify(index.using)}`);
    if (index.nullsNotDistinct) parts.push("nullsNotDistinct: true");
    if (index.include && index.include.length > 0)
      parts.push(`include: ${JSON.stringify(index.include)}`);
    // Rails emits `type:` last before `comment:` (schema_dumper.rb#index_parts).
    if (index.type) parts.push(`type: ${JSON.stringify(index.type)}`);
    if (index.comment) parts.push(`comment: ${JSON.stringify(index.comment)}`);
    return parts;
  }

  /** @internal */
  indexesInCreate(tableName: string, lines: string[], indexes: IndexInfo[] = []): void {
    const stripped = this.removePrefixAndSuffix(tableName);
    for (const idx of indexes) {
      const [cols, ...opts] = this.indexParts(idx);
      const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      lines.push(`  await ctx.addIndex(${JSON.stringify(stripped)}, ${cols}${optStr});`);
    }
  }

  /**
   * Resolve the host that exposes optional `checkConstraints(table)` /
   * `foreignKeys(table)` hooks. Both an `AdapterSchemaSource`'s wrapped
   * adapter and a `SchemaStatements`-backed source can provide them, so
   * check both — keeps dumps consistent regardless of which entry point
   * the dumper was constructed with.
   * @internal
   */
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
  checkParts(check: { expression: string; name?: string; validate?: boolean }): string[] {
    const parts: string[] = [JSON.stringify(check.expression)];
    const chkIgnorePattern = (this.constructor as typeof SchemaDumper).chkIgnorePattern;
    const exportName =
      "isExportNameOnSchemaDump" in (check as object)
        ? (check as unknown as { isExportNameOnSchemaDump: boolean }).isExportNameOnSchemaDump
        : check.name != null && !statelessTest(chkIgnorePattern, check.name);
    if (exportName && check.name) parts.push(`name: ${JSON.stringify(check.name)}`);
    if (check.validate === false) parts.push("validate: false");
    return parts;
  }

  /** @internal */
  async foreignKeys(tableName: string, lines: string[]): Promise<void> {
    const host = this._hookHost("foreignKeys");
    if (!host) return;
    const fn = (host as { foreignKeys: (t: string) => Promise<unknown[]> }).foreignKeys;
    const fks = (await fn.call(host, tableName)) ?? [];
    type Fk = {
      fromTable?: string;
      toTable: string;
      column?: string;
      primaryKey?: string;
      name?: string;
      onUpdate?: string;
      onDelete?: string;
      deferrable?: boolean | string;
      validate?: boolean;
    };
    const fkIgnorePattern = (this.constructor as typeof SchemaDumper).fkIgnorePattern;
    for (const fk of fks as Fk[]) {
      const fromExpr = JSON.stringify(this.removePrefixAndSuffix(fk.fromTable ?? tableName));
      const toExpr = JSON.stringify(this.removePrefixAndSuffix(fk.toTable));
      const opts: string[] = [];
      if (fk.column) opts.push(`column: ${JSON.stringify(fk.column)}`);
      if (fk.primaryKey) opts.push(`primaryKey: ${JSON.stringify(fk.primaryKey)}`);
      // Mirrors Rails' export_name_on_schema_dump? — delegate to FK object when available
      // (ForeignKeyDefinition incorporates the fk_rails_ ignore-pattern check), else fall back.
      const exportName =
        "isExportNameOnSchemaDump" in (fk as object)
          ? (fk as unknown as { isExportNameOnSchemaDump: boolean }).isExportNameOnSchemaDump
          : fk.name != null && !statelessTest(fkIgnorePattern, fk.name);
      if (exportName && fk.name) opts.push(`name: ${JSON.stringify(fk.name)}`);
      if (fk.onUpdate) opts.push(`onUpdate: ${JSON.stringify(fk.onUpdate)}`);
      if (fk.onDelete) opts.push(`onDelete: ${JSON.stringify(fk.onDelete)}`);
      if (fk.deferrable !== undefined && fk.deferrable !== false)
        opts.push(`deferrable: ${JSON.stringify(fk.deferrable)}`);
      if (fk.validate === false) opts.push("validate: false");
      const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      lines.push(`  await ctx.addForeignKey(${fromExpr}, ${toExpr}${optStr});`);
    }
  }

  /**
   * Returns true when `dslType` is a TableDefinition helper method
   * (e.g. `"string"`, `"integer"`, `"virtual"`, `"serial"`). Used by the
   * adapter subclass's `emitTable` override to dispatch column lines.
   * @internal
   */
  protected _isDslHelper(dslType: string): boolean {
    return DSL_HELPER_METHODS.has(dslType);
  }

  /**
   * Rails-faithful colspec formatter — mirrors `SchemaDumper#format_colspec`,
   * which joins `key: value` with the values emitted **verbatim** and recurses
   * into nested objects as `{ … }` (the primary-key `id: { type:, … }` spec).
   * The values produced by `columnSpec` / `prepareColumnOptions` are already
   * fully-formatted TS-DSL text (`"false"`, `"255"`, `"null"`, `'"hello"'`,
   * `'() => "now()"'`), so they are emitted as-is.
   *
   * Keys are interpolated raw (every colspec key is an identifier), matching
   * Rails. The spec must be **compacted** — `prepareColumnOptions` only sets
   * defined keys, mirroring Rails' `spec.compact!` before `format_colspec`; a
   * stray `undefined`/`null` value would render literally.
   * @internal
   */
  formatColspec(colspec: Record<string, unknown>): string {
    return Object.entries(colspec)
      .map(([k, v]) => {
        const value =
          v && typeof v === "object" && !Array.isArray(v)
            ? `{ ${this.formatColspec(v as Record<string, unknown>)} }`
            : String(v);
        return `${k}: ${value}`;
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
          // Emit as an arrow returning the SQL expression — mirrors Rails'
          // `-> { "fn()" }` syntax in dumped `schema.rb`.
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

/**
 * Duck-type check so `dump()` can branch on adapter vs SchemaSource.
 * `DatabaseAdapter` IS a SchemaSource at the duck level (it has
 * `tables`/`columns`/`indexes`), so we identify adapters by their
 * adapter-specific surface (`execute`/`executeMutation`/
 * `adapterName`). If that matches, we route through
 * `AdapterSchemaSource` even though the raw adapter would duck-type
 * as a SchemaSource.
 */
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
