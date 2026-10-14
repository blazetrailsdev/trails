import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class DlKeyedHasOne extends Base {
  declare destroy_async_parent_id: number;
  declare destroy_async_parent_soft_delete_id: number;
  declare has_one_key: number;

  static {
    this.primaryKey = "has_one_key";
  }
}
registerModel(DlKeyedHasOne);
