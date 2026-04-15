export class Task extends Base {
  declare status: number;
  declare isLow: () => boolean;
  declare lowBang: () => this;
  declare static low: () => Relation<Task>;
  declare isHigh: () => boolean;
  declare highBang: () => this;
  declare static high: () => Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 });
  }
}
