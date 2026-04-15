export class Task extends Base {
  declare status: number;
  declare isLow: () => boolean;
  declare lowBang: () => this;
  declare static low: () => import("@blazetrails/activerecord").Relation<Task>;
  declare isHigh: () => boolean;
  declare highBang: () => this;
  declare static high: () => import("@blazetrails/activerecord").Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 });
  }
}
