import { Type, ValueType } from "@blazetrails/activemodel";

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

    if (column) {
      const adapter = this._klass?.adapter;
      const type = adapter?.lookupCastTypeFromColumn?.(column);
      if (type) return type;

      const sqlType = (column as any).sqlType ?? (column as any).type;
      if (sqlType && adapter?.lookupCastType) {
        const castType = adapter.lookupCastType(sqlType);
        if (castType) return castType;
      }
    }

    return new ValueType();
  }

  private resolveColumn(attrName: string): unknown | undefined {
    // Only consult the schema cache when it's already populated — avoid
    // triggering cache-miss paths that call async adapter methods.
    const adapter = this._klass?.adapter;
    const schemaCache = adapter?.schemaCache;
    if (schemaCache?.isCached(this._tableName)) {
      const hash = schemaCache.getCachedColumnsHash(this._tableName);
      const column = hash?.[attrName];
      if (column) return column;
    }

    // Fallback: klass.columnsHash (works when schema cache isn't populated)
    const columnsHash =
      typeof this._klass?.columnsHash === "function"
        ? this._klass.columnsHash()
        : this._klass?.columnsHash;
    if (columnsHash) {
      return columnsHash instanceof globalThis.Map
        ? columnsHash.get(attrName)
        : columnsHash?.[attrName];
    }

    return undefined;
  }
}
