import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class PkAutopopulatedByATriggerRecord extends Base {
  static {
    this.primaryKey = "id";
  }
}
registerModel(PkAutopopulatedByATriggerRecord);
