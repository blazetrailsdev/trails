export class Task extends Base {
  declare status: number;
  declare isStatusLow: () => boolean;
  declare statusLowBang: () => this;
  declare static statusLow: () => Relation<Task>;
  declare isStatusHigh: () => boolean;
  declare statusHighBang: () => this;
  declare static statusHigh: () => Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 }, { prefix: true });
  }
}
