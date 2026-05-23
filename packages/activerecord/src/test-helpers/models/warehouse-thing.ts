// vendor/rails/activerecord/test/models/warehouse_thing.rb
import { Base } from "../../base.js";

export class WarehouseThing extends Base {
  static _tableName = "warehouse-things";

  static {
    this.validates("value", { uniqueness: true });
  }
}
