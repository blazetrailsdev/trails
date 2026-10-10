import type { Base } from "./base.js";
import { Relation } from "./relation.js";
import type { CollectionProxy } from "./associations/collection-proxy.js";
import type { Association } from "./associations/association.js";
import { ActiveRecord } from "./namespaces.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { rbEqual, rbModConstSet } from "@blazetrails/ruby-compat";

export class AssociationRelation<T extends Base> extends Relation<T, boolean> {
  /** @internal */

  /** @internal */
  _association: CollectionProxy<T> | Association;

  constructor(klass: typeof Base, association: CollectionProxy<T> | Association) {
    super(klass);
    this._association = association;
  }

  get proxyAssociation(): Association {
    const association = this._association as CollectionProxy<T> & {
      proxyAssociation?: Association;
    };
    return association.proxyAssociation ?? (this._association as Association);
  }

  protected override _new(attributes: Record<string, unknown>, block?: (record: T) => void): T {
    return (this._association as CollectionProxy<T>).build(attributes, block);
  }

  protected override _create(
    attributes: Record<string, unknown>,
    block?: (record: T) => void,
  ): Promise<T> {
    return (this._association as CollectionProxy<T>).create(attributes, block);
  }

  protected override _createBang(
    attributes: Record<string, unknown>,
    block?: (record: T) => void,
  ): Promise<T> {
    return (this._association as CollectionProxy<T>).createBang(attributes, block);
  }

  private _assertBulkInsertable(): void {
    if (this.proxyAssociation.reflection.options?.through) {
      throw new ArgumentError(
        "Bulk insert or upsert is currently not supported for has_many through association",
      );
    }
  }

  async insert(...args: Parameters<Relation<T>["insert"]>): ReturnType<Relation<T>["insert"]> {
    this._assertBulkInsertable();
    return super.insert(...args);
  }

  async insertBang(
    ...args: Parameters<Relation<T>["insertBang"]>
  ): ReturnType<Relation<T>["insertBang"]> {
    this._assertBulkInsertable();
    return super.insertBang(...args);
  }

  async insertAll(
    ...args: Parameters<Relation<T>["insertAll"]>
  ): ReturnType<Relation<T>["insertAll"]> {
    this._assertBulkInsertable();
    return super.insertAll(...args);
  }

  async insertAllBang(
    ...args: Parameters<Relation<T>["insertAllBang"]>
  ): ReturnType<Relation<T>["insertAllBang"]> {
    this._assertBulkInsertable();
    return super.insertAllBang(...args);
  }

  async upsert(...args: Parameters<Relation<T>["upsert"]>): ReturnType<Relation<T>["upsert"]> {
    this._assertBulkInsertable();
    return super.upsert(...args);
  }

  async upsertAll(
    ...args: Parameters<Relation<T>["upsertAll"]>
  ): ReturnType<Relation<T>["upsertAll"]> {
    this._assertBulkInsertable();
    return super.upsertAll(...args);
  }

  override async equals(other: unknown): Promise<boolean | undefined> {
    return rbEqual(other, await this.records());
  }

  protected override async execQueries(block?: (record: T) => void): Promise<T[]> {
    const association = this.proxyAssociation.owner.association(
      this.proxyAssociation.reflection.name,
    );
    return super.execQueries((record) => {
      association.setInverseInstanceFromQueries(record);
      association.setStrictLoading(record);
      if (block) block(record);
    });
  }
}

rbModConstSet(ActiveRecord, "AssociationRelation", AssociationRelation);
