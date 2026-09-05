import type { DatabaseAdapter } from "@blazetrails/activerecord";
import type { SchemaSource, ColumnInfo, IndexInfo } from "@blazetrails/activerecord";

function sqliteId(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function detectAdapter(adapter: DatabaseAdapter): "sqlite" | "postgres" | "mysql" {
  const name = adapter.adapterName.toLowerCase();
  if (name.includes("postgres")) return "postgres";
  if (name.includes("mysql") || name.includes("maria")) return "mysql";
  return "sqlite";
}

export class AdapterSchemaSource implements SchemaSource {
  private _type: "sqlite" | "postgres" | "mysql" | undefined;

  constructor(private adapter: DatabaseAdapter) {}

  private type(): "sqlite" | "postgres" | "mysql" {
    if (!this._type) {
      this._type = detectAdapter(this.adapter);
    }
    return this._type;
  }

  async tables(): Promise<string[]> {
    const t = this.type();

    if (t === "postgres") {
      const rows = await this.adapter.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      );
      return (rows as any[]).map((r: any) => r.tablename);
    }

    if (t === "mysql") {
      throw new Error("MySQL schema introspection is not yet supported by AdapterSchemaSource.");
    }

    const rows = await this.adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    return (rows as any[]).map((r: any) => r.name);
  }

  async columns(tableName: string): Promise<ColumnInfo[]> {
    const t = this.type();
    if (t === "mysql") {
      throw new Error("MySQL schema introspection is not yet supported by AdapterSchemaSource.");
    }
    const cols = (await this.adapter.columns(tableName)) as any[];
    return cols.map((c) => ({
      name: c.name,
      type: c.type,
      sqlType: c.sqlType ?? undefined,
      primaryKey: c.primaryKey,
      null: c.null,
      default: c.default,
      hasDefault:
        typeof c.hasDefault === "boolean"
          ? c.hasDefault
          : c.default != null || (c.defaultFunction ?? null) !== null,
      defaultFunction: c.defaultFunction ?? undefined,
      limit: c.limit ?? undefined,
      precision: c.precision === undefined ? undefined : c.precision,
      scale: c.scale ?? undefined,
      collation: c.collation ?? undefined,
    }));
  }

  lookupCastTypeFromColumn(
    column: ColumnInfo,
  ): ReturnType<SchemaSource["lookupCastTypeFromColumn"]> {
    return this.adapter.lookupCastTypeFromColumn(column as { sqlType: string | null });
  }

  async indexes(tableName: string): Promise<IndexInfo[]> {
    const t = this.type();
    if (t === "mysql") {
      throw new Error("MySQL schema introspection is not yet supported by AdapterSchemaSource.");
    }

    if (t === "postgres") {
      const rows = (
        await this.adapter.execQuery(
          `SELECT i.relname AS name, ix.indisunique AS unique,
                array_agg(a.attname ORDER BY array_position(ix.indkey::int2[], a.attnum::int2)) AS columns
         FROM pg_class t
         JOIN pg_index ix ON t.oid = ix.indrelid
         JOIN pg_class i ON i.oid = ix.indexrelid
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
         WHERE t.oid = ?::regclass AND NOT ix.indisprimary
         GROUP BY i.relname, ix.indisunique`,
          "SQL",
          [tableName],
        )
      ).toArray();
      return (rows as any[]).map((r: any) => ({
        columns: Array.isArray(r.columns) ? r.columns : [r.columns],
        unique: r.unique,
        name: r.name,
      }));
    }

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
