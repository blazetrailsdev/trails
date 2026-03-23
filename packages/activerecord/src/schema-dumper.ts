/**
 * Schema dumper — generates TypeScript/Ruby-style schema definitions
 * from database table structure.
 *
 * Mirrors: ActiveRecord::SchemaDumper
 */

export interface ColumnInfo {
  name: string;
  type: string;
  primaryKey?: boolean;
  null?: boolean;
  default?: unknown;
  limit?: number;
  precision?: number;
  scale?: number;
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
]);

function sqlTypeToDsl(sqlType: string): DslMapping {
  const normalized = sqlType.toLowerCase().trim();
  const isArray = normalized.endsWith("[]");
  const baseType = isArray ? normalized.slice(0, -2) : normalized;

  let result = SQL_TYPE_MAP[baseType];

  if (!result) {
    // Handle parameterized types
    const varcharMatch = baseType.match(/^character varying\((\d+)\)$/);
    if (varcharMatch) {
      result = { dslType: "string", extraOpts: { limit: Number(varcharMatch[1]) } };
    } else {
      const numericMatch = baseType.match(/^numeric\((\d+),(\d+)\)$/);
      if (numericMatch) {
        result = {
          dslType: "decimal",
          extraOpts: { precision: Number(numericMatch[1]), scale: Number(numericMatch[2]) },
        };
      } else {
        // Handle precision-bearing timestamp/time types: timestamp(3) without time zone
        const tsMatch = baseType.match(/^timestamp(\(\d+\))?\s+(with(?:out)?\s+time\s+zone)$/);
        if (tsMatch) {
          result =
            tsMatch[2].startsWith("with ") || tsMatch[2] === "with time zone"
              ? { dslType: "timestamptz" }
              : { dslType: "datetime" };
        } else if (baseType.match(/^time(\(\d+\))?\s+(with(?:out)?\s+time\s+zone)$/)) {
          result = { dslType: "time" };
        } else {
          // If it's already a known DSL type name, pass it through
          if (KNOWN_DSL_TYPES.has(baseType)) {
            result = { dslType: baseType };
          } else {
            // Unknown types (enums, domains, etc.)
            result = { dslType: "enum", extraOpts: { enum_type: baseType } };
          }
        }
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

export class SchemaDumper {
  static ignoreTables: (string | RegExp)[] = [];

  private _source: SchemaSource;

  constructor(source: SchemaSource) {
    this._source = source;
  }

  static dump(source: SchemaSource): string | Promise<string> {
    const dumper = new SchemaDumper(source);
    return dumper.dump();
  }

  static async dumpTableSchema(source: SchemaSource, tableName: string): Promise<string> {
    const dumper = new SchemaDumper(source);
    const lines: string[] = [];
    await dumper.dumpTable(lines, tableName);
    return lines.join("\n");
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
    lines.push("export default async function defineSchema(ctx: any) {");
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
    for (const pattern of SchemaDumper.ignoreTables) {
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
          opts.push(`${key}: ${JSON.stringify(value)}`);
        }
      }

      if (col.limit !== undefined && col.limit !== null && !extraOpts?.limit)
        opts.push(`limit: ${col.limit}`);
      if (col.precision !== undefined && col.precision !== null && !extraOpts?.precision)
        opts.push(`precision: ${col.precision}`);
      if (col.scale !== undefined && !extraOpts?.scale) opts.push(`scale: ${col.scale}`);

      const optionsStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";

      if (dslType === "enum" && extraOpts?.enum_type) {
        lines.push(`    t.enum(${JSON.stringify(col.name)}${optionsStr});`);
      } else {
        lines.push(`    t.${dslType}(${JSON.stringify(col.name)}${optionsStr});`);
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
