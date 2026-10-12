import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class StringKeyObject extends Base {
  declare lock_version: number;
  declare name: string;

  static {
    this.primaryKey = "id";
  }
}
registerModel(StringKeyObject);
