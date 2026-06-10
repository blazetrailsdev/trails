export class Topic extends Base {
  declare static withKwargs: (approved?: boolean) => import("@blazetrails/activerecord").Relation<Topic>;
  declare static limited: (limit: number, offset?: number) => import("@blazetrails/activerecord").Relation<Topic>;
  declare static named: (name?: string) => import("@blazetrails/activerecord").Relation<Topic>;

  static {
    this.scope("withKwargs", (rel, approved = false) => rel.where({ approved }));
    this.scope("limited", (rel, limit: number, offset = 0) => rel.limit(limit).offset(offset));
    this.scope("named", (rel, name = "draft") => rel.where({ name }));
  }
}
