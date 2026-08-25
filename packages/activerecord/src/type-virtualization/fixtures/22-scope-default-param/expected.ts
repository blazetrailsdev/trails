export class Topic extends Base {
  declare static withKwargs: (approved?: boolean) => import("@blazetrails/activerecord").Relation<Topic>;
  declare static limited: (limit: number, offset?: number) => import("@blazetrails/activerecord").Relation<Topic>;
  declare static named: (name?: string) => import("@blazetrails/activerecord").Relation<Topic>;
  declare static typedRest: (...ids: number[]) => import("@blazetrails/activerecord").Relation<Topic>;
  declare static untypedRest: (...args: unknown[]) => import("@blazetrails/activerecord").Relation<Topic>;

  static {
    this.scope("withKwargs", function (this: any, approved = false) {
      return this.where({ approved });
    });
    this.scope("limited", function (this: any, limit: number, offset = 0) {
      return this.limit(limit).offset(offset);
    });
    this.scope("named", function (this: any, name = "draft") {
      return this.where({ name });
    });
    this.scope("typedRest", function (this: any, ...ids: number[]) {
      return this.where({ id: ids });
    });
    this.scope("untypedRest", function (this: any, ...args: unknown[]) {
      return this.where({ args });
    });
  }
}
