import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Keyboard extends Base {
  declare key_number: number;
  declare name: string;

  static _primaryKey = "key_number";
}
registerConstant("Keyboard", Keyboard);
