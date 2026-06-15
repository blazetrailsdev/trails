export class Task extends Base {
  declare status: number;
  declare isStatusLow: () => boolean;
  declare statusLowBang: () => Promise<true>;
  declare static statusLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notStatusLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare isStatusHigh: () => boolean;
  declare statusHighBang: () => Promise<true>;
  declare static statusHigh: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notStatusHigh: () => import("@blazetrails/activerecord").Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 }, { prefix: true });
  }
}
