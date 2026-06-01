import { Base } from "./base.js";

export class Post extends Base {
  static {
    this.attribute("title", "string");
    this.belongsTo("author");
  }
}
