import type { DatabaseAdapter } from "@blazetrails/activerecord";
import type { SchemaSource, ColumnInfo, IndexInfo } from "@blazetrails/activerecord";

/** Escape a SQLite identifier (double internal quotes). */
function sqliteId(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Detect adapter type via instanceof (falls back to constructor name for subclasses). */
async function detectAdapter(adapter: DatabaseAdapter): Promise<"sqlite" | "postgres" | "mysql"> {
  const { SQLite3Adapter, PostgreSQLAdapter, Mysql2Adapter } =
    await import("@blazetrails/activerecord");
  if (adapter instanceof PostgreSQLAdapter) return "postgres";
  if (adapter instanceof Mysql2Adapter) return "mysql";
  if (adapter instanceof SQLite3Adapter) return "sqlite";
  // Fallback for subclasses
  const name = adapter.constructor.name;
  if (name.includes("Postgres")) return "postgres";
  if (name.includes("Mysql")) return "mysql";
  return "sqlite";
}

/**
 * Normalize a SQLite default value expression.
 * PRAGMA table_info returns SQL expressions like 'foo', 0, NULL, CURRENT_TIMESTAMP.
 */
function normalizeSqliteDefault(raw: unknown): unknown {
  if (raw === null || raw === undefined) return undefined;
  const str = String(raw);

  // String literal: 'value' or 'it''s'
  const strMatch = str.match(/^'((?:[^']|'')*)'$/);
  if (strMatch) {
    return strMatch[1].replace(/''/g, "'");
  }

  if (str === "NULL") return undefined;
  if (str === "TRUE" || str === "true") return true;
  if (str === "FALSE" || str === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(str)) return Number(str);

  // Expression defaults (CURRENT_TIMESTAMP, etc.) — omit to avoid mis-quoting on reload
  return undefined;
}

/**
 * Normalize a Postgres default value expression.
 * Only emit literal defaults; omit expression defaults (nextval, now(), etc.)
 * to avoid semantic changes on schema round-trip.
 */
function normalizePgDefault(raw: unknown): unknown {
  if (raw === null || raw === undefined) return undefined;
  const str = String(raw);

  // String literal with type cast: 'value'::type
  const strMatch = str.match(/^'((?:[^']|'')*)'(?:::[\w\s."[\](),]+)*$/);
  if (strMatch) {
    return strMatch[1].replace(/''/g, "'");
  }

  // Numeric literal with optional cast: 42::integer, (3.14)::numeric
  const numMatch = str.match(/^\(?(-?\d+(?:\.\d+)?)\)?(?:::[\w\s."[\](),]+)*$/);
  if (numMatch) {
    return Number(numMatch[1]);
  }

  if (str === "true") return true;
  if (str === "false") return false;
  if (str === "NULL::*" || str === "NULL") return undefined;

  // Expression defaults (nextval(...), now(), gen_random_uuid(), etc.) — omit
  return undefined;
}

/**
 * Adapter-backed SchemaSource for use with SchemaDumper.
 * Queries the actual database for table, column, and index info.
 * Supports SQLite and Postgres.
 */
export class AdapterSchemaSource implements SchemaSource {
  private _type: "sqlite" | "postgres" | "mysql" | undefined;

  constructor(private adapter: DatabaseAdapter) {}

  private async type(): Promise<"sqlite" | "postgres" | "mysql"> {
    if (!this._type) {
      this._type = await detectAdapter(this.adapter);
    }
    return this._type;
  }

  async tables(): Promise<string[]> {
    const t = await this.type();

    if (t === "postgres") {
      const rows = await this.adapter.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      );
      return (rows as any[]).map((r: any) => r.tablename);
    }

    if (t === "mysql") {
      throw new Error("MySQL schema introspection is not yet supported by AdapterSchemaSource.");
    }

    // SQLite
    const rows = await this.adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    return (rows as any[]).map((r: any) => r.name);
  }

  async columns(tableName: string): Promise<ColumnInfo[]> {
    const t = await this.type();
    if (t === "mysql") {
      throw new Error("MySQL schema introspection is not yet supported by AdapterSchemaSource.");
    }

    if (t === "postgres") {
      // Use format_type for precise types (handles enums, domains, arrays)
      const rows = await this.adapter.execute(
        `SELECT a.attname AS column_name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                NOT a.attnotnull AS is_nullable,
                pg_get_expr(d.adbin, d.adrelid) AS column_default,
                CASE WHEN a.atttypid = 1043 AND a.atttypmod > 0 THEN a.atttypmod - 4 ELSE NULL END AS character_maximum_length,
                CASE WHEN a.atttypid IN (1700) AND a.atttypmod > 0 THEN ((a.atttypmod - 4) >> 16) & 65535 ELSE NULL END AS numeric_precision,
                CASE WHEN a.atttypid IN (1700) AND a.atttypmod > 0 THEN (a.atttypmod - 4) & 65535 ELSE NULL END AS numeric_scale
         FROM pg_attribute a
         LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
         WHERE a.attrelid = ?::regclass AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attnum`,
        [tableName],
      );
      const pkRows = await this.adapter.execute(
        `SELECT a.attname FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = ?::regclass AND i.indisprimary`,
        [tableName],
      );
      const pkCols = new Set((pkRows as any[]).map((r: any) => r.attname));

      return (rows as any[]).map((r: any) => ({
        name: r.column_name,
        type: r.data_type,
        primaryKey: pkCols.has(r.column_name),
        null: !!r.is_nullable,
        default: normalizePgDefault(r.column_default),
        limit: r.character_maximum_length != null ? Number(r.character_maximum_length) : undefined,
        precision: r.numeric_precision != null ? Number(r.numeric_precision) : undefined,
        scale: r.numeric_scale != null ? Number(r.numeric_scale) : undefined,
      }));
    }

    // SQLite (PRAGMA doesn't support bind params, so escape the identifier)
    const rows = await this.adapter.execute(`PRAGMA table_info(${sqliteId(tableName)})`);
    return (rows as any[]).map((r: any) => ({
      name: r.name,
      type: r.type,
      primaryKey: r.pk > 0,
      null: r.notnull === 0,
      default: normalizeSqliteDefault(r.dflt_value),
    }));
  }

  async indexes(tableName: string): Promise<IndexInfo[]> {
    const t = await this.type();
    if (t === "mysql") {
      throw new Error("MySQL schema introspection is not yet supported by AdapterSchemaSource.");
    }

    if (t === "postgres") {
      const rows = await this.adapter.execute(
        `SELECT i.relname AS name, ix.indisunique AS unique,
                array_agg(a.attname ORDER BY array_position(ix.indkey::int2[], a.attnum::int2)) AS columns
         FROM pg_class t
         JOIN pg_index ix ON t.oid = ix.indrelid
         JOIN pg_class i ON i.oid = ix.indexrelid
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
         WHERE t.oid = ?::regclass AND NOT ix.indisprimary
         GROUP BY i.relname, ix.indisunique`,
        [tableName],
      );
      return (rows as any[]).map((r: any) => ({
        columns: Array.isArray(r.columns) ? r.columns : [r.columns],
        unique: r.unique,
        name: r.name,
      }));
    }

    // SQLite
    const rows = await this.adapter.execute(`PRAGMA index_list(${sqliteId(tableName)})`);
    const result: IndexInfo[] = [];
    for (const row of rows as any[]) {
      if ((row.name as string).startsWith("sqlite_")) continue;
      const cols = await this.adapter.execute(`PRAGMA index_info(${sqliteId(row.name)})`);
      result.push({
        columns: (cols as any[]).map((c: any) => c.name),
        unique: row.unique === 1,
        name: row.name,
      });
    }
    return result;
  }
}
