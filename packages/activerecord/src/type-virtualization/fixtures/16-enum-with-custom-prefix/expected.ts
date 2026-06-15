export class Task extends Base {
  declare status: number;
  declare isTierLow: () => boolean;
  declare tierLowBang: () => Promise<true>;
  declare static tierLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notTierLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare isTierHigh: () => boolean;
  declare tierHighBang: () => Promise<true>;
  declare static tierHigh: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notTierHigh: () => import("@blazetrails/activerecord").Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 }, { prefix: "tier" });
  }
}
