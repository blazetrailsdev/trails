export class Counter extends Base {
  declare hits: bigint;
  declare user_id: bigint;

  static {
    this.attribute("hits", "big_integer");
    this.attribute("user_id", "big_integer");
  }
}
