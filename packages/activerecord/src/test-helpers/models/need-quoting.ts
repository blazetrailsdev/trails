import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class NeedQuoting extends Base {
  static _tableName = "1_need_quoting";
}
registerConstant("NeedQuoting", NeedQuoting);
