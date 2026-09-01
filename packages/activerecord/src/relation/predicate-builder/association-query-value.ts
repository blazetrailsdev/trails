import { hasKey } from "@blazetrails/ruby-compat";
export interface AssocTableMeta {
  joinForeignKey: string | string[];
  joinPrimaryKey(klass?: unknown): string | string[] | null;
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
      const ids = this.ids();
      if (this.isRelation(ids)) {
        const pks = this.primaryKey() as string[];
        const fkCols = fk;
        const baseRelation = ids as any;
        return [
          fkCols.reduce<Record<string, unknown>>((acc, fkCol, i) => {
            acc[fkCol] = baseRelation.reselect(pks[i]);
            return acc;
          }, {}),
        ];
      }
      const idList = Array.isArray(ids) ? ids : [ids];
      return idList.map((idsSet: any) => {
        if (!Array.isArray(idsSet)) {
          throw new Error(
            `Composite foreign key association requires tuple values matching [${fk.join(", ")}]. ` +
              "Pass an array of [value1, value2, ...] tuples (Slot B).",
          );
        }
        if (idsSet.length !== fk.length) {
          throw new Error(
            `Composite FK tuple arity mismatch: expected ${fk.length} values ` +
              `([${fk.join(", ")}]) but got ${idsSet.length}.`,
          );
        }
        return fk.reduce((acc: Record<string, unknown>, k: string, i: number) => {
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
      if (!Array.isArray(pk) && this.isSelectClause()) {
        const arelTable = relation._model?.arelTable;
        relation = relation.select(arelTable ? arelTable.get(pk) : pk);
      }
      if (this.isPolymorphicClause()) {
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
    return this.associatedTable.joinPrimaryKey() ?? "id";
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
  private isPolymorphicClause(): boolean {
    const value = this.value as { whereValuesHash?: () => Record<string, unknown> };
    const type = this.primaryType();
    if (!type) return false;
    const hash = typeof value.whereValuesHash === "function" ? value.whereValuesHash() : undefined;
    if (!hash) return true;
    return !hasKey(hash, type);
  }

  /** @missingRailsCall empty? — PERMANENT */
  private isSelectClause(): boolean {
    const sv = (this.value as any).selectValues;
    if (typeof sv === "function") return sv.call(this.value).length === 0;
    if (Array.isArray(sv)) return sv.length === 0;
    return false;
  }

  private convertToId(value: unknown): unknown {
    const pk = this.primaryKey();
    if (Array.isArray(pk)) {
      return pk.map((attr) => {
        if (value === null || value === undefined) return null;
        if (attr === "id" && typeof (value as any).readAttribute === "function") {
          return (value as any).readAttribute("id");
        }
        return (value as any)[attr];
      });
    }
    if (typeof pk === "string" && typeof value === "object" && value !== null) {
      if (pk in value) return (value as any)[pk];
      if ("id" in value) return (value as any).id;
    }
    return value;
  }

  private isRelation(value: unknown): boolean {
    return typeof value === "object" && value !== null && "_model" in value && "arel" in value;
  }
}
