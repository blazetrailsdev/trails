// vendor/rails/activerecord/test/models/dl_keyed_has_one.rb
import { Base } from "../../base.js";

export class DlKeyedHasOne extends Base {
  declare destroy_async_parent_id: number;
  declare destroy_async_parent_soft_delete_id: number;
  declare has_one_key: number;

  static _primaryKey = "has_one_key";
}
