export class Task extends Base {
  declare isTierLow: () => boolean;
  declare tierLowBang: () => Promise<true | undefined>;
  declare static tierLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notTierLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare isTierHigh: () => boolean;
  declare tierHighBang: () => Promise<true | undefined>;
  declare static tierHigh: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notTierHigh: () => import("@blazetrails/activerecord").Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 }, { prefix: "tier" });
  }
}
export interface Task {
  get status(): "low" | "high";
  set status(value: unknown);
}

declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    tierLow(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    notTierLow(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    tierHigh(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    notTierHigh(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
  }
}
