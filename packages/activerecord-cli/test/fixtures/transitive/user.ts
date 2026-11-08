import { Base } from "./base.js";

export class User extends Base {
  static {
    this.attribute("name", "string");
  }
}
