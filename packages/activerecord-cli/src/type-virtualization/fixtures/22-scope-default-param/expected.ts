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
declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    withKwargs(this: import("@blazetrails/activerecord").Relation<Topic>, approved?: boolean): import("@blazetrails/activerecord").Relation<Topic>;
    limited(this: import("@blazetrails/activerecord").Relation<Topic>, limit: number, offset?: number): import("@blazetrails/activerecord").Relation<Topic>;
    named(this: import("@blazetrails/activerecord").Relation<Topic>, name?: string): import("@blazetrails/activerecord").Relation<Topic>;
    typedRest(this: import("@blazetrails/activerecord").Relation<Topic>, ...ids: number[]): import("@blazetrails/activerecord").Relation<Topic>;
    untypedRest(this: import("@blazetrails/activerecord").Relation<Topic>, ...args: unknown[]): import("@blazetrails/activerecord").Relation<Topic>;
  }
}
