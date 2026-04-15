export class Task extends Base {
  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 }, { prefix: "tier" });
  }
}
