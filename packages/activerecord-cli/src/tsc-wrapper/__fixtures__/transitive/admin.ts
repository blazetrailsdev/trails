import { User } from "./user.js";

export class Admin extends User {
  static {
    this.attribute("role", "string");
  }
}
