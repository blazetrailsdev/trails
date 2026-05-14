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
 * specific column-spec helpers. We keep the same file layout and
 * `inner extends outer` relationship; the inner lives at
 * connection-adapters/abstract/schema-dumper.ts.
 */

import type { DatabaseAdapter } from "./adapter.js";
import type { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";
import { assertSchemaAdapter } from "./connection-adapters/abstract/assert-schema-adapter.js";
import type * as SchemaIntrospectionModule from "./schema-introspection.js";
import { SchemaMigration } from "./schema-migration.js";

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
  type: string;
  primaryKey?: boolean;
  null?: boolean;
  default?: unknown;
  defaultFunction?: string | null;
  limit?: number | null;
  precision?: number | null;
  scale?: number | null;
  collation?: string | null;
  array?: boolean;
}

export interface IndexInfo {
  columns: string[];
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
  nullsNotDistinct?: boolean;
  /** PG covering index INCLUDE columns. */
  include?: string[];
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

interface DslMapping {
  dslType: string;
  extraOpts?: Record<string, unknown>;
}

/** Map SQL type strings (as returned by pg_catalog.format_type) to DSL method names. */
const SQL_TYPE_MAP: Record<string, DslMapping> = {
  "character varying": { dslType: "string" },
  varchar: { dslType: "string" },
  text: { dslType: "text" },
  integer: { dslType: "integer" },
  int: { dslType: "integer" },
  int4: { dslType: "integer" },
  bigint: { dslType: "bigint" },
  int8: { dslType: "bigint" },
  smallint: { dslType: "integer", extraOpts: { limit: 2 } },
  int2: { dslType: "integer", extraOpts: { limit: 2 } },
  "double precision": { dslType: "float" },
  float8: { dslType: "float" },
  real: { dslType: "float" },
  float4: { dslType: "float" },
  numeric: { dslType: "decimal" },
  decimal: { dslType: "decimal" },
  boolean: { dslType: "boolean" },
  bool: { dslType: "boolean" },
  date: { dslType: "date" },
  "timestamp without time zone": { dslType: "datetime" },
  timestamp: { dslType: "datetime" },
  "timestamp with time zone": { dslType: "timestamptz" },
  timestamptz: { dslType: "timestamptz" },
  "time without time zone": { dslType: "time" },
  time: { dslType: "time" },
  "time with time zone": { dslType: "time" },
  timetz: { dslType: "time" },
  bytea: { dslType: "binary" },
  json: { dslType: "json" },
  jsonb: { dslType: "jsonb" },
  uuid: { dslType: "uuid" },
  money: { dslType: "money", extraOpts: { scale: 2 } },
  inet: { dslType: "inet" },
  cidr: { dslType: "cidr" },
  macaddr: { dslType: "macaddr" },
  hstore: { dslType: "hstore" },
  xml: { dslType: "xml" },
  point: { dslType: "point" },
  line: { dslType: "line" },
  lseg: { dslType: "lseg" },
  box: { dslType: "box" },
  path: { dslType: "path" },
  polygon: { dslType: "polygon" },
  circle: { dslType: "circle" },
  interval: { dslType: "interval" },
  bit: { dslType: "bit" },
  "bit varying": { dslType: "bitVarying" },
  varbit: { dslType: "bitVarying" },
  citext: { dslType: "citext" },
  ltree: { dslType: "ltree" },
  tsvector: { dslType: "tsvector" },
  oid: { dslType: "oid" },
  int4range: { dslType: "int4range" },
  int8range: { dslType: "int8range" },
  numrange: { dslType: "numrange" },
  daterange: { dslType: "daterange" },
  tsrange: { dslType: "tsrange" },
  tstzrange: { dslType: "tstzrange" },
  serial: { dslType: "serial" },
  bigserial: { dslType: "bigserial" },
  character: { dslType: "char" },
  bpchar: { dslType: "char" },
  // SQLite types
  blob: { dslType: "binary" },
  "integer primary key autoincrement": { dslType: "integer" },
};

const KNOWN_DSL_TYPES = new Set([
  "string",
  "text",
  "integer",
  "bigint",
  "float",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "timestamp",
  "binary",
  "char",
]);

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
  "float",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "timestamp",
  "time",
  "binary",
  "json",
  "jsonb",
  "citext",
  "ltree",
  "tsvector",
  "bit",
  "bitVarying",
  "money",
  "int4range",
  "int8range",
  "numrange",
  "daterange",
  "tsrange",
  "tstzrange",
  // PG geometric types — TableDefinition exposes a helper method for each.
  "point",
  "line",
  "lseg",
  "box",
  "path",
  "polygon",
  "circle",
]);

function sqlTypeToDsl(sqlType: string): DslMapping {
  const normalized = sqlType.toLowerCase().trim();
  const isArray = normalized.endsWith("[]");
  const baseType = isArray ? normalized.slice(0, -2) : normalized;

  let result = SQL_TYPE_MAP[baseType];

  if (!result) {
    // Handle parameterized types (Postgres: "character varying(N)", SQLite: "varchar(N)")
    const varcharMatch = baseType.match(/^(?:character varying|varchar)\((\d+)\)$/);
    if (varcharMatch) {
      result = { dslType: "string", extraOpts: { limit: Number(varcharMatch[1]) } };
    } else {
      const charMatch = baseType.match(/^(?:character|char|bpchar)\((\d+)\)$/);
      const numericMatch = !charMatch
        ? baseType.match(/^(?:numeric|decimal)\((\d+),\s*(\d+)\)$/)
        : null;
      const tsMatch =
        !charMatch && !numericMatch
          ? baseType.match(/^timestamp(\(\d+\))?\s+(with(?:out)?\s+time\s+zone)$/)
          : null;
      const timeMatch =
        !charMatch && !numericMatch && !tsMatch
          ? baseType.match(/^time(\(\d+\))?\s+(with(?:out)?\s+time\s+zone)$/)
          : null;

      if (charMatch) {
        result = { dslType: "char", extraOpts: { limit: Number(charMatch[1]) } };
      } else if (numericMatch) {
        result = {
          dslType: "decimal",
          extraOpts: { precision: Number(numericMatch[1]), scale: Number(numericMatch[2]) },
        };
      } else if (tsMatch) {
        result =
          tsMatch[2].startsWith("with ") || tsMatch[2] === "with time zone"
            ? { dslType: "timestamptz" }
            : { dslType: "datetime" };
      } else if (timeMatch) {
        result = { dslType: "time" };
      } else if (/^bit\(\d+\)$/.test(baseType)) {
        result = { dslType: "bit" };
      } else if (/^(?:bit varying|varbit)\(\d+\)$/.test(baseType)) {
        result = { dslType: "bitVarying" };
      } else if (KNOWN_DSL_TYPES.has(baseType)) {
        result = { dslType: baseType };
      } else {
        result = { dslType: "enum", extraOpts: { enum_type: baseType } };
      }
    }
  }

  if (isArray) {
    return { ...result, extraOpts: { ...result.extraOpts, array: true } };
  }

  return result;
}

/**
 * Strip a raw PG catalog default expression to a plain value.
 * E.g. `'happy'::mood` → `"happy"`, `'192.168.1.1'::inet` → `"192.168.1.1"`,
 * `nextval(...)` → kept as-is (expression default).
 *
 * Only call this with raw SQL strings from `column_default` /
 * `pg_attrdef.adbin`. For already-deserialized ORM values (e.g. bit-strings
 * like `"00000011"`) use `cleanDefault` instead.
 */
export function cleanRawPgExpression(raw: string): unknown {
  const castMatch = raw.match(/^'((?:[^']|'')*)'(::[\w\s."[\](),]+)+$/);
  if (castMatch) {
    return castMatch[1].replace(/''/g, "'");
  }

  const numericCastMatch = raw.match(/^\(?(-?\d+(?:\.\d+)?)\)?(::[\w\s."[\](),]+)+$/);
  if (numericCastMatch) {
    return Number(numericCastMatch[1]);
  }

  // Expression defaults like nextval(...) — keep as-is
  if (raw.includes("(") && !raw.startsWith("'")) {
    return raw;
  }

  return raw;
}

/**
 * Clean up a default value — either a raw PG catalog expression or an
 * already-deserialized ORM scalar — to the JS literal used in schema dumps.
 *
 * Two distinct inputs flow through here:
 *  1. Raw PG catalog expressions (e.g. `'happy'::mood`, `'(12.2,13.3)'::point`)
 *     — dispatched to `cleanRawPgExpression`.
 *  2. Already-deserialized scalar literals — plain strings like `"00000011"`
 *     (bit-string), `"true"`, or `"42"`. The `/^-?0\d/` guard prevents
 *     bit-string patterns from being coerced to `Number`.
 */
export function cleanDefault(raw: unknown): unknown {
  if (raw === null || raw === undefined) return raw;
  const str = String(raw);

  // Delegate raw PG expressions (contain a type cast or are expression defaults)
  if (str.includes("::") || (str.includes("(") && !str.startsWith("'"))) {
    return cleanRawPgExpression(str);
  }

  if (str === "true") return true;
  if (str === "false") return false;
  // Only coerce to number when there are no leading zeros — leading zeros mean
  // the string is a bit-string pattern ("00000011") or similar, not a decimal.
  if (/^-?\d+(\.\d+)?$/.test(str) && !/^-?0\d/.test(str)) return Number(str);

  return raw;
}

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
    return cols.map((col) => ({
      name: col.name,
      type: col.sqlType || col.type || "unknown",
      primaryKey: col.primaryKey,
      null: col.null,
      default: col.default,
      defaultFunction: col.defaultFunction ?? null,
      limit: col.limit ?? undefined,
      precision: col.precision === undefined ? undefined : col.precision,
      scale: col.scale ?? undefined,
      collation: col.collation ?? undefined,
      array: (col as any).array === true ? true : undefined,
    }));
  }

  /** @internal */
  async indexes(tableName: string): Promise<IndexInfo[]> {
    type RichIdx = {
      columns: string[];
      unique: boolean;
      name?: string;
      where?: string;
      orders?: Record<string, string> | string;
      nullsNotDistinct?: boolean;
      using?: string;
      lengths?: number | Record<string, number>;
      opclasses?: string | Record<string, string>;
      include?: string[];
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
        typeof idx.orders === "string"
          ? Object.fromEntries(idx.columns.map((c) => [c, idx.orders as string]))
          : idx.orders,
      nullsNotDistinct: idx.nullsNotDistinct,
      using: idx.using,
      lengths: idx.lengths,
      opclasses: idx.opclasses,
      include: idx.include,
    }));
  }
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
    this._ignoreTables = ["schema_migrations", "ar_internal_metadata", ...subclassIgnore];
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
      return this.create(source, { ...options, language: lang }).dump() as Promise<string>;
    }
    return this.create(sourceOrAdapter, options).dump();
  }

  static async dumpTableSchema(source: SchemaSource, tableName: string): Promise<string> {
    const wrappedSource = isDatabaseAdapter(source) ? new AdapterSchemaSource(source) : source;
    // Instantiate the adapter-specific subclass when the adapter exposes
    // createSchemaDumper() (currently only PostgreSQLAdapter). Falls back to
    // the base class when unavailable, which is what the old code always did.
    let dumper: SchemaDumper;
    if (isDatabaseAdapter(source) && typeof (source as any).createSchemaDumper === "function") {
      dumper = (source as any).createSchemaDumper(wrappedSource, {}) as SchemaDumper;
    } else {
      dumper = this.create(wrappedSource);
    }
    const lines: string[] = [];
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
    const schema = await (this.dump(adapter, { ...options, version }) as Promise<string>);
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
    const sorted = [...(tableNames as string[])].sort();
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
        this.emitTable(
          lines,
          tableName,
          columns as ColumnInfo[],
          indexes as IndexInfo[],
          adapterTableOpts,
        );
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
    const host = this._hookHost("checkConstraints");
    if (!host) return;
    const fn = (host as { checkConstraints: (t: string) => Promise<unknown[]> }).checkConstraints;
    const constraints = (await fn.call(host, tableName)) ?? [];
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
   * DSL-typed primary-key options merged into `create_table` for non-default
   * primary keys. Mirrors Rails' `column_spec_for_primary_key` call in
   * `SchemaDumper#table` — but returns plain JS values for our TS DSL
   * emitter rather than Ruby-format strings.
   *
   * Note: `SchemaDumper.dumpTableSchema(adapter, ...)` instantiates the base
   * class (not an adapter-specific subclass), so this default branches on
   * `column.type` directly. Rails has the same single dispatch point — its
   * `column_spec_for_primary_key` lives on the adapter subclass, but our
   * factory path doesn't pick that subclass yet, so we centralize.
   * @internal
   */
  protected primaryKeyTableOptions(column: ColumnInfo): Record<string, unknown> {
    if (column.type === "uuid") {
      const fn = column.defaultFunction;
      if (typeof fn === "string" && fn.length > 0) {
        // Emit as arrow returning the SQL expression — mirrors Rails'
        // `default: -> { "gen_random_uuid()" }` and round-trips through
        // `quoteDefaultExpression`, which routes function defaults to raw SQL.
        return { id: "uuid", default: () => fn };
      }
      const literal = cleanDefault(column.default);
      return { id: "uuid", default: literal == null ? null : literal };
    }
    return {};
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
    const pkColumn = columns.find((c) => c.primaryKey);
    const hasId = pkColumn?.name === "id";
    const stripped = this.removePrefixAndSuffix(tableName);

    const tableOpts: Record<string, unknown> = {};
    if (!hasId) {
      tableOpts.id = false;
    } else if (pkColumn) {
      Object.assign(tableOpts, this.primaryKeyTableOptions(pkColumn));
    }
    tableOpts.force = "cascade";
    if (typeof adapterTableOpts.options === "string") tableOpts.options = adapterTableOpts.options;
    if (typeof adapterTableOpts.comment === "string" && adapterTableOpts.comment.length > 0)
      tableOpts.comment = adapterTableOpts.comment;
    const optStr = `{ ${this.formatOptions(tableOpts)} }`;

    lines.push(`  await ctx.createTable(${JSON.stringify(stripped)}, ${optStr}, (t) => {`);

    for (const col of columns) {
      if (col.name === "id" && hasId) continue;

      const { dslType, extraOpts } = sqlTypeToDsl(col.type);
      const colspec: Record<string, unknown> = {};

      if (col.null === false) colspec.null = false;
      if (col.defaultFunction) {
        const fn = col.defaultFunction;
        colspec.default = () => fn;
      } else {
        const cleanedDefault = cleanDefault(col.default);
        if (cleanedDefault !== undefined && cleanedDefault !== null) {
          colspec.default = cleanedDefault;
        }
      }
      if (extraOpts) {
        for (const [key, value] of Object.entries(extraOpts)) {
          // `enum_type` carries the PG enum type name — consumed by
          // the column-type fallback below, not a column option.
          if (key === "enum_type") continue;
          colspec[key] = value;
        }
      }
      if (col.array && !colspec.array) colspec.array = true;
      if (col.limit !== undefined && col.limit !== null && extraOpts?.limit === undefined)
        colspec.limit = col.limit;
      if (extraOpts?.precision === undefined) {
        if (dslType === "datetime" || dslType === "timestamp") {
          // precision: 6 is the default for datetime — omit it; precision: null → "nil"
          if (col.precision === undefined) {
            // not set — omit
          } else if (col.precision === null) {
            colspec.precision = null;
          } else if (col.precision !== SchemaDumper.DEFAULT_DATETIME_PRECISION) {
            colspec.precision = col.precision;
          }
        } else if (col.precision !== undefined && col.precision !== null) {
          colspec.precision = col.precision;
        }
      }
      if (col.scale !== undefined && col.scale !== null && extraOpts?.scale === undefined)
        colspec.scale = col.scale;
      if (col.collation != null) colspec.collation = col.collation;

      const optionsStr =
        Object.keys(colspec).length > 0 ? `, { ${this.formatColspec(colspec)} }` : "";

      if (DSL_HELPER_METHODS.has(dslType)) {
        lines.push(`    t.${dslType}(${JSON.stringify(col.name)}${optionsStr});`);
      } else {
        // No helper on TableDefinition for this type — emit the
        // generic `column(name, type, options)` form so the dumped
        // schema loads cleanly. `enum_type` carries the user-defined
        // PG enum name; use it as the column type when set.
        const columnType =
          dslType === "enum" && typeof extraOpts?.enum_type === "string"
            ? extraOpts.enum_type
            : dslType;
        lines.push(
          `    t.column(${JSON.stringify(col.name)}, ${JSON.stringify(columnType)}${optionsStr});`,
        );
      }
    }

    for (const line of inlineConstraints) lines.push(line);
    lines.push("  });");

    this.indexesInCreate(tableName, lines, indexes);
  }

  /** @internal */
  indexParts(index: IndexInfo): string[] {
    const cols =
      index.columns.length === 1
        ? JSON.stringify(index.columns[0])
        : `[${index.columns.map((c) => JSON.stringify(c)).join(", ")}]`;
    const parts: string[] = [cols];
    if (index.name) parts.push(`name: ${JSON.stringify(index.name)}`);
    if (index.unique) parts.push("unique: true");
    if (index.lengths !== undefined) parts.push(`length: ${this.formatIndexParts(index.lengths)}`);
    if (index.orders !== undefined) parts.push(`order: ${this.formatIndexParts(index.orders)}`);
    if (index.opclasses !== undefined)
      parts.push(`opclass: ${this.formatIndexParts(index.opclasses)}`);
    if (index.where) parts.push(`where: ${JSON.stringify(index.where)}`);
    if (index.using && index.using !== "btree") parts.push(`using: ${JSON.stringify(index.using)}`);
    if (index.nullsNotDistinct) parts.push("nullsNotDistinct: true");
    if (index.include && index.include.length > 0)
      parts.push(`include: ${JSON.stringify(index.include)}`);
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
    if (check.name) parts.push(`name: ${JSON.stringify(check.name)}`);
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
    const rawFkPattern = (this.constructor as typeof SchemaDumper).fkIgnorePattern;
    // Strip g/y flags to avoid mutating shared lastIndex state across iterations.
    const fkIgnorePattern =
      rawFkPattern.global || rawFkPattern.sticky
        ? new RegExp(rawFkPattern.source, rawFkPattern.flags.replace(/[gy]/g, ""))
        : rawFkPattern;
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
          : fk.name != null && !fkIgnorePattern.test(fk.name);
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

  /** @internal */
  formatColspec(colspec: Record<string, unknown>): string {
    return Object.entries(colspec)
      .map(([k, v]) => {
        if (typeof v === "function") {
          return `${k}: () => ${JSON.stringify((v as () => unknown)())}`;
        }
        if (v && typeof v === "object" && !Array.isArray(v)) {
          return `${k}: { ${this.formatColspec(v as Record<string, unknown>)} }`;
        }
        return `${k}: ${JSON.stringify(v)}`;
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
