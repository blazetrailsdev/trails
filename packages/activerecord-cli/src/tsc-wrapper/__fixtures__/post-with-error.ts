import { Base } from "./model.js";

export class Post extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("status", "integer");
    this.enum("status", { draft: 0 });
  }

  greet(): string {
    const x: number = "not a number";
    return x.toString();
  }
}
