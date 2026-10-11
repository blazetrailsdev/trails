import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Possession extends Base {
  static _tableName = "having";
}
registerModel(Possession);
