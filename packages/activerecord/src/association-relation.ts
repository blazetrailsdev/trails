import type { Base } from "./base.js";
import { Relation } from "./relation.js";
import type { CollectionProxy } from "./associations/collection-proxy.js";
import type { Association } from "./associations/association.js";
import { setAssociationRelationFactory } from "./associations/_scope-slots.js";
import { _registerRelationFamily } from "./relation/uncacheable-methods-slot.js";
import { associationRelationClassFor, wrapWithScopeProxy } from "./relation/delegation.js";
import { rebaseNewOwnerSeed } from "./associations/new-owner-seed-rebase.js";
import { ArgumentError } from "@blazetrails/activemodel";

export class AssociationRelation<T extends Base> extends Relation<T> {
  /** @internal */
  static override _railsClassName = "ActiveRecord::AssociationRelation";

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

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  override clone(): Relation<T> {
    const Ctor = associationRelationClassFor(this.model);
    const rel = new Ctor(this.model, this._association) as Relation<T>;
    rel.initializeCopy(this);
    return wrapWithScopeProxy(rel);
  }

  override isNullRelation(): boolean {
    this._maybeRebaseAssociationSeed();
    return super.isNullRelation();
  }

  /** @internal */
  _maybeRebaseAssociationSeed(): void {
    if (!this._seededNoneNewOwner) return;
    const assoc = this._association as unknown as {
      scope?: () => { _isNone: boolean };
      resetScope?: () => void;
    };
    if (typeof assoc.scope !== "function") return;
    this._seededNoneNewOwner = false;
    assoc.resetScope?.();
    const fresh = assoc.scope();
    if (fresh._isNone) {
      this._seededNoneNewOwner = true;
      return;
    }
    rebaseNewOwnerSeed(
      this as unknown as Parameters<typeof rebaseNewOwnerSeed>[0],
      fresh as unknown,
      this._seedWherePredicates,
    );
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
    if (this._association.reflection.options?.through) {
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
    const records = await this.records();
    if (Array.isArray(other)) {
      return (
        other.length === records.length && other.every((record: T, i) => record.equals(records[i]))
      );
    }
    const otherEquals = (other as { equals?: (o: unknown) => unknown } | null)?.equals;
    if (typeof otherEquals === "function") {
      return (await otherEquals.call(other, records)) as boolean | undefined;
    }
    return false;
  }

  protected override async execQueries(): Promise<T[]> {
    const association = this._association.owner.association(this._association.reflection.name);
    const prevBlock = this._instantiateBlock;
    this._instantiateBlock = (record: T): void => {
      association.setInverseInstanceFromQueries(record);
      association.setStrictLoading(record);
      if (prevBlock) prevBlock(record);
    };

    try {
      return await super.execQueries();
    } finally {
      this._instantiateBlock = prevBlock;
    }
  }
}

_registerRelationFamily(
  "associationRelation",
  AssociationRelation as unknown as new (...a: never[]) => unknown,
);
setAssociationRelationFactory((klass, assoc) => {
  const Ctor = associationRelationClassFor(klass as typeof Base);
  return wrapWithScopeProxy(new Ctor(klass as typeof Base, assoc as Association));
});
