import { Relation, type LoadedRelation } from "./relation.js";
import { ActiveRecord } from "./namespaces.js";
import { relationClassFor } from "./relation/delegation.js";
import { rbEql, rbFSend, rbHash, take, uniq } from "@blazetrails/ruby-compat";
import { stripThenable } from "./relation/thenable.js";
import type { Base } from "./base.js";

export type DjarKey = string | string[];
export type DjarIds = unknown[] | PromiseLike<unknown[]>;

export class DisableJoinsAssociationRelation<T extends Base> extends Relation<T, boolean> {
  /** @internal */
  static override _railsClassName = "ActiveRecord::DisableJoinsAssociationRelation";

  readonly key: DjarKey;
  private readonly _ids: DjarIds;

  constructor(klass: typeof Base, key: DjarKey, ids: DjarIds) {
    super(klass);
    this._ids = ids;
    this.key = key;
  }

  override async ids(): Promise<unknown[]> {
    return uniq(await this._ids);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE relation-subclasses-inherit-clone-without-overrides
   */
  override clone(): Relation<T> {
    const Ctor = relationClassFor.call(DisableJoinsAssociationRelation, this.model);
    const rel = new Ctor(this.model, this.key, this._ids) as Relation<T>;
    rel.initializeCopy(this as unknown as Relation<T>);
    return rel;
  }

  // @ts-expect-error — Rails' override returns an Array, not a Relation (activerecord/lib/active_record/disable_joins_association_relation.rb:13-15)
  override async limit(value: number | null): Promise<T[]> {
    const records = await this.toArray();
    return take(records, value as number);
  }

  override first(): Promise<T | null>;
  override first(n: number): Promise<T[]>;
  /** @missingRailsCall limit — PERMANENT */
  override async first(limit?: number): Promise<T | T[] | null> {
    const records = await this.toArray();
    if (limit != null) {
      return (rbFSend(records, "limit", limit) as Relation<T>).first();
    } else {
      return records[0] ?? null;
    }
  }

  override async load(block?: (record: T) => void): Promise<LoadedRelation<this>> {
    await super.load(block);
    const records = this._records;

    const key = this.key;
    const recordKey = (record: T): unknown =>
      Array.isArray(key)
        ? key.map((column) => record._readAttribute(column))
        : record._readAttribute(key);

    const recordsById = new Map<number, T[]>();
    for (const record of records) {
      const hash = rbHash(recordKey(record));
      const bucket = recordsById.get(hash);
      if (bucket) bucket.push(record);
      else recordsById.set(hash, [record]);
    }

    this._records = (await this.ids()).flatMap((id) =>
      (recordsById.get(rbHash(id)) ?? []).filter((record) => rbEql(recordKey(record), id)),
    );
    return stripThenable(this);
  }
}

ActiveRecord.DisableJoinsAssociationRelation = DisableJoinsAssociationRelation;
