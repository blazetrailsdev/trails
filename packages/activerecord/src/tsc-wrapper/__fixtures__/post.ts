import { Base } from "./model.js";

export class Post extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("published", "boolean");
  }
}
