import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class DlKeyedHasManyThrough extends Base {
  declare through_key: number;

  static {
    this.primaryKey = "through_key";
  }
}
registerConstant("DlKeyedHasManyThrough", DlKeyedHasManyThrough);
