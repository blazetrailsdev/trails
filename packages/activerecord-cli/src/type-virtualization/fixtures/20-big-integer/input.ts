export class Counter extends Base {
  static {
    this.attribute("hits", "big_integer");
    this.attribute("user_id", "big_integer");
  }
}
