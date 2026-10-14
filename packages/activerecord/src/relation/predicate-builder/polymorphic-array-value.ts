import type { Base } from "../../base.js";
import { Hash, isEmpty } from "@blazetrails/ruby-compat";
import { ActiveRecord } from "../../namespaces.js";
export class PolymorphicArrayValue {
  private readonly _associatedTable: {
    joinForeignKey: string | string[];
    joinForeignType: string;
    joinPrimaryKey(klass?: unknown): string | string[];
  };
  private readonly _values: unknown[];

  constructor(
    associatedTable: {
      joinForeignKey: string | string[];
      joinForeignType: string;
      joinPrimaryKey(klass?: unknown): string | string[];
    },
    values: unknown[],
  ) {
    this._associatedTable = associatedTable;
    this._values = values;
  }

  /** @internal */
  private get associatedTable() {
    return this._associatedTable;
  }

  /** @internal */
  private get values() {
    return this._values;
  }

  queries(): Map<unknown, unknown>[] {
    if (isEmpty(this.values)) {
      return [new Map([[this.associatedTable.joinForeignKey, this.values]])];
    }

    return Array.from(this.typeToIdsMapping(), ([type, ids]) => {
      const query = new Map<unknown, unknown>();
      if (type != null) query.set(this.associatedTable.joinForeignType, type);
      query.set(this.associatedTable.joinForeignKey, ids);
      return query;
    });
  }

  /** @internal */
  private typeToIdsMapping(): Hash<string | undefined, unknown[]> {
    const defaultHash = new Hash<string | undefined, unknown[]>((hsh, key) => {
      const ids: unknown[] = [];
      hsh.set(key, ids);
      return ids;
    });
    for (const value of this.values) {
      defaultHash.get(this.klass(value)?.polymorphicName())!.push(this.convertToId(value));
    }
    return defaultHash;
  }

  /** @internal */
  private primaryKey(value: unknown): string | string[] {
    return this.associatedTable.joinPrimaryKey(this.klass(value));
  }

  /** @internal */
  private klass(value: unknown): typeof Base | undefined {
    if (value instanceof ActiveRecord.Base) {
      return value.constructor as typeof Base;
    } else if (value instanceof ActiveRecord.Relation) {
      return value.model;
    }
  }

  /** @internal */
  private convertToId(value: unknown): unknown {
    if (value instanceof ActiveRecord.Base) {
      const primaryKey = this.primaryKey(value);
      if (Array.isArray(primaryKey)) {
        return primaryKey.map((column) => value._readAttribute(column));
      } else {
        return value._readAttribute(primaryKey);
      }
    } else if (value instanceof ActiveRecord.Relation) {
      return value.select(this.primaryKey(value) as string);
    } else {
      return value;
    }
  }
}
