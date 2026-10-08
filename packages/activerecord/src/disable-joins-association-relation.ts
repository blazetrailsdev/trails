import { Relation, type LoadedRelation } from "./relation.js";
import { ActiveRecord } from "./namespaces.js";
import { compact, groupBy, rbFSend, take, uniq } from "@blazetrails/ruby-compat";
import { stripThenable } from "@blazetrails/activesupport";
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

  // @ts-expect-error — Rails' override returns an Array, not a Relation (activerecord/lib/active_record/disable_joins_association_relation.rb:13-15)
  override async limit(value: number | null): Promise<T[]> {
    const records = await this.toArray();
    return take(records, value as number);
  }

  override first(): Promise<T | null>;
  override first(n: number): Promise<T[]>;
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
    let records: (T | undefined)[] = this._records;

    const { key } = this;
    const recordsById = groupBy(records as T[], (record) =>
      Array.isArray(key) ? key.map((column) => record.get(column)) : record.get(key),
    );

    records = (await this.ids()).flatMap((id) => recordsById.get(id));
    records = compact(records);

    this._records = records as T[];
    return stripThenable(this);
  }
}

ActiveRecord.DisableJoinsAssociationRelation = DisableJoinsAssociationRelation;
