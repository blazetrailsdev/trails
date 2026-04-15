export class Task extends Base {
  declare status: number;
  declare isTierLow: () => boolean;
  declare tierLowBang: () => this;
  declare static tierLow: () => Relation<Task>;
  declare isTierHigh: () => boolean;
  declare tierHighBang: () => this;
  declare static tierHigh: () => Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 }, { prefix: "tier" });
  }
}
