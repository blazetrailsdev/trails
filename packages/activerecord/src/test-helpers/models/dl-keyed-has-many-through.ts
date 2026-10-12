import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class DlKeyedHasManyThrough extends Base {
  declare through_key: number;

  static {
    this.primaryKey = "through_key";
  }
}
registerModel(DlKeyedHasManyThrough);
