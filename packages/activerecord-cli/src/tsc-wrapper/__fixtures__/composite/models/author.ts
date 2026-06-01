import { Base } from "./base.js";

export class Author extends Base {
  static {
    this.attribute("name", "string");
  }
}
