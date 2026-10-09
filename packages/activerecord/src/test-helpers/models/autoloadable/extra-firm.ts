import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../../base.js";

export class ExtraFirm extends Base {
  static _tableName = "companies";
}
registerConstant("ExtraFirm", ExtraFirm);
