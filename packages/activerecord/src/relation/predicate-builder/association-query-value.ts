/**
 * Converts association-based where conditions into foreign key queries.
 * When you write `where({ author: authorRecord })`, this extracts
 * the foreign key and wraps the id in a single-element array so that
 * `ArrayHandler`'s single-element path emits `author_id = ?` (not IN).
 *
 * Mirrors: ActiveRecord::PredicateBuilder::AssociationQueryValue
 *
 * Intermediate query hash shapes (before predicate building):
 *   where({ author: author })         → { author_id: [author.id] }
 *   where({ author: [a1, a2] })       → { author_id: [a1.id, a2.id] }
 *   where({ author: Author.where(...) }) → { author_id: <subquery> }
 */

/** Metadata about the associated table needed to build the FK predicate. */
export interface AssocTableMeta {
  joinForeignKey: string | string[];
  joinPrimaryKey: string | string[] | null;
}

export class AssociationQueryValue {
  constructor(
    private associatedTable: AssocTableMeta,
    private value: unknown,
  ) {}

  queries(): Record<string, unknown>[] {
    const fk = this.associatedTable.joinForeignKey;
    if (Array.isArray(fk)) {
      // CPK path — Slot B. Rails plucks primary_key from Relations then zips to FK tuples.
      // Relation subqueries can't be represented as an object key (JS would stringify the array).
      // Throw a clear error so the caller knows this is not yet supported rather than emitting
      // a silently malformed hash.
      const ids = this.ids();
      if (this.isRelation(ids)) {
        throw new Error(
          "Composite foreign key with Relation value is not yet supported (Slot B). " +
            "Use explicit FK conditions instead.",
        );
      }
      // Rails zips each element of id_list with the FK columns (id_list.map { |ids_set| fk.zip(ids_set).to_h }).
      // Each ids_set must be an array with the same arity as joinForeignKey. Non-tuple values
      // (single record, scalar) cannot be safely distributed across multiple FK columns — throw
      // rather than assigning the same value to every column (silently wrong SQL).
      const idList = Array.isArray(ids) ? ids : [ids];
      return idList.map((idsSet: any) => {
        if (!Array.isArray(idsSet)) {
          throw new Error(
            `Composite foreign key association requires tuple values matching [${(fk as string[]).join(", ")}]. ` +
              "Pass an array of [value1, value2, ...] tuples (Slot B).",
          );
        }
        if (idsSet.length !== (fk as string[]).length) {
          throw new Error(
            `Composite FK tuple arity mismatch: expected ${(fk as string[]).length} values ` +
              `([${(fk as string[]).join(", ")}]) but got ${idsSet.length}.`,
          );
        }
        return (fk as string[]).reduce((acc: Record<string, unknown>, k: string, i: number) => {
          acc[k] = idsSet[i];
          return acc;
        }, {});
      });
    }
    return [{ [fk]: this.ids() }];
  }

  /** @internal */
  private ids(): unknown {
    const value = this.value;
    if (this.isRelation(value)) {
      const pk = this.primaryKey();
      if (!Array.isArray(pk) && this.isSelectClause(value)) {
        return (value as any).select(pk);
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.convertToId(v));
    }
    return [this.convertToId(value)];
  }

  private primaryKey(): string | string[] {
    return this.associatedTable.joinPrimaryKey ?? "id";
  }

  private isSelectClause(relation: unknown): boolean {
    const sv = (relation as any).selectValues;
    if (typeof sv === "function") return sv.call(relation).length === 0;
    if (Array.isArray(sv)) return sv.length === 0;
    return false;
  }

  private convertToId(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    const pk = this.primaryKey();
    if (typeof pk === "string" && typeof value === "object" && value !== null) {
      if (pk in (value as object)) return (value as any)[pk];
      if ("id" in (value as object)) return (value as any).id;
    }
    return value;
  }

  private isRelation(value: unknown): boolean {
    return (
      typeof value === "object" && value !== null && "_modelClass" in value && "toArel" in value
    );
  }
}
