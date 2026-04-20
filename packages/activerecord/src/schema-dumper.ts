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
// Type-only import: SchemaStatements -> SchemaDumper (abstract inner
// extends this file's base) -> schema-dumper.ts would be a runtime
// cycle that `ReferenceError`s on evaluation order. We lazy-import
// the implementation inside `AdapterSchemaSource.indexes()` below.
import type { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";
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
  limit?: number | null;
  precision?: number | null;
  scale?: number | null;
}

export interface IndexInfo {
  columns: string[];
  unique: boolean;
  name?: string;
}

/**
 * Interface for sources that can provide schema information.
 * Both MigrationContext (sync/in-memory) and database adapters (async) can implement this.
 */
export interface SchemaSource {
  tables(): string[] | Promise<string[]>;
  columns(tableName: string): ColumnInfo[] | Promise<ColumnInfo[]>;
  indexes(tableName: string): IndexInfo[] | Promise<IndexInfo[]>;
}

export type SchemaDumpLanguage = "ts" | "js";

export interface SchemaDumperOptions {
  /** Output language for the generated schema DSL: "ts" (default) or "js". */
  language?: SchemaDumpLanguage;
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
  "bit varying": { dslType: "bit" },
  citext: { dslType: "citext" },
  ltree: { dslType: "ltree" },
  oid: { dslType: "oid" },
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
 * DSL methods that actually exist as helpers on TableDefinition
 * (connection-adapters/abstract/schema-definitions.ts). Types mapped
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
  "binary",
  "json",
  "jsonb",
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
 * Clean up a PG default expression to a human-readable literal value.
 * E.g. "'happy'::mood" -> "happy", "'192.168.1.1'::inet" -> "192.168.1.1"
 */
function cleanDefault(raw: unknown): unknown {
  if (raw === null || raw === undefined) return raw;
  const str = String(raw);

  // Strip type casts (supports chained casts like 'value'::type::type2)
  const castMatch = str.match(/^'((?:[^']|'')*)'(::[\w\s."[\](),]+)+$/);
  if (castMatch) {
    return castMatch[1].replace(/''/g, "'");
  }

  // Numeric defaults: 150.55::type, (150.55)::type, with chained casts
  const numericCastMatch = str.match(/^\(?(-?\d+(?:\.\d+)?)\)?(::[\w\s."[\](),]+)+$/);
  if (numericCastMatch) {
    return Number(numericCastMatch[1]);
  }

  // Expression defaults like nextval(...) — keep as-is
  if (str.includes("(") && !str.startsWith("'")) {
    return str;
  }

  if (str === "true") return true;
  if (str === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(str)) return Number(str);

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
  // Lazily constructed on first `indexes()` call so the static import
  // cycle (schema-dumper -> schema-statements -> abstract/schema-dumper
  // -> schema-dumper) doesn't fire at module init. Type-only import
  // above keeps the compile-time reference; runtime construction
  // happens inside `indexes()` via dynamic import.
  private _schema?: SchemaStatements;

  constructor(adapter: DatabaseAdapter) {
    this._adapter = adapter;
  }

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
      limit: col.limit ?? undefined,
      precision: col.precision ?? undefined,
      scale: col.scale ?? undefined,
    }));
  }

  async indexes(tableName: string): Promise<IndexInfo[]> {
    if (!this._schema) {
      const mod = await import("./connection-adapters/abstract/schema-statements.js");
      this._schema = new mod.SchemaStatements(this._adapter);
    }
    const idxs = await this._schema.indexes(tableName);
    return idxs.map((idx) => ({
      columns: idx.columns,
      unique: idx.unique,
      name: idx.name,
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

  private _source: SchemaSource;
  protected _options: Record<string, unknown>;
  private _language: SchemaDumpLanguage;

  constructor(source: SchemaSource, options: Record<string, unknown> = {}) {
    this._source = source;
    this._options = options;
    const lang = (options.language as SchemaDumpLanguage | undefined) ?? "ts";
    this._language = lang;
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
    const dumper = this.create(source);
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
    const schema = await (this.dump(adapter, options) as Promise<string>);
    return `// Schema version: ${version}\n${schema}`;
  }

  dump(): string | Promise<string> {
    const lines: string[] = [];
    this.header(lines);
    const result = this.dumpTables(lines);
    if (result instanceof Promise) {
      return result.then(() => {
        this.trailer(lines);
        return lines.join("\n");
      });
    }
    this.trailer(lines);
    return lines.join("\n");
  }

  private header(lines: string[]): void {
    lines.push("// This file is auto-generated from the current state of the database.");
    lines.push("// Instead of editing this file, please use the migrations feature.");
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
      return tableNames.then(async (names) => {
        for (const tableName of names) {
          if (this.shouldIgnore(tableName)) continue;
          await this.dumpTable(lines, tableName);
        }
      });
    }
    for (const tableName of tableNames) {
      if (this.shouldIgnore(tableName)) continue;
      const columns = this._source.columns(tableName);
      const indexes = this._source.indexes(tableName);
      if (columns instanceof Promise || indexes instanceof Promise) {
        throw new TypeError(
          "SchemaSource.columns()/indexes() returned a Promise while tables() was synchronous. " +
            "Use the async schema dumper path (make tables() return a Promise) or ensure all schema methods are synchronous.",
        );
      }
      this.emitTable(lines, tableName, columns as ColumnInfo[], indexes as IndexInfo[]);
    }
  }

  private shouldIgnore(tableName: string): boolean {
    if (tableName === "schema_migrations" || tableName === "ar_internal_metadata") {
      return true;
    }
    // Read off the concrete subclass so setting
    // `InnerSchemaDumper.ignoreTables = [...]` (or a postgres/sqlite
    // subclass's own) is honored. Rails does the equivalent with
    // `self.class.ignore_tables` — the static is per-class, not a
    // single global on the base.
    const subclass = this.constructor as typeof SchemaDumper;
    for (const pattern of subclass.ignoreTables) {
      if (typeof pattern === "string") {
        if (tableName === pattern) return true;
      } else if (pattern instanceof RegExp) {
        pattern.lastIndex = 0;
        if (pattern.test(tableName)) return true;
      }
    }
    return false;
  }

  async dumpTable(lines: string[], tableName: string): Promise<void> {
    const columns = await this._source.columns(tableName);
    const indexes = await this._source.indexes(tableName);
    this.emitTable(lines, tableName, columns, indexes);
  }

  private emitTable(
    lines: string[],
    tableName: string,
    columns: ColumnInfo[],
    indexes: IndexInfo[],
  ): void {
    const pkColumn = columns.find((c) => c.primaryKey);
    const hasId = pkColumn?.name === "id";

    const options: string[] = [];
    if (!hasId) {
      options.push("id: false");
    }
    const optStr = options.length > 0 ? `{ ${options.join(", ")} }` : "{}";

    lines.push(`  await ctx.createTable(${JSON.stringify(tableName)}, ${optStr}, (t) => {`);

    for (const col of columns) {
      if (col.name === "id" && hasId) continue;

      const { dslType, extraOpts } = sqlTypeToDsl(col.type);
      const opts: string[] = [];

      if (col.null === false) opts.push("null: false");

      const cleanedDefault = cleanDefault(col.default);
      if (cleanedDefault !== undefined && cleanedDefault !== null) {
        opts.push(`default: ${JSON.stringify(cleanedDefault)}`);
      }

      if (extraOpts) {
        for (const [key, value] of Object.entries(extraOpts)) {
          // `enum_type` carries the PG enum type name — consumed by
          // the column-type fallback below, not a column option.
          if (key === "enum_type") continue;
          opts.push(`${key}: ${JSON.stringify(value)}`);
        }
      }

      if (col.limit !== undefined && col.limit !== null && extraOpts?.limit === undefined)
        opts.push(`limit: ${col.limit}`);
      if (
        col.precision !== undefined &&
        col.precision !== null &&
        extraOpts?.precision === undefined
      )
        opts.push(`precision: ${col.precision}`);
      if (col.scale !== undefined && col.scale !== null && extraOpts?.scale === undefined)
        opts.push(`scale: ${col.scale}`);

      const optionsStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";

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

    lines.push("  });");

    for (const idx of indexes) {
      const cols =
        idx.columns.length === 1
          ? JSON.stringify(idx.columns[0])
          : `[${idx.columns.map((c: string) => JSON.stringify(c)).join(", ")}]`;
      const idxOpts: string[] = [];
      if (idx.unique) idxOpts.push("unique: true");
      if (idx.name) idxOpts.push(`name: ${JSON.stringify(idx.name)}`);
      const idxOptStr = idxOpts.length > 0 ? `, { ${idxOpts.join(", ")} }` : "";
      lines.push(`  await ctx.addIndex(${JSON.stringify(tableName)}, ${cols}${idxOptStr});`);
    }

    lines.push("");
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
