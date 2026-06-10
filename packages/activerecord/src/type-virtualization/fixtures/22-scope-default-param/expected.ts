export class Topic extends Base {
  declare static withKwargs: (approved?: boolean) => import("@blazetrails/activerecord").Relation<Topic>;
  declare static limited: (limit: number, offset?: number) => import("@blazetrails/activerecord").Relation<Topic>;
  declare static named: (name?: string) => import("@blazetrails/activerecord").Relation<Topic>;
  declare static typedRest: (...ids: number[]) => import("@blazetrails/activerecord").Relation<Topic>;
  declare static untypedRest: (...args: unknown[]) => import("@blazetrails/activerecord").Relation<Topic>;

  static {
    this.scope("withKwargs", (rel, approved = false) => rel.where({ approved }));
    this.scope("limited", (rel, limit: number, offset = 0) => rel.limit(limit).offset(offset));
    this.scope("named", (rel, name = "draft") => rel.where({ name }));
    this.scope("typedRest", (rel, ...ids: number[]) => rel.where({ id: ids }));
    this.scope("untypedRest", (rel, ...args) => rel.where({ args }));
  }
}
