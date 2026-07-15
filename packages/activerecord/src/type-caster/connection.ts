import type { Type } from "@blazetrails/activemodel";
import { defaultValue } from "../type.js";

/**
 * Casts attribute values for database operations, looking column types up by
 * table name in the pool's schema cache.
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
    // Rails scopes the lookup to a leased connection —
    // `@klass.with_connection { |c| c.lookup_cast_type_from_column(column) }`
    // (type_caster/connection.rb:21). trails' `withConnection` returns a Promise
    // (connection-handling.ts:366) and this method is sync, so it reads the
    // adapter directly, taking a permanent checkout where Rails scopes a lease.
    // Same RFC 0023 async/sync constraint as the `data_source_exists?` gate below.
    const type = column
      ? (this._klass?.connection?.lookupCastTypeFromColumn(column) as Type | undefined)
      : undefined;
    return type ?? defaultValue();
  }

  private resolveColumn(attrName: string): unknown | undefined {
    // `@klass.schema_cache` (type_caster/connection.rb:17) reads the pool's cache
    // without leasing a connection (connection_handling.rb:368-369); trails ports
    // that as the sync, pool-backed `Base.schemaCache` (connection-handling.ts:576).
    // Read it off the klass, not the adapter — `connection.schemaCache` is not
    // guaranteed to be the same slot (model-schema.ts:731-755).
    const schemaCache = this._klass?.schemaCache?.();
    // Rails then gates on `schema_cache.data_source_exists?(table_name)` before
    // reading `columns_hash`. trails' `dataSourceExists` is async
    // (schema-cache.ts:211) and this method is sync, so the cached columns hash is
    // the gate instead: a warmed entry implies the data source exists, and
    // `getCachedColumnsHash` is a plain map read that never triggers the async
    // cache-miss path. Converging the gate waits on RFC 0023.
    const hash = schemaCache?.getCachedColumnsHash?.(this._tableName);
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
