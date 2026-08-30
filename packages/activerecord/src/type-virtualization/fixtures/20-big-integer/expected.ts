export class Counter extends Base {
  static {
    this.attribute("hits", "big_integer");
    this.attribute("user_id", "big_integer");
  }
}
export interface Counter {
  get hits(): bigint;
  set hits(value: unknown);
  get user_id(): import("@blazetrails/activerecord").PrimaryKeyValue;
  set user_id(value: unknown);
}

