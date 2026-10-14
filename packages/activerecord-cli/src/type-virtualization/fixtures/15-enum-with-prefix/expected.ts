export class Task extends Base {
  declare isStatusLow: () => boolean;
  declare statusLowBang: () => Promise<true | undefined>;
  declare static statusLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notStatusLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare isStatusHigh: () => boolean;
  declare statusHighBang: () => Promise<true | undefined>;
  declare static statusHigh: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notStatusHigh: () => import("@blazetrails/activerecord").Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 }, { prefix: true });
  }
}
export interface Task {
  get status(): "low" | "high";
  set status(value: unknown);
}

declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    statusLow(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    notStatusLow(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    statusHigh(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    notStatusHigh(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
  }
}
