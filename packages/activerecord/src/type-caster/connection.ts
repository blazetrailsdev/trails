import type { Type } from "@blazetrails/activemodel";
import { rbObjAsString as toS } from "@blazetrails/ruby-compat";
import { defaultValue } from "../type.js";

export class Connection {
  private _klass: any;
  private _tableName: string;

  constructor(klass: any, tableName: string) {
    this._klass = klass;
    this._tableName = tableName;
  }

  typeCastForDatabase(attrName: unknown, value: unknown): unknown {
    const type = this.typeForAttribute(attrName);
    return type.serialize(value);
  }

  typeForAttribute(attrName: unknown): Type {
    const schemaCache = this._klass?.connectionPool?.()?.poolConfig?.schemaCache;
    const columnsHash = schemaCache?.getCachedColumnsHash?.(tableName(this));
    const column = columnsHash?.[toS(attrName)];
    const type = column
      ? (this._klass?.connection?.lookupCastTypeFromColumn(column) as Type | undefined)
      : undefined;
    return type ?? defaultValue();
  }
}

/** @internal */
export function tableName(connection: Connection): string {
  return (connection as any)._tableName as string;
}
