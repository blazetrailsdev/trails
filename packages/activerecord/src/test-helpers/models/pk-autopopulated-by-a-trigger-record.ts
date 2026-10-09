import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class PkAutopopulatedByATriggerRecord extends Base {
  static {
    this.primaryKey = "id";
  }
}
registerConstant("PkAutopopulatedByATriggerRecord", PkAutopopulatedByATriggerRecord);
