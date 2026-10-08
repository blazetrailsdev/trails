import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Possession extends Base {
  static _tableName = "having";
}
registerConstant("Possession", Possession);
