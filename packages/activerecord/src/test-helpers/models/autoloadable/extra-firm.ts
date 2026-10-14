import { Base } from "../../../base.js";
import { registerModel } from "../../../associations.js";

export class ExtraFirm extends Base {
  static _tableName = "companies";
}
registerModel(ExtraFirm);
