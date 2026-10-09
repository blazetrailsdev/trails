import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Keyboard extends Base {
  declare key_number: number;
  declare name: string;

  static {
    this.primaryKey = "key_number";
  }
}
registerConstant("Keyboard", Keyboard);
