import { Base } from "./model.js";

// No `this.attribute(...)` calls — all columns come from schema reflection.
export class User extends Base {
  static override tableName = "users";
}
