/**
 * Schema dumper — generates TypeScript/Ruby-style schema definitions
 * from database table structure.
 *
 * Mirrors: ActiveRecord::SchemaDumper
 * (activerecord/lib/active_record/schema_dumper.rb).
 *
 * This file carries the base dumper machinery (header, table walk,
 * column/index emission, default normalization), as Rails does. The
 * adapter-specific column-spec helpers live on the
 * `ConnectionAdapters::SchemaDumper` subclass at
 * connection_adapters/abstract/schema_dumper.rb, ported at
 * connection-adapters/abstract/schema-dumper.ts.
 *
 * The class is `abstract` and declares that half `protected abstract`,
 * implementing none of it — Ruby's base likewise defines no `column_spec`
 * and makes `new` a private class method. That keeps this module free of
 * any import of the adapter module, which is what lets the adapter module
 * `extends` this one without an ESM temporal-dead-zone cycle.
 */

import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { Column } from "./connection-adapters/abstract/schema-dumper.js";
import { isBlank } from "@blazetrails/activesupport";
import { ActiveRecordError } from "./errors.js";
import type { Base } from "./base.js";
import type { Type } from "@blazetrails/activemodel";
import { defaultValue } from "@blazetrails/activemodel";

let _base: typeof Base | undefined;

/**
 * @internal Receives `ActiveRecord::Base` from base.ts at module init. Rails
 * resolves the constant at call time via autoload (schema_dumper.rb:78-80), so base.rb
 * is not required here; in ESM a value import of `base.js` would instead be a
 * load-time edge putting base.ts in an import cycle, leaving its own
 * module-evaluation-time mixin wiring dependent on the graph's entry order.
 */
export function _registerBase(base: typeof Base): void {
  _base = base;
}

function baseClass(): typeof Base {
  if (!_base) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return _base;
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
  oid?: number | null;
  fmod?: number | null;
  primaryKey?: boolean;
  null?: boolean;
  default?: unknown;
  /** Rails `Column#has_default?` (connection_adapters/column.rb:30-32). */
  hasDefault?: boolean;
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
  /** SQLite `STORED` vs `VIRTUAL` generation flag — emitted as `stored:` by the dialect dumper. */
  virtualStored?: boolean;
  /** Raw adapter `Extra` string (MySQL) — read to distinguish stored vs virtual generated columns. */
  extra?: string | null;
}

/**
 * The dumper's view of an adapter index row: the `IndexDefinition` fields the
 * dumper reads plus the dialect-specific options it emits. `name` is optional
 * because `SchemaSource` implementations that aren't adapters (e.g. a dump
 * being re-read) may not carry one, and `indexParts` already treats it as
 * absent-able.
 */
export interface IndexInfo {
  table?: string;
  columns: string | string[];
  unique: boolean;
  where?: string;
  orders?: Record<string, string> | string;
  name?: string;
  /** Per-column max lengths (number for single-column, Record for multi). */
  lengths?: number | Record<string, number>;
  /** Per-column operator class (Postgres). */
  opclasses?: string | Record<string, string>;
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
 * Database adapters (async) and the dumper's test mock sources (sync) both implement it.
 */
export interface SchemaSource {
  /** @internal */
  tables(): string[] | Promise<string[]>;
  /**
   * `pkNames` is the authoritative primary key for `tableName`, which the
   * dumper has already fetched (`@connection.primary_key(table)`). Columns
   * carry no primary-key flag of their own — Rails' Column classes have none —
   * so a source that builds `ColumnInfo` from real columns uses this rather
   * than issuing the key query a second time. Optional: mock sources that
   * hand back `ColumnInfo` directly set `primaryKey` themselves.
   */
  columns(tableName: string, pkNames?: readonly string[]): ColumnInfo[] | Promise<ColumnInfo[]>;
  /** @internal */
  indexes(tableName: string): IndexInfo[] | Promise<IndexInfo[]>;
  /**
   * Rails' `@connection` in the dumper is always an adapter, so
   * `schema_default` calls `lookup_cast_type_from_column` unconditionally
   * (abstract/schema_dumper.rb:89). A `SchemaSource` stands in for that
   * connection here, so the cast-type lookup is part of the interface rather
   * than an optional method the dumper has to guard at the call site.
   * @internal
   */
  lookupCastTypeFromColumn(column: ColumnInfo): Type;
}

export type SchemaDumpLanguage = "ts" | "js";

export interface SchemaDumperOptions {
  /** Output language for the generated schema DSL: "ts" (default) or "js". */
  language?: SchemaDumpLanguage;
  /** Migration version string, surfaced via `defineParams()` in the header. */
  version?: string;
}

/**
 * The `config` argument of `SchemaDumper.dump(pool, stream, config)` — Rails
 * passes `ActiveRecord::Base` and reads `table_name_prefix` /
 * `table_name_suffix` off it (`schema_dumper.rb:43,51-56`).
 */
export interface SchemaDumperConfig extends SchemaDumperOptions {
  tableNamePrefix?: string;
  tableNameSuffix?: string;
}

/**
 * DSL methods that actually exist as helpers on TableDefinition —
 * either the abstract base (connection-adapters/abstract/schema-definitions.ts)
 * or adapter-specific subclasses (e.g. PG range helpers in
 * connection-adapters/postgresql/schema-definitions.ts). Types mapped
 * to names outside this set are emitted as `t.column(name, sqlType,
 * options)` so the dumped schema loads through the adapter DSL
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
 * used internally by `SchemaDumper.dump(adapter, ...)` so adapter dumps
 * don't require callers to build a SchemaSource by hand.
 */
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

  /** @internal */
  lookupCastTypeFromColumn(column: ColumnInfo): Type {
    // AbstractMysqlAdapter's override returns null for a blank sqlType — a
    // trails invention it flags itself (abstract-mysql-adapter.ts:1268-1276,
    // story mysql-native-type-map-converges-onto-type-map). Rails' lookup ends
    // at TypeMap#lookup, whose miss yields Type.default_value
    // (activemodel/lib/active_model/type.rb:38-40) and never nil, so the seam
    // supplies that default rather than handing the dumper a null.
    return (
      (this._adapter.lookupCastTypeFromColumn(
        column as { sqlType: string | null },
      ) as Type | null) ?? defaultValue()
    );
  }

  /** @internal The authoritative primary key for `tableName`, as column names. */
  private async _primaryKeyNames(tableName: string): Promise<string[]> {
    const adapter = this._adapter as {
      primaryKeys?: (t: string) => Promise<string[] | null | undefined>;
    };
    if (typeof adapter.primaryKeys !== "function") return [];
    try {
      return (await adapter.primaryKeys(tableName)) ?? [];
    } catch {
      // Live introspection is best-effort, as it is in SchemaDumper#table.
      return [];
    }
  }

  async columns(tableName: string, pkNames?: readonly string[]): Promise<ColumnInfo[]> {
    const cols = await this._adapter.columns(tableName);
    const pk = new Set(pkNames ?? (await this._primaryKeyNames(tableName)));
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
      const isVirtualStored =
        typeof (col as any).isVirtualStored === "function"
          ? (col as any).isVirtualStored()
          : (col as any).virtualStored === true;
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
        oid: (col as any).oid ?? undefined,
        fmod: (col as any).fmod ?? undefined,
        primaryKey: pk.has(col.name),
        null: col.null,
        // A virtual column has no user-visible default (Rails Column#has_default?
        // is false); clear it so schemaDefault doesn't emit a `default:` alongside
        // the `as:`/`stored:` generation options.
        default: isVirtual ? undefined : col.default,
        // Rails Column#has_default? (connection_adapters/column.rb:30-32).
        hasDefault: isVirtual
          ? false
          : typeof (col as any).hasDefault === "boolean"
            ? (col as any).hasDefault
            : col.default != null || (col.defaultFunction ?? null) !== null,
        defaultFunction: col.defaultFunction ?? null,
        limit: col.limit ?? undefined,
        precision: col.precision === undefined ? undefined : col.precision,
        scale: col.scale ?? undefined,
        collation: col.collation ?? undefined,
        array: (col as any).array === true ? true : undefined,
        isEnum: col.type === "enum" ? true : undefined,
        isSerial: (col as any).isSerial === true ? true : undefined,
        comment: col.comment ?? undefined,
        autoIncrement: (col as any).isAutoIncrement?.() || undefined,
        unsigned:
          (typeof (col as any).isUnsigned === "function"
            ? (col as any).isUnsigned()
            : (col as any).unsigned === true) || undefined,
        virtual: isVirtual ? true : undefined,
        virtualStored: isVirtual && isVirtualStored ? true : undefined,
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

/**
 * Generates the schema DSL string from a SchemaSource. Mirrors
 * Rails' base `ActiveRecord::SchemaDumper` class.
 */
export abstract class SchemaDumper {
  static ignoreTables: (string | RegExp)[] = [];
  /**
   * Output language for a dump that names none explicitly. Rails' dumper only
   * ever emits Ruby, so `dump(pool, stream, config)` has no slot for this;
   * trails emits TS or JS, and `DatabaseTasks.dumpSchema` sets it from
   * `schema_format` — the same global that decides `:ruby` vs `:sql` in Rails.
   * @noRailsEquivalent PERMANENT: trails' dumper emits TS or JS where Rails
   * only ever emits Ruby, so Rails has no slot to converge this onto.
   */
  static language: SchemaDumpLanguage = "ts";
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

  /**
   * Rails' dumper takes the connection itself as its dump source
   * (`schema_dumper.rb:41`); trails' dumpers read a `SchemaSource`, so an
   * adapter is bridged onto that duck type here — the one place every
   * `create` / `new` path funnels through.
   *
   * @internal
   */
  constructor(connection: SchemaSource | DatabaseAdapter, options: Record<string, unknown> = {}) {
    this._source = isDatabaseAdapter(connection) ? new AdapterSchemaSource(connection) : connection;
    this._options = options;
    const lang =
      (options.language as SchemaDumpLanguage | undefined) ??
      (this.constructor as typeof SchemaDumper).language;
    this._language = lang;
    this._version = typeof options.version === "string" ? options.version : undefined;
    const subclassIgnore = (this.constructor as typeof SchemaDumper).ignoreTables ?? [];
    // Rails seeds @ignore_tables from the configurable bookkeeping table names
    // (schema_dumper.rb:78-80) so a renamed schema_migrations/ar_internal_metadata
    // table is still excluded from the dump.
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
   *
   * @missingRailsCall insert — PERMANENT: Ruby `String#insert` (schema_dumper.rb:89)
   *   mutates the receiver in place; JS strings are immutable, so the port
   *   builds the underscored version from `slice` instead.
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
      // Rails' dumper reads the version off the connection in `initialize`
      // (`schema_dumper.rb:74`); trails resolves it in `dump` (a constructor
      // cannot await) and hands it down here, and emits TS or JS rather than
      // only Ruby.
      language: config.language,
      version: config.version,
    };
  }

  /**
   * The `new` gate. Rails' base declares `private_class_method :new`
   * (schema_dumper.rb:11) and publishes no factory — `create(connection, options)`
   * exists only on `ConnectionAdapters::SchemaDumper`
   * (connection_adapters/abstract/schema_dumper.rb:8-10), which overrides this and
   * is the only construction path that has the `column_spec` half. `this` is the
   * concrete subclass, so `.create(...)` on a dialect subclass returns that subclass.
   */
  protected static create<T extends typeof SchemaDumper>(
    this: T,
    connection: SchemaSource | DatabaseAdapter,
    options: Record<string, unknown> = {},
  ): InstanceType<T> {
    // The base is abstract (Ruby: no `column_spec`, and `private_class_method :new`),
    // so the construction has to be typed through the concrete `this`.
    return new (this as unknown as new (
      connection: SchemaSource | DatabaseAdapter,
      options: Record<string, unknown>,
    ) => InstanceType<T>)(connection, options);
  }

  /**
   * Mirrors: `ActiveRecord::SchemaDumper.dump` (`schema_dumper.rb:43-48`) —
   * dumps through the pool's connection into `stream` and returns `stream`.
   * A `DatabaseAdapter` or a bare `SchemaSource` is also accepted in the
   * `pool` slot: Rails' pool always yields a connection that is itself the
   * dump source, while trails' mock sources are not adapters.
   */
  static dump(
    pool: ConnectionPoolLike | SchemaSource | DatabaseAdapter = baseClass().connectionPool(),
    stream: string[] = [],
    config: SchemaDumperConfig = baseClass(),
  ): string[] | Promise<string[]> {
    const options = this.generateOptions(config);
    // Adapter check runs FIRST because concrete DatabaseAdapters
    // (PostgreSQLAdapter, SQLite3Adapter) implement `tables()` /
    // `columns()` / `indexes()` and so also satisfy the SchemaSource
    // duck type. The adapter-bridging path (AdapterSchemaSource)
    // does the column normalization expected by emitTable — skipping
    // it would leak raw adapter column shapes (e.g. `scale: null`)
    // into dumps.
    if (isDatabaseAdapter(pool)) {
      const source = new AdapterSchemaSource(pool);
      // Rails reads the version in the dumper's `initialize`:
      // `@version = connection.pool.migration_context.current_version rescue nil`
      // (schema_dumper.rb:74). A TS constructor cannot await, so the one async
      // read happens here and reaches the dumper through its options hash; the
      // `rescue nil` arm is the catch (no schema_migrations table yet).
      return (async () => {
        try {
          // A NullPool has no migration_context at all — Ruby's NoMethodError
          // there is the same `rescue nil` case as a missing schema_migrations.
          const version = await (
            pool.pool as { migrationContext: { currentVersion(): Promise<number | undefined> } }
          ).migrationContext.currentVersion();
          if (version != null) options.version = String(version);
        } catch {
          // rescue nil
        }
        // Instantiate the adapter-specific subclass when the adapter exposes
        // createSchemaDumper() (MySQL/PG/SQLite) so dialect overrides like
        // MySQL's schemaPrecision (datetime precision 0 → `precision: nil`)
        // apply. Mirrors Rails' `connection.create_schema_dumper`, which mixes
        // the adapter's SchemaDumper module into the dumper. Without the hook,
        // `create` still resolves to the ConnectionAdapters subclass (see its
        // redirect) — never the bare base.
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
    // Instantiate the adapter-specific subclass when the adapter exposes
    // createSchemaDumper() (PostgreSQLAdapter and Mysql2Adapter). Otherwise
    // `create` resolves to the ConnectionAdapters subclass via its redirect —
    // the single emitTable/columnSpec dispatch, never the bare base.
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
  protected extensions(_stream: string[]): void | Promise<void> {}

  /** @internal */
  protected types(_stream: string[]): void | Promise<void> {}

  /** @internal */
  protected schemas(_stream: string[]): void | Promise<void> {}

  /** @internal */
  protected virtualTables(_stream: string[]): void | Promise<void> {}

  private header(stream: string[]): void {
    stream.push("// This file is auto-generated from the current state of the database.");
    stream.push("// Instead of editing this file, please use the migrations feature.");
    const params = this.defineParams();
    if (params) stream.push(`// ${params}`);
    stream.push("");
    if (this._language === "ts") {
      stream.push(`import type { DatabaseAdapter } from "@blazetrails/activerecord";`);
      stream.push("");
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

    // dump foreign keys at the end to make sure all dependent tables exist.
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
    // This method appears at the top when profiling active_record test cases run.
    // Avoid costly calculation when there are no prefix and suffix.
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

  /** @internal Used by `dumpTableSchema` and external callers. */
  async dumpTable(stream: string[], tableName: string): Promise<void> {
    await this.table(tableName, stream);
  }

  /**
   * @internal
   *
   * @missingRailsCall column_spec — CONVERGEABLE: verified at schema_dumper.rb:158-243 —
   *   Rails' `table` emits the columns inline; the port's `table` hands that
   *   half to `emitTable`
   *   (connection-adapters/abstract/schema-dumper.ts:238-351), which makes this
   *   call. The gate credits same-FILE helpers only, so the delegation reads as
   *   an omission. Convergence is RFC 0051 story
   *   `inline-schema-dumper-table-retire-emit-table`.
   * @missingRailsCall column_spec_for_primary_key — CONVERGEABLE: verified at
   *   schema_dumper.rb:158-243 — Rails' `table` emits the columns inline; the
   *   port's `table` hands that half to `emitTable`
   *   (connection-adapters/abstract/schema-dumper.ts:238-351), which makes this
   *   call. The gate credits same-FILE helpers only, so the delegation reads as
   *   an omission. Convergence is RFC 0051 story
   *   `inline-schema-dumper-table-retire-emit-table`.
   * @missingRailsCall exclusion_constraints_in_create — CONVERGEABLE: verified at
   *   schema_dumper.rb:158-243 — Rails' `table` emits the columns inline; the
   *   port's `table` hands that half to `emitTable`
   *   (connection-adapters/abstract/schema-dumper.ts:238-351), which makes this
   *   call. The gate credits same-FILE helpers only, so the delegation reads as
   *   an omission. Convergence is RFC 0051 story
   *   `inline-schema-dumper-table-retire-emit-table`.
   * @missingRailsCall format_colspec — CONVERGEABLE: verified at schema_dumper.rb:158-243 —
   *   Rails' `table` emits the columns inline; the port's `table` hands that
   *   half to `emitTable`
   *   (connection-adapters/abstract/schema-dumper.ts:238-351), which makes this
   *   call. The gate credits same-FILE helpers only, so the delegation reads as
   *   an omission. Convergence is RFC 0051 story
   *   `inline-schema-dumper-table-retire-emit-table`.
   * @missingRailsCall format_options — CONVERGEABLE: verified at schema_dumper.rb:158-243 —
   *   Rails' `table` emits the columns inline; the port's `table` hands that
   *   half to `emitTable`
   *   (connection-adapters/abstract/schema-dumper.ts:238-351), which makes this
   *   call. The gate credits same-FILE helpers only, so the delegation reads as
   *   an omission. Convergence is RFC 0051 story
   *   `inline-schema-dumper-table-retire-emit-table`.
   * @missingRailsCall indexes_in_create — CONVERGEABLE: verified at schema_dumper.rb:158-243 —
   *   Rails' `table` emits the columns inline; the port's `table` hands that
   *   half to `emitTable`
   *   (connection-adapters/abstract/schema-dumper.ts:238-351), which makes this
   *   call. The gate credits same-FILE helpers only, so the delegation reads as
   *   an omission. Convergence is RFC 0051 story
   *   `inline-schema-dumper-table-retire-emit-table`.
   * @missingRailsCall table_options — CONVERGEABLE: verified at schema_dumper.rb:158-243 —
   *   Rails' `table` emits the columns inline; the port's `table` hands that
   *   half to `emitTable`
   *   (connection-adapters/abstract/schema-dumper.ts:238-351), which makes this
   *   call. The gate credits same-FILE helpers only, so the delegation reads as
   *   an omission. Convergence is RFC 0051 story
   *   `inline-schema-dumper-table-retire-emit-table`.
   * @missingRailsCall unique_constraints_in_create — CONVERGEABLE: verified at
   *   schema_dumper.rb:158-243 — Rails' `table` emits the columns inline; the
   *   port's `table` hands that half to `emitTable`
   *   (connection-adapters/abstract/schema-dumper.ts:238-351), which makes this
   *   call. The gate credits same-FILE helpers only, so the delegation reads as
   *   an omission. Convergence is RFC 0051 story
   *   `inline-schema-dumper-table-retire-emit-table`.
   * @missingRailsCall valid_type? — CONVERGEABLE: verified at schema_dumper.rb:158-243 —
   *   Rails' `table` emits the columns inline; the port's `table` hands that
   *   half to `emitTable`
   *   (connection-adapters/abstract/schema-dumper.ts:238-351), which makes this
   *   call. The gate credits same-FILE helpers only, so the delegation reads as
   *   an omission. Convergence is RFC 0051 story
   *   `inline-schema-dumper-table-retire-emit-table`.
   */
  async table(table: string, stream: string[]): Promise<void> {
    // Mirrors Rails' reliance on `@connection.primary_key(table)`: capture the
    // authoritative PK column order before iterating columns so `emitTable` /
    // `resolvePrimaryKeyColumns` render composite/promoted keys in key order.
    const adapter = this._adapter();
    if (adapter && typeof adapter.primaryKeys === "function") {
      try {
        this.primaryKeyOrderCache[table] = await adapter.primaryKeys(table);
      } catch {
        // Live introspection is best-effort; fall through to declaration order.
      }
    }
    this.tableName = table;
    try {
      const columns = await this._source.columns(table, this.primaryKeyOrderCache[table]);
      const rawIndexes = await this._source.indexes(table);
      const indexes = await this.filterIndexesForDump(table, rawIndexes);
      const adapterTableOpts = await this.fetchTableOptions(table);
      const inlineLines: string[] = [];
      const remaining = await this.gatherInlineConstraints(table, inlineLines);
      this.emitTable(stream, table, columns, indexes, adapterTableOpts, inlineLines);
      if (remaining && remaining.length > 0) stream.push("", ...remaining);
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
  protected async gatherInlineConstraints(
    tableName: string,
    stream: string[],
  ): Promise<string[] | undefined> {
    return this.checkConstraintsInCreate(tableName, stream);
  }

  /**
   * Emit inline check-constraint `t.checkConstraint(...)` lines inside the
   * createTable block. Mirrors Rails' `SchemaDumper#check_constraints_in_create`:
   * only the validated constraints go inline; the not-valid ones are returned as
   * the `remaining` block of `ctx.addCheckConstraint(...)` calls the caller
   * prints after the block. Rails' `remaining` StringIO takes one `puts`
   * (schema_dumper.rb:303), so its analogue is one joined block — the shape the
   * valid arm pushes (`:292`) — rather than a stream object: `table()` already
   * treats a pushed entry containing newlines as one block.
   * @internal
   *
   * @missingRailsCall any? — PERMANENT: Ruby's block-less `any?` (schema_dumper.rb:284) is
   *   an emptiness test on the fetched array; the port spells it `.length > 0`,
   *   which records no callee.
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
    // Mirror Rails' call-site guard (`schema_dumper.rb:210`: `... if
    // @connection.supports_check_constraints?`): adapters whose checkConstraints
    // raises NotImplementedError when unsupported (e.g. MySQL <8.0.16, MariaDB
    // <10.2.1) must not be queried.
    if (host.supportsCheckConstraints && !(await host.supportsCheckConstraints())) return undefined;
    const checkConstraints = ((await host.checkConstraints(table)) ?? []) as {
      expression: string;
      name?: string;
      validate?: boolean;
    }[];
    if (checkConstraints.length === 0) return undefined;
    const checkValid = checkConstraints.filter((chk) => chk.validate !== false);
    const checkInvalid = checkConstraints.filter((chk) => chk.validate === false);

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

  /**
   * The column-spec half of the dumper, defined only by the adapter subclass
   * `ConnectionAdapters::SchemaDumper` (abstract/schema_dumper.rb:13-101) — as in
   * Rails, where this base's `table` calls a private `column_spec` it never defines.
   * @internal
   */
  protected abstract validType(type: string | null | undefined): boolean;

  /** @internal */
  protected abstract emitTable(
    stream: string[],
    tableName: string,
    columns: ColumnInfo[],
    indexes: IndexInfo[],
    adapterTableOpts?: Record<string, unknown>,
    inlineConstraints?: string[],
  ): void;

  /** @internal */
  protected abstract emitTableBody(
    stream: string[],
    tableName: string,
    columns: ColumnInfo[],
    indexes: IndexInfo[],
    adapterTableOpts?: Record<string, unknown>,
    inlineConstraints?: string[],
  ): void;

  /** @internal */
  protected abstract columnSpec(column: Column): [string, Record<string, unknown>];

  /** @internal */
  protected abstract columnSpecForPrimaryKey(column: Column): Record<string, unknown>;

  /** @internal */
  protected abstract prepareColumnOptions(column: Column): Record<string, unknown>;

  /** @internal */
  protected abstract isDefaultPrimaryKey(column: Column): boolean;

  /** @internal */
  protected abstract isExplicitPrimaryKeyDefault(column: Column): boolean;

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
    if (!this._adapter().defaultIndexType(index))
      parts.push(`using: ${JSON.stringify(index.using)}`);
    if (index.include && index.include.length > 0)
      parts.push(`include: ${JSON.stringify(index.include)}`);
    if (index.nullsNotDistinct) parts.push("nullsNotDistinct: true");
    // Rails emits `type:` last before `comment:` (schema_dumper.rb#index_parts).
    if (index.type) parts.push(`type: ${JSON.stringify(index.type)}`);
    if (index.comment) parts.push(`comment: ${JSON.stringify(index.comment)}`);
    return parts;
  }

  /**
   * @internal
   *
   * @missingRailsCall any? — PERMANENT: Ruby's block-less `any?`
   *   (schema_dumper.rb:245,246,252) is an emptiness test on the fetched array;
   *   the port spells it `.length > 0`, which records no callee.
   * @missingRailsCall exclusion_constraints — PERMANENT:
   *   `@connection.exclusion_constraints(table)` (schema_dumper.rb:245-252) is
   *   an async read in trails, and `indexesInCreate` is synchronous: its caller
   *   awaits the list and passes it in (schema-dumper.ts:995).
   * @missingRailsCall indexes — PERMANENT: `@connection.indexes(table)`
   *   (schema_dumper.rb:245-252) is an async read in trails, and
   *   `indexesInCreate` is synchronous: its caller awaits the list and passes it
   *   in (schema-dumper.ts:995).
   * @missingRailsCall unique_constraints — PERMANENT:
   *   `@connection.unique_constraints(table)` (schema_dumper.rb:245-252) is an
   *   async read in trails, and `indexesInCreate` is synchronous: its caller
   *   awaits the list and passes it in (schema-dumper.ts:995).
   */
  indexesInCreate(table: string, stream: string[], indexes: IndexInfo[] = []): void {
    const stripped = this.removePrefixAndSuffix(table);
    for (const index of indexes) {
      const [cols, ...opts] = this.indexParts(index);
      const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      stream.push(`  await ctx.addIndex(${JSON.stringify(stripped)}, ${cols}${optStr});`);
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

  /**
   * @internal
   *
   * @missingRailsCall any? — PERMANENT: Ruby's block-less `any?` (schema_dumper.rb:317) is
   *   an emptiness test on the fetched array; the port spells it `.length > 0`,
   *   which records no callee.
   * @missingRailsCall order:foreignKeyColumnFor,removePrefixAndSuffix — PERMANENT:
   *   ORDER-only: Rails evaluates `remove_prefix_and_suffix` for both table
   *   names before the `foreign_key_column_for` comparison
   *   (schema_dumper.rb:320-324); the port hoists the column comparison, which
   *   the async read forces.
   */
  async foreignKeys(tableName: string, stream: string[]): Promise<void> {
    const host = this._hookHost("foreignKeys");
    if (!host) return;
    const fn = (host as { foreignKeys: (t: string) => Promise<unknown[]> }).foreignKeys;
    const fks = (await fn.call(host, tableName)) ?? [];
    if (fks.length === 0) return;
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
    // Rails' `@connection.foreign_key_column_for(to_table, "id")` — the column
    // whose match makes the dump omit `column:`. A bare SchemaSource lacks the
    // schema-statement mixin, and with no inference to compare against the
    // option is emitted rather than guessed at.
    const columnFor = (host as { foreignKeyColumnFor?: (t: string, c: string) => string })
      .foreignKeyColumnFor;
    // Rails sorts the emitted statements (`add_foreign_key_statements.sort`),
    // so the dump order does not follow introspection order.
    const statements: string[] = [];
    for (const fk of fks as Fk[]) {
      const fromExpr = JSON.stringify(this.removePrefixAndSuffix(fk.fromTable ?? tableName));
      const toExpr = JSON.stringify(this.removePrefixAndSuffix(fk.toTable));
      const opts: string[] = [];
      const inferredColumn = columnFor ? columnFor.call(host, fk.toTable, "id") : undefined;
      if (fk.column && fk.column !== inferredColumn) {
        opts.push(`column: ${JSON.stringify(fk.column)}`);
      }
      const isCustomPrimaryKey =
        "isCustomPrimaryKey" in (fk as object)
          ? (fk as unknown as { isCustomPrimaryKey: boolean }).isCustomPrimaryKey
          : fk.primaryKey != null && fk.primaryKey !== "id";
      if (isCustomPrimaryKey && fk.primaryKey)
        opts.push(`primaryKey: ${JSON.stringify(fk.primaryKey)}`);
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
      statements.push(`  await ctx.addForeignKey(${fromExpr}, ${toExpr}${optStr});`);
    }
    stream.push(statements.sort().join("\n"));
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
 * `pool.with_connection` is all `SchemaDumper.dump` asks of its pool
 * (`schema_dumper.rb:44`); typing the parameter structurally keeps
 * schema-dumper.ts off connection-pool.ts's import graph, exactly as the
 * `baseClass()` slot above keeps it off base.ts's.
 */
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
