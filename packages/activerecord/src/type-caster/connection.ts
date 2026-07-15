import type { Type } from "@blazetrails/activemodel";
import { defaultValue } from "../type.js";

/**
 * Casts attribute values for database operations using the connection's
 * schema cache to look up column types by table name.
 *
 * Mirrors: ActiveRecord::TypeCaster::Connection
 */
export class Connection {
  private _klass: any;
  private _tableName: string;

  constructor(klass: any, tableName: string) {
    this._klass = klass;
    this._tableName = tableName;
  }

  typeCastForDatabase(attrName: string, value: unknown): unknown {
    const type = this.typeForAttribute(attrName);
    return type.serialize(value);
  }

  typeForAttribute(attrName: string): Type {
    const column = this.resolveColumn(attrName);
    const type = column
      ? (this._klass?.connection?.lookupCastTypeFromColumn?.(column) as Type | undefined)
      : undefined;
    return type ?? defaultValue();
  }

  private resolveColumn(attrName: string): unknown | undefined {
    // Rails gates on `schema_cache.data_source_exists?(table_name)` before
    // reading `columns_hash` (type_caster/connection.rb:17-18). trails'
    // `dataSourceExists` is async (schema-cache.ts:211) and this method is sync,
    // so the cached columns hash is the gate instead: a warmed entry implies the
    // data source exists, and `getCachedColumnsHash` is a plain map read that
    // never triggers the async cache-miss path. Converging the gate itself waits
    // on the pool async/sync convergence (RFC 0023).
    const hash = this._klass?.connection?.schemaCache?.getCachedColumnsHash?.(this._tableName);
    return hash?.[attrName];
  }
}

/**
 * Returns the table name this type caster resolves columns against.
 *
 * Mirrors: ActiveRecord::TypeCaster::Connection#table_name (attr_reader, private)
 *
 * @internal
 */
export function tableName(connection: Connection): string {
  return (connection as any)._tableName as string;
}
