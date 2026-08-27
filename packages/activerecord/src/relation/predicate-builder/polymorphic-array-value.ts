import type { Base } from "../../base.js";
import { rubyInspectArray } from "../ruby-inspect.js";
import { ArgumentError } from "@blazetrails/activemodel";
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

  /** @missingRailsCall empty? — PERMANENT */
  queries(): Record<string, unknown>[] {
    const fk = this.associatedTable.joinForeignKey;
    if (this.values.length === 0) {
      if (Array.isArray(fk)) {
        return [Object.fromEntries(fk.map((col) => [col, this.values]))];
      }
      return [{ [fk]: this.values }];
    }
    const result: Record<string, unknown>[] = [];
    for (const [type, ids] of this.typeToIdsMapping()) {
      if (Array.isArray(fk)) {
        for (const tuple of ids) {
          if (!Array.isArray(tuple)) {
            throw new ArgumentError(
              `Expected corresponding value for ${rubyInspectArray(fk)} to be an Array`,
            );
          }
          const q: Record<string, unknown> = {};
          if (type) q[this.associatedTable.joinForeignType] = type;
          fk.forEach((col, i) => {
            q[col] = tuple[i] ?? null;
          });
          result.push(q);
        }
        continue;
      }
      const q: Record<string, unknown> = {};
      if (type) q[this.associatedTable.joinForeignType] = type;
      q[fk] = ids.length === 1 ? ids[0] : ids;
      result.push(q);
    }
    return result;
  }

  /** @internal */
  private typeToIdsMapping(): Map<string | null, unknown[]> {
    const map = new Map<string | null, unknown[]>();
    for (const value of this.values) {
      const klass = this.klass(value) as typeof Base | null;
      const type = klass?.polymorphicName?.() ?? null;
      const id = this.convertToId(value);
      if (!map.has(type)) map.set(type, []);
      map.get(type)!.push(id);
    }
    return map;
  }

  /** @internal */
  private primaryKey(value: unknown): string | string[] {
    return this.associatedTable.joinPrimaryKey(this.klass(value));
  }

  /** @internal */
  private klass(value: unknown): unknown {
    if (typeof value !== "object" || value === null) return null;
    if ("_model" in value && "arel" in value) return (value as any)._model;
    return (value as any).constructor ?? null;
  }

  /** @internal */
  private convertToId(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === "object" && value !== null) {
      if ("_model" in value && "arel" in value) {
        const pk = this.primaryKey(value);
        const arelTable = (value as any)._model?.arelTable;
        return (value as any).select(arelTable && !Array.isArray(pk) ? arelTable.get(pk) : pk);
      }
      const pk = this.primaryKey(value);
      if (Array.isArray(pk)) {
        return pk.map((column) => (value as any)._readAttribute(column));
      }
      if (pk in value) return (value as any)[pk];
    }
    return value;
  }
}
