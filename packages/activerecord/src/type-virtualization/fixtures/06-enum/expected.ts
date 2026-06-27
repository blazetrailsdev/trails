export class Task extends Base {
  declare status: number;
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
