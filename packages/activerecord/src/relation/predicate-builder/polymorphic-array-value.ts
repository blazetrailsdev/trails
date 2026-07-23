/**
 * Handles polymorphic association queries by grouping values by type
 * and building separate queries for each type.
 *
 * Mirrors: ActiveRecord::PredicateBuilder::PolymorphicArrayValue
 *
 * Examples:
 *   where({ commentable: [post, image] })
 *     → (commentable_type = 'Post' AND commentable_id = 1)
 *        OR (commentable_type = 'Image' AND commentable_id = 2)
 */
import type { Base } from "../../base.js";
import { polymorphicName } from "../../inheritance.js";
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
        // Composite FK: Ruby uses the FK array itself as the hash key
        // (`query[associated_table.join_foreign_key] = ids`), which
        // expand_from_hash later zips per tuple. JS object keys can't be
        // arrays, so zip each id tuple across the FK columns here — one
        // query per tuple; queries are ORed by groupingQueries.
        for (const tuple of ids) {
          const q: Record<string, unknown> = {};
          if (type) q[this.associatedTable.joinForeignType] = type;
          (tuple as unknown[]).forEach((id, i) => {
            q[fk[i]] = id;
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
    for (const v of this.values) {
      const k = this.klass(v);
      const type = k ? (this.polymorphicName(k) ?? null) : null;
      const id = this.convertToId(v);
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
    if ("_modelClass" in value && "toArel" in value) return (value as any)._modelClass;
    return (value as any).constructor ?? null;
  }

  /** @internal */
  private convertToId(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === "object" && value !== null) {
      if ("_modelClass" in value && "toArel" in value) {
        // Select the table-qualified primary key so the subquery's projection
        // stays unambiguous once its arel carries joins (build_arel
        // convergence) — matching RelationHandler's `arel_table[primary_key]`.
        const pk = this.primaryKey(value);
        const arelTable = (value as any)._modelClass?.arelTable;
        return (value as any).select(arelTable && !Array.isArray(pk) ? arelTable.get(pk) : pk);
      }
      const pk = this.primaryKey(value);
      if (Array.isArray(pk)) {
        // Rails: primary_key.map { |column| value._read_attribute(column) }
        return pk.map((column) => (value as any)._readAttribute(column));
      }
      if (pk in value) return (value as any)[pk];
    }
    return value;
  }

  /** @internal */
  private polymorphicName(klass: unknown): string | null {
    if (typeof klass === "function") {
      return polymorphicName(klass as typeof Base);
    }
    return (klass as { name?: string } | null)?.name ?? null;
  }
}
