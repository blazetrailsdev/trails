import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class StringKeyObject extends Base {
  declare lock_version: number;
  declare name: string;

  static {
    this.primaryKey = "id";
  }
}
registerConstant("StringKeyObject", StringKeyObject);
