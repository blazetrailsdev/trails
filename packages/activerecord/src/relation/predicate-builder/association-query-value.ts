import { hasKey, isEmpty, rbFPublicSend, rbObjRespondTo, toH, zip } from "@blazetrails/ruby-compat";
import type { Base } from "../../base.js";
import { ActiveRecord } from "../../namespaces.js";
import type { Relation } from "../../relation.js";
import { DeferredPluck } from "./deferred-distinct-pk-in.js";

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

  queries(): (Record<string, unknown> | Map<unknown, unknown>)[] {
    const joinForeignKey = this.associatedTable.joinForeignKey;
    if (Array.isArray(joinForeignKey)) {
      const idList = this.ids();
      if (idList instanceof ActiveRecord.Relation) {
        return [
          new Map([[joinForeignKey, new DeferredPluck(idList, this.primaryKey() as string[])]]),
        ];
      }

      return idList.map((idsSet) => toH(zip(joinForeignKey, idsSet as unknown[])));
    } else {
      return [{ [joinForeignKey]: this.ids() }];
    }
  }

  /** @internal */
  private ids(): Relation<Base, boolean> | unknown[] {
    const value = this.value;
    if (value instanceof ActiveRecord.Relation) {
      let relation = value as Relation<Base, boolean>;
      if (this.isSelectClause()) relation = relation.select(this.primaryKey() as string);
      if (this.isPolymorphicClause()) {
        relation = relation.where({ [this.primaryType()!]: this.polymorphicName() });
      }
      return relation;
    } else if (Array.isArray(value)) {
      return value.map((v) => this.convertToId(v));
    } else {
      return [this.convertToId(value)];
    }
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
    return (
      this.primaryType() != null &&
      !hasKey((this.value as Relation<Base, boolean>).whereValuesHash(), this.primaryType()!)
    );
  }

  /** @internal */
  private isSelectClause(): boolean {
    return isEmpty((this.value as Relation<Base, boolean>).selectValues);
  }

  private convertToId(value: unknown): unknown {
    const primaryKey = this.primaryKey();
    if (Array.isArray(primaryKey)) {
      return primaryKey.map((attribute) => {
        if (value == null) return null;

        if (attribute === "id") {
          return (value as Base).readAttribute("id");
        } else {
          return rbFPublicSend(value, attribute);
        }
      });
    } else if (rbObjRespondTo(value, primaryKey)) {
      return rbFPublicSend(value, primaryKey);
    } else {
      return value;
    }
  }
}
