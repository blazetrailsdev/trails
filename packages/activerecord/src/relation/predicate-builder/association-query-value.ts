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
  joinPrimaryType?: string | null;
  polymorphicNameAssociation?: string | null;
}

export class AssociationQueryValue {
  private readonly _associatedTable: AssocTableMeta;
  private readonly _value: unknown;

  constructor(associatedTable: AssocTableMeta, value: unknown) {
    this._associatedTable = associatedTable;
    this._value = value;
  }

  /** @internal */
  private get associatedTable() {
    return this._associatedTable;
  }

  /** @internal */
  private get value() {
    return this._value;
  }

  queries(): Record<string, unknown>[] {
    const fk = this.associatedTable.joinForeignKey;
    if (Array.isArray(fk)) {
      // CPK path — Slot B. Rails plucks primary_key from Relations then zips to FK tuples.
      // Relation subqueries can't be represented as an object key (JS would stringify the array).
      // Throw a clear error so the caller knows this is not yet supported rather than emitting
      // a silently malformed hash.
      const ids = this.ids();
      if (this.isRelation(ids)) {
        // Pragmatic deviation from Rails: Rails calls `id_list.pluck(primary_key)`
        // here, synchronously materializing the relation into tuples. Our pluck is
        // async and queries() is sync, so instead we emit one IN subquery per FK
        // column (`fk[i] IN (SELECT pk[i] FROM ...)`, ANDed via PredicateBuilder).
        // This is broader than Rails' tuple-IN — it matches rows where each FK
        // component is in its column independently rather than as a tuple — but
        // mirrors the subquery approach used for non-CPK Relations (Batch 71).
        const pks = this.primaryKey() as string[];
        const fkCols = fk as string[];
        const baseRelation = ids as any;
        return [
          fkCols.reduce<Record<string, unknown>>((acc, fkCol, i) => {
            acc[fkCol] = baseRelation.reselect(pks[i]);
            return acc;
          }, {}),
        ];
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
      let relation = value as any;
      if (!Array.isArray(pk) && this.isSelectClause(relation)) {
        relation = relation.select(pk);
      }
      if (this.isPolymorphicClause(relation)) {
        relation = relation.where({ [this.primaryType()!]: this.polymorphicName() });
      }
      return relation;
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.convertToId(v));
    }
    return [this.convertToId(value)];
  }

  /** @internal */
  private primaryKey(): string | string[] {
    return this.associatedTable.joinPrimaryKey ?? "id";
  }

  /** @internal */
  private primaryType(): string | null {
    return this.associatedTable.joinPrimaryType ?? null;
  }

  /** @internal */
  private polymorphicName(): string | null {
    return this.associatedTable.polymorphicNameAssociation ?? null;
  }

  /** @internal */
  private isPolymorphicClause(relation: {
    whereValuesHash?: () => Record<string, unknown>;
  }): boolean {
    const type = this.primaryType();
    if (!type) return false;
    // Rails: polymorphic? && !where_values_hash.key?(primary_type). If the relation
    // doesn't implement where_values_hash (non-Relation duck), treat as needing the
    // polymorphic constraint — that's the safer default than skipping the type guard.
    const hash =
      typeof relation.whereValuesHash === "function" ? relation.whereValuesHash() : undefined;
    if (!hash) return true;
    return !(type in hash);
  }

  private isSelectClause(relation: unknown): boolean {
    const sv = (relation as any).selectValues;
    if (typeof sv === "function") return sv.call(relation).length === 0;
    if (Array.isArray(sv)) return sv.length === 0;
    return false;
  }

  private convertToId(value: unknown): unknown {
    const pk = this.primaryKey();
    if (Array.isArray(pk)) {
      // Rails: primary_key.map { |attribute| next nil if value.nil?; attribute == "id" ? value.id_value : value.public_send(attribute) }
      return pk.map((attr) => {
        if (value === null || value === undefined) return null;
        if (attr === "id" && typeof (value as any).readAttribute === "function") {
          // Rails: id_value reads the scalar `id` column on composite-PK records.
          return (value as any).readAttribute("id");
        }
        return (value as any)[attr];
      });
    }
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
