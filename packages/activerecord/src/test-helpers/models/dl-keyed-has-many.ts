import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class DlKeyedHasMany extends Base {
  declare destroy_async_parent_id: number;
  declare many_key: number;

  static {
    this.primaryKey = "many_key";
  }
}
registerModel(DlKeyedHasMany);
