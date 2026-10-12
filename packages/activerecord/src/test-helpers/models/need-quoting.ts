import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class NeedQuoting extends Base {
  static _tableName = "1_need_quoting";
}
registerModel(NeedQuoting);
