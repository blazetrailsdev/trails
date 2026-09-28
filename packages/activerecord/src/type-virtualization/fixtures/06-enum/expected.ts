export class Task extends Base {
  declare isLow: () => boolean;
  declare lowBang: () => Promise<true | undefined>;
  declare static low: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare isHigh: () => boolean;
  declare highBang: () => Promise<true | undefined>;
  declare static high: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notHigh: () => import("@blazetrails/activerecord").Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 });
  }
}
export interface Task {
  get status(): "low" | "high";
  set status(value: unknown);
}

declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    low(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    notLow(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    high(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    notHigh(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
  }
}
