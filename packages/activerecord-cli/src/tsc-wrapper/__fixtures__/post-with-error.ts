import { Base } from "./model.js";

export class Post extends Base {
  static {
    this.attribute("title", "string");
  }

  greet(): string {
    const x: number = "not a number";
    return x.toString();
  }
}
