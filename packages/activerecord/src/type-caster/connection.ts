import { Type, ValueType } from "@blazetrails/activemodel";

/**
 * Casts attribute values for database operations using the connection's
 * schema cache to look up column types.
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
      const adapter = this._klass.adapter;
      if (adapter?.lookupCastTypeFromColumn) {
        return adapter.lookupCastTypeFromColumn(column);
      }
      const sqlType = (column as any).sqlType ?? (column as any).type;
      if (adapter?.lookupCastType && sqlType) {
        const castType = adapter.lookupCastType(sqlType);
        if (castType) return castType;
      }
    }
    return new ValueType();
  }

  private resolveColumn(attrName: string): unknown | undefined {
    if (!this._klass) return undefined;

    // Use model's columnsHash (the most reliable path in this codebase)
    const columnsHash =
      typeof this._klass.columnsHash === "function"
        ? this._klass.columnsHash()
        : this._klass.columnsHash;
    if (columnsHash) {
      return columnsHash instanceof globalThis.Map
        ? columnsHash.get(attrName)
        : columnsHash[attrName];
    }

    return undefined;
  }
}
