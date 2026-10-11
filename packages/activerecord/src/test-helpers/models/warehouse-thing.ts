import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class WarehouseThing extends Base {
  static _tableName = "warehouse-things";

  static {
    this.validates("value", { uniqueness: true });
  }
}
registerModel(WarehouseThing);
